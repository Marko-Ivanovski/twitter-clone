import { PrismaService } from '../prisma/prisma.service';
import { deleteUploadedFile } from './upload-files';
import { deleteUploadIfUnreferenced } from './upload-references';

jest.mock('./upload-files', () => ({
  deleteUploadedFile: jest.fn().mockResolvedValue(undefined),
}));

const URL =
  'http://localhost:3001/api/uploads/tweets/11111111-1111-4111-8111-111111111111.png';

describe('deleteUploadIfUnreferenced', () => {
  const makePrisma = (posts: number, avatars: number) => ({
    post: { count: jest.fn().mockResolvedValue(posts) },
    user: { count: jest.fn().mockResolvedValue(avatars) },
  });

  beforeEach(() => (deleteUploadedFile as jest.Mock).mockClear());

  it('deletes a file nothing points at any more', async () => {
    const prisma = makePrisma(0, 0);
    await deleteUploadIfUnreferenced(prisma as unknown as PrismaService, URL);
    expect(prisma.post.count).toHaveBeenCalledWith({
      where: { imageUrl: URL },
    });
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { avatarUrl: URL },
    });
    expect(deleteUploadedFile).toHaveBeenCalledWith(URL);
  });

  it.each([
    ['another post', 1, 0],
    ['an avatar', 0, 1],
  ])('keeps a file still used by %s', async (_by, posts, avatars) => {
    await deleteUploadIfUnreferenced(
      makePrisma(posts, avatars) as unknown as PrismaService,
      URL,
    );
    expect(deleteUploadedFile).not.toHaveBeenCalled();
  });

  it('never fails the caller when cleanup itself fails', async () => {
    (deleteUploadedFile as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('locked'), { code: 'EBUSY' }),
    );
    await expect(
      deleteUploadIfUnreferenced(
        makePrisma(0, 0) as unknown as PrismaService,
        URL,
      ),
    ).resolves.toBeUndefined();

    const failingPrisma = makePrisma(0, 0);
    failingPrisma.post.count.mockRejectedValue(new Error('db down'));
    await expect(
      deleteUploadIfUnreferenced(
        failingPrisma as unknown as PrismaService,
        URL,
      ),
    ).resolves.toBeUndefined();
  });

  it('does nothing without a URL', async () => {
    const prisma = makePrisma(0, 0);
    await deleteUploadIfUnreferenced(prisma as unknown as PrismaService, null);
    expect(prisma.post.count).not.toHaveBeenCalled();
    expect(deleteUploadedFile).not.toHaveBeenCalled();
  });
});
