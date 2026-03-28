import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { OrderStatus, ProductStatus, UserType } from 'generated/prisma/client';

@Injectable()
export class SellerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new ForbiddenException('Seller profile not found');
    return profile;
  }

  async checkActiveOrders(sellerProfileId: string) {
    const activeOrders = await this.prisma.order.count({
      where: {
        status: {
          notIn: [
            OrderStatus.DELIVERED,
            OrderStatus.CANCELLED,
            OrderStatus.REFUNDED,
          ],
        },
        items: {
          some: {
            product: {
              sellerId: sellerProfileId,
            },
          },
        },
      },
    });

    if (activeOrders > 0) {
      throw new BadRequestException(
        `You have ${activeOrders} active orders. Please complete or cancel them before changing store status.`,
      );
    }
  }

  async toggleSuspension(userId: string) {
    const profile = await this.getProfile(userId);

    // If suspending (currently active), check for orders
    if (!profile.isSuspended) {
      await this.checkActiveOrders(profile.id);

      // Suspend
      await this.prisma.$transaction(async (tx) => {
        await tx.sellerProfile.update({
          where: { id: profile.id },
          data: { isSuspended: true },
        });

        // Hide all active products
        await tx.product.updateMany({
          where: { sellerId: profile.id, status: ProductStatus.ACTIVE },
          data: { status: ProductStatus.INACTIVE },
        });
      });

      return {
        message: 'Store suspended successfully. All active products are now hidden.',
        isSuspended: true,
      };
    } else {
      // Reopen
      await this.prisma.sellerProfile.update({
        where: { id: profile.id },
        data: { isSuspended: false },
      });

      return {
        message: 'Store reopened successfully. You can now reactivate your products.',
        isSuspended: false,
      };
    }
  }

  async closeStore(userId: string) {
    const profile = await this.getProfile(userId);

    if (profile.isClosed) {
      throw new BadRequestException('Store is already closed.');
    }

    await this.checkActiveOrders(profile.id);

    await this.prisma.$transaction(async (tx) => {
      // Revert user type to BUYER
      await tx.user.update({
        where: { id: userId },
        data: { userType: UserType.BUYER },
      });

      // Mark store as closed
      await tx.sellerProfile.update({
        where: { id: profile.id },
        data: { isClosed: true, isSuspended: true },
      });

      // Inactivate all products
      await tx.product.updateMany({
        where: { sellerId: profile.id },
        data: { status: ProductStatus.INACTIVE },
      });

      // Reject any pending seller requests
      await tx.sellerRequest.updateMany({
        where: { userId, status: 'APPROVED' },
        data: { status: 'REJECTED', adminNote: 'Owner closed the store.' },
      });
    });

    return {
      message: 'Store closed successfully. Your account has reverted to Buyer role.',
      isClosed: true,
    };
  }
}
