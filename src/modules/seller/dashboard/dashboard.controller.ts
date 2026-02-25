import { Controller, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from 'generated/prisma/client';

@ApiTags('Seller Dashboard')
@Controller('seller/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get seller dashboard stats' })
  @ApiResponse({ status: 200, description: 'Dashboard statistics' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Seller profile not found' })
  getStats(@CurrentUser() user: User) {
    return this.dashboardService.getStats(user.id);
  }

  @Get('sales-data')
  @ApiOperation({ summary: 'Get seller monthly sales data for current year' })
  @ApiResponse({ status: 200, description: 'Monthly sales data' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Seller profile not found' })
  getSalesData(@CurrentUser() user: User) {
    return this.dashboardService.getSalesData(user.id);
  }
}
