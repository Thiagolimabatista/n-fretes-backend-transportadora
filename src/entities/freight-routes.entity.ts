import {
  Entity,
  Index,
  ManyToOne,
  Column,
  CreateDateColumn,
  PrimaryColumn,
  JoinColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { Freight } from './freight.entity';
import { UsersDrive } from './users-drive.entity';
import { Company } from './company.entity';
import { ReviewUserDrive } from './review-users-drive.entity';
import { FreightRouteLocations } from './freight-route-locations.entity';

export enum RouteStatus {
  IN_PROGRESS = 'PROGUESS',
  COMPLETED = 'COMPLETED',
  CANCELED = 'CANCEL',
}

/** Índices criados na migration DashboardIndexes. */
@Index('IDX_freight_routes_company_status', ['companyId', 'status'])
@Index('IDX_freight_routes_freight', ['freightId'])
@Index('IDX_freight_routes_driver_status', ['userDriveId', 'status'])
@Entity('freight_routes')
export class FreightRoutes {
  @PrimaryColumn({ default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ nullable: true })
  freightId: string | null;

  @Column({ nullable: true })
  userDriveId: string | null;

  @Column({ nullable: true })
  companyId: string | null;

  @ManyToOne(() => Freight, (freight) => freight.freightRoutes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'freightId' })
  freight: Freight;

  @ManyToOne(() => UsersDrive, (userDrive) => userDrive.freightRoutes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userDriveId' })
  userDrive: UsersDrive;

  @ManyToOne(() => Company, (company) => company.freightRoutes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @OneToOne(() => ReviewUserDrive, (review) => review.freightRoute)
  reviewUserDrive: ReviewUserDrive;

  @Column({
    type: 'enum',
    enum: RouteStatus,
    default: RouteStatus.IN_PROGRESS,
  })
  status: RouteStatus;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  avalationCompany: boolean;

  @Column({ default: false })
  avalationUserDrive: boolean;

  @CreateDateColumn()
  startedAt: Date;

  /** Preenchida só quando a rota é concluída (COMPLETED); nula nos demais status. */
  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  /** Quem confirmou a entrega ("Sistema" na baixa automática). */
  @Column({ type: 'varchar', nullable: true })
  completedByName: string | null;

  @OneToMany(() => FreightRouteLocations, (location) => location.route)
  locations: FreightRouteLocations[];
}
