import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { QueryProductsDto } from './dto/query-products.dto';
import { Public } from '@/common/decorators/public.decorator';

@ApiTags('Products')
@Controller('products')
@Public()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Get product list with filters' })
  @ApiResponse({ status: 200, description: 'Product list' })
  findAll(@Query() query: QueryProductsDto) {
    return this.productsService.findAll(query);
  }

  // Must be before /:id to avoid "related" being matched as a product ID
  @Get(':id/related')
  @ApiOperation({ summary: 'Get related products' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Related products' })
  findRelated(@Param('id') id: string) {
    return this.productsService.findRelated(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product detail' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Product detail' })
  findById(@Param('id') id: string) {
    return this.productsService.findById(id);
  }
}
