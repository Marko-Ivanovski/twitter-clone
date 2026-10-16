'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '@/context/NotificationsContext';
import { NotificationRow } from './NotificationRow';

export function NotificationBell() {
  const { unreadCount, latest, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    // Items unread at the moment of opening stay highlighted while it is open.
    setHighlightIds(new Set(latest.filter((n) => !n.read).map((n) => n.id)));
    setOpen(true);
    if (unreadCount > 0) void markAllRead();
  };

  const badge = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative rounded-full p-2 text-gray-700 transition hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-[1.1rem] text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-lg ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-900 dark:border-slate-800 dark:text-slate-100">
            Notifications
          </div>
          {latest.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-slate-400">
              No notifications yet.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {latest.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  highlighted={highlightIds.has(notification.id) || !notification.read}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
          )}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-gray-100 px-4 py-2 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            See all
          </Link>
        </div>
      )}
    </div>
  );
}
