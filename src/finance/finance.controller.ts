import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { FinanceRangeQueryDto } from './dto/finance-range-query.dto';
import { FinanceService } from './finance.service';

@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('dashboard')
  @Roles(UserRole.ADMIN)
  getDashboard(@Query() query: FinanceRangeQueryDto) {
    return this.financeService.getDashboard(query);
  }

  @Get('sales-history')
  @Roles(UserRole.ADMIN)
  getSalesHistory(@Query() query: FinanceRangeQueryDto) {
    return this.financeService.getSalesHistory(query);
  }

  @Get('purchases-history')
  @Roles(UserRole.ADMIN)
  getPurchasesHistory(@Query() query: FinanceRangeQueryDto) {
    return this.financeService.getPurchasesHistory(query);
  }
}
