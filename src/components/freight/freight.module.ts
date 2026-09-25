import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PaginationService } from '@components/pagination/pagination.service';
import { Freight } from '@entities/freight.entity';
import { FreightController } from './freight.controller';
import { FreightService } from './freight.service';
import { Company } from '@entities/company.entity';
import { UsersDrive } from '@entities/users-drive.entity';
import { DistanceModule } from '@components/distance/distance.module';
import { FreightDocument } from '@entities/freight-documents.entity';
import { AwsService } from '@components/aws/aws.service';
import { SqsModule } from '@components/sqs/sqs.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Freight, Company, UsersDrive, FreightDocument]),
    DistanceModule,
    SqsModule,
  ],
  exports: [TypeOrmModule],
  controllers: [FreightController],
  providers: [FreightService, PaginationService, AwsService, ConfigService],
})
export class FreightModule {}
