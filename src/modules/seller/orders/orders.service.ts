import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { OrderStatus, TrackingStatus } from 'generated/prisma/client';
import { WalletService } from '../../wallet/wallet.service';

const STATUS_FILTER_MAP: Record<string, OrderStatus[]> = {
  Processing: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
  Shipped: [OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY],
  Delivered: [OrderStatus.DELIVERED],
  RETURN_REQUESTED: [OrderStatus.RETURN_REQUESTED, OrderStatus.RETURNED, OrderStatus.REFUNDED],
  CancelRequests: [OrderStatus.CANCEL_REQUESTED],
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
  [OrderStatus.RETURN_REQUESTED]: 'Return Requested',
  [OrderStatus.RETURNED]: 'Returned',
  [OrderStatus.CANCEL_REQUESTED]: 'Cancel Requested',
};

const STATUS_UPDATE_MAP: Record<string, OrderStatus> = {
  Processing: OrderStatus.PROCESSING,
  Shipped: OrderStatus.SHIPPED,
  Delivered: OrderStatus.DELIVERED,
};

const TRACKING_SORT_ORDER: Record<string, number> = {
  [OrderStatus.PROCESSING]: 1,
  [OrderStatus.SHIPPED]: 2,
  [OrderStatus.OUT_FOR_DELIVERY]: 3,
  [OrderStatus.DELIVERED]: 4,
};

const ORDER_STATUS_TO_TRACKING: Record<string, TrackingStatus> = {
  [OrderStatus.PROCESSING]: TrackingStatus.CONFIRMED,
  [OrderStatus.SHIPPED]: TrackingStatus.SHIPPED,
  [OrderStatus.OUT_FOR_DELIVERY]: TrackingStatus.OUT_FOR_DELIVERY,
  [OrderStatus.DELIVERED]: TrackingStatus.DELIVERED,
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
  ) { }

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
        try {
          profile = await this.prisma.sellerProfile.create({
            data: {
              userId: user.id,
              storeName: `${user.firstName} ${user.lastName}'s Store`,
              storeSlug: `${base}-${user.id.slice(-8)}`,
            },
          });
        } catch (error: any) {
          if (error?.code === 'P2002') {
            profile = await this.prisma.sellerProfile.findUnique({ where: { userId } });
          } else {
            throw error;
          }
        }
      }
      if (!profile) throw new ForbiddenException('Bạn chưa có hồ sơ người bán');
    }
    return profile;
  }

  private formatOrder(order: any) {
    return {
      id: order.id,
      paymentGroupId: order.paymentGroupId,
      date: order.createdAt.toISOString().split('T')[0],
      status: STATUS_DISPLAY_MAP[order.status as OrderStatus] ?? order.status,
      rawStatus: order.status,
      total: Number(order.total),
      customer: {
        id: order.user.id,
        name: `${order.user.firstName} ${order.user.lastName}`.trim(),
        email: order.user.email,
        avatar: order.user.avatar,
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
      tracking: {
        current: order.trackingSteps?.find((s: any) => s.isCurrent)?.status,
        steps: (order.trackingSteps ?? []).map((step: any) => ({
          status: step.status,
          label: step.label,
          description: step.description,
          date: step.completedAt,
          completed: step.isCompleted,
          isCurrent: step.isCurrent,
        })),
      },
      cancelReason: order.cancelReason,
      cancelNote: order.cancelNote,
      paymentMethod: order.paymentMethod,
      revenueStatus: order.revenueStatus,
      createdAt: order.createdAt,
      returnRequest: order.returnRequest,
    };
  }

  async list(userId: string, search?: string, status?: string) {
    const profile = await this.getSellerProfile(userId);
    const sellerId = profile.id;

    const baseWhere: any = { sellerId };
    const where: any = { ...baseWhere };

    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { paymentGroupId: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status && status !== 'all' && STATUS_FILTER_MAP[status]) {
      where.status = { in: STATUS_FILTER_MAP[status] };
    }

    const [allOrders, orders] = await Promise.all([
      this.prisma.order.findMany({
        where: { sellerId },
        select: { status: true },
      }),
      this.prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
          returnRequest: true,
          items: true,
          trackingSteps: { orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const pendingStatuses: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING];
    const shippedStatuses: OrderStatus[] = [OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY];

    const stats = {
      total: allOrders.length,
      pending: allOrders.filter((o) => pendingStatuses.includes(o.status)).length,
      shipped: allOrders.filter((o) => shippedStatuses.includes(o.status)).length,
      delivered: allOrders.filter((o) => o.status === OrderStatus.DELIVERED).length,
      returns: allOrders.filter((o) =>
        ([OrderStatus.RETURN_REQUESTED, OrderStatus.RETURNED, OrderStatus.REFUNDED] as OrderStatus[]).includes(o.status as OrderStatus)
      ).length,
      cancelRequests: allOrders.filter((o) => o.status === OrderStatus.CANCEL_REQUESTED).length,
    };

    return {
      data: orders.map((o) => this.formatOrder(o)),
      stats,
    };
  }

  async updateStatus(userId: string, orderId: string, status: string) {
    const profile = await this.getSellerProfile(userId);
    const sellerId = profile.id;

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, sellerId },
    });
    if (!order) throw new NotFoundException('Order not found or access denied');

    const dbStatus = STATUS_UPDATE_MAP[status];
    if (!dbStatus) throw new BadRequestException(`Invalid status: ${status}`);

    const currentSortOrder = TRACKING_SORT_ORDER[dbStatus] ?? 0;
    const currentTrackingStatus = ORDER_STATUS_TO_TRACKING[dbStatus];
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: dbStatus,
          revenueStatus: dbStatus === OrderStatus.DELIVERED ? 'RELEASED' : order.revenueStatus,
        },
      });

      if (currentTrackingStatus) {
        await tx.orderTracking.updateMany({
          where: { orderId: order.id, sortOrder: { lte: currentSortOrder } },
          data: { isCompleted: true, isCurrent: false, completedAt: now },
        });
        await tx.orderTracking.updateMany({
          where: { orderId: order.id, sortOrder: { gt: currentSortOrder } },
          data: { isCompleted: false, isCurrent: false, completedAt: null },
        });
        await tx.orderTracking.updateMany({
          where: { orderId: order.id, status: currentTrackingStatus },
          data: { isCurrent: true },
        });
      }
    });

    if (dbStatus === OrderStatus.DELIVERED) {
      try {
        await this.walletService.processOrderPayout(order.id, userId);
      } catch (error) {
        console.error(`Failed to process payout for order ${order.id}:`, error);
      }
    }

    const updated = await this.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
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

  async handleCancelRequest(
    userId: string,
    orderId: string,
    action: 'APPROVE' | 'REJECT',
    note?: string,
  ) {
    const profile = await this.getSellerProfile(userId);
    const sellerId = profile.id;

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, sellerId, status: OrderStatus.CANCEL_REQUESTED },
      include: {
        items: true,
      },
    });
    if (!order) throw new NotFoundException('Yêu cầu hủy không tồn tại hoặc đã được xử lý');

    if (action === 'REJECT') {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PROCESSING, cancelNote: note },
      });
      return { success: true, message: 'Đã từ chối yêu cầu hủy' };
    }

    const PAID_METHODS = ['wallet', 'vnpay', 'momo'];
    const isPaid = PAID_METHODS.includes(order.paymentMethod);

    await this.prisma.$transaction(async (tx) => {
      if (isPaid && Number(order.total) > 0) {
        await this.walletService.refundToWallet(
          order.userId,
          order.id,
          Number(order.total),
          tx,
        );
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          revenueStatus: isPaid ? 'REFUNDED' : order.revenueStatus,
          cancelNote: note
        },
      });

      await this.restoreStockAndCart(tx, order, order.userId);
    });

    return { success: true, message: 'Đã chấp nhận hủy đơn và hoàn tiền thành công' };
  }

  private async restoreStockAndCart(tx: any, order: any, userId: string) {
    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });

      const existingCartItem = await tx.cartItem.findFirst({
        where: {
          userId,
          productId: item.productId,
          selectedColor: item.selectedColor,
          selectedSize: item.selectedSize,
        },
      });

      if (existingCartItem) {
        await tx.cartItem.update({
          where: { id: existingCartItem.id },
          data: { quantity: { increment: item.quantity } },
        });
      } else {
        await tx.cartItem.create({
          data: {
            userId,
            productId: item.productId,
            quantity: item.quantity,
            selectedColor: item.selectedColor,
            selectedSize: item.selectedSize,
          },
        });
      }
    }
  }
}
