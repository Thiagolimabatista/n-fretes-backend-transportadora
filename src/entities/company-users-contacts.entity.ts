import {
  Entity,
  Index,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Company } from './company.entity';
import { UsersDrive } from './users-drive.entity';

/** Índices criados na migration DriverNetworkIndexes. */
@Index('IDX_company_users_contacts_company_active', ['companyId', 'isActive'])
@Index('IDX_company_users_contacts_user_company', ['userId', 'companyId'])
@Entity({ schema: 'public', name: 'company-users-contacts' })
export class CompanyUsersContacts {
  @PrimaryColumn({ default: () => 'gen_random_uuid()' })
  id: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'companyId' })
  contacts: Company;

  @ManyToOne(() => UsersDrive)
  @JoinColumn({ name: 'userId' })
  users: UsersDrive;

  @Column({ nullable: true })
  userId: string | null;

  @Column({ nullable: true })
  companyId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: true })
  isActive: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
