import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ReturnRequestsService } from './return-requests.service';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';
import { UpdateReturnRequestStatusDto } from './dto/update-return-request.dto';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';

@Controller('return-requests')
@UseGuards(SessionAuthGuard)
export class ReturnRequestsController {
  constructor(private readonly returnRequestsService: ReturnRequestsService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateReturnRequestDto) {
    return this.returnRequestsService.create(req.user.id, dto);
  }

  @Get()
  list(@Req() req: any) {
    return this.returnRequestsService.list(req.user.id, req.user.userType);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.returnRequestsService.findOne(req.user.id, id);
  }

  @Patch(':id/status')
  updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateReturnRequestStatusDto,
  ) {
    return this.returnRequestsService.updateStatus(req.user.id, id, dto);
  }

  @Post(':id/confirm-receipt')
  confirmReceipt(@Req() req: any, @Param('id') id: string) {
    return this.returnRequestsService.confirmReceiptAndRefund(req.user.id, id);
  }
}
