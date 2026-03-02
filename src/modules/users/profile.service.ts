import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { UpdateSettingsDto } from './dto/settings.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  private formatUser(user: any) {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      userType: user.userType,
      isEmailVerified: user.isEmailVerified,
      memberSince: user.memberSince,
      createdAt: user.createdAt,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return { user: this.formatUser(user) };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: any = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.avatar !== undefined) data.avatar = dto.avatar;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    return { user: this.formatUser(user) };
  }

  // ─── Addresses ──────────────────────────────────────────────────────────────

  async getAddresses(userId: string) {
    const addresses = await this.prisma.shippingAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return { addresses };
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    if (dto.isDefault) {
      await this.prisma.shippingAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const address = await this.prisma.shippingAddress.create({
      data: {
        userId,
        label: dto.label ?? 'Home',
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
        street: dto.street,
        city: dto.city,
        state: dto.state,
        zip: dto.zip,
        country: dto.country ?? 'United States',
        isDefault: dto.isDefault ?? false,
      },
    });

    return { address };
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto) {
    const existing = await this.prisma.shippingAddress.findFirst({
      where: { id: addressId, userId },
    });
    if (!existing) throw new NotFoundException('Address not found');

    if (dto.isDefault) {
      await this.prisma.shippingAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const data: any = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.street !== undefined) data.street = dto.street;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.state !== undefined) data.state = dto.state;
    if (dto.zip !== undefined) data.zip = dto.zip;
    if (dto.country !== undefined) data.country = dto.country;
    if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;

    const address = await this.prisma.shippingAddress.update({
      where: { id: addressId },
      data,
    });

    return { address };
  }

  async deleteAddress(userId: string, addressId: string) {
    const existing = await this.prisma.shippingAddress.findFirst({
      where: { id: addressId, userId },
    });
    if (!existing) throw new NotFoundException('Address not found');

    await this.prisma.shippingAddress.delete({ where: { id: addressId } });

    return {};
  }

  // ─── Payment Methods ─────────────────────────────────────────────────────────

  async getPaymentMethods(userId: string) {
    const paymentMethods = await this.prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return { paymentMethods };
  }

  async deletePaymentMethod(userId: string, methodId: string) {
    const existing = await this.prisma.paymentMethod.findFirst({
      where: { id: methodId, userId },
    });
    if (!existing) throw new NotFoundException('Payment method not found');

    await this.prisma.paymentMethod.delete({ where: { id: methodId } });

    return {};
  }

  // ─── Settings ────────────────────────────────────────────────────────────────

  async getSettings(userId: string) {
    let settings = await this.prisma.userSettings.findUnique({ where: { userId } });

    if (!settings) {
      settings = await this.prisma.userSettings.create({ data: { userId } });
    }

    return { settings };
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const data: any = {};
    const fields = [
      'emailNotifications',
      'orderUpdates',
      'promotionalEmails',
      'priceDropAlerts',
      'pushNotifications',
      'language',
      'currency',
      'darkMode',
      'showRecommendations',
      'twoFactorEnabled',
    ] as const;

    for (const field of fields) {
      if ((dto as any)[field] !== undefined) {
        data[field] = (dto as any)[field];
      }
    }

    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    return { settings };
  }
}
