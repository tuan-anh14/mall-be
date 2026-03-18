import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { PaymentService } from './payment.service';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * VNPAY redirects the browser here with query params after payment.
   * This endpoint is PUBLIC so VNPAY can call it without a session cookie.
   */
  @Public()
  @Get('vnpay/callback')
  @ApiOperation({ summary: 'VNPAY return URL / IPN callback' })
  vnpayCallback(@Query() query: Record<string, string>) {
    return this.paymentService.handleVnpayIpn(query);
  }

  /**
   * MoMo sends POST to this endpoint.
   */
  @Public()
  @Post('momo/ipn')
  @ApiOperation({ summary: 'MoMo IPN callback' })
  momoIpn(@Body() body: Record<string, any>) {
    return this.paymentService.handleMomoIpn(body);
  }

  /**
   * Dev/test: manually confirm a pending deposit transaction.
   */
  @Post('simulate/:txnId')
  @ApiOperation({ summary: 'Simulate successful deposit (dev only)' })
  simulate(@Param('txnId') txnId: string) {
    return this.paymentService.simulateDeposit(txnId);
  }
}
