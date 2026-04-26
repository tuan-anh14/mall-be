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
    const systemInstruction = this.configService.get<string>('GEMINI_SYSTEM_INSTRUCTION') || 'Bạn là trợ lý ảo của ShopHub.';

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
          brand: p.brand || 'ShopHub',
          price: Number(p.price) || 0,
          originalPrice: Number(p.originalPrice) || 0,
          discount: Number(p.discount) || 0,
          stock: Number(p.stock) || 0,
          status: p.status,
          featured: p.featured === 'true' || p.featured === true,
          trending: p.trending === 'true' || p.trending === true,
          rating: Number(p.ratingAverage) || 0,
          reviews: Number(p.reviewCount) || 0,
          description: p.description?.substring(0, 150)
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

  // BÍ THUẬT 1: Lọc màng sô (Pre-filtering) với Semantic Synonyms & Attribute Search
  private preFilterProducts(userQuery: string): string {
    if (!userQuery || userQuery.length < 2 || this.productsCache.length === 0) return 'Hiện có danh sách sản phẩm đa dạng (Laptop, VGA, Thời trang).';

    const query = userQuery.toLowerCase();

    // Check for Attribute-based queries
    const isRatingQuery = !!query.match(/(đánh giá|rating|sao|tốt nhất|uy tín|phản hồi|nhận xét)/);
    const isDiscountQuery = !!query.match(/(giảm giá|khuyến mãi|sale|rẻ|hời|discount|ưu đãi)/);
    const isTrendingQuery = !!query.match(/(hot|trend|nổi bật|bán chạy|featured)/);

    // Semantic Expansion (Synonyms)
    const synonyms: Record<string, string[]> = {
      'thời trang': ['quần', 'áo', 'váy', 'đầm', 'set bộ', 'nỉ', 'len'],
      'quần áo': ['thời trang', 'váy', 'đầm', 'áo', 'quần'],
      'vga': ['card màn hình', 'nvidia', 'rtx', 'gtx', 'amd', 'gigabyte', 'msi', 'asus'],
      'laptop': ['máy tính xách tay', 'acer', 'msi', 'lenovo', 'macbook'],
      'điện máy': ['nồi cơm', 'bếp', 'máy lọc nước', 'điều hòa', 'sunhouse'],
      'gia dụng': ['nồi', 'chảo', 'máy ép', 'máy lọc'],
      'linh kiện': ['vga', 'ram', 'cpu', 'psu', 'mainboard', 'ổ cứng'],
      'bóng đá': ['football', 'bóng', 'áo đấu']
    };

    let expandedKeywords = query.split(' ').filter(k => k.length >= 2);
    Object.entries(synonyms).forEach(([key, values]) => {
      if (query.includes(key) || values.some(v => query.includes(v))) {
        expandedKeywords = [...new Set([...expandedKeywords, key, ...values])];
      }
    });

    const scoredProducts = this.productsCache.map(p => {
      let score = 0;
      const searchableStr = `${p.name} ${p.brand} ${p.description}`.toLowerCase();

      expandedKeywords.forEach(k => {
        if (searchableStr.includes(k)) score += 2;
        if (p.name.toLowerCase().includes(k)) score += 3;
        if (p.brand.toLowerCase() === k) score += 5;
      });

      // Attribute Boosting
      if (isRatingQuery && p.rating > 0) score += (p.rating * 3); // High boost for high rating
      if (isDiscountQuery && p.discount > 0) score += 8;
      if (isTrendingQuery && (p.trending || p.featured)) score += 8;

      if (p.featured) score += 2;
      if (p.trending) score += 1;
      if (p.stock > 0) score += 1;

      return { product: p, score };
    });

    let matched = scoredProducts
      .filter(ps => ps.score > 2)
      .sort((a, b) => b.score - a.score)
      .map(ps => ps.product);

    // Fallback logic: If no specific products matched by keywords, provide Top-rated/Trending as context
    if (matched.length === 0) {
      matched = this.productsCache
        .filter(p => p.trending || p.featured || p.rating > 0)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 4);
    } else {
      matched = matched.slice(0, 5);
    }

    if (matched.length === 0) return 'Hiện không có sản phẩm nào phù hợp.';

    return matched.map(m => {
      const discountStr = m.discount > 0 ? ` [GIẢM ${m.discount}%]` : '';
      const featStr = m.featured ? ' (Sản phẩm nổi bật)' : '';
      const ratingStr = m.rating > 0
        ? ` | Đánh giá: ${m.rating.toFixed(1)}/5 (${m.reviews} nhận xét)`
        : ' | Chưa có đánh giá';

      return `- ${m.name}${discountStr}${featStr}\n  Thương hiệu: ${m.brand}${ratingStr}\n  Giá: ${m.price.toLocaleString('vi-VN')} VND (Gốc: ${m.originalPrice.toLocaleString('vi-VN')} VND)\n  Trạng thái: ${m.stock > 0 ? `Còn ${m.stock} sản phẩm` : 'Hết hàng'}`;
    }).join('\n\n');
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

    // Prepare Context Injection - Optimize: Parallel execution to reduce TTFT
    const currentDateTime = new Date().toLocaleString('vi-VN');
    const needsCoupons = !!userQuery.toLowerCase().match(/(giảm giá|khuyến mãi|coupon|mã|voucher)/);
    const isGreeting = userQuery.length < 5 || !!userQuery.toLowerCase().match(/^(hi|hello|chào|xin chào|hey|đây)$/);

    const [activeCouponsStr, filteredProductsStr] = await Promise.all([
      needsCoupons ? this.fetchActiveCoupons() : Promise.resolve('Chỉ cung cấp khi khách hỏi về khuyến mãi.'),
      isGreeting ? Promise.resolve('Khách chỉ đang chào hỏi.') : Promise.resolve(this.preFilterProducts(userQuery))
    ]);

    const systemInstruction = `
Bạn là "ShopHub AI" - Chuyên gia tư vấn bán hàng. 
DỮ LIỆU HIỆN CÓ:
- Thời gian: ${currentDateTime}
- MÃ GIẢM GIÁ: ${activeCouponsStr}
- SẢN PHẨM PHÙ HỢP: ${filteredProductsStr}

QUY TẮC CỐT LÕI:
1. TRẢ LỜI NHANH: Tập trung vào thông tin khách hỏi. Không dông dài.
2. ĐỊNH DẠNG: Văn bản thuần túy, phân đoạn bằng \\n. KHÔNG ký tự Markdown (** , * , #), KHÔNG HTML.
3. CHUYÊN MÔN: Dùng dữ liệu "SẢN PHẨM PHÙ HỢP" để gợi ý. Nếu khách hỏi loại hàng không có trong danh sách, hãy báo là hiện hết hàng hoặc chưa có và gợi ý khách theo dõi thêm.
4. QUY TRÌNH: Chào hỏi -> Giải đáp -> Gợi ý chốt đơn.
5. CHÍNH SÁCH: Hủy đơn (PENDING), Đổi trả (7 ngày), Thanh toán (VNPAY, Wallet, COD).
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

    const prompt = `Bạn là chuyên gia copywriter cho ShopHub. 
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
