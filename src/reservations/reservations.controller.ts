import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/dto/id-param.dto';
import type { AuthenticatedRequest } from '../common/types/authenticated-request.type';
import { CancelReservationDto } from './dto/cancel-reservation.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ListReservationsQueryDto } from './dto/list-reservations-query.dto';
import { ReassignReservationDto } from './dto/reassign-reservation.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  listReservations(@Query() query: ListReservationsQueryDto) {
    return this.reservationsService.listReservations(query);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  createReservation(
    @Body() dto: CreateReservationDto,
    @CurrentUser() user: { id: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reservationsService.createReservation(dto, {
      id: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  getReservation(@Param() params: IdParamDto) {
    return this.reservationsService.getReservationById(params.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  updateReservation(
    @Param() params: IdParamDto,
    @Body() dto: UpdateReservationDto,
    @CurrentUser() user: { id: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reservationsService.updateReservation(params.id, dto, {
      id: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  cancelReservation(
    @Param() params: IdParamDto,
    @Body() dto: CancelReservationDto,
    @CurrentUser() user: { id: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reservationsService.cancelReservation(params.id, dto, {
      id: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/reassign')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  reassignReservation(
    @Param() params: IdParamDto,
    @Body() dto: ReassignReservationDto,
    @CurrentUser() user: { id: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reservationsService.reassignReservation(params.id, dto, {
      id: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/payment')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  recordPayment(
    @Param() params: IdParamDto,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: { id: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reservationsService.recordPayment(params.id, dto, {
      id: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get(':id/history')
  @Roles(UserRole.ADMIN)
  getReservationHistory(@Param() params: IdParamDto) {
    return this.reservationsService.getReservationHistory(params.id);
  }

  @Post(':id/regenerate-link')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  regeneratePublicLink(
    @Param() params: IdParamDto,
    @CurrentUser() user: { id: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reservationsService.regeneratePublicLink(params.id, {
      id: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
