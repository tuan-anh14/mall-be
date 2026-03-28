import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { User } from 'generated/prisma/client';
import { WalletService } from './wallet.service';
import {
  AdminAdjustWalletDto,
  CreateDepositDto,
  CreateWithdrawDto,
  QueryAdminWalletsDto,
  QueryWalletTransactionsDto,
} from './dto/wallet.dto';
import { AdminGuard } from '../admin/admin.guard';

@ApiTags('Wallet')
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  // ─── Buyer Endpoints ────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get current user wallet balance' })
  getWallet(@Req() req: Request) {
    const user = req.user as User;
    return this.walletService.getWallet(user.id);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get wallet transaction history' })
  getTransactions(
    @Req() req: Request,
    @Query() query: QueryWalletTransactionsDto,
  ) {
    const user = req.user as User;
    return this.walletService.getTransactions(user.id, query);
  }

  @Post('deposit')
  @ApiOperation({ summary: 'Create a deposit intent (get gateway payment URL)' })
  createDeposit(@Req() req: Request, @Body() dto: CreateDepositDto) {
    const user = req.user as User;
    return this.walletService.createDepositIntent(user.id, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get wallet statistics' })
  getStats(@Req() req: Request) {
    const user = req.user as User;
    return this.walletService.getWalletStats(user.id);
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Initiate a withdrawal' })
  withdraw(@Req() req: Request, @Body() dto: CreateWithdrawDto) {
    const user = req.user as User;
    return this.walletService.withdraw(user.id, dto);
  }

  // ─── Admin Endpoints ────────────────────────────────────────────────────────

  @Get('admin/list')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: list all user wallets' })
  adminGetWallets(@Query() query: QueryAdminWalletsDto) {
    return this.walletService.adminGetWallets(query);
  }

  @Get('admin/user/:userId')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: get wallet detail by userId' })
  adminGetWallet(@Param('userId') userId: string) {
    return this.walletService.adminGetWalletByUserId(userId);
  }

  @Put('admin/user/:userId/adjust')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: manually adjust wallet balance' })
  adminAdjust(
    @Req() req: Request,
    @Param('userId') targetUserId: string,
    @Body() dto: AdminAdjustWalletDto,
  ) {
    const admin = req.user as User;
    return this.walletService.adminAdjust(admin.id, targetUserId, dto);
  }
  
  @Get('admin/user/:userId/transactions')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: get wallet transactions by userId' })
  adminGetTransactions(
    @Param('userId') userId: string,
    @Query() query: QueryWalletTransactionsDto,
  ) {
    return this.walletService.adminGetTransactionsByUserId(userId, query);
  }
}
