import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { GenerateDescriptionDto } from './dto/generate-description.dto';

@Injectable()
export class AiChatService implements OnModuleInit {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(private configService: ConfigService) { }

  onModuleInit() {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not defined in the configuration. AI Chat will not work.');
      return;
    }

    const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';
    const systemInstruction = this.configService.get<string>('GEMINI_SYSTEM_INSTRUCTION') || 'Bạn là trợ lý ảo của ShopMall.';

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemInstruction,
    });
  }

  async generateResponse(message: string): Promise<string> {
    if (!this.model) {
      return 'Xin lỗi, hiện tại trợ lý AI đang gặp sự cố kỹ thuật. Vui lòng thử lại sau.';
    }

    try {
      const result = await this.model.generateContent(message);
      const response = await result.response;
      const text = response.text();
      return this.cleanResponse(text);
    } catch (error) {
      console.error('Gemini API Error:', error);
      return 'Tôi gặp chút vấn đề khi kết nối, bạn hãy hỏi lại nhé!';
    }
  }

  private cleanResponse(text: string): string {
    return text
      .replace(/[#*`_~]/g, '') // Strip Markdown symbols
      .replace(/\|.*\|/g, '') // Strip table-like rows
      .replace(/-{3,}/g, '') // Strip horizontal rules
      .trim();
  }

  async generateProductDescription(dto: GenerateDescriptionDto): Promise<string> {
    if (!this.model) {
      throw new Error('AI Model not initialized');
    }

    const { name, brand, categoryName, specifications, colors, sizes, additionalInstructions } = dto;

    const specsText = specifications?.length
      ? specifications.map(s => `- ${s.key}: ${s.value}`).join('\n')
      : 'Không có';
    const colorsText = colors?.length ? colors.join(', ') : 'Không có';
    const sizesText = sizes?.length ? sizes.join(', ') : 'Không có';

    const prompt = `
Bạn là một chuyên gia viết nội dung quảng cáo (copywriter) chuyên nghiệp cho sàn thương mại điện tử ShopMall. 

NHIỆM VỤ CỦA BẠN: Viết mô tả sản phẩm dựa trên các dữ liệu đầu vào.
DỮ LIỆU ĐẦU VÀO:
- Tên sản phẩm: ${name}
- Thương hiệu: ${brand || 'N/A'}
- Danh mục: ${categoryName || 'N/A'}
- Thông số kỹ thuật:
${specsText}
- Màu sắc: ${colorsText}
- Kích cỡ: ${sizesText}

${additionalInstructions ? `YÊU CẦU BỔ SUNG TỪ NGƯỜI DÙNG:
"${additionalInstructions}"` : ''}

YÊU CẦU VỀ NỘI DUNG:
1. Tiêu đề: Phải hấp dẫn, chứa tên sản phẩm và điểm mạnh nhất.
2. Giới thiệu: 1-2 câu lôi cuốn.
3. Đặc điểm nổi bật: Liệt kê ít nhất 3-5 điểm mạnh/lợi ích của sản phẩm dựa trên thông số đã cho.
4. Chi tiết kỹ thuật: Trình bày một cách chuyên nghiệp bằng danh sách gạch đầu dòng (-). KHÔNG DÙNG BẢNG.
5. Lời kết: Thúc đẩy hành động mua hàng (CTA).

LƯU Ý QUAN TRỌNG:
- Trình bày bằng VĂN BẢN THUẦN TÚY, KHÔNG ĐƯỢC sử dụng định dạng Markdown (KHÔNG bôi đậm **, KHÔNG dùng đề mục ###, KHÔNG kẻ bảng).
- Nếu thông tin đầu vào (thông số) quá ít, hãy cố gắng phân tích dựa trên tên sản phẩm nhưng KHÔNG ĐƯỢC bịa đặt các số liệu kỹ thuật cụ thể (như Dung lượng pin, CPU...) nếu chưa chắc chắn. Thay vào đó, hãy dùng lời văn mô tả phong cách, sự tiện lợi hoặc cảm giác sử dụng.
- Ưu tiên thực hiện theo "YÊU CẦU BỔ SUNG" nếu có.
- Ngôn ngữ: Tiếng Việt.
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      return this.cleanResponse(text);

    } catch (error) {
      console.error('Gemini Generate Description Error:', error);
      throw new Error('Không thể tạo mô tả sản phẩm bằng AI. Vui lòng thử lại sau.');
    }
  }
}
