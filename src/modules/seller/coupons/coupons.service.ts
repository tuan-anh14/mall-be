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

  private async getSellerProfile(userId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new ForbiddenException('Bạn chưa có hồ sơ người bán');
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
      },
    });
  }

  async deleteCoupon(userId: string, couponId: string) {
    const profile = await this.getSellerProfile(userId);

    const coupon = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!coupon) throw new NotFoundException('Mã giảm giá không tồn tại');
    if (coupon.sellerId !== profile.id) {
      throw new ForbiddenException('Bạn không có quyền xóa mã này');
    }

    await this.prisma.coupon.delete({ where: { id: couponId } });
    return { message: 'Đã xóa mã giảm giá' };
  }
}
