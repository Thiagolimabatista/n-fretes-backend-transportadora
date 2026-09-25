import { Company } from '@entities/company.entity';
import { Freight } from '@entities/freight.entity';

export class ContactCompanyResponseDto {
  id: string;

  name: string;

  phoneNumber: string;

  companyId: string;

  company: Company;

  freights: Freight[];

  isActive: boolean;

  createdAt: Date;

  updatedAt: Date;
}

export class ContactCompanyUpdateResponseDto {
  message: string;
}

export class GetContactCompanyResponseDto {
  data: ContactCompanyResponseDto[];

  count: number;
}
