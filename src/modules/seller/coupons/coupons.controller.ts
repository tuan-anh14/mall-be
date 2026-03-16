import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { User } from 'generated/prisma/client';
import { SellerCouponsService } from './coupons.service';
import { CreateSellerCouponDto, UpdateSellerCouponDto } from './dto/coupon.dto';

@ApiTags('Seller Coupons')
@Controller('seller/coupons')
export class SellerCouponsController {
  constructor(private readonly couponsService: SellerCouponsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all coupons for this seller' })
  getCoupons(
    @Req() req: Request,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const user = req.user as User;
    return this.couponsService.getCoupons(user.id, +page, +limit);
  }

  @Post()
  @ApiOperation({ summary: 'Create a seller coupon' })
  createCoupon(@Req() req: Request, @Body() dto: CreateSellerCouponDto) {
    const user = req.user as User;
    return this.couponsService.createCoupon(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a seller coupon' })
  updateCoupon(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateSellerCouponDto,
  ) {
    const user = req.user as User;
    return this.couponsService.updateCoupon(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a seller coupon' })
  deleteCoupon(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as User;
    return this.couponsService.deleteCoupon(user.id, id);
  }
}
