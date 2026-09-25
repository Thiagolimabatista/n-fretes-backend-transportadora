import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { Company } from './company.entity';
import {
  FreightLocal,
  PaymentMethod,
  SpecieOfLoad,
  Toll,
  TypeOfLoad,
  UnityMetric,
} from 'src/enum/freight';
import { BodyType, VehicleType } from 'src/enum/vehicle';
import { ContactCompany } from './contact-company.entity';
import { FreightRequest } from './freight-requests.entity';
import { FreightRoutes } from './freight-routes.entity';
import { ReviewUserDrive } from './review-users-drive.entity';
import { RouteCache } from './route-cache.entity';
import { FreightDocument } from './freight-documents.entity';

@Entity({ schema: 'public', name: 'freight' })
export class Freight {
  @PrimaryColumn({ default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ type: 'enum', enum: FreightLocal, default: FreightLocal.NATIONAL })
  shippingLocation: FreightLocal;

  @Column({ nullable: true })
  originCity: string;

  @Column({ nullable: true })
  originState: string;

  @Column({ type: 'timestamp', nullable: true })
  dateOrigin: Date;

  @Column({ nullable: true })
  destinyCity: string;

  @Column({ nullable: true })
  destinyState: string;

  @Column({ type: 'timestamp', nullable: true })
  dateReceiver: Date;

  @Column({ type: 'enum', enum: TypeOfLoad, default: TypeOfLoad.COMPLETE })
  typeOfLoad: TypeOfLoad;

  @Column({ default: false })
  lona: boolean;

  @Column({ default: false })
  tracker: boolean;

  @Column({ nullable: true })
  product: string;

  @Column({ type: 'enum', enum: SpecieOfLoad })
  specieOfLoad: SpecieOfLoad;

  @Column({ nullable: true })
  anttLoadType: string;

  @Column({ nullable: true })
  weightOfLoad: string;

  @Column({ nullable: true })
  weightOfLoadLenght: string;

  @Column({ nullable: true })
  weightOfLoadHeight: string;

  @Column({ nullable: true })
  weightOfLoadWidth: string;

  @Column({
    type: 'enum',
    enum: UnityMetric,
    nullable: true,
    default: null,
  })
  unityMetric: UnityMetric | null;

  @Column({
    nullable: true,
  })
  valueCall: string;

  @Column({ nullable: true })
  volume: string;

  @Column({ default: true })
  security: boolean;

  @Column({ type: 'simple-array', nullable: true })
  vehicleTypes: VehicleType[];

  @Column({ type: 'simple-array', nullable: true })
  bodyTypes: BodyType[];

  @Column({ type: 'float', default: 0, nullable: true })
  valueAdvance: number;

  @Column({ type: 'float', default: 0, nullable: true })
  Valuefreight: number;

  @Column({ type: 'enum', enum: PaymentMethod })
  calValue: PaymentMethod;

  @Column({ type: 'enum', enum: Toll })
  Toll: Toll;

  @Column({ nullable: true })
  methodPayment: string;

  @Column({ nullable: true })
  observation: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: true })
  openSolicitations: boolean;

  @Column({ nullable: true })
  @Column()
  companyId: string;

  @ManyToOne(() => Company, (company) => company.freights)
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ nullable: true })
  contactCompanyId: string;

  @ManyToOne(() => ContactCompany, (contactCompany) => contactCompany.freights)
  @JoinColumn({ name: 'contactCompanyId' })
  contactCompany: ContactCompany;

  /** Demais responsáveis do frete (ids de contact-company), em ordem. */
  @Column({ type: 'simple-array', nullable: true })
  contactCompanyIds: string[];

  @Column({ type: 'simple-array', nullable: true })
  contactGroupIds: string[];

  @Column({ type: 'simple-array', nullable: true })
  tags: string[];

  @OneToMany(() => FreightRequest, (freightRequest) => freightRequest.freight)
  freightRequest: FreightRequest[];

  @OneToMany(
    () => ReviewUserDrive,
    (reviewUserDrive) => reviewUserDrive.freight,
  )
  reviewUserDrive: ReviewUserDrive[];

  @OneToOne(() => FreightRequest, (freightRequest) => freightRequest.freight)
  freightRoutes: FreightRoutes;

  @Column({ nullable: true })
  originLongitude: string;

  @Column({ nullable: true })
  originLatitude: string;

  @Column({ nullable: true })
  destinyLongitude: string;

  @Column({ nullable: true })
  destinyLatitude: string;

  @Column({ nullable: true })
  distance: string;

  @Column({ nullable: true })
  routeCacheId: string;

  @ManyToOne(() => RouteCache, { nullable: true, eager: false })
  @JoinColumn({ name: 'routeCacheId' })
  routeCache: RouteCache;

  @OneToMany(() => FreightDocument, (document) => document.freight)
  documents: FreightDocument[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: true })
  isPublic: boolean;

  @Column({ default: false })
  isFeatured: boolean;

  /** Frete excluído pela transportadora (fica fora de todas as buscas). */
  @Column({ default: false })
  isExclude: boolean;

  @Column({ nullable: true })
  isExcludeUserId: string;

  @Column({ default: true })
  isToShare: boolean;

  @Column({ nullable: true })
  sourceFreightId: string;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;
}
