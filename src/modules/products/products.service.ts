import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { ProductStatus } from 'generated/prisma/client';
import { QueryProductsDto } from './dto/query-products.dto';

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  seller: {
    select: {
      id: true,
      userId: true,
      storeName: true,
      storeSlug: true,
      isVerified: true,
      positiveRating: true,
    },
  },
  images: { orderBy: { sortOrder: 'asc' as const } },
  colors: true,
  sizes: true,
  specifications: { orderBy: { sortOrder: 'asc' as const } },
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private formatProduct(product: any) {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      category: product.category?.name ?? null,
      categoryId: product.categoryId,
      brand: product.brand,
      description: product.description,
      price: Number(product.price),
      originalPrice: product.originalPrice
        ? Number(product.originalPrice)
        : null,
      discount: product.discount,
      stock: product.stock,
      sku: product.sku,
      status: product.status,
      featured: product.featured,
      trending: product.trending,
      badge: product.badge,
      ratingAverage: product.ratingAverage,
      reviewCount: product.reviewCount,
      // Frontend-compatible aliases
      rating: product.ratingAverage,
      reviews: product.reviewCount,
      image:
        (product.images ?? []).find((img: any) => img.isPrimary)?.url ??
        (product.images ?? [])[0]?.url ??
        null,
      seller: product.seller ?? null,
      images: (product.images ?? []).map((img: any) => ({
        id: img.id,
        url: img.url,
        alt: img.alt,
        isPrimary: img.isPrimary,
        sortOrder: img.sortOrder,
      })),
      colors: (product.colors ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        hexCode: c.hexCode,
      })),
      sizes: (product.sizes ?? []).map((s: any) => s.value),
      specifications: (product.specifications ?? []).map((sp: any) => ({
        key: sp.key,
        value: sp.value,
      })),
      createdAt: product.createdAt,
    };
  }

  private buildOrderBy(sort?: string) {
    switch (sort) {
      case 'price_asc':
        return { price: 'asc' as const };
      case 'price_desc':
        return { price: 'desc' as const };
      case 'rating':
        return { ratingAverage: 'desc' as const };
      case 'popular':
        return { reviewCount: 'desc' as const };
      case 'newest':
      default:
        return { createdAt: 'desc' as const };
    }
  }

  async findAll(query: QueryProductsDto) {
    const {
      page,
      limit,
      category,
      brand,
      minPrice,
      maxPrice,
      rating,
      sort,
      search,
      featured,
      trending,
    } = query;
    const skip = (page - 1) * limit;

    const where: any = { status: ProductStatus.ACTIVE };

    if (category) {
      where.category = {
        OR: [
          { slug: category },
          { id: category },
          { name: { equals: category, mode: 'insensitive' } },
        ],
      };
    }

    if (brand) {
      where.brand = { contains: brand, mode: 'insensitive' };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    if (rating !== undefined) {
      where.ratingAverage = { gte: rating };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (featured !== undefined) where.featured = featured;
    if (trending !== undefined) where.trending = trending;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: this.buildOrderBy(sort),
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      products: products.map((p) => this.formatProduct(p)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findById(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, status: ProductStatus.ACTIVE },
      include: PRODUCT_INCLUDE,
    });

    if (!product) throw new NotFoundException('Product not found');

    return { product: this.formatProduct(product) };
  }

  async findRelated(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { categoryId: true, brand: true },
    });

    if (!product) throw new NotFoundException('Product not found');

    const products = await this.prisma.product.findMany({
      where: {
        id: { not: id },
        status: ProductStatus.ACTIVE,
        OR: [
          { categoryId: product.categoryId },
          ...(product.brand ? [{ brand: product.brand }] : []),
        ],
      },
      include: PRODUCT_INCLUDE,
      orderBy: { ratingAverage: 'desc' },
      take: 10,
    });

    return { products: products.map((p) => this.formatProduct(p)) };
  }
}
