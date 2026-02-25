import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async getSellerProfile(userId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Seller profile not found');
    return profile;
  }

  async getStats(userId: string) {
    const profile = await this.getSellerProfile(userId);
    const sellerId = profile.id;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Use raw SQL aggregations to avoid loading all records into memory
    const [allTimeRows, currentRows, prevRows, totalProducts, currentNewProducts, prevNewProducts] =
      await Promise.all([
        // All-time: revenue, orders, customers
        this.prisma.$queryRaw<{ revenue: string; orders: string; customers: string }[]>`
          SELECT
            COALESCE(SUM(oi.price * oi.quantity), 0)::text AS revenue,
            COUNT(DISTINCT o.id)::text                     AS orders,
            COUNT(DISTINCT o."userId")::text               AS customers
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          JOIN products p ON p.id = oi."productId"
          WHERE p."sellerId" = ${sellerId}
        `,
        // Current 30 days
        this.prisma.$queryRaw<{ revenue: string; orders: string; customers: string }[]>`
          SELECT
            COALESCE(SUM(oi.price * oi.quantity), 0)::text AS revenue,
            COUNT(DISTINCT o.id)::text                     AS orders,
            COUNT(DISTINCT o."userId")::text               AS customers
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          JOIN products p ON p.id = oi."productId"
          WHERE p."sellerId" = ${sellerId}
            AND o."createdAt" >= ${thirtyDaysAgo}
        `,
        // Previous 30 days (30–60 days ago)
        this.prisma.$queryRaw<{ revenue: string; orders: string; customers: string }[]>`
          SELECT
            COALESCE(SUM(oi.price * oi.quantity), 0)::text AS revenue,
            COUNT(DISTINCT o.id)::text                     AS orders,
            COUNT(DISTINCT o."userId")::text               AS customers
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          JOIN products p ON p.id = oi."productId"
          WHERE p."sellerId" = ${sellerId}
            AND o."createdAt" >= ${sixtyDaysAgo}
            AND o."createdAt" < ${thirtyDaysAgo}
        `,
        this.prisma.product.count({ where: { sellerId } }),
        this.prisma.product.count({ where: { sellerId, createdAt: { gte: thirtyDaysAgo } } }),
        this.prisma.product.count({
          where: { sellerId, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
        }),
      ]);

    const all = allTimeRows[0];
    const cur = currentRows[0];
    const prev = prevRows[0];

    const calcChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    };

    return {
      totalRevenue: Math.round(Number(all.revenue)),
      totalOrders: Number(all.orders),
      totalProducts,
      totalCustomers: Number(all.customers),
      revenueChange: calcChange(Number(cur.revenue), Number(prev.revenue)),
      ordersChange: calcChange(Number(cur.orders), Number(prev.orders)),
      productsChange: calcChange(currentNewProducts, prevNewProducts),
      customersChange: calcChange(Number(cur.customers), Number(prev.customers)),
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
