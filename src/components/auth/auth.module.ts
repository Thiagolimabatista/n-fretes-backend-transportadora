import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Company } from '@entities/company.entity';
import { RecoveryCode } from '@entities/recovery-codes.entity';
import { UsersDrive } from '@entities/users-drive.entity';
import { WhatsappService } from 'src/external/services/WHATSCODE/whatsapp-code.service';
import { HttpModule } from '@nestjs/axios';
import { ContactCompany } from '@entities/contact-company.entity';
import { CompanySearchService } from '@components/company-search/company-search.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      RecoveryCode,
      UsersDrive,
      ContactCompany,
    ]),
    HttpModule,
  ],
  exports: [TypeOrmModule],
  controllers: [AuthController],
  providers: [AuthService, WhatsappService, CompanySearchService],
})
export class AuthModule {}
