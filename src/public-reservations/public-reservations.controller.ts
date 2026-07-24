import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { PublicRoute } from '../common/decorators/public-route.decorator';
import { PublicAvailabilityQueryDto } from './dto/public-availability-query.dto';
import { UpdatePublicReservationDto } from './dto/update-public-reservation.dto';
import { PublicReservationsService } from './public-reservations.service';

@Controller('public/reservations')
@PublicRoute()
export class PublicReservationsController {
  constructor(
    private readonly publicReservationsService: PublicReservationsService,
  ) {}

  @Get()
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  getByHeader(
    @Headers('x-public-reservation-token') token: string,
    @Req() req: FastifyRequest,
  ) {
    return this.getByToken(token, req);
  }

  @Get(':token')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  getByToken(@Param('token') token: string, @Req() req: FastifyRequest) {
    return this.publicReservationsService.getPublicReservationByToken(token, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get(':token/availability')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getAvailability(
    @Param('token') token: string,
    @Query() query: PublicAvailabilityQueryDto,
    @Req() req: FastifyRequest,
  ) {
    return this.publicReservationsService.getAvailabilityByToken(token, query, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('availability')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getAvailabilityByHeader(
    @Headers('x-public-reservation-token') token: string,
    @Query() query: PublicAvailabilityQueryDto,
    @Req() req: FastifyRequest,
  ) {
    return this.getAvailability(token, query, req);
  }

  @Patch(':token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  updateByToken(
    @Param('token') token: string,
    @Body() dto: UpdatePublicReservationDto,
    @Req() req: FastifyRequest,
  ) {
    return this.publicReservationsService.updatePublicReservationByToken(
      token,
      dto,
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Patch()
  @Throttle({
    default: { limit: 10, ttl: 60_000, blockDuration: 300_000 },
  })
  updateByHeader(
    @Headers('x-public-reservation-token') token: string,
    @Body() dto: UpdatePublicReservationDto,
    @Req() req: FastifyRequest,
  ) {
    return this.updateByToken(token, dto, req);
  }
}
