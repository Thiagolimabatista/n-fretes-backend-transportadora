import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import {
  EntityType,
  Notification,
  NotificationStatus,
} from '@entities/notifications.entity';
import { ListNotificationsQueryDto } from './dto/list-notifications.dto';

/** Este backend só atende empresas (transportadoras). */
const RECIPIENT_TYPE = EntityType.COMPANY;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
  ) {}

  async getNotifications(recipientId: string, params: ListNotificationsQueryDto) {
    const { category, status, search, page = 1, take = 10 } = params;

    const queryBuilder = this.notificationRepository
      .createQueryBuilder('notifications')
      .where('notifications.recipientId = :recipientId', { recipientId })
      .andWhere('notifications.recipientType = :recipientType', {
        recipientType: RECIPIENT_TYPE,
      })
      .andWhere('notifications.status != :deletedStatus', {
        deletedStatus: NotificationStatus.DELETED,
      })
      .orderBy('notifications.created_at', 'DESC')
      .skip((page - 1) * take)
      .take(take);

    if (category) {
      queryBuilder.andWhere('notifications.category = :category', { category });
    }
    if (status) {
      queryBuilder.andWhere('notifications.status = :status', { status });
    }
    if (search) {
      queryBuilder.andWhere(
        '(notifications.title ILIKE :search OR notifications.message ILIKE :search)',
        { search: `%${escapeLike(search)}%` },
      );
    }

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      pageCount: Math.ceil(total / take),
    };
  }

  async countUnread(recipientId: string): Promise<{ count: number }> {
    const count = await this.notificationRepository.count({
      where: {
        recipientId,
        recipientType: RECIPIENT_TYPE,
        status: NotificationStatus.UNREAD,
      },
    });
    return { count };
  }

  async markAsRead(id: string, recipientId: string) {
    const notification = await this.findOwned(id, recipientId);

    if (notification.status === NotificationStatus.UNREAD) {
      notification.status = NotificationStatus.READ;
      notification.readAt = new Date();
      return this.notificationRepository.save(notification);
    }
    return notification;
  }

  async markAllAsRead(recipientId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepository.update(
      {
        recipientId,
        recipientType: RECIPIENT_TYPE,
        status: NotificationStatus.UNREAD,
      },
      { status: NotificationStatus.READ, readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }

  async deleteNotification(id: string, recipientId: string) {
    const notification = await this.findOwned(id, recipientId);

    notification.status = NotificationStatus.DELETED;
    notification.readAt = notification.readAt ?? new Date();
    await this.notificationRepository.save(notification);
    return { id: notification.id, status: notification.status };
  }

  private async findOwned(id: string, recipientId: string) {
    const notification = await this.notificationRepository.findOne({
      where: {
        id,
        recipientId,
        recipientType: RECIPIENT_TYPE,
        status: Not(NotificationStatus.DELETED),
      },
    });

    if (!notification) {
      throw new HttpException(
        'Notificação não encontrada',
        HttpStatus.NOT_FOUND,
      );
    }
    return notification;
  }
}
