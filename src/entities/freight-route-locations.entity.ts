import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { FreightRoutes } from './freight-routes.entity';

/**
 * Pontos do rastreamento da rota. Índices (criados na migration
 * AcceptFlowAndTracking): único em ("routeId", "timestamp") e
 * ("userDriveId", "timestamp" DESC).
 */
@Entity({ schema: 'public', name: 'freight_route_locations' })
export class FreightRouteLocations {
  @PrimaryColumn({ default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ type: 'decimal', precision: 10, scale: 8 })
  latitude: number;

  @Column({ type: 'decimal', precision: 11, scale: 8 })
  longitude: number;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  /** Hora em que o aparelho registrou o ponto (recordedAt no app). */
  @CreateDateColumn()
  timestamp: Date;

  /** Hora em que o servidor recebeu o ponto. */
  @Column({ type: 'timestamp', default: () => 'now()' })
  receivedAt: Date;

  @Column()
  routeId: string;

  @Column({ type: 'varchar', nullable: true })
  userDriveId: string | null;

  /** Precisão informada pelo GPS, em metros. */
  @Column({ type: 'double precision', nullable: true })
  accuracy: number | null;

  /** Velocidade informada pelo GPS, em m/s. */
  @Column({ type: 'double precision', nullable: true })
  speed: number | null;

  /** Direção do deslocamento, em graus (0 = norte). */
  @Column({ type: 'double precision', nullable: true })
  heading: number | null;

  @ManyToOne(() => FreightRoutes, (route) => route.locations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'routeId' })
  route: FreightRoutes;
}
