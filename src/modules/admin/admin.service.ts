import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/database/prisma.service';
import { NotificationType, ProductStatus, UserType } from 'generated/prisma/client';
import {
  CreateAdminAccountDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateCouponDto,
  UpdateCouponDto,
  ReviewSellerRequestDto,
  UpdateAdminProductDto,
} from './dto/admin.dto';
import { NotificationsService } from '../notifications/notifications.service';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private validateCouponPayload(dto: {
    type?: 'PERCENTAGE' | 'FIXED_AMOUNT';
    value?: number;
    minOrderAmount?: number;
    maxDiscount?: number;
    usageLimit?: number;
    validFrom?: string;
    validUntil?: string;
  }) {
    const assertNonNegativeNumber = (value: number | undefined, field: string) => {
      if (value === undefined) return;
      if (!Number.isFinite(value) || value < 0) {
        throw new BadRequestException(`${field} phải là số không âm hợp lệ`);
      }
    };

    assertNonNegativeNumber(dto.value, 'Giá trị giảm');
    assertNonNegativeNumber(dto.minOrderAmount, 'Đơn hàng tối thiểu');
    assertNonNegativeNumber(dto.maxDiscount, 'Giảm tối đa');

    if (dto.usageLimit !== undefined && (!Number.isInteger(dto.usageLimit) || dto.usageLimit < 1)) {
      throw new BadRequestException('Giới hạn lượt dùng phải là số nguyên lớn hơn 0');
    }

    if (dto.type === 'PERCENTAGE' && dto.value !== undefined && dto.value > 100) {
      throw new BadRequestException('Mã giảm theo phần trăm không được vượt quá 100%');
    }

    if (dto.type === 'FIXED_AMOUNT' && dto.maxDiscount !== undefined) {
      throw new BadRequestException('Mã giảm số tiền cố định không dùng trường giảm tối đa');
    }

    const validFrom = dto.validFrom ? new Date(dto.validFrom) : undefined;
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : undefined;

    if (validFrom && Number.isNaN(validFrom.getTime())) {
      throw new BadRequestException('Thời gian bắt đầu không hợp lệ');
    }

    if (validUntil && Number.isNaN(validUntil.getTime())) {
      throw new BadRequestException('Thời gian hết hạn không hợp lệ');
    }

    if (validFrom && validUntil && validUntil <= validFrom) {
      throw new BadRequestException('Thời gian hết hạn phải sau thời gian bắt đầu');
    }
  }

  // ─── AUDIT LOG ─────────────────────────────────────────────────────────────

  async logAction(adminId: string, action: string, resource: string, resourceId?: string, details?: any) {
    try {
      await this.prisma.auditLog.create({
        data: { adminId, action, resource, resourceId, details },
      });
    } catch {
      // Non-blocking: don't fail the original operation if audit log fails
    }
  }

  async getAuditLogs(page = 1, limit = 50, adminId?: string, action?: string, resource?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (adminId) where.adminId = adminId;
    if (action) where.action = action;
    if (resource) where.resource = resource;
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          admin: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { logs, total, page, limit };
  }

  // ─── ACCOUNTS ──────────────────────────────────────────────────────────────

  async createAccount(dto: CreateAdminAccountDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email đã tồn tại');
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        userType: dto.userType as UserType ?? UserType.BUYER,
      },
      select: {
        id: true, email: true, firstName: true, lastName: true, userType: true, createdAt: true,
      },
    });
    return user;
  }

  async getAccounts(page = 1, limit = 20, search?: string, userType?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (userType && ['BUYER', 'SELLER', 'ADMIN'].includes(userType)) {
      where.userType = userType as UserType;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          userType: true,
          avatar: true,
          isEmailVerified: true,
          memberSince: true,
          createdAt: true,
          sellerProfile: {
            select: { storeName: true, isVerified: true },
          },
          sellerRequest: {
            select: { status: true, createdAt: true },
          },
          _count: {
            select: { orders: true, reviews: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, limit };
  }

  async getAccountById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        userType: true,
        avatar: true,
        phone: true,
        isEmailVerified: true,
        memberSince: true,
        createdAt: true,
        sellerProfile: true,
        sellerRequest: true,
        _count: {
          select: { orders: true, reviews: true, sessions: true },
        },
      },
    });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    return user;
  }

  async banAccount(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { userType: true } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    if (user.userType === UserType.ADMIN) {
      throw new BadRequestException('Không thể khóa tài khoản Admin');
    }
    // Deactivate all sessions to force logout
    await this.prisma.userSession.updateMany({
      where: { userId: id },
      data: { isActive: false },
    });
    return { message: 'Đã khóa tài khoản người dùng' };
  }

  async deleteAccount(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { userType: true } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    if (user.userType === UserType.ADMIN) {
      throw new BadRequestException('Không thể xóa tài khoản Admin');
    }
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Đã xóa tài khoản người dùng' };
  }

  // ─── CATEGORIES ────────────────────────────────────────────────────────────

  async getCategories() {
    return this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { products: { where: { status: ProductStatus.ACTIVE } } },
        },
      },
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          icon: dto.icon,
          image: dto.image,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Danh mục đã tồn tại');
      throw e;
    }
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    try {
      return await this.prisma.category.update({
        where: { id },
        data: dto,
      });
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundException('Danh mục không tồn tại');
      if (e?.code === 'P2002') throw new ConflictException('Tên hoặc slug đã tồn tại');
      throw e;
    }
  }

  async deleteCategory(id: string) {
    const count = await this.prisma.product.count({ where: { categoryId: id } });
    if (count > 0) {
      throw new BadRequestException(`Không thể xóa danh mục đang có ${count} sản phẩm`);
    }
    try {
      await this.prisma.category.delete({ where: { id } });
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundException('Danh mục không tồn tại');
      throw e;
    }
    return { message: 'Đã xóa danh mục' };
  }

  // ─── COUPONS ───────────────────────────────────────────────────────────────

  async getCoupons(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { sellerId: null };
    const [coupons, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { usages: true } } },
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return { coupons, total, page, limit };
  }

  async createCoupon(dto: CreateCouponDto) {
    this.validateCouponPayload(dto);

    let coupon: any;
    try {
      coupon = await this.prisma.coupon.create({
        data: {
          code: dto.code.toUpperCase(),
          name: dto.name,
          description: dto.description,
          type: dto.type,
          value: dto.value,
          minOrderAmount: dto.minOrderAmount,
          maxDiscount: dto.maxDiscount,
          usageLimit: dto.usageLimit,
          validFrom: new Date(dto.validFrom),
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Mã giảm giá đã tồn tại');
      throw e;
    }

    // Broadcast promotion notification to all users
    if (coupon.isActive) {
      const discountLabel =
        coupon.type === 'PERCENTAGE'
          ? `${coupon.value}%`
          : `${Number(coupon.value).toLocaleString('vi-VN')} ₫`;
      const title = coupon.name ?? `Khuyến mãi mới: Giảm ${discountLabel}`;
      const message =
        coupon.description ??
        `Dùng mã ${coupon.code} để được giảm ${discountLabel} cho đơn hàng của bạn!`;
      this.notificationsService.broadcastPromotion({ title, message, actionPage: 'shop' }).catch(() => {});
    }

    return coupon;
  }

  async updateCoupon(id: string, dto: UpdateCouponDto) {
    const current = await this.prisma.coupon.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Mã giảm giá không tồn tại');

    this.validateCouponPayload({
      type: dto.type ?? current.type,
      value: dto.value ?? Number(current.value),
      minOrderAmount:
        dto.minOrderAmount !== undefined
          ? dto.minOrderAmount
          : current.minOrderAmount != null
            ? Number(current.minOrderAmount)
            : undefined,
      maxDiscount:
        dto.maxDiscount !== undefined
          ? dto.maxDiscount
          : current.maxDiscount != null
            ? Number(current.maxDiscount)
            : undefined,
      usageLimit: dto.usageLimit ?? current.usageLimit ?? undefined,
      validFrom: dto.validFrom ?? current.validFrom.toISOString(),
      validUntil:
        dto.validUntil !== undefined
          ? dto.validUntil || undefined
          : current.validUntil?.toISOString(),
    });

    try {
      return await this.prisma.coupon.update({
        where: { id },
        data: {
          ...dto,
          code: dto.code?.toUpperCase(),
          validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundException('Mã giảm giá không tồn tại');
      if (e?.code === 'P2002') throw new ConflictException('Mã giảm giá đã tồn tại');
      throw e;
    }
  }

  async deleteCoupon(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      select: {
        id: true,
        isActive: true,
        _count: { select: { usages: true } },
      },
    });
    if (!coupon) throw new NotFoundException('Mã giảm giá không tồn tại');
    if (coupon._count.usages > 0 && coupon.isActive) {
      await this.prisma.coupon.update({
        where: { id },
        data: {
          isActive: false,
          validUntil: new Date(),
        },
      });

      return { message: 'Đã tắt mã giảm giá đã được sử dụng' };
    }
    if (coupon._count.usages > 0) {
      throw new BadRequestException('Không thể xóa mã giảm giá đã được sử dụng');
    }

    try {
      await this.prisma.coupon.delete({ where: { id } });
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundException('Mã giảm giá không tồn tại');
      if (e?.code === 'P2003') {
        throw new BadRequestException('Không thể xóa mã giảm giá đã được sử dụng');
      }
      throw e;
    }
    return { message: 'Đã xóa mã giảm giá' };
  }

  // ─── REVIEWS ───────────────────────────────────────────────────────────────

  async getReviews(page = 1, limit = 20, productId?: string) {
    const skip = (page - 1) * limit;
    const where = productId ? { productId } : {};
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
          product: { select: { id: true, name: true, images: { where: { isPrimary: true }, take: 1 } } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return { reviews, total, page, limit };
  }

  async deleteReview(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      select: { productId: true },
    });
    if (!review) throw new NotFoundException('Review không tồn tại');

    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id } });
      const agg = await tx.review.aggregate({
        where: { productId: review.productId },
        _avg: { rating: true },
        _count: { rating: true },
      });
      await tx.product.update({
        where: { id: review.productId },
        data: {
          ratingAverage: agg._avg.rating ?? 0,
          reviewCount: agg._count.rating,
        },
      });
    });

    return { message: 'Đã xóa review' };
  }

  // ─── SELLER REQUESTS ───────────────────────────────────────────────────────

  async getSellerRequests(status?: string) {
    const where = status ? { status: status as any } : {};
    return this.prisma.sellerRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            memberSince: true,
            _count: { select: { orders: true } },
          },
        },
      },
    });
  }

  async reviewSellerRequest(id: string, dto: ReviewSellerRequestDto, adminId?: string) {
    const request = await this.prisma.sellerRequest.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!request) throw new NotFoundException('Yêu cầu không tồn tại');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Yêu cầu này đã được xử lý');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.sellerRequest.update({
        where: { id },
        data: { status: dto.status, adminNote: dto.adminNote },
      });

      if (dto.status === 'APPROVED') {
        await tx.user.update({
          where: { id: request.userId },
          data: { userType: UserType.SELLER },
        });

        // Create seller profile
        const base = `${request.user.firstName} ${request.user.lastName}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 30);
        await tx.sellerProfile.create({
          data: {
            userId: request.userId,
            storeName: `${request.user.firstName} ${request.user.lastName}'s Store`,
            storeSlug: `${base}-${request.userId.slice(-8)}`,
          },
        });

        // Deactivate sessions so user has to re-login to get new userType
        await tx.userSession.updateMany({
          where: { userId: request.userId },
          data: { isActive: false },
        });
      }
    });

    // Send notification to user
    await this.notificationsService.createNotification({
      userId: request.userId,
      type: NotificationType.SYSTEM,
      title: dto.status === 'APPROVED' ? 'Yêu cầu bán hàng được chấp thuận' : 'Yêu cầu bán hàng bị từ chối',
      message: dto.status === 'APPROVED'
        ? 'Chúc mừng! Yêu cầu trở thành người bán của bạn đã được phê duyệt. Vui lòng đăng nhập lại.'
        : `Yêu cầu của bạn đã bị từ chối.${dto.adminNote ? ` Lý do: ${dto.adminNote}` : ''}`,
      actionPage: dto.status === 'APPROVED' ? 'dashboard' : 'profile',
    });

    // Audit log
    if (adminId) {
      await this.logAction(adminId, dto.status === 'APPROVED' ? 'APPROVE' : 'REJECT', 'seller_request', id, {
        userId: request.userId,
        adminNote: dto.adminNote,
      });
    }

    return {
      message: dto.status === 'APPROVED'
        ? 'Đã phê duyệt yêu cầu trở thành người bán'
        : 'Đã từ chối yêu cầu trở thành người bán',
    };
  }

  // ─── STATISTICS ────────────────────────────────────────────────────────────

  async getStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalSellers,
      totalBuyers,
      totalProducts,
      totalOrders,
      revenueRows,
      platformEarningsRows,
      newUsersThisMonth,
      pendingSellerRequests,
      totalCategories,
      totalCoupons,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { userType: UserType.SELLER } }),
      this.prisma.user.count({ where: { userType: UserType.BUYER } }),
      this.prisma.product.count(),
      this.prisma.order.count(),
      this.prisma.$queryRaw<{ revenue: string }[]>`
        SELECT COALESCE(SUM(total), 0)::text AS revenue FROM orders
      `,
      this.prisma.$queryRaw<{ earnings: string }[]>`
        SELECT COALESCE(SUM(amount), 0)::text AS earnings FROM wallet_transactions 
        WHERE type = 'SELLER_FEE_DEDUCTED' AND status = 'COMPLETED'
      `,
      this.prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.sellerRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.category.count(),
      this.prisma.coupon.count(),
    ]);

    return {
      totalUsers,
      totalSellers,
      totalBuyers,
      totalProducts,
      totalOrders,
      totalGMV: Math.round(Number(revenueRows[0]?.revenue ?? 0)),
      totalPlatformEarnings: Math.round(Number(platformEarningsRows[0]?.earnings ?? 0)),
      newUsersThisMonth,
      pendingSellerRequests,
      totalCategories,
      totalCoupons,
    };
  }

  async getSalesData() {
    const year = new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);

    const rows = await this.prisma.$queryRaw<{ month: number; revenue: string; orders: string; users: string }[]>`
      SELECT
        EXTRACT(MONTH FROM o."createdAt")::int   AS month,
        COALESCE(SUM(o.total), 0)::text          AS revenue,
        COUNT(DISTINCT o.id)::text               AS orders,
        COUNT(DISTINCT o."userId")::text         AS users
      FROM orders o
      WHERE o."createdAt" >= ${startOfYear}
        AND o."createdAt" < ${endOfYear}
      GROUP BY EXTRACT(MONTH FROM o."createdAt")
    `;

    const dataByMonth = new Map(rows.map((r) => [r.month, r]));

    return MONTHS.map((month, index) => {
      const row = dataByMonth.get(index + 1);
      return {
        month,
        revenue: row ? Math.round(Number(row.revenue)) : 0,
        orders: row ? Number(row.orders) : 0,
        users: row ? Number(row.users) : 0,
      };
    });
  }

  // ─── PRODUCTS ─────────────────────────────────────────────────────────────

  async getProducts(
    page = 1,
    limit = 20,
    search?: string,
    categoryId?: string,
    sellerId?: string,
    status?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (categoryId && categoryId !== 'all') where.categoryId = categoryId;
    if (sellerId && sellerId !== 'all') {
      where.seller = { userId: sellerId };
    }
    if (status && status !== 'all' && Object.values(ProductStatus).includes(status as any)) {
      where.status = status as ProductStatus;
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, name: true } },
          seller: { select: { id: true, storeName: true, storeSlug: true, userId: true } },
          images: { where: { isPrimary: true }, take: 1 },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { products, total, page, limit };
  }

  async updateProduct(id: string, dto: UpdateAdminProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại');

    try {
      return await this.prisma.product.update({
        where: { id },
        data: dto,
      });
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundException('Sản phẩm không tồn tại');
      throw e;
    }
  }

  async deleteProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại');

    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (e: any) {
      // P2003 is Prisma's foreign key constraint error code
      if (e?.code === 'P2003') {
        throw new BadRequestException(
          'Không thể xóa sản phẩm này vì đã có dữ liệu liên quan (đơn hàng, đánh giá, v.v.). Vui lòng chuyển trạng thái sang "ẨN" thay vì xóa.',
        );
      }
      throw e;
    }

    return { message: `Đã xóa sản phẩm: ${product.name}` };
  }
}
