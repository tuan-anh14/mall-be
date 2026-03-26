import { forwardRef, Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { WalletModule } from '../wallet/wallet.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    forwardRef(() => WalletModule),
    forwardRef(() => OrdersModule),
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}

