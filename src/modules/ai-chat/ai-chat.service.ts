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

    // Semantic Expansion (Synonyms) - PHIÊN BẢN FULL CHUẨN THEO DỮ LIỆU THẬT
    const synonyms: Record<string, string[]> = {
      // Nhóm Gaming & Tin học
      'laptop': ['máy tính xách tay', 'acer', 'msi', 'lenovo', 'techbook', 'máy tính', 'nitro', 'katana'],
      'pc': ['máy tính để bàn', 'máy tính', 'thùng máy', 'case', 'workstation', 'gaming', 'ttg', 'mini pc', 'cấu hình'],
      'vga': ['card màn hình', 'card đồ họa', 'nvidia', 'rtx', 'gtx', 'amd', 'gigabyte', 'msi', 'asus', 'zotac', 'ocpc', 'inno3d'],
      'linh kiện': ['vga', 'ram', 'cpu', 'psu', 'mainboard', 'ổ cứng', 'ssd', 'hdd', 'nguồn', 'vỏ case', 'tản nhiệt'],
      'máy tính': ['laptop', 'pc', 'máy tính xách tay', 'máy tính để bàn', 'máy tính gaming'],
      
      // Nhóm Đồ gia dụng & Điện máy (Sunhouse, Karofi)
      'gia dụng': ['nồi', 'chảo', 'máy ép', 'máy lọc', 'đồ dùng nhà bếp', 'nồi cơm', 'bếp từ', 'bếp điện', 'sunhouse', 'karofi'],
      'điện máy': ['máy lọc nước', 'điều hòa', 'máy làm mát', 'quạt', 'điện lạnh', 'lọc nước ro'],
      'nhà bếp': ['chảo', 'nồi cơm', 'bếp đôi', 'máy ép chậm', 'chống dính'],

      // Nhóm Thời trang & Phụ kiện (Cardina, StreetStyle...)
      'thời trang': ['quần', 'áo', 'váy', 'đầm', 'set bộ', 'nỉ', 'len', 'quần áo', 'cardina', 'thu đông', 'giữ nhiệt'],
      'phụ kiện': ['đồng hồ', 'kính mát', 'túi xách', 'ví da', 'vòng tay', 'trang sức'],
      'giày dép': ['giày thể thao', 'sneaker', 'giày thiết kế', 'streetstyle'],
      
      // Nhóm Công nghệ & Giải trí
      'âm thanh': ['tai nghe', 'headphone', 'earbuds', 'loa', 'audiopro', 'soundwave'],
      'chơi game': ['tay cầm', 'gamepad', 'controller', 'gamemaster', 'ps5', 'xbox'],
      'nhiếp ảnh': ['máy ảnh', 'camera', 'mirrorless', 'ống kính', 'photopro'],

      // Nhóm Thể thao & Sức khỏe
      'thể thao': ['ghế tập bụng', 'xà đơn', 'xà kép', 'gym', 'dụng cụ tập', 'goodfit', 'miking'],
      'gym': ['tập bụng', 'hít xà', 'thể hình', 'săn chắc'],

      // Nhóm Sách & Decor & Khác
      'sách': ['giáo trình', 'tài liệu', 'triết học', 'bookstore', 'học tập', 'văn phòng phẩm'],
      'nội thất': ['ghế thư giãn', 'bàn làm việc', 'decor', 'trang trí', 'cây cảnh', 'greenspace']
    };

    let expandedKeywords = query.split(' ').filter(k => k.length >= 2);
    Object.entries(synonyms).forEach(([key, values]) => {
      // Nếu query chứa key hoặc bất kỳ từ đồng nghĩa nào
      if (query.includes(key) || values.some(v => query.includes(v))) {
        expandedKeywords = [...new Set([...expandedKeywords, key, ...values])];
      }
    });

    const scoredProducts = this.productsCache.map(p => {
      let score = 0;
      const productName = p.name.toLowerCase();
      const productBrand = p.brand.toLowerCase();
      const productDesc = (p.description || '').toLowerCase();
      const searchableStr = `${productName} ${productBrand} ${productDesc}`.toLowerCase();

      // 1. Phân tích cụm từ (Phrase Matching) - Ưu tiên cao nhất
      if (query.length > 3 && searchableStr.includes(query)) score += 12; 
      
      // 2. Phân tích từ khóa mở rộng
      expandedKeywords.forEach(k => {
        if (productName.includes(k)) score += 5; 
        if (productBrand === k) score += 4;
        if (productDesc.includes(k)) score += 2;
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

    // Identify last user message and scan history for context if needed
    let userQuery = '';
    let contextQuery = ''; 

    try {
      // Quét lịch sử một cách an toàn
      const userMessages = (history || [])
        .filter(h => h.role === 'user')
        .slice(-3) 
        .map(h => {
          if (!h.parts) return '';
          return h.parts
            .map(p => (p as any).text || '') // Kiểm tra an toàn cho text
            .filter(t => t.length > 0)
            .join(' ');
        })
        .filter(msg => msg.length > 0);
      
      userQuery = userMessages[userMessages.length - 1] || '';
      
      // Nếu tin nhắn cuối quá ngắn hoặc mang tính tiếp nối, dùng contextQuery từ các tin nhắn trước
      const isContinuation = !!userQuery.toLowerCase().match(/(tiếp|nữa|thêm|đi|rồi sao|nói đi|kể đi|đâu|nào)/);
      if (isContinuation || (userQuery.length > 0 && userQuery.length < 10)) {
        contextQuery = userMessages.join(' ');
      } else {
        contextQuery = userQuery;
      }
    } catch (historyError) {
      this.logger.error('Error processing chat history context:', historyError);
      contextQuery = ''; // Fallback về rỗng nếu lỗi
    }

    // Prepare Context Injection - Optimize: Parallel execution to reduce TTFT
    const currentDateTime = new Date().toLocaleString('vi-VN');
    const needsCoupons = !!contextQuery.toLowerCase().match(/(giảm giá|khuyến mãi|coupon|mã|voucher)/);
    const isGreeting = userQuery.length < 5 && !!userQuery.toLowerCase().match(/^(hi|hello|chào|xin chào|hey|đây)$/);

    const [activeCouponsStr, filteredProductsStr] = await Promise.all([
      needsCoupons ? this.fetchActiveCoupons() : Promise.resolve('Chỉ cung cấp khi khách hỏi về khuyến mãi.'),
      isGreeting ? Promise.resolve('Khách chỉ đang chào hỏi.') : Promise.resolve(this.preFilterProducts(contextQuery))
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
5. CHÍNH SÁCH: Hủy đơn (PENDING), Trả hàng hoàn tiền (7 ngày), Thanh toán (VNPAY, Wallet, COD).
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
