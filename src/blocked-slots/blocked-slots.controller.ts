import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/dto/id-param.dto';
import { BlockedSlotsService } from './blocked-slots.service';
import { CreateBlockedSlotDto } from './dto/create-blocked-slot.dto';
import { UpdateBlockedSlotDto } from './dto/update-blocked-slot.dto';

@Controller('blocked-slots')
export class BlockedSlotsController {
  constructor(private readonly blockedSlotsService: BlockedSlotsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  listBlockedSlots() {
    return this.blockedSlotsService.listBlockedSlots();
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  createBlockedSlot(
    @Body() dto: CreateBlockedSlotDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.blockedSlotsService.createBlockedSlot(dto, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  updateBlockedSlot(
    @Param() params: IdParamDto,
    @Body() dto: UpdateBlockedSlotDto,
  ) {
    return this.blockedSlotsService.updateBlockedSlot(params.id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  deleteBlockedSlot(@Param() params: IdParamDto) {
    return this.blockedSlotsService.deleteBlockedSlot(params.id);
  }
}
