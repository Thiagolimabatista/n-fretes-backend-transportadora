import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AwsService } from '@components/aws/aws.service';

import { CompanyUsersContacts } from '@entities/company-users-contacts.entity';
import { ContactCompany } from '@entities/contact-company.entity';
import { Freight } from '@entities/freight.entity';
import { ContactGroup } from '@entities/contact-group.entity';
import { FreightRoutes } from '@entities/freight-routes.entity';
import { DriverDocument } from '@entities/driver-documents.entity';

import { UsersContactCompanyService } from './users-contact.service';
import { UsersContactCompanyController } from './users-contact.controller';
import { UsersDrive } from '@entities/users-drive.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      CompanyUsersContacts,
      UsersDrive,
      ContactCompany,
      Freight,
      ContactGroup,
      FreightRoutes,
      DriverDocument,
    ]),
  ],
  exports: [TypeOrmModule],
  controllers: [UsersContactCompanyController],
  providers: [UsersContactCompanyService, AwsService],
})
export class UsersContactCompanyModule {}
