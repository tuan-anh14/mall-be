import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { NotificationType } from 'generated/prisma/client';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { NotificationSseService } from './notification-sse.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sse: NotificationSseService,
  ) {}

  async createNotification(params: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    actionPage?: string;
    actionData?: any;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        actionPage: params.actionPage,
        actionData: params.actionData,
      },
    });
    // Push SSE event to the target user
    this.sse.push({
      userId: params.userId,
      type: 'notification',
      data: { notification },
    });
    return notification;
  }

  async getNotifications(userId: string, query: QueryNotificationsDto) {
    const { page, limit, type, isRead } = query;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (type) where.type = type as NotificationType;
    if (isRead !== undefined) where.isRead = isRead;

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      notifications,
      total,
      page,
      limit,
      totalPages,
      unreadCount,
    };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    return { notification: updated };
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return {};
  }

  async deleteNotification(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    await this.prisma.notification.delete({ where: { id: notificationId } });

    return {};
  }
}
