import {
  Entity,
  Index,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { CompanyUsersContacts } from './company-users-contacts.entity';

/** Índices criados na migration DriverNetworkIndexes. */
@Index('IDX_contact_group_company', ['companyId'], { where: '"isActive" = true' })
@Entity({ schema: 'public', name: 'contact-group' })
export class ContactGroup {
  @PrimaryColumn({ default: () => 'gen_random_uuid()' })
  id: string;

  @Column()
  name: string;

  @Column()
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @ManyToMany(() => CompanyUsersContacts)
  @JoinTable({
    name: 'contact-group-members',
    joinColumn: { name: 'groupId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'contactId', referencedColumnName: 'id' },
  })
  contacts: CompanyUsersContacts[];

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
