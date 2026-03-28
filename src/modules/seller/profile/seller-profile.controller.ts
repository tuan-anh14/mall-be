import { Controller, Post, Patch, Delete } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { SellerProfileService } from './seller-profile.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from 'generated/prisma/client';

@ApiTags('Seller Profile Management')
@Controller('seller/profile')
export class SellerProfileController {
  constructor(private readonly sellerProfileService: SellerProfileService) {}

  @Patch('toggle-suspension')
  @ApiOperation({ summary: 'Toggle store suspension status' })
  @ApiResponse({ status: 200, description: 'Suspension status updated' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Seller profile not found' })
  @ApiBadRequestResponse({ description: 'Cannot suspend with active orders' })
  toggleSuspension(@CurrentUser() user: User) {
    return this.sellerProfileService.toggleSuspension(user.id);
  }

  @Delete('close')
  @ApiOperation({ summary: 'Permanently close store' })
  @ApiResponse({ status: 200, description: 'Store closed successfully' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Seller profile not found' })
  @ApiBadRequestResponse({ description: 'Cannot close with active orders' })
  closeStore(@CurrentUser() user: User) {
    return this.sellerProfileService.closeStore(user.id);
  }
}
