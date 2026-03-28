import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Query,
  Patch,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { ContactService } from './contact.service';
import { CreateContactDto, ReplyContactDto } from './dto/contact.dto';
import { SessionAuthGuard } from 'src/common/guards/session-auth.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { ContactStatus, UserType } from 'generated/prisma/client';

@Controller('contacts')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  // Public: Submit contact form
  @Post()
  create(@Body() createContactDto: CreateContactDto) {
    return this.contactService.create(createContactDto);
  }

  // Admin: List all contact messages
  @Get('admin')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserType.ADMIN)
  findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 10,
    @Query('status') status?: ContactStatus,
  ) {
    return this.contactService.findAll(page, limit, status);
  }

  // Admin: Get single message detail
  @Get('admin/:id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserType.ADMIN)
  findOne(@Param('id') id: string) {
    return this.contactService.findOne(id);
  }

  // Admin: Reply to a contact message via email
  @Post('admin/:id/reply')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserType.ADMIN)
  reply(
    @Param('id') id: string,
    @Body() replyDto: ReplyContactDto,
    @Req() req: any,
  ) {
    return this.contactService.reply(id, replyDto, req.user.id);
  }

  // Admin: Update status (e.g., ARCHIVED)
  @Patch('admin/:id/status')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserType.ADMIN)
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: ContactStatus,
  ) {
    return this.contactService.updateStatus(id, status);
  }

  // Admin: Delete a contact message
  @Delete('admin/:id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserType.ADMIN)
  remove(@Param('id') id: string) {
    return this.contactService.remove(id);
  }
}
