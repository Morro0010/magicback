import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PublicRoute } from '../common/decorators/public-route.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/dto/id-param.dto';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { PackagesService } from './packages.service';

@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Get('public')
  @PublicRoute()
  getPublicPackages() {
    return this.packagesService.getPublicPackages();
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  getAllPackages() {
    return this.packagesService.getAllPackages();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  createPackage(@Body() dto: CreatePackageDto) {
    return this.packagesService.createPackage(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  updatePackage(@Param() params: IdParamDto, @Body() dto: UpdatePackageDto) {
    return this.packagesService.updatePackage(params.id, dto);
  }
}
