import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
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
  ApiConflictResponse,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from 'generated/prisma/client';

@ApiTags('Seller Products')
@Controller('seller/products')
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Seller profile not found' })
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List seller products' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Products list with stats' })
  list(@CurrentUser() user: User, @Query('search') search?: string) {
    return this.productsService.list(user.id, search);
  }

  @Post()
  @ApiOperation({ summary: 'Create a product' })
  @ApiResponse({ status: 201, description: 'Product created' })
  @ApiConflictResponse({ description: 'SKU already exists' })
  create(@CurrentUser() user: User, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.id, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a product (Full)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Product updated' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiConflictResponse({ description: 'SKU already exists' })
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user.id, id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product (Partial)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Product updated' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiConflictResponse({ description: 'SKU already exists' })
  partialUpdate(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user.id, id, dto);
  }

  @Patch(':id/stock')
  @ApiOperation({ summary: 'Update product stock' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Stock updated' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  updateStock(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateStockDto,
  ) {
    return this.productsService.updateStock(user.id, id, dto.stock);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a product' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Product deleted' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  delete(@CurrentUser() user: User, @Param('id') id: string) {
    return this.productsService.delete(user.id, id);
  }
}
