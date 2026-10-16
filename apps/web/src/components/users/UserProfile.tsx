'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/lib/api';
import {
  followUser,
  unfollowUser,
  type FollowStatus,
  type UserProfile as UserProfileType,
} from '@/lib/users';
import { buildAvatarUrl, setAvatarFallback } from '@/utils/avatar';

interface UserProfileProps {
  user: UserProfileType;
  onFollowStatusChange?: (status: FollowStatus) => void;
}

const BUTTON_LABEL: Record<FollowStatus, string> = {
  none: 'Follow',
  requested: 'Requested',
  following: 'Following',
};

export function UserProfile({ user: initialUser, onFollowStatusChange }: UserProfileProps) {
  const { user: viewer } = useAuth();
  const [user, setUser] = useState(initialUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canFollow = Boolean(viewer) && viewer?.id !== user.id;

  const handleFollowToggle = async () => {
    setLoading(true);
    setError(null);
    try {
      const wasFollowing = user.followStatus === 'following';
      const { status } =
        user.followStatus === 'none'
          ? await followUser(user.username)
          : await unfollowUser(user.username);
      // Only a real follow or unfollow changes the count. Requests do not.
      const delta = (status === 'following' ? 1 : 0) - (wasFollowing ? 1 : 0);
      setUser((prev) => ({
        ...prev,
        followStatus: status,
        followersCount: Math.max(0, prev.followersCount + delta),
      }));
      onFollowStatusChange?.(status);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update follow status'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center space-x-6">
        <div className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="h-24 w-24 rounded-full object-cover border-4 border-gray-100 dark:border-slate-800"
            src={buildAvatarUrl(user.avatarUrl, user.username)}
            alt={user.username}
            onError={(event) => setAvatarFallback(event, user.username)}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-slate-100">
            <span className="truncate">{user.displayName || user.username}</span>
            {user.isPrivate && (
              <Lock size={18} className="shrink-0 text-gray-500 dark:text-slate-400" aria-label="Private account" />
            )}
          </h1>
          <p className="text-sm text-gray-500 mb-2 dark:text-slate-400">@{user.username}</p>
          {user.bio && (
            <p className="text-gray-700 mb-4 whitespace-pre-wrap dark:text-slate-200">{user.bio}</p>
          )}

          <div className="flex space-x-6 text-sm text-gray-600 dark:text-slate-300">
            <div>
              <span className="font-bold text-gray-900 dark:text-slate-100">{user.postsCount}</span> posts
            </div>
            <div>
              <span className="font-bold text-gray-900 dark:text-slate-100">{user.followersCount}</span> followers
            </div>
            <div>
              <span className="font-bold text-gray-900 dark:text-slate-100">{user.followingCount}</span> following
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-300">{error}</p>}
        </div>
        {canFollow && (
          <div>
            <button
              onClick={handleFollowToggle}
              disabled={loading}
              className={`px-6 py-2 rounded-full font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                user.followStatus === 'none'
                  ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                  : 'bg-gray-100 text-gray-900 hover:bg-gray-200 border border-transparent dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
              } ${loading ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              {BUTTON_LABEL[user.followStatus]}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
