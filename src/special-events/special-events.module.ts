import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SpecialEventReservationsController } from './special-event-reservations.controller';
import { SpecialEventsController } from './special-events.controller';
import { SpecialEventsService } from './special-events.service';

@Module({
  imports: [PrismaModule, MessagingModule],
  controllers: [SpecialEventsController, SpecialEventReservationsController],
  providers: [SpecialEventsService],
  exports: [SpecialEventsService],
})
export class SpecialEventsModule {}
