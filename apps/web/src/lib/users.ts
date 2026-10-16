import { apiFetch } from './api';

export interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  postsCount: number;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
}

export interface UserSearchResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PostItem {
  id: string;
  targetPostId: string;
  kind: 'ORIGINAL' | 'RETWEET';
  originalPostId?: string;
  repostedBy?: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  content: string | null;
  imageUrl: string | null;
  visibility: 'PUBLIC' | 'PRIVATE';
  createdAt: string;
  author: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  likeCount: number;
  commentCount: number;
  retweetCount: number;
  likedByMe: boolean;
  retweetedByMe: boolean;
  commentsPreview?: CommentPreview[];
}

export interface CommentReply {
  id: string;
  content: string;
  createdAt: string;
  author: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface CommentPreview {
  id: string;
  content: string;
  createdAt: string;
  author: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  replyCount: number;
  replies?: CommentReply[];
}

export interface PostsResponse {
  items: PostItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export async function getUserProfile(username: string): Promise<UserProfile> {
  return apiFetch<UserProfile>(`/api/users/${encodeURIComponent(username)}`);
}

export async function searchUsers(
  query: string,
  limit = 10,
  signal?: AbortSignal,
): Promise<UserSearchResult[]> {
  const params = new URLSearchParams({
    search: query,
    limit: String(limit),
  });
  return apiFetch<UserSearchResult[]>(`/api/users?${params.toString()}`, {
    signal,
  });
}

export async function getUserPosts(
  username: string,
  limit = 20,
  offset = 0,
): Promise<PostsResponse> {
  return apiFetch<PostsResponse>(
    `/api/users/${encodeURIComponent(username)}/posts?limit=${limit}&offset=${offset}`,
  );
}

export async function followUser(username: string): Promise<{ isFollowing: boolean }> {
  return apiFetch<{ isFollowing: boolean }>(`/api/users/${encodeURIComponent(username)}/follow`, {
    method: 'POST',
  });
}

export async function unfollowUser(username: string): Promise<{ isFollowing: boolean }> {
  return apiFetch<{ isFollowing: boolean }>(`/api/users/${encodeURIComponent(username)}/follow`, {
    method: 'DELETE',
  });
}

export interface UpdateProfileInput {
  email?: string;
  password?: string;
  currentPassword?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string | null;
}

export async function updateProfile(data: UpdateProfileInput): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/users/me', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
}

export interface CreatePostInput {
  content?: string;
  imageUrl?: string;
  visibility?: 'PUBLIC' | 'PRIVATE';
}

export async function createPost(input: CreatePostInput): Promise<PostItem> {
  return apiFetch<PostItem>('/api/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

export async function getTimeline(limit = 20, offset = 0, type: 'all' | 'following' = 'all'): Promise<PostsResponse> {
  return apiFetch<PostsResponse>(`/api/posts?limit=${limit}&offset=${offset}&type=${type}`);
}
