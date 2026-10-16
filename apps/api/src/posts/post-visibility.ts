import { PostKind, PostVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function getFollowingIds(
  prisma: PrismaService,
  viewerId: string,
): Promise<string[]> {
  const follows = await prisma.follow.findMany({
    where: { followerId: viewerId },
    select: { followingId: true },
  });

  return follows.map((follow) => follow.followingId);
}

function readableBy(
  viewerId: string | undefined,
  followingIds: string[],
): Prisma.PostWhereInput {
  if (!viewerId) {
    return { visibility: PostVisibility.PUBLIC };
  }

  return {
    OR: [
      { visibility: PostVisibility.PUBLIC },
      { authorId: { in: [viewerId, ...followingIds] } },
    ],
  };
}

// Retweet rows are always PUBLIC, so their reach is bounded by the original
// post's visibility. Otherwise a private post leaks through anyone's retweet.
export function visiblePostsWhere(
  viewerId: string | undefined,
  followingIds: string[],
): Prisma.PostWhereInput {
  const readable = readableBy(viewerId, followingIds);

  return {
    OR: [
      { kind: PostKind.ORIGINAL, ...readable },
      { kind: PostKind.RETWEET, originalPost: { is: readable } },
    ],
  };
}

export async function buildVisiblePostsWhere(
  prisma: PrismaService,
  viewerId?: string,
): Promise<Prisma.PostWhereInput> {
  const followingIds = viewerId ? await getFollowingIds(prisma, viewerId) : [];
  return visiblePostsWhere(viewerId, followingIds);
}
