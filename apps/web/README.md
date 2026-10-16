# Twitter Clone Web (Next.js)

Frontend for the Twitter Clone app, built with Next.js App Router and Tailwind CSS.

Local URL: `http://localhost:3000`

## Routes

- `/` - feed (all or following)
- `/login` - sign in
- `/register` - sign up
- `/user/[username]` - public profile
- `/settings/profile` - edit profile and change password

## Implementation Notes

- API calls live in `src/lib/*` and send cookies (`credentials: 'include'`).
- The API base URL comes from `NEXT_PUBLIC_API_BASE_URL`.
- Auth state and theme state are managed in `src/context`.
- Post interactions and infinite scroll logic live in `src/components/users/PostList.tsx`.
- Uploads are handled via `/api/uploads?folder=avatars|tweets`, which returns a URL stored with posts/users.
