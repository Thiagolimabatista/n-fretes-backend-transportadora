import { Freight } from '@entities/freight.entity';
import { occupyingRouteCondition } from '@components/freight-route/driver-on-route';
import {
  applyFreightSearchFilters,
  applySearchableBase,
  countListOptions,
  type SearchFacet,
} from './freight-search.filters';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateFreightDto, UpdateFreightDto } from './dto/freight.dto';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ResponseFreightDto } from './dto/response-freight.dto';
import { Company } from '@entities/company.entity';
import { ParamsFreight } from './interface/IFreight';
import { PaginationService } from '@components/pagination/pagination.service';
import { UsersDrive } from '@entities/users-drive.entity';
import { DistanceService } from '@components/distance/distance.service';
import { FreightDocument } from '@entities/freight-documents.entity';
import { AwsService } from '@components/aws/aws.service';
import { ConfigService } from '@nestjs/config';
import { FreightLocal } from 'src/enum/freight';
import { freightExpiry, toDayKey } from 'src/utils/freight-dates';
import { Actor, actorName } from 'src/decorators/get-actor.decorator';
import { SQSService } from '@components/sqs/sqs.service';
import {
  rejectOpenRequests,
  sendDriverMessages,
} from '@components/freight-request/driver-notices';

/**
 * Regras fixas da plataforma: todo frete é nacional e público
 * (não existe mais tipo de envio nem compartilhamento restrito).
 */
const FIXED_FREIGHT_RULES = {
  shippingLocation: FreightLocal.NATIONAL,
  isPublic: true,
} as const;

type FreightDates = {
  dateOrigin?: Date | string | null;
  dateReceiver?: Date | string | null;
};

/**
 * Coleta e entrega não podem ser marcadas no passado, e a entrega não pode
 * vir antes da coleta. Na edição, uma data antiga que não mudou é mantida.
 */
function assertFreightDates(next: FreightDates, current?: FreightDates) {
  const today = toDayKey(new Date());
  const pick = (field: keyof FreightDates) =>
    next[field] !== undefined ? next[field] : current?.[field];
  const changed = (field: keyof FreightDates) =>
    next[field] !== undefined &&
    toDayKey(next[field]) !== toDayKey(current?.[field]);

  const origin = toDayKey(pick('dateOrigin'));
  const receiver = toDayKey(pick('dateReceiver'));

  if (changed('dateOrigin') && origin && origin < today) {
    throw new HttpException(
      'A data da coleta não pode estar no passado.',
      HttpStatus.BAD_REQUEST,
    );
  }
  if (changed('dateReceiver') && receiver && receiver < today) {
    throw new HttpException(
      'A data da entrega não pode estar no passado.',
      HttpStatus.BAD_REQUEST,
    );
  }
  if (origin && receiver && receiver < origin) {
    throw new HttpException(
      'A data da entrega não pode ser anterior à data da coleta.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

/** O que pode mudar com o motorista em viagem (previsões e anotações). */
const EDITABLE_IN_TRIP = new Set([
  'dateOrigin',
  'dateReceiver',
  'observation',
  'tags',
  'isActive',
  'openSolicitations',
]);

/** Valor comparável: listas sem ordem, números como número, datas por dia. */
function comparable(key: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return [...value].map(String).sort().join(',');
  if (key === 'vehicleTypes' || key === 'bodyTypes' || key === 'contactCompanyIds') {
    return String(value).split(',').map((v) => v.trim()).filter(Boolean).sort().join(',');
  }
  if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value)))) {
    return String(Number(value));
  }
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/** Campos travados em viagem que o pedido tenta mudar de verdade. */
function changedLockedFields(update: Record<string, unknown>, current: Record<string, unknown>): string[] {
  return Object.keys(update).filter((key) => {
    if (EDITABLE_IN_TRIP.has(key) || key === 'advance' || key === 'valueAdvance') return false;
    if (update[key] === undefined) return false;
    const currentKey = key === 'contactCompanyIds' ? 'contactCompanyIds' : key;
    return comparable(key, update[key]) !== comparable(key, current[currentKey]);
  });
}

function conflict(message: string, errorCode: string): HttpException {
  return new HttpException({ message, errorCode }, HttpStatus.CONFLICT);
}

/** Colunas que o portal pode ordenar (`sortBy`); o resto cai na data de publicação. */
const SORTABLE_COLUMNS: Record<string, string> = {
  created_at: 'freight.createdAt',
  valor: 'freight.Valuefreight',
  transportadora: 'company.nameFantasy',
};

function applyFreightSort(
  qb: import('typeorm').SelectQueryBuilder<Freight>,
  params: { sortBy?: string; sortOrder?: string },
  allowCompany: boolean,
) {
  let column = SORTABLE_COLUMNS[String(params.sortBy ?? '')] ?? 'freight.createdAt';
  if (!allowCompany && column.startsWith('company.')) column = 'freight.createdAt';
  const order = String(params.sortOrder ?? '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  qb.orderBy(column, order, 'NULLS LAST').addOrderBy('freight.id', 'DESC');
}

/** Frete com motorista: viagem em andamento ou solicitação aceita/entrega informada. */
const ACTIVE_TRIP_SQL = `
  SELECT 1 FROM "freight_routes" r
   WHERE r."freightId" = $1 AND r."status" = 'PROGUESS' AND r."isActive" = true
  UNION ALL
  SELECT 1 FROM "freight_requests" q
   WHERE q."freightId" = $1 AND q."status" IN ('ACCEPTED', 'DRIVER_CONFIRMED_DELIVERY')
  LIMIT 1`;

export class FreightService {
  private readonly logger = new Logger(FreightService.name);

  constructor(
    @InjectRepository(Freight)
    private freightRepository: Repository<Freight>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(UsersDrive)
    private userDriveRepository: Repository<UsersDrive>,
    @InjectRepository(FreightDocument)
    private freightDocumentRepository: Repository<FreightDocument>,
    private readonly paginationService: PaginationService,
    private readonly distanceService: DistanceService,
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
    private readonly sqsService: SQSService,
  ) {}

  private async hasActiveTrip(freightId: string, manager = this.freightRepository.manager) {
    const rows = await manager.query(ACTIVE_TRIP_SQL, [freightId]);
    return rows.length > 0;
  }

  /**
   * Contatos e rota de pedágio precisam existir e, no caso dos contatos, ser da
   * própria empresa (senão um id qualquer seria gravado no frete).
   */
  private async assertFreightReferences(
    companyId: string,
    fields: { contactCompanyId?: string | null; contactCompanyIds?: string[]; routeCacheId?: string | null },
  ) {
    const contactIds = [
      ...new Set([fields.contactCompanyId, ...(fields.contactCompanyIds ?? [])].filter(Boolean)),
    ];
    if (contactIds.length) {
      const [{ total }] = await this.freightRepository.manager.query(
        `SELECT count(*)::int AS total FROM "contact-company" WHERE "id" = ANY($1::varchar[]) AND "companyId" = $2`,
        [contactIds, companyId],
      );
      if (total !== contactIds.length) {
        throw new HttpException('Contato do frete não encontrado na sua equipe.', HttpStatus.BAD_REQUEST);
      }
    }
    if (fields.routeCacheId) {
      const [route] = await this.freightRepository.manager.query(
        `SELECT 1 FROM "route_cache" WHERE "id" = $1`,
        [fields.routeCacheId],
      );
      if (!route) {
        throw new HttpException('Rota de pedágio não encontrada. Calcule o pedágio de novo.', HttpStatus.BAD_REQUEST);
      }
    }
  }

  private normalizeTags(tags: string[] = []): string[] {
    return Array.from(
      new Set(
        tags
          .map((tag) => (tag || '').trim())
          .filter((tag) => tag.length > 0),
      ),
    );
  }

  /****************************************CREATE FREIGHT****************************************** */
  async createFreightCompany(
    createFreightDto: CreateFreightDto,
    userId: string,
    actor?: Actor,
  ): Promise<CreateFreightDto> {
    const { advance, valueAdvance, ...fields } = createFreightDto;
    assertFreightDates(fields);
    await this.assertFreightReferences(userId, fields);

    try {
      const create = this.freightRepository.create({
        ...fields,
        ...FIXED_FREIGHT_RULES,
        valueAdvance: valueAdvance ?? advance ?? 0,
        contactCompanyId:
          fields.contactCompanyId ?? fields.contactCompanyIds?.[0] ?? null,
        companyId: userId,
        tags: this.normalizeTags(fields.tags ?? []),
        expiresAt: freightExpiry(fields.dateOrigin),
        createdByContactId: actor?.contactId ?? null,
        createdByName: actor ? await actorName(this.freightRepository.manager, actor) : null,
      });

      return await this.freightRepository.save(create);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Não foi possível salvar o frete. Revise os dados e tente novamente.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  /****************************************FIND FREIGHT COUNT****************************************** */
  async freightCountCompany(userId: string): Promise<any> {
    try {
      const totalCount = await this.freightRepository.count({
        where: {
          companyId: userId,
          isActive: true,
          openSolicitations: true,
          isExclude: false,
        },
      });

      return {
        count: totalCount,
      };
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao contar os fretes da empresa',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  /****************************************EDIT FREIGHT****************************************** */
  async editFreight(
    update: UpdateFreightDto,
    id: string,
    userId: string,
  ): Promise<UpdateFreightDto> {
    try {
      const freight = await this.freightRepository.findOne({
        where: { id, companyId: userId },
      });

      if (!freight || freight.isExclude) {
        throw new HttpException('Frete não encontrado', HttpStatus.NOT_FOUND);
      }

      // Em viagem só mudam datas previstas, observações e tags (o que o
      // monitoramento ajusta); carga, rota, valor e veículos ficam travados.
      if (await this.hasActiveTrip(freight.id)) {
        const locked = changedLockedFields(
          update as unknown as Record<string, unknown>,
          freight as unknown as Record<string, unknown>,
        );
        if (locked.length) {
          throw conflict(
            'Este frete está em viagem: só dá para mudar as datas previstas e as observações. Acompanhe pelo monitoramento.',
            'FREIGHT_IN_TRIP',
          );
        }
      }

      // Publicar/despublicar tem rotas próprias (ativar e desativar).
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { advance, valueAdvance, isActive, openSolicitations, ...fields } = update;
      const nextAdvance = valueAdvance ?? advance;
      assertFreightDates(fields, freight);
      await this.assertFreightReferences(userId, fields);

      const nextDateOrigin =
        fields.dateOrigin !== undefined ? fields.dateOrigin : freight.dateOrigin;

      await this.freightRepository.update(freight.id, {
        ...fields,
        ...FIXED_FREIGHT_RULES,
        ...(nextAdvance !== undefined ? { valueAdvance: nextAdvance } : {}),
        tags:
          fields.tags !== undefined
            ? this.normalizeTags(fields.tags as string[])
            : freight.tags,
        expiresAt: freightExpiry(nextDateOrigin, freight.createdAt),
      });

      return await this.freightRepository.findOne({ where: { id } });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Não foi possível atualizar o frete. Revise os dados e tente novamente.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /****************************************SUGEST DRIVE****************************************** */
  async getSuggestedDrivers(params: ParamsFreight, companyId: string) {
    const { page = 1, take = 10, id } = params;

    const freight = await this.freightRepository.findOne({
      where: { id, companyId, isExclude: false },
    });

    if (!freight) {
      throw new HttpException('Frete não encontrado', HttpStatus.NOT_FOUND);
    }

    const offset = (page - 1) * take;
    const originLat = Number(freight.originLatitude);
    const originLng = Number(freight.originLongitude);
    const radiusInKm = 50;

    const driversQuery = await this.userDriveRepository
      .createQueryBuilder('users_drive')
      .innerJoinAndSelect('users_drive.locations', 'location')
      .innerJoinAndSelect('users_drive.vehicles', 'vehicles')
      .addSelect(
        `
        6371 * acos(
          cos(radians(:originLat)) * cos(radians(location.latitude)) * 
          cos(radians(location.longitude) - radians(:originLng)) + 
          sin(radians(:originLat)) * sin(radians(location.latitude))
        )
      `,
        'haversine_distance',
      )
      // Fora de rota = sem rota que o ocupe de fato (`isOnRoute` fica desatualizado).
      .where(
        `NOT EXISTS (
          SELECT 1
            FROM freight_routes active_route
           WHERE active_route."userDriveId" = users_drive.id
             AND ${occupyingRouteCondition('active_route')}
        )`,
      )
      .andWhere(
        `
        6371 * acos(
          cos(radians(:originLat)) * cos(radians(location.latitude)) * 
          cos(radians(location.longitude) - radians(:originLng)) + 
          sin(radians(:originLat)) * sin(radians(location.latitude))
        ) <= :radiusInKm
      `,
      )
      .setParameters({
        originLat,
        originLng,
        radiusInKm: radiusInKm * 1.5,
      })
      .orderBy('haversine_distance', 'ASC')
      .limit(take * 3)
      .getMany();

    const driversWithRoadDistance =
      await this.distanceService.findNearbyDriversWithRoadDistance(
        originLat,
        originLng,
        driversQuery,
        radiusInKm,
      );

    const total = driversWithRoadDistance.length;
    const paginatedDrivers = driversWithRoadDistance.slice(
      offset,
      offset + take,
    );

    return {
      data: paginatedDrivers,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / take),
    };
  }
  /****************************************GET CONTACT ID****************************************** */
  async getContactId(id: string): Promise<ResponseFreightDto> {
    try {
      const freight = await this.freightRepository.findOne({
        where: { id },
      });

      if (!freight) {
        throw new HttpException(
          'Não foi localizado esse frete',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (
        freight.originLatitude &&
        freight.originLongitude &&
        freight.destinyLatitude &&
        freight.destinyLongitude
      ) {
        try {
          const distanceData = await this.distanceService.calculateRoadDistance(
            Number(freight.originLatitude),
            Number(freight.originLongitude),
            Number(freight.destinyLatitude),
            Number(freight.destinyLongitude),
          );

          return {
            ...freight,
            roadDistance: distanceData.distance,
            estimatedDuration: distanceData.duration,
            distanceStatus: distanceData.status,
          } as any;
        } catch (error) {
          console.error('Erro ao calcular distância do frete:', error);
          return freight;
        }
      }

      return freight;
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao buscar o localizado espéfico',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /****************************************ALL FREIGHT USERID****************************************** */

  async getFreightsAll(params: ParamsFreight, userId: string): Promise<any> {
    try {
      const queryBuilder = this.freightRepository.createQueryBuilder('freight');

      const { take, page } =
        this.paginationService.getDefaultPaginationParams(params);

      const { companyId } = params;

      queryBuilder.where('freight.isExclude = false');
      // Frete de outra empresa só aparece enquanto está publicado e aberto.
      queryBuilder.andWhere(
        '(freight.companyId = :viewerId OR (freight.isActive = true AND freight.openSolicitations = true))',
        { viewerId: userId },
      );

      if (companyId) {
        queryBuilder.andWhere('freight.companyId = :companyId', { companyId });
      }

      if (params.id) {
        queryBuilder.andWhere('freight.id = :id', { id: params.id });
      }

      applyFreightSearchFilters(queryBuilder, params);

      const likeFilters = {
        typeOfLoad: `freight.typeOfLoad = :typeOfLoad`,
        specieOfLoad: `freight.specieOfLoad = :specieOfLoad`,
        product: `unaccent(LOWER(freight.product)) ILIKE unaccent(LOWER(:product))`,
      };

      const exactFilters = {
        isActive: `freight.isActive = :isActive`,
        openSolicitations: `freight.openSolicitations = :openSolicitations`,
        isExclude: `freight.isExclude = :isExclude`,
      };

      const dateFilters = {
        dateOrigin: `freight.dateOrigin = :dateOrigin`,
        dateReceiver: `freight.dateReceiver = :dateReceiver`,
        createdAt: `freight.createdAt = :createdAt`,
      };

      Object.entries(likeFilters).forEach(([key, condition]) => {
        if (
          params[key] !== undefined &&
          params[key] !== null &&
          params[key] !== ''
        ) {
          if (Array.isArray(params[key])) {
            queryBuilder.andWhere(`freight.${key} IN (:...${key})`, {
              [key]: params[key],
            });
          } else {
            queryBuilder.andWhere(
              `unaccent(LOWER(freight.${key})) ILIKE unaccent(LOWER(:${key}))`,
              { [key]: `%${params[key]}%` },
            );
          }
        }
      });

      Object.entries(exactFilters).forEach(([key, condition]) => {
        if (params[key] !== undefined && params[key] !== null) {
          queryBuilder.andWhere(condition, { [key]: params[key] });
        }
      });

      Object.entries(dateFilters).forEach(([key, condition]) => {
        if (
          params[key] !== undefined &&
          params[key] !== null &&
          params[key] !== ''
        ) {
          queryBuilder.andWhere(condition, { [key]: params[key] });
        }
      });

      queryBuilder
        .leftJoin('freight.contactCompany', 'contactCompany')
        .addSelect([
          'contactCompany.id',
          'contactCompany.name',
          'contactCompany.phoneNumber',
          'contactCompany.email',
        ])
        .leftJoin(
          'freight.freightRequest',
          'freightRequest',
          'freightRequest.status = :status',
          { status: 'PENDING' },
        )
        .addSelect(['freightRequest.id', 'freightRequest.status'])
        .leftJoin('freight.company', 'company')
        .addSelect([
          'company.id',
          'company.name',
          'company.nameFantasy',
          'company.photoUrl',
          'company.phoneNumber',
          'company.createdAt',
          'company.city',
        ])
        .leftJoinAndSelect('freight.routeCache', 'routeCache');
      applyFreightSort(queryBuilder, params, true);

      const [result, total] = await queryBuilder
        .skip((page - 1) * take)
        .take(take)
        .getManyAndCount();

      let companyStats: Record<string, any> | null = null;
      let route: Record<string, any> | null = null;

      if (params.id && result.length > 0) {
        const ownerCompanyId = result[0].companyId;

        // routeCache já veio populado pelo leftJoinAndSelect acima
        if (result[0].routeCacheId) {
          route = result[0].routeCache ?? null;
        }

        const [activeAndOpen, activeTotal] = await Promise.all([
          this.freightRepository.count({
            where: {
              companyId: ownerCompanyId,
              isActive: true,
              openSolicitations: true,
              isExclude: false,
            },
          }),
          this.freightRepository.count({
            where: {
              companyId: ownerCompanyId,
              isActive: true,
              isExclude: false,
            },
          }),
        ]);

        companyStats = {
          companyId: ownerCompanyId,
          activeAndOpenFreights: activeAndOpen,
          activeFreights: activeTotal,
        };
      }

      const regions = {
        origin: {
          norte: new Set<string>(),
          nordeste: new Set<string>(),
          centroOeste: new Set<string>(),
          sudeste: new Set<string>(),
          sul: new Set<string>(),
        },
        destiny: {
          norte: new Set<string>(),
          nordeste: new Set<string>(),
          centroOeste: new Set<string>(),
          sudeste: new Set<string>(),
          sul: new Set<string>(),
        },
      };

      result.forEach((freight) => {
        this.classifyCity(
          freight.originState,
          `${freight.originCity}`,
          regions.origin,
        );
        this.classifyCity(
          freight.destinyState,
          `${freight.destinyCity}`,
          regions.destiny,
        );
      });

      const formatRegions = (data: Record<string, Set<string>>) => {
        return Object.entries(data)
          .filter(([_, cities]) => cities.size > 0)
          .reduce((acc, [region, cities]) => {
            acc[region] = Array.from(cities);
            return acc;
          }, {});
      };

      return {
        data: result,
        count: total,
        origin: formatRegions(regions.origin),
        destiny: formatRegions(regions.destiny),
        ...(companyStats && { companyStats }),
        ...(route && { route }),
      };
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao buscar fretes',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getFreightsByTransporter(params: ParamsFreight): Promise<any> {
    try {
      const queryBuilder = this.freightRepository.createQueryBuilder('freight');

      // Excluir fretes marcados como excluídos
      queryBuilder.where('freight.isExclude = false');

      const { take, page } =
        this.paginationService.getDefaultPaginationParams(params);

      const filters = {
        originCity: `(unaccent(LOWER(freight.originCity)) ILIKE unaccent(LOWER(:originCity)))`,
        destinyCity: `(unaccent(LOWER(freight.destinyCity)) ILIKE unaccent(LOWER(:destinyCity)))`,
        isActive: `freight.isActive = :isActive`,
        dateOrigin: `freight.dateOrigin = :dateOrigin`,
        dateReceiver: `freight.dateReceiver = :dateReceiver`,
        typeOfLoad: `freight.typeOfLoad = :typeOfLoad`,
        specieOfLoad: `freight.specieOfLoad = :specieOfLoad`,
        vehicleTypes: `freight.vehicleTypes = :vehicleTypes`,
        bodyTypes: `freight.bodyTypes = :bodyTypes`,
        openSolicitations: `freight.openSolicitations = :openSolicitations`,
        createdAt: `freight.createdAt = :createdAt`,
      };

      Object.entries(filters).forEach(([key, condition]) => {
        if (params[key] !== undefined && params[key] !== null) {
          queryBuilder.andWhere(condition, { [key]: `%${params[key]}%` });
        }
      });

      const [result, total] = await queryBuilder
        .leftJoinAndSelect('freight.company', 'company')
        .addOrderBy('freight.createdAt', 'DESC')
        .skip((page - 1) * take)
        .take(take)
        .getManyAndCount();

      return {
        data: result,
        count: total,
      };
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao buscar fretes',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private ensureArray(value: any): any[] {
    if (typeof value === 'string') {
      // Decodifica caracteres URL e divide por vírgula se necessário
      const decodedValue = decodeURIComponent(value);
      if (decodedValue.includes(',')) {
        return decodedValue
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item !== '');
      }
      try {
        return JSON.parse(value);
      } catch (error) {
        return [value];
      }
    }
    return Array.isArray(value) ? value : [value];
  }
  /****************************************GET FREIGHT USERID****************************************** */

  async getFreightsByUserId(
    params: ParamsFreight,
    userId: string,
  ): Promise<any> {
    try {
      const queryBuilder = this.freightRepository.createQueryBuilder('freight');
      const companyId = userId;
      const { take, page } =
        this.paginationService.getDefaultPaginationParams(params);

      const likeFilters = {
        typeOfLoad: `freight.typeOfLoad = :typeOfLoad`,
        specieOfLoad: `freight.specieOfLoad = :specieOfLoad`,
        product: `unaccent(LOWER(freight.product)) ILIKE unaccent(LOWER(:product))`,
      };

      const exactFilters = {
        isActive: `freight.isActive = :isActive`,
        openSolicitations: `freight.openSolicitations = :openSolicitations`,
        isExclude: `freight.isExclude = :isExclude`,
      };

      const dateFilters = {
        dateOrigin: `freight.dateOrigin = :dateOrigin`,
        dateReceiver: `freight.dateReceiver = :dateReceiver`,
        createdAt: `freight.createdAt = :createdAt`,
      };

      queryBuilder.where('freight.companyId = :companyId', { companyId });

      // Excluir fretes marcados como excluídos
      queryBuilder.andWhere('freight.isExclude = false');

      applyFreightSearchFilters(queryBuilder, params, { searchCompany: false });

      Object.entries(likeFilters).forEach(([key, condition]) => {
        if (
          params[key] !== undefined &&
          params[key] !== null &&
          params[key] !== ''
        ) {
          if (Array.isArray(params[key])) {
            queryBuilder.andWhere(`freight.${key} IN (:...${key})`, {
              [key]: params[key],
            });
          } else {
            queryBuilder.andWhere(
              `unaccent(LOWER(freight.${key})) ILIKE unaccent(LOWER(:${key}))`,
              { [key]: `%${params[key]}%` },
            );
          }
        }
      });

      Object.entries(exactFilters).forEach(([key, condition]) => {
        if (params[key] !== undefined && params[key] !== null) {
          queryBuilder.andWhere(condition, { [key]: params[key] });
        }
      });

      Object.entries(dateFilters).forEach(([key, condition]) => {
        if (
          params[key] !== undefined &&
          params[key] !== null &&
          params[key] !== ''
        ) {
          queryBuilder.andWhere(condition, { [key]: params[key] });
        }
      });

      applyFreightSort(queryBuilder, params, false);
      const [result, total] = await queryBuilder
        .leftJoinAndSelect('freight.contactCompany', 'contactCompany')
        .leftJoin(
          'freight.freightRequest',
          'freightRequest',
          'freightRequest.status = :status',
          { status: 'PENDING' },
        )
        .addSelect(['freightRequest.id', 'freightRequest.status'])
        .skip((page - 1) * take)
        .take(take)
        .getManyAndCount();

      const inactiveFreightsCount = await this.freightRepository
        .createQueryBuilder('freight')
        .where('freight.companyId = :companyId', { companyId })
        .andWhere('freight.isActive = :isActive', { isActive: false })
        .andWhere('freight.openSolicitations = :openSolicitations', {
          openSolicitations: false,
        })
        .andWhere('freight.isExclude = false')
        .getCount();

      return {
        data: result,
        count: total,
        freightDesactive: inactiveFreightsCount,
      };
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao buscar fretes',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /****************************************SOFT DELETE FREIGHT****************************************** */
  /** Desativa o frete (sai das buscas dos motoristas, continua em "Inativo"). */
  async softDeleteFreight(id: string, companyId: string, actor?: Actor): Promise<string> {
    await this.findOwnedFreight(id, companyId);
    const messages = await this.freightRepository.manager.transaction(async (manager) => {
      await manager.getRepository(Freight).update(
        { id, companyId },
        { isActive: false, openSolicitations: false },
      );
      const byName = actor ? await actorName(manager, actor) : undefined;
      return rejectOpenRequests(manager, { freightIds: [id] }, 'freight_closed', new Date(), byName);
    });
    await sendDriverMessages(this.sqsService, this.logger, messages);
    return messages.length
      ? `Frete desativado. ${messages.length === 1 ? 'O motorista que tinha pedido foi avisado' : `Os ${messages.length} motoristas que tinham pedido foram avisados`}.`
      : 'Frete desativado com sucesso';
  }

  /****************************************EXCLUDE FREIGHT****************************************** */
  /**
   * Exclui o frete. Se ele nunca teve viagem, é apagado de verdade (com
   * solicitações, visualizações e documentos). Se teve, sai de todas as
   * listas mas continua no banco, para o histórico e os relatórios. Com
   * viagem em andamento não pode ser excluído. Quem tinha solicitação aberta
   * é avisado.
   */
  async excludeFreight(id: string, userId: string, actor?: Actor): Promise<string> {
    await this.findOwnedFreight(id, userId);
    const bucket = this.configService.get<string>('AWS_S3_BUCKET_NAME');

    const outcome = await this.freightRepository.manager.transaction(async (manager) => {
      const [locked] = await manager.query(
        `SELECT "id" FROM "freight" WHERE "id" = $1 AND "companyId" = $2 AND "isExclude" = false FOR UPDATE`,
        [id, userId],
      );
      if (!locked) {
        throw new HttpException('Frete não encontrado', HttpStatus.NOT_FOUND);
      }
      if (await this.hasActiveTrip(id, manager)) {
        throw conflict(
          'Este frete está em viagem e não pode ser excluído. Conclua ou cancele a viagem no monitoramento.',
          'FREIGHT_IN_TRIP',
        );
      }

      const byName = actor ? await actorName(manager, actor) : undefined;
      const messages = await rejectOpenRequests(manager, { freightIds: [id] }, 'freight_deleted', new Date(), byName);
      const [{ trips }] = await manager.query(
        `SELECT count(*)::int AS trips FROM "freight_routes" WHERE "freightId" = $1`,
        [id],
      );

      if (trips > 0) {
        await manager.getRepository(Freight).update(
          { id, companyId: userId },
          { isExclude: true, isExcludeUserId: userId, isActive: false, openSolicitations: false },
        );
        return { deleted: false, messages, fileKeys: [] as string[] };
      }

      const docs: Array<{ fileKey: string }> = await manager.query(
        `DELETE FROM "freight-documents" WHERE "freightId" = $1 RETURNING "fileKey"`,
        [id],
      ).then(([rows]) => rows ?? []);
      await manager.query(`DELETE FROM "freight" WHERE "id" = $1 AND "companyId" = $2`, [id, userId]);
      return { deleted: true, messages, fileKeys: docs.map((d) => d.fileKey) };
    });

    await sendDriverMessages(this.sqsService, this.logger, outcome.messages);
    if (outcome.fileKeys.length) {
      await this.awsService
        .deleteObjects(bucket, outcome.fileKeys)
        .catch((error) => this.logger.warn(`Documentos do frete ${id} não apagados do S3: ${error?.message}`));
    }
    return outcome.deleted
      ? 'Frete apagado.'
      : 'Frete excluído. Ele saiu das listas, mas as viagens feitas continuam no histórico.';
  }

  /** Frete da empresa logada que ainda não foi excluído (404 caso contrário). */
  private async findOwnedFreight(
    id: string,
    companyId: string,
  ): Promise<Freight> {
    const freight = await this.freightRepository.findOne({
      where: { id, companyId, isExclude: false },
    });
    if (!freight) {
      throw new HttpException('Frete não encontrado', HttpStatus.NOT_FOUND);
    }
    return freight;
  }

  /**
   * Histórico do frete para o card do kanban: publicação, solicitações,
   * aceite/recusa/expiração, viagem, entrega e anexos, cada um com quem fez.
   * Montado a partir dos registros (datas e nomes gravados em cada ação).
   */
  async getFreightHistory(id: string, companyId: string) {
    const freight = await this.freightRepository.findOne({
      where: { id, companyId },
      select: ['id', 'createdAt', 'createdByName', 'isActive', 'isExclude', 'sourceFreightId'],
    });
    if (!freight) {
      throw new HttpException('Frete não encontrado', HttpStatus.NOT_FOUND);
    }
    const db = this.freightRepository.manager;
    const [requests, routes, documents] = await Promise.all([
      db.query(
        `SELECT q."id", q."status", q."createdAt", q."respondedAt", q."respondedByName",
                q."deliveryInformedAt", d."name" AS "driverName"
           FROM "freight_requests" q
           LEFT JOIN "users_drive" d ON d."id" = q."userDriveId"
          WHERE q."freightId" = $1`,
        [id],
      ),
      db.query(
        `SELECT r."id", r."status", r."startedAt", r."completedAt", r."completedByName", d."name" AS "driverName",
                (SELECT min(p."timestamp") FROM "freight_route_locations" p WHERE p."routeId" = r."id") AS "firstPointAt"
           FROM "freight_routes" r
           LEFT JOIN "users_drive" d ON d."id" = r."userDriveId"
          WHERE r."freightId" = $1`,
        [id],
      ),
      db.query(
        `SELECT "fileName", "createdAt" FROM "freight-documents" WHERE "freightId" = $1 AND "isActive" = true`,
        [id],
      ),
    ]);

    type Entry = { type: string; label: string; at: string; by: string | null; detail?: string | null };
    const events: Entry[] = [];
    const add = (type: string, label: string, at: unknown, by: string | null, detail?: string | null) => {
      const date = at ? new Date(at as string) : null;
      if (date && !isNaN(date.getTime())) events.push({ type, label, at: date.toISOString(), by, detail });
    };

    add(
      'PUBLISHED',
      freight.sourceFreightId ? 'Frete publicado (cópia de outro frete)' : 'Frete publicado',
      freight.createdAt,
      freight.createdByName ?? null,
    );
    for (const q of requests) {
      add('REQUESTED', 'Motorista pediu o frete', q.createdAt, q.driverName ?? 'Motorista');
      if (q.respondedAt) {
        if (['ACCEPTED', 'DRIVER_CONFIRMED_DELIVERY', 'DELIVERY_COMPLETED', 'NOT_CONFIRMED_DELIVERY'].includes(q.status)) {
          add('ACCEPTED', 'Motorista aceito', q.respondedAt, q.respondedByName ?? null, q.driverName);
        } else if (q.status === 'REJECTED') {
          const system = q.respondedByName === 'Sistema';
          add(
            system ? 'EXPIRED' : 'REJECTED',
            system ? 'Solicitação expirou sem resposta' : 'Solicitação recusada',
            q.respondedAt,
            q.respondedByName ?? null,
            q.driverName,
          );
        }
      }
      if (q.deliveryInformedAt) {
        add('DELIVERY_INFORMED', 'Motorista informou a entrega', q.deliveryInformedAt, q.driverName ?? 'Motorista');
      }
    }
    for (const r of routes) {
      add('ROUTE_STARTED', 'Viagem iniciada', r.firstPointAt ?? r.startedAt, r.driverName ?? 'Motorista');
      if (r.status === 'COMPLETED') {
        add('DELIVERED', 'Entrega confirmada', r.completedAt, r.completedByName ?? null, r.driverName);
      } else if (r.status === 'CANCEL') {
        add('ROUTE_CANCELED', 'Viagem cancelada', r.completedAt, r.completedByName ?? r.driverName ?? null, r.driverName);
      }
    }
    for (const doc of documents) {
      add('DOCUMENT', 'Anexo adicionado', doc.createdAt, null, doc.fileName);
    }

    events.sort((a, b) => a.at.localeCompare(b.at));
    return { freightId: id, events };
  }

  /** Publica de novo: só sem motorista em viagem e com a coleta de hoje em diante. */
  async activateFreight(id: string, companyId: string): Promise<string> {
    const freight = await this.findOwnedFreight(id, companyId);
    if (await this.hasActiveTrip(id)) {
      throw conflict('Este frete está em viagem e não pode ser publicado de novo.', 'FREIGHT_IN_TRIP');
    }
    const pickupDay = toDayKey(freight.dateOrigin);
    if (pickupDay && pickupDay < toDayKey(new Date())) {
      throw conflict(
        'A data de coleta já passou. Edite o frete com a nova data para publicar de novo.',
        'FREIGHT_PICKUP_PAST',
      );
    }
    await this.freightRepository.update(
      { id, companyId },
      { isActive: true, openSolicitations: true, expiresAt: freightExpiry(freight.dateOrigin) },
    );
    return 'Frete ativado com sucesso';
  }

  /**
   * Duplica um frete da empresa (ativo ou não): mesma carga, rota, veículos e
   * valores; datas só são mantidas se a coleta ainda não passou. O novo frete
   * já sai publicado e guarda a origem em `sourceFreightId`.
   */
  async duplicateFreight(id: string, companyId: string, actor?: Actor): Promise<Freight> {
    const source = await this.findOwnedFreight(id, companyId);
    const today = toDayKey(new Date());
    const keepDates = !source.dateOrigin || toDayKey(source.dateOrigin) >= today;
    const {
      /* eslint-disable @typescript-eslint/no-unused-vars */
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      isExcludeUserId: _excludedBy,
      createdByContactId: _createdBy,
      createdByName: _createdByName,
      /* eslint-enable @typescript-eslint/no-unused-vars */
      ...fields
    } = source;
    const dateOrigin = keepDates ? source.dateOrigin : null;
    const dateReceiver =
      keepDates && (!source.dateReceiver || toDayKey(source.dateReceiver) >= today)
        ? source.dateReceiver
        : null;

    const copy = this.freightRepository.create({
      ...fields,
      ...FIXED_FREIGHT_RULES,
      dateOrigin,
      dateReceiver,
      companyId,
      isActive: true,
      openSolicitations: true,
      isExclude: false,
      isFeatured: false,
      sourceFreightId: source.id,
      tags: this.normalizeTags(source.tags ?? []),
      expiresAt: freightExpiry(dateOrigin),
      createdByContactId: actor?.contactId ?? null,
      createdByName: actor ? await actorName(this.freightRepository.manager, actor) : null,
    });
    return this.freightRepository.save(copy);
  }

  /****************************************FILTERS REGIONS****************************************** */
  async getAllFreightsRegionsMapping(): Promise<any> {
    try {
      // Query otimizada - busca apenas os campos necessários de TODOS os fretes ativos
      const freights = await this.freightRepository
        .createQueryBuilder('freight')
        .select([
          'freight.originCity',
          'freight.originState',
          'freight.destinyCity',
          'freight.destinyState',
        ])
        .where('freight.isExclude = false')
        .andWhere('freight.openSolicitations = true')
        .andWhere('freight.isActive = true')
        .getMany();

      const regions = {
        origin: {
          norte: new Set<string>(),
          nordeste: new Set<string>(),
          centroOeste: new Set<string>(),
          sudeste: new Set<string>(),
          sul: new Set<string>(),
        },
        destiny: {
          norte: new Set<string>(),
          nordeste: new Set<string>(),
          centroOeste: new Set<string>(),
          sudeste: new Set<string>(),
          sul: new Set<string>(),
        },
      };

      // Mapear TODOS os fretes
      freights.forEach((freight) => {
        this.classifyCity(
          freight.originState,
          `${freight.originCity}`,
          regions.origin,
        );
        this.classifyCity(
          freight.destinyState,
          `${freight.destinyCity}`,
          regions.destiny,
        );
      });

      const formatRegions = (data: Record<string, Set<string>>) => {
        return Object.entries(data)
          .filter(([_, cities]) => cities.size > 0)
          .reduce((acc, [region, cities]) => {
            acc[region] = Array.from(cities);
            return acc;
          }, {});
      };

      return {
        origin: formatRegions(regions.origin),
        destiny: formatRegions(regions.destiny),
        totalFreights: freights.length,
      };
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao mapear regiões de todos os fretes',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getAllFreightsRegionsMappingByCompany(userId: string): Promise<any> {
    try {
      // Query otimizada - busca apenas os campos necessários de TODOS os fretes ativos da empresa
      const freights = await this.freightRepository
        .createQueryBuilder('freight')
        .select([
          'freight.originCity',
          'freight.originState',
          'freight.destinyCity',
          'freight.destinyState',
        ])
        .where('freight.companyId = :companyId', { companyId: userId })
        .andWhere('freight.isExclude = false')
        .andWhere('freight.openSolicitations = true')
        .andWhere('freight.isActive = true')
        .getMany();

      const regions = {
        origin: {
          norte: new Set<string>(),
          nordeste: new Set<string>(),
          centroOeste: new Set<string>(),
          sudeste: new Set<string>(),
          sul: new Set<string>(),
        },
        destiny: {
          norte: new Set<string>(),
          nordeste: new Set<string>(),
          centroOeste: new Set<string>(),
          sudeste: new Set<string>(),
          sul: new Set<string>(),
        },
      };

      // Mapear TODOS os fretes da empresa
      freights.forEach((freight) => {
        this.classifyCity(
          freight.originState,
          `${freight.originCity}`,
          regions.origin,
        );
        this.classifyCity(
          freight.destinyState,
          `${freight.destinyCity}`,
          regions.destiny,
        );
      });

      const formatRegions = (data: Record<string, Set<string>>) => {
        return Object.entries(data)
          .filter(([_, cities]) => cities.size > 0)
          .reduce((acc, [region, cities]) => {
            acc[region] = Array.from(cities);
            return acc;
          }, {});
      };

      return {
        origin: formatRegions(regions.origin),
        destiny: formatRegions(regions.destiny),
        totalFreights: freights.length,
      };
    } catch (error) {
      throw new HttpException(
        error?.message ||
          'Erro ao mapear regiões de todos os fretes da empresa',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Opções dos filtros de busca com a quantidade de fretes de cada uma.
   * Cada grupo é contado aplicando os OUTROS filtros ativos (busca por
   * faceta): escolher a origem São Paulo mostra só os destinos que saem de
   * São Paulo, e nenhuma opção leva a uma lista vazia.
   * `scope=mine` conta só os fretes da própria empresa (Meus Fretes).
   */
  async getSearchOptions(
    params: ParamsFreight & { scope?: string },
    userId: string,
  ): Promise<{
    origins: Array<{ city: string; state: string; count: number }>;
    destinies: Array<{ city: string; state: string; count: number }>;
    vehicleTypes: Array<{ value: string; count: number }>;
    bodyTypes: Array<{ value: string; count: number }>;
  }> {
    const mine = params.scope === 'mine';

    const baseQuery = (except: SearchFacet) => {
      const qb = this.freightRepository.createQueryBuilder('freight');
      if (mine) {
        qb.where('freight."companyId" = :companyId', { companyId: userId })
          .andWhere('freight."isExclude" = false');
        const isActive = String(params.isActive ?? '');
        if (isActive === 'true' || isActive === 'false') {
          qb.andWhere('freight."isActive" = :isActive', {
            isActive: isActive === 'true',
          });
        }
      } else {
        applySearchableBase(qb);
        if (params.search?.trim()) qb.leftJoin('freight.company', 'company');
      }
      applyFreightSearchFilters(qb, params, {
        except,
        searchCompany: !mine,
      });
      return qb;
    };

    const places = async (kind: 'origin' | 'destiny') => {
      const rows = await baseQuery(kind)
        .select(`min(freight."${kind}CityName")`, 'city')
        .addSelect(`freight."${kind}State"`, 'state')
        .addSelect('COUNT(*)', 'count')
        .andWhere(`freight."${kind}CityName" IS NOT NULL`)
        .andWhere(`freight."${kind}State" IS NOT NULL`)
        .groupBy(`freight."${kind}State"`)
        .addGroupBy(`lower(freight."${kind}CityName")`)
        .getRawMany<{ city: string; state: string; count: string }>();
      return rows
        .map((row) => ({
          city: row.city,
          state: row.state.toUpperCase(),
          count: Number(row.count),
        }))
        .sort(
          (a, b) =>
            b.count - a.count || a.city.localeCompare(b.city, 'pt-BR'),
        );
    };

    const lists = async (kind: 'vehicle' | 'body') => {
      const column = kind === 'vehicle' ? 'vehicleTypes' : 'bodyTypes';
      const rows = await baseQuery(kind)
        .select(`freight."${column}"`, 'list')
        .addSelect('COUNT(*)', 'count')
        .groupBy(`freight."${column}"`)
        .getRawMany<{ list: string | null; count: string }>();
      return countListOptions(rows, kind);
    };

    try {
      const [origins, destinies, vehicleTypes, bodyTypes] = await Promise.all([
        places('origin'),
        places('destiny'),
        lists('vehicle'),
        lists('body'),
      ]);
      return { origins, destinies, vehicleTypes, bodyTypes };
    } catch (error) {
      this.logger.error(`Falha ao montar opções de busca: ${error?.message}`);
      throw new HttpException(
        'Não foi possível carregar os filtros agora. Tente novamente.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async classifyRegionByState(userId: string): Promise<any> {
    try {
      const freights = await this.freightRepository.find({
        where: { companyId: userId, openSolicitations: true, isExclude: false },
      });

      const regions = {
        origin: {
          norte: new Set<string>(),
          nordeste: new Set<string>(),
          centroOeste: new Set<string>(),
          sudeste: new Set<string>(),
          sul: new Set<string>(),
        },
        destiny: {
          norte: new Set<string>(),
          nordeste: new Set<string>(),
          centroOeste: new Set<string>(),
          sudeste: new Set<string>(),
          sul: new Set<string>(),
        },
      };

      freights.forEach((freight) => {
        this.classifyCity(
          freight.originState,
          `${freight.originCity}`,
          regions.origin,
        );
        this.classifyCity(
          freight.destinyState,
          `${freight.destinyCity}`,
          regions.destiny,
        );
      });

      const formatRegions = (data: Record<string, Set<string>>) => {
        return Object.entries(data)
          .filter(([_, cities]) => cities.size > 0)
          .reduce((acc, [region, cities]) => {
            acc[region] = Array.from(cities);
            return acc;
          }, {});
      };

      return {
        origin: formatRegions(regions.origin),
        destiny: formatRegions(regions.destiny),
      };
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao classificar as regiões',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private classifyCity(state: string, city: string, regions: any): void {
    const region = this.getRegionByState(state);
    if (region) {
      regions[region].add(city);
    }
  }

  private getRegionByState(state: string): string | null {
    const regionMapping = {
      norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
      nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
      centroOeste: ['DF', 'GO', 'MS', 'MT'],
      sudeste: ['ES', 'MG', 'RJ', 'SP'],
      sul: ['PR', 'RS', 'SC'],
    };

    for (const [region, states] of Object.entries(regionMapping)) {
      if (states.includes(state)) {
        return region;
      }
    }
    return null;
  }
  /****************************************FILTERS REGIONS****************************************** */
  /** Frete da própria empresa, ou de outra enquanto estiver publicado e aberto. */
  async getFreightById(id: string, companyId: string): Promise<Freight> {
    try {
      const freight = await this.freightRepository.findOne({
        where: [
          { id, companyId, isExclude: false },
          { id, isExclude: false, isActive: true, openSolicitations: true },
        ],
      });

      if (!freight) {
        throw new HttpException('Frete não encontrado', HttpStatus.NOT_FOUND);
      }

      return freight;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Erro ao buscar o frete', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async uploadFreightDocument(
    companyId: string,
    freightId: string,
    file: Express.Multer.File,
    description?: string,
    tags?: string[],
  ): Promise<FreightDocument> {
    try {
      const freight = await this.freightRepository.findOne({
        where: { id: freightId, companyId },
      });

      if (!freight) {
        throw new HttpException('Frete não encontrado', HttpStatus.NOT_FOUND);
      }

      const bucket = this.configService.get<string>('AWS_S3_BUCKET_NAME');
      const ext = file.originalname.split('.').pop();
      const fileKey = `freight-documents/${companyId}/${freightId}/${Date.now()}.${ext}`;

      const fileUrl = await this.awsService.uploadDocument(
        bucket,
        fileKey,
        file.buffer,
        file.mimetype,
      );

      const normalizedTags = this.normalizeTags(tags ?? []);

      const doc = this.freightDocumentRepository.create({
        companyId,
        freightId,
        fileName: file.originalname,
        fileKey,
        fileUrl,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        description: description ?? null,
        tags: normalizedTags,
        isActive: true,
      });

      const savedDoc = await this.freightDocumentRepository.save(doc);

      return savedDoc;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        error?.message || 'Erro ao fazer upload do documento do frete',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async listFreightDocuments(
    companyId: string,
    freightId: string,
  ): Promise<FreightDocument[]> {
    try {
      return this.freightDocumentRepository.find({
        where: { companyId, freightId, isActive: true },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao listar documentos do frete',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteFreightDocument(
    companyId: string,
    documentId: string,
  ): Promise<{ message: string }> {
    try {
      const doc = await this.freightDocumentRepository.findOne({
        where: { id: documentId, companyId, isActive: true },
      });

      if (!doc) {
        throw new HttpException('Documento não encontrado', HttpStatus.NOT_FOUND);
      }

      doc.isActive = false;
      await this.freightDocumentRepository.save(doc);

      // O link do arquivo é público: removido no portal, sai do S3 também.
      const bucket = this.configService.get<string>('AWS_S3_BUCKET_NAME');
      await this.awsService
        .deleteObjects(bucket, [doc.fileKey])
        .catch((error) => this.logger.warn(`Arquivo ${doc.fileKey} não apagado do S3: ${error?.message}`));

      return { message: 'Documento removido com sucesso' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        error?.message || 'Erro ao remover documento do frete',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async addFreightTags(
    companyId: string,
    freightId: string,
    tags: string[],
  ): Promise<{ tags: string[] }> {
    try {
      const freight = await this.freightRepository.findOne({
        where: { id: freightId, companyId },
      });

      if (!freight) {
        throw new HttpException('Frete não encontrado', HttpStatus.NOT_FOUND);
      }

      const currentTags = this.normalizeTags(freight.tags ?? []);
      const newTags = this.normalizeTags(tags);
      const mergedTags = this.normalizeTags([...currentTags, ...newTags]);

      freight.tags = mergedTags;
      await this.freightRepository.save(freight);

      return { tags: mergedTags };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        error?.message || 'Erro ao adicionar tags no frete',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async removeFreightTag(
    companyId: string,
    freightId: string,
    tag: string,
  ): Promise<{ tags: string[] }> {
    try {
      const freight = await this.freightRepository.findOne({
        where: { id: freightId, companyId },
      });

      if (!freight) {
        throw new HttpException('Frete não encontrado', HttpStatus.NOT_FOUND);
      }

      const currentTags = this.normalizeTags(freight.tags ?? []);
      const targetTag = (tag || '').trim();
      const updatedTags = currentTags.filter((item) => item !== targetTag);

      freight.tags = updatedTags;
      await this.freightRepository.save(freight);

      return { tags: updatedTags };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        error?.message || 'Erro ao remover tag do frete',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
