import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Freight } from './freight.entity';
import { UsersDrive } from './users-drive.entity';

/**
 * Visualizacoes de frete pertencem ao banco compartilhado pelos dois backends.
 *
 * O backend motorista e o consumidor desta tabela. Ela tambem fica mapeada no
 * backend transportadora porque este repositorio e o dono canonico do schema e
 * das migrations do banco compartilhado.
 */
@Entity({ schema: 'public', name: 'freight_views' })
@Index(['freightId', 'userId'], { unique: true })
export class FreightView {
  @PrimaryColumn({ default: () => 'gen_random_uuid()' })
  id: string;

  @Column()
  freightId: string;

  @Column()
  userId: string;

  @CreateDateColumn()
  viewedAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  expiresAt: Date;

  @ManyToOne(() => Freight, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'freightId' })
  freight: Freight;

  @ManyToOne(() => UsersDrive, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UsersDrive;
}
