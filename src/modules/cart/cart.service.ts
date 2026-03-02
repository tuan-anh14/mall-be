import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { CouponType, ProductStatus } from 'generated/prisma/client';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

const CART_ITEM_INCLUDE = {
  product: {
    include: {
      images: {
        where: { isPrimary: true },
        take: 1,
      },
      colors: true,
      sizes: true,
    },
  },
};

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  private formatCartItem(item: any) {
    const product = item.product;
    return {
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      selectedColor: item.selectedColor,
      selectedSize: item.selectedSize,
      product: {
        id: product.id,
        name: product.name,
        price: Number(product.price),
        originalPrice: product.originalPrice ? Number(product.originalPrice) : null,
        discount: product.discount,
        stock: product.stock,
        status: product.status,
        badge: product.badge,
        image: product.images?.[0]?.url ?? null,
        colors: (product.colors ?? []).map((c: any) => ({ id: c.id, name: c.name, hexCode: c.hexCode })),
        sizes: (product.sizes ?? []).map((s: any) => s.value),
      },
    };
  }

  private buildCartSummary(items: any[], couponDiscount = 0) {
    const subtotal = items.reduce((sum, item) => {
      return sum + Number(item.product.price) * item.quantity;
    }, 0);

    const discount = couponDiscount;
    const total = Math.max(0, subtotal - discount);

    return {
      items: items.map((item) => this.formatCartItem(item)),
      subtotal: Number(subtotal.toFixed(2)),
      discount: Number(discount.toFixed(2)),
      total: Number(total.toFixed(2)),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  async getCart(userId: string) {
    const items = await this.prisma.cartItem.findMany({
      where: { userId },
      include: CART_ITEM_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    return { cart: this.buildCartSummary(items) };
  }

  async addItem(userId: string, dto: AddToCartDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, status: ProductStatus.ACTIVE },
    });

    if (!product) throw new NotFoundException('Product not found or unavailable');
    if (product.stock < dto.quantity) {
      throw new BadRequestException(`Only ${product.stock} items in stock`);
    }

    // Check if same combination already exists in cart
    const existing = await this.prisma.cartItem.findFirst({
      where: {
        userId,
        productId: dto.productId,
        selectedColor: dto.color ?? null,
        selectedSize: dto.size ?? null,
      },
    });

    if (existing) {
      const newQty = existing.quantity + dto.quantity;
      if (newQty > product.stock) {
        throw new BadRequestException(`Only ${product.stock} items in stock`);
      }
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: newQty },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          userId,
          productId: dto.productId,
          quantity: dto.quantity,
          selectedColor: dto.color ?? null,
          selectedSize: dto.size ?? null,
        },
      });
    }

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, userId },
      include: { product: true },
    });

    if (!item) throw new NotFoundException('Cart item not found');
    if (dto.quantity > item.product.stock) {
      throw new BadRequestException(`Only ${item.product.stock} items in stock`);
    }

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, userId },
    });

    if (!item) throw new NotFoundException('Cart item not found');

    await this.prisma.cartItem.delete({ where: { id: itemId } });

    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    await this.prisma.cartItem.deleteMany({ where: { userId } });
    return {};
  }

  async applyCoupon(userId: string, code: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!coupon || !coupon.isActive) {
      throw new BadRequestException('Invalid or expired coupon code');
    }

    const now = new Date();
    if (now < coupon.validFrom) {
      throw new BadRequestException('Coupon is not yet valid');
    }
    if (coupon.validUntil && now > coupon.validUntil) {
      throw new BadRequestException('Coupon has expired');
    }
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    // Check if user already used this coupon
    const alreadyUsed = await this.prisma.couponUsage.findFirst({
      where: { couponId: coupon.id, userId },
    });
    if (alreadyUsed) {
      throw new BadRequestException('You have already used this coupon');
    }

    // Get cart to calculate discount
    const items = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { product: true },
    });

    if (items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.product.price) * item.quantity,
      0,
    );

    if (coupon.minOrderAmount && subtotal < Number(coupon.minOrderAmount)) {
      throw new BadRequestException(
        `Minimum order amount is $${Number(coupon.minOrderAmount).toFixed(2)}`,
      );
    }

    let discount = 0;
    if (coupon.type === CouponType.PERCENTAGE) {
      discount = (subtotal * Number(coupon.value)) / 100;
      if (coupon.maxDiscount) {
        discount = Math.min(discount, Number(coupon.maxDiscount));
      }
    } else {
      discount = Number(coupon.value);
    }

    discount = Math.min(discount, subtotal);

    const fullItems = await this.prisma.cartItem.findMany({
      where: { userId },
      include: CART_ITEM_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    return {
      discount: Number(discount.toFixed(2)),
      coupon: {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: Number(coupon.value),
      },
      cart: this.buildCartSummary(fullItems, discount),
    };
  }
}
