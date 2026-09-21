import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SdrController } from './sdr.controller';
import { SdrService } from './srd.service';
import { Company } from '@entities/company.entity';
import { ContactCompany } from '@entities/contact-company.entity';
import { Freight } from '@entities/freight.entity';
import { FreightRequest } from '@entities/freight-requests.entity';
import { UsersDrive } from '@entities/users-drive.entity';
import { Vehicle } from '@entities/vehicles.entity';
import { UsersLocation } from '@entities/users-location.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      ContactCompany,
      Freight,
      FreightRequest,
      UsersDrive,
      Vehicle,
      UsersLocation
    ]),
  ],
  controllers: [SdrController],
  providers: [SdrService],
  exports: [SdrService],
})
export class SdrModule {}
