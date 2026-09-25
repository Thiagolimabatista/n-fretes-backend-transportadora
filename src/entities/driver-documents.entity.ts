import {
  Entity,
  Index,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { UsersDrive } from './users-drive.entity';

/** Índices criados na migration DriverNetworkIndexes. */
@Index('IDX_driver_documents_company_user', ['companyId', 'userId'], { where: '"isActive" = true' })
@Entity({ schema: 'public', name: 'driver-documents' })
export class DriverDocument {
  @PrimaryColumn({ default: () => 'gen_random_uuid()' })
  id: string;

  @Column()
  companyId: string;

  @Column()
  userId: string;

  @Column()
  fileName: string;

  @Column()
  fileKey: string;

  @Column()
  fileUrl: string;

  @Column()
  mimeType: string;

  @Column({ type: 'int' })
  fileSizeBytes: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @ManyToOne(() => UsersDrive)
  @JoinColumn({ name: 'userId' })
  driver: UsersDrive;
}
