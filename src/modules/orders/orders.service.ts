import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import {
  CouponType,
  OrderStatus,
  TrackingStatus,
} from 'generated/prisma/client';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';

const ORDER_INCLUDE = {
  items: {
    include: {
      product: {
        include: {
          images: { where: { isPrimary: true }, take: 1 },
        },
      },
    },
  },
  trackingSteps: { orderBy: { sortOrder: 'asc' as const } },
};

const TRACKING_STEPS = [
  { status: TrackingStatus.ORDERED, label: 'Order Placed', sortOrder: 0 },
  { status: TrackingStatus.CONFIRMED, label: 'Confirmed', sortOrder: 1 },
  { status: TrackingStatus.SHIPPED, label: 'Shipped', sortOrder: 2 },
  { status: TrackingStatus.OUT_FOR_DELIVERY, label: 'Out for Delivery', sortOrder: 3 },
  { status: TrackingStatus.DELIVERED, label: 'Delivered', sortOrder: 4 },
];

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private generateOrderId(): string {
    const year = new Date().getFullYear();
    const seq = String(Math.floor(100000 + Math.random() * 900000));
    return `ORD-${year}-${seq}`;
  }

  private formatOrder(order: any) {
    const currentStep = order.trackingSteps?.find((s: any) => s.isCurrent);

    return {
      id: order.id,
      date: order.createdAt,
      status: order.status,
      subtotal: Number(order.subtotal),
      shippingCost: Number(order.shippingCost),
      tax: Number(order.tax),
      total: Number(order.total),
      couponCode: order.couponCode,
      couponDiscount: order.couponDiscount ? Number(order.couponDiscount) : null,
      paymentMethod: order.paymentMethod,
      paymentRef: order.paymentRef,
      shippingAddress: {
        fullName: `${order.shippingFirstName} ${order.shippingLastName}`,
        firstName: order.shippingFirstName,
        lastName: order.shippingLastName,
        email: order.shippingEmail,
        phone: order.shippingPhone,
        street: order.shippingStreet,
        city: order.shippingCity,
        state: order.shippingState,
        zip: order.shippingZip,
        country: order.shippingCountry,
      },
      estimatedDelivery: order.estimatedDelivery,
      notes: order.notes,
      items: (order.items ?? []).map((item: any) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        price: Number(item.price),
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        productName: item.productName,
        productImage: item.productImage,
        product: item.product
          ? {
              id: item.product.id,
              name: item.product.name,
              price: Number(item.product.price),
              image: item.product.images?.[0]?.url ?? null,
              status: item.product.status,
            }
          : null,
      })),
      tracking: {
        current: currentStep?.status ?? order.status,
        steps: (order.trackingSteps ?? []).map((step: any) => ({
          status: step.status,
          label: step.label,
          description: step.description,
          date: step.completedAt,
          completed: step.isCompleted,
          isCurrent: step.isCurrent,
        })),
      },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  async getOrders(userId: string, query: QueryOrdersDto) {
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (status) where.status = status as OrderStatus;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      orders: orders.map((o) => this.formatOrder(o)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getOrderById(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: ORDER_INCLUDE,
    });

    if (!order) throw new NotFoundException('Order not found');

    return { order: this.formatOrder(order) };
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        shippingAddresses: dto.addressId
          ? { where: { id: dto.addressId } }
          : undefined,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    // Resolve shipping address
    let shipping: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string | null;
      street: string;
      city: string;
      state: string;
      zip: string;
      country: string;
    };

    if (dto.addressId) {
      const addr = user.shippingAddresses?.[0];
      if (!addr) throw new NotFoundException('Shipping address not found');
      shipping = {
        firstName: addr.firstName,
        lastName: addr.lastName,
        email: user.email,
        phone: addr.phone,
        street: addr.street,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        country: addr.country,
      };
    } else if (dto.shippingAddress) {
      shipping = {
        firstName: dto.shippingAddress.firstName,
        lastName: dto.shippingAddress.lastName,
        email: dto.shippingAddress.email,
        phone: dto.shippingAddress.phone,
        street: dto.shippingAddress.street,
        city: dto.shippingAddress.city,
        state: dto.shippingAddress.state,
        zip: dto.shippingAddress.zip,
        country: dto.shippingAddress.country ?? 'United States',
      };
    } else {
      throw new BadRequestException('Shipping address is required');
    }

    // Resolve order items (from cart or from dto)
    let rawItems: Array<{
      productId: string;
      quantity: number;
      selectedColor?: string | null;
      selectedSize?: string | null;
    }>;

    if (dto.items && dto.items.length > 0) {
      rawItems = dto.items;
    } else {
      const cartItems = await this.prisma.cartItem.findMany({
        where: { userId },
      });
      if (cartItems.length === 0) throw new BadRequestException('Cart is empty');
      rawItems = cartItems.map((ci) => ({
        productId: ci.productId,
        quantity: ci.quantity,
        selectedColor: ci.selectedColor,
        selectedSize: ci.selectedSize,
      }));
    }

    // Load products and validate stock
    const productIds = rawItems.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { images: { where: { isPrimary: true }, take: 1 } },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of rawItems) {
      const product = productMap.get(item.productId);
      if (!product) throw new NotFoundException(`Product ${item.productId} not found`);
      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${product.name}". Available: ${product.stock}`,
        );
      }
    }

    // Calculate subtotal
    const subtotal = rawItems.reduce((sum, item) => {
      const product = productMap.get(item.productId)!;
      return sum + Number(product.price) * item.quantity;
    }, 0);

    // Apply coupon
    let coupon: any = null;
    let couponDiscount = 0;

    if (dto.couponCode) {
      coupon = await this.prisma.coupon.findUnique({
        where: { code: dto.couponCode.toUpperCase() },
      });

      if (!coupon || !coupon.isActive) {
        throw new BadRequestException('Invalid or expired coupon');
      }

      const now = new Date();
      if (now < coupon.validFrom || (coupon.validUntil && now > coupon.validUntil)) {
        throw new BadRequestException('Coupon is not valid at this time');
      }

      if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
        throw new BadRequestException('Coupon usage limit reached');
      }

      const alreadyUsed = await this.prisma.couponUsage.findFirst({
        where: { couponId: coupon.id, userId },
      });
      if (alreadyUsed) throw new BadRequestException('Coupon already used');

      if (coupon.minOrderAmount && subtotal < Number(coupon.minOrderAmount)) {
        throw new BadRequestException(
          `Minimum order amount is $${Number(coupon.minOrderAmount).toFixed(2)}`,
        );
      }

      if (coupon.type === CouponType.PERCENTAGE) {
        couponDiscount = (subtotal * Number(coupon.value)) / 100;
        if (coupon.maxDiscount) {
          couponDiscount = Math.min(couponDiscount, Number(coupon.maxDiscount));
        }
      } else {
        couponDiscount = Number(coupon.value);
      }
      couponDiscount = Math.min(couponDiscount, subtotal);
    }

    const shippingCost = 0;
    const tax = 0;
    const total = Math.max(0, subtotal - couponDiscount + shippingCost + tax);

    // Generate unique order ID
    let orderId = this.generateOrderId();
    while (await this.prisma.order.findUnique({ where: { id: orderId } })) {
      orderId = this.generateOrderId();
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          id: orderId,
          userId,
          status: OrderStatus.PENDING,
          subtotal,
          shippingCost,
          tax,
          total,
          couponId: coupon?.id ?? null,
          couponCode: coupon?.code ?? null,
          couponDiscount: couponDiscount > 0 ? couponDiscount : null,
          paymentMethod: dto.paymentMethod,
          paymentRef: dto.paymentRef ?? null,
          addressId: dto.addressId ?? null,
          shippingFirstName: shipping.firstName,
          shippingLastName: shipping.lastName,
          shippingEmail: shipping.email,
          shippingPhone: shipping.phone ?? null,
          shippingStreet: shipping.street,
          shippingCity: shipping.city,
          shippingState: shipping.state,
          shippingZip: shipping.zip,
          shippingCountry: shipping.country,
          notes: dto.notes ?? null,
        },
      });

      // Create order items
      await tx.orderItem.createMany({
        data: rawItems.map((item) => {
          const product = productMap.get(item.productId)!;
          return {
            orderId: created.id,
            productId: item.productId,
            quantity: item.quantity,
            price: Number(product.price),
            selectedColor: item.selectedColor ?? null,
            selectedSize: item.selectedSize ?? null,
            productName: product.name,
            productImage: product.images?.[0]?.url ?? null,
          };
        }),
      });

      // Create tracking steps
      await tx.orderTracking.createMany({
        data: TRACKING_STEPS.map((step) => ({
          orderId: created.id,
          status: step.status,
          label: step.label,
          sortOrder: step.sortOrder,
          isCompleted: step.sortOrder === 0,
          isCurrent: step.sortOrder === 0,
          completedAt: step.sortOrder === 0 ? new Date() : null,
        })),
      });

      // Decrement product stock
      for (const item of rawItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      // Increment coupon usage
      if (coupon) {
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { usageCount: { increment: 1 } },
        });
        await tx.couponUsage.create({
          data: { couponId: coupon.id, userId, orderId: created.id },
        });
      }

      // Always clear the user's cart after placing an order
      await tx.cartItem.deleteMany({ where: { userId } });

      return created.id;
    });

    const createdOrder = await this.prisma.order.findUniqueOrThrow({
      where: { id: order },
      include: ORDER_INCLUDE,
    });

    return { order: this.formatOrder(createdOrder) };
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    const cancellableStatuses: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
    ];
    if (!cancellableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Order cannot be cancelled in "${order.status}" status`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });

      // Restore product stock
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    });

    const updated = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    return { order: this.formatOrder(updated) };
  }
}
