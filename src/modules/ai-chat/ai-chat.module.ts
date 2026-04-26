import { Module } from '@nestjs/common';
import { AiChatController } from './ai-chat.controller';
import { AiChatService } from './ai-chat.service';
import { PrismaService } from '@/database/prisma.service';

@Module({
  controllers: [AiChatController],
  providers: [AiChatService, PrismaService],
})
export class AiChatModule {}
