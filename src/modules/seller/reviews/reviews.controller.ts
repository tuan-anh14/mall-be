import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { User } from 'generated/prisma/client';
import { SellerReviewsService } from './reviews.service';

@ApiTags('Seller Reviews')
@Controller('seller/reviews')
export class SellerReviewsController {
  constructor(private readonly reviewsService: SellerReviewsService) {}

  @Get()
  @ApiOperation({ summary: "Get all reviews for seller's products" })
  getReviews(
    @Req() req: Request,
    @Query('productId') productId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as User;
    return this.reviewsService.getReviews(
      user.id,
      productId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('products/:productId')
  @ApiOperation({ summary: "Get reviews for a specific product of seller" })
  getProductReviews(
    @Req() req: Request,
    @Param('productId') productId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as User;
    return this.reviewsService.getProductReviews(
      user.id,
      productId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: "Delete a review on seller's product" })
  deleteReview(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as User;
    return this.reviewsService.deleteReview(user.id, id);
  }
}
