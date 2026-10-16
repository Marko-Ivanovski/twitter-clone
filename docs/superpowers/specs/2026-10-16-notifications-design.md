# Notifications Inbox Design

Date: 2026-10-16
Status: Draft for review

## Goal

Signed-in users get an Instagram-style inbox. A bell in the nav shows an unread badge that updates in real time, opens a panel with recent activity, and links to a full notifications page. It should also show off a real-time feature built on NestJS Server-Sent Events.

## Decisions

| Topic | Decision |
|---|---|
| Events | Like, comment, reply, retweet, follow |
| Grouping | None for now. One row per event. Rows hold enough data to group later |
| Delivery | Server-Sent Events, no new dependencies |
| Inbox UI | Bell dropdown with the 10 newest, plus a `/notifications` page |
| Read state | Opening the panel or the page marks everything read |
| Undo | Unlike, unretweet, unfollow and comment deletion remove the matching notification |

## Data model

```prisma
enum NotificationType {
  LIKE
  COMMENT
  REPLY
  RETWEET
  FOLLOW
}

model Notification {
  id          String           @id @default(uuid())
  recipientId String
  actorId     String
  type        NotificationType
  postId      String?
  commentId   String?
  readAt      DateTime?
  createdAt   DateTime         @default(now())

  recipient User     @relation("NotificationRecipient", fields: [recipientId], references: [id], onDelete: Cascade)
  actor     User     @relation("NotificationActor", fields: [actorId], references: [id], onDelete: Cascade)
  post      Post?    @relation(fields: [postId], references: [id], onDelete: Cascade)
  comment   Comment? @relation(fields: [commentId], references: [id], onDelete: Cascade)

  @@index([recipientId, createdAt])
  @@index([actorId, type])
}
```

Cascades mean a deleted post, comment or user takes its notifications with it, so no cleanup code is needed for those cases.

## Who gets notified

| Event | Recipient | `postId` | `commentId` |
|---|---|---|---|
| Like | Author of the liked post (the original, for retweets) | target post | none |
| Comment | Author of the post | target post | new comment |
| Reply | Author of the parent comment | target post | new reply |
| Retweet | Author of the original post | original post | none |
| Follow | The followed user | none | none |

Nobody is notified about their own action. A reply notifies only the parent comment's author, not the post author as well.

Undo removes by `(actorId, recipientId, type, postId)` for likes and retweets, by `(actorId, recipientId, FOLLOW)` for follows, and through the comment cascade for deleted comments and replies. A retweet's notification points at the original post, so deleting a retweet through `DELETE /posts/:id` retracts it the same way unretweeting does.

## API

New `NotificationsModule`:

- `NotificationsService`
  - `notify(input)` creates a row and publishes it to the stream. It skips self-notifications.
  - `retract(input)` deletes matching rows.
  - `list(userId, limit, offset)` returns paginated items, newest first, with actor, post snippet and comment snippet.
  - `unreadCount(userId)`
  - `markAllRead(userId)` sets `readAt` on unread rows.
- `NotificationsStream` keeps an in-memory `Map<userId, Subject>`. This works because the API runs as a single instance. Scaling out would need Redis pub/sub, which is out of scope.
- `PostsService` and `UsersService` call `notify` and `retract` after their own writes succeed. A failure inside notifications is logged and never fails the like, comment or follow.

Endpoints, all behind `JwtAuthGuard`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/notifications?limit&offset` | Paginated list |
| GET | `/api/notifications/unread-count` | `{ count }` |
| POST | `/api/notifications/read` | Mark all as read, returns 204 |
| GET | `/api/notifications/stream` | SSE stream of new notifications |

The stream sends a `notification` event with the same item shape as the list endpoint, plus a heartbeat comment every 25 seconds so proxies keep the connection open. It is excluded from rate limiting.

## Web

- `NotificationsContext` runs while a user is signed in. It loads the unread count, opens `new EventSource(url, { withCredentials: true })`, prepends incoming items and bumps the count. On error it closes the source, calls `/api/auth/me` through `apiFetch` so an expired access token gets refreshed, then reconnects with backoff from 1 to 30 seconds. It closes on logout.
- `NotificationBell` in `Navigation` shows the badge (capped at "9+") and a dropdown with the 10 newest items and a "See all" link. Opening it calls `markAllRead`. Items that were unread keep a highlight until the panel closes.
- `/notifications` page lists everything with the existing infinite scroll pattern and also marks all read on open.
- Item copy: "@ana liked your post", "@ana commented: \"nice shot\"", "@ana replied: \"agreed\"", "@ana retweeted your post", "@ana started following you". Each item shows the actor's avatar and a relative time, and links to `/post/:id` or `/user/:username`.

## Error handling

- Notification writes are best effort and never break the triggering action.
- A notification whose post became private still shows to its recipient, because the recipient is the post's author.
- If the stream cannot connect, the badge still loads from `unread-count` and the page still works by request.

## Testing

- Unit tests for `NotificationsService`: recipient per event type, no self-notifications, retract removes the right rows, `markAllRead` only touches the caller's rows.
- Unit test for `NotificationsStream`: a published item reaches only that user's subscribers.
- Docker smoke script: user B opens the stream with `curl -N`, user A likes B's post, the event arrives, A unlikes, the list no longer contains it.
- A browser check of the bell, the dropdown, the badge clearing and the page.

## Out of scope

Grouping ("Ana and 4 others"), @mentions, email or push notifications, per-type settings, and multi-instance fan-out.
