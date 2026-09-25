import {
  Entity,
  Index,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
import { UsersDrive } from './users-drive.entity';
import { VehicleType, BodyType } from 'src/enum/vehicle';

/** Veículo principal de cada motorista (migration DashboardIndexes). */
@Index('IDX_vehicles_user_main', ['userId'], { where: '"isMainVehicle" = true' })
@Entity({ schema: 'public', name: 'vehicles' })
export class Vehicle {
  @PrimaryColumn({ default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ type: 'enum', enum: VehicleType })
  vehicleType: VehicleType;

  @Column({ type: 'enum', enum: BodyType })
  bodyType: BodyType;

  @Column({ nullable: true })
  plateNumber: string;

  @Column({ nullable: true })
  plateState: string;

  @Column({ nullable: true })
  renavam: string;

  @Column({ nullable: true })
  year: number;

  @Column({ nullable: true })
  color: string;

  @Column({ default: false })
  isPlateValid: boolean;

  @Column({ default: false })
  isRenavamValid: boolean;

  @Column({ nullable: true })
  chassi: string;

  @Column({ default: false })
  tracker: boolean;

  @Column({ default: false })
  locator: boolean;

  @ManyToOne(() => UsersDrive, (user) => user.vehicles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UsersDrive;

  @Column()
  userId: string;

  @Column({ default: false })
  isMainVehicle: boolean;

  @UpdateDateColumn()
  updatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'float', default: 0.0 })
  capacity: number;

  @Column({ nullable: true })
  antt: string;
}
