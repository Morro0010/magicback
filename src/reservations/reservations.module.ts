import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HistoryModule } from '../history/history.module';
import { CommonModule } from '../common/common.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [PrismaModule, NotificationsModule, HistoryModule, CommonModule, MessagingModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
