import { PostKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const commentPreviewOrderBy: Prisma.CommentOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

const commentReplyOrderBy: Prisma.CommentOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];

const commentPreviewInclude = {
  where: { parentCommentId: null },
  orderBy: commentPreviewOrderBy,
  take: 3,
  include: {
    author: {
      select: {
        username: true,
        displayName: true,
        avatarUrl: true,
      },
    },
    replies: {
      orderBy: commentReplyOrderBy,
      take: 3,
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
    _count: {
      select: {
        replies: true,
      },
    },
  },
} satisfies Prisma.Post$commentsArgs;

export const postInclude = {
  author: {
    select: {
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  },
  _count: {
    select: {
      likes: true,
      comments: true,
      retweets: true,
    },
  },
  comments: commentPreviewInclude,
  originalPost: {
    include: {
      author: {
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      _count: {
        select: {
          likes: true,
          comments: true,
          retweets: true,
        },
      },
      comments: commentPreviewInclude,
    },
  },
} satisfies Prisma.PostInclude;

export type PostWithRelations = Prisma.PostGetPayload<{
  include: typeof postInclude;
}>;

export async function mapPostsForViewer(
  prisma: PrismaService,
  items: PostWithRelations[],
  viewerId?: string,
) {
  const targetIds = Array.from(
    new Set(
      items.map((post) => {
        const target =
          post.kind === PostKind.RETWEET && post.originalPost
            ? post.originalPost
            : post;
        return target.id;
      }),
    ),
  );

  let likedPostIds = new Set<string>();
  let retweetedPostIds = new Set<string>();

  if (viewerId && targetIds.length > 0) {
    const [likes, retweets] = await Promise.all([
      prisma.like.findMany({
        where: {
          userId: viewerId,
          postId: { in: targetIds },
        },
        select: { postId: true },
      }),
      prisma.post.findMany({
        where: {
          authorId: viewerId,
          kind: PostKind.RETWEET,
          originalPostId: { in: targetIds },
        },
        select: { originalPostId: true },
      }),
    ]);

    likedPostIds = new Set(likes.map((like) => like.postId));
    retweetedPostIds = new Set(
      retweets
        .map((retweet) => retweet.originalPostId)
        .filter((id): id is string => Boolean(id)),
    );
  }

  return items.map((post) => {
    const target =
      post.kind === PostKind.RETWEET && post.originalPost
        ? post.originalPost
        : post;
    const targetId = target.id;

    const commentsPreview = (target.comments ?? []).map((comment) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      author: comment.author,
      replyCount: comment._count?.replies ?? 0,
      replies: (comment.replies ?? []).map((reply) => ({
        id: reply.id,
        content: reply.content,
        createdAt: reply.createdAt,
        author: reply.author,
      })),
    }));

    return {
      id: post.id,
      targetPostId: targetId,
      kind: post.kind,
      originalPostId: post.kind === PostKind.RETWEET ? targetId : undefined,
      repostedBy:
        post.kind === PostKind.RETWEET
          ? {
              username: post.author.username,
              displayName: post.author.displayName,
              avatarUrl: post.author.avatarUrl,
            }
          : undefined,
      content: target.content,
      imageUrl: target.imageUrl,
      visibility: target.visibility,
      createdAt: target.createdAt,
      author: target.author,
      likeCount: target._count.likes,
      commentCount: target._count.comments,
      retweetCount: target._count.retweets,
      likedByMe: likedPostIds.has(targetId),
      retweetedByMe: retweetedPostIds.has(targetId),
      commentsPreview,
    };
  });
}
