import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import {
  WalletTransactionStatus,
  WalletTransactionType,
} from 'generated/prisma/client';
import {
  AdminAdjustWalletDto,
  CreateDepositDto,
  CreateWithdrawDto,
  DepositGateway,
  QueryAdminWalletsDto,
  QueryWalletTransactionsDto,
  WalletStatsDto,
} from './dto/wallet.dto';
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
  ) { }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async getOrCreateWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { userId, balance: 0 },
      });
    }
    return wallet;
  }

  private formatTransaction(t: any) {
    return {
      id: t.id,
      type: t.type,
      status: t.status,
      amount: Number(t.amount),
      balanceBefore: Number(t.balanceBefore),
      balanceAfter: Number(t.balanceAfter),
      orderId: t.orderId,
      description: t.description,
      gatewayTxnId: t.gatewayTxnId,
      createdAt: t.createdAt,
    };
  }

  // ─── Buyer: Get Balance ────────────────────────────────────────────────────

  async getWallet(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    return {
      id: wallet.id,
      balance: Number(wallet.balance),
      updatedAt: wallet.updatedAt,
    };
  }

  // ─── Buyer: Transaction History ────────────────────────────────────────────

  async getTransactions(userId: string, query: QueryWalletTransactionsDto) {
    const { page, limit } = query;
    const wallet = await this.getOrCreateWallet(userId);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    return {
      transactions: transactions.map(this.formatTransaction),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Buyer: Create Deposit (Gateway redirect) ──────────────────────────────

  async createDepositIntent(userId: string, dto: CreateDepositDto) {
    const wallet = await this.getOrCreateWallet(userId);
    const balance = Number(wallet.balance);

    // Create PENDING transaction
    const txn = await this.prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: WalletTransactionType.DEPOSIT,
        status: WalletTransactionStatus.PENDING,
        amount: dto.amount,
        balanceBefore: balance,
        balanceAfter: balance, // will be updated on callback
        description: `Nạp tiền qua ${dto.gateway}`,
      },
    });

    // Real gateway URL
    let paymentUrl = '';
    if (dto.gateway === DepositGateway.VNPAY) {
      paymentUrl = await this.paymentService.createVnpayUrl(
        txn.id,
        dto.amount,
        '127.0.0.1', // Default IP, in production extract from request
        dto.returnUrl,
      );
    } else {
      // Keep mock for MoMo for now or implement similar logic
      paymentUrl = this.buildMockGatewayUrl(
        dto.gateway,
        txn.id,
        dto.amount,
        dto.returnUrl,
      );
    }

    return {
      transactionId: txn.id,
      paymentUrl,
      amount: dto.amount,
      gateway: dto.gateway,
    };
  }

  private buildMockGatewayUrl(
    gateway: DepositGateway,
    txnId: string,
    amount: number,
    returnUrl?: string,
  ): string {
    const base = 'https://test-payment.momo.vn/v2/gateway/pay';
    const finalReturnUrl = returnUrl || process.env.VNP_RETURN_URL_WEB || 'http://localhost:5173/wallet';

    const params = new URLSearchParams({
      vnp_TxnRef: txnId,
      vnp_Amount: String(Math.round(amount * 100)),
      vnp_ReturnUrl: finalReturnUrl,
    });
    return `${base}?${params.toString()}`;
  }

  // ─── Payment Callback (IPN) ────────────────────────────────────────────────

  async handleDepositCallback(
    txnId: string,
    status: WalletTransactionStatus,
    gatewayTxnId?: string,
    gatewayData?: any,
  ) {
    const txn = await this.prisma.walletTransaction.findUnique({
      where: { id: txnId },
      include: { wallet: true },
    });

    if (!txn) throw new NotFoundException('Transaction not found');
    if (txn.status !== WalletTransactionStatus.PENDING) {
      return { message: 'Already processed' };
    }

    if (status !== WalletTransactionStatus.COMPLETED) {
      await this.prisma.walletTransaction.update({
        where: { id: txnId },
        data: {
          status,
          gatewayTxnId,
          gatewayData,
        },
      });
      return { message: 'Payment failed or cancelled' };
    }

    const newBalance = Number(txn.wallet.balance) + Number(txn.amount);

    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: txn.walletId },
        data: { balance: newBalance },
      }),
      this.prisma.walletTransaction.update({
        where: { id: txnId },
        data: {
          status: WalletTransactionStatus.COMPLETED,
          balanceAfter: newBalance,
          gatewayTxnId,
          gatewayData,
        },
      }),
    ]);

    return { message: 'Deposit successful', newBalance };
  }

  // ─── Internal: Pay with Wallet (called inside order transaction) ────────────

  async payWithWalletInTx(
    tx: any,
    userId: string,
    orderId: string,
    amount: number,
  ) {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new BadRequestException('Ví không tồn tại');

    const balance = Number(wallet.balance);
    if (balance < amount) {
      throw new BadRequestException(
        `Số dư ví không đủ. Hiện có: ${balance.toFixed(0)} ₫, cần: ${amount.toFixed(0)} ₫`,
      );
    }

    const newBalance = balance - amount;

    await tx.wallet.update({
      where: { userId },
      data: { balance: newBalance },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: WalletTransactionType.PAYMENT,
        status: WalletTransactionStatus.COMPLETED,
        amount,
        balanceBefore: balance,
        balanceAfter: newBalance,
        orderId,
        description: `Thanh toán đơn hàng ${orderId}`,
      },
    });

    // Update order status
    await tx.order.update({
      where: { id: orderId },
      data: { revenueStatus: 'PENDING' },
    });

    return newBalance;
  }

  // ─── Internal: Refund to Wallet ─────────────────────────────────────────────

  async refundToWallet(
    userId: string,
    orderId: string,
    amount: number,
    txClient?: any,
    sellerUserId?: string,
  ) {
    const prisma = txClient || this.prisma;
    const buyerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
    const buyerBalance = Number(buyerWallet.balance);
    const buyerNewBalance = buyerBalance + amount;

    // Find if seller already received income (for DELIVERED orders)
    const incomeTransactions = await prisma.walletTransaction.findMany({
      where: {
        orderId,
        type: WalletTransactionType.SELLER_INCOME,
        status: WalletTransactionStatus.COMPLETED,
        ...(sellerUserId ? { wallet: { userId: sellerUserId } } : {}),
      },
      include: { wallet: true },
    });

    const totalIncome = incomeTransactions.reduce((acc, t) => acc + Number(t.amount), 0);

    const executeRefund = async (tx: any) => {
      // 1. Credit Buyer
      await tx.wallet.update({
        where: { userId },
        data: { balance: buyerNewBalance },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: buyerWallet.id,
          type: WalletTransactionType.REFUND,
          status: WalletTransactionStatus.COMPLETED,
          amount,
          balanceBefore: buyerBalance,
          balanceAfter: buyerNewBalance,
          orderId,
          description: `Hoàn tiền đơn hàng ${orderId}`,
        },
      });

      // 2. Debit Seller(s) if order was already delivered (Income already moved to seller)
      if (incomeTransactions.length > 0) {
        // Case: Order was already delivered, reclaim income proportionally
        for (const incomeTx of incomeTransactions) {
          const sellerWallet = incomeTx.wallet;
          const sellerBalance = Number(sellerWallet.balance);
          const sellerShare = totalIncome > 0 ? (Number(incomeTx.amount) / totalIncome) : 1;
          const deductionAmount = amount * sellerShare;
          const sellerNewBalance = sellerBalance - deductionAmount;

          await tx.wallet.update({
            where: { id: sellerWallet.id },
            data: { balance: sellerNewBalance },
          });

          await tx.walletTransaction.create({
            data: {
              walletId: sellerWallet.id,
              type: WalletTransactionType.SELLER_REFUND_DEDUCTED,
              status: WalletTransactionStatus.COMPLETED,
              amount: deductionAmount,
              balanceBefore: sellerBalance,
              balanceAfter: sellerNewBalance,
              orderId,
              description: `Truy thu tiền hoàn trả cho đơn hàng đã giao ${orderId}`,
            },
          });
        }
      } else {
        // Case: Pre-delivery cancellation. 
        // Money is still held by the platform (escrow), NOT in seller's wallet yet.
        // So we ONLY credit the buyer. We do NOT debit the seller's wallet balance.
        // This is the most fair logic.
        console.log(`[Refund] Order ${orderId} is pre-delivery. Refunding buyer from escrow. Seller wallet untouched.`);
      }

      return buyerNewBalance;
    };

    if (txClient) {
      return executeRefund(txClient);
    } else {
      return this.prisma.$transaction(async (tx) => executeRefund(tx));
    }
  }

  // ─── Admin: List Wallets ────────────────────────────────────────────────────

  async adminGetWallets(query: QueryAdminWalletsDto) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const userWhere: any = {};
    if (search) {
      userWhere.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [wallets, total] = await Promise.all([
      this.prisma.wallet.findMany({
        where: { user: userWhere },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              userType: true,
            },
          },
          _count: { select: { transactions: true } },
        },
        orderBy: { balance: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.wallet.count({ where: { user: userWhere } }),
    ]);

    return {
      wallets: wallets.map((w) => ({
        id: w.id,
        balance: Number(w.balance),
        transactionCount: w._count.transactions,
        user: w.user,
        updatedAt: w.updatedAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Admin: Get single wallet by userId ────────────────────────────────────

  async adminGetWalletByUserId(targetUserId: string) {
    const wallet = await this.getOrCreateWallet(targetUserId);
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        userType: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const recentTxns = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      id: wallet.id,
      balance: Number(wallet.balance),
      user,
      recentTransactions: recentTxns.map(this.formatTransaction),
    };
  }

  async adminGetTransactionsByUserId(targetUserId: string, query: QueryWalletTransactionsDto) {
    const { page, limit } = query;
    const wallet = await this.getOrCreateWallet(targetUserId);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    return {
      transactions: transactions.map(this.formatTransaction),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Admin: Manual Adjustment ──────────────────────────────────────────────

  async adminAdjust(
    adminId: string,
    targetUserId: string,
    dto: AdminAdjustWalletDto,
  ) {
    const wallet = await this.getOrCreateWallet(targetUserId);
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { email: true, firstName: true, lastName: true },
    });
    const balance = Number(wallet.balance);
    const newBalance = balance + dto.amount;

    if (newBalance < 0) {
      throw new BadRequestException(
        `Không thể trừ quá số dư hiện có (${balance.toFixed(0)} ₫)`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      }),
      this.prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.ADJUSTMENT,
          status: WalletTransactionStatus.COMPLETED,
          amount: Math.abs(dto.amount),
          balanceBefore: balance,
          balanceAfter: newBalance,
          adminId,
          description: dto.reason,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          adminId,
          action: 'ADJUST_WALLET',
          resource: 'wallet',
          resourceId: targetUserId,
          details: {
            amount: dto.amount,
            reason: dto.reason,
            balanceBefore: balance,
            balanceAfter: newBalance,
            targetEmail: targetUser?.email,
            targetName: targetUser ? `${targetUser.firstName} ${targetUser.lastName}`.trim() : 'Unknown',
          },
        },
      }),
    ]);

    return {
      previousBalance: balance,
      adjustment: dto.amount,
      newBalance,
    };
  }

  // ─── Buyer/Seller: Withdrawal ──────────────────────────────────────────────

  async withdraw(userId: string, dto: CreateWithdrawDto) {
    const wallet = await this.getOrCreateWallet(userId);
    const balance = Number(wallet.balance);

    if (balance < dto.amount) {
      throw new BadRequestException('Số dư ví không đủ để thực hiện rút tiền');
    }

    const newBalance = balance - dto.amount;

    // Resolve target account info
    let targetInfo = '';
    if (dto.paymentMethodId) {
      const pm = await this.prisma.paymentMethod.findUnique({
        where: { id: dto.paymentMethodId, userId },
      });
      if (!pm) throw new NotFoundException('Phương thức thanh toán không tồn tại');
      targetInfo = `${pm.brand} **** ${pm.lastFour} (${pm.cardholderName})`;
    } else if (dto.bankName && dto.bankAccount) {
      targetInfo = `${dto.bankName} - ${dto.bankAccount} (${dto.accountHolder ?? 'N/A'})`;
    } else {
      throw new BadRequestException('Thông tin tài khoản nhận tiền không đầy đủ');
    }

    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      }),
      this.prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.WITHDRAW,
          status: WalletTransactionStatus.COMPLETED, // Mark as completed for now as per "simple" requirement
          amount: dto.amount,
          balanceBefore: balance,
          balanceAfter: newBalance,
          description: `Rút tiền về: ${targetInfo}`,
        },
      }),
    ]);

    return {
      previousBalance: balance,
      withdrawnAmount: dto.amount,
      newBalance,
      targetInfo,
    };
  }

  // ─── Internal: Process Order Payout ────────────────────────────────────────

  async processOrderPayout(orderId: string, targetSellerUserId?: string) {
    // 1. Fetch order with items and sellers
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              include: { seller: true },
            },
          },
        },
      },
    });

    if (!order) throw new Error(`Order ${orderId} not found for payout`);

    const existingPayout = await this.prisma.walletTransaction.findFirst({
      where: {
        orderId,
        type: { in: [WalletTransactionType.SELLER_INCOME] },
        ...(targetSellerUserId ? { wallet: { userId: targetSellerUserId } } : {}),
      },
    });
    if (existingPayout) return; // Already processed for this seller (or global)

    const orderTotal = Number(order.total);
    const orderSubtotal = Number(order.subtotal);
    const orderDiscount = Number(order.couponDiscount || 0);

    // 3. Group by seller
    const sellerMap = new Map<string, { userId: string; gross: number }>();

    for (const item of order.items) {
      const seller = item.product.seller;
      if (!seller) continue;
      if (targetSellerUserId && seller.userId !== targetSellerUserId) continue;

      const itemTotal = Number(item.price) * item.quantity;
      const current = sellerMap.get(seller.id) || { userId: seller.userId, gross: 0 };
      current.gross += itemTotal;
      sellerMap.set(seller.id, current);
    }

    // 4. Process each seller in transaction
    await this.prisma.$transaction(async (tx) => {
      for (const [sellerId, data] of sellerMap.entries()) {
        const wallet = await tx.wallet.findUnique({ where: { userId: data.userId } });
        if (!wallet) {
          // Create wallet if not exists
          await tx.wallet.create({ data: { userId: data.userId, balance: 0 } });
        }

        const currentWallet = await tx.wallet.findUniqueOrThrow({ where: { userId: data.userId } });
        const balanceBefore = Number(currentWallet.balance);

        // Actual Revenue for this seller (proportional discount)
        const sellerShare = data.gross / orderSubtotal;
        const sellerDiscount = orderDiscount * sellerShare;
        const revenueThucTe = data.gross - sellerDiscount;

        const phiSan = revenueThucTe * 0.05;
        const netIncome = revenueThucTe - phiSan;

        const balanceAfterIncome = balanceBefore + revenueThucTe;
        const finalBalance = balanceAfterIncome - phiSan;

        // Record SELLER_INCOME (Gross share)
        await tx.walletTransaction.create({
          data: {
            walletId: currentWallet.id,
            type: WalletTransactionType.SELLER_INCOME,
            status: WalletTransactionStatus.COMPLETED,
            amount: revenueThucTe,
            balanceBefore: balanceBefore,
            balanceAfter: balanceAfterIncome,
            orderId,
            description: `Doanh thu đơn hàng ${orderId}`,
          },
        });

        // Record SELLER_FEE_DEDUCTED (5%)
        await tx.walletTransaction.create({
          data: {
            walletId: currentWallet.id,
            type: WalletTransactionType.SELLER_FEE_DEDUCTED,
            status: WalletTransactionStatus.COMPLETED,
            amount: phiSan,
            balanceBefore: balanceAfterIncome,
            balanceAfter: finalBalance,
            orderId,
            description: `Phí sàn (5%) cho đơn hàng ${orderId}`,
          },
        });

        // Update balance
        await tx.wallet.update({
          where: { id: currentWallet.id },
          data: { balance: finalBalance },
        });
      }
    });
  }

  // ─── Reporting: Wallet Stats ───────────────────────────────────────────────

  async getWalletStats(userId: string): Promise<WalletStatsDto> {
    const wallet = await this.getOrCreateWallet(userId);

    const transactions = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, status: WalletTransactionStatus.COMPLETED },
    });

    let totalIncome = 0;
    let netIncome = 0;
    let totalFees = 0;
    let totalSpent = 0;
    let totalWithdrawn = 0;
    let totalRefunded = 0;
    let totalRefundDeducted = 0;
    let totalDeposited = 0;

    for (const t of transactions) {
      const amt = Number(t.amount);
      switch (t.type) {
        case WalletTransactionType.DEPOSIT:
          totalDeposited += amt;
          break;
        case WalletTransactionType.SELLER_INCOME:
          netIncome += amt;
          break;
        case WalletTransactionType.SELLER_FEE_DEDUCTED:
          totalFees += amt;
          break;
        case WalletTransactionType.PAYMENT:
          totalSpent += amt;
          break;
        case WalletTransactionType.WITHDRAW:
          totalWithdrawn += amt;
          break;
        case WalletTransactionType.REFUND:
          totalRefunded += amt;
          break;
        case WalletTransactionType.SELLER_REFUND_DEDUCTED:
          totalRefundDeducted += amt;
          break;
      }
    }

    // Gross income is what seller earned before fee
    totalIncome = netIncome + totalFees;

    return {
      balance: Number(wallet.balance),
      totalIncome,
      netIncome,
      totalFees,
      totalSpent,
      totalWithdrawn,
      totalRefunded,
      totalDeposited,
    };
  }
}
