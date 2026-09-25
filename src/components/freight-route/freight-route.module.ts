import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FreightRoutes } from '@entities/freight-routes.entity';
import { FreightRouteService } from './freight-route.service';
import { FreightRouteController } from './freight-route.controller';
import { UsersDrive } from '@entities/users-drive.entity';
import { Freight } from '@entities/freight.entity';
import { FreightRequestModule } from '@components/freight-request/freight-request.module';
import { SqsModule } from '@components/sqs/sqs.module';

@Module({
  imports: [TypeOrmModule.forFeature([FreightRoutes, UsersDrive, Freight]), FreightRequestModule, SqsModule],
  controllers: [FreightRouteController],
  providers: [FreightRouteService],
})
export class FreightRouteModule {}
