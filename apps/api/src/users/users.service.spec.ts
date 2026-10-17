import { ForbiddenException } from '@nestjs/common';
import { PostVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FollowsService } from './follows.service';
import { deleteUploadedFile } from '../uploads/upload-files';
import { UsersService } from './users.service';

jest.mock('../uploads/upload-files', () => ({
  deleteUploadedFile: jest.fn().mockResolvedValue(undefined),
}));

const OLD_AVATAR =
  'http://localhost:3001/api/uploads/avatars/11111111-1111-4111-8111-111111111111.png';
const NEW_AVATAR =
  'http://localhost:3001/api/uploads/avatars/22222222-2222-4222-8222-222222222222.png';

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
    count: jest.fn().mockResolvedValue(0),
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

  describe('avatar files', () => {
    beforeEach(() => {
      (deleteUploadedFile as jest.Mock).mockClear();
      prisma.user.findUnique.mockResolvedValue({
        ...PROFILE,
        isPrivate: false,
        avatarUrl: OLD_AVATAR,
      });
      prisma.post.count.mockResolvedValue(0);
    });

    it('keeps an avatar file someone else still uses', async () => {
      prisma.user.count.mockResolvedValue(1);
      prisma.user.update.mockResolvedValue({ ...PROFILE, avatarUrl: null });
      await service.updateUser('bob', { avatarUrl: null });
      expect(deleteUploadedFile).not.toHaveBeenCalled();
    });

    it.each([
      ['replaced', NEW_AVATAR],
      ['removed', null],
    ])('deletes the old avatar file when it is %s', async (_how, avatarUrl) => {
      prisma.user.update.mockResolvedValue({ ...PROFILE, avatarUrl });
      await service.updateUser('bob', { avatarUrl });
      expect(deleteUploadedFile).toHaveBeenCalledWith(OLD_AVATAR);
    });

    it('keeps the avatar file when the update does not touch it', async () => {
      prisma.user.update.mockResolvedValue({
        ...PROFILE,
        avatarUrl: OLD_AVATAR,
      });
      await service.updateUser('bob', { bio: 'new bio' });
      expect(deleteUploadedFile).not.toHaveBeenCalled();
    });
  });
});
