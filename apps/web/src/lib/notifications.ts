import { API_BASE_URL, apiFetch } from './api';

export type NotificationType =
  | 'LIKE'
  | 'COMMENT'
  | 'REPLY'
  | 'RETWEET'
  | 'FOLLOW'
  | 'FOLLOW_REQUEST'
  | 'FOLLOW_ACCEPTED';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  createdAt: string;
  read: boolean;
  actor: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  postId: string | null;
  postSnippet: string | null;
  commentSnippet: string | null;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  hasMore: boolean;
  nextCursor: string | null;
}

export const getNotifications = (limit = 20, cursor?: string | null) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiFetch<NotificationsResponse>(`/api/notifications?${params.toString()}`);
};

export const getUnreadCount = () =>
  apiFetch<{ count: number }>('/api/notifications/unread-count');

// upTo limits the update to what the user has actually seen.
export const markAllNotificationsRead = (upTo?: string) =>
  apiFetch<void>('/api/notifications/read', {
    method: 'POST',
    body: JSON.stringify(upTo ? { upTo } : {}),
  });

export const openNotificationsStream = () =>
  new EventSource(`${API_BASE_URL}/api/notifications/stream`, { withCredentials: true });
