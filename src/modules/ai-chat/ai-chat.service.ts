import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel, Content } from '@google/generative-ai';
import { GenerateDescriptionDto } from './dto/generate-description.dto';
import { PrismaService } from '@/database/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

export interface ChatHistoryPayload {
  history: Content[];
}

@Injectable()
export class AiChatService implements OnModuleInit {
  private genAI: GoogleGenerativeAI;
  private defaultModel: GenerativeModel;
  private readonly logger = new Logger(AiChatService.name);
  private productsCache: any[] = [];
  private apiKey: string;
  private modelName: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService, // Inject Prisma for live Coupons
  ) { }

  onModuleInit() {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') || process.env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      this.logger.warn('GEMINI_API_KEY is not defined in the configuration. AI Chat will not work.');
      return;
    }

    this.modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';
    const systemInstruction = this.configService.get<string>('GEMINI_SYSTEM_INSTRUCTION') || 'Bạn là trợ lý ảo của ShopMall.';

    this.genAI = new GoogleGenerativeAI(this.apiKey);
    
    // Default model used for old non-streaming endpoints & generateDescription
    this.defaultModel = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: systemInstruction,
    });

    this.loadProductsJSON();
  }

  // BÍ THUẬT 2: Ép cân dữ liệu (Minify JSON lên RAM)
  private loadProductsJSON() {
    try {
      const filePath = path.join(process.cwd(), 'src', 'modules', 'ai-chat', 'data', 'product.json');
      if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const parsedData = JSON.parse(rawData);
        
        // Strip out useless fields like ID, SKU, timestamps to save Context limit
        this.productsCache = parsedData.map(p => ({
          name: p.name,
          slug: p.slug,
          price: Number(p.price) || 0,
          originalPrice: Number(p.originalPrice) || 0,
          brand: p.brand || 'ShopHub',
          stock: Number(p.stock) || 0,
          status: p.status,
          description: p.description?.substring(0, 100) + '...' // Only keep short desc
        }));
        this.logger.log(`Loaded ${this.productsCache.length} products from JSON into memory for RAG.`);
      } else {
        this.logger.warn('product.json not found in data directory.');
      }
    } catch (e) {
      this.logger.error('Failed to load product.json', e);
    }
  }

  // Fetch Coupons realtime from DB
  private async fetchActiveCoupons() {
     try {
       const coupons = await this.prisma.coupon.findMany({
         where: { isActive: true },
       });
       if(coupons.length === 0) return 'Hiện không có mã giảm giá nào.';
       return coupons.map(c => `- Mã: ${c.code} | Loại: ${c.type} | Giảm: ${c.value} | Đơn tối thiểu: ${c.minOrderAmount || 0}`).join('\n');
     } catch (e) {
       this.logger.error('Error fetching coupons', e);
       return 'Không lấy được mã giảm giá.';
     }
  }

  // BÍ THUẬT 1: Lọc màng sô (Pre-filtering)
  private preFilterProducts(userQuery: string): string {
    if (!userQuery || this.productsCache.length === 0) return 'Không có sản phẩm nào.';
    
    const query = userQuery.toLowerCase();
    const keywords = query.split(' ').filter(k => k.length > 2); // Simple keyword tokenization
    
    // Sort products by keyword matches
    const scoredProducts = this.productsCache.map(p => {
      let score = 0;
      const searchableStr = (p.name + ' ' + p.brand + ' ' + p.description).toLowerCase();
      keywords.forEach(k => {
        if (searchableStr.includes(k)) score++;
      });
      return { product: p, score };
    });

    const matched = scoredProducts
       .filter(ps => ps.score > 0)
       .sort((a, b) => b.score - a.score)
       .map(ps => ps.product)
       .slice(0, 5); // Take top 5 ONLY

    if (matched.length === 0) return 'Không tìm thấy sản phẩm nào khớp với từ khóa của khách.';

    return matched.map(m => `- [${m.brand}] ${m.name}\n  Giá bán: ${m.price.toLocaleString('vi-VN')} VND (Gốc: ${m.originalPrice.toLocaleString('vi-VN')} VND)\n  Tình trạng: ${m.stock > 0 ? 'Còn hàng' : 'Hết hàng'}\n  Link (sử dụng cái này): <a href="/product/${m.slug}">Xem ngay</a>`).join('\n\n');
  }

  // ==== HIGH PERFORMANCE RAG-LITE STREAMING ====
  async generateResponseStream(history: Content[]) {
    if (!history || history.length === 0) {
      throw new Error('History is required');
    }

    // Identify last user message
    const lastMessage = history[history.length - 1];
    let userQuery = '';
    if (lastMessage && lastMessage.role === 'user') {
      userQuery = lastMessage.parts.map(p => p.text).join(' ');
    }

    // Prepare Context Injection
    const currentDateTime = new Date().toISOString();
    const activeCouponsStr = await this.fetchActiveCoupons();
    const filteredProductsStr = this.preFilterProducts(userQuery);

    const systemInstruction = `
Bạn là "Trợ lý ảo ShopHub", đại diện cho ShopHub tư vấn bán hàng. Tên bạn là ShopHub AI.
NGỮ CẢNH DỮ LIỆU THỰC TẾ (Sử dụng dữ liệu này để trả lời khách, KHÔNG bịa ra data khác):
- Thời gian hệ thống: ${currentDateTime}
- CÁC MÃ GIẢM GIÁ (COUPON) ĐANG CÓ HIỆU LỰC:
${activeCouponsStr}
- SẢN PHẨM KHỚP VỚI CÂU HỎI HIỆN TẠI CỦA KHÁCH:
${filteredProductsStr}

QUY TẮC BẮT BUỘC:
1. Đa lượt (Multi-turn): Dựa vào lịch sử chat để biết ngữ cảnh. Dẫn dắt khách theo tiến trình: Nhu cầu -> Ngân sách -> Gợi ý chốt đơn. KHÔNG lặp lại câu hỏi khách đã trả lời.
2. Chính sách Hủy đơn: Chỉ được hủy khi đơn ở trạng thái PENDING.
3. Chính sách Đổi trả: Trong vòng 7 ngày (Trạng thái đơn: RETURN_REQUESTED).
4. Thanh toán: Hỗ trợ VNPAY, MOMO, Thẻ tín dụng, Wallet Nội bộ và Tiền mặt (COD). KHÔNG hỗ trợ phương thức khác.
5. Gợi ý Link: Khi gợi ý sản phẩm, BẮT BUỘC tạo the HTML <a href="..."> dựa vào đường dẫn Link được cung cấp trong khối SẢN PHẨM KHỚP.
6. Hướng dẫn định dạng: Định dạng bằng Markdown bình thường (dùng *đậm*, \n xuống dòng) để UI render đẹp nhất.
`;

    const modelWithContext = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: systemInstruction,
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 2048,
      }
    });

    try {
      // Stream directly based on full sliding window history
      const result = await modelWithContext.generateContentStream({ contents: history });
      return result.stream;
    } catch (error) {
       this.logger.error('Gemini Generate Stream Error:', error);
       throw new Error('Lỗi từ AI hoặc cấu hình API sai.');
    }
  }

  // ========================== OLD APIS ==========================
  async generateResponse(message: string): Promise<string> {
    if (!this.defaultModel) return 'Xin lỗi, AI đang gặp sự cố.';
    try {
      const result = await this.defaultModel.generateContent(message);
      // Giữ nguyên hàm cleanResponse cũ cho tương thích nếu frontend cũ vẫn dùng API /chat
      return this.cleanResponse(result.response.text());
    } catch (error) {
      this.logger.error(error);
      return 'Lỗi kết nối AI.';
    }
  }

  private cleanResponse(text: string): string {
    return text.replace(/[#*`~]/g, '').replace(/\|.*\|/g, '').replace(/-{3,}/g, '').trim();
  }

  async generateProductDescription(dto: GenerateDescriptionDto): Promise<string> {
    if (!this.defaultModel) throw new Error('AI Model not initialized');

    const { name, brand, categoryName, specifications, colors, sizes, additionalInstructions } = dto;

    const specsText = specifications?.length
      ? specifications.map(s => `- ${s.key}: ${s.value}`).join('\n')
      : 'Không có';
    const colorsText = colors?.length ? colors.join(', ') : 'Không có';
    const sizesText = sizes?.length ? sizes.join(', ') : 'Không có';

    const prompt = `Bạn là chuyên gia copywriter cho ShopMall. 
Tên sản phẩm: ${name}
Thương hiệu: ${brand || 'N/A'}
Danh mục: ${categoryName || 'N/A'}
Thông số: ${specsText}
Màu: ${colorsText}
Kích cỡ: ${sizesText}
Yêu cầu thêm: ${additionalInstructions || 'Không'}
Viết bài mô tả gồm: 1 câu tiêu đề, giới thiệu, 3-5 điểm nổi bật, chi tiết kỹ thuật gạch đầu dòng, lời kết CTA. KHÔNG dùng markdown.`;

    try {
      const result = await this.defaultModel.generateContent(prompt);
      return this.cleanResponse(result.response.text());
    } catch (error) {
      this.logger.error(error);
      throw new Error('Không thể tạo mô tả.');
    }
  }
}
