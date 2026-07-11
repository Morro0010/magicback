import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicPackages() {
    const packages = await this.prisma.package.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });

    return packages.map((pkg) => this.toResponse(pkg));
  }

  async getAllPackages() {
    const packages = await this.prisma.package.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return packages.map((pkg) => this.toResponse(pkg));
  }

  async createPackage(dto: CreatePackageDto) {
    const created = await this.prisma.package.create({
      data: {
        name: dto.name.trim(),
        description: dto.description.trim(),
        price: dto.price,
        featuresJson: dto.features,
        isActive: dto.isActive ?? true,
      },
    });

    return this.toResponse(created);
  }

  async updatePackage(id: string, dto: UpdatePackageDto) {
    const existing = await this.prisma.package.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Package not found');
    }

    const updated = await this.prisma.package.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        price: dto.price,
        featuresJson: dto.features,
        isActive: dto.isActive,
      },
    });

    return this.toResponse(updated);
  }

  private toResponse(pkg: {
    id: string;
    name: string;
    description: string;
    price: { toNumber: () => number };
    featuresJson: unknown;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      price: pkg.price.toNumber(),
      features: Array.isArray(pkg.featuresJson) ? pkg.featuresJson : [],
      isActive: pkg.isActive,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
    };
  }
}
