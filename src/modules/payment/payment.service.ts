import { Injectable } from '@nestjs/common';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class PaymentService {
  constructor(private readonly walletService: WalletService) {}

  /**
   * Handle VNPAY IPN (Instant Payment Notification)
   * In production: verify HMAC signature from VNPAY
   */
  async handleVnpayIpn(query: Record<string, string>) {
    const txnId = query['vnp_TxnRef'];
    const responseCode = query['vnp_ResponseCode'];
    const transactionNo = query['vnp_TransactionNo'];

    const success = responseCode === '00';

    return this.walletService.handleDepositCallback(
      txnId,
      success,
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

    return this.walletService.handleDepositCallback(
      txnId,
      success,
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
      true,
      `MOCK-${Date.now()}`,
      { simulated: true },
    );
  }
}
