import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Company } from '@entities/company.entity';
import { ContactCompany } from '@entities/contact-company.entity';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';

@Module({
  imports: [TypeOrmModule.forFeature([Company, ContactCompany])],
  controllers: [PreferencesController],
  providers: [PreferencesService],
})
export class PreferencesModule {}
