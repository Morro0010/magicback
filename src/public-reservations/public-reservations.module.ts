import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { HistoryModule } from '../history/history.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommonModule } from '../common/common.module';
import { PublicReservationsController } from './public-reservations.controller';
import { PublicReservationsService } from './public-reservations.service';

@Module({
  imports: [
    PrismaModule,
    ReservationsModule,
    HistoryModule,
    NotificationsModule,
    CommonModule,
  ],
  controllers: [PublicReservationsController],
  providers: [PublicReservationsService],
})
export class PublicReservationsModule {}
