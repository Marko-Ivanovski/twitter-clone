'use client';

import Link from 'next/link';
import type { NotificationItem } from '@/lib/notifications';
import { buildAvatarUrl, setAvatarFallback } from '@/utils/avatar';
import { formatRelativeTime } from '@/utils/relative-time';

const ACTION_TEXT: Record<NotificationItem['type'], string> = {
  LIKE: 'liked your post',
  COMMENT: 'commented on your post',
  REPLY: 'replied to your comment',
  RETWEET: 'retweeted your post',
  FOLLOW: 'started following you',
};

const targetHref = (notification: NotificationItem) =>
  notification.type === 'FOLLOW' || !notification.postId
    ? `/user/${notification.actor.username}`
    : `/post/${notification.postId}`;

interface NotificationRowProps {
  notification: NotificationItem;
  highlighted: boolean;
  onNavigate?: () => void;
}

export function NotificationRow({ notification, highlighted, onNavigate }: NotificationRowProps) {
  const { actor } = notification;
  const quote = notification.commentSnippet ?? notification.postSnippet;

  return (
    <Link
      href={targetHref(notification)}
      onClick={onNavigate}
      className={`flex items-start gap-3 px-4 py-3 text-sm transition hover:bg-gray-50 dark:hover:bg-slate-800 ${
        highlighted ? 'bg-blue-50/70 dark:bg-slate-800/70' : ''
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={buildAvatarUrl(actor.avatarUrl, actor.username)}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover"
        onError={(event) => setAvatarFallback(event, actor.username)}
      />
      <div className="min-w-0 flex-1">
        <p className="text-gray-800 dark:text-slate-100">
          <span className="font-semibold">@{actor.username}</span> {ACTION_TEXT[notification.type]}
          <span className="ml-1 text-xs text-gray-500 dark:text-slate-400">
            · {formatRelativeTime(notification.createdAt)}
          </span>
        </p>
        {quote && (
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-slate-400">“{quote}”</p>
        )}
      </div>
      {highlighted && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="Unread" />
      )}
    </Link>
  );
}
