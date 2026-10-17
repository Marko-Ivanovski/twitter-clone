# Twitter Clone Web (Next.js)

Frontend for the Twitter Clone app, built with the Next.js App Router and Tailwind CSS.

Local URL: `http://localhost:3000`

## Routes

- `/` - feed (all posts or following)
- `/post/[postId]` - a single post with all of its comments
- `/user/[username]` - profile, or a locked header for private accounts you don't follow
- `/notifications` - full notifications inbox
- `/login` - sign in
- `/register` - sign up
- `/settings/profile` - profile, private account toggle, email and password

## Implementation Notes

- API calls live in `src/lib/*` and send cookies (`credentials: 'include'`). On a 401, `apiFetch` refreshes the session once and retries.
- The API base URL comes from `NEXT_PUBLIC_API_BASE_URL`, which is baked in at build time.
- `src/context/NotificationsContext.tsx` holds the unread count and newest notifications. It keeps an `EventSource` open to the API's stream and reconnects through the refresh flow when the stream ends.
- `src/proxy.ts` sends visitors without a session away from `/settings` before the page loads. Real access checks happen in the API.
- Post interactions and infinite scroll live in `src/components/users/PostList.tsx`.
- Uploads go to `/api/uploads?folder=avatars|tweets`, which returns the URL stored on the post or user.
