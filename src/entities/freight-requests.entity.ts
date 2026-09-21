import {
  Entity,
  ManyToOne,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  JoinColumn,
} from 'typeorm';
import { Freight } from './freight.entity';
import { UsersDrive } from './users-drive.entity';
import { Company } from './company.entity';

export enum FreightRequestStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  AWAITING_USER_DRIVE_RESPONSE = 'AWAITING_USER_DRIVE_RESPONSE',
  DRIVER_CONFIRMED_DELIVERY = 'DRIVER_CONFIRMED_DELIVERY',
  DELIVERY_COMPLETED = 'DELIVERY_COMPLETED',
  NOT_CONFIRMED_DELIVERY = 'NOT_CONFIRMED_DELIVERY',
  /** Motorista desistiu do frete depois de aceito (frete volta a receber solicitações). */
  CANCELED_BY_DRIVER = 'CANCELED_BY_DRIVER',
}

@Entity('freight_requests')
export class FreightRequest {
  @PrimaryColumn({ default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ nullable: true })
  freightId: string | null;

  @Column({ nullable: true })
  userDriveId: string | null;

  @Column({ nullable: true })
  companyId: string | null;

  @ManyToOne(() => Freight, (freight) => freight.freightRequest, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'freightId' })
  freight: Freight;

  @ManyToOne(() => UsersDrive, (userDrive) => userDrive.freightRequest, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userDriveId' })
  userDrive: UsersDrive;

  @ManyToOne(() => Company, (company) => company.freightRequest, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({
    type: 'enum',
    enum: FreightRequestStatus,
    default: FreightRequestStatus.PENDING,
  })
  status: FreightRequestStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ nullable: true, default: 0 })
  solicitationsOrder: number;
}
