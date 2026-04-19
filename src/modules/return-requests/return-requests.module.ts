import { Module, forwardRef } from '@nestjs/common';
import { ReturnRequestsService } from './return-requests.service';
import { ReturnRequestsController } from './return-requests.controller';
import { PrismaService } from '@/database/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    NotificationsModule,
    forwardRef(() => WalletModule),
    AuthModule,
  ],
  controllers: [ReturnRequestsController],
  providers: [ReturnRequestsService, PrismaService],
  exports: [ReturnRequestsService],
})
export class ReturnRequestsModule {}
