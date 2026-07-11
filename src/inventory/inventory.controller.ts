import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { UserRole as UserRoleType } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../common/types/authenticated-request.type';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { ListInventoryMovementsQueryDto } from './dto/list-inventory-movements-query.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('movements')
  @Roles(UserRole.ADMIN)
  listMovements(@Query() query: ListInventoryMovementsQueryDto) {
    return this.inventoryService.listMovements(query);
  }

  @Post('adjustments')
  @Roles(UserRole.ADMIN)
  createAdjustment(
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser() user: { id: string; role: UserRoleType },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.createManualAdjustment(dto, {
      id: user.id,
      role: user.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
