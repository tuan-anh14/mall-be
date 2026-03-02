import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  private formatItem(item: any) {
    const p = item.product;
    return {
      id: item.id,
      productId: item.productId,
      addedAt: item.createdAt,
      product: {
        id: p.id,
        name: p.name,
        price: Number(p.price),
        originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
        discount: p.discount,
        stock: p.stock,
        status: p.status,
        badge: p.badge,
        featured: p.featured,
        trending: p.trending,
        ratingAverage: p.ratingAverage,
        reviewCount: p.reviewCount,
        category: p.category?.name ?? null,
        brand: p.brand,
        image: p.images?.[0]?.url ?? null,
      },
    };
  }

  async getWishlist(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            category: { select: { id: true, name: true } },
            images: { where: { isPrimary: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { items: items.map((item) => this.formatItem(item)) };
  }

  async addItem(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const existing = await this.prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (existing) throw new BadRequestException('Product already in wishlist');

    await this.prisma.wishlistItem.create({ data: { userId, productId } });

    return this.getWishlist(userId);
  }

  async removeItem(userId: string, productId: string) {
    const item = await this.prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (!item) throw new NotFoundException('Wishlist item not found');

    await this.prisma.wishlistItem.delete({
      where: { userId_productId: { userId, productId } },
    });

    return this.getWishlist(userId);
  }

  async checkItem(userId: string, productId: string) {
    const item = await this.prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });

    return { inWishlist: !!item };
  }
}
