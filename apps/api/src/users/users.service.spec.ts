import { NotificationType, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const makePrisma = () => ({
  user: {
    findUnique: jest.fn().mockResolvedValue({ id: 'bob', username: 'bob' }),
  },
  follow: {
    create: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
});

describe('UsersService follows', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let notifications: { notify: jest.Mock; retract: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    prisma = makePrisma();
    notifications = {
      notify: jest.fn().mockResolvedValue(undefined),
      retract: jest.fn().mockResolvedValue(undefined),
    };
    service = new UsersService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  it('notifies the followed user', async () => {
    await service.followUser('ana', 'bob');
    expect(notifications.notify).toHaveBeenCalledWith({
      type: NotificationType.FOLLOW,
      actorId: 'ana',
      recipientId: 'bob',
    });
  });

  it('does not notify when already following', async () => {
    prisma.follow.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const result = await service.followUser('ana', 'bob');
    expect(result).toEqual({ alreadyFollowing: true });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('retracts the notification on unfollow', async () => {
    await service.unfollowUser('ana', 'bob');
    expect(notifications.retract).toHaveBeenCalledWith({
      type: NotificationType.FOLLOW,
      actorId: 'ana',
      recipientId: 'bob',
    });
  });
});
