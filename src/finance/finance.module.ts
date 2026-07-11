import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SpecialEventsModule } from '../special-events/special-events.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [PrismaModule, SpecialEventsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
