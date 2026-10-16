# Twitter Clone

A simplified Twitter-style social feed built with Next.js, NestJS, and Postgres. Public browsing is supported, while posting and interactions require an account.

## Features

- Public browsing of the timeline and profiles
- Following timeline filter
- Infinite scroll pagination
- Account registration and login with cookie auth
- Profile editing (display name, bio, avatar)
- Avatar upload and removal
- Password change flow
- Post creation with optional images
- Post editing and deletion
- Likes and retweets with counters
- Comments and replies
- Post visibility (public/private)
- Follow and unfollow users
- User search
- Light/dark theme toggle

## Architecture Overview

- Next.js App Router frontend calls the NestJS API under `/api`
- Prisma handles data access and migrations against Postgres
- Auth uses JWT access/refresh tokens stored in httpOnly cookies
- Uploads are stored on disk and served by the API

## Tech Stack

- Next.js 16 + React 19 + Tailwind CSS 4
- NestJS 11 + Prisma 7
- Postgres 16

## Running Locally (Docker)

1. Create a `.env` file in the repo root.
2. Copy `.env.example` to `.env` and adjust values if needed.
    ```
    # Database
    POSTGRES_USER=postgres
    POSTGRES_PASSWORD=postgres
    POSTGRES_DB=project_db
    POSTGRES_PORT=5432
    DATABASE_URL=postgresql://postgres:postgres@db:5432/project_db

    # API
    API_PORT=3001
    PORT=3001
    API_BASE_URL=http://localhost:3001
    JWT_ACCESS_SECRET=replace-with-secure-random-string
    JWT_REFRESH_SECRET=replace-with-secure-random-string

    # Web
    WEB_PORT=3000
    NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
    ```
3. Make sure Docker Desktop (or the Docker Engine) is running in the background.
4. From the repo root, run `docker compose up --build`.
5. Open `http://localhost:3000` for the web app and `http://localhost:3001/api` for the API.
6. To get started in the web app, the user first should create an account and login (without that, only 'Public' posts can be seen in the home page). 

## Media Folder

In the `/media` folder in the root repo is a simple video showcasing all of the features and implementations, alongside screenshots of the database and how things are stored. The mistakes and corrections in the video were intentional to showcase validation (example wrong credentials, or unsafe password). 

## Potential Future Improvements

- Notification Inbox System
- Private/Public Profiles (something like Instagram)
- Messaging 
- Uploading videos on tweets