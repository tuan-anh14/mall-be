import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async getSellerProfile(userId: string) {
    let profile = await this.prisma.sellerProfile.findUnique({ where: { userId } });
    if (!profile) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user && user.userType === 'SELLER') {
        const base = `${user.firstName} ${user.lastName}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 30);
        try {
          profile = await this.prisma.sellerProfile.create({
            data: {
              userId: user.id,
              storeName: `${user.firstName} ${user.lastName}'s Store`,
              storeSlug: `${base}-${user.id.slice(-8)}`,
            },
          });
        } catch (error: any) {
          if (error?.code === 'P2002') {
            profile = await this.prisma.sellerProfile.findUnique({ where: { userId } });
          } else {
            throw error;
          }
        }
      }
      if (!profile) {
        throw new ForbiddenException('Bạn chưa có hồ sơ người bán');
      }
    }
    return profile;
  }

  async getStats(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return { totalRevenue: 0, netIncome: 0, totalFees: 0, totalOrders: 0, totalProducts: 0, totalCustomers: 0 };

    const profile = await this.getSellerProfile(userId);
    const sellerId = profile.id;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [transactions, totalProducts, currentNewProducts, prevNewProducts, orderStats] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id, status: 'COMPLETED' },
      }),
      this.prisma.product.count({ where: { sellerId } }),
      this.prisma.product.count({ where: { sellerId, createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.product.count({ where: { sellerId, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
      this.prisma.$queryRaw<{ orders: string; customers: string; ordersPrev: string; customersPrev: string }[]>`
        SELECT 
          COUNT(DISTINCT CASE WHEN o."createdAt" >= ${thirtyDaysAgo} THEN o.id END)::text as orders,
          COUNT(DISTINCT CASE WHEN o."createdAt" >= ${thirtyDaysAgo} THEN o."userId" END)::text as customers,
          COUNT(DISTINCT CASE WHEN o."createdAt" >= ${sixtyDaysAgo} AND o."createdAt" < ${thirtyDaysAgo} THEN o.id END)::text as "ordersPrev",
          COUNT(DISTINCT CASE WHEN o."createdAt" >= ${sixtyDaysAgo} AND o."createdAt" < ${thirtyDaysAgo} THEN o."userId" END)::text as "customersPrev"
        FROM orders o
        JOIN order_items oi ON oi."orderId" = o.id
        JOIN products p ON p.id = oi."productId"
        WHERE p."sellerId" = ${sellerId}
      `,
    ]);

    const stats = {
      totalRevenue: 0,
      netIncome: 0,
      totalFees: 0,
      revenue30d: 0,
      revenuePrev30d: 0,
    };

    transactions.forEach(t => {
      const amt = Number(t.amount);
      const isRecent = t.createdAt >= thirtyDaysAgo;
      const isPrev = t.createdAt >= sixtyDaysAgo && t.createdAt < thirtyDaysAgo;

      if (t.type === 'SELLER_INCOME') {
        stats.totalRevenue += amt;
        stats.netIncome += amt;
        if (isRecent) stats.revenue30d += amt;
        if (isPrev) stats.revenuePrev30d += amt;
      } else if (t.type === 'SELLER_FEE_DEDUCTED') {
        stats.totalRevenue += amt; // Assuming Gross = Net + Fee
        stats.totalFees += amt;
        if (isRecent) stats.revenue30d += amt;
        if (isPrev) stats.revenuePrev30d += amt;
      }
    });

    const o = orderStats[0];
    const calcChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    };

    return {
      totalRevenue: Math.round(stats.totalRevenue),
      netIncome: Math.round(stats.netIncome),
      totalFees: Math.round(stats.totalFees),
      totalOrders: Number(o.orders),
      totalProducts,
      totalCustomers: Number(o.customers),
      revenueChange: calcChange(stats.revenue30d, stats.revenuePrev30d),
      ordersChange: calcChange(Number(o.orders), Number(o.ordersPrev)),
      productsChange: calcChange(currentNewProducts, prevNewProducts),
      customersChange: calcChange(Number(o.customers), Number(o.customersPrev)),
    };
  }

  async getSalesData(userId: string) {
    const profile = await this.getSellerProfile(userId);
    const year = new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);

    const rows = await this.prisma.$queryRaw<{ month: number; revenue: string; orders: string }[]>`
      SELECT
        EXTRACT(MONTH FROM o."createdAt")::int   AS month,
        COALESCE(SUM(oi.price * oi.quantity), 0)::text AS revenue,
        COUNT(DISTINCT o.id)::text                     AS orders
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      JOIN products p ON p.id = oi."productId"
      WHERE p."sellerId" = ${profile.id}
        AND o."createdAt" >= ${startOfYear}
        AND o."createdAt" < ${endOfYear}
      GROUP BY EXTRACT(MONTH FROM o."createdAt")
    `;

    // Build map: monthNumber (1-12) → data
    const dataByMonth = new Map(rows.map((r) => [r.month, r]));

    return MONTHS.map((month, index) => {
      const row = dataByMonth.get(index + 1);
      return {
        month,
        revenue: row ? Math.round(Number(row.revenue)) : 0,
        orders: row ? Number(row.orders) : 0,
      };
    });
  }
}
