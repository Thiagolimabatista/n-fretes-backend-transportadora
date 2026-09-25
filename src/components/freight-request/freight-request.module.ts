import { Module } from '@nestjs/common';
import { FreightRequestService } from './freight-request.service';
import { FreightRequestController } from './freight-request.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FreightRequest } from '@entities/freight-requests.entity';
import { PaginationService } from '@components/pagination/pagination.service';
import { FreightRoutes } from '@entities/freight-routes.entity';
import { Freight } from '@entities/freight.entity';
import { UsersDrive } from '@entities/users-drive.entity';
import { SQSService } from '@components/sqs/sqs.service';
import { Notification } from '@entities/notifications.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FreightRequest,
      FreightRoutes,
      Freight,
      UsersDrive,
      Notification,
    ]),
  ],
  controllers: [FreightRequestController],
  providers: [FreightRequestService, PaginationService, SQSService],
  exports: [FreightRequestService],
})
export class FreightRequestModule {}
