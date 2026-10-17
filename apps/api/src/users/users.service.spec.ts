import { ForbiddenException } from '@nestjs/common';
import { PostVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FollowsService } from './follows.service';
import { UsersService } from './users.service';

const PROFILE = {
  id: 'bob',
  username: 'bob',
  displayName: null,
  bio: 'hi',
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  isPrivate: true,
  _count: { followers: 2, following: 1 },
};

const makePrisma = () => ({
  $transaction: jest.fn(),
  user: {
    findUnique: jest.fn().mockResolvedValue(PROFILE),
    update: jest.fn(),
  },
  follow: { findMany: jest.fn().mockResolvedValue([]) },
  post: {
    count: jest.fn().mockResolvedValue(4),
    findMany: jest.fn().mockResolvedValue([]),
  },
});

describe('UsersService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let follows: {
    getStatus: jest.Mock;
    acceptAllPendingIn: jest.Mock;
    notifyAccepted: jest.Mock;
  };
  let service: UsersService;

  beforeEach(() => {
    prisma = makePrisma();
    prisma.$transaction.mockImplementation(
      (run: (tx: typeof prisma) => Promise<unknown>) => run(prisma),
    );
    follows = {
      getStatus: jest.fn().mockResolvedValue('none'),
      acceptAllPendingIn: jest.fn().mockResolvedValue(['ana']),
      notifyAccepted: jest.fn().mockResolvedValue(undefined),
    };
    service = new UsersService(
      prisma as unknown as PrismaService,
      follows as unknown as FollowsService,
    );
  });

  describe('getProfile', () => {
    it('shows a locked header to non-followers of a private account', async () => {
      const profile = await service.getProfile('bob', 'ana');

      expect(profile).toEqual(
        expect.objectContaining({
          isPrivate: true,
          bio: 'hi',
          followStatus: 'none',
          canViewPosts: false,
          followersCount: 2,
          followingCount: 1,
          postsCount: 4,
        }),
      );
      expect(prisma.post.count).toHaveBeenCalledWith({
        where: { authorId: 'bob', visibility: PostVisibility.PUBLIC },
      });
    });

    it('opens posts to an approved follower', async () => {
      follows.getStatus.mockResolvedValue('following');
      const profile = await service.getProfile('bob', 'ana');
      expect(profile?.canViewPosts).toBe(true);
      expect(profile?.followStatus).toBe('following');
    });

    it('lets the owner see their own private posts', async () => {
      const profile = await service.getProfile('bob', 'bob');
      expect(profile?.canViewPosts).toBe(true);
    });
  });

  it('refuses a private account’s posts to non-followers', async () => {
    await expect(
      service.getUserPosts('bob', 20, 0, 'ana'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  describe('updateUser privacy', () => {
    it('accepts pending requests when switching to public', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...PROFILE, isPrivate: true });
      prisma.user.update.mockResolvedValue({ ...PROFILE, isPrivate: false });

      await service.updateUser('bob', { isPrivate: false });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(follows.acceptAllPendingIn).toHaveBeenCalledWith(prisma, 'bob');
      expect(follows.notifyAccepted).toHaveBeenCalledWith('bob', ['ana']);
    });

    it('keeps pending requests when switching to private', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...PROFILE,
        isPrivate: false,
      });
      prisma.user.update.mockResolvedValue({ ...PROFILE, isPrivate: true });

      await service.updateUser('bob', { isPrivate: true });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isPrivate: true }) as object,
        }),
      );
      expect(follows.acceptAllPendingIn).not.toHaveBeenCalled();
      expect(follows.notifyAccepted).not.toHaveBeenCalled();
    });
  });
});
