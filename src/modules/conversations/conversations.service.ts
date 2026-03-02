import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { MessageStatus } from 'generated/prisma/client';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { PaginationDto } from '@/common/dto/pagination.dto';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  private formatConversation(conv: any, userId: string) {
    const isBuyer = conv.buyerId === userId;
    const otherUser = isBuyer ? conv.seller : conv.buyer;
    const unreadCount = isBuyer ? conv.buyerUnreadCount : conv.sellerUnreadCount;

    return {
      id: conv.id,
      otherUser: otherUser
        ? {
            id: otherUser.id,
            name: `${otherUser.firstName} ${otherUser.lastName}`,
            avatar: otherUser.avatar,
          }
        : null,
      product: conv.product
        ? {
            id: conv.product.id,
            name: conv.product.name,
            image: conv.product.images?.[0]?.url ?? null,
          }
        : null,
      lastMessage: conv.lastMessage,
      lastMessageAt: conv.lastMessageAt,
      unreadCount,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  }

  async getConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      include: {
        buyer: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        seller: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        product: {
          select: {
            id: true,
            name: true,
            images: { where: { isPrimary: true }, take: 1 },
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return {
      conversations: conversations.map((c) => this.formatConversation(c, userId)),
    };
  }

  async createOrGetConversation(userId: string, dto: CreateConversationDto) {
    // Validate seller exists
    const seller = await this.prisma.user.findUnique({
      where: { id: dto.sellerId },
      select: { id: true, userType: true },
    });

    if (!seller) throw new NotFoundException('Seller not found');
    if (userId === dto.sellerId) {
      throw new BadRequestException('Cannot create conversation with yourself');
    }

    // Look for existing conversation
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        buyerId: userId,
        sellerId: dto.sellerId,
        productId: dto.productId ?? null,
      },
      include: {
        buyer: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        seller: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        product: {
          select: {
            id: true,
            name: true,
            images: { where: { isPrimary: true }, take: 1 },
          },
        },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          buyerId: userId,
          sellerId: dto.sellerId,
          productId: dto.productId ?? null,
        },
        include: {
          buyer: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          seller: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          product: {
            select: {
              id: true,
              name: true,
              images: { where: { isPrimary: true }, take: 1 },
            },
          },
        },
      });
    }

    // Send initial message if provided
    if (dto.message) {
      await this.sendMessage(userId, conversation.id, { text: dto.message });
    }

    // Re-fetch if we sent a message to get updated lastMessage
    if (dto.message) {
      conversation = await this.prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: {
          buyer: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          seller: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          product: {
            select: {
              id: true,
              name: true,
              images: { where: { isPrimary: true }, take: 1 },
            },
          },
        },
      });
    }

    return { conversation: this.formatConversation(conversation, userId) };
  }

  async getMessages(userId: string, conversationId: string, query: PaginationDto) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) throw new NotFoundException('Conversation not found');

    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId, isDeleted: false },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.message.count({
        where: { conversationId, isDeleted: false },
      }),
    ]);

    // Mark messages as read for current user
    const isBuyer = conversation.buyerId === userId;
    if (isBuyer && conversation.buyerUnreadCount > 0) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { buyerUnreadCount: 0 },
      });
    } else if (!isBuyer && conversation.sellerUnreadCount > 0) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { sellerUnreadCount: 0 },
      });
    }

    const totalPages = Math.ceil(total / limit);

    return {
      messages: messages.map((m) => ({
        id: m.id,
        text: m.text,
        status: m.status,
        attachmentUrl: m.attachmentUrl,
        attachmentType: m.attachmentType,
        isMine: m.senderId === userId,
        sender: {
          id: m.sender.id,
          name: `${m.sender.firstName} ${m.sender.lastName}`,
          avatar: m.sender.avatar,
        },
        createdAt: m.createdAt,
      })),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async sendMessage(userId: string, conversationId: string, dto: SendMessageDto) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) throw new NotFoundException('Conversation not found');

    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const isBuyer = conversation.buyerId === userId;

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        text: dto.text,
        status: MessageStatus.SENT,
        attachmentUrl: dto.attachmentUrl ?? null,
        attachmentType: dto.attachmentType ?? null,
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
    });

    // Update conversation with last message and increment unread for the other party
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessage: dto.text,
        lastMessageAt: new Date(),
        ...(isBuyer
          ? { sellerUnreadCount: { increment: 1 } }
          : { buyerUnreadCount: { increment: 1 } }),
      },
    });

    return {
      message: {
        id: message.id,
        text: message.text,
        status: message.status,
        attachmentUrl: message.attachmentUrl,
        attachmentType: message.attachmentType,
        isMine: true,
        sender: {
          id: message.sender.id,
          name: `${message.sender.firstName} ${message.sender.lastName}`,
          avatar: message.sender.avatar,
        },
        createdAt: message.createdAt,
      },
    };
  }
}
