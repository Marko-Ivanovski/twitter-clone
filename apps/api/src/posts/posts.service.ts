import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  NotificationType,
  Post,
  PostKind,
  PostVisibility,
  Prisma,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { isRecordNotFound, isUniqueViolation } from '../prisma/prisma-errors';
import { deleteUploadedFile } from '../uploads/upload-files';
import { isOwnUploadUrl } from '../uploads/upload-url';
import { mapPostsForViewer, postInclude } from './post.mapper';
import {
  buildVisiblePostsWhere,
  getFollowingIds,
  visiblePostsWhere,
} from './post-visibility';

const MAX_REPLIES_PER_COMMENT = 50;

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async getTimeline(
    limit: number,
    offset: number,
    viewerId?: string,
    type: 'all' | 'following' = 'all',
  ) {
    let whereClause: Prisma.PostWhereInput;

    if (type === 'following') {
      if (!viewerId) {
        throw new UnauthorizedException('Unauthorized');
      }
      const followingIds = await getFollowingIds(this.prisma, viewerId);
      whereClause = {
        AND: [
          { authorId: { in: followingIds } },
          visiblePostsWhere(viewerId, followingIds),
        ],
      };
    } else {
      whereClause = await buildVisiblePostsWhere(this.prisma, viewerId);
    }

    const [total, posts] = await Promise.all([
      this.prisma.post.count({ where: whereClause }),
      this.prisma.post.findMany({
        where: whereClause,
        take: limit + 1,
        skip: offset,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: postInclude,
      }),
    ]);

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    const mappedItems = await mapPostsForViewer(this.prisma, items, viewerId);

    return {
      items: mappedItems,
      total,
      limit,
      offset,
      hasMore,
    };
  }

  async createPost(authorId: string, dto: CreatePostDto) {
    const content = dto.content?.trim() ?? '';
    const imageUrl = dto.imageUrl?.trim() ?? '';

    if (!content && !imageUrl) {
      throw new BadRequestException('Content or image is required');
    }
    this.assertOwnImageUrl(imageUrl);

    const post = await this.prisma.post.create({
      data: {
        authorId,
        content: content || null,
        imageUrl: imageUrl || null,
        kind: PostKind.ORIGINAL,
        visibility: dto.visibility ?? PostVisibility.PUBLIC,
      },
      include: postInclude,
    });

    const [mapped] = await mapPostsForViewer(this.prisma, [post], authorId);
    return mapped;
  }

  async getPostById(postId: string, viewerId?: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: postInclude,
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const target =
      post.kind === PostKind.RETWEET && post.originalPost
        ? post.originalPost
        : post;
    if (!target) {
      throw new NotFoundException('Post not found');
    }

    const canView =
      (await this.canViewPost(target, viewerId)) &&
      (target === post || (await this.canViewPost(post, viewerId)));
    if (!canView) {
      throw new ForbiddenException('Post is private');
    }

    const [mapped] = await mapPostsForViewer(this.prisma, [post], viewerId);
    return mapped;
  }

  async likePost(postId: string, userId: string) {
    const target = await this.resolveTargetPost(postId, userId);
    const targetId = target.id;

    let created = false;
    try {
      await this.prisma.like.create({
        data: {
          userId,
          postId: targetId,
        },
      });
      created = true;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }

    if (created) {
      await this.notifications.notify({
        type: NotificationType.LIKE,
        actorId: userId,
        recipientId: target.authorId,
        postId: targetId,
      });
    }

    const likeCount = await this.prisma.like.count({
      where: { postId: targetId },
    });
    return { likedByMe: true, likeCount };
  }

  async unlikePost(postId: string, userId: string) {
    const target = await this.resolveTargetPost(postId, userId);
    const targetId = target.id;

    try {
      await this.prisma.like.delete({
        where: {
          userId_postId: {
            userId,
            postId: targetId,
          },
        },
      });
    } catch (error) {
      if (!isRecordNotFound(error)) {
        throw error;
      }
    }

    await this.notifications.retract({
      type: NotificationType.LIKE,
      actorId: userId,
      postId: targetId,
    });

    const likeCount = await this.prisma.like.count({
      where: { postId: targetId },
    });
    return { likedByMe: false, likeCount };
  }

  async retweetPost(postId: string, userId: string) {
    const targetPost = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!targetPost) {
      throw new NotFoundException('Post not found');
    }

    const originalPostId =
      targetPost.kind === PostKind.RETWEET && targetPost.originalPostId
        ? targetPost.originalPostId
        : targetPost.id;

    const originalPost =
      originalPostId === targetPost.id
        ? targetPost
        : await this.prisma.post.findUnique({
            where: { id: originalPostId },
          });

    if (!originalPost) {
      throw new NotFoundException('Post not found');
    }

    const canView = await this.canViewPost(originalPost, userId);
    if (!canView) {
      throw new ForbiddenException('Post is private');
    }

    if (
      originalPost.visibility === PostVisibility.PRIVATE &&
      originalPost.authorId !== userId
    ) {
      throw new BadRequestException('Private posts cannot be retweeted');
    }

    if (originalPost.authorId !== userId) {
      const author = await this.prisma.user.findUnique({
        where: { id: originalPost.authorId },
        select: { isPrivate: true },
      });
      if (author?.isPrivate) {
        throw new BadRequestException(
          'Posts from private accounts cannot be retweeted',
        );
      }
    }

    const existing = await this.prisma.post.findFirst({
      where: {
        authorId: userId,
        kind: PostKind.RETWEET,
        originalPostId,
      },
    });

    let created = false;
    if (!existing) {
      // A concurrent retweet can pass the check above, and the partial unique
      // index on (authorId, originalPostId) for retweets rejects the second.
      try {
        await this.prisma.post.create({
          data: {
            authorId: userId,
            kind: PostKind.RETWEET,
            originalPostId,
            visibility: PostVisibility.PUBLIC,
          },
        });
        created = true;
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
      }
    }

    if (created) {
      await this.notifications.notify({
        type: NotificationType.RETWEET,
        actorId: userId,
        recipientId: originalPost.authorId,
        postId: originalPostId,
      });
    }

    const retweetCount = await this.prisma.post.count({
      where: { originalPostId, kind: PostKind.RETWEET },
    });

    return { retweetedByMe: true, retweetCount };
  }

  async unretweetPost(postId: string, userId: string) {
    const targetPost = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!targetPost) {
      throw new NotFoundException('Post not found');
    }

    const originalPostId =
      targetPost.kind === PostKind.RETWEET && targetPost.originalPostId
        ? targetPost.originalPostId
        : targetPost.id;

    await this.prisma.post.deleteMany({
      where: {
        authorId: userId,
        kind: PostKind.RETWEET,
        originalPostId,
      },
    });
    await this.notifications.retract({
      type: NotificationType.RETWEET,
      actorId: userId,
      postId: originalPostId,
    });

    const retweetCount = await this.prisma.post.count({
      where: { originalPostId, kind: PostKind.RETWEET },
    });

    return { retweetedByMe: false, retweetCount };
  }

  async getComments(
    postId: string,
    limit: number,
    offset: number,
    viewerId?: string,
  ) {
    const targetPost = await this.resolveTargetPost(postId, viewerId);
    const targetPostId = targetPost.id;

    const [total, comments] = await Promise.all([
      this.prisma.comment.count({
        where: { postId: targetPostId, parentCommentId: null },
      }),
      this.prisma.comment.findMany({
        where: { postId: targetPostId, parentCommentId: null },
        take: limit + 1,
        skip: offset,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          author: {
            select: {
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          // Replies are uncapped, so each comment's thread is bounded per response.
          replies: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: MAX_REPLIES_PER_COMMENT,
            include: {
              author: {
                select: {
                  username: true,
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
          },
          _count: { select: { replies: true } },
        },
      }),
    ]);

    const hasMore = comments.length > limit;
    const page = hasMore ? comments.slice(0, limit) : comments;
    const items = page.map(({ _count, ...comment }) => ({
      ...comment,
      replyCount: _count.replies,
    }));

    return {
      items,
      total,
      limit,
      offset,
      hasMore,
    };
  }

  async addComment(postId: string, userId: string, dto: CreateCommentDto) {
    const targetPost = await this.resolveTargetPost(postId, userId);
    const targetPostId = targetPost.id;

    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Comment cannot be empty');
    }

    let parentCommentId: string | null = null;
    let notificationType: NotificationType = NotificationType.COMMENT;
    let recipientId = targetPost.authorId;

    if (dto.parentCommentId) {
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: dto.parentCommentId },
      });

      // Threads are one level deep: replies attach to top-level comments only.
      if (
        !parentComment ||
        parentComment.postId !== targetPostId ||
        parentComment.parentCommentId !== null
      ) {
        throw new BadRequestException('Invalid parent comment');
      }

      parentCommentId = parentComment.id;
      notificationType = NotificationType.REPLY;
      recipientId = parentComment.authorId;
    }

    const comment = await this.prisma.comment.create({
      data: {
        postId: targetPostId,
        authorId: userId,
        content,
        parentCommentId,
      },
      include: {
        author: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // A reply's text must not reach a parent author who lost access to the post.
    if (await this.canViewPost(targetPost, recipientId)) {
      await this.notifications.notify({
        type: notificationType,
        actorId: userId,
        recipientId,
        postId: targetPostId,
        commentId: comment.id,
      });
    }

    return { ...comment, replies: [] };
  }

  async deleteComment(postId: string, commentId: string, userId: string) {
    const targetPost = await this.resolveTargetPost(postId, userId);
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment || comment.postId !== targetPost.id) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.authorId !== userId && targetPost.authorId !== userId) {
      throw new ForbiddenException('Cannot delete this comment');
    }

    await this.prisma.comment.delete({ where: { id: commentId } });
  }

  async updatePost(postId: string, userId: string, dto: UpdatePostDto) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException('Cannot edit this post');
    }

    if (post.kind === PostKind.RETWEET) {
      throw new BadRequestException('Retweets cannot be edited');
    }

    const content =
      typeof dto.content === 'string' ? dto.content.trim() : undefined;
    const imageUrl =
      dto.imageUrl === null
        ? null
        : typeof dto.imageUrl === 'string'
          ? dto.imageUrl.trim()
          : undefined;

    const data: Prisma.PostUpdateInput = {};
    if (dto.content !== undefined) {
      data.content = content ? content : null;
    }
    if (dto.imageUrl !== undefined) {
      data.imageUrl = imageUrl ? imageUrl : null;
    }
    if (dto.visibility !== undefined) {
      data.visibility = dto.visibility;
    }

    const nextContent =
      data.content !== undefined
        ? (data.content as string | null)
        : post.content;
    const nextImage =
      data.imageUrl !== undefined
        ? (data.imageUrl as string | null)
        : post.imageUrl;

    if (!nextContent && !nextImage) {
      throw new BadRequestException('Content or image is required');
    }
    if (data.imageUrl) {
      this.assertOwnImageUrl(data.imageUrl as string);
    }

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data,
      include: postInclude,
    });

    if (post.imageUrl && updated.imageUrl !== post.imageUrl) {
      await deleteUploadedFile(post.imageUrl);
    }

    const [mapped] = await mapPostsForViewer(this.prisma, [updated], userId);
    return mapped;
  }

  async deletePost(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException('Cannot delete this post');
    }

    if (post.kind === PostKind.RETWEET) {
      await this.prisma.post.delete({ where: { id: postId } });
      if (post.originalPostId) {
        await this.notifications.retract({
          type: NotificationType.RETWEET,
          actorId: userId,
          postId: post.originalPostId,
        });
      }
      return;
    }

    await this.prisma.post.deleteMany({
      where: {
        kind: PostKind.RETWEET,
        originalPostId: postId,
      },
    });

    await this.prisma.post.delete({ where: { id: postId } });
    await deleteUploadedFile(post.imageUrl);
  }

  private async resolveTargetPost(postId: string, viewerId?: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { originalPost: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const target =
      post.kind === PostKind.RETWEET && post.originalPost
        ? post.originalPost
        : post;

    const canView = await this.canViewPost(target, viewerId);
    if (!canView) {
      throw new ForbiddenException('Post is private');
    }

    return target;
  }

  private assertOwnImageUrl(imageUrl: string) {
    if (imageUrl && !isOwnUploadUrl(imageUrl)) {
      throw new BadRequestException('Invalid image URL');
    }
  }

  private async canViewPost(
    post: Pick<Post, 'visibility' | 'authorId'>,
    viewerId?: string,
  ) {
    if (viewerId && post.authorId === viewerId) {
      return true;
    }

    if (post.visibility === PostVisibility.PUBLIC) {
      const author = await this.prisma.user.findUnique({
        where: { id: post.authorId },
        select: { isPrivate: true },
      });
      if (author && !author.isPrivate) {
        return true;
      }
    }

    if (!viewerId) {
      return false;
    }

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewerId,
          followingId: post.authorId,
        },
      },
    });

    return Boolean(follow);
  }
}
