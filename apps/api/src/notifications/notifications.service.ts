import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationItem,
  NotifyInput,
  RetractInput,
} from './notification.types';
import { NotificationsStream } from './notifications.stream';

const SNIPPET_LENGTH = 80;

// Only these go to the post's own author. A reply goes to a commenter who may
// have lost access to a private post, so it never carries the post's text.
const POST_AUTHOR_TYPES: NotificationType[] = [
  NotificationType.LIKE,
  NotificationType.COMMENT,
  NotificationType.RETWEET,
];

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
  postSnippet: POST_AUTHOR_TYPES.includes(row.type)
    ? toSnippet(row.post?.content)
    : null,
  commentSnippet: toSnippet(row.comment?.content),
});

export interface NotificationCursor {
  createdAt: Date;
  id: string;
}

const encodeCursor = (row: { createdAt: Date; id: string }) =>
  `${row.createdAt.toISOString()}_${row.id}`;

export const parseCursor = (
  value: string | undefined,
): NotificationCursor | undefined => {
  if (!value) return undefined;
  const separator = value.indexOf('_');
  const createdAt = new Date(value.slice(0, separator));
  const id = value.slice(separator + 1);
  if (separator < 1 || !id || Number.isNaN(createdAt.getTime())) {
    throw new BadRequestException('Invalid cursor');
  }
  return { createdAt, id };
};

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
    // Without either key the filter would match every notification of this
    // type from the actor.
    if (!input.postId && !input.recipientId) {
      this.logger.error(`Refused to retract ${input.type} without a target`);
      return;
    }

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

  async list(userId: string, limit: number, cursor?: NotificationCursor) {
    // Keyset pagination: new notifications arriving at the top cannot shift
    // later pages the way an offset would.
    const where: Prisma.NotificationWhereInput = cursor
      ? {
          recipientId: userId,
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : { recipientId: userId };

    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: notificationInclude,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: page.map(toNotificationItem),
      hasMore,
      nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientId: userId, readAt: null },
    });
  }

  async markAllRead(userId: string, upTo?: Date): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        recipientId: userId,
        readAt: null,
        ...(upTo ? { createdAt: { lte: upTo } } : {}),
      },
      data: { readAt: new Date() },
    });
  }
}
