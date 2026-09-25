import {
  Entity,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
  PrimaryColumn,
  Index,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { Vehicle } from './vehicles.entity';
import { CompanyUsersContacts } from './company-users-contacts.entity';
import { UsersLocation } from './users-location.entity';
import { FreightRequest } from './freight-requests.entity';
import { FreightRoutes } from './freight-routes.entity';
import { ReviewUserDrive } from './review-users-drive.entity';
import { UserDriveAchievement } from './users-drive-achivement.entity';
import { UsersFavoritesCompany } from './users-favorites-company.entity';

/** Índice de expressão (CPF só com dígitos), criado na migration DriverNetworkIndexes. */
@Index('IDX_users_drive_cpf_digits', { synchronize: false })
@Entity({ schema: 'public', name: 'users_drive' })
export class UsersDrive {
  @PrimaryColumn({ default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true, unique: true })
  email: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  password: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Index({ unique: true })
  @Column({ nullable: true })
  cpf: string;

  @Column({ nullable: true })
  photoFaceURL?: string;

  @Column({ nullable: true })
  documentPhotoURL?: string;

  @Column({ nullable: true })
  zipcode: string;

  @Column({ nullable: true })
  street: string;

  @Column({ nullable: true })
  number: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  complement?: string;

  @Column({ default: false })
  isSucess: boolean;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  device: string;

  @Column({ type: 'timestamp', nullable: true })
  lastAccess: Date;

  @Column({ nullable: true })
  accessIp: string;

  @Column({ nullable: true })
  antt: string;

  @Column({ nullable: true })
  cnh: string;

  @Column({ nullable: true })
  pushToken: string;

  @Column({ nullable: true, type: 'float', default: 0.0 })
  similiary: number;

  @Column({ type: 'boolean', default: false })
  isOnRoute: boolean;

  @OneToMany(() => Vehicle, (vehicle) => vehicle.user, {
    cascade: true,
    eager: true,
  })
  vehicles: Vehicle[];

  @OneToMany(() => CompanyUsersContacts, (company) => company.users)
  CompanyUsersContacts: CompanyUsersContacts[];

  @OneToMany(
    () => UsersFavoritesCompany,
    (userFavorites) => userFavorites.company,
  )
  usersFavoritesCompany: UsersFavoritesCompany[];

  @OneToMany(() => UsersLocation, (location) => location.user)
  locations: UsersLocation[];

  @OneToMany(() => FreightRequest, (freightRequest) => freightRequest.userDrive)
  freightRequest: FreightRequest[];

  @OneToMany(
    () => ReviewUserDrive,
    (reviewUserDrive) => reviewUserDrive.userDrive,
  )
  reviewUserDrive: ReviewUserDrive[];

  @OneToOne(() => FreightRoutes, (freightRoutes) => freightRoutes.userDrive)
  freightRoutes: FreightRoutes;

  @OneToMany(
    () => UserDriveAchievement,
    (userDriveAchivement) => userDriveAchivement.userDrive,
  )
  userDriveAchievement: UserDriveAchievement[];
}
