'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { UserProfile } from '../../../components/users/UserProfile';
import { PostList } from '../../../components/users/PostList';
import { ApiError } from '@/lib/api';
import { getUserProfile, UserProfile as UserProfileType } from '@/lib/users';

export default function UserPage() {
  const params = useParams();
  const username = params?.username as string;
  
  const [user, setUser] = useState<UserProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;

    const fetchProfile = async () => {
      setLoading(true);
      try {
        const data = await getUserProfile(username);
        setUser(data);
        setError(null);
      } catch (err) {
        console.error(err);
        if (err instanceof ApiError && err.status === 404) {
          setError('User not found');
        } else {
          setError('Failed to load profile');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  const content = loading ? (
    <div className="flex justify-center items-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  ) : error || !user ? (
    <div className="flex flex-col justify-center items-center min-h-[50vh] text-center">
      <h1 className="text-4xl font-bold text-gray-800 mb-4 dark:text-slate-100">404</h1>
      <p className="text-xl text-gray-600 dark:text-slate-300">{error || 'User not found'}</p>
    </div>
  ) : (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <UserProfile user={user} />
      <div className="mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 dark:text-slate-100">Posts</h2>
        <PostList username={user.username} />
      </div>
    </div>
  );

  return content;
}
