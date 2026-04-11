import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { ContentModerationService } from './content-moderation.service';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderationService: ContentModerationService,
  ) {}

  private formatReview(review: any, currentUserId?: string) {
    const hasVoted = currentUserId 
      ? (review.helpfulVotes || []).some((v: any) => v.userId === currentUserId)
      : false;

    return {
      id: review.id,
      productId: review.productId,
      rating: review.rating,
      comment: review.comment,
      images: review.images ?? [],
      emoji: review.emoji ?? null,
      helpful: review.helpful,
      hasVoted,
      user: review.user
        ? {
            id: review.user.id,
            name: `${review.user.firstName} ${review.user.lastName}`,
            avatar: review.user.avatar,
          }
        : null,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      replies: (review.replies ?? []).map((reply: any) => ({
        id: reply.id,
        comment: reply.comment,
        images: reply.images ?? [],
        createdAt: reply.createdAt,
        user: reply.user
          ? {
              id: reply.user.id,
              name: `${reply.user.firstName} ${reply.user.lastName}`,
              avatar: reply.user.avatar,
            }
          : null,
      })),
    };
  }

  async getProductReviews(productId: string, query: PaginationDto, userId?: string) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, ratingAverage: true, reviewCount: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          helpfulVotes: userId ? { where: { userId } } : false,
          replies: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, avatar: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.review.count({ where: { productId } }),
    ]);

    // Rating breakdown
    const breakdown = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { productId },
      _count: { rating: true },
    });

    const ratingBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const b of breakdown) {
      ratingBreakdown[b.rating] = b._count.rating;
    }

    const totalPages = Math.ceil(total / limit);

    return {
      reviews: reviews.map((r) => this.formatReview(r, userId)),
      total,
      page,
      limit,
      totalPages,
      summary: {
        ratingAverage: product.ratingAverage,
        reviewCount: product.reviewCount,
        breakdown: ratingBreakdown,
      },
    };
  }

  async createReview(userId: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    // Verify user has a delivered order containing this product
    const deliveredOrder = await this.prisma.order.findFirst({
      where: {
        userId,
        status: 'DELIVERED',
        items: { some: { productId: dto.productId } },
      },
    });
    if (!deliveredOrder) {
      throw new BadRequestException(
        'You can only review products you have purchased and received',
      );
    }

    const existing = await this.prisma.review.findUnique({
      where: { productId_userId: { productId: dto.productId, userId } },
    });
    if (existing) throw new BadRequestException('You have already reviewed this product');

    if (dto.comment) {
      const modResult = await this.moderationService.moderate(dto.comment);
      if (!modResult.allowed) {
        throw new BadRequestException(
          `Bình luận vi phạm tiêu chuẩn cộng đồng: ${modResult.label}`,
        );
      }
    }

    const review = await this.prisma.review.create({
      data: {
        productId: dto.productId,
        userId,
        rating: dto.rating,
        comment: dto.comment ?? null,
        images: dto.images ?? [],
        emoji: dto.emoji ?? null,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
    });

    await this.updateProductRating(dto.productId);

    return { review: this.formatReview(review, userId) };
  }

  async updateReview(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId) throw new ForbiddenException('Not your review');

    if (dto.comment) {
      const modResult = await this.moderationService.moderate(dto.comment);
      if (!modResult.allowed) {
        throw new BadRequestException(
          `Bình luận vi phạm tiêu chuẩn cộng đồng: ${modResult.label}`,
        );
      }
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.comment !== undefined && { comment: dto.comment }),
        ...(dto.images !== undefined && { images: dto.images }),
        ...(dto.emoji !== undefined && { emoji: dto.emoji }),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
    });

    await this.updateProductRating(review.productId);

    return { review: this.formatReview(updated, userId) };
  }

  async deleteReview(userId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId) throw new ForbiddenException('Not your review');

    await this.prisma.review.delete({ where: { id: reviewId } });

    await this.updateProductRating(review.productId);

    return {};
  }

  async checkUserReview(userId: string, productId: string) {
    const review = await this.prisma.review.findUnique({
      where: { productId_userId: { productId, userId } },
    });

    const canReview = !review
      ? !!(await this.prisma.order.findFirst({
          where: {
            userId,
            status: 'DELIVERED',
            items: { some: { productId } },
          },
        }))
      : false;

    return { review: review ? this.formatReview(review, userId) : null, canReview };
  }

  private async updateProductRating(productId: string) {
    const result = await this.prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await this.prisma.product.update({
      where: { id: productId },
      data: {
        ratingAverage: result._avg.rating ?? 0,
        reviewCount: result._count.rating,
      },
    });
  }

  async createReply(userId: string, reviewId: string, dto: CreateReplyDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { product: true },
    });
    if (!review) throw new NotFoundException('Review not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Mọi người dùng đã đăng nhập đều có thể phản hồi đánh giá công khai

    const modResult = await this.moderationService.moderate(dto.comment);
    if (!modResult.allowed) {
      throw new BadRequestException(
        `Phản hồi vi phạm tiêu chuẩn cộng đồng: ${modResult.label}`,
      );
    }

    const reply = await this.prisma.reviewReply.create({
      data: {
        reviewId,
        userId,
        comment: dto.comment,
        images: dto.images ?? [],
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
    });

    return {
      reply: {
        id: reply.id,
        comment: reply.comment,
        images: reply.images || [],
        createdAt: reply.createdAt,
        user: {
          id: reply.user.id,
          name: `${reply.user.firstName} ${reply.user.lastName}`,
          avatar: reply.user.avatar,
        },
      },
    };
  }

  async createHelpfulVote(userId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');

    const existing = await this.prisma.reviewHelpful.findUnique({
      where: { reviewId_userId: { reviewId, userId } },
    });

    if (existing) {
      // Toggle OFF: Remove vote
      await this.prisma.$transaction([
        this.prisma.reviewHelpful.delete({
          where: { id: existing.id },
        }),
        this.prisma.review.update({
          where: { id: reviewId },
          data: { helpful: { decrement: 1 } },
        }),
      ]);
      return { success: true, voted: false };
    } else {
      // Toggle ON: Add vote
      await this.prisma.$transaction([
        this.prisma.reviewHelpful.create({
          data: { reviewId, userId },
        }),
        this.prisma.review.update({
          where: { id: reviewId },
          data: { helpful: { increment: 1 } },
        }),
      ]);
      return { success: true, voted: true };
    }
  }
}
