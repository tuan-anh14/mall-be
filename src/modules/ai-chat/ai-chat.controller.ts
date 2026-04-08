import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AiChatService } from './ai-chat.service';
import { Public } from '@/common/decorators/public.decorator';
import { GenerateDescriptionDto } from './dto/generate-description.dto';

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
