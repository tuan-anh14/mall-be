import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

@Injectable()
export class AiChatService implements OnModuleInit {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not defined in the configuration. AI Chat will not work.');
      return;
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: 'Bạn là trợ lý ảo của ShopHub, một sàn thương mại điện tử hiện đại. Hãy trả lời thân thiện, hỗ trợ khách hàng về sản phẩm, vận chuyển và chia sẻ trải nghiệm mua sắm. Trả lời bằng tiếng Việt, ngắn gọn, súc tích và có sử dụng icon phù hợp.',
    });
  }

  async generateResponse(message: string): Promise<string> {
    if (!this.model) {
      return 'Xin lỗi, hiện tại trợ lý AI đang gặp sự cố kỹ thuật. Vui lòng thử lại sau.';
    }

    try {
      const result = await this.model.generateContent(message);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Gemini API Error:', error);
      return 'Tôi gặp chút vấn đề khi kết nối, bạn hãy hỏi lại nhé!';
    }
  }
}
