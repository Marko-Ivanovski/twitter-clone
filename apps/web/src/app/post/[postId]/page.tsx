'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PostList } from '@/components/users/PostList';

export default function PostPage() {
  const params = useParams<{ postId: string }>();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-slate-100"
      >
        <ArrowLeft size={16} />
        Back to feed
      </Link>
      <PostList postId={params.postId} />
    </div>
  );
}
