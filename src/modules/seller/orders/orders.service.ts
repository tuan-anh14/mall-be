import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { OrderStatus, TrackingStatus } from 'generated/prisma/client';

const STATUS_FILTER_MAP: Record<string, OrderStatus[]> = {
  Processing: [
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
  ],
  Shipped: [OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY],
  Delivered: [OrderStatus.DELIVERED],
};

const STATUS_DISPLAY_MAP: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'Processing',
  [OrderStatus.CONFIRMED]: 'Processing',
  [OrderStatus.PROCESSING]: 'Processing',
  [OrderStatus.SHIPPED]: 'Shipped',
  [OrderStatus.OUT_FOR_DELIVERY]: 'Shipped',
  [OrderStatus.DELIVERED]: 'Delivered',
  [OrderStatus.CANCELLED]: 'Cancelled',
  [OrderStatus.REFUNDED]: 'Refunded',
};

const STATUS_UPDATE_MAP: Record<string, OrderStatus> = {
  Processing: OrderStatus.PROCESSING,
  Shipped: OrderStatus.SHIPPED,
  Delivered: OrderStatus.DELIVERED,
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private async getSellerProfile(userId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new ForbiddenException('Seller profile not found');
    return profile;
  }

  private formatOrder(order: any) {
    return {
      id: order.id,
      date: order.createdAt.toISOString().split('T')[0],
      status: STATUS_DISPLAY_MAP[order.status as OrderStatus] ?? order.status,
      total: Number(order.total),
      customer: {
        id: order.user.id,
        name: `${order.user.firstName} ${order.user.lastName}`.trim(),
        email: order.user.email,
      },
      items: order.items.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        price: Number(item.price),
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        productName: item.productName,
        productImage: item.productImage,
      })),
      createdAt: order.createdAt,
    };
  }

  async list(userId: string, search?: string, status?: string) {
    const profile = await this.getSellerProfile(userId);
    const sellerId = profile.id;

    const baseWhere: any = {
      items: { some: { product: { sellerId } } },
    };

    const where: any = { ...baseWhere };
    if (search) where.id = { contains: search, mode: 'insensitive' };
    if (status && status !== 'all' && STATUS_FILTER_MAP[status]) {
      where.status = { in: STATUS_FILTER_MAP[status] };
    }

    const [allOrders, orders] = await Promise.all([
      this.prisma.order.findMany({
        where: baseWhere,
        select: { status: true },
      }),
      this.prisma.order.findMany({
        where,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          items: {
            where: { product: { sellerId } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const pendingStatuses: string[] = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
    ];
    const shippedStatuses: string[] = [
      OrderStatus.SHIPPED,
      OrderStatus.OUT_FOR_DELIVERY,
    ];

    const stats = {
      total: allOrders.length,
      pending: allOrders.filter((o) => pendingStatuses.includes(o.status))
        .length,
      shipped: allOrders.filter((o) => shippedStatuses.includes(o.status))
        .length,
      delivered: allOrders.filter((o) => o.status === OrderStatus.DELIVERED)
        .length,
    };

    return {
      data: orders.map((o) => this.formatOrder(o)),
      stats,
    };
  }

  // Map OrderStatus to the corresponding TrackingStatus sort order threshold
  private readonly TRACKING_SORT_ORDER: Record<string, number> = {
    [OrderStatus.PROCESSING]: 1,
    [OrderStatus.SHIPPED]: 2,
    [OrderStatus.OUT_FOR_DELIVERY]: 3,
    [OrderStatus.DELIVERED]: 4,
  };

  private readonly ORDER_STATUS_TO_TRACKING: Record<string, TrackingStatus> = {
    [OrderStatus.PROCESSING]: TrackingStatus.CONFIRMED,
    [OrderStatus.SHIPPED]: TrackingStatus.SHIPPED,
    [OrderStatus.OUT_FOR_DELIVERY]: TrackingStatus.OUT_FOR_DELIVERY,
    [OrderStatus.DELIVERED]: TrackingStatus.DELIVERED,
  };

  async updateStatus(userId: string, orderId: string, status: string) {
    const profile = await this.getSellerProfile(userId);
    const sellerId = profile.id;

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        items: { some: { product: { sellerId } } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const dbStatus = STATUS_UPDATE_MAP[status];
    const currentSortOrder = this.TRACKING_SORT_ORDER[dbStatus] ?? 0;
    const currentTrackingStatus = this.ORDER_STATUS_TO_TRACKING[dbStatus];
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: dbStatus },
      });

      if (currentTrackingStatus) {
        // Mark all steps up to and including current as completed
        await tx.orderTracking.updateMany({
          where: { orderId, sortOrder: { lte: currentSortOrder } },
          data: { isCompleted: true, isCurrent: false, completedAt: now },
        });
        // Mark steps after current as not completed
        await tx.orderTracking.updateMany({
          where: { orderId, sortOrder: { gt: currentSortOrder } },
          data: { isCompleted: false, isCurrent: false, completedAt: null },
        });
        // Set the current step
        await tx.orderTracking.updateMany({
          where: { orderId, status: currentTrackingStatus },
          data: { isCurrent: true },
        });
      }
    });

    const updated = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { id: true, status: true, updatedAt: true },
    });

    return {
      success: true,
      order: {
        id: updated.id,
        status: STATUS_DISPLAY_MAP[updated.status] ?? updated.status,
        updatedAt: updated.updatedAt,
      },
    };
  }
}
