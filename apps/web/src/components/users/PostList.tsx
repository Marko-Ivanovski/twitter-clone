'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Lock, MessageCircle, Repeat2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ApiError, getErrorMessage } from '@/lib/api';
import { CommentPreview, getUserPosts, getTimeline, PostItem } from '../../lib/users';
import {
  addComment,
  CommentItem,
  deleteComment,
  deletePost,
  getComments,
  getPost,
  likePost,
  retweetPost,
  unlikePost,
  unretweetPost,
  updatePost,
} from '@/lib/posts';
import { uploadImage, validateImageFile } from '@/lib/uploads';
import { buildAvatarUrl, setAvatarFallback } from '@/utils/avatar';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface PostListProps {
  username?: string;
  postId?: string;
  type?: 'user' | 'timeline' | 'following';
}

type Visibility = PostItem['visibility'];

const COMMENT_MAX_LENGTH = 280;
const COMMENTS_PAGE_SIZE = 20;

const toCommentPreview = (comment: CommentItem): CommentPreview => ({
  id: comment.id,
  content: comment.content,
  createdAt: comment.createdAt,
  author: comment.author,
  replyCount: comment.replies?.length ?? 0,
  replies: comment.replies ?? [],
});

const countShownComments = (comments: CommentPreview[]) =>
  comments.reduce((total, comment) => total + 1 + (comment.replies?.length ?? 0), 0);

export function PostList({ username, postId, type = 'user' }: PostListProps) {
  const { user } = useAuth();
  const router = useRouter();
  const isSingle = Boolean(postId);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const commentsOffsetRef = useRef(0);
  const [editVisibility, setEditVisibility] = useState<Record<string, Visibility>>({});
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, { like?: boolean; retweet?: boolean }>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentErrors, setCommentErrors] = useState<Record<string, string | null>>({});
  const [commentPending, setCommentPending] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyErrors, setReplyErrors] = useState<Record<string, string | null>>({});
  const [replyPending, setReplyPending] = useState<Record<string, boolean>>({});
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string | null>>({});
  const [editPending, setEditPending] = useState<Record<string, boolean>>({});
  const [editImageFiles, setEditImageFiles] = useState<Record<string, File | null>>({});
  const [editImagePreviews, setEditImagePreviews] = useState<Record<string, string | null>>({});
  const [editImageErrors, setEditImageErrors] = useState<Record<string, string | null>>({});
  const [editImageRemovals, setEditImageRemovals] = useState<Record<string, boolean>>({});
  const [deletePending, setDeletePending] = useState<Record<string, boolean>>({});
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isFetchingRef = useRef(false);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);
  const offsetRef = useRef(0);

  const pageSize = 10;

  const getTargetId = (post: PostItem) =>
    post.targetPostId || post.originalPostId || post.id;

  const updatePostsByTargetId = (
    targetId: string,
    updater: (post: PostItem) => PostItem,
  ) => {
    setPosts((prev) =>
      prev.map((post) =>
        getTargetId(post) === targetId ? updater(post) : post,
      ),
    );
  };

  const setPendingState = (
    targetId: string,
    key: 'like' | 'retweet',
    value: boolean,
  ) => {
    setPending((prev) => ({
      ...prev,
      [targetId]: { ...prev[targetId], [key]: value },
    }));
  };

  const revokePreviewUrl = (preview?: string | null) => {
    if (preview && preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview);
    }
  };

  const clearEditImageState = (postId: string) => {
    const preview = editImagePreviews[postId];
    revokePreviewUrl(preview);
    setEditImageFiles((prev) => ({ ...prev, [postId]: null }));
    setEditImagePreviews((prev) => ({ ...prev, [postId]: null }));
    setEditImageErrors((prev) => ({ ...prev, [postId]: null }));
    setEditImageRemovals((prev) => ({ ...prev, [postId]: false }));
  };

  const handleEditImageChange = (
    postId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setEditImageErrors((prev) => ({ ...prev, [postId]: validationError }));
      event.target.value = '';
      return;
    }

    revokePreviewUrl(editImagePreviews[postId]);
    setEditImageFiles((prev) => ({ ...prev, [postId]: file }));
    setEditImagePreviews((prev) => ({
      ...prev,
      [postId]: URL.createObjectURL(file),
    }));
    setEditImageErrors((prev) => ({ ...prev, [postId]: null }));
    setEditImageRemovals((prev) => ({ ...prev, [postId]: false }));
  };

  const handleEditImageRemove = (postId: string) => {
    revokePreviewUrl(editImagePreviews[postId]);
    setEditImageFiles((prev) => ({ ...prev, [postId]: null }));
    setEditImagePreviews((prev) => ({ ...prev, [postId]: null }));
    setEditImageErrors((prev) => ({ ...prev, [postId]: null }));
    setEditImageRemovals((prev) => ({ ...prev, [postId]: true }));
  };

  const handleLikeToggle = async (post: PostItem) => {
    if (!user) {
      setActionError('Log in to like posts.');
      return;
    }
    const targetId = getTargetId(post);
    if (pending[targetId]?.like) return;

    setActionError(null);
    const nextLiked = !post.likedByMe;
    const previous = { likedByMe: post.likedByMe, likeCount: post.likeCount };

    updatePostsByTargetId(targetId, (current) => ({
      ...current,
      likedByMe: nextLiked,
      likeCount: Math.max(0, current.likeCount + (nextLiked ? 1 : -1)),
    }));
    setPendingState(targetId, 'like', true);

    try {
      const result = nextLiked
        ? await likePost(targetId)
        : await unlikePost(targetId);
      updatePostsByTargetId(targetId, (current) => ({
        ...current,
        likedByMe: result.likedByMe,
        likeCount: result.likeCount,
      }));
    } catch {
      updatePostsByTargetId(targetId, (current) => ({
        ...current,
        likedByMe: previous.likedByMe,
        likeCount: previous.likeCount,
      }));
      setActionError('Unable to update like.');
    } finally {
      setPendingState(targetId, 'like', false);
    }
  };

  const handleRetweetToggle = async (post: PostItem) => {
    if (!user) {
      setActionError('Log in to retweet posts.');
      return;
    }
    const targetId = getTargetId(post);
    if (pending[targetId]?.retweet) return;

    setActionError(null);
    const nextRetweet = !post.retweetedByMe;
    const previous = {
      retweetedByMe: post.retweetedByMe,
      retweetCount: post.retweetCount,
    };

    updatePostsByTargetId(targetId, (current) => ({
      ...current,
      retweetedByMe: nextRetweet,
      retweetCount: Math.max(0, current.retweetCount + (nextRetweet ? 1 : -1)),
    }));
    setPendingState(targetId, 'retweet', true);

    try {
      const result = nextRetweet
        ? await retweetPost(targetId)
        : await unretweetPost(targetId);
      updatePostsByTargetId(targetId, (current) => ({
        ...current,
        retweetedByMe: result.retweetedByMe,
        retweetCount: result.retweetCount,
      }));
    } catch {
      updatePostsByTargetId(targetId, (current) => ({
        ...current,
        retweetedByMe: previous.retweetedByMe,
        retweetCount: previous.retweetCount,
      }));
      setActionError('Unable to update retweet.');
    } finally {
      setPendingState(targetId, 'retweet', false);
    }
  };

  const handleCommentSubmit = async (post: PostItem) => {
    if (!user) {
      setActionError('Log in to comment.');
      return;
    }

    const targetId = getTargetId(post);
    const draft = (commentDrafts[targetId] ?? '').trim();
    if (!draft) return;

    setActionError(null);
    setCommentErrors((prev) => ({ ...prev, [targetId]: null }));
    setCommentPending((prev) => ({ ...prev, [targetId]: true }));

    try {
      const preview = toCommentPreview(await addComment(targetId, draft));
      // New comments land at the top of the server's ordering.
      if (isSingle) commentsOffsetRef.current += 1;

      updatePostsByTargetId(targetId, (current) => ({
        ...current,
        commentsPreview: [preview, ...(current.commentsPreview ?? [])],
        commentCount: current.commentCount + 1,
      }));

      setCommentDrafts((prev) => ({ ...prev, [targetId]: '' }));
    } catch (err) {
      setCommentErrors((prev) => ({
        ...prev,
        [targetId]: getErrorMessage(err, 'Unable to add comment.'),
      }));
    } finally {
      setCommentPending((prev) => ({ ...prev, [targetId]: false }));
    }
  };

  const handleReplySubmit = async (post: PostItem, comment: CommentPreview) => {
    if (!user) {
      setActionError('Log in to reply.');
      return;
    }

    const targetId = getTargetId(post);
    const draft = (replyDrafts[comment.id] ?? '').trim();
    if (!draft) return;

    setActionError(null);
    setReplyErrors((prev) => ({ ...prev, [comment.id]: null }));
    setReplyPending((prev) => ({ ...prev, [comment.id]: true }));

    try {
      const newReply = await addComment(targetId, draft, comment.id);
      const replyPreview = {
        id: newReply.id,
        content: newReply.content,
        createdAt: newReply.createdAt,
        author: newReply.author,
      };

      updatePostsByTargetId(targetId, (current) => {
        const nextComments = (current.commentsPreview ?? []).map((item) => {
          if (item.id !== comment.id) return item;
          return {
            ...item,
            replies: [...(item.replies ?? []), replyPreview],
            replyCount: item.replyCount + 1,
          };
        });

        return {
          ...current,
          commentsPreview: nextComments,
          commentCount: current.commentCount + 1,
        };
      });

      setReplyDrafts((prev) => ({ ...prev, [comment.id]: '' }));
    } catch (err) {
      setReplyErrors((prev) => ({
        ...prev,
        [comment.id]: getErrorMessage(err, 'Unable to add reply.'),
      }));
    } finally {
      setReplyPending((prev) => ({ ...prev, [comment.id]: false }));
    }
  };

  const handleDeleteComment = async (
    post: PostItem,
    comment: { id: string; replyCount?: number },
    parentId?: string,
  ) => {
    if (!window.confirm(parentId ? 'Delete this reply?' : 'Delete this comment?')) return;

    const targetId = getTargetId(post);
    setActionError(null);

    try {
      await deleteComment(targetId, comment.id);
      // A top-level comment takes its replies with it.
      const removedCount = 1 + (parentId ? 0 : comment.replyCount ?? 0);
      if (isSingle && !parentId) commentsOffsetRef.current -= 1;

      updatePostsByTargetId(targetId, (current) => ({
        ...current,
        commentCount: Math.max(0, current.commentCount - removedCount),
        commentsPreview: parentId
          ? (current.commentsPreview ?? []).map((item) =>
              item.id === parentId
                ? {
                    ...item,
                    replies: (item.replies ?? []).filter((reply) => reply.id !== comment.id),
                    replyCount: Math.max(0, item.replyCount - 1),
                  }
                : item,
            )
          : (current.commentsPreview ?? []).filter((item) => item.id !== comment.id),
      }));
    } catch (err) {
      setActionError(getErrorMessage(err, 'Unable to delete comment.'));
    }
  };

  const startEditing = (post: PostItem) => {
    revokePreviewUrl(editImagePreviews[post.id]);
    setEditingPostId(post.id);
    setEditVisibility((prev) => ({ ...prev, [post.id]: post.visibility }));
    setEditDrafts((prev) => ({
      ...prev,
      [post.id]: post.content ?? '',
    }));
    setEditErrors((prev) => ({ ...prev, [post.id]: null }));
    setEditImageFiles((prev) => ({ ...prev, [post.id]: null }));
    setEditImagePreviews((prev) => ({
      ...prev,
      [post.id]: post.imageUrl ?? null,
    }));
    setEditImageErrors((prev) => ({ ...prev, [post.id]: null }));
    setEditImageRemovals((prev) => ({ ...prev, [post.id]: false }));
  };

  const cancelEditing = () => {
    if (editingPostId) {
      setEditErrors((prev) => ({ ...prev, [editingPostId]: null }));
      clearEditImageState(editingPostId);
    }
    setEditingPostId(null);
  };

  const handleEditSubmit = async (post: PostItem) => {
    if (!user) {
      setActionError('Log in to edit posts.');
      return;
    }

    const draft = (editDrafts[post.id] ?? '').trim();
    const imageFile = editImageFiles[post.id] ?? null;
    const imageRemoved = editImageRemovals[post.id] ?? false;
    const hasImageAfterEdit =
      Boolean(imageFile) || (!imageRemoved && Boolean(post.imageUrl));

    if (!draft && !hasImageAfterEdit) {
      setEditErrors((prev) => ({
        ...prev,
        [post.id]: 'Content or image is required.',
      }));
      return;
    }

    setActionError(null);
    setEditErrors((prev) => ({ ...prev, [post.id]: null }));
    setEditPending((prev) => ({ ...prev, [post.id]: true }));

    try {
      const payload: Parameters<typeof updatePost>[1] = {
        content: draft,
        visibility: editVisibility[post.id] ?? post.visibility,
      };

      if (imageFile) {
        const imageUrl = await uploadImage(imageFile, 'tweets');
        payload.imageUrl = imageUrl;
      } else if (imageRemoved) {
        payload.imageUrl = null;
      }

      const updated = await updatePost(post.id, payload);
      updatePostsByTargetId(updated.targetPostId, (current) => ({
        ...current,
        content: updated.content,
        imageUrl: updated.imageUrl,
        visibility: updated.visibility,
      }));
      clearEditImageState(post.id);
      setEditingPostId(null);
    } catch (err) {
      setEditErrors((prev) => ({
        ...prev,
        [post.id]: getErrorMessage(err, 'Unable to update post.'),
      }));
    } finally {
      setEditPending((prev) => ({ ...prev, [post.id]: false }));
    }
  };

  const handleDelete = async (post: PostItem) => {
    if (!user) {
      setActionError('Log in to delete posts.');
      return;
    }

    if (deletePending[post.id]) return;

    const confirmed = window.confirm('Delete this post?');
    if (!confirmed) return;

    setActionError(null);
    setDeletePending((prev) => ({ ...prev, [post.id]: true }));

    try {
      const targetId = getTargetId(post);
      await deletePost(post.id);
      if (isSingle) {
        router.push('/');
        return;
      }
      setPosts((prev) =>
        prev.filter((item) => getTargetId(item) !== targetId),
      );
      if (editingPostId === post.id) {
        setEditingPostId(null);
      }
    } catch (err) {
      setActionError(getErrorMessage(err, 'Unable to delete post.'));
    } finally {
      setDeletePending((prev) => ({ ...prev, [post.id]: false }));
    }
  };

  const loadMoreComments = async (post: PostItem) => {
    const targetId = getTargetId(post);
    setCommentsLoading(true);
    try {
      const page = await getComments(targetId, COMMENTS_PAGE_SIZE, commentsOffsetRef.current);
      commentsOffsetRef.current += page.items.length;
      setCommentsHasMore(page.hasMore);
      updatePostsByTargetId(targetId, (current) => ({
        ...current,
        commentsPreview: [
          ...(current.commentsPreview ?? []),
          ...page.items.map(toCommentPreview),
        ],
      }));
    } catch (err) {
      setActionError(getErrorMessage(err, 'Unable to load comments.'));
    } finally {
      setCommentsLoading(false);
    }
  };

  const fetchSinglePost = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [post, comments] = await Promise.all([
        getPost(id),
        getComments(id, COMMENTS_PAGE_SIZE, 0),
      ]);
      commentsOffsetRef.current = comments.items.length;
      setCommentsHasMore(comments.hasMore);
      setPosts([{ ...post, commentsPreview: comments.items.map(toCommentPreview) }]);
      setHasMore(false);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError('This post is private.');
      } else if (err instanceof ApiError && err.status === 404) {
        setError('This post does not exist or was deleted.');
      } else {
        setError('Failed to load post');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPosts = useCallback(async (reset = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    try {
      if (reset) {
        offsetRef.current = 0;
      }

      const currentOffset = offsetRef.current;
      let response;

      if (type === 'user' && username) {
        response = await getUserPosts(username, pageSize, currentOffset);
      } else if (type === 'following') {
        response = await getTimeline(pageSize, currentOffset, 'following');
      } else {
        response = await getTimeline(pageSize, currentOffset, 'all');
      }

      if (reset) {
        setPosts(response.items);
      } else {
        setPosts((prev) => [...prev, ...response.items]);
      }

      setHasMore(response.hasMore);
      offsetRef.current = currentOffset + response.items.length;
      setError(null);
    } catch (err) {
      setError('Failed to load posts');
      console.error(err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [pageSize, type, username]);

  useEffect(() => {
    if (postId) {
      fetchSinglePost(postId);
    } else {
      fetchPosts(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, type, postId]);

  useEffect(() => {
    if (hasUserScrolled) return;

    const handleScroll = () => {
      if (window.scrollY > 0) {
        setHasUserScrolled(true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasUserScrolled]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore) return;

    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (
          entry.isIntersecting &&
          hasUserScrolled &&
          !loading &&
          !isFetchingRef.current
        ) {
          fetchPosts();
        }
      },
      { rootMargin: '50px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPosts, hasMore, hasUserScrolled, loading]);

  useEffect(() => {
    if (!hasMore) return;

    const handleScroll = () => {
      if (!hasUserScrolled || loading || isFetchingRef.current) return;

      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const viewportHeight = window.innerHeight;

      if (scrollTop + viewportHeight >= scrollHeight - 50) {
        fetchPosts();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [fetchPosts, hasMore, hasUserScrolled, loading]);

  if (loading && posts.length === 0) {
    return <div className="text-center py-10 text-gray-500 dark:text-slate-400">Loading posts...</div>;
  }

  if (error && posts.length === 0) {
    return <div className="text-center py-10 text-red-500 dark:text-red-300">{error}</div>;
  }

  if (posts.length === 0) {
    return (
      <div className="card text-center py-10 text-gray-500 dark:text-slate-400">
        No posts yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {actionError}
        </div>
      )}
      {posts.map((post) => {
        const targetId = getTargetId(post);
        const comments = post.commentsPreview ?? [];
        const hiddenCommentCount = isSingle ? 0 : post.commentCount - countShownComments(comments);
        const commentError = commentErrors[targetId];
        const isCommenting = commentPending[targetId];
        const pendingFlags = pending[targetId] ?? {};
        const commentDraft = commentDrafts[targetId] ?? '';
        const commentHasText = commentDraft.trim().length > 0;
        const isAuthor = user?.username === post.author.username;
        const canEdit = isAuthor && post.kind === 'ORIGINAL';
        const isEditing = editingPostId === post.id;
        const editError = editErrors[post.id];
        const isSaving = editPending[post.id];
        const isDeleting = deletePending[post.id];
        const editImagePreview = (editImageRemovals[post.id] ?? false)
          ? null
          : editImagePreviews[post.id] ?? post.imageUrl;
        const editImageError = editImageErrors[post.id];

        return (
          <div key={post.id} className="card p-6">
            {post.kind === 'RETWEET' && post.repostedBy && (
              <div className="mb-3 flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-slate-400">
                <Repeat2 size={14} />
                <Link
                  href={`/user/${post.repostedBy.username}`}
                  className="hover:underline"
                >
                  @{post.repostedBy.username}
                </Link>
                <span>reposted</span>
              </div>
            )}
            <div className="flex items-start space-x-3">
              <Link href={`/user/${post.author.username}`} className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={buildAvatarUrl(post.author.avatarUrl, post.author.username)}
                  alt={post.author.username}
                  className="h-10 w-10 rounded-full object-cover"
                  onError={(event) => setAvatarFallback(event, post.author.username)}
                />
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/user/${post.author.username}`}
                    className="font-bold text-gray-900 truncate hover:underline dark:text-slate-100"
                  >
                    {post.author.displayName || post.author.username}
                  </Link>
                  <Link
                    href={`/user/${post.author.username}`}
                    className="text-sm text-gray-500 truncate hover:underline dark:text-slate-400"
                  >
                    @{post.author.username}
                  </Link>
                  <span className="text-sm text-gray-400 dark:text-slate-500">|</span>
                  <Link
                    href={`/post/${targetId}`}
                    className="text-sm text-gray-400 hover:underline dark:text-slate-500"
                  >
                    <time dateTime={post.createdAt}>
                      {new Date(post.createdAt).toLocaleDateString()}
                    </time>
                  </Link>
                  {post.visibility === 'PRIVATE' && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-slate-800 dark:text-slate-200">
                      <Lock size={12} />
                      Private
                    </span>
                  )}
                  {canEdit && (
                    <div className="ml-auto flex items-center gap-2">
                      {isEditing ? (
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditing(post)}
                          className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                          Edit
                        </button>
                      )}
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => handleDelete(post)}
                          disabled={isDeleting}
                          className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          {isDeleting ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleEditSubmit(post);
                    }}
                    className="mt-3 space-y-2"
                  >
                    <textarea
                      value={editDrafts[post.id] ?? post.content ?? ''}
                      onChange={(event) =>
                        setEditDrafts((prev) => ({
                          ...prev,
                          [post.id]: event.target.value,
                        }))
                      }
                      className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      rows={3}
                      maxLength={280}
                      disabled={isSaving}
                    />
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
                      <label className="flex items-center gap-2">
                        <span className="uppercase tracking-wide">Visibility</span>
                        <select
                          value={editVisibility[post.id] ?? post.visibility}
                          onChange={(event) =>
                            setEditVisibility((prev) => ({
                              ...prev,
                              [post.id]: event.target.value as Visibility,
                            }))
                          }
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          disabled={isSaving}
                        >
                          <option value="PUBLIC">Public</option>
                          <option value="PRIVATE">Private</option>
                        </select>
                      </label>
                      <label className="cursor-pointer rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                        {editImagePreview ? 'Change image' : 'Add image'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={isSaving}
                          onChange={(event) => handleEditImageChange(post.id, event)}
                        />
                      </label>
                      {editImagePreview && (
                        <button
                          type="button"
                          onClick={() => handleEditImageRemove(post.id)}
                          className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
                          disabled={isSaving}
                        >
                          Remove image
                        </button>
                      )}
                      {editImageError && (
                        <span className="text-xs text-red-600 dark:text-red-300">{editImageError}</span>
                      )}
                    </div>
                    {editImagePreview && (
                      <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={editImagePreview}
                          alt="Edited post image"
                          className="max-h-80 w-full object-cover"
                        />
                      </div>
                    )}
                    {editError && <p className="text-xs text-red-600 dark:text-red-300">{editError}</p>}
                    <div className="flex items-center justify-end">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </form>
                ) : (
                  post.content && (
                    <p className="mt-2 text-gray-800 whitespace-pre-wrap dark:text-slate-100">
                      {post.content}
                    </p>
                  )
                )}

                {post.imageUrl && (
                  <div className="mt-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.imageUrl}
                      alt="Post content"
                      className="rounded-lg max-h-96 object-cover bg-gray-100 dark:bg-slate-900"
                    />
                  </div>
                )}

                <div className="mt-4 flex items-center space-x-6 text-gray-500 text-sm dark:text-slate-400">
                  <div
                    className="flex items-center space-x-1 text-gray-500 dark:text-slate-400"
                    aria-label="Comments"
                  >
                    <MessageCircle size={16} />
                    <span>{post.commentCount}</span>
                  </div>
                  <button
                    className={`flex items-center space-x-1 transition-colors ${
                      post.retweetedByMe
                        ? 'text-green-600 dark:text-emerald-400'
                        : 'hover:text-green-500 dark:hover:text-emerald-400'
                    } ${pendingFlags.retweet ? 'opacity-60' : ''}`}
                    type="button"
                    aria-label="Retweets"
                    aria-pressed={post.retweetedByMe}
                    onClick={() => handleRetweetToggle(post)}
                    disabled={pendingFlags.retweet}
                  >
                    <Repeat2 size={16} />
                    <span>{post.retweetCount}</span>
                  </button>
                  <button
                    className={`flex items-center space-x-1 transition-colors ${
                      post.likedByMe
                        ? 'text-red-500 dark:text-red-400'
                        : 'hover:text-red-500 dark:hover:text-red-400'
                    } ${pendingFlags.like ? 'opacity-60' : ''}`}
                    type="button"
                    aria-label="Likes"
                    aria-pressed={post.likedByMe}
                    onClick={() => handleLikeToggle(post)}
                    disabled={pendingFlags.like}
                  >
                    <Heart size={16} />
                    <span>{post.likeCount}</span>
                  </button>
                </div>

                <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-slate-300">
                  {comments.length > 0 && (
                    <div className="space-y-3">
                      {comments.map((comment) => {
                        const replies = comment.replies ?? [];
                        const hiddenReplyCount = isSingle ? 0 : comment.replyCount - replies.length;
                        const replyError = replyErrors[comment.id];
                        const isReplying = replyPending[comment.id];
                        const replyDraft = replyDrafts[comment.id] ?? '';
                        const replyHasText = replyDraft.trim().length > 0;
                        const canDeleteComment =
                          isAuthor || user?.username === comment.author.username;

                        return (
                          <div
                            key={comment.id}
                            className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-900/80"
                          >
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                              <Link href={`/user/${comment.author.username}`} className="hover:underline">
                                {comment.author.displayName || comment.author.username} @{comment.author.username}
                              </Link>
                              {canDeleteComment && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteComment(post, comment)}
                                  className="ml-auto font-semibold text-red-600 hover:text-red-700 dark:text-red-300"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap dark:text-slate-100">
                              {comment.content}
                            </p>

                            {replies.length > 0 && (
                              <div className="mt-2 space-y-2 border-l border-gray-200 pl-3 dark:border-slate-700">
                                {replies.map((reply) => (
                                  <div
                                    key={reply.id}
                                    className="rounded-md bg-white px-2 py-1 dark:bg-slate-900"
                                  >
                                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                                      <Link href={`/user/${reply.author.username}`} className="hover:underline">
                                        {reply.author.displayName || reply.author.username} @{reply.author.username}
                                      </Link>
                                      {(isAuthor || user?.username === reply.author.username) && (
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteComment(post, reply, comment.id)}
                                          className="ml-auto font-semibold text-red-600 hover:text-red-700 dark:text-red-300"
                                        >
                                          Delete
                                        </button>
                                      )}
                                    </div>
                                    <p className="mt-0.5 text-sm text-gray-800 whitespace-pre-wrap dark:text-slate-100">
                                      {reply.content}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {hiddenReplyCount > 0 && (
                              <Link
                                href={`/post/${targetId}`}
                                className="mt-2 block text-xs font-semibold text-gray-500 hover:underline dark:text-slate-400"
                              >
                                View {hiddenReplyCount} more repl{hiddenReplyCount === 1 ? 'y' : 'ies'}
                              </Link>
                            )}

                            {user ? (
                              <form
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  handleReplySubmit(post, comment);
                                }}
                                className="mt-3 space-y-2"
                              >
                                <textarea
                                  value={replyDraft}
                                  onChange={(event) =>
                                    setReplyDrafts((prev) => ({
                                      ...prev,
                                      [comment.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Write a reply..."
                                  className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                  rows={2}
                                  maxLength={COMMENT_MAX_LENGTH}
                                  disabled={isReplying}
                                />
                                {replyError && (
                                  <p className="text-xs text-red-600 dark:text-red-300">{replyError}</p>
                                )}
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500 dark:text-slate-400">
                                    {replyDraft.length}/{COMMENT_MAX_LENGTH}
                                  </span>
                                  <button
                                    type="submit"
                                    disabled={!replyHasText || isReplying}
                                    className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                                  >
                                    {isReplying ? 'Replying...' : 'Reply'}
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                                Log in to reply.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {hiddenCommentCount > 0 && (
                    <Link
                      href={`/post/${targetId}`}
                      className="block text-xs font-semibold text-gray-500 hover:underline dark:text-slate-400"
                    >
                      View all {post.commentCount} comments
                    </Link>
                  )}

                  {isSingle && commentsHasMore && (
                    <button
                      type="button"
                      onClick={() => loadMoreComments(post)}
                      disabled={commentsLoading}
                      className="text-xs font-semibold text-gray-500 hover:underline disabled:opacity-50 dark:text-slate-400"
                    >
                      {commentsLoading ? 'Loading...' : 'Load more comments'}
                    </button>
                  )}

                  {user ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        handleCommentSubmit(post);
                      }}
                      className="space-y-2"
                    >
                      <textarea
                        value={commentDraft}
                        onChange={(event) =>
                          setCommentDrafts((prev) => ({
                            ...prev,
                            [targetId]: event.target.value,
                          }))
                        }
                        placeholder="Add a comment..."
                        className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        rows={2}
                        maxLength={COMMENT_MAX_LENGTH}
                        disabled={isCommenting}
                      />
                      {commentError && <p className="text-xs text-red-600 dark:text-red-300">{commentError}</p>}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-slate-400">
                          {commentDraft.length}/{COMMENT_MAX_LENGTH}
                        </span>
                        <button
                          type="submit"
                          disabled={!commentHasText || isCommenting}
                          className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                        >
                          {isCommenting ? 'Posting...' : 'Comment'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-slate-400">Log in to comment.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {hasMore && (
        <div
          ref={loadMoreRef}
          className="flex justify-center pt-4 text-sm text-gray-500 dark:text-slate-400"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <LoadingSpinner size="sm" />
              Loading more...
            </div>
          ) : (
            <span>Scroll to load more</span>
          )}
        </div>
      )}
    </div>
  );
}
