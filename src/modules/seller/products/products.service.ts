import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { ProductStatus } from 'generated/prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const PRODUCT_INCLUDE = {
  category: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  colors: true,
  sizes: true,
  specifications: { orderBy: { sortOrder: 'asc' as const } },
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getSellerProfile(userId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Seller profile not found');
    return profile;
  }

  private handlePrismaError(error: any): never {
    if (error?.code === 'P2002') {
      throw new ConflictException('A product with this SKU already exists');
    }
    throw error;
  }

  private generateSlug(name: string, suffix: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return `${base}-${suffix}`;
  }

  private formatProduct(product: any) {
    return {
      id: product.id,
      name: product.name,
      category: product.category
        ? { id: product.category.id, name: product.category.name }
        : null,
      price: Number(product.price),
      originalPrice: product.originalPrice ? Number(product.originalPrice) : null,
      discount: product.discount,
      stock: product.stock,
      sku: product.sku,
      brand: product.brand,
      description: product.description,
      status: product.status,
      featured: product.featured,
      trending: product.trending,
      ratingAverage: product.ratingAverage,
      reviewCount: product.reviewCount,
      images: (product.images ?? []).map((img: any) => ({
        id: img.id,
        url: img.url,
        isPrimary: img.isPrimary,
        sortOrder: img.sortOrder,
      })),
      colors: (product.colors ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        hexCode: c.hexCode,
      })),
      sizes: (product.sizes ?? []).map((s: any) => ({
        id: s.id,
        value: s.value,
      })),
      specifications: (product.specifications ?? []).map((sp: any) => ({
        id: sp.id,
        key: sp.key,
        value: sp.value,
      })),
      createdAt: product.createdAt,
    };
  }

  async list(userId: string, search?: string) {
    const profile = await this.getSellerProfile(userId);
    const sellerId = profile.id;

    const where: any = { sellerId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [products, total, inStock, lowStock, outOfStock] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where: { sellerId } }),
      this.prisma.product.count({ where: { sellerId, stock: { gt: 0 } } }),
      this.prisma.product.count({ where: { sellerId, stock: { gte: 1, lte: 10 } } }),
      this.prisma.product.count({ where: { sellerId, stock: 0 } }),
    ]);

    return {
      data: products.map((p) => this.formatProduct(p)),
      stats: { total, inStock, lowStock, outOfStock },
    };
  }

  async create(userId: string, dto: CreateProductDto) {
    const profile = await this.getSellerProfile(userId);
    const sellerId = profile.id;

    const discount =
      dto.originalPrice && dto.price < dto.originalPrice
        ? Math.round((1 - dto.price / dto.originalPrice) * 100)
        : null;

    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const slug = this.generateSlug(dto.name, suffix);

    const productId = await this.prisma
      .$transaction(async (tx) => {
        const newProduct = await tx.product.create({
          data: {
            sellerId,
            categoryId: dto.categoryId,
            name: dto.name,
            slug,
            description: dto.description,
            price: dto.price,
            originalPrice: dto.originalPrice,
            discount,
            stock: dto.stock,
            sku: dto.sku,
            brand: dto.brand,
            featured: dto.featured ?? false,
            trending: dto.trending ?? false,
            status: dto.stock === 0 ? ProductStatus.OUT_OF_STOCK : ProductStatus.ACTIVE,
          },
        });

        if (dto.images?.length) {
          await tx.productImage.createMany({
            data: dto.images.map((url, index) => ({
              productId: newProduct.id,
              url,
              isPrimary: index === 0,
              sortOrder: index,
            })),
          });
        }

        if (dto.colors?.length) {
          await tx.productColor.createMany({
            data: dto.colors.map((name) => ({ productId: newProduct.id, name })),
          });
        }

        if (dto.sizes?.length) {
          await tx.productSize.createMany({
            data: dto.sizes.map((value) => ({ productId: newProduct.id, value })),
          });
        }

        if (dto.specifications?.length) {
          await tx.productSpecification.createMany({
            data: dto.specifications.map((s, index) => ({
              productId: newProduct.id,
              key: s.key,
              value: s.value,
              sortOrder: index,
            })),
          });
        }

        return newProduct.id;
      })
      .catch((err) => this.handlePrismaError(err));

    const created = await this.prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: PRODUCT_INCLUDE,
    });

    return { success: true, product: this.formatProduct(created) };
  }

  async update(userId: string, productId: string, dto: UpdateProductDto) {
    const profile = await this.getSellerProfile(userId);

    const existing = await this.prisma.product.findFirst({
      where: { id: productId, sellerId: profile.id },
    });
    if (!existing) throw new NotFoundException('Product not found');

    await this.prisma
      .$transaction(async (tx) => {
        const data: any = {};

        if (dto.name !== undefined) {
          data.name = dto.name;
          data.slug = this.generateSlug(dto.name, existing.id.slice(-8));
        }
        if (dto.description !== undefined) data.description = dto.description;
        if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
        if (dto.price !== undefined) data.price = dto.price;
        if (dto.originalPrice !== undefined) data.originalPrice = dto.originalPrice;
        if (dto.stock !== undefined) data.stock = dto.stock;
        if (dto.sku !== undefined) data.sku = dto.sku;
        if (dto.brand !== undefined) data.brand = dto.brand;
        if (dto.featured !== undefined) data.featured = dto.featured;
        if (dto.trending !== undefined) data.trending = dto.trending;
        if (dto.status !== undefined) data.status = dto.status;

        // Auto-compute discount when price fields change
        const finalPrice = dto.price ?? Number(existing.price);
        const finalOriginalPrice =
          dto.originalPrice ?? (existing.originalPrice ? Number(existing.originalPrice) : null);
        if (finalOriginalPrice && finalPrice < finalOriginalPrice) {
          data.discount = Math.round((1 - finalPrice / finalOriginalPrice) * 100);
        } else if (dto.price !== undefined || dto.originalPrice !== undefined) {
          data.discount = null;
        }

        // Auto-set status based on stock when status is not explicitly provided
        if (dto.stock !== undefined && dto.status === undefined) {
          data.status =
            dto.stock === 0
              ? ProductStatus.OUT_OF_STOCK
              : existing.status === ProductStatus.OUT_OF_STOCK
                ? ProductStatus.ACTIVE
                : existing.status;
        }

        await tx.product.update({ where: { id: productId }, data });

        if (dto.images !== undefined) {
          await tx.productImage.deleteMany({ where: { productId } });
          if (dto.images.length) {
            await tx.productImage.createMany({
              data: dto.images.map((url, index) => ({
                productId,
                url,
                isPrimary: index === 0,
                sortOrder: index,
              })),
            });
          }
        }

        if (dto.colors !== undefined) {
          await tx.productColor.deleteMany({ where: { productId } });
          if (dto.colors.length) {
            await tx.productColor.createMany({
              data: dto.colors.map((name) => ({ productId, name })),
            });
          }
        }

        if (dto.sizes !== undefined) {
          await tx.productSize.deleteMany({ where: { productId } });
          if (dto.sizes.length) {
            await tx.productSize.createMany({
              data: dto.sizes.map((value) => ({ productId, value })),
            });
          }
        }

        if (dto.specifications !== undefined) {
          await tx.productSpecification.deleteMany({ where: { productId } });
          if (dto.specifications.length) {
            await tx.productSpecification.createMany({
              data: dto.specifications.map((s, index) => ({
                productId,
                key: s.key,
                value: s.value,
                sortOrder: index,
              })),
            });
          }
        }
      })
      .catch((err) => this.handlePrismaError(err));

    const updated = await this.prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: PRODUCT_INCLUDE,
    });

    return { success: true, product: this.formatProduct(updated) };
  }

  async delete(userId: string, productId: string) {
    const profile = await this.getSellerProfile(userId);

    const existing = await this.prisma.product.findFirst({
      where: { id: productId, sellerId: profile.id },
    });
    if (!existing) throw new NotFoundException('Product not found');

    await this.prisma.product.delete({ where: { id: productId } });

    return { success: true, message: 'Product deleted successfully' };
  }
}
