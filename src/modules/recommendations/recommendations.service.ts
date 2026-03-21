import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { ViewHistoryService } from '../view-history/view-history.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly viewHistoryService: ViewHistoryService,
  ) {}

  private formatProduct(p: any) {
    const allImages: string[] = (p.images ?? [])
      .map((img: any) => img.url)
      .filter(Boolean);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: Number(p.price),
      originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
      discount: p.discount,
      stock: p.stock,
      status: p.status,
      badge: p.badge,
      featured: p.featured,
      trending: p.trending,
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
    };
  }

  /**
   * Try calling the Python AI service for recommendations.
   * Returns null if unavailable (fallback to built-in logic).
   */
  private async callAiService(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<string[] | null> {
    const aiUrl =
      this.configService.get<string>('AI_SERVICE_URL') ||
      'http://localhost:8001';
    try {
      const response = await firstValueFrom(
        this.httpService.post<{ productIds: string[] }>(
          `${aiUrl}${endpoint}`,
          body,
          {
            timeout: 3000,
          },
        ),
      );
      return response.data?.productIds ?? null;
    } catch {
      // AI service unavailable — silently fall back
      return null;
    }
  }

  /**
   * Cấp 1: Content-based filtering using view history.
   */
  private async builtInRecommendations(
    userId: string,
    excludeIds: string[],
    limit: number,
  ): Promise<any[]> {
    const weighted = await this.viewHistoryService.getWeightedHistory(
      userId,
      20,
    );

    if (weighted.length === 0) {
      // No history → return featured/trending fallback
      const products = await this.prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ featured: true }, { trending: true }],
        },
        include: {
          images: { orderBy: { isPrimary: 'desc' } },
          category: { select: { id: true, name: true } },
          seller: {
            select: {
              id: true,
              storeName: true,
              storeSlug: true,
              userId: true,
            },
          },
        },
        take: limit,
        orderBy: { ratingAverage: 'desc' },
      });
      return products.map((p) => this.formatProduct(p));
    }

    // Aggregate top categories and brands by weighted score
    const categoryWeights = new Map<string, number>();
    const brandWeights = new Map<string, number>();
    for (const item of weighted) {
      if (item.categoryId) {
        categoryWeights.set(
          item.categoryId,
          (categoryWeights.get(item.categoryId) ?? 0) + item.weight,
        );
      }
      if (item.brand) {
        brandWeights.set(
          item.brand,
          (brandWeights.get(item.brand) ?? 0) + item.weight,
        );
      }
    }

    const topCategories = [...categoryWeights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);
    const topBrands = [...brandWeights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([brand]) => brand);

    const products = await this.prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        id: { notIn: excludeIds },
        OR: [
          { categoryId: { in: topCategories } },
          ...(topBrands.length > 0 ? [{ brand: { in: topBrands } }] : []),
        ],
      },
      include: {
        images: { orderBy: { isPrimary: 'desc' } },
        category: { select: { id: true, name: true } },
        seller: {
          select: { id: true, storeName: true, storeSlug: true, userId: true },
        },
      },
      orderBy: { ratingAverage: 'desc' },
      take: limit * 2,
    });

    return products.slice(0, limit).map((p) => this.formatProduct(p));
  }

  async getRecommendations(userId: string, limit: number) {
    // Get viewed product IDs to exclude them
    const history = await this.viewHistoryService.getWeightedHistory(
      userId,
      50,
    );
    const viewedIds = history.map((h) => h.productId);

    // Try AI service first (Cấp 2)
    const aiProductIds = await this.callAiService('/recommend', {
      userId,
      limit,
    });

    if (aiProductIds && aiProductIds.length > 0) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: aiProductIds }, status: 'ACTIVE' },
        include: {
          images: { orderBy: { isPrimary: 'desc' } },
          category: { select: { id: true, name: true } },
          seller: {
            select: {
              id: true,
              storeName: true,
              storeSlug: true,
              userId: true,
            },
          },
        },
      });

      // Preserve AI ordering
      const productMap = new Map(products.map((p) => [p.id, p]));
      const ordered = aiProductIds
        .map((id) => productMap.get(id))
        .filter(Boolean)
        .map((p) => this.formatProduct(p));

      if (ordered.length >= limit / 2) {
        return { products: ordered, source: 'ai' };
      }
    }

    // Fallback: Cấp 1 built-in
    const products = await this.builtInRecommendations(
      userId,
      viewedIds,
      limit,
    );
    return { products, source: 'builtin' };
  }

  async getSimilarProducts(productId: string, userId: string, limit: number) {
    // Try AI service first
    const aiProductIds = await this.callAiService('/similar', {
      productId,
      limit,
    });

    if (aiProductIds && aiProductIds.length > 0) {
      const products = await this.prisma.product.findMany({
        where: {
          id: { in: aiProductIds },
          status: 'ACTIVE',
        },
        include: {
          images: { orderBy: { isPrimary: 'desc' } },
          category: { select: { id: true, name: true } },
          seller: {
            select: {
              id: true,
              storeName: true,
              storeSlug: true,
              userId: true,
            },
          },
        },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));
      const ordered = aiProductIds
        .filter((id) => id !== productId)
        .map((id) => productMap.get(id))
        .filter(Boolean)
        .map((p) => this.formatProduct(p));

      if (ordered.length > 0) {
        return { products: ordered, source: 'ai' };
      }
    }

    // Fallback: same category + brand content-based
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { categoryId: true, brand: true },
    });

    if (!product) return { products: [], source: 'builtin' };

    const similar = await this.prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        id: { not: productId },
        OR: [
          { categoryId: product.categoryId },
          ...(product.brand ? [{ brand: product.brand }] : []),
        ],
      },
      include: {
        images: { orderBy: { isPrimary: 'desc' } },
        category: { select: { id: true, name: true } },
        seller: {
          select: { id: true, storeName: true, storeSlug: true, userId: true },
        },
      },
      orderBy: { ratingAverage: 'desc' },
      take: limit,
    });

    return {
      products: similar.map((p) => this.formatProduct(p)),
      source: 'builtin',
    };
  }
}
