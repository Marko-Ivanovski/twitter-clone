-- Bumped on password change to revoke every refresh token issued before it
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
