import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { CalendarService } from './calendar.service';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  getCalendar(@Query() query: CalendarQueryDto) {
    return this.calendarService.getCalendar(query);
  }
}
