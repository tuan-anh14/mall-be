import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('Recommendations')
@Controller('recommendations')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get personalized product recommendations for current user' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Recommended products' })
  getRecommendations(
    @CurrentUser('id') userId: string,
    @Query('limit') limit = '12',
  ) {
    return this.recommendationsService.getRecommendations(userId, +limit);
  }

  @Get('similar/:productId')
  @ApiOperation({ summary: 'Get similar products for a given product' })
  @ApiParam({ name: 'productId', type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Similar products' })
  getSimilar(
    @CurrentUser('id') userId: string,
    @Param('productId') productId: string,
    @Query('limit') limit = '8',
  ) {
    return this.recommendationsService.getSimilarProducts(productId, userId, +limit);
  }
}
