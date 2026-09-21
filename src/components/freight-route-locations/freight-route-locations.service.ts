import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FreightRouteLocations } from '../../entities/freight-route-locations.entity';
import { FreightRoutes } from '../../entities/freight-routes.entity';
import { CreateRouteLocationDto } from './dto/create-route-location.dto';

@Injectable()
export class FreightRouteLocationsService {
  constructor(
    @InjectRepository(FreightRouteLocations)
    private readonly routeLocationsRepository: Repository<FreightRouteLocations>,
    @InjectRepository(FreightRoutes)
    private readonly freightRoutesRepository: Repository<FreightRoutes>,
  ) {}

  async create(
    companyId: string,
    createLocationDto: CreateRouteLocationDto,
  ): Promise<FreightRouteLocations> {
    const route = await this.findOwnedRoute(
      companyId,
      createLocationDto.routeId,
    );

    const location = this.routeLocationsRepository.create({
      ...createLocationDto,
      userDriveId: route.userDriveId,
    });
    return await this.routeLocationsRepository.save(location);
  }

  async findByRouteId(
    companyId: string,
    routeId: string,
  ): Promise<FreightRouteLocations[]> {
    await this.findOwnedRoute(companyId, routeId);

    return await this.routeLocationsRepository.find({
      where: { routeId },
      order: { timestamp: 'DESC' },
    });
  }

  async getLatestLocation(
    companyId: string,
    routeId: string,
  ): Promise<FreightRouteLocations> {
    await this.findOwnedRoute(companyId, routeId);

    return await this.routeLocationsRepository.findOne({
      where: { routeId },
      order: { timestamp: 'DESC' },
    });
  }

  /** Rota da empresa do token; 404 se não existir ou for de outra empresa. */
  private async findOwnedRoute(
    companyId: string,
    routeId: string,
  ): Promise<Pick<FreightRoutes, 'id' | 'userDriveId'>> {
    const route = await this.freightRoutesRepository.findOne({
      where: { id: routeId, companyId },
      select: ['id', 'userDriveId'],
    });

    if (!route) {
      throw new HttpException('Rota não encontrada.', HttpStatus.NOT_FOUND);
    }

    return route;
  }
}
