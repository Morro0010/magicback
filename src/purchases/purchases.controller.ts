import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { UserRole as UserRoleType } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/dto/id-param.dto';
import type { AuthenticatedRequest } from '../common/types/authenticated-request.type';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { ListPurchasesQueryDto } from './dto/list-purchases-query.dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  listPurchases(@Query() query: ListPurchasesQueryDto) {
    return this.purchasesService.listPurchases(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  getPurchase(@Param() params: IdParamDto) {
    return this.purchasesService.getPurchaseById(params.id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  createPurchase(
    @Body() dto: CreatePurchaseDto,
    @CurrentUser() user: { id: string; role: UserRoleType },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.purchasesService.createPurchase(dto, {
      id: user.id,
      role: user.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
