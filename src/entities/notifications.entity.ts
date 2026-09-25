import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum NotificationCategory {
  FREIGHT = 'freight',
  PAYMENT = 'payment',
  SYSTEM = 'system',
  MAINTENANCE = 'maintenance',
  DOCUMENT = 'document',
  CHAT = 'chat',
}

export enum NotificationStatus {
  UNREAD = 'unread',
  READ = 'read',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
}

export enum EntityType {
  USER = 'user',
  COMPANY = 'company',
}

export enum IconStyles {
  FREIGHT_REQUEST = 'freightRequest',
  FREIGHT_DELIVERY = 'freightDelivery',
  CHAT = 'chat',
  FREIGHT_ACCEPTED = 'freightAccepted',
  WELCOME = 'welcome',
  UPGRADE = 'upgrade',
  FREIGHT_RECUSED = 'freightRecused',
  DELIVERY_CONFIRMED = 'deliveryConfirmed',
  AVALIATION = 'avaliation',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: NotificationCategory,
    default: NotificationCategory.SYSTEM,
  })
  category: NotificationCategory;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'enum', enum: EntityType })
  senderType: EntityType;

  @Index()
  @Column()
  senderId: string;

  @Column({ type: 'enum', enum: EntityType })
  recipientType: EntityType;

  @Index()
  @Column()
  recipientId: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, any>;

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.UNREAD,
  })
  status: NotificationStatus;

  @Column({ name: 'related_entity_type', nullable: true })
  relatedEntityType?: string;

  @Column({ name: 'related_entity_id', nullable: true })
  relatedEntityId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Index()
  @Column({ name: 'expires_at', nullable: true })
  expiresAt?: Date;

  @Column({ name: 'is_broadcast', default: false })
  isBroadcast: boolean;

  @Column({ name: 'read_at', type: 'timestamp', nullable: true })
  readAt?: Date;

  @Column({ nullable: true })
  iconStyle: string | null;
}
