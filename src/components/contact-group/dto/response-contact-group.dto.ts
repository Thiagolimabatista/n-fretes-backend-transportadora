import { CompanyUsersContacts } from '@entities/company-users-contacts.entity';

export class ContactGroupResponseDto {
  id: string;

  name: string;

  companyId: string;

  contacts: CompanyUsersContacts[];

  isActive: boolean;

  createdAt: Date;

  updatedAt: Date;
}

export class ContactGroupUpdateResponseDto {
  message: string;
}

export class GetContactGroupsResponseDto {
  data: ContactGroupResponseDto[];

  count: number;
}
