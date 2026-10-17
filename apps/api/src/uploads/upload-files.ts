import { promises as fs } from 'fs';
import path from 'path';
import { getUploadsBaseUrl, isOwnUploadUrl } from './upload-url';

export const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

// Only URLs that pass isOwnUploadUrl reach the filesystem, so a stored value
// can never point this at anything outside the uploads folder.
export async function deleteUploadedFile(
  url: string | null | undefined,
  root: string = UPLOAD_ROOT,
): Promise<void> {
  if (!url || !isOwnUploadUrl(url)) return;

  const relativePath = url.slice(getUploadsBaseUrl().length + 1);
  try {
    await fs.unlink(path.join(root, relativePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
