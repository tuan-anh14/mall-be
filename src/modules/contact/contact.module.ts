import { Module } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';
import { DatabaseModule } from 'src/database/database.module';
import { EmailModule } from 'src/shared/email/email.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, EmailModule, AuthModule],
  controllers: [ContactController],
  providers: [ContactService],
  exports: [ContactService],
})
export class ContactModule {}
