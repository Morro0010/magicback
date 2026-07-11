import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PublicRoute } from '../common/decorators/public-route.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/dto/id-param.dto';
import { CreateSpecialEventReservationDto } from './dto/create-special-event-reservation.dto';
import { CreateSpecialEventDto } from './dto/create-special-event.dto';
import { ListSpecialEventReservationsQueryDto } from './dto/list-special-event-reservations-query.dto';
import { ListSpecialEventsQueryDto } from './dto/list-special-events-query.dto';
import { UpdateSpecialEventDto } from './dto/update-special-event.dto';
import { SpecialEventsService } from './special-events.service';

@Controller('special-events')
export class SpecialEventsController {
  constructor(private readonly specialEventsService: SpecialEventsService) {}

  @Get('public')
  @PublicRoute()
  listPublicEvents() {
    return this.specialEventsService.listPublicEvents();
  }

  @Get('public/:id')
  @PublicRoute()
  getPublicEvent(@Param() params: IdParamDto) {
    return this.specialEventsService.getPublicEvent(params.id);
  }

  @Post('public/:id/reservations')
  @PublicRoute()
  createPublicReservation(
    @Param() params: IdParamDto,
    @Body() dto: CreateSpecialEventReservationDto,
  ) {
    return this.specialEventsService.createPublicReservation(params.id, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  listAdminEvents(@Query() query: ListSpecialEventsQueryDto) {
    return this.specialEventsService.listAdminEvents(query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  createEvent(
    @Body() dto: CreateSpecialEventDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.specialEventsService.createEvent(dto, user.id);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  getAdminEvent(@Param() params: IdParamDto) {
    return this.specialEventsService.getAdminEvent(params.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  updateEvent(
    @Param() params: IdParamDto,
    @Body() dto: UpdateSpecialEventDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.specialEventsService.updateEvent(params.id, dto, user.id);
  }

  @Post(':id/publish')
  @Roles(UserRole.ADMIN)
  publishEvent(@Param() params: IdParamDto, @CurrentUser() user: { id: string }) {
    return this.specialEventsService.publishEvent(params.id, user.id);
  }

  @Post(':id/unpublish')
  @Roles(UserRole.ADMIN)
  unpublishEvent(@Param() params: IdParamDto, @CurrentUser() user: { id: string }) {
    return this.specialEventsService.unpublishEvent(params.id, user.id);
  }

  @Post(':id/close')
  @Roles(UserRole.ADMIN)
  closeEvent(@Param() params: IdParamDto, @CurrentUser() user: { id: string }) {
    return this.specialEventsService.closeEvent(params.id, user.id);
  }

  @Post(':id/cancel')
  @Roles(UserRole.ADMIN)
  cancelEvent(@Param() params: IdParamDto, @CurrentUser() user: { id: string }) {
    return this.specialEventsService.cancelEvent(params.id, user.id);
  }

  @Get(':id/reservations')
  @Roles(UserRole.ADMIN)
  listEventReservations(
    @Param() params: IdParamDto,
    @Query() query: ListSpecialEventReservationsQueryDto,
  ) {
    return this.specialEventsService.listEventReservations(params.id, query);
  }
}
