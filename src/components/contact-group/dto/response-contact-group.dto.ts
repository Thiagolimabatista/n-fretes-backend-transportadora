export class ContactGroupResponseDto {
  id: string;

  name: string;

  companyId: string;

  /** Ids (company-users-contacts) dos motoristas ativos no grupo. */
  contactIds: string[];

  memberCount: number;

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
