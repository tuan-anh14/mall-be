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
  private couponsCache: string = '';
  private lastCouponFetch: number = 0;
  private readonly COUPON_CACHE_TTL = 600000; // 10 minutes cache
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

  // Fetch Coupons realtime with simple caching to prevent DB congestion
  private async fetchActiveCoupons() {
    const now = Date.now();
    if (this.couponsCache && (now - this.lastCouponFetch < this.COUPON_CACHE_TTL)) {
      return this.couponsCache;
    }

    try {
      const coupons = await this.prisma.coupon.findMany({
        where: { isActive: true },
        select: { code: true, type: true, value: true, minOrderAmount: true } // Only fetch what's needed
      });

      if (coupons.length === 0) {
        this.couponsCache = 'Hiện không có mã giảm giá nào.';
      } else {
        this.couponsCache = coupons.map(c => `- Mã: ${c.code} | Giảm: ${c.value} | Đơn tối thiểu: ${c.minOrderAmount || 0}`).join('\n');
      }

      this.lastCouponFetch = now;
      return this.couponsCache;
    } catch (e) {
      this.logger.error('Error fetching coupons', e);
      return this.couponsCache || 'Không lấy được mã giảm giá.';
    }
  }

  // BÍ THUẬT 1: Lọc màng sô (Pre-filtering)
  private preFilterProducts(userQuery: string): string {
    if (!userQuery || userQuery.length < 3 || this.productsCache.length === 0) return 'Không có thông tin sản phẩm cụ thể.';

    const query = userQuery.toLowerCase();
    
    // Check if query is likely a product search/question
    const productKeywords = ['có', 'bán', 'mua', 'giá', 'nhiều', 'vga', 'card', 'laptop', 'chuột', 'phím', 'màn hình', 'cpu', 'ram', 'ổ cứng'];
    const isProductRelated = productKeywords.some(k => query.includes(k));
    if (!isProductRelated && userQuery.length < 10) return 'Khách chưa hỏi về sản phẩm cụ thể.';

    const keywords = query.split(' ').filter(k => k.length > 2);

    const scoredProducts = this.productsCache.map(p => {
      let score = 0;
      const searchableStr = (p.name + ' ' + p.brand + ' ' + (p.description || '')).toLowerCase();
      keywords.forEach(k => {
        if (searchableStr.includes(k)) score += 2;
      });
      // Bonus if brand matches
      if (p.brand && query.includes(p.brand.toLowerCase())) score += 3;
      
      return { product: p, score };
    });

    const matched = scoredProducts
      .filter(ps => ps.score > 2) // Higher threshold
      .sort((a, b) => b.score - a.score)
      .map(ps => ps.product)
      .slice(0, 4); // Take top 4 for brevity

    if (matched.length === 0) return 'Không tìm thấy sản phẩm nào khớp hoàn toàn.';

    return matched.map(m => `- ${m.name} (${m.brand})\n  Giá: ${m.price.toLocaleString('vi-VN')} VND\n  Tình trạng: ${m.stock > 0 ? 'Còn hàng' : 'Hết hàng'}`).join('\n\n');
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

    // Prepare Context Injection - Optimize: only fetch if needed
    const currentDateTime = new Date().toLocaleString('vi-VN');
    const needsCoupons = userQuery.toLowerCase().match(/(giảm giá|khuyến mãi|coupon|mã|voucher)/);
    const activeCouponsStr = needsCoupons ? await this.fetchActiveCoupons() : 'Chỉ cung cấp khi khách hỏi về khuyến mãi.';
    
    // Only pre-filter if the query is not a simple greeting
    const isGreeting = userQuery.length < 5 || userQuery.toLowerCase().match(/^(hi|hello|chào|xin chào)$/);
    const filteredProductsStr = isGreeting ? 'Khách chỉ đang chào hỏi.' : this.preFilterProducts(userQuery);

    const systemInstruction = `
Bạn là "ShopHub AI" - Trợ lý bán hàng chuyên nghiệp của ShopHub. 
NGỮ CẢNH HỆ THỐNG:
- Thời gian: ${currentDateTime}
- MÃ GIẢM GIÁ: ${activeCouponsStr}
- SẢN PHẨM PHÙ HỢP: ${filteredProductsStr}

QUY TẮC PHẢN HỒI (RẤT QUAN TRỌNG):
1. ĐỊNH DẠNG: Trả lời bằng văn bản thuần túy, rõ ràng. Xuống dòng (dùng \\n) hợp lý để phân tách các ý. 
2. TRÁNH KÝ TỰ ĐẶC BIỆT: Tuyệt đối KHÔNG dùng các ký tự như **, *, #, hoặc nội dung nằm trong [ ]. Không dùng thẻ HTML <a>.
3. NGÔN NGỮ: Lịch sự, thân thiện, ngắn gọn, đúng trọng tâm. 
4. NỘI DUNG: Chỉ dùng thông tin trong NGỮ CẢNH để trả lời. Nếu không có thông tin, hãy khéo léo từ chối hoặc yêu cầu khách cung cấp thêm chi tiết.
5. QUY TRÌNH: Tư vấn nhiệt tình -> Gợi ý sản phẩm phù hợp -> Giải đáp thắc mắc về chính sách.
6. CHÍNH SÁCH: Hủy đơn (khi PENDING), Đổi trả (7 ngày), Thanh toán (VNPAY, Wallet, COD).
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
