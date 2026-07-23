import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';

export const REVIEW_RATING_FIELDS = [
  'cumplimientoHorarioServicio',
  'amabilidadDisponibilidadStaff',
  'lugarLimpio',
  'calidadProductosServicio',
  'instalacionAdecuadaFiestas',
  'comidaTiempoForma',
  'recomendariaMagicCity',
  'satisfaccionGeneral',
] as const;

export type ReviewRatingField = (typeof REVIEW_RATING_FIELDS)[number];

export const REVIEW_CATEGORY_LABELS: Record<ReviewRatingField, string> = {
  cumplimientoHorarioServicio: 'Cumplimiento de horario y servicio',
  amabilidadDisponibilidadStaff: 'Amabilidad / disponibilidad del staff',
  lugarLimpio: 'Lugar limpio',
  calidadProductosServicio: 'Calidad de los productos / servicio',
  instalacionAdecuadaFiestas: 'Instalación adecuada para fiestas',
  comidaTiempoForma: 'La comida llegó en tiempo y forma',
  recomendariaMagicCity: 'Recomendaría Magic City',
  satisfaccionGeneral: 'Grado de satisfacción general de Magic City',
};

const capturedByUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

type ReviewWithUser = Prisma.CustomerReviewGetPayload<{
  include: { capturedByUser: { select: typeof capturedByUserSelect } };
}>;

type ReviewRatingValues = Record<ReviewRatingField, number>;

export function calculateReviewAverage(ratings: ReviewRatingValues) {
  const total = REVIEW_RATING_FIELDS.reduce(
    (sum, field) => sum + ratings[field],
    0,
  );
  return Math.round((total / REVIEW_RATING_FIELDS.length) * 100) / 100;
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === 'number' ? value : value.toNumber();
}

function parseDateBoundary(
  value: string | undefined,
  boundary: 'start' | 'end',
) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  if (value.length === 10 && boundary === 'end') {
    date.setHours(23, 59, 59, 999);
  }

  return date;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async createReview(
    dto: CreateReviewDto,
    actor: { id: string; ipAddress?: string; userAgent?: string },
  ) {
    const customerName = dto.customerName.trim();
    if (!customerName) {
      throw new BadRequestException('Nombre del cliente requerido');
    }

    const ratings = this.pickRatings(dto);
    const averageRating = calculateReviewAverage(ratings);

    const review = await this.prisma.customerReview.create({
      data: {
        customerName,
        ...ratings,
        recommendations: dto.recommendations?.trim() || null,
        averageRating: averageRating.toFixed(2),
        metadataJson: {
          captureSurface: 'review_tablet',
          ipAddress: actor.ipAddress ?? null,
          userAgent: actor.userAgent ?? null,
        },
        capturedByUserId: actor.id,
      },
      include: {
        capturedByUser: {
          select: capturedByUserSelect,
        },
      },
    });

    return this.toResponse(review);
  }

  async listReviews(query: ListReviewsQueryDto = {}) {
    this.assertAverageRange(query);

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where = this.buildWhere(query);

    const [total, reviews] = await this.prisma.$transaction([
      this.prisma.customerReview.count({ where }),
      this.prisma.customerReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          capturedByUser: {
            select: capturedByUserSelect,
          },
        },
      }),
    ]);

    return {
      page,
      limit,
      total,
      items: reviews.map((review) => this.toResponse(review)),
    };
  }

  async getReviewById(id: string) {
    const review = await this.prisma.customerReview.findUnique({
      where: { id },
      include: {
        capturedByUser: {
          select: capturedByUserSelect,
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Reseña no encontrada');
    }

    return this.toResponse(review);
  }

  async getSummary(query: ListReviewsQueryDto = {}) {
    this.assertAverageRange(query);
    const where = this.buildWhere(query);

    const [total, aggregate, latestReviews] = await this.prisma.$transaction([
      this.prisma.customerReview.count({ where }),
      this.prisma.customerReview.aggregate({
        where,
        _avg: {
          averageRating: true,
          cumplimientoHorarioServicio: true,
          amabilidadDisponibilidadStaff: true,
          lugarLimpio: true,
          calidadProductosServicio: true,
          instalacionAdecuadaFiestas: true,
          comidaTiempoForma: true,
          recomendariaMagicCity: true,
          satisfaccionGeneral: true,
        },
      }),
      this.prisma.customerReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          capturedByUser: {
            select: capturedByUserSelect,
          },
        },
      }),
    ]);

    const categoryAverages = REVIEW_RATING_FIELDS.map((field) => ({
      key: field,
      label: REVIEW_CATEGORY_LABELS[field],
      average: decimalToNumber(aggregate._avg[field]) ?? 0,
    }));
    const rankedCategories = [...categoryAverages]
      .filter((category) => category.average > 0)
      .sort((a, b) => b.average - a.average);

    return {
      totalReviews: total,
      averageRating: decimalToNumber(aggregate._avg.averageRating) ?? 0,
      categoryAverages,
      bestCategory: rankedCategories[0] ?? null,
      lowestCategory: rankedCategories[rankedCategories.length - 1] ?? null,
      latestReviews: latestReviews.map((review) => this.toResponse(review)),
    };
  }

  private pickRatings(
    dto: Pick<CreateReviewDto, ReviewRatingField>,
  ): ReviewRatingValues {
    return REVIEW_RATING_FIELDS.reduce((ratings, field) => {
      ratings[field] = dto[field];
      return ratings;
    }, {} as ReviewRatingValues);
  }

  private buildWhere(
    query: ListReviewsQueryDto,
  ): Prisma.CustomerReviewWhereInput {
    return {
      customerName: query.search
        ? {
            contains: query.search.trim(),
            mode: 'insensitive',
          }
        : undefined,
      createdAt:
        query.from || query.to
          ? {
              gte: parseDateBoundary(query.from, 'start'),
              lte: parseDateBoundary(query.to, 'end'),
            }
          : undefined,
      averageRating:
        query.minAverage || query.maxAverage
          ? {
              gte: query.minAverage,
              lte: query.maxAverage,
            }
          : undefined,
    };
  }

  private assertAverageRange(query: ListReviewsQueryDto) {
    if (
      query.minAverage &&
      query.maxAverage &&
      query.minAverage > query.maxAverage
    ) {
      throw new BadRequestException(
        'El promedio mínimo no puede ser mayor al máximo',
      );
    }
  }

  private toResponse(review: ReviewWithUser) {
    const ratings = this.pickRatings(review);

    return {
      id: review.id,
      customerName: review.customerName,
      ratings,
      recommendations: review.recommendations,
      averageRating: decimalToNumber(review.averageRating) ?? 0,
      capturedByUser: review.capturedByUser,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }
}
