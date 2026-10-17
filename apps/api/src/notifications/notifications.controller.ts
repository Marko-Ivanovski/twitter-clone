import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { interval, map, merge, Observable, takeUntil, timer } from 'rxjs';
import type { AuthRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarkReadDto } from './dto/mark-read.dto';
import { NotificationsService, parseCursor } from './notifications.service';
import { NotificationsStream } from './notifications.stream';

const HEARTBEAT_MS = 25_000;

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationsStream: NotificationsStream,
  ) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
  ) {
    const safeLimit = limit < 1 || limit > 50 ? 20 : limit;
    return this.notificationsService.list(
      req.user!.sub,
      safeLimit,
      parseCursor(cursor),
    );
  }

  @Get('unread-count')
  async unreadCount(@Req() req: AuthRequest) {
    return {
      count: await this.notificationsService.unreadCount(req.user!.sub),
    };
  }

  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@Req() req: AuthRequest, @Body() dto: MarkReadDto) {
    await this.notificationsService.markAllRead(
      req.user!.sub,
      dto.upTo ? new Date(dto.upTo) : undefined,
    );
  }

  // The heartbeat keeps proxies from closing an idle connection. The stream
  // ends when the access token expires, so a revoked or logged-out session
  // cannot keep listening: reconnecting goes back through auth and refresh.
  @Sse('stream')
  @SkipThrottle()
  stream(@Req() req: AuthRequest): Observable<MessageEvent> {
    const notifications = this.notificationsStream
      .subscribe(req.user!.sub)
      .pipe(
        map((item): MessageEvent => ({ type: 'notification', data: item })),
      );
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: '' })),
    );
    const expiresInMs = Math.max(0, (req.user!.exp ?? 0) * 1000 - Date.now());
    return merge(notifications, heartbeat).pipe(takeUntil(timer(expiresInMs)));
  }
}
