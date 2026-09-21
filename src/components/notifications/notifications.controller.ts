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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notifications.service';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { GetUserId } from 'src/decorators/get-user-decorator';
import { ListNotificationsQueryDto } from './dto/list-notifications.dto';

@ApiTags('notifications')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Lista notificações da empresa (paginado)' })
  async getNotifications(
    @GetUserId() recipientId: string,
    @Query() params: ListNotificationsQueryDto,
  ) {
    return this.notificationService.getNotifications(recipientId, params);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Quantidade de notificações não lidas' })
  async countUnread(@GetUserId() recipientId: string) {
    return this.notificationService.countUnread(recipientId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marca todas as notificações como lidas' })
  async markAllAsRead(@GetUserId() recipientId: string) {
    return this.notificationService.markAllAsRead(recipientId);
  }

  @Patch('read/:id')
  @ApiOperation({ summary: 'Marca uma notificação como lida (idempotente)' })
  async markAsRead(
    @GetUserId() recipientId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.notificationService.markAsRead(id, recipientId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Exclui uma notificação (lida ou não)' })
  async deleteNotification(
    @GetUserId() recipientId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.notificationService.deleteNotification(id, recipientId);
  }
}
