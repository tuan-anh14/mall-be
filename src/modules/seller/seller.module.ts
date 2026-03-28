import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { SellerReviewsController } from './reviews/reviews.controller';
import { SellerReviewsService } from './reviews/reviews.service';
import { SellerCouponsController } from './coupons/coupons.controller';
import { SellerCouponsService } from './coupons/coupons.service';
import { SellerProfileController } from './profile/seller-profile.controller';
import { SellerProfileService } from './profile/seller-profile.service';

@Module({
  controllers: [
    DashboardController,
    ProductsController,
    OrdersController,
    SellerReviewsController,
    SellerCouponsController,
    SellerProfileController,
  ],
  providers: [
    DashboardService,
    ProductsService,
    OrdersService,
    SellerReviewsService,
    SellerCouponsService,
    SellerProfileService,
  ],
})
export class SellerModule {}
