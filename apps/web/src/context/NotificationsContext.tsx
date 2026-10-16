'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchCurrentUser } from '@/lib/auth';
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  openNotificationsStream,
  type NotificationItem,
} from '@/lib/notifications';

export const LATEST_LIMIT = 10;
const MAX_RETRY_MS = 30_000;

interface NotificationsState {
  userId: string | null;
  unreadCount: number;
  latest: NotificationItem[];
}

interface NotificationsContextValue {
  unreadCount: number;
  latest: NotificationItem[];
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

const emptyState = (userId: string | null): NotificationsState => ({
  userId,
  unreadCount: 0,
  latest: [],
});

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<NotificationsState>(() => emptyState(null));

  // State belongs to one user. A stale user's state reads as empty, so a
  // logout or account switch never shows the previous user's inbox.
  const current = state.userId === userId ? state : emptyState(userId);

  const update = useCallback(
    (owner: string, change: (base: NotificationsState) => NotificationsState) => {
      setState((prev) => change(prev.userId === owner ? prev : emptyState(owner)));
    },
    [],
  );

  useEffect(() => {
    if (!userId) return;

    let closed = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;

    getUnreadCount()
      .then(({ count }) => {
        if (!closed) update(userId, (base) => ({ ...base, unreadCount: count }));
      })
      .catch(() => undefined);

    getNotifications(LATEST_LIMIT, 0)
      .then(({ items }) => {
        if (!closed) update(userId, (base) => ({ ...base, latest: items }));
      })
      .catch(() => undefined);

    const connect = () => {
      source = openNotificationsStream();
      source.addEventListener('open', () => {
        retryDelay = 1000;
      });
      source.addEventListener('notification', (event) => {
        const item = JSON.parse((event as MessageEvent<string>).data) as NotificationItem;
        update(userId, (base) => ({
          ...base,
          unreadCount: base.unreadCount + 1,
          latest: [item, ...base.latest.filter((n) => n.id !== item.id)].slice(0, LATEST_LIMIT),
        }));
      });
      source.onerror = () => {
        source?.close();
        if (closed) return;
        // EventSource cannot see a 401, so an authed request runs first to
        // let apiFetch refresh an expired access token before reconnecting.
        retryTimer = setTimeout(() => {
          fetchCurrentUser()
            .catch(() => undefined)
            .finally(() => {
              if (!closed) connect();
            });
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
      };
    };

    connect();

    return () => {
      closed = true;
      source?.close();
      clearTimeout(retryTimer);
    };
  }, [userId, update]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    update(userId, (base) => ({
      ...base,
      unreadCount: 0,
      latest: base.latest.map((n) => ({ ...n, read: true })),
    }));
    try {
      await markAllNotificationsRead();
    } catch {
      // The badge reappears on the next unread-count load if this failed.
    }
  }, [userId, update]);

  return (
    <NotificationsContext.Provider
      value={{ unreadCount: current.unreadCount, latest: current.latest, markAllRead }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
