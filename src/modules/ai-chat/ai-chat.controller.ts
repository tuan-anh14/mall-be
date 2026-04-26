import { Controller, Post, Body, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { AiChatService } from './ai-chat.service';
import { Public } from '@/common/decorators/public.decorator';
import { GenerateDescriptionDto } from './dto/generate-description.dto';
import { Content } from '@google/generative-ai';

@Controller('ai-chat')
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async chat(@Body() body: { message: string }) {
    const response = await this.aiChatService.generateResponse(body.message);
    return {
      message: response,
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Post('stream')
  async chatStream(@Body() body: { history: Content[] }, @Res() res: any) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const stream = await this.aiChatService.generateResponseStream(body.history);
      for await (const chunk of stream) {
         const textChunk = chunk.text();
         if (textChunk) {
            res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
         }
      }
      res.end();
    } catch (error) {
      console.error("Stream SSE Controller Error: ", error);
      res.write(`data: ${JSON.stringify({ text: "Hệ thống AI đang bảo trì." })}\n\n`);
      res.end();
    }
  }

  @Public()
  @Post('generate-description')
  @HttpCode(HttpStatus.OK)
  async generateDescription(@Body() dto: GenerateDescriptionDto) {
    const description = await this.aiChatService.generateProductDescription(dto);
    return {
      description,
      timestamp: new Date().toISOString(),
    };
  }
}
