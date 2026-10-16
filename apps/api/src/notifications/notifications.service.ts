import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationItem,
  NotifyInput,
  RetractInput,
} from './notification.types';
import { NotificationsStream } from './notifications.stream';

const SNIPPET_LENGTH = 80;

const notificationInclude = {
  actor: { select: { username: true, displayName: true, avatarUrl: true } },
  post: { select: { content: true } },
  comment: { select: { content: true } },
} satisfies Prisma.NotificationInclude;

type NotificationRow = Prisma.NotificationGetPayload<{
  include: typeof notificationInclude;
}>;

const toSnippet = (text: string | null | undefined): string | null => {
  if (!text) return null;
  return text.length > SNIPPET_LENGTH
    ? `${text.slice(0, SNIPPET_LENGTH - 1)}…`
    : text;
};

const toNotificationItem = (row: NotificationRow): NotificationItem => ({
  id: row.id,
  type: row.type,
  createdAt: row.createdAt,
  read: row.readAt !== null,
  actor: row.actor,
  postId: row.postId,
  postSnippet: toSnippet(row.post?.content),
  commentSnippet: toSnippet(row.comment?.content),
});

// Notifications are a side effect: failures are logged, never thrown, so a
// like or follow is never rolled back because its notification failed.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stream: NotificationsStream,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    if (input.actorId === input.recipientId) return;

    try {
      const row = await this.prisma.notification.create({
        data: {
          type: input.type,
          actorId: input.actorId,
          recipientId: input.recipientId,
          postId: input.postId,
          commentId: input.commentId,
        },
        include: notificationInclude,
      });
      this.stream.publish(input.recipientId, toNotificationItem(row));
    } catch (error) {
      this.logger.error(
        `Failed to create ${input.type} notification`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async retract(input: RetractInput): Promise<void> {
    try {
      await this.prisma.notification.deleteMany({
        where: input.recipientId
          ? {
              type: input.type,
              actorId: input.actorId,
              postId: input.postId ?? null,
              recipientId: input.recipientId,
            }
          : {
              type: input.type,
              actorId: input.actorId,
              postId: input.postId,
            },
      });
    } catch (error) {
      this.logger.error(
        `Failed to retract ${input.type} notification`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async list(userId: string, limit: number, offset: number) {
    const where = { recipientId: userId };
    const [total, rows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        skip: offset,
        include: notificationInclude,
      }),
    ]);

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(
      toNotificationItem,
    );

    return { items, total, limit, offset, hasMore };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientId: userId, readAt: null },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
