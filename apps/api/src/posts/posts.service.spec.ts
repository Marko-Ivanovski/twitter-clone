import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PostKind, PostVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from './posts.service';

const POST = {
  id: 'post-1',
  authorId: 'post-author',
  kind: PostKind.ORIGINAL,
  visibility: PostVisibility.PUBLIC,
  originalPost: null,
};

const makePrisma = () => ({
  post: { findUnique: jest.fn().mockResolvedValue(POST) },
  comment: {
    findUnique: jest.fn(),
    count: jest.fn().mockResolvedValue(500),
    create: jest.fn().mockResolvedValue({ id: 'new-comment' }),
    delete: jest.fn().mockResolvedValue({}),
  },
  follow: { findUnique: jest.fn() },
});

describe('PostsService comments', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: PostsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new PostsService(prisma as unknown as PrismaService);
  });

  describe('addComment', () => {
    it('has no cap on the number of comments per post', async () => {
      await service.addComment('post-1', 'commenter', { content: 'hello' });
      expect(prisma.comment.create).toHaveBeenCalled();
    });

    it('has no cap on the number of replies per comment', async () => {
      prisma.comment.findUnique.mockResolvedValue({
        id: 'parent',
        postId: 'post-1',
        parentCommentId: null,
      });
      await service.addComment('post-1', 'commenter', {
        content: 'reply',
        parentCommentId: 'parent',
      });
      expect(prisma.comment.create).toHaveBeenCalled();
    });

    it('rejects replying to a reply', async () => {
      prisma.comment.findUnique.mockResolvedValue({
        id: 'reply',
        postId: 'post-1',
        parentCommentId: 'parent',
      });
      await expect(
        service.addComment('post-1', 'commenter', {
          content: 'nested',
          parentCommentId: 'reply',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
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
});
