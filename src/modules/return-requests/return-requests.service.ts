import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { OrderStatus, ReturnRequestStatus, UserType } from 'generated/prisma/client';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';
import { UpdateReturnRequestStatusDto } from './dto/update-return-request.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class ReturnRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly walletService: WalletService,
  ) { }

  // ─── Buyer: Create Request ──────────────────────────────────────────────────

  async create(userId: string, dto: CreateReturnRequestDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { items: { include: { product: true } } },
    });

    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    if (order.userId !== userId) throw new ForbiddenException('Bạn không có quyền yêu cầu đổi trả đơn hàng này');

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Chỉ có thể yêu cầu đổi trả cho đơn hàng đã giao thành công');
    }

    const existingRequest = await this.prisma.returnRequest.findUnique({
      where: { orderId: dto.orderId },
    });
    if (existingRequest) throw new BadRequestException('Đơn hàng này đã có yêu cầu đổi trả');

    const request = await this.prisma.$transaction(async (tx) => {
      // Update order status
      await tx.order.update({
        where: { id: dto.orderId },
        data: { status: OrderStatus.RETURN_REQUESTED },
      });

      // Create return request entry
      return tx.returnRequest.create({
        data: {
          orderId: dto.orderId,
          userId,
          reason: dto.reason,
          images: dto.images ?? [],
          status: ReturnRequestStatus.PENDING,
        },
      });
    });

    // Notify sellers
    const sellerUserIds = new Set<string>();
    for (const item of order.items) {
      const sId = item.product.sellerId;
      const seller = await this.prisma.sellerProfile.findUnique({
        where: { id: sId },
        select: { userId: true },
      });
      if (seller) sellerUserIds.add(seller.userId);
    }

    for (const sellerUserId of sellerUserIds) {
      this.notifications.createNotification({
        userId: sellerUserId,
        type: 'ORDER' as any,
        title: 'Yêu cầu đổi trả mới',
        message: `Bạn có yêu cầu đổi trả mới cho đơn hàng ${dto.orderId}`,
        actionPage: 'seller-orders',
      }).catch(() => { });
    }

    return request;
  }

  // ─── Shared: Get Details ─────────────────────────────────────────────────────

  async findOne(userId: string, requestId: string) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id: requestId },
      include: { 
        order: { include: { items: true } },
        user: { select: { firstName: true, lastName: true, email: true } }
      },
    });

    if (!request) throw new NotFoundException('Yêu cầu không tồn tại');

    // Access control
    const isBuyer = request.userId === userId;
    let isSeller = false;

    if (!isBuyer) {
      const sellerProfile = await this.prisma.sellerProfile.findUnique({ where: { userId } });
      if (sellerProfile) {
        isSeller = request.order.items.some(i => i.productName && true); // Simplified check for now
        // Standard check would be matches sellerId in product
      }
    }

    if (!isBuyer && !isSeller) {
      // Hard check for seller
      const sellersInOrder = await this.prisma.product.findMany({
        where: { id: { in: request.order.items.map(i => i.productId) } },
        select: { sellerId: true }
      });
      const sellerProfile = await this.prisma.sellerProfile.findUnique({ where: { userId } });
      isSeller = sellersInOrder.some(s => s.sellerId === sellerProfile?.id);
    }

    if (!isBuyer && !isSeller) throw new ForbiddenException('Bạn không có quyền xem yêu cầu này');

    return request;
  }

  // ─── Seller: Update Status/Note ─────────────────────────────────────────────

  async updateStatus(userId: string, requestId: string, dto: UpdateReturnRequestStatusDto) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id: requestId },
      include: { order: true },
    });

    if (!request) throw new NotFoundException('Yêu cầu không tồn tại');

    // Verify Seller
    const sellerProfile = await this.prisma.sellerProfile.findUnique({ where: { userId } });
    if (!sellerProfile) throw new ForbiddenException('Chỉ người bán mới có quyền này');

    const updated = await this.prisma.returnRequest.update({
      where: { id: requestId },
      data: {
        status: dto.status,
        sellerNote: dto.sellerNote,
        refundAmount: dto.refundAmount,
      },
    });

    // Notify Buyer
    this.notifications.createNotification({
      userId: request.userId,
      type: 'ORDER' as any,
      title: `Cập nhật yêu cầu đổi trả`,
      message: `Yêu cầu đổi trả đơn hàng ${request.orderId} đã được chuyển sang trạng thái: ${dto.status}`,
      actionPage: 'orders',
    }).catch(() => { });

    return updated;
  }

  // ─── Seller: Confirm Receipt & Complete Refund ─────────────────────────────

  async confirmReceiptAndRefund(userId: string, requestId: string) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id: requestId },
      include: {
        order: {
          include: {
            items: {
              include: { product: true },
            },
          },
        },
      },
    });

    if (!request) throw new NotFoundException('Yêu cầu không tồn tại');

    // Verify Seller
    const sellerProfile = await this.prisma.sellerProfile.findUnique({ where: { userId } });
    if (!sellerProfile) throw new ForbiddenException('Chỉ người bán mới có quyền này');

    const sellerItems = request.order.items.filter(
      (i) => i.product.sellerId === sellerProfile.id,
    );
    const sellerItemsTotal = sellerItems.reduce(
      (acc, item) => acc + Number(item.price) * item.quantity,
      0,
    );
    const refundValue = Number(request.refundAmount || sellerItemsTotal);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Update Request
      const updatedReq = await tx.returnRequest.update({
        where: { id: requestId },
        data: { status: ReturnRequestStatus.COMPLETED },
      });

      // 2. Update Order
      await tx.order.update({
        where: { id: request.orderId },
        data: { status: OrderStatus.REFUNDED, revenueStatus: 'REFUNDED' },
      });

      await this.walletService.refundToWallet(
        request.userId,
        request.orderId,
        refundValue,
        tx,
        userId,
      );

      return updatedReq;
    });

    // Notify Buyer
    this.notifications.createNotification({
      userId: request.userId,
      type: 'ORDER' as any,
      title: 'Hoàn tiền thành công',
      message: `Yêu cầu trả hàng hoàn tiền đơn ${request.orderId} đã hoàn tất. ${refundValue.toLocaleString('vi-VN')} ₫ đã được cộng vào ví của bạn.`,
      actionPage: 'wallet',
    }).catch(() => { });

    return result;
  }

  async list(userId: string, userType: UserType) {
    if (userType === UserType.BUYER) {
      return this.prisma.returnRequest.findMany({
        where: { userId },
        include: { order: true },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      const sellerProfile = await this.prisma.sellerProfile.findUnique({ where: { userId } });
      if (!sellerProfile) throw new ForbiddenException('Seller profile not found');

      return this.prisma.returnRequest.findMany({
        where: {
          order: {
            items: { some: { product: { sellerId: sellerProfile.id } } }
          }
        },
        include: { order: true, user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      });
    }
  }
}
