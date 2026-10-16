import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsStream } from './notifications.stream';

// Kept free of AuthModule so PostsModule and UsersModule can import it
// without creating an Auth -> Users -> Notifications -> Auth cycle.
@Module({
  providers: [NotificationsService, NotificationsStream],
  exports: [NotificationsService, NotificationsStream],
})
export class NotificationsModule {}
