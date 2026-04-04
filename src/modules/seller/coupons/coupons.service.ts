import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { CreateSellerCouponDto, UpdateSellerCouponDto } from './dto/coupon.dto';

@Injectable()
export class SellerCouponsService {
  constructor(private readonly prisma: PrismaService) {}

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
      if (!profile) {
        throw new ForbiddenException('Bạn chưa có hồ sơ người bán');
      }
    }
    return profile;
  }

  async getCoupons(userId: string, page = 1, limit = 20) {
    const profile = await this.getSellerProfile(userId);
    const skip = (page - 1) * limit;

    const [coupons, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where: { sellerId: profile.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.coupon.count({ where: { sellerId: profile.id } }),
    ]);

    return { coupons, total, page, limit };
  }

  async createCoupon(userId: string, dto: CreateSellerCouponDto) {
    const profile = await this.getSellerProfile(userId);
    this.validateCouponPayload(dto);

    const existing = await this.prisma.coupon.findUnique({
      where: { code: dto.code.toUpperCase() },
    });
    if (existing) {
      throw new BadRequestException('Mã giảm giá này đã tồn tại');
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        code: dto.code.toUpperCase(),
        type: dto.type as any,
        value: dto.value,
        minOrderAmount: dto.minOrderAmount ?? null,
        maxDiscount: dto.maxDiscount ?? null,
        usageLimit: dto.usageLimit ?? null,
        validFrom: new Date(dto.validFrom),
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        isActive: dto.isActive ?? true,
        isVisible: dto.isVisible ?? true,
        sellerId: profile.id,
      },
    });

    return coupon;
  }

  async updateCoupon(userId: string, couponId: string, dto: UpdateSellerCouponDto) {
    const profile = await this.getSellerProfile(userId);

    const coupon = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!coupon) throw new NotFoundException('Mã giảm giá không tồn tại');
    if (coupon.sellerId !== profile.id) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa mã này');
    }

    if (dto.code && dto.code.toUpperCase() !== coupon.code) {
      const existing = await this.prisma.coupon.findUnique({
        where: { code: dto.code.toUpperCase() },
      });
      if (existing) throw new BadRequestException('Mã giảm giá này đã tồn tại');
    }

    this.validateCouponPayload({
      type: dto.type ?? coupon.type,
      value: dto.value ?? Number(coupon.value),
      minOrderAmount:
        dto.minOrderAmount !== undefined
          ? dto.minOrderAmount
          : coupon.minOrderAmount != null
            ? Number(coupon.minOrderAmount)
            : undefined,
      maxDiscount:
        dto.maxDiscount !== undefined
          ? dto.maxDiscount
          : coupon.maxDiscount != null
            ? Number(coupon.maxDiscount)
            : undefined,
      usageLimit: dto.usageLimit ?? coupon.usageLimit ?? undefined,
      validFrom: dto.validFrom ?? coupon.validFrom.toISOString(),
      validUntil:
        dto.validUntil !== undefined
          ? dto.validUntil || undefined
          : coupon.validUntil?.toISOString(),
    });

    return this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        ...(dto.code && { code: dto.code.toUpperCase() }),
        ...(dto.type && { type: dto.type as any }),
        ...(dto.value !== undefined && { value: dto.value }),
        ...(dto.minOrderAmount !== undefined && { minOrderAmount: dto.minOrderAmount }),
        ...(dto.maxDiscount !== undefined && { maxDiscount: dto.maxDiscount }),
        ...(dto.usageLimit !== undefined && { usageLimit: dto.usageLimit }),
        ...(dto.validFrom && { validFrom: new Date(dto.validFrom) }),
        ...(dto.validUntil !== undefined && {
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isVisible !== undefined && { isVisible: dto.isVisible }),
      },
    });
  }

  async deleteCoupon(userId: string, couponId: string) {
    const profile = await this.getSellerProfile(userId);

    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId },
      select: {
        id: true,
        sellerId: true,
        isActive: true,
        _count: { select: { usages: true } },
      },
    });
    if (!coupon) throw new NotFoundException('Mã giảm giá không tồn tại');
    if (coupon.sellerId !== profile.id) {
      throw new ForbiddenException('Bạn không có quyền xóa mã này');
    }

    if (coupon._count.usages > 0 && coupon.isActive) {
      await this.prisma.coupon.update({
        where: { id: couponId },
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

    await this.prisma.coupon.delete({ where: { id: couponId } });
    return { message: 'Đã xóa mã giảm giá' };
  }
}
