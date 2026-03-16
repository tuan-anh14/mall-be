import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationSseService } from './notification-sse.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationSseService],
  exports: [NotificationsService, NotificationSseService],
})
export class NotificationsModule {}
