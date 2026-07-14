import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/dto/id-param.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { MarkNotificationReadDto } from './dto/mark-notification-read.dto';
import { SendNotificationWhatsAppDto } from './dto/send-notification-whatsapp.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  getNotifications(@Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.listNotifications(query);
  }

  @Patch('read-all')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Patch(':id/read')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  markRead(
    @Param() params: IdParamDto,
    @Body() _body: MarkNotificationReadDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.notificationsService.markAsRead(params.id, user.id);
  }

  @Patch(':id/unread')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  markUnread(
    @Param() params: IdParamDto,
    @Body() _body: MarkNotificationReadDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.notificationsService.markAsUnread(params.id, user.id);
  }

  @Post(':id/send-whatsapp')
  @Roles(UserRole.ADMIN)
  sendWhatsApp(
    @Param() params: IdParamDto,
    @Body() body: SendNotificationWhatsAppDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.notificationsService.sendNotificationToWhatsApp(params.id, {
      phone: body.phone,
      text: body.text,
      actorUserId: user.id,
    });
  }
}
