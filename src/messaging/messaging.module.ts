import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagingService } from './messaging.service';

@Module({
  imports: [NotificationsModule],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
