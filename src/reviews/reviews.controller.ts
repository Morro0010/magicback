import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/dto/id-param.dto';
import type { AuthenticatedRequest } from '../common/types/authenticated-request.type';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
@Roles(UserRole.ADMIN, UserRole.CASHIER)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  createReview(
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: { id: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviewsService.createReview(dto, {
      id: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  listReviews(@Query() query: ListReviewsQueryDto) {
    return this.reviewsService.listReviews(query);
  }

  @Get('summary')
  getSummary(@Query() query: ListReviewsQueryDto) {
    return this.reviewsService.getSummary(query);
  }

  @Get(':id')
  getReviewById(@Param() params: IdParamDto) {
    return this.reviewsService.getReviewById(params.id);
  }
}
