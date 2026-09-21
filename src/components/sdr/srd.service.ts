import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Company } from '@entities/company.entity';
import { ContactCompany } from '@entities/contact-company.entity';
import { Freight } from '@entities/freight.entity';
import { FreightRequest } from '@entities/freight-requests.entity';
import { UsersDrive } from '@entities/users-drive.entity';
import { Vehicle } from '@entities/vehicles.entity';
import { UsersLocation } from '@entities/users-location.entity';
import {
  SdrCompanyListResponseDto,
  SdrCompanyDto,
  SdrContactDto,
} from './dto/sdr-company-list.dto';
import {
  SdrPostHistoryResponseDto,
  SdrFreightPostDto,
  SdrFreightRouteDto,
} from './dto/sdr-post-history.dto';
import {
  SdrMatchPerformanceResponseDto,
  SdrFreightMatchDto,
  SdrRequesterInfoDto,
} from './dto/sdr-match-performance.dto';
import {
  SdrDriverRetentionRiskResponseDto,
  SdrDriverRiskDto,
  SdrDriverVehicleDto,
} from './dto/sdr-driver-retention.dto';
import {
  SdrMarketHeatmapResponseDto,
  SdrRouteHeatmapDto,
} from './dto/sdr-market-heatmap.dto';
import {
  SdrDriverActivityListResponseDto,
  SdrDriverActivityDto,
  SdrDriverContactDto,
  SdrDriverVehicleSummaryDto,
} from './dto/sdr-driver-activity.dto';
import {
  SdrFirstFreightAnalysisResponseDto,
  SdrCompanyFirstFreightDto,
} from './dto/sdr-first-freight-analysis.dto';
import {
  SdrPostingFrequencyResponseDto,
  SdrCompanyPostingFrequencyDto,
  PostingPeriod,
} from './dto/sdr-posting-frequency.dto';

@Injectable()
export class SdrService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(ContactCompany)
    private readonly contactCompanyRepository: Repository<ContactCompany>,
    @InjectRepository(Freight)
    private readonly freightRepository: Repository<Freight>,
    @InjectRepository(FreightRequest)
    private readonly freightRequestRepository: Repository<FreightRequest>,
    @InjectRepository(UsersDrive)
    private readonly usersDriveRepository: Repository<UsersDrive>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
    @InjectRepository(UsersLocation)
    private readonly usersLocationRepository: Repository<UsersLocation>,
  ) {}

  async listCompanies(
    page: number = 1,
    limit: number = 10,
    startDate?: string,
    endDate?: string,
  ): Promise<SdrCompanyListResponseDto> {
    const skip = (page - 1) * limit;

    const dateFilter = this.buildDateFilter(startDate, endDate);
    const whereCondition: any = dateFilter ? { createdAt: dateFilter } : {};

    const [companies, total] = await this.companyRepository.findAndCount({
      where: whereCondition,
      skip,
      take: limit,
      order: {
        createdAt: 'DESC',
      },
    });

    const data = await Promise.all(
      companies.map(async (company) => {
        const contacts = await this.contactCompanyRepository.find({
          where: { companyId: company.id, isActive: true },
          select: ['id', 'name', 'phoneNumber', 'isActive'],
        });

        return this.mapCompanyToDto(company, contacts);
      }),
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  private mapCompanyToDto(
    company: Company,
    contacts: ContactCompany[],
  ): SdrCompanyDto {
    const contactsDto: SdrContactDto[] = contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      isActive: contact.isActive,
    }));

    return {
      id: company.id,
      name: company.name,
      nameFantasy: company.nameFantasy,
      cnpj: company.cnpj,
      phoneNumber: company.phoneNumber,
      contacts: contactsDto,
      createdAt: company.createdAt,
      isActive: company.isActive,
      isCompleted: company.isCompleted,
    };
  }

  async getCompanyPostHistory(
    companyId: string,
    page: number = 1,
    limit: number = 10,
    startDate?: string,
    endDate?: string,
  ): Promise<SdrPostHistoryResponseDto> {
    const skip = (page - 1) * limit;

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: ['id', 'name', 'nameFantasy'],
    });

    if (!company) {
      throw new Error('Empresa não encontrada');
    }

    const dateFilter = this.buildDateFilter(startDate, endDate);
    const whereCondition: any = { companyId };
    if (dateFilter) whereCondition.createdAt = dateFilter;

    const [freights, total] = await this.freightRepository.findAndCount({
      where: whereCondition,
      skip,
      take: limit,
      order: {
        createdAt: 'DESC',
      },
    });

    const data = freights.map((freight) => this.mapFreightToDto(freight));

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      companyId: company.id,
      companyName: company.name,
      companyFantasyName: company.nameFantasy,
    };
  }

  private mapFreightToDto(freight: Freight): SdrFreightPostDto {
    const route: SdrFreightRouteDto = {
      originCity: freight.originCity || null,
      originState: freight.originState || null,
      destinyCity: freight.destinyCity || null,
      destinyState: freight.destinyState || null,
      distance: freight.distance || null,
    };

    return {
      id: freight.id,
      route,
      vehicleTypes: freight.vehicleTypes || null,
      bodyTypes: freight.bodyTypes || null,
      dateOrigin: freight.dateOrigin || null,
      dateReceiver: freight.dateReceiver || null,
      typeOfLoad: freight.typeOfLoad || null,
      specieOfLoad: freight.specieOfLoad || null,
      product: freight.product || null,
      weightOfLoad: freight.weightOfLoad || null,
      valueFreight: freight.Valuefreight || null,
      createdAt: freight.createdAt,
      updatedAt: freight.updatedAt,
      isActive: freight.isActive,
      openSolicitations: freight.openSolicitations,
    };
  }

  async getMatchPerformance(
    companyId: string | undefined,
    page: number = 1,
    limit: number = 10,
    startDate?: string,
    endDate?: string,
  ): Promise<SdrMatchPerformanceResponseDto> {
    const skip = (page - 1) * limit;

    const queryBuilder = this.freightRequestRepository
      .createQueryBuilder('freightRequest')
      .leftJoinAndSelect('freightRequest.freight', 'freight')
      .leftJoinAndSelect('freightRequest.company', 'company')
      .leftJoinAndSelect('freightRequest.userDrive', 'userDrive')
      .where('freightRequest.status = :status', { status: 'PENDING' });

    if (companyId) {
      queryBuilder.andWhere('freight.companyId = :companyId', { companyId });
    }

    if (startDate) {
      queryBuilder.andWhere('freightRequest.createdAt >= :startDate', {
        startDate: new Date(startDate),
      });
    }
    if (endDate) {
      queryBuilder.andWhere('freightRequest.createdAt <= :endDate', {
        endDate: new Date(endDate + 'T23:59:59.999Z'),
      });
    }

    queryBuilder
      .orderBy('freightRequest.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [requests, total] = await queryBuilder.getManyAndCount();

    const data = requests.map((request) =>
      this.mapFreightRequestToMatchDto(request),
    );

    const totalPages = Math.ceil(total / limit);

    const averageResponseTimeHours = this.calculateAverageResponseTime(data);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      averageResponseTimeHours,
    };
  }

  private mapFreightRequestToMatchDto(
    request: FreightRequest,
  ): SdrFreightMatchDto {
    const now = new Date();
    const requestDate = new Date(request.createdAt);
    const diffMs = now.getTime() - requestDate.getTime();
    const hoursWithoutResponse = Math.floor(diffMs / (1000 * 60 * 60));
    const daysWithoutResponse = Math.floor(hoursWithoutResponse / 24);

    const requester: SdrRequesterInfoDto = {
      id: request.userDrive?.id || '',
      name: request.userDrive?.name || null,
      cpf: request.userDrive?.cpf || null,
      phoneNumber: request.userDrive?.phoneNumber || null,
      email: request.userDrive?.email || null,
    };

    return {
      requestId: request.id,
      freightId: request.freight?.id || '',
      companyId: request.company?.id || '',
      companyName: request.company?.name || null,
      companyFantasyName: request.company?.nameFantasy || null,
      originCity: request.freight?.originCity || null,
      originState: request.freight?.originState || null,
      destinyCity: request.freight?.destinyCity || null,
      destinyState: request.freight?.destinyState || null,
      requestDate: request.createdAt,
      hoursWithoutResponse,
      daysWithoutResponse,
      requestStatus: request.status,
      requester,
      freightValue: request.freight?.Valuefreight || null,
      product: request.freight?.product || null,
      freightCreatedAt: request.freight?.createdAt || requestDate,
    };
  }

  private calculateAverageResponseTime(data: SdrFreightMatchDto[]): number {
    if (data.length === 0) return 0;

    const totalHours = data.reduce(
      (sum, item) => sum + item.hoursWithoutResponse,
      0,
    );

    return Math.round((totalHours / data.length) * 10) / 10;
  }

  async getDriverRetentionRisk(
    minDaysSinceSignup: number = 7,
    neverRequested: boolean = false,
    page: number = 1,
    limit: number = 10,
    startDate?: string,
    endDate?: string,
  ): Promise<SdrDriverRetentionRiskResponseDto> {
    const skip = (page - 1) * limit;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - minDaysSinceSignup);

    // Primeiro, obter estatísticas de requests por motorista
    const requestStats = await this.freightRequestRepository
      .createQueryBuilder('fr')
      .select('fr."userDriveId"', 'userDriveId')
      .addSelect('COUNT(*)', 'totalRequests')
      .addSelect('MAX(fr."createdAt")', 'lastRequestDate')
      .groupBy('fr."userDriveId"')
      .getRawMany();

    // Criar um mapa de estatísticas por motorista
    const statsByDriver: Record<
      string,
      { totalRequests: number; lastRequestDate: Date | null }
    > = {};
    requestStats.forEach((stat) => {
      statsByDriver[stat.userDriveId] = {
        totalRequests: parseInt(stat.totalRequests) || 0,
        lastRequestDate: stat.lastRequestDate
          ? new Date(stat.lastRequestDate)
          : null,
      };
    });


    let queryBuilder = this.usersDriveRepository
      .createQueryBuilder('driver')
      .where('driver."createdAt" <= :cutoffDate', { cutoffDate })
      .orderBy('driver."createdAt"', 'ASC');

    if (startDate) {
      queryBuilder.andWhere('driver."createdAt" >= :startDate', {
        startDate: new Date(startDate),
      });
    }
    if (endDate) {
      queryBuilder.andWhere('driver."createdAt" <= :endDate', {
        endDate: new Date(endDate + 'T23:59:59.999Z'),
      });
    }

    const drivers = await queryBuilder.getMany();

    let filteredDrivers = drivers;
    if (neverRequested) {
      filteredDrivers = drivers.filter(
        (driver) => !statsByDriver[driver.id] || statsByDriver[driver.id].totalRequests === 0,
      );
    }

    const total = filteredDrivers.length;
    const paginatedDrivers = filteredDrivers.slice(skip, skip + limit);
    const driverIds = paginatedDrivers.map((d) => d.id);

    const vehicles =
      driverIds.length > 0
        ? await this.vehicleRepository
            .createQueryBuilder('vehicle')
            .where('vehicle."userId" IN (:...driverIds)', { driverIds })
            .orderBy('vehicle."isMainVehicle"', 'DESC')
            .addOrderBy('vehicle."createdAt"', 'DESC')
            .getMany()
        : [];

    const vehiclesByDriver = vehicles.reduce(
      (acc, vehicle) => {
        if (!acc[vehicle.userId]) {
          acc[vehicle.userId] = [];
        }
        acc[vehicle.userId].push(vehicle);
        return acc;
      },
      {} as Record<string, Vehicle[]>,
    );

    const data = paginatedDrivers.map((driver) => {
      const stats = statsByDriver[driver.id] || {
        totalRequests: 0,
        lastRequestDate: null,
      };
      const driverVehicles = vehiclesByDriver[driver.id] || [];

      const lastRequest = stats.lastRequestDate
        ? ({ createdAt: stats.lastRequestDate } as FreightRequest)
        : null;

      return this.mapDriverToRiskDto(
        driver,
        driverVehicles,
        stats.totalRequests,
        lastRequest,
      );
    });

   
    const statistics = this.calculateDriverStatistics(data);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      highRiskCount: statistics.highRisk,
      mediumRiskCount: statistics.mediumRisk,
      lowRiskCount: statistics.lowRisk,
      neverRequestedCount: statistics.neverRequested,
      averageDaysSinceSignup: statistics.averageDaysSinceSignup,
    };
  }

  private mapDriverToRiskDto(
    driver: UsersDrive,
    vehicles: Vehicle[],
    totalRequests: number,
    lastRequest: FreightRequest | null,
  ): SdrDriverRiskDto {
    const now = new Date();
    const signupDate = new Date(driver.createdAt);
    const diffMs = now.getTime() - signupDate.getTime();
    const daysSinceSignup = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const vehiclesDto: SdrDriverVehicleDto[] = vehicles.map((vehicle) => ({
      id: vehicle.id,
      vehicleType: vehicle.vehicleType || null,
      bodyType: vehicle.bodyType || null,
      plateNumber: vehicle.plateNumber || null,
      plateState: vehicle.plateState || null,
      isMainVehicle: vehicle.isMainVehicle,
    }));

    const neverRequested = totalRequests === 0;
    const riskLevel = this.calculateRiskLevel(
      daysSinceSignup,
      neverRequested,
      lastRequest,
    );

    return {
      id: driver.id,
      name: driver.name || null,
      cpf: driver.cpf || null,
      phoneNumber: driver.phoneNumber || null,
      email: driver.email || null,
      signupDate: driver.createdAt,
      daysSinceSignup,
      vehicles: vehiclesDto,
      totalRequests,
      neverRequested,
      lastActivityDate: lastRequest ? lastRequest.createdAt : null,
      riskLevel,
    };
  }

  private calculateRiskLevel(
    daysSinceSignup: number,
    neverRequested: boolean,
    lastRequest: FreightRequest | null,
  ): string {
    if (neverRequested && daysSinceSignup > 30) {
      return 'ALTO';
    }

    if (neverRequested && daysSinceSignup > 15) {
      return 'MÉDIO';
    }

    if (lastRequest) {
      const now = new Date();
      const lastActivityDate = new Date(lastRequest.createdAt);
      const daysSinceActivity = Math.floor(
        (now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysSinceActivity > 30) {
        return 'ALTO';
      }

      if (daysSinceActivity > 15) {
        return 'MÉDIO';
      }
    }

    return 'BAIXO';
  }

  private calculateDriverStatistics(drivers: SdrDriverRiskDto[]): {
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    neverRequested: number;
    averageDaysSinceSignup: number;
  } {
    const highRisk = drivers.filter((d) => d.riskLevel === 'ALTO').length;
    const mediumRisk = drivers.filter((d) => d.riskLevel === 'MÉDIO').length;
    const lowRisk = drivers.filter((d) => d.riskLevel === 'BAIXO').length;
    const neverRequested = drivers.filter((d) => d.neverRequested).length;

    const totalDays = drivers.reduce((sum, d) => sum + d.daysSinceSignup, 0);
    const averageDaysSinceSignup =
      drivers.length > 0 ? Math.round(totalDays / drivers.length) : 0;

    return {
      highRisk,
      mediumRisk,
      lowRisk,
      neverRequested,
      averageDaysSinceSignup,
    };
  }

 
  async getMarketHeatmap(
    page: number = 1,
    limit: number = 50,
    startDate?: string,
    endDate?: string,
  ): Promise<SdrMarketHeatmapResponseDto> {
    const skip = (page - 1) * limit;

    const dateFilter = this.buildDateFilter(startDate, endDate);
    const whereCondition: any = { isActive: true };
    if (dateFilter) whereCondition.createdAt = dateFilter;

    // Buscar fretes com suas rotas e company (ordenados por data de criação)
    const [freights, total] = await this.freightRepository.findAndCount({
      relations: ['company'],
      where: whereCondition,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Coletar todas as cidades únicas para fazer consultas em batch
    const cities = new Set<string>();
    freights.forEach((freight) => {
      if (freight.originCity) cities.add(freight.originCity);
      if (freight.destinyCity) cities.add(freight.destinyCity);
    });

    // Buscar contagem de motoristas por cidade em uma única query
    const driverCountByCity: Record<string, number> = {};
    if (cities.size > 0) {
      const cityArray = Array.from(cities);
      const driverCounts = await this.usersLocationRepository
        .createQueryBuilder('location')
        .select('location.city', 'city')
        .addSelect('COUNT(DISTINCT location."userId")', 'count')
        .where('location.city IN (:...cities)', { cities: cityArray })
        .groupBy('location.city')
        .getRawMany();

      driverCounts.forEach((row) => {
        driverCountByCity[row.city] = parseInt(row.count) || 0;
      });
    }

    // Mapear os dados usando as contagens já carregadas
    const data: SdrRouteHeatmapDto[] = freights.map((freight) => {
      const driversNearOrigin = driverCountByCity[freight.originCity] || 0;
      const driversNearDestiny = driverCountByCity[freight.destinyCity] || 0;
      const totalDriversInRoute = driversNearOrigin + driversNearDestiny;

      let opportunityLevel: 'ALTO' | 'MÉDIO' | 'BAIXO';
      if (totalDriversInRoute > 15) {
        opportunityLevel = 'ALTO';
      } else if (totalDriversInRoute >= 5) {
        opportunityLevel = 'MÉDIO';
      } else {
        opportunityLevel = 'BAIXO';
      }

      return {
        freightId: freight.id,
        originCity: freight.originCity,
        originState: freight.originState,
        destinyCity: freight.destinyCity,
        destinyState: freight.destinyState,
        driversNearOrigin,
        driversNearDestiny,
        totalDriversInRoute,
        opportunityLevel,
        companyName: freight.company?.name || null,
        companyFantasyName: freight.company?.nameFantasy || null,
        freightValue: freight.Valuefreight || null,
        product: freight.product || null,
        freightCreatedAt: freight.createdAt,
      };
    });

    // Ordenar por total de motoristas (maior para menor)
    data.sort((a, b) => b.totalDriversInRoute - a.totalDriversInRoute);

    // Calcular estatísticas
    const totalPages = Math.ceil(total / limit);
    const highOpportunityRoutes = data.filter(
      (r) => r.opportunityLevel === 'ALTO',
    ).length;
    const mediumOpportunityRoutes = data.filter(
      (r) => r.opportunityLevel === 'MÉDIO',
    ).length;
    const lowOpportunityRoutes = data.filter(
      (r) => r.opportunityLevel === 'BAIXO',
    ).length;

    const totalDriversCounted = data.reduce(
      (sum, r) => sum + r.totalDriversInRoute,
      0,
    );
    const averageDriversPerRoute =
      data.length > 0 ? Math.round(totalDriversCounted / data.length) : 0;

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      averageDriversPerRoute,
    };
  }

  async getDriverActivityList(
    page: number = 1,
    limit: number = 50,
    startDate?: string,
    endDate?: string,
  ): Promise<SdrDriverActivityListResponseDto> {
    const skip = (page - 1) * limit;

    const dateFilter = this.buildDateFilter(startDate, endDate);
    const whereCondition: any = dateFilter ? { createdAt: dateFilter } : {};

    const [drivers, total] = await this.usersDriveRepository.findAndCount({
      where: whereCondition,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Coletar IDs dos motoristas
    const driverIds = drivers.map((d) => d.id);

    // Buscar dados relacionados em batch
    const [firstRequests, totalRequestsData, vehicles, lastLocations] =
      await Promise.all([
        // Primeira requisição de cada motorista
        driverIds.length > 0
          ? this.freightRequestRepository
              .createQueryBuilder('fr')
              .select('fr."userDriveId"', 'userDriveId')
              .addSelect('MIN(fr."createdAt")', 'firstRequestDate')
              .where('fr."userDriveId" IN (:...driverIds)', { driverIds })
              .groupBy('fr."userDriveId"')
              .getRawMany()
          : [],
        // Total de requests por motorista
        driverIds.length > 0
          ? this.freightRequestRepository
              .createQueryBuilder('fr')
              .select('fr."userDriveId"', 'userDriveId')
              .addSelect('COUNT(*)', 'total')
              .where('fr."userDriveId" IN (:...driverIds)', { driverIds })
              .groupBy('fr."userDriveId"')
              .getRawMany()
          : [],
        // Primeiro veículo de cada motorista
        driverIds.length > 0
          ? this.vehicleRepository
              .createQueryBuilder('vehicle')
              .where('vehicle."userId" IN (:...driverIds)', { driverIds })
              .orderBy('vehicle."createdAt"', 'ASC')
              .getMany()
          : [],
        // Última localização de cada motorista
        driverIds.length > 0
          ? this.usersLocationRepository
              .createQueryBuilder('location')
              .where('location."userId" IN (:...driverIds)', { driverIds })
              .orderBy('location."updatedAt"', 'DESC')
              .getMany()
          : [],
      ]);

    // Organizar dados por motorista
    const firstRequestByDriver: Record<string, Date> = {};
    firstRequests.forEach((row) => {
      firstRequestByDriver[row.userDriveId] = new Date(row.firstRequestDate);
    });

    const totalRequestsByDriver: Record<string, number> = {};
    totalRequestsData.forEach((row) => {
      totalRequestsByDriver[row.userDriveId] = parseInt(row.total) || 0;
    });

    const vehicleByDriver: Record<string, Vehicle> = {};
    vehicles.forEach((vehicle) => {
      if (!vehicleByDriver[vehicle.userId]) {
        vehicleByDriver[vehicle.userId] = vehicle;
      }
    });

    const locationByDriver: Record<string, UsersLocation> = {};
    lastLocations.forEach((location) => {
      if (!locationByDriver[location.userId]) {
        locationByDriver[location.userId] = location;
      }
    });

    // Mapear atividades dos motoristas
    const data = drivers.map((driver) => {
      const activationDate = firstRequestByDriver[driver.id] || null;
      const isActivated = !!activationDate;

      let daysToActivation: number | null = null;
      if (activationDate) {
        const signupDate = new Date(driver.createdAt);
        const activDate = new Date(activationDate);
        const diffMs = activDate.getTime() - signupDate.getTime();
        daysToActivation = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }

      const totalRequests = totalRequestsByDriver[driver.id] || 0;
      const vehicle = vehicleByDriver[driver.id] || null;

      const vehicleSummary: SdrDriverVehicleSummaryDto | null = vehicle
        ? {
            vehicleType: vehicle.vehicleType || null,
            plateNumber: vehicle.plateNumber || null,
          }
        : null;

      const lastLocation = locationByDriver[driver.id] || null;

      const contact: SdrDriverContactDto = {
        phoneNumber: driver.phoneNumber || null,
        email: driver.email || null,
        hasPhone: !!driver.phoneNumber,
        hasEmail: !!driver.email,
      };

      let engagementStatus: 'ATIVO' | 'INATIVO' | 'NOVO' | 'NÃO ATIVADO';
      const now = new Date();
      const signupDate = new Date(driver.createdAt);
      const daysSinceSignup = Math.floor(
        (now.getTime() - signupDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (!isActivated) {
        engagementStatus = 'NÃO ATIVADO';
      } else if (daysSinceSignup < 7) {
        engagementStatus = 'NOVO';
      } else if (activationDate) {
        const daysSinceActivation = Math.floor(
          (now.getTime() - new Date(activationDate).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        if (daysSinceActivation > 30) {
          engagementStatus = 'INATIVO';
        } else {
          engagementStatus = 'ATIVO';
        }
      } else {
        engagementStatus = 'INATIVO';
      }

      const driverActivity: SdrDriverActivityDto = {
        id: driver.id,
        name: driver.name || null,
        cpf: driver.cpf || null,
        signupDate: driver.createdAt,
        activationDate,
        daysToActivation,
        isActivated,
        totalRequests,
        vehicle: vehicleSummary,
        contact,
        lastKnownCity: lastLocation?.city || null,
        lastActivityDate: activationDate,
        engagementStatus,
      };

      return driverActivity;
    });

    // Calcular estatísticas
    const totalPages = Math.ceil(total / limit);
    const totalActivated = data.filter((d) => d.isActivated).length;
    const activationRate =
      total > 0 ? Math.round((totalActivated / total) * 100) : 0;

    const activatedDrivers = data.filter(
      (d) => d.daysToActivation !== null,
    ) as Array<SdrDriverActivityDto & { daysToActivation: number }>;
    const totalDaysToActivation = activatedDrivers.reduce(
      (sum, d) => sum + d.daysToActivation,
      0,
    );
    const averageDaysToActivation =
      activatedDrivers.length > 0
        ? Math.round(totalDaysToActivation / activatedDrivers.length)
        : 0;

    const totalNotActivated = total - totalActivated;

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      totalActivated,
      totalNotActivated,
      activationRate,
      averageDaysToActivation,
    };
  }

  async getFirstFreightAnalysis(
    page: number = 1,
    limit: number = 50,
    companyId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<SdrFirstFreightAnalysisResponseDto> {
    const skip = (page - 1) * limit;

    const dateFilter = this.buildDateFilter(startDate, endDate);
    const whereCondition: any = {};
    if (companyId) whereCondition.id = companyId;
    if (dateFilter) whereCondition.createdAt = dateFilter;

    const [companies, total] = await this.companyRepository.findAndCount({
      where: whereCondition,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const companyIds = companies.map((c) => c.id);

    // Buscar dados em batch
    const [firstFreights, totalFreightCounts, contacts] = await Promise.all([
      // Primeiro frete de cada empresa
      companyIds.length > 0
        ? this.freightRepository
            .createQueryBuilder('freight')
            .select('freight."companyId"', 'companyId')
            .addSelect('MIN(freight."createdAt")', 'firstFreightDate')
            .where('freight."companyId" IN (:...companyIds)', { companyIds })
            .groupBy('freight."companyId"')
            .getRawMany()
        : [],
      // Total de fretes por empresa
      companyIds.length > 0
        ? this.freightRepository
            .createQueryBuilder('freight')
            .select('freight."companyId"', 'companyId')
            .addSelect('COUNT(*)', 'total')
            .where('freight."companyId" IN (:...companyIds)', { companyIds })
            .groupBy('freight."companyId"')
            .getRawMany()
        : [],
      // Contatos
      companyIds.length > 0
        ? this.contactCompanyRepository
            .createQueryBuilder('contact')
            .where('contact."companyId" IN (:...companyIds)', { companyIds })
            .getMany()
        : [],
    ]);

    // Organizar dados por empresa
    const firstFreightByCompany: Record<string, Date> = {};
    firstFreights.forEach((row) => {
      firstFreightByCompany[row.companyId] = new Date(row.firstFreightDate);
    });

    const totalFreightsByCompany: Record<string, number> = {};
    totalFreightCounts.forEach((row) => {
      totalFreightsByCompany[row.companyId] = parseInt(row.total) || 0;
    });

    const contactByCompany: Record<string, ContactCompany> = {};
    contacts.forEach((contact) => {
      if (!contactByCompany[contact.companyId]) {
        contactByCompany[contact.companyId] = contact;
      }
    });

    // Mapear dados
    const data = companies.map((company) => {
      const firstFreightDate = firstFreightByCompany[company.id] || null;
      const hasPublished = !!firstFreightDate;

      let daysToFirstFreight: number | null = null;
      if (firstFreightDate) {
        const signupDate = new Date(company.createdAt);
        const freightDate = new Date(firstFreightDate);
        const diffMs = freightDate.getTime() - signupDate.getTime();
        daysToFirstFreight = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }

      const totalFreights = totalFreightsByCompany[company.id] || 0;
      const contact = contactByCompany[company.id];

      let engagementSpeed: 'RÁPIDO' | 'MÉDIO' | 'LENTO' | 'NÃO PUBLICOU';
      if (!hasPublished) {
        engagementSpeed = 'NÃO PUBLICOU';
      } else if (daysToFirstFreight !== null) {
        if (daysToFirstFreight < 3) {
          engagementSpeed = 'RÁPIDO';
        } else if (daysToFirstFreight <= 7) {
          engagementSpeed = 'MÉDIO';
        } else {
          engagementSpeed = 'LENTO';
        }
      } else {
        engagementSpeed = 'NÃO PUBLICOU';
      }

      const companyFirstFreight: SdrCompanyFirstFreightDto = {
        companyId: company.id,
        companyName: company.name || null,
        companyFantasyName: company.nameFantasy || null,
        signupDate: company.createdAt,
        firstFreightDate,
        daysToFirstFreight,
        hasPublished,
        totalFreights,
        phoneNumber: contact?.phoneNumber || null,
        email: contact?.email || null,
        engagementSpeed,
      };

      return companyFirstFreight;
    });

    const totalPages = Math.ceil(total / limit);

    const companiesNotPublished = data.filter((c) => !c.hasPublished).length;
    const fastEngagement = data.filter(
      (c) => c.engagementSpeed === 'RÁPIDO',
    ).length;
    const mediumEngagement = data.filter(
      (c) => c.engagementSpeed === 'MÉDIO',
    ).length;
    const slowEngagement = data.filter(
      (c) => c.engagementSpeed === 'LENTO',
    ).length;

    const publishedCompanies = data.filter(
      (c) => c.daysToFirstFreight !== null,
    ) as Array<SdrCompanyFirstFreightDto & { daysToFirstFreight: number }>;
    const totalDays = publishedCompanies.reduce(
      (sum, c) => sum + c.daysToFirstFreight,
      0,
    );
    const averageDaysToFirstFreight =
      publishedCompanies.length > 0
        ? Math.round(totalDays / publishedCompanies.length)
        : 0;

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      averageDaysToFirstFreight,
      companiesNotPublished,
      fastEngagement,
      mediumEngagement,
      slowEngagement,
    };
  }

  async getPostingFrequency(
    page: number = 1,
    limit: number = 50,
    period: PostingPeriod = PostingPeriod.WEEKLY,
    companyId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<SdrPostingFrequencyResponseDto> {
    const skip = (page - 1) * limit;

    const dateFilter = this.buildDateFilter(startDate, endDate);
    const whereCondition: any = {};
    if (companyId) whereCondition.id = companyId;
    if (dateFilter) whereCondition.createdAt = dateFilter;

    const [companies, total] = await this.companyRepository.findAndCount({
      where: whereCondition,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const companyIds = companies.map((c) => c.id);

    // Buscar estatísticas de fretes em batch
    const [freightStats, contacts] = await Promise.all([
      companyIds.length > 0
        ? this.freightRepository
            .createQueryBuilder('freight')
            .select('freight."companyId"', 'companyId')
            .addSelect('COUNT(*)', 'total')
            .addSelect('MIN(freight."createdAt")', 'firstFreightDate')
            .addSelect('MAX(freight."createdAt")', 'lastFreightDate')
            .where('freight."companyId" IN (:...companyIds)', { companyIds })
            .groupBy('freight."companyId"')
            .getRawMany()
        : [],
      companyIds.length > 0
        ? this.contactCompanyRepository
            .createQueryBuilder('contact')
            .where('contact."companyId" IN (:...companyIds)', { companyIds })
            .getMany()
        : [],
    ]);

    // Organizar dados por empresa
    const statsByCompany: Record<
      string,
      { total: number; firstDate: Date | null; lastDate: Date | null }
    > = {};
    freightStats.forEach((row) => {
      statsByCompany[row.companyId] = {
        total: parseInt(row.total) || 0,
        firstDate: row.firstFreightDate ? new Date(row.firstFreightDate) : null,
        lastDate: row.lastFreightDate ? new Date(row.lastFreightDate) : null,
      };
    });

    const contactByCompany: Record<string, ContactCompany> = {};
    contacts.forEach((contact) => {
      if (!contactByCompany[contact.companyId]) {
        contactByCompany[contact.companyId] = contact;
      }
    });

    // Mapear dados
    const data = companies.map((company) => {
      const stats = statsByCompany[company.id] || {
        total: 0,
        firstDate: null,
        lastDate: null,
      };

      const totalFreights = stats.total;
      const firstFreightDate = stats.firstDate;
      const lastFreightDate = stats.lastDate;

      let activeDays = 0;
      let averagePerDay = 0;
      let averagePerWeek = 0;
      let averagePerMonth = 0;

      if (firstFreightDate && lastFreightDate) {
        const diffMs =
          new Date(lastFreightDate).getTime() -
          new Date(firstFreightDate).getTime();
        activeDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

        averagePerDay = totalFreights / activeDays;
        averagePerWeek = (totalFreights / activeDays) * 7;
        averagePerMonth = (totalFreights / activeDays) * 30;
      }

      const contact = contactByCompany[company.id];

      let activityLevel: 'ALTO' | 'MÉDIO' | 'BAIXO' | 'INATIVO';
      if (totalFreights === 0) {
        activityLevel = 'INATIVO';
      } else if (averagePerWeek > 10) {
        activityLevel = 'ALTO';
      } else if (averagePerWeek >= 3) {
        activityLevel = 'MÉDIO';
      } else {
        activityLevel = 'BAIXO';
      }

      const companyFrequency: SdrCompanyPostingFrequencyDto = {
        companyId: company.id,
        companyName: company.name || null,
        companyFantasyName: company.nameFantasy || null,
        totalFreights,
        averagePerDay: parseFloat(averagePerDay.toFixed(2)),
        averagePerWeek: parseFloat(averagePerWeek.toFixed(2)),
        averagePerMonth: parseFloat(averagePerMonth.toFixed(2)),
        firstFreightDate,
        lastFreightDate,
        activeDays,
        phoneNumber: contact?.phoneNumber || null,
        email: contact?.email || null,
        activityLevel,
      };

      return companyFrequency;
    });

    const totalPages = Math.ceil(total / limit);

    const totalFreightsAllCompanies = data.reduce(
      (sum, c) => sum + c.totalFreights,
      0,
    );
    const totalActiveDays = data.reduce((sum, c) => sum + c.activeDays, 0);

    const overallAveragePerDay =
      totalActiveDays > 0
        ? parseFloat(
            (totalFreightsAllCompanies / totalActiveDays).toFixed(2),
          )
        : 0;
    const overallAveragePerWeek = parseFloat(
      (overallAveragePerDay * 7).toFixed(2),
    );
    const overallAveragePerMonth = parseFloat(
      (overallAveragePerDay * 30).toFixed(2),
    );

    const highActivity = data.filter((c) => c.activityLevel === 'ALTO').length;
    const mediumActivity = data.filter(
      (c) => c.activityLevel === 'MÉDIO',
    ).length;
    const lowActivity = data.filter((c) => c.activityLevel === 'BAIXO').length;
    const inactive = data.filter((c) => c.activityLevel === 'INATIVO').length;

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      totalFreightsAllCompanies,
      overallAveragePerDay,
      overallAveragePerWeek,
      overallAveragePerMonth,
      highActivity,
      mediumActivity,
      lowActivity,
      inactive,
    };
  }

  private buildDateFilter(
    startDate?: string,
    endDate?: string,
  ) {
    if (startDate && endDate) {
      return Between(
        new Date(startDate),
        new Date(endDate + 'T23:59:59.999Z'),
      );
    } else if (startDate) {
      return MoreThanOrEqual(new Date(startDate));
    } else if (endDate) {
      return LessThanOrEqual(new Date(endDate + 'T23:59:59.999Z'));
    }
    return undefined;
  }
}
