-- A double-click race could create duplicate retweets. Keep the oldest of each
-- so the unique index below can be built.
DELETE FROM "Post" p
USING "Post" q
WHERE p."kind" = 'RETWEET'
  AND q."kind" = 'RETWEET'
  AND p."authorId" = q."authorId"
  AND p."originalPostId" = q."originalPostId"
  AND (p."createdAt", p."id") > (q."createdAt", q."id");

-- One retweet per user per original post. Prisma cannot express partial
-- indexes, so this lives only in SQL.
CREATE UNIQUE INDEX "Post_retweet_author_original_key"
  ON "Post"("authorId", "originalPostId")
  WHERE "kind" = 'RETWEET';
