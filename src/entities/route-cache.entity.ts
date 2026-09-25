import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  Index,
} from 'typeorm';

export interface TollData {
  name: string;
  concessionaria: string;
  rodovia: string;
  price: number;
  km: string;
  latitude: number;
  longitude: number;
}

export interface TollPoint {
  name: string;
  latitude: number;
  longitude: number;
  toll_price: number;
}

export interface RouteCoordinates {
  origin: {
    latitude: number;
    longitude: number;
  };
  destination: {
    latitude: number;
    longitude: number;
  };
  tollPoints: TollPoint[];
}

/** Rota + pedágio do QualP; uma linha por origem, destino e eixos. */
@Entity({ schema: 'public', name: 'route_cache' })
@Index('UQ_route_cache_route_axis', ['originCity', 'destinationCity', 'axis'], { unique: true })
export class RouteCache {
  @PrimaryColumn({ default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ nullable: false })
  originCity: string; 

  @Column({ nullable: false })
  destinationCity: string;

  /** Eixos do veículo usados na tarifa (2 a 9). */
  @Column({ type: 'int', default: 2 })
  axis: number;

  @Column({ type: 'jsonb', nullable: false })
  tolls: TollData[];

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  totalToll: number;

  @Column({ type: 'int', nullable: false })
  distance: number; 

  @Column({ nullable: false })
  distanceText: string; 

  @Column({ nullable: false })
  duration: string; 

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  fuelConsumption: number;

  @Column({ type: 'jsonb', nullable: false })
  coordinates: RouteCoordinates;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'boolean', default: true })
  isValid: boolean; 
}
