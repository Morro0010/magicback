import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/dto/id-param.dto';
import { CustomersService } from './customers.service';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { UpdateBirthdayFollowUpDto } from './dto/update-birthday-follow-up.dto';
import { UpdateCustomerNotesDto } from './dto/update-customer-notes.dto';

@Controller('customers')
@Roles(UserRole.ADMIN)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  listCustomers(@Query() query: ListCustomersQueryDto) {
    return this.customersService.listCustomers(query);
  }

  @Get('birthdays/upcoming')
  listUpcomingBirthdays() {
    return this.customersService.listUpcomingBirthdays();
  }

  @Patch('birthday-follow-ups/:id')
  updateBirthdayFollowUp(
    @Param() params: IdParamDto,
    @Body() dto: UpdateBirthdayFollowUpDto,
  ) {
    return this.customersService.updateBirthdayFollowUp(params.id, dto);
  }

  @Get(':id')
  getCustomer(@Param() params: IdParamDto) {
    return this.customersService.getCustomerById(params.id);
  }

  @Patch(':id/notes')
  updateCustomerNotes(
    @Param() params: IdParamDto,
    @Body() dto: UpdateCustomerNotesDto,
  ) {
    return this.customersService.updateCustomerNotes(params.id, dto);
  }
}
