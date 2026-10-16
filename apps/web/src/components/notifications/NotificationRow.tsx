'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ApiError, getErrorMessage } from '@/lib/api';
import type { NotificationItem } from '@/lib/notifications';
import { acceptFollowRequest, declineFollowRequest } from '@/lib/users';
import { buildAvatarUrl, setAvatarFallback } from '@/utils/avatar';
import { formatRelativeTime } from '@/utils/relative-time';

const ACTION_TEXT: Record<NotificationItem['type'], string> = {
  LIKE: 'liked your post',
  COMMENT: 'commented on your post',
  REPLY: 'replied to your comment',
  RETWEET: 'retweeted your post',
  FOLLOW: 'started following you',
  FOLLOW_REQUEST: 'requested to follow you',
  FOLLOW_ACCEPTED: 'accepted your follow request',
};

const PROFILE_TYPES = new Set<NotificationItem['type']>(['FOLLOW', 'FOLLOW_REQUEST', 'FOLLOW_ACCEPTED']);

const targetHref = (notification: NotificationItem) =>
  PROFILE_TYPES.has(notification.type) || !notification.postId
    ? `/user/${notification.actor.username}`
    : `/post/${notification.postId}`;

type Resolution = 'accepted' | 'removed' | null;

interface NotificationRowProps {
  notification: NotificationItem;
  highlighted: boolean;
  onNavigate?: () => void;
}

export function NotificationRow({ notification, highlighted, onNavigate }: NotificationRowProps) {
  const { actor } = notification;
  const [resolution, setResolution] = useState<Resolution>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (resolution === 'removed') return null;

  const quote = notification.commentSnippet ?? notification.postSnippet;
  const isPendingRequest = notification.type === 'FOLLOW_REQUEST' && resolution === null;

  const respond = async (action: 'accept' | 'decline') => {
    setBusy(true);
    setError(null);
    try {
      await (action === 'accept' ? acceptFollowRequest : declineFollowRequest)(actor.username);
      setResolution(action === 'accept' ? 'accepted' : 'removed');
    } catch (err) {
      // 404 means the request was already handled elsewhere, so the row goes.
      if (err instanceof ApiError && err.status === 404) {
        setResolution('removed');
      } else {
        setError(getErrorMessage(err, 'Something went wrong'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 text-sm transition hover:bg-gray-50 dark:hover:bg-slate-800 ${
        highlighted ? 'bg-blue-50/70 dark:bg-slate-800/70' : ''
      }`}
    >
      <Link href={targetHref(notification)} onClick={onNavigate} className="flex min-w-0 flex-1 items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={buildAvatarUrl(actor.avatarUrl, actor.username)}
          alt=""
          className="h-9 w-9 shrink-0 rounded-full object-cover"
          onError={(event) => setAvatarFallback(event, actor.username)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-gray-800 dark:text-slate-100">
            {resolution === 'accepted' ? (
              <>
                You accepted <span className="font-semibold">@{actor.username}</span>&apos;s request
              </>
            ) : (
              <>
                <span className="font-semibold">@{actor.username}</span> {ACTION_TEXT[notification.type]}
              </>
            )}
            <span className="ml-1 text-xs text-gray-500 dark:text-slate-400">
              · {formatRelativeTime(notification.createdAt)}
            </span>
          </p>
          {quote && <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-slate-400">“{quote}”</p>}
          {error && <p className="mt-0.5 text-xs text-red-600 dark:text-red-300">{error}</p>}
        </div>
      </Link>
      {isPendingRequest ? (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => respond('accept')}
            className="rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Accept
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => respond('decline')}
            className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Decline
          </button>
        </div>
      ) : (
        highlighted && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="Unread" />
      )}
    </div>
  );
}
