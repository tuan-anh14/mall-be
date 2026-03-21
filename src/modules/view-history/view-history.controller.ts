import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ViewHistoryService } from './view-history.service';
import { TrackViewDto } from './dto/track-view.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('View History')
@Controller('view-history')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
export class ViewHistoryController {
  constructor(private readonly viewHistoryService: ViewHistoryService) {}

  @Post('track')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track a product view' })
  @ApiResponse({ status: 200, description: 'View tracked successfully' })
  trackView(
    @CurrentUser('id') userId: string,
    @Body() dto: TrackViewDto,
  ) {
    return this.viewHistoryService.trackView(userId, dto.productId);
  }

  @Get()
  @ApiOperation({ summary: 'Get view history for current user' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'View history list' })
  getHistory(
    @CurrentUser('id') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.viewHistoryService.getViewHistory(userId, +page, +limit);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear all view history' })
  @ApiResponse({ status: 200, description: 'History cleared' })
  clearHistory(@CurrentUser('id') userId: string) {
    return this.viewHistoryService.clearHistory(userId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a product from view history' })
  @ApiParam({ name: 'productId', type: String })
  @ApiResponse({ status: 200, description: 'Item removed from history' })
  removeFromHistory(
    @CurrentUser('id') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.viewHistoryService.removeFromHistory(userId, productId);
  }
}
