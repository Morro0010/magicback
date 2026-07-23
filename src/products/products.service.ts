import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductCategory, ProductUnit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(query: ListProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const where: Prisma.ProductWhereInput = {
      category: query.category,
      isActive: query.isActive,
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { sku: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    if (query.lowStockOnly) {
      const lowStockWhere: Prisma.ProductWhereInput = {
        ...where,
        stockMin: { not: null },
        stockCurrent: { lte: this.prisma.product.fields.stockMin },
      };
      const [total, products] = await this.prisma.$transaction([
        this.prisma.product.count({ where: lowStockWhere }),
        this.prisma.product.findMany({
          where: lowStockWhere,
          orderBy: [{ stockCurrent: 'asc' }, { name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);

      return {
        page,
        limit,
        total,
        items: products.map((product) => this.toResponse(product)),
      };
    }

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      page,
      limit,
      total,
      items: products.map((product) => this.toResponse(product)),
    };
  }

  async getProductById(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return this.toResponse(product);
  }

  async createProduct(dto: CreateProductDto, actorUserId: string) {
    const created = await this.prisma.product.create({
      data: {
        name: dto.name.trim(),
        sku: dto.sku?.trim() || null,
        category: dto.category,
        description: dto.description?.trim() || null,
        salePrice: dto.salePrice,
        costPrice: dto.costPrice,
        stockCurrent: dto.stockCurrent,
        stockMin: dto.stockMin ?? null,
        isActive: dto.isActive ?? true,
        unit: dto.unit,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
    });

    return this.toResponse(created);
  }

  async updateProduct(id: string, dto: UpdateProductDto, actorUserId: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Producto no encontrado');
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        sku: dto.sku !== undefined ? dto.sku.trim() || null : undefined,
        category: dto.category,
        description:
          dto.description !== undefined
            ? dto.description.trim() || null
            : undefined,
        salePrice: dto.salePrice,
        costPrice: dto.costPrice,
        stockCurrent: dto.stockCurrent,
        stockMin: dto.stockMin !== undefined ? dto.stockMin : undefined,
        isActive: dto.isActive,
        unit: dto.unit,
        updatedByUserId: actorUserId,
      },
    });

    return this.toResponse(updated);
  }

  async setProductActive(id: string, isActive: boolean, actorUserId: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Producto no encontrado');
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        isActive,
        updatedByUserId: actorUserId,
      },
    });

    return this.toResponse(updated);
  }

  getProductCategoryOptions() {
    return Object.values(ProductCategory);
  }

  getProductUnitOptions() {
    return Object.values(ProductUnit);
  }

  private toResponse(product: {
    id: string;
    name: string;
    sku: string | null;
    category: ProductCategory;
    description: string | null;
    salePrice: { toNumber: () => number };
    costPrice: { toNumber: () => number };
    stockCurrent: number;
    stockMin: number | null;
    isActive: boolean;
    unit: ProductUnit;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      description: product.description,
      salePrice: product.salePrice.toNumber(),
      costPrice: product.costPrice.toNumber(),
      stockCurrent: product.stockCurrent,
      stockMin: product.stockMin,
      isActive: product.isActive,
      unit: product.unit,
      isLowStock:
        product.stockMin !== null && product.stockCurrent <= product.stockMin,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
