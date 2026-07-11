import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/dto/id-param.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { SetProductActiveDto } from './dto/set-product-active.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  listProducts(@Query() query: ListProductsQueryDto) {
    return this.productsService.listProducts(query);
  }

  @Get('metadata/categories')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  getCategories() {
    return { items: this.productsService.getProductCategoryOptions() };
  }

  @Get('metadata/units')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  getUnits() {
    return { items: this.productsService.getProductUnitOptions() };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  getProduct(@Param() params: IdParamDto) {
    return this.productsService.getProductById(params.id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  createProduct(@Body() dto: CreateProductDto, @CurrentUser() user: { id: string }) {
    return this.productsService.createProduct(dto, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  updateProduct(
    @Param() params: IdParamDto,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.productsService.updateProduct(params.id, dto, user.id);
  }

  @Patch(':id/active')
  @Roles(UserRole.ADMIN)
  setActive(
    @Param() params: IdParamDto,
    @Body() body: SetProductActiveDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.productsService.setProductActive(params.id, body.isActive, user.id);
  }
}
