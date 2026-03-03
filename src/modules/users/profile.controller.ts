import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { UpdateSettingsDto } from './dto/settings.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('User Profile')
@Controller('users')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.profileService.getProfile(userId);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete current user account' })
  @ApiResponse({ status: 200, description: 'Account deleted' })
  deleteAccount(@CurrentUser('id') userId: string) {
    return this.profileService.deleteAccount(userId);
  }

  @Put('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateProfile(userId, dto);
  }

  @Put('me/password')
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({ status: 200, description: 'Password changed' })
  changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.profileService.changePassword(userId, dto);
  }

  // ─── Addresses ──────────────────────────────────────────────────────────────

  @Get('me/addresses')
  @ApiOperation({ summary: 'Get user addresses' })
  @ApiResponse({ status: 200, description: 'Address list' })
  getAddresses(@CurrentUser('id') userId: string) {
    return this.profileService.getAddresses(userId);
  }

  @Post('me/addresses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add shipping address' })
  @ApiResponse({ status: 201, description: 'Address created' })
  createAddress(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.profileService.createAddress(userId, dto);
  }

  @Put('me/addresses/:id')
  @ApiOperation({ summary: 'Update shipping address' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Address updated' })
  updateAddress(
    @CurrentUser('id') userId: string,
    @Param('id') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.profileService.updateAddress(userId, addressId, dto);
  }

  @Delete('me/addresses/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete shipping address' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Address deleted' })
  deleteAddress(
    @CurrentUser('id') userId: string,
    @Param('id') addressId: string,
  ) {
    return this.profileService.deleteAddress(userId, addressId);
  }

  // ─── Payment Methods ─────────────────────────────────────────────────────────

  @Get('me/payment-methods')
  @ApiOperation({ summary: 'Get user payment methods' })
  @ApiResponse({ status: 200, description: 'Payment method list' })
  getPaymentMethods(@CurrentUser('id') userId: string) {
    return this.profileService.getPaymentMethods(userId);
  }

  @Delete('me/payment-methods/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete payment method' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Payment method deleted' })
  deletePaymentMethod(
    @CurrentUser('id') userId: string,
    @Param('id') methodId: string,
  ) {
    return this.profileService.deletePaymentMethod(userId, methodId);
  }

  // ─── Settings ────────────────────────────────────────────────────────────────

  @Get('me/settings')
  @ApiOperation({ summary: 'Get user settings' })
  @ApiResponse({ status: 200, description: 'User settings' })
  getSettings(@CurrentUser('id') userId: string) {
    return this.profileService.getSettings(userId);
  }

  @Put('me/settings')
  @ApiOperation({ summary: 'Update user settings' })
  @ApiResponse({ status: 200, description: 'Settings updated' })
  updateSettings(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.profileService.updateSettings(userId, dto);
  }
}
