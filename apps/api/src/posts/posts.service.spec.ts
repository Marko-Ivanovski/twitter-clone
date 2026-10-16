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
import { PostsService } from './posts.service';

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
    create: jest.fn().mockResolvedValue({ id: 'retweet-1' }),
    count: jest.fn().mockResolvedValue(1),
    delete: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  like: {
    create: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(1),
  },
  comment: {
    findUnique: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'new-comment' }),
    delete: jest.fn().mockResolvedValue({}),
  },
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
});
