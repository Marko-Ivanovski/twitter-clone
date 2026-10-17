'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
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
  markAllRead: (upTo?: string) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

const emptyState = (userId: string | null): NotificationsState => ({
  userId,
  unreadCount: 0,
  latest: [],
});

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useAuth();
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
    let hasOpened = false;

    const loadSnapshot = () => {
      getUnreadCount()
        .then(({ count }) => {
          if (!closed) update(userId, (base) => ({ ...base, unreadCount: count }));
        })
        .catch(() => undefined);

      getNotifications(LATEST_LIMIT)
        .then(({ items }) => {
          if (!closed) update(userId, (base) => ({ ...base, latest: items }));
        })
        .catch(() => undefined);
    };

    loadSnapshot();

    const connect = () => {
      source = openNotificationsStream();
      source.addEventListener('open', () => {
        retryDelay = 1000;
        // Anything published while disconnected never reached this tab.
        if (hasOpened) loadSnapshot();
        hasOpened = true;
      });
      source.addEventListener('notification', (event) => {
        const item = JSON.parse((event as MessageEvent<string>).data) as NotificationItem;
        update(userId, (base) => {
          const isNew = !base.latest.some((n) => n.id === item.id);
          return {
            ...base,
            unreadCount: base.unreadCount + (isNew ? 1 : 0),
            latest: [item, ...base.latest.filter((n) => n.id !== item.id)].slice(0, LATEST_LIMIT),
          };
        });
      });
      source.onerror = () => {
        source?.close();
        if (closed) return;
        // EventSource cannot see a 401, so an authed request runs first to
        // let apiFetch refresh an expired access token before reconnecting.
        // A 401 here means the refresh token is gone too, so the session ended:
        // sign out instead of retrying forever. Other errors mean the API is
        // unreachable, which is worth retrying with backoff.
        retryTimer = setTimeout(() => {
          fetchCurrentUser()
            .then((me) => {
              if (closed) return;
              if (me.id === userId) connect();
              else void refreshUser();
            })
            .catch((err: unknown) => {
              if (closed) return;
              if (err instanceof ApiError && err.status === 401) void refreshUser();
              else connect();
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
  }, [userId, update, refreshUser]);

  const markAllRead = useCallback(
    async (upTo?: string) => {
      if (!userId) return;
      update(userId, (base) => ({
        ...base,
        unreadCount: 0,
        latest: base.latest.map((n) => (!upTo || n.createdAt <= upTo ? { ...n, read: true } : n)),
      }));
      try {
        await markAllNotificationsRead(upTo);
        // Anything newer than the cutoff is still unread on the server.
        const { count } = await getUnreadCount();
        update(userId, (base) => ({ ...base, unreadCount: count }));
      } catch {
        // The badge reappears on the next unread-count load if this failed.
      }
    },
    [userId, update],
  );

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
