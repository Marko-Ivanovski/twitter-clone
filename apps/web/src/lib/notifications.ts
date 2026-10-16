import { API_BASE_URL, apiFetch } from './api';

export type NotificationType = 'LIKE' | 'COMMENT' | 'REPLY' | 'RETWEET' | 'FOLLOW';

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
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export const getNotifications = (limit = 20, offset = 0) =>
  apiFetch<NotificationsResponse>(`/api/notifications?limit=${limit}&offset=${offset}`);

export const getUnreadCount = () =>
  apiFetch<{ count: number }>('/api/notifications/unread-count');

export const markAllNotificationsRead = () =>
  apiFetch<void>('/api/notifications/read', { method: 'POST' });

export const openNotificationsStream = () =>
  new EventSource(`${API_BASE_URL}/api/notifications/stream`, { withCredentials: true });
