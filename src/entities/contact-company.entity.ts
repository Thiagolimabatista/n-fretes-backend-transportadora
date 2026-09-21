import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { Freight } from './freight.entity';

@Entity({ schema: 'public', name: 'contact-company' })
export class ContactCompany {
  @PrimaryColumn({ default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column()
  companyId: string;

  @ManyToOne(() => Company, (company) => company.contacts)
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @OneToMany(() => Freight, (freight) => freight.contactCompany)
  freights: Freight[];

  @Column({ default: true })
  isActive: boolean;

  /** Preferências de interface do portal (ver módulo preferences). */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb", select: false })
  preferences?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  cpf: string;

  @Column({ nullable: true })
  password: string;
}
