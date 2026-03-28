import { forwardRef, Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    NotificationsModule,
    forwardRef(() => WalletModule),
    forwardRef(() => PaymentModule),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

