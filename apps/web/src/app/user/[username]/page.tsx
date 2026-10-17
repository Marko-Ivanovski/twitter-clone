'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { UserProfile } from '@/components/users/UserProfile';
import { PostList } from '@/components/users/PostList';
import { ApiError } from '@/lib/api';
import { getUserProfile, type UserProfile as UserProfileType } from '@/lib/users';

export default function UserPage() {
  const params = useParams<{ username: string }>();
  const username = params?.username;

  const [user, setUser] = useState<UserProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;

    const fetchProfile = async () => {
      setLoading(true);
      try {
        setUser(await getUserProfile(username));
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError && err.status === 404 ? 'User not found' : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  // Refreshes in place, without the loading state, so the page doesn't flash.
  const refreshProfile = useCallback(async () => {
    if (!username) return;
    try {
      setUser(await getUserProfile(username));
    } catch {
      // Keep showing the last known profile.
    }
  }, [username]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[50vh] text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-4 dark:text-slate-100">404</h1>
        <p className="text-xl text-gray-600 dark:text-slate-300">{error || 'User not found'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <UserProfile user={user} onFollowChanged={refreshProfile} />
      <div className="mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 dark:text-slate-100">Posts</h2>
        {user.canViewPosts ? (
          <PostList username={user.username} />
        ) : (
          <div className="card flex flex-col items-center gap-2 py-10 text-center text-gray-600 dark:text-slate-300">
            <Lock size={28} className="text-gray-400 dark:text-slate-500" />
            <p className="font-semibold text-gray-900 dark:text-slate-100">This account is private</p>
            <p className="text-sm">Follow @{user.username} to see their posts.</p>
          </div>
        )}
      </div>
    </div>
  );
}
