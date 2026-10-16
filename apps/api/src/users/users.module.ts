import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { FollowsService } from './follows.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule), NotificationsModule],
  controllers: [UsersController],
  providers: [UsersService, FollowsService],
  exports: [UsersService],
})
export class UsersModule {}
