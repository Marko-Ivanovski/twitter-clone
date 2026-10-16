import { NotificationType } from '@prisma/client';

export interface NotifyInput {
  type: NotificationType;
  actorId: string;
  recipientId: string;
  postId?: string;
  commentId?: string;
}

// Likes and retweets are matched by post, follows by recipient.
export interface RetractInput {
  type: NotificationType;
  actorId: string;
  postId?: string;
  recipientId?: string;
}

export interface NotificationActor {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  createdAt: Date;
  read: boolean;
  actor: NotificationActor;
  postId: string | null;
  postSnippet: string | null;
  commentSnippet: string | null;
}
