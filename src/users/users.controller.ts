import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/dto/id-param.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getUsers() {
    return this.usersService.findAllVisible();
  }

  @Post()
  createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: { id: string },
    @Req() req: FastifyRequest,
  ) {
    return this.usersService.createUser(dto, {
      id: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch(':id')
  updateUser(
    @Param() params: IdParamDto,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: { id: string },
    @Req() req: FastifyRequest,
  ) {
    return this.usersService.updateUser(params.id, dto, {
      id: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch(':id/password')
  updateUserPassword(
    @Param() params: IdParamDto,
    @Body() dto: UpdateUserPasswordDto,
    @CurrentUser() user: { id: string },
    @Req() req: FastifyRequest,
  ) {
    return this.usersService.updateUserPassword(params.id, dto, {
      id: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete(':id')
  deactivateUser(
    @Param() params: IdParamDto,
    @CurrentUser() user: { id: string },
    @Req() req: FastifyRequest,
  ) {
    return this.usersService.deactivateUser(params.id, {
      id: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
