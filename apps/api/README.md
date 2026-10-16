# Twitter Clone API (NestJS)

The backend service for the Twitter Clone app. Base URL is `/api`.

Local URL: `http://localhost:3001/api`

## Authentication

Auth is cookie-based using httpOnly JWT tokens. Read endpoints are public or optional-auth; all write endpoints require authentication. Passwords are hashed with bcrypt (10 rounds) on registration and verified on login. The API never returns password hashes. Login, register, and uploads are rate limited per IP.

## Endpoints (Summary)

Auth:
- POST `/api/auth/register` - Create an account and set auth cookies.
- POST `/api/auth/login` - Log in and set auth cookies.
- POST `/api/auth/refresh` - Refresh auth cookies using the refresh token.
- POST `/api/auth/logout` - Clear auth cookies.
- GET `/api/auth/me` - Return the authenticated user.

Users:
- GET `/api/users?search=...` - Search users by username or display name.
- GET `/api/users/:username` - Public profile with counts, isPrivate, followStatus and canViewPosts.
- GET `/api/users/:username/posts?limit=20&offset=0` - Paginated posts for a user. Returns 403 for private accounts you don't follow.
- POST `/api/users/:username/follow` - Follow a public account, or send a follow request to a private one. Returns `{ status: 'following' | 'requested' }`.
- DELETE `/api/users/:username/follow` - Unfollow, or cancel a pending request.
- POST `/api/users/me/follow-requests/:username/accept` - Accept a follow request sent to you.
- POST `/api/users/me/follow-requests/:username/decline` - Decline a follow request sent to you.
- PATCH `/api/users/me` - Update profile fields (display name, bio, avatar, isPrivate). Switching to public accepts all pending follow requests. Changing email or password requires `currentPassword`, and a password change signs out other sessions.

Posts:
- GET `/api/posts?limit=10&offset=0&type=all|following` - Timeline feed with optional following filter.
- GET `/api/posts/:postId` - Single post details.
- POST `/api/posts` - Create a new post (text and/or image).
- PATCH `/api/posts/:postId` - Edit post content, image, or visibility.
- DELETE `/api/posts/:postId` - Delete a post.
- POST `/api/posts/:postId/like` - Like a post.
- DELETE `/api/posts/:postId/like` - Remove a like.
- POST `/api/posts/:postId/retweet` - Retweet a post.
- DELETE `/api/posts/:postId/retweet` - Remove a retweet.
- GET `/api/posts/:postId/comments?limit=20&offset=0` - Paginated comments for a post.
- POST `/api/posts/:postId/comments` - Add a comment or reply.
- DELETE `/api/posts/:postId/comments/:commentId` - Delete a comment (its author or the post's author). Replies are removed with their parent.

Uploads:
- POST `/api/uploads?folder=avatars|tweets` - Upload an image (multipart form-data `file`).
- Files are served from `/api/uploads/<folder>/<filename>`. Only JPG, PNG, WEBP, and GIF up to 5MB are accepted, detected from the file contents.

Notifications (all require auth):
- GET `/api/notifications?limit=20&offset=0` - Paginated notifications, newest first.
- GET `/api/notifications/unread-count` - `{ count }` of unread notifications.
- POST `/api/notifications/read` - Mark all notifications as read.
- GET `/api/notifications/stream` - Server-Sent Events. Emits `notification` events as they happen and a `ping` every 25 seconds.

Request notes:
- `POST /api/posts` accepts `{ content?, imageUrl?, visibility? }` (content or imageUrl required).
- `PATCH /api/posts/:postId` accepts partial updates for the same fields.
- Pagination responses include `items`, `total`, `limit`, `offset`, and `hasMore`.

## Database Schema

- `users`: email, username, passwordHash, displayName, bio, avatarUrl, isPrivate, tokenVersion
- `posts`: content, imageUrl, kind (ORIGINAL/RETWEET), visibility (PUBLIC/PRIVATE), originalPostId
- `likes`: (userId, postId) unique pair
- `follows`: (followerId, followingId) unique pair
- `followRequests`: (requesterId, targetId) unique pair
- `comments`: content, parentCommentId for replies
- `notifications`: recipientId, actorId, type (LIKE/COMMENT/REPLY/RETWEET/FOLLOW/FOLLOW_REQUEST/FOLLOW_ACCEPTED), postId, commentId, readAt

Retweets are stored as posts with `kind = RETWEET` and `originalPostId` pointing at the original post.
