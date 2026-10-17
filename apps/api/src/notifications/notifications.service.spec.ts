import { BadRequestException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, parseCursor } from './notifications.service';
import { NotificationsStream } from './notifications.stream';

const ROW = {
  id: 'n1',
  type: NotificationType.COMMENT,
  createdAt: new Date('2026-10-16T10:00:00Z'),
  readAt: null,
  recipientId: 'bob',
  actorId: 'ana',
  postId: 'post-1',
  commentId: 'c1',
  actor: { username: 'ana', displayName: 'Ana', avatarUrl: null },
  post: { content: 'A post' },
  comment: { content: 'x'.repeat(120) },
};

const makePrisma = () => ({
  notification: {
    create: jest.fn().mockResolvedValue(ROW),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockResolvedValue([ROW]),
    count: jest.fn().mockResolvedValue(1),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
});

describe('NotificationsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let stream: { publish: jest.Mock };
  let service: NotificationsService;

  beforeEach(() => {
    prisma = makePrisma();
    stream = { publish: jest.fn() };
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      stream as unknown as NotificationsStream,
    );
  });

  it('creates a row and publishes it to the recipient', async () => {
    await service.notify({
      type: NotificationType.COMMENT,
      actorId: 'ana',
      recipientId: 'bob',
      postId: 'post-1',
      commentId: 'c1',
    });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          type: NotificationType.COMMENT,
          actorId: 'ana',
          recipientId: 'bob',
          postId: 'post-1',
          commentId: 'c1',
        },
      }),
    );
    expect(stream.publish).toHaveBeenCalledWith(
      'bob',
      expect.objectContaining({ id: 'n1', read: false, postId: 'post-1' }),
    );
  });

  it('never notifies users about their own actions', async () => {
    await service.notify({
      type: NotificationType.LIKE,
      actorId: 'bob',
      recipientId: 'bob',
      postId: 'post-1',
    });

    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(stream.publish).not.toHaveBeenCalled();
  });

  it('swallows write failures so the triggering action still succeeds', async () => {
    prisma.notification.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.notify({
        type: NotificationType.FOLLOW,
        actorId: 'ana',
        recipientId: 'bob',
      }),
    ).resolves.toBeUndefined();
  });

  it('retracts likes and retweets by post', async () => {
    await service.retract({
      type: NotificationType.LIKE,
      actorId: 'ana',
      postId: 'post-1',
    });

    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { type: NotificationType.LIKE, actorId: 'ana', postId: 'post-1' },
    });
  });

  it('retracts follows by recipient', async () => {
    await service.retract({
      type: NotificationType.FOLLOW,
      actorId: 'ana',
      recipientId: 'bob',
    });

    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        type: NotificationType.FOLLOW,
        actorId: 'ana',
        postId: null,
        recipientId: 'bob',
      },
    });
  });

  it('lists newest first and truncates long snippets', async () => {
    const page = await service.list('bob', 20);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientId: 'bob' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.items[0].commentSnippet).toHaveLength(80);
    expect(page.items[0].commentSnippet?.endsWith('…')).toBe(true);
    expect(page.items[0].postSnippet).toBe('A post');
  });

  it('omits the post text from replies, whose recipient may not be able to view the post', async () => {
    prisma.notification.findMany.mockResolvedValue([
      { ...ROW, type: NotificationType.REPLY },
    ]);

    const page = await service.list('bob', 20);

    expect(page.items[0].postSnippet).toBeNull();
    expect(page.items[0].commentSnippet).not.toBeNull();
  });

  it('pages with a cursor so live arrivals never shift the next page', async () => {
    const createdAt = new Date('2026-10-16T09:00:00Z');
    prisma.notification.findMany.mockResolvedValue([ROW, { ...ROW, id: 'n2' }]);

    const page = await service.list('bob', 1, { createdAt, id: 'n9' });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          recipientId: 'bob',
          OR: [
            { createdAt: { lt: createdAt } },
            { createdAt, id: { lt: 'n9' } },
          ],
        },
        take: 2,
      }),
    );
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe(`${ROW.createdAt.toISOString()}_n1`);
  });

  it('parses cursors and rejects malformed ones', () => {
    expect(parseCursor(undefined)).toBeUndefined();
    expect(parseCursor('2026-10-16T10:00:00.000Z_n1')).toEqual({
      createdAt: new Date('2026-10-16T10:00:00.000Z'),
      id: 'n1',
    });
    expect(() => parseCursor('garbage')).toThrow(BadRequestException);
  });

  it('marks read only up to the newest notification the user has seen', async () => {
    const upTo = new Date('2026-10-16T10:00:00Z');
    await service.markAllRead('bob', upTo);

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { recipientId: 'bob', readAt: null, createdAt: { lte: upTo } },
      data: { readAt: expect.any(Date) as Date },
    });
  });

  it('refuses to retract without a post or a recipient', async () => {
    await service.retract({ type: NotificationType.LIKE, actorId: 'ana' });
    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });

  it('marks only the caller’s unread rows as read', async () => {
    await service.markAllRead('bob');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { recipientId: 'bob', readAt: null },
      data: { readAt: expect.any(Date) as Date },
    });
  });
});
