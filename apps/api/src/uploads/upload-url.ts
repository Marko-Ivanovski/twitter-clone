export const UPLOAD_FOLDERS = ['avatars', 'posts', 'tweets', 'misc'] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

const UPLOAD_PATH_PATTERN =
  /^\/(avatars|posts|tweets|misc)\/[0-9a-f-]{36}\.(jpg|png|gif|webp)$/;

export const getUploadsBaseUrl = (): string =>
  `${process.env.API_BASE_URL ?? 'http://localhost:3001'}/api/uploads`;

export const isUploadFolder = (value: unknown): value is UploadFolder =>
  typeof value === 'string' &&
  (UPLOAD_FOLDERS as readonly string[]).includes(value);

export const isOwnUploadUrl = (url: string): boolean => {
  const baseUrl = getUploadsBaseUrl();
  return (
    url.startsWith(baseUrl) &&
    UPLOAD_PATH_PATTERN.test(url.slice(baseUrl.length))
  );
};
