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
  DepositGateway,
  QueryAdminWalletsDto,
  QueryWalletTransactionsDto,
} from './dto/wallet.dto';
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
  ) {}

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

    const params = new URLSearchParams({
      vnp_TxnRef: txnId,
      vnp_Amount: String(Math.round(amount * 100)),
      vnp_ReturnUrl: returnUrl ?? 'http://localhost:5173/wallet',
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

    return newBalance;
  }

  // ─── Internal: Refund to Wallet ─────────────────────────────────────────────

  async refundToWallet(userId: string, orderId: string, amount: number) {
    const wallet = await this.getOrCreateWallet(userId);
    const balance = Number(wallet.balance);
    const newBalance = balance + amount;

    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { userId },
        data: { balance: newBalance },
      }),
      this.prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.REFUND,
          status: WalletTransactionStatus.COMPLETED,
          amount,
          balanceBefore: balance,
          balanceAfter: newBalance,
          orderId,
          description: `Hoàn tiền đơn hàng ${orderId}`,
        },
      }),
    ]);

    return newBalance;
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

  // ─── Admin: Manual Adjustment ──────────────────────────────────────────────

  async adminAdjust(
    adminId: string,
    targetUserId: string,
    dto: AdminAdjustWalletDto,
  ) {
    const wallet = await this.getOrCreateWallet(targetUserId);
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
    ]);

    return {
      previousBalance: balance,
      adjustment: dto.amount,
      newBalance,
    };
  }
}
