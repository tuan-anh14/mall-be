import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { SellerReviewsController } from './reviews/reviews.controller';
import { SellerReviewsService } from './reviews/reviews.service';

@Module({
  controllers: [
    DashboardController,
    ProductsController,
    OrdersController,
    SellerReviewsController,
  ],
  providers: [
    DashboardService,
    ProductsService,
    OrdersService,
    SellerReviewsService,
  ],
})
export class SellerModule {}
