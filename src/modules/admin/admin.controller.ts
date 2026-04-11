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
  Req,
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { User } from 'generated/prisma/client';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import {
  CreateAdminAccountDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateCouponDto,
  UpdateCouponDto,
  ReviewSellerRequestDto,
  UpdateAdminProductDto,
} from './dto/admin.dto';

@ApiTags('Admin')
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── ACCOUNTS ──────────────────────────────────────────────────────────────

  @Post('accounts')
  @ApiOperation({ summary: 'Create a new user account' })
  async createAccount(@Req() req: Request, @Body() dto: CreateAdminAccountDto) {
    const admin = req.user as User;
    const result = await this.adminService.createAccount(dto);
    await this.adminService.logAction(admin.id, 'CREATE', 'account', result.id, { email: dto.email, userType: dto.userType });
    return result;
  }

  @Get('accounts')
  @ApiOperation({ summary: 'List all user accounts' })
  getAccounts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('userType') userType?: string,
  ) {
    return this.adminService.getAccounts(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      search,
      userType,
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
  async banAccount(@Req() req: Request, @Param('id') id: string) {
    const admin = req.user as User;
    const result = await this.adminService.banAccount(id);
    await this.adminService.logAction(admin.id, 'BAN', 'account', id);
    return result;
  }

  @Delete('accounts/:id')
  @ApiOperation({ summary: 'Delete a user account' })
  async deleteAccount(@Req() req: Request, @Param('id') id: string) {
    const admin = req.user as User;
    const result = await this.adminService.deleteAccount(id);
    await this.adminService.logAction(admin.id, 'DELETE', 'account', id);
    return result;
  }

  // ─── CATEGORIES ────────────────────────────────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: 'List all categories with product count' })
  getCategories() {
    return this.adminService.getCategories();
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create category' })
  async createCategory(@Req() req: Request, @Body() dto: CreateCategoryDto) {
    const admin = req.user as User;
    const result = await this.adminService.createCategory(dto);
    await this.adminService.logAction(admin.id, 'CREATE', 'category', result.id, { name: dto.name });
    return result;
  }

  @Put('categories/:id')
  @ApiOperation({ summary: 'Update category' })
  async updateCategory(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    const admin = req.user as User;
    const result = await this.adminService.updateCategory(id, dto);
    await this.adminService.logAction(admin.id, 'UPDATE', 'category', id, dto);
    return result;
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete category' })
  async deleteCategory(@Req() req: Request, @Param('id') id: string) {
    const admin = req.user as User;
    const result = await this.adminService.deleteCategory(id);
    await this.adminService.logAction(admin.id, 'DELETE', 'category', id);
    return result;
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
  async createCoupon(@Req() req: Request, @Body() dto: CreateCouponDto) {
    const admin = req.user as User;
    const result = await this.adminService.createCoupon(dto);
    await this.adminService.logAction(admin.id, 'CREATE', 'coupon', result.id, { code: dto.code });
    return result;
  }

  @Put('coupons/:id')
  @ApiOperation({ summary: 'Update coupon' })
  async updateCoupon(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateCouponDto) {
    const admin = req.user as User;
    const result = await this.adminService.updateCoupon(id, dto);
    await this.adminService.logAction(admin.id, 'UPDATE', 'coupon', id, dto);
    return result;
  }

  @Delete('coupons/:id')
  @ApiOperation({ summary: 'Delete coupon' })
  async deleteCoupon(@Req() req: Request, @Param('id') id: string) {
    const admin = req.user as User;
    const result = await this.adminService.deleteCoupon(id);
    await this.adminService.logAction(admin.id, 'DELETE', 'coupon', id);
    return result;
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
  async deleteReview(@Req() req: Request, @Param('id') id: string) {
    const admin = req.user as User;
    const result = await this.adminService.deleteReview(id);
    await this.adminService.logAction(admin.id, 'DELETE', 'review', id);
    return result;
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
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ReviewSellerRequestDto,
  ) {
    const admin = req.user as User;
    return this.adminService.reviewSellerRequest(id, dto, admin.id);
  }

  // ─── AUDIT LOGS ────────────────────────────────────────────────────────────

  @Get('audit-logs')
  @ApiOperation({ summary: 'Get admin audit logs' })
  getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('adminId') adminId?: string,
    @Query('action') action?: string,
    @Query('resource') resource?: string,
  ) {
    return this.adminService.getAuditLogs(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
      adminId,
      action,
      resource,
    );
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

  // ─── PRODUCTS ─────────────────────────────────────────────────────────────

  @Get('products')
  @ApiOperation({ summary: 'List and filter all products' })
  getProducts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('sellerId') sellerId?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getProducts(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      search,
      categoryId,
      sellerId,
      status,
    );
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Update a product (Admin)' })
  async updateProduct(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateAdminProductDto,
  ) {
    const admin = req.user as User;
    const result = await this.adminService.updateProduct(id, dto);
    await this.adminService.logAction(admin.id, 'UPDATE', 'product', id, dto);
    return result;
  }

  @Delete('products/:id')
  @ApiOperation({ summary: 'Delete a product (Admin)' })
  async deleteProduct(@Req() req: Request, @Param('id') id: string) {
    const admin = req.user as User;
    const result = await this.adminService.deleteProduct(id);
    await this.adminService.logAction(admin.id, 'DELETE', 'product', id);
    return result;
  }

  // ─── MODERATION ────────────────────────────────────────────────────────────

  @Post('moderation/retrain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrain AI moderation model with seed + new data' })
  async retrainModerationModel(@Req() req: Request) {
    const admin = req.user as User;
    const result = await this.adminService.retrainModerationModel();
    await this.adminService.logAction(admin.id, 'RETRAIN', 'moderation_model', 'model');
    return result;
  }
}
