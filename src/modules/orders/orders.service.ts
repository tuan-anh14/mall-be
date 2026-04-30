import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import {
  CouponType,
  NotificationType,
  OrderStatus,
  TrackingStatus,
  NotificationType as PrismaNotificationType, // Just in case of conflicts
  WalletTransactionStatus,
} from 'generated/prisma/client';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';
import { PaymentService } from '../payment/payment.service';

const ORDER_INCLUDE = {
  items: {
    include: {
      product: {
        include: {
          images: { where: { isPrimary: true }, take: 1 },
          seller: { select: { id: true, storeName: true } },
        },
      },
    },
  },
  seller: { select: { id: true, storeName: true } },
  trackingSteps: { orderBy: { sortOrder: 'asc' as const } },
};

const TRACKING_STEPS = [
  { status: TrackingStatus.ORDERED, label: 'Đã đặt hàng', sortOrder: 0 },
  { status: TrackingStatus.CONFIRMED, label: 'Đã xác nhận', sortOrder: 1 },
  { status: TrackingStatus.SHIPPED, label: 'Đang vận chuyển', sortOrder: 2 },
  { status: TrackingStatus.OUT_FOR_DELIVERY, label: 'Đang giao hàng', sortOrder: 3 },
  { status: TrackingStatus.DELIVERED, label: 'Đã giao hàng thành công', sortOrder: 4 },
];

const PAID_METHODS = ['wallet', 'vnpay'];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
  ) { }

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
        sellerId: item.product?.seller?.id ?? order.sellerId ?? null,
        sellerName: item.product?.seller?.storeName ?? order.seller?.storeName ?? null,
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
      // Legacy tracking (order-level) — giữ cho backward-compat
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
      // SellerOrders — mỗi seller có status + tracking riêng (Multi-vendor)
      sellerOrders: (order.sellerOrders ?? []).map((so: any) => {
        const soCurrentStep = so.tracking?.find((s: any) => s.isCurrent);
        return {
          id: so.id,
          sellerId: so.sellerId,
          sellerName: so.seller?.storeName ?? 'Shop',
          status: so.status,
          tracking: {
            current: soCurrentStep?.status ?? so.status,
            steps: (so.tracking ?? []).map((step: any) => ({
              status: step.status,
              label: step.label,
              description: step.description,
              date: step.completedAt,
              completed: step.isCompleted,
              isCurrent: step.isCurrent,
            })),
          },
          items: (so.items ?? []).map((item: any) => ({
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
            price: Number(item.price),
            selectedColor: item.selectedColor,
            selectedSize: item.selectedSize,
            productName: item.productName,
            productImage: item.productImage,
          })),
        };
      }),
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

  async createOrder(
    userId: string,
    dto: CreateOrderDto,
    options?: { vnpayPaid?: boolean; paymentRef?: string },
  ) {
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
          `Giá trị đơn hàng tối thiểu là ${Number(coupon.minOrderAmount).toFixed(0)} ₫`,
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

    const FREE_SHIPPING_THRESHOLD = 50000;
    const DEFAULT_SHIPPING_COST = 50000;
    const VAT_RATE = 0.1;

    let initialStatus: OrderStatus = OrderStatus.PENDING;
    let isPaidOnline = false;

    if (dto.paymentMethod === 'wallet') {
      initialStatus = OrderStatus.CONFIRMED;
      isPaidOnline = true;
    } else if (dto.paymentMethod === 'vnpay') {
      initialStatus = options?.vnpayPaid ? OrderStatus.CONFIRMED : OrderStatus.PENDING;
      isPaidOnline = Boolean(options?.vnpayPaid);
    }

    const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : DEFAULT_SHIPPING_COST;
    const tax = subtotal * VAT_RATE;
    const total = Math.round(Math.max(0, subtotal - couponDiscount + shippingCost + tax));

    // Group items by seller
    const sellerGroups = new Map<string, Array<{ item: typeof rawItems[0]; product: any }>>();
    for (const item of rawItems) {
      const product = productMap.get(item.productId)!;
      if (!sellerGroups.has(product.sellerId)) sellerGroups.set(product.sellerId, []);
      sellerGroups.get(product.sellerId)!.push({ item, product });
    }

    const paymentGroupId = 'ORD-' + Date.now() + Math.floor(Math.random() * 1000);
    let firstOrderId = '';

    if (dto.paymentMethod === 'vnpay' && !options?.vnpayPaid) {
      const pendingId = 'ORDERPAY-' + Date.now() + Math.floor(Math.random() * 1000);
      await this.prisma.pendingOrderPayment.create({
        data: {
          id: pendingId,
          userId,
          amount: total,
          checkoutData: dto as any,
        },
      });

      const paymentUrl = await this.paymentService.createVnpayUrl(
        pendingId,
        total,
        '127.0.0.1',
        dto.returnUrl,
      );

      return {
        order: {
          id: pendingId,
          date: new Date(),
          status: 'PENDING_PAYMENT',
          total,
          items: [],
          tracking: { current: 'PENDING_PAYMENT', steps: [] },
        },
        paymentUrl,
      };
    }

    const createdOrderIds = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      let index = 1;

      for (const [sellerId, sellerItems] of sellerGroups) {
        const sellerSubtotal = sellerItems.reduce(
          (acc, { product, item }) => acc + Number(product.price) * item.quantity,
          0
        );
        const ratio = sellerSubtotal / subtotal;
        
        const sellerShipping = Math.round(shippingCost * ratio);
        const sellerTax = Math.round(tax * ratio);
        const sellerCoupon = Math.round(couponDiscount * ratio);
        const sellerTotal = Math.round(Math.max(0, sellerSubtotal - sellerCoupon + sellerShipping + sellerTax));

        const orderId = `${this.generateOrderId()}-${index}`;
        if (!firstOrderId) firstOrderId = orderId;
        index++;

        const created = await tx.order.create({
          data: {
            id: orderId,
            userId,
            sellerId,
            paymentGroupId,
            isPaidOnline,
            status: initialStatus,
            subtotal: sellerSubtotal,
            shippingCost: sellerShipping,
            tax: sellerTax,
            total: sellerTotal,
            couponId: coupon?.id ?? null,
            couponCode: coupon?.code ?? null,
            couponDiscount: sellerCoupon > 0 ? sellerCoupon : null,
            paymentMethod: dto.paymentMethod,
            paymentRef: options?.paymentRef ?? dto.paymentRef ?? null,
            revenueStatus: isPaidOnline ? 'PENDING' : 'UNPAID',
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

        await tx.orderItem.createMany({
          data: sellerItems.map(({ item, product }) => ({
            orderId: created.id,
            productId: item.productId,
            quantity: item.quantity,
            price: Number(product.price),
            selectedColor: item.selectedColor ?? null,
            selectedSize: item.selectedSize ?? null,
            productName: product.name,
            productImage: product.images?.[0]?.url ?? null,
          })),
        });

        const now = new Date();
        await tx.orderTracking.createMany({
          data: TRACKING_STEPS.map((step) => ({
            orderId: created.id,
            status: step.status,
            label: step.label,
            sortOrder: step.sortOrder,
            isCompleted: isPaidOnline ? step.sortOrder <= 1 : step.sortOrder === 0,
            isCurrent: isPaidOnline ? step.sortOrder === 1 : step.sortOrder === 0,
            completedAt: isPaidOnline
              ? step.sortOrder <= 1 ? now : null
              : step.sortOrder === 0 ? now : null,
          })),
        });

        if (dto.paymentMethod === 'wallet') {
          await this.walletService.payWithWalletInTx(tx, userId, created.id, Number(created.total));
        }

        if (coupon) {
          await tx.couponUsage.create({
            data: { couponId: coupon.id, userId, orderId: created.id },
          });
        }
        
        ids.push(created.id);
      }

      // Decrement product stock
      for (const item of rawItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      if (coupon) {
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { usageCount: { increment: 1 } },
        });
      }

      await tx.cartItem.deleteMany({ where: { userId } });
      return ids;
    });

    let paymentUrl: string | undefined;
    if (dto.paymentMethod === 'vnpay' && !options?.vnpayPaid) {
      const vnpayResult = await this.paymentService.createVnpayUrl(
        paymentGroupId, // Use paymentGroupId for VNPay
        total,
        '127.0.0.1',
        dto.returnUrl,
      );
      paymentUrl = vnpayResult;
    }

    const firstCreatedOrder = await this.prisma.order.findUniqueOrThrow({
      where: { id: createdOrderIds[0] },
      include: ORDER_INCLUDE,
    });

    // Notify buyer that order was placed
    this.notifications.createNotification({
      userId,
      type: NotificationType.ORDER,
      title: 'Đặt hàng thành công',
      message: `Giỏ hàng của bạn đã được tách thành ${createdOrderIds.length} kiện hàng. Tổng cộng: ${total.toFixed(0)} ₫.`,
      actionPage: 'orders',
    }).catch(() => { });

    // Notify sellers for their products in the order
    const sellerProductIds = rawItems.map((i) => i.productId);
    const sellerProducts = await this.prisma.product.findMany({
      where: { id: { in: sellerProductIds } },
      select: { id: true, name: true, seller: { select: { userId: true } } },
    });
    const sellerUserIds = new Set<string>();
    for (const p of sellerProducts) {
      if (p.seller?.userId) sellerUserIds.add(p.seller.userId);
    }
    for (const sellerUserId of sellerUserIds) {
      this.notifications.createNotification({
        userId: sellerUserId,
        type: NotificationType.ORDER,
        title: 'Bạn có đơn hàng mới',
        message: `Khách hàng vừa đặt đơn hàng mới. Hãy kiểm tra và xác nhận đơn hàng.`,
        actionPage: 'dashboard',
      }).catch(() => { });
    }

    return {
      order: this.formatOrder(firstCreatedOrder),
      paymentUrl,
    };
  }

  async requestCancel(userId: string, orderId: string, reason: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { 
        items: {
          include: { 
            product: {
              // [BUG1 FIX] Include seller.userId để lấy đúng User.id (không phải SellerProfile.id)
              include: { seller: { select: { userId: true } } },
            },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    const cancellableStatuses: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
    ];
    if (!cancellableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Không thể yêu cầu hủy đơn hàng ở trạng thái "${order.status}"`,
      );
    }

    // Determine if the order has been paid
    const isOnlineMethod = PAID_METHODS.includes(order.paymentMethod);
    const isPaid = isOnlineMethod && (
      order.status !== OrderStatus.PENDING || order.paymentMethod === 'wallet'
    );

    // If it's an unpaid PENDING order, we can cancel it immediately
    if (order.status === OrderStatus.PENDING && !isPaid) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.CANCELLED, cancelReason: reason },
        });
        await this.restoreStockAndCart(tx, order, userId);
      });
      return { message: 'Đơn hàng đã được hủy thành công', status: OrderStatus.CANCELLED };
    }

    // Move Order + tất cả active SellerOrders → CANCEL_REQUESTED
    // If paid, change to CANCEL_REQUESTED (Wait for seller approval)
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCEL_REQUESTED, cancelReason: reason },
    });

    const sellerUserIds = new Set<string>();
    for (const item of order.items) {
      const sellerUserId = (item.product as any)?.seller?.userId;
      if (sellerUserId) sellerUserIds.add(sellerUserId);
    }
    for (const sellerUserId of sellerUserIds) {
      this.notifications.createNotification({
        userId: sellerUserId,
        type: NotificationType.ORDER,
        title: 'Yêu cầu hủy đơn hàng mới',
        message: `Khách hàng yêu cầu hủy đơn hàng ${orderId}. Lý do: ${reason}`,
        actionPage: 'seller-orders',
      }).catch(() => { });
    }

    return { message: 'Yêu cầu hủy đơn hàng đã được gửi tới người bán', status: OrderStatus.CANCEL_REQUESTED };
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });
      await this.restoreStockAndCart(tx, order, userId);
    });

    return { message: 'Đơn hàng đã được hủy' };
  }

  async handlePendingOrderPayment(
    pendingPaymentId: string,
    status: WalletTransactionStatus,
    gatewayData?: any,
  ) {
    const pending = await this.prisma.pendingOrderPayment.findUnique({
      where: { id: pendingPaymentId },
    });

    if (!pending) return { message: 'Pending payment not found' };
    if (pending.status !== WalletTransactionStatus.PENDING) {
      return { message: 'Payment already processed', orderId: pending.orderId };
    }

    if (status !== WalletTransactionStatus.COMPLETED) {
      await this.prisma.pendingOrderPayment.update({
        where: { id: pendingPaymentId },
        data: { status, gatewayData },
      });
      return { success: true, pendingPaymentId, status };
    }

    const checkoutData = pending.checkoutData as unknown as CreateOrderDto;
    const result = await this.createOrder(pending.userId, checkoutData, {
      vnpayPaid: true,
      paymentRef: gatewayData?.vnp_TransactionNo ?? null,
    });

    await this.prisma.pendingOrderPayment.update({
      where: { id: pendingPaymentId },
      data: {
        status: WalletTransactionStatus.COMPLETED,
        orderId: result.order.id,
        gatewayData,
      },
    });

    return {
      success: true,
      pendingPaymentId,
      status,
      orderId: result.order.id,
    };
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

  async handlePaymentCallback(paymentGroupId: string, status: WalletTransactionStatus, gatewayData?: any) {
    const orders = await this.prisma.order.findMany({
      where: { paymentGroupId },
      include: { items: true },
    });

    if (orders.length === 0) return { message: 'Order not found' };
    if (orders.some(o => o.status !== OrderStatus.PENDING)) return { message: 'Order already processed' };

    if (status === WalletTransactionStatus.COMPLETED) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.updateMany({
          where: { paymentGroupId },
          data: {
            status: OrderStatus.CONFIRMED,
            paymentRef: gatewayData?.vnp_TransactionNo ?? null,
            isPaidOnline: true,
            revenueStatus: 'PENDING',
          },
        });

        const orderIds = orders.map(o => o.id);
        await tx.orderTracking.updateMany({
          where: { orderId: { in: orderIds }, sortOrder: 1 },
          data: { isCompleted: true, completedAt: new Date(), isCurrent: true },
        });
        await tx.orderTracking.updateMany({
          where: { orderId: { in: orderIds }, sortOrder: 0 },
          data: { isCurrent: false },
        });
      });

      this.notifications.createNotification({
        userId: orders[0].userId,
        type: NotificationType.ORDER,
        title: 'Thanh toán thành công',
        message: `Đơn hàng của bạn đã được thanh toán VNPAY thành công.`,
        actionPage: 'orders',
      }).catch(() => { });

    } else if (status === WalletTransactionStatus.CANCELLED || status === WalletTransactionStatus.FAILED) {
      for (const order of orders) {
        await this.cancelOrder(order.userId, order.id);
      }
    }

    return { success: true, paymentGroupId, status };
  }
}

