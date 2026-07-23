import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PublicRoute } from '../common/decorators/public-route.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/dto/id-param.dto';
import { CreateSpecialEventReservationDto } from './dto/create-special-event-reservation.dto';
import { SpecialEventsService } from './special-events.service';

@Controller('special-event-reservations')
export class SpecialEventReservationsController {
  constructor(private readonly specialEventsService: SpecialEventsService) {}

  @Get('public/:token')
  @PublicRoute()
  getPublicReservation(@Param('token') token: string) {
    return this.specialEventsService.getPublicReservationByToken(token);
  }

  @Patch('public/:token')
  @PublicRoute()
  updatePublicReservation(
    @Param('token') token: string,
    @Body() dto: CreateSpecialEventReservationDto,
  ) {
    return this.specialEventsService.updatePublicReservationByToken(token, dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  getReservation(@Param() params: IdParamDto) {
    return this.specialEventsService.getReservationById(params.id);
  }

  @Post(':id/confirm-payment')
  @Roles(UserRole.ADMIN)
  confirmPayment(
    @Param() params: IdParamDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.specialEventsService.confirmReservationPayment(
      params.id,
      user.id,
    );
  }

  @Post(':id/cancel')
  @Roles(UserRole.ADMIN)
  cancelReservation(
    @Param() params: IdParamDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.specialEventsService.cancelReservation(params.id, user.id);
  }

  @Post(':id/resend-link')
  @Roles(UserRole.ADMIN)
  resendLink(@Param() params: IdParamDto, @CurrentUser() user: { id: string }) {
    return this.specialEventsService.resendReservationLink(params.id, user.id);
  }
}
