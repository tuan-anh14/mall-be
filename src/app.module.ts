import { Module } from '@nestjs/common';
import { UsersModule } from '@/modules/users/users.module';
import { ConfigModule } from '@nestjs/config';
import configuration from '@/config';
import { DatabaseModule } from '@/database/database.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { StorageModule } from './shared/storage/storage.module';
import { SellerModule } from './modules/seller/seller.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { UploadModule } from './modules/upload/upload.module';
import { ProductsModule } from './modules/products/products.module';
import { CartModule } from './modules/cart/cart.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { AdminModule } from './modules/admin/admin.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ViewHistoryModule } from './modules/view-history/view-history.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { BlogsModule } from './modules/blogs/blogs.module';
import { ContactModule } from './modules/contact/contact.module';
import { AiChatModule } from './modules/ai-chat/ai-chat.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SessionAuthGuard } from './common/guards/session-auth.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 100,
        },
      ],
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    StorageModule,
    SellerModule,
    CategoriesModule,
    UploadModule,
    ProductsModule,
    CartModule,
    WishlistModule,
    OrdersModule,
    ReviewsModule,
    NotificationsModule,
    ConversationsModule,
    AdminModule,
    WalletModule,
    PaymentModule,
    ViewHistoryModule,
    RecommendationsModule,
    BlogsModule,
    ContactModule,
    AiChatModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
  ],
})
export class AppModule {}
