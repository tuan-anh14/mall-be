import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletService } from '../wallet/wallet.service';
import { OrdersService } from '../orders/orders.service';
import * as crypto from 'crypto';
import * as qs from 'qs';
import * as moment from 'moment';
import { WalletTransactionStatus } from 'generated/prisma/client';

@Injectable()
export class PaymentService {
  private readonly tmnCode: string;
  private readonly secretKey: string;
  private readonly vnpUrl: string;
  private readonly defaultReturnUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
  ) {
    this.tmnCode = this.configService.get<string>('VNP_TMN_CODE', '');
    this.secretKey = this.configService.get<string>('VNP_HASH_SECRET', '');
    this.vnpUrl = this.configService.get<string>('VNP_URL', '');
    this.defaultReturnUrl = this.configService.get<string>('VNP_RETURN_URL', '');
  }

  private sortObject(obj: any) {
    const sorted: any = {};
    const keys = Object.keys(obj).sort();
    keys.forEach((key) => {
      sorted[key] = obj[key];
    });
    return sorted;
  }

  /**
   * Create VNPAY payment URL
   */
  async createVnpayUrl(
    txnId: string,
    amount: number,
    ipAddr: string,
    returnUrl?: string,
  ) {
    const createDate = moment().format('YYYYMMDDHHmmss');

    const vnpParams = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnId,
      vnp_OrderInfo: `Thanh_toan_nap_tien${txnId}`,
      vnp_OrderType: 'billpayment',
      vnp_Amount: Math.round(amount * 100),
      vnp_ReturnUrl: returnUrl || this.defaultReturnUrl,
      vnp_IpAddr: ipAddr || '127.0.0.1',
      vnp_CreateDate: createDate,
    };

    const sortedParams = this.sortObject(vnpParams);
    const signData = qs.stringify(sortedParams);
    const hmac = crypto.createHmac('sha512', this.secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    sortedParams['vnp_SecureHash'] = signed;

    return `${this.vnpUrl}?${qs.stringify(sortedParams)}`;
  }

  /**
   * Handle VNPAY IPN (Instant Payment Notification)
   */
  async handleVnpayIpn(query: Record<string, string>) {
    const vnpSecureHash = query['vnp_SecureHash'];
    const responseCode = query['vnp_ResponseCode'];
    const txnId = query['vnp_TxnRef'];
    const transactionNo = query['vnp_TransactionNo'];

    // Deep copy to avoid modifying original query
    const params = { ...query };
    delete params['vnp_SecureHash'];
    delete params['vnp_SecureHashType'];

    const sortedParams = this.sortObject(params);
    const signData = qs.stringify(sortedParams);
    const hmac = crypto.createHmac('sha512', this.secretKey);
    const checkSum = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    if (vnpSecureHash !== checkSum) {
      return { RspCode: '97', Message: 'Invalid signature' };
    }

    let status: WalletTransactionStatus = WalletTransactionStatus.FAILED;
    if (responseCode === '00') status = WalletTransactionStatus.COMPLETED;
    else if (responseCode === '24') status = WalletTransactionStatus.CANCELLED;

    if (txnId.startsWith('ORD-')) {
      return this.ordersService.handlePaymentCallback(
        txnId,
        status,
        query,
      );
    }

    return this.walletService.handleDepositCallback(
      txnId,
      status,
      transactionNo,
      query,
    );
  }

  /**
   * Handle MoMo IPN
   * In production: verify signature from MoMo
   */
  async handleMomoIpn(body: Record<string, any>) {
    const txnId = body['orderId'] as string;
    const resultCode = body['resultCode'] as number;
    const transId = String(body['transId'] ?? '');

    const success = resultCode === 0;
    const status = success ? WalletTransactionStatus.COMPLETED : WalletTransactionStatus.FAILED;

    return this.walletService.handleDepositCallback(
      txnId,
      status,
      transId,
      body,
    );
  }

  /**
   * Mock: simulate a successful deposit callback (for testing)
   */
  async simulateDeposit(txnId: string) {
    return this.walletService.handleDepositCallback(
      txnId,
      WalletTransactionStatus.COMPLETED,
      `MOCK-${Date.now()}`,
      { simulated: true },
    );
  }
}
