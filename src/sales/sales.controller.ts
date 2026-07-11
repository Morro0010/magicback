import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { UserRole as UserRoleType } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/dto/id-param.dto';
import type { AuthenticatedRequest } from '../common/types/authenticated-request.type';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { SendSaleWhatsAppDto } from './dto/send-sale-whatsapp.dto';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  listSales(@Query() query: ListSalesQueryDto) {
    return this.salesService.listSales(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  getSale(@Param() params: IdParamDto) {
    return this.salesService.getSaleById(params.id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  createSale(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: { id: string; role: UserRoleType },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.salesService.createSale(dto, {
      id: user.id,
      role: user.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/send-whatsapp')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  sendTicketWhatsApp(
    @Param() params: IdParamDto,
    @Body() dto: SendSaleWhatsAppDto,
    @CurrentUser() user: { id: string; role: UserRoleType },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.salesService.sendTicketByWhatsApp(params.id, dto, {
      id: user.id,
      role: user.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
