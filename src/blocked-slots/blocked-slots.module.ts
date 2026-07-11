import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BlockedSlotsController } from './blocked-slots.controller';
import { BlockedSlotsService } from './blocked-slots.service';

@Module({
  imports: [PrismaModule],
  controllers: [BlockedSlotsController],
  providers: [BlockedSlotsService],
  exports: [BlockedSlotsService],
})
export class BlockedSlotsModule {}
