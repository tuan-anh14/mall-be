import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class ViewHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private formatItem(item: any) {
    const p = item.product;
    const allImages: string[] = (p.images ?? []).map((img: any) => img.url).filter(Boolean);
    return {
      id: item.id,
      productId: item.productId,
      viewCount: item.viewCount,
      lastViewedAt: item.lastViewedAt,
      product: {
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: Number(p.price),
        originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
        discount: p.discount,
        stock: p.stock,
        status: p.status,
        badge: p.badge,
        ratingAverage: p.ratingAverage,
        rating: p.ratingAverage,
        reviewCount: p.reviewCount,
        reviews: p.reviewCount,
        category: p.category?.name ?? null,
        categoryId: p.categoryId,
        brand: p.brand,
        image: allImages[0] ?? null,
        images: allImages,
        seller: p.seller
          ? {
              id: p.seller.id,
              storeName: p.seller.storeName,
              storeSlug: p.seller.storeSlug,
              userId: p.seller.userId,
            }
          : null,
      },
    };
  }

  async trackView(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    await this.prisma.productViewHistory.upsert({
      where: { userId_productId: { userId, productId } },
      update: {
        viewCount: { increment: 1 },
        lastViewedAt: new Date(),
      },
      create: { userId, productId },
    });

    return { success: true };
  }

  async getViewHistory(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.productViewHistory.findMany({
        where: { userId },
        include: {
          product: {
            include: {
              category: { select: { id: true, name: true } },
              images: { orderBy: { isPrimary: 'desc' } },
              seller: { select: { id: true, storeName: true, storeSlug: true, userId: true } },
            },
          },
        },
        orderBy: { lastViewedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.productViewHistory.count({ where: { userId } }),
    ]);

    return {
      items: items.map((item) => this.formatItem(item)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async removeFromHistory(userId: string, productId: string) {
    const item = await this.prisma.productViewHistory.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (!item) throw new NotFoundException('View history item not found');

    await this.prisma.productViewHistory.delete({
      where: { userId_productId: { userId, productId } },
    });

    return { success: true };
  }

  async clearHistory(userId: string) {
    await this.prisma.productViewHistory.deleteMany({ where: { userId } });
    return { success: true };
  }

  /**
   * Internal: Get raw view history records for recommendations engine.
   * Returns top N recently viewed items with weights.
   */
  async getWeightedHistory(userId: string, limit = 20) {
    const items = await this.prisma.productViewHistory.findMany({
      where: { userId },
      orderBy: { lastViewedAt: 'desc' },
      take: limit,
      select: {
        productId: true,
        viewCount: true,
        lastViewedAt: true,
        product: {
          select: {
            categoryId: true,
            brand: true,
          },
        },
      },
    });

    const now = Date.now();
    return items.map((item) => {
      const ageMs = now - item.lastViewedAt.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      // Recency score: 1.0 for today, decays over 30 days
      const recencyScore = Math.max(0, 1 - ageDays / 30);
      return {
        productId: item.productId,
        categoryId: item.product.categoryId,
        brand: item.product.brand,
        weight: item.viewCount * recencyScore,
      };
    });
  }
}
