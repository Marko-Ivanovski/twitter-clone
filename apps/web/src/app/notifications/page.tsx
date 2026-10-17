'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import { useNotifications } from '@/context/NotificationsContext';
import { getNotifications, type NotificationItem } from '@/lib/notifications';

const PAGE_SIZE = 20;

function NotificationsList() {
  const { latest, markAllRead } = useNotifications();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getNotifications(PAGE_SIZE, cursorRef.current);
      cursorRef.current = page.nextCursor;
      setItems((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...page.items.filter((n) => !seen.has(n.id))];
      });
      setHasMore(page.hasMore);
      setError(null);
      return page.items;
    } catch {
      setError('Failed to load notifications');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // The first page keeps its unread flags for highlighting. Only what it
    // showed is marked read, so later arrivals still count as unread.
    loadPage().then((firstPage) => {
      if (firstPage.length > 0) void markAllRead(firstPage[0].createdAt);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loading) loadPage();
      },
      { rootMargin: '100px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadPage]);

  // Live notifications that arrived after the first page loaded.
  const newestLoaded = items[0]?.createdAt ?? '';
  const knownIds = new Set(items.map((n) => n.id));
  const live = latest.filter((n) => !knownIds.has(n.id) && n.createdAt > newestLoaded);
  const all = [...live, ...items];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-slate-100">Notifications</h1>
      <div className="card overflow-hidden">
        {all.length === 0 && !loading && !error && (
          <p className="px-4 py-10 text-center text-sm text-gray-500 dark:text-slate-400">
            No notifications yet.
          </p>
        )}
        {error && all.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-red-600 dark:text-red-300">{error}</p>
        )}
        <div className="divide-y divide-gray-100 dark:divide-slate-800">
          {all.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              highlighted={!notification.read}
            />
          ))}
        </div>
        {loading && (
          <div className="flex justify-center py-4">
            <LoadingSpinner size="sm" />
          </div>
        )}
        {hasMore && <div ref={sentinelRef} className="h-1" />}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsList />
    </RequireAuth>
  );
}
