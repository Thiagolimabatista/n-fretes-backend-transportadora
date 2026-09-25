import {
  Controller,
  Get,
  Patch,
  Delete,
  Query,
  UseGuards,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { NotificationService } from './notifications.service';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { GetUserId } from 'src/decorators/get-user-decorator';
import { ListNotificationsQueryDto } from './dto/list-notifications.dto';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getNotifications(
    @GetUserId() recipientId: string,
    @Query() params: ListNotificationsQueryDto,
  ) {
    return this.notificationService.getNotifications(recipientId, params);
  }

  @Get('unread-count')
  async countUnread(@GetUserId() recipientId: string) {
    return this.notificationService.countUnread(recipientId);
  }

  @Patch('read-all')
  async markAllAsRead(@GetUserId() recipientId: string) {
    return this.notificationService.markAllAsRead(recipientId);
  }

  @Patch('read/:id')
  async markAsRead(
    @GetUserId() recipientId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.notificationService.markAsRead(id, recipientId);
  }

  @Delete(':id')
  async deleteNotification(
    @GetUserId() recipientId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.notificationService.deleteNotification(id, recipientId);
  }
}
