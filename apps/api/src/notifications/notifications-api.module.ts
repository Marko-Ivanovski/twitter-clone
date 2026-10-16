import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsModule } from './notifications.module';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [NotificationsController],
})
export class NotificationsApiModule {}
