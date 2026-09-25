import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompanyUsersContacts } from '@entities/company-users-contacts.entity';
import { ContactCompany } from '@entities/contact-company.entity';
import { Freight } from '@entities/freight.entity';
import { ContactGroup } from '@entities/contact-group.entity';
import { DriverDocument } from '@entities/driver-documents.entity';
import { AwsService } from '@components/aws/aws.service';
import { CompanyUsersContactsDto } from './dto/users-contact.dto';
import { ParamsUsersContactCompany } from './interfaces/IUsersContanctCompany';

/** Grupo em que o motorista entra quando a empresa não escolhe nenhum. */
const DEFAULT_GROUP_NAME = 'Todos os motoristas';
/** Dígitos mínimos no termo para buscar também por CPF e telefone. */
const SEARCH_MIN_DIGITS = 3;
/** Teto da página: o monitoramento carrega a rede inteira (até 1000) para escolher motorista. */
const MAX_PAGE_SIZE = 1000;
const MAX_TRIPS_PAGE_SIZE = 50;

/** Última posição conhecida do motorista (índice users_location userId+createdAt). */
const LAST_CITY_JOIN = `LEFT JOIN LATERAL (
    SELECT city FROM users_location
     WHERE "userId" = ud.id
     ORDER BY "createdAt" DESC
     LIMIT 1
  ) loc ON true`;

function pageParams(page: unknown, limit: unknown, fallback = 10, max = MAX_PAGE_SIZE) {
  const p = Math.floor(Number(page));
  const l = Math.floor(Number(limit));
  return {
    page: Number.isFinite(p) && p >= 1 ? p : 1,
    limit: Number.isFinite(l) && l >= 1 ? Math.min(l, max) : fallback,
  };
}

@Injectable()
export class UsersContactCompanyService {
  constructor(
    @InjectRepository(CompanyUsersContacts)
    private usersContactCompanyRepository: Repository<CompanyUsersContacts>,
    @InjectRepository(ContactCompany)
    private contactCompanyRepository: Repository<ContactCompany>,
    @InjectRepository(Freight)
    private freightRepository: Repository<Freight>,
    @InjectRepository(DriverDocument)
    private driverDocumentRepository: Repository<DriverDocument>,
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
  ) {}

  private get db() {
    return this.usersContactCompanyRepository.manager;
  }

  /**
   * Adiciona (ou reativa) o motorista na rede da empresa do token e o coloca
   * nos grupos escolhidos, ou no grupo padrão se nenhum for escolhido.
   */
  async createUsersContactCompany(companyId: string, dto: CompanyUsersContactsDto) {
    const [driver] = await this.db.query(`SELECT id FROM users_drive WHERE id = $1`, [
      dto.userId,
    ]);
    if (!driver) throw new NotFoundException('Motorista não encontrado.');

    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(CompanyUsersContacts);
      let contact = await repo.findOne({ where: { userId: dto.userId, companyId } });
      if (!contact) {
        contact = await repo.save(repo.create({ companyId, userId: dto.userId, isActive: true }));
      } else if (!contact.isActive) {
        contact.isActive = true;
        contact = await repo.save(contact);
      }

      const requested = [...new Set(dto.groupIds ?? [])];
      let groupIds: string[];
      if (requested.length) {
        const groups = await manager.getRepository(ContactGroup).find({
          where: { id: In(requested), companyId, isActive: true },
          select: { id: true },
        });
        if (groups.length !== requested.length) {
          throw new BadRequestException(
            'Alguns grupos não foram encontrados ou não pertencem a esta empresa.',
          );
        }
        groupIds = groups.map((g) => g.id);
      } else {
        groupIds = [await this.defaultGroupId(manager, companyId)];
      }

      await manager.query(
        `INSERT INTO "contact-group-members" ("groupId", "contactId")
         SELECT unnest($1::varchar[]), $2
         ON CONFLICT DO NOTHING`,
        [groupIds, contact.id],
      );
      return contact;
    });
  }

  private async defaultGroupId(manager: EntityManager, companyId: string) {
    const repo = manager.getRepository(ContactGroup);
    const existing = await repo.findOne({
      where: { companyId, name: DEFAULT_GROUP_NAME, isActive: true },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await repo.save(repo.create({ companyId, name: DEFAULT_GROUP_NAME, isActive: true }));
    return created.id;
  }

  /**
   * Lista da rede da empresa, paginada no banco. `q` busca por nome, cidade
   * e, quando tem dígitos, por CPF e telefone (com ou sem pontuação).
   */
  async getContactParamsUsers(companyId: string, params: ParamsUsersContactCompany) {
    const { page, limit } = pageParams(params.page, params.limit ?? params.take);
    const term = String(params.q ?? params.name ?? '').trim();
    const digits = term.replace(/\D/g, '');
    const groupIds = [
      ...String(params.groupIds ?? '').split(','),
      String(params.groupId ?? ''),
    ].filter(Boolean);

    const where = [`c."companyId" = $1`, `c."isActive" = true`];
    const values: unknown[] = [companyId];
    if (term) {
      values.push(`%${term}%`);
      const t = `$${values.length}`;
      const alternatives = [
        `unaccent(lower(ud.name)) LIKE unaccent(lower(${t}))`,
        `unaccent(lower(coalesce(loc.city, ud.city, ''))) LIKE unaccent(lower(${t}))`,
      ];
      if (digits.length >= SEARCH_MIN_DIGITS) {
        values.push(`%${digits}%`);
        const d = `$${values.length}`;
        alternatives.push(
          `regexp_replace(coalesce(ud.cpf, ''), '\\D', '', 'g') LIKE ${d}`,
          `regexp_replace(coalesce(ud."phoneNumber", ''), '\\D', '', 'g') LIKE ${d}`,
        );
      }
      where.push(`(${alternatives.join(' OR ')})`);
    }
    if (groupIds.length) {
      values.push(groupIds);
      where.push(`EXISTS (
        SELECT 1 FROM "contact-group-members" m
        JOIN "contact-group" g ON g.id = m."groupId" AND g."isActive" = true
        WHERE m."contactId" = c.id AND m."groupId" = ANY($${values.length}::varchar[])
      )`);
    }
    const from = `
      FROM "company-users-contacts" c
      JOIN users_drive ud ON ud.id = c."userId"
      ${LAST_CITY_JOIN}
      WHERE ${where.join(' AND ')}`;

    const [idRows, [count]] = await Promise.all([
      this.db.query(
        `SELECT c.id ${from}
         ORDER BY unaccent(lower(ud.name)), c.id
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, (page - 1) * limit],
      ),
      this.db.query(`SELECT count(*) AS total ${from}`, values),
    ]);
    const total = Number(count?.total ?? 0);
    const ids: string[] = idRows.map((r: { id: string }) => r.id);

    const data = ids.length ? await this.contactDetails(companyId, ids) : [];
    return { data, count: total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Dados da página: motorista, veículos, última posição, grupos e viagens com a empresa. */
  private async contactDetails(companyId: string, ids: string[]) {
    const contacts = await this.usersContactCompanyRepository.find({
      where: { id: In(ids) },
      relations: { users: { vehicles: true } },
      select: {
        id: true,
        companyId: true,
        userId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        users: {
          id: true,
          name: true,
          cpf: true,
          cnh: true,
          antt: true,
          similiary: true,
          photoFaceURL: true,
          phoneNumber: true,
          zipcode: true,
          city: true,
          isOnRoute: true,
          createdAt: true,
          vehicles: {
            id: true,
            vehicleType: true,
            bodyType: true,
            plateNumber: true,
            plateState: true,
            isPlateValid: true,
            isRenavamValid: true,
            tracker: true,
            locator: true,
            isMainVehicle: true,
          },
        },
      },
    });
    const userIds = contacts.map((c) => c.userId).filter(Boolean);

    const [locations, groups, trips] = await Promise.all([
      // Última posição conhecida: a mais recente entre a do app
      // (users_location) e o rastreamento das viagens do motorista. Os pontos
      // de rota são achados pelas rotas dele (pontos antigos não têm
      // userDriveId): último ponto de cada rota pelo índice (routeId, timestamp).
      this.db.query(
        `SELECT u.id AS "userId", best.city, best.latitude, best.longitude, best.at
           FROM unnest($1::varchar[]) AS u(id)
           CROSS JOIN LATERAL (
             SELECT * FROM (
               (SELECT NULLIF(city, '') AS city, latitude, longitude, "createdAt" AS at
                  FROM users_location
                 WHERE "userId" = u.id
                 ORDER BY "createdAt" DESC
                 LIMIT 1)
               UNION ALL
               (SELECT pt.city, pt.latitude, pt.longitude, pt.at
                  FROM freight_routes r
                  CROSS JOIN LATERAL (
                    SELECT NULLIF(city, '') AS city, latitude, longitude, "timestamp" AS at
                      FROM freight_route_locations
                     WHERE "routeId" = r.id
                     ORDER BY "timestamp" DESC
                     LIMIT 1
                  ) pt
                 WHERE r."userDriveId" = u.id
                 ORDER BY pt.at DESC
                 LIMIT 1)
             ) two
             ORDER BY at DESC
             LIMIT 1
           ) best`,
        [userIds],
      ),
      this.db.query(
        `SELECT m."contactId" AS contact_id, g.id, g.name
           FROM "contact-group-members" m
           JOIN "contact-group" g ON g.id = m."groupId" AND g."isActive" = true
          WHERE m."contactId" = ANY($1::varchar[])
          ORDER BY g.name`,
        [ids],
      ),
      this.db.query(
        `SELECT "userDriveId" AS user_id, count(*) AS total
           FROM freight_routes
          WHERE "companyId" = $1
            AND "userDriveId" = ANY($2::varchar[])
            AND status <> 'CANCEL'
          GROUP BY "userDriveId"`,
        [companyId, userIds],
      ),
    ]);

    const locationBy = new Map(locations.map((l: any) => [l.userId, l]));
    const tripsBy = new Map(trips.map((t: any) => [t.user_id, Number(t.total)]));
    const groupsBy = new Map<string, { id: string; name: string }[]>();
    for (const g of groups) {
      const list = groupsBy.get(g.contact_id) ?? [];
      list.push({ id: g.id, name: g.name });
      groupsBy.set(g.contact_id, list);
    }
    const order = new Map(ids.map((id, i) => [id, i]));

    return contacts
      .sort((a, b) => order.get(a.id) - order.get(b.id))
      .map((contact) => {
        const location: any = locationBy.get(contact.userId);
        const contactGroups = groupsBy.get(contact.id) ?? [];
        return {
          ...contact,
          users: contact.users && {
            ...contact.users,
            locations: location
              ? [
                  {
                    city: location.city,
                    latitude: location.latitude,
                    longitude: location.longitude,
                    recordedAt: location.at,
                  },
                ]
              : [],
          },
          groups: contactGroups.map((g) => g.name),
          groupIds: contactGroups.map((g) => g.id),
          tripCount: tripsBy.get(contact.userId) ?? 0,
        };
      });
  }

  async softDeleteUsersContactCompany(companyId: string, id: string): Promise<string> {
    const result = await this.usersContactCompanyRepository.update(
      { id, companyId, isActive: true },
      { isActive: false },
    );
    if (!result.affected) {
      throw new NotFoundException('Motorista não encontrado na sua rede.');
    }
    return 'Motorista removido da sua rede.';
  }

  /**
   * Motorista pelo CPF (com ou sem pontuação), para adicionar à rede. Devolve
   * só o necessário para identificá-lo: sem e-mail e sem telefone.
   */
  async searchUsersByCpf(cpf: string, companyId: string) {
    const digits = String(cpf ?? '').replace(/\D/g, '');
    if (digits.length !== 11) {
      throw new BadRequestException('Informe um CPF com 11 dígitos.');
    }

    const [driver] = await this.db.query(
      `SELECT ud.id, ud.name, ud."photoFaceURL", coalesce(loc.city, ud.city) AS city,
              EXISTS (
                SELECT 1 FROM "company-users-contacts" c
                 WHERE c."companyId" = $2 AND c."userId" = ud.id AND c."isActive" = true
              ) AS already
         FROM users_drive ud
         ${LAST_CITY_JOIN}
        WHERE regexp_replace(ud.cpf, '\\D', '', 'g') = $1
        LIMIT 1`,
      [digits, companyId],
    );
    if (!driver) {
      throw new NotFoundException(
        'Motorista não encontrado. Confira o CPF: ele precisa ter cadastro no app NFretes.',
      );
    }

    const vehicles = await this.db.query(
      `SELECT "vehicleType", "bodyType"
         FROM vehicles
        WHERE "userId" = $1
        ORDER BY "isMainVehicle" DESC, "createdAt" DESC
        LIMIT 3`,
      [driver.id],
    );

    return {
      id: driver.id,
      name: driver.name,
      photoFaceURL: driver.photoFaceURL ?? null,
      city: driver.city ?? null,
      vehicles,
      alreadyInNetwork: driver.already === true,
    };
  }

  /** Viagens do motorista com esta empresa, das mais recentes para as antigas. */
  async listDriverTripsWithCompany(
    companyId: string,
    driverId: string,
    pageRaw?: number,
    limitRaw?: number,
  ) {
    const { page, limit } = pageParams(pageRaw, limitRaw, 5, MAX_TRIPS_PAGE_SIZE);

    const [rows, [summary]] = await Promise.all([
      this.db.query(
        `SELECT r.id, r.status, r."startedAt", r."completedAt",
                f.id AS "freightId", f."originCity", f."originState",
                f."destinyCity", f."destinyState", f."Valuefreight" AS value,
                f."dateOrigin", f."dateReceiver"
           FROM freight_routes r
           JOIN freight f ON f.id = r."freightId"
          WHERE r."companyId" = $1 AND r."userDriveId" = $2
          ORDER BY r."startedAt" DESC
          LIMIT $3 OFFSET $4`,
        [companyId, driverId, limit, (page - 1) * limit],
      ),
      this.db.query(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE status = 'COMPLETED') AS completed,
                count(*) FILTER (WHERE status = 'PROGUESS')  AS in_progress,
                count(*) FILTER (WHERE status = 'CANCEL')    AS canceled,
                max("startedAt") AS last_trip_at
           FROM freight_routes
          WHERE "companyId" = $1 AND "userDriveId" = $2`,
        [companyId, driverId],
      ),
    ]);

    const total = Number(summary?.total ?? 0);
    return {
      summary: {
        total,
        completed: Number(summary?.completed ?? 0),
        inProgress: Number(summary?.in_progress ?? 0),
        canceled: Number(summary?.canceled ?? 0),
        lastTripAt: summary?.last_trip_at ?? null,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
      },
      data: rows.map((r: any) => ({
        routeId: r.id,
        freightId: r.freightId,
        status: r.status,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        origin: `${r.originCity}/${r.originState}`,
        destination: `${r.destinyCity}/${r.destinyState}`,
        value: r.value !== null && r.value !== undefined ? Number(r.value) : null,
        dateOrigin: r.dateOrigin,
        dateReceiver: r.dateReceiver,
      })),
    };
  }

  async getContactCompanyInfo(contactId: string) {
    try {
      const contactCompany = await this.contactCompanyRepository.findOne({
        where: { id: contactId },
        relations: ['company'],
        select: {
          id: true,
          name: true,
          password: true,
          phoneNumber: true,
          company: {
            id: true,
            name: true,
            nameFantasy: true,
            photoUrl: true,
          },
        },
      });

      if (!contactCompany) {
        throw new HttpException(
          'Contato da empresa não encontrado',
          HttpStatus.NOT_FOUND,
        );
      }

      const hasPassword = !!contactCompany.password;

      if (hasPassword) {
        return { register: true };
      }

      const freights = await this.freightRepository.find({
        where: { companyId: contactCompany.company.id },
        order: { createdAt: 'DESC' },
        take: 15,
        select: {
          id: true,
          originCity: true,
          destinyCity: true,
          originState: true,
          destinyState: true,
          Valuefreight: true,
          createdAt: true,
          isActive: true,
          openSolicitations: true,
        },
      });

      return {
        register: false,
        contactName: contactCompany.name,
        companyName:
          contactCompany.company.name || contactCompany.company.nameFantasy,
        phoneNumber: contactCompany.phoneNumber,
        photoUrl: contactCompany.company.photoUrl,
        freights: freights,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error?.message || 'Erro ao buscar informações do contato da empresa',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ───────────────────────── DOCUMENTOS DO MOTORISTA ─────────────────────────

  async uploadDriverDocument(
    companyId: string,
    driverId: string,
    file: Express.Multer.File,
    description?: string,
  ): Promise<DriverDocument> {
    try {
      const contact = await this.usersContactCompanyRepository.findOne({
        where: { companyId, userId: driverId, isActive: true },
      });
      if (!contact) {
        throw new HttpException(
          'Motorista não encontrado na empresa',
          HttpStatus.NOT_FOUND,
        );
      }

      const bucket = this.configService.get<string>('AWS_S3_BUCKET_NAME');
      const ext = file.originalname.split('.').pop();
      const fileKey = `driver-documents/${companyId}/${driverId}/${Date.now()}.${ext}`;

      const fileUrl = await this.awsService.uploadDocument(
        bucket,
        fileKey,
        file.buffer,
        file.mimetype,
      );

      const doc = this.driverDocumentRepository.create({
        companyId,
        userId: driverId,
        fileName: file.originalname,
        fileKey,
        fileUrl,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        description: description ?? null,
        isActive: true,
      });

      return this.driverDocumentRepository.save(doc);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error?.message || 'Erro ao fazer upload do documento',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async listDriverDocuments(
    companyId: string,
    driverId: string,
  ): Promise<DriverDocument[]> {
    try {
      return this.driverDocumentRepository.find({
        where: { companyId, userId: driverId, isActive: true },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao listar documentos',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteDriverDocument(
    companyId: string,
    documentId: string,
  ): Promise<{ message: string }> {
    try {
      const doc = await this.driverDocumentRepository.findOne({
        where: { id: documentId, companyId, isActive: true },
      });
      if (!doc) {
        throw new HttpException('Documento não encontrado', HttpStatus.NOT_FOUND);
      }

      doc.isActive = false;
      await this.driverDocumentRepository.save(doc);

      return { message: 'Documento removido com sucesso' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error?.message || 'Erro ao remover documento',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
