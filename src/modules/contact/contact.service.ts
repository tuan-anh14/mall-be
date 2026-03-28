import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { EmailService } from 'src/shared/email/email.service';
import { CreateContactDto, ReplyContactDto } from './dto/contact.dto';
import { ContactStatus } from 'generated/prisma/client';

@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) { }

  async create(createContactDto: CreateContactDto) {
    return this.prisma.contactMessage.create({
      data: {
        ...createContactDto,
        status: ContactStatus.PENDING,
      },
    });
  }

  async findAll(page = 1, limit = 10, status?: ContactStatus) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [items, total] = await Promise.all([
      this.prisma.contactMessage.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contactMessage.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const contact = await this.prisma.contactMessage.findUnique({
      where: { id },
    });

    if (!contact) {
      throw new NotFoundException('Không tìm thấy tin nhắn liên hệ');
    }

    return contact;
  }

  async reply(id: string, replyDto: ReplyContactDto, adminId: string) {
    const contact = await this.findOne(id);

    // 1. Send Email
    await this.emailService.sendContactReplyEmail(
      contact.email,
      contact.name,
      contact.subject,
      contact.message,
      replyDto.replyText,
      replyDto.attachments,
    );

    // 2. Update status and save reply record
    return this.prisma.contactMessage.update({
      where: { id },
      data: {
        status: ContactStatus.REPLIED,
        adminReply: replyDto.replyText,
        adminReplyAt: new Date(),
        adminReplyBy: adminId,
        adminReplyAttachments: replyDto.attachments || [],
      },
    });
  }

  async updateStatus(id: string, status: ContactStatus) {
    await this.findOne(id);
    return this.prisma.contactMessage.update({
      where: { id },
      data: { status },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.contactMessage.delete({
      where: { id },
    });
  }
}
