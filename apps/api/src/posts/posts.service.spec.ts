import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  PostKind,
  PostVisibility,
  Prisma,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { deleteUploadedFile } from '../uploads/upload-files';
import { PostsService } from './posts.service';

jest.mock('../uploads/upload-files', () => ({
  deleteUploadedFile: jest.fn().mockResolvedValue(undefined),
}));

const OLD_IMAGE =
  'http://localhost:3001/api/uploads/tweets/11111111-1111-4111-8111-111111111111.png';
const NEW_IMAGE =
  'http://localhost:3001/api/uploads/tweets/22222222-2222-4222-8222-222222222222.png';

const POST = {
  id: 'post-1',
  authorId: 'post-author',
  kind: PostKind.ORIGINAL,
  visibility: PostVisibility.PUBLIC,
  originalPostId: null,
  originalPost: null,
};

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

const makePrisma = () => ({
  post: {
    findUnique: jest.fn().mockResolvedValue(POST),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'retweet-1' }),
    count: jest.fn().mockResolvedValue(1),
    delete: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  like: {
    create: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(1),
    findMany: jest.fn().mockResolvedValue([]),
  },
  comment: {
    findUnique: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'new-comment' }),
    delete: jest.fn().mockResolvedValue({}),
  },
  user: { findUnique: jest.fn().mockResolvedValue({ isPrivate: false }) },
  follow: { findUnique: jest.fn() },
});

const makeNotifications = () => ({
  notify: jest.fn().mockResolvedValue(undefined),
  retract: jest.fn().mockResolvedValue(undefined),
});

describe('PostsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let notifications: ReturnType<typeof makeNotifications>;
  let service: PostsService;

  beforeEach(() => {
    prisma = makePrisma();
    notifications = makeNotifications();
    service = new PostsService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('addComment', () => {
    it('has no cap on the number of comments per post', async () => {
      await service.addComment('post-1', 'commenter', { content: 'hello' });
      expect(prisma.comment.create).toHaveBeenCalled();
    });

    it('notifies the post author about a comment', async () => {
      await service.addComment('post-1', 'commenter', { content: 'hello' });
      expect(notifications.notify).toHaveBeenCalledWith({
        type: NotificationType.COMMENT,
        actorId: 'commenter',
        recipientId: 'post-author',
        postId: 'post-1',
        commentId: 'new-comment',
      });
    });

    it('notifies the parent comment author about a reply', async () => {
      prisma.comment.findUnique.mockResolvedValue({
        id: 'parent',
        postId: 'post-1',
        authorId: 'parent-author',
        parentCommentId: null,
      });
      await service.addComment('post-1', 'replier', {
        content: 'reply',
        parentCommentId: 'parent',
      });
      expect(notifications.notify).toHaveBeenCalledWith({
        type: NotificationType.REPLY,
        actorId: 'replier',
        recipientId: 'parent-author',
        postId: 'post-1',
        commentId: 'new-comment',
      });
    });

    it('does not notify a parent author who can no longer view the private post', async () => {
      prisma.post.findUnique.mockResolvedValue({
        ...POST,
        visibility: PostVisibility.PRIVATE,
      });
      // The replier follows the post author. The parent author unfollowed.
      prisma.follow.findUnique.mockImplementation(
        ({
          where,
        }: {
          where: { followerId_followingId: { followerId: string } };
        }) =>
          Promise.resolve(
            where.followerId_followingId.followerId === 'replier' ? {} : null,
          ),
      );
      prisma.comment.findUnique.mockResolvedValue({
        id: 'parent',
        postId: 'post-1',
        authorId: 'parent-author',
        parentCommentId: null,
      });

      await service.addComment('post-1', 'replier', {
        content: 'reply',
        parentCommentId: 'parent',
      });

      expect(prisma.comment.create).toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('rejects replying to a reply', async () => {
      prisma.comment.findUnique.mockResolvedValue({
        id: 'reply',
        postId: 'post-1',
        authorId: 'someone',
        parentCommentId: 'parent',
      });
      await expect(
        service.addComment('post-1', 'commenter', {
          content: 'nested',
          parentCommentId: 'reply',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('deleteComment', () => {
    const comment = {
      id: 'comment-1',
      postId: 'post-1',
      authorId: 'commenter',
    };

    beforeEach(() => prisma.comment.findUnique.mockResolvedValue(comment));

    it.each([
      ['the comment author', 'commenter'],
      ['the post author', 'post-author'],
    ])('lets %s delete it', async (_who, userId) => {
      await service.deleteComment('post-1', 'comment-1', userId);
      expect(prisma.comment.delete).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
      });
    });

    it('forbids anyone else', async () => {
      await expect(
        service.deleteComment('post-1', 'comment-1', 'stranger'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.comment.delete).not.toHaveBeenCalled();
    });

    it('treats a comment from another post as not found', async () => {
      prisma.comment.findUnique.mockResolvedValue({
        ...comment,
        postId: 'other-post',
      });
      await expect(
        service.deleteComment('post-1', 'comment-1', 'commenter'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.comment.delete).not.toHaveBeenCalled();
    });
  });

  describe('likes', () => {
    it('notifies the post author on a new like', async () => {
      await service.likePost('post-1', 'fan');
      expect(notifications.notify).toHaveBeenCalledWith({
        type: NotificationType.LIKE,
        actorId: 'fan',
        recipientId: 'post-author',
        postId: 'post-1',
      });
    });

    it('does not notify again when the like already existed', async () => {
      prisma.like.create.mockRejectedValue(uniqueViolation());
      await service.likePost('post-1', 'fan');
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('retracts the notification on unlike', async () => {
      await service.unlikePost('post-1', 'fan');
      expect(notifications.retract).toHaveBeenCalledWith({
        type: NotificationType.LIKE,
        actorId: 'fan',
        postId: 'post-1',
      });
    });
  });

  describe('retweets', () => {
    it('notifies the original author when retweeting through a retweet id', async () => {
      prisma.post.findUnique
        .mockResolvedValueOnce({
          id: 'someone-elses-retweet',
          authorId: 'middleman',
          kind: PostKind.RETWEET,
          visibility: PostVisibility.PUBLIC,
          originalPostId: 'post-1',
        })
        .mockResolvedValueOnce(POST);

      await service.retweetPost('someone-elses-retweet', 'fan');

      expect(notifications.notify).toHaveBeenCalledWith({
        type: NotificationType.RETWEET,
        actorId: 'fan',
        recipientId: 'post-author',
        postId: 'post-1',
      });
    });

    it('does not notify again when the retweet already existed', async () => {
      prisma.post.findFirst.mockResolvedValue({ id: 'existing-retweet' });
      await service.retweetPost('post-1', 'fan');
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('does not notify twice when a concurrent retweet already won the insert', async () => {
      prisma.post.create.mockRejectedValue(uniqueViolation());

      const result = await service.retweetPost('post-1', 'fan');

      expect(result.retweetedByMe).toBe(true);
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('retracts the notification on unretweet', async () => {
      await service.unretweetPost('post-1', 'fan');
      expect(notifications.retract).toHaveBeenCalledWith({
        type: NotificationType.RETWEET,
        actorId: 'fan',
        postId: 'post-1',
      });
    });

    it('retracts the notification when a retweet is deleted as a post', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'retweet-1',
        authorId: 'fan',
        kind: PostKind.RETWEET,
        visibility: PostVisibility.PUBLIC,
        originalPostId: 'post-1',
      });

      await service.deletePost('retweet-1', 'fan');

      expect(notifications.retract).toHaveBeenCalledWith({
        type: NotificationType.RETWEET,
        actorId: 'fan',
        postId: 'post-1',
      });
    });
  });

  describe('private accounts', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ isPrivate: true });
    });

    it('hides a public post of a private account from non-followers', async () => {
      prisma.follow.findUnique.mockResolvedValue(null);
      await expect(
        service.likePost('post-1', 'stranger'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('shows it to an approved follower', async () => {
      prisma.follow.findUnique.mockResolvedValue({});
      await expect(service.likePost('post-1', 'follower')).resolves.toEqual(
        expect.objectContaining({ likedByMe: true }),
      );
    });

    it('blocks followers from retweeting a private account post', async () => {
      prisma.follow.findUnique.mockResolvedValue({});
      await expect(service.retweetPost('post-1', 'follower')).rejects.toThrow(
        'Posts from private accounts cannot be retweeted',
      );
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('hides a private account’s retweet of a public post from non-followers', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'retweet-1',
        authorId: 'private-retweeter',
        kind: PostKind.RETWEET,
        visibility: PostVisibility.PUBLIC,
        originalPostId: 'post-1',
        originalPost: { ...POST, authorId: 'public-author' },
      });
      prisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve({ isPrivate: where.id === 'private-retweeter' }),
      );
      prisma.follow.findUnique.mockResolvedValue(null);

      await expect(
        service.getPostById('retweet-1', 'stranger'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('still lets the owner retweet their own post', async () => {
      await service.retweetPost('post-1', 'post-author');
      expect(prisma.post.create).toHaveBeenCalled();
    });
  });

  describe('uploaded image files', () => {
    const ORIGINAL = {
      ...POST,
      content: 'with image',
      imageUrl: OLD_IMAGE,
    };
    const asUpdated = (imageUrl: string | null) => ({
      ...ORIGINAL,
      imageUrl,
      createdAt: new Date(),
      author: { username: 'author', displayName: null, avatarUrl: null },
      comments: [],
      _count: { likes: 0, comments: 0, retweets: 0 },
    });

    beforeEach(() => {
      (deleteUploadedFile as jest.Mock).mockClear();
      prisma.post.findUnique.mockResolvedValue(ORIGINAL);
    });

    it('deletes the old file when an edit replaces the image', async () => {
      prisma.post.update.mockResolvedValue(asUpdated(NEW_IMAGE));
      await service.updatePost('post-1', 'post-author', {
        imageUrl: NEW_IMAGE,
      });
      expect(deleteUploadedFile).toHaveBeenCalledWith(OLD_IMAGE);
    });

    it('deletes the file when an edit removes the image', async () => {
      prisma.post.update.mockResolvedValue(asUpdated(null));
      await service.updatePost('post-1', 'post-author', { imageUrl: null });
      expect(deleteUploadedFile).toHaveBeenCalledWith(OLD_IMAGE);
    });

    it('keeps the file when the edit leaves the image alone', async () => {
      prisma.post.update.mockResolvedValue(asUpdated(OLD_IMAGE));
      await service.updatePost('post-1', 'post-author', { content: 'edited' });
      expect(deleteUploadedFile).not.toHaveBeenCalled();
    });

    it('deletes the file together with the post', async () => {
      await service.deletePost('post-1', 'post-author');
      expect(deleteUploadedFile).toHaveBeenCalledWith(OLD_IMAGE);
    });
  });
});
