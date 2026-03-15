import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateCouponDto,
  UpdateCouponDto,
  ReviewSellerRequestDto,
} from './dto/admin.dto';

@ApiTags('Admin')
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── ACCOUNTS ──────────────────────────────────────────────────────────────

  @Get('accounts')
  @ApiOperation({ summary: 'List all user accounts' })
  getAccounts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getAccounts(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      search,
    );
  }

  @Get('accounts/:id')
  @ApiOperation({ summary: 'Get account detail' })
  getAccount(@Param('id') id: string) {
    return this.adminService.getAccountById(id);
  }

  @Put('accounts/:id/ban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ban/force-logout a user account' })
  banAccount(@Param('id') id: string) {
    return this.adminService.banAccount(id);
  }

  @Delete('accounts/:id')
  @ApiOperation({ summary: 'Delete a user account' })
  deleteAccount(@Param('id') id: string) {
    return this.adminService.deleteAccount(id);
  }

  // ─── CATEGORIES ────────────────────────────────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: 'List all categories with product count' })
  getCategories() {
    return this.adminService.getCategories();
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create category' })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.adminService.createCategory(dto);
  }

  @Put('categories/:id')
  @ApiOperation({ summary: 'Update category' })
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.adminService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete category' })
  deleteCategory(@Param('id') id: string) {
    return this.adminService.deleteCategory(id);
  }

  // ─── COUPONS ───────────────────────────────────────────────────────────────

  @Get('coupons')
  @ApiOperation({ summary: 'List all coupons' })
  getCoupons(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getCoupons(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Post('coupons')
  @ApiOperation({ summary: 'Create coupon' })
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.adminService.createCoupon(dto);
  }

  @Put('coupons/:id')
  @ApiOperation({ summary: 'Update coupon' })
  updateCoupon(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.adminService.updateCoupon(id, dto);
  }

  @Delete('coupons/:id')
  @ApiOperation({ summary: 'Delete coupon' })
  deleteCoupon(@Param('id') id: string) {
    return this.adminService.deleteCoupon(id);
  }

  // ─── REVIEWS ───────────────────────────────────────────────────────────────

  @Get('reviews')
  @ApiOperation({ summary: 'List all reviews' })
  getReviews(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('productId') productId?: string,
  ) {
    return this.adminService.getReviews(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      productId,
    );
  }

  @Delete('reviews/:id')
  @ApiOperation({ summary: 'Delete a review' })
  deleteReview(@Param('id') id: string) {
    return this.adminService.deleteReview(id);
  }

  // ─── SELLER REQUESTS ───────────────────────────────────────────────────────

  @Get('seller-requests')
  @ApiOperation({ summary: 'List seller registration requests' })
  getSellerRequests(@Query('status') status?: string) {
    return this.adminService.getSellerRequests(status);
  }

  @Put('seller-requests/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a seller request' })
  reviewSellerRequest(
    @Param('id') id: string,
    @Body() dto: ReviewSellerRequestDto,
  ) {
    return this.adminService.reviewSellerRequest(id, dto);
  }

  // ─── STATISTICS ────────────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Get platform overview statistics' })
  getStats() {
    return this.adminService.getStats();
  }

  @Get('stats/sales')
  @ApiOperation({ summary: 'Get monthly sales data' })
  getSalesData() {
    return this.adminService.getSalesData();
  }
}
