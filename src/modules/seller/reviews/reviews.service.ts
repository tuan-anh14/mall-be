import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class SellerReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getSellerProfile(userId: string) {
    let profile = await this.prisma.sellerProfile.findUnique({ where: { userId } });
    if (!profile) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user && user.userType === 'SELLER') {
        const base = `${user.firstName} ${user.lastName}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 30);
        profile = await this.prisma.sellerProfile.create({
          data: {
            userId: user.id,
            storeName: `${user.firstName} ${user.lastName}'s Store`,
            storeSlug: `${base}-${user.id.slice(-8)}`,
          },
        });
      } else {
        throw new ForbiddenException('Seller profile not found');
      }
    }
    return profile;
  }

  async getReviews(userId: string, productId?: string, page = 1, limit = 20) {
    const profile = await this.getSellerProfile(userId);
    const skip = (page - 1) * limit;

    const productWhere = productId
      ? { id: productId, sellerId: profile.id }
      : { sellerId: profile.id };

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { product: productWhere },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              images: {
                where: { isPrimary: true },
                take: 1,
                select: { url: true },
              },
            },
          },
        },
      }),
      this.prisma.review.count({ where: { product: productWhere } }),
    ]);

    return { reviews, total, page, limit };
  }

  async getProductReviews(userId: string, productId: string, page = 1, limit = 20) {
    const profile = await this.getSellerProfile(userId);

    // Verify the product belongs to this seller
    const product = await this.prisma.product.findFirst({
      where: { id: productId, sellerId: profile.id },
      select: { id: true, name: true, ratingAverage: true, reviewCount: true },
    });
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại');

    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
        },
      }),
      this.prisma.review.count({ where: { productId } }),
    ]);

    return { product, reviews, total, page, limit };
  }

  async deleteReview(userId: string, reviewId: string) {
    const profile = await this.getSellerProfile(userId);

    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        product: { select: { sellerId: true, id: true } },
      },
    });
    if (!review) throw new NotFoundException('Review không tồn tại');
    if (review.product.sellerId !== profile.id) {
      throw new ForbiddenException('Bạn không có quyền xóa review này');
    }

    const productId = review.product.id;
    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: reviewId } });
      const agg = await tx.review.aggregate({
        where: { productId },
        _avg: { rating: true },
        _count: { rating: true },
      });
      await tx.product.update({
        where: { id: productId },
        data: {
          ratingAverage: agg._avg.rating ?? 0,
          reviewCount: agg._count.rating,
        },
      });
    });

    return { message: 'Đã xóa review' };
  }
}
