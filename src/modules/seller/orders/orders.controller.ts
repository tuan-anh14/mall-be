import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from 'generated/prisma/client';

@ApiTags('Seller Orders')
@Controller('seller/orders')
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Seller profile not found' })
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List seller orders' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['all', 'Processing', 'Shipped', 'Delivered'],
  })
  @ApiResponse({ status: 200, description: 'Orders list with stats' })
  list(
    @CurrentUser() user: User,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.ordersService.list(user.id, search, status);
  }

  @Put(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update order status' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Order status updated' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  updateStatus(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(user.id, id, dto.status);
  }
}
