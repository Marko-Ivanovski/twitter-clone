import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { deleteUploadedFile } from './upload-files';

const logger = new Logger('UploadCleanup');

// Any user can point a post image or avatar at an existing upload URL, so a
// file is only removed once no post or avatar references it. Otherwise one
// user could delete another user's image by referencing and then dropping it.
// Cleanup runs after the database write has committed, so it is best effort:
// a failure is logged and never fails the user's request.
export async function deleteUploadIfUnreferenced(
  prisma: PrismaService,
  url: string | null | undefined,
): Promise<void> {
  if (!url) return;

  try {
    const [posts, avatars] = await Promise.all([
      prisma.post.count({ where: { imageUrl: url } }),
      prisma.user.count({ where: { avatarUrl: url } }),
    ]);
    if (posts === 0 && avatars === 0) {
      await deleteUploadedFile(url);
    }
  } catch (error) {
    logger.error(
      `Failed to clean up ${url}`,
      error instanceof Error ? error.stack : String(error),
    );
  }
}
