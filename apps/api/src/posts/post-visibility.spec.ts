import { PostKind, PostVisibility } from '@prisma/client';
import { visiblePostsWhere } from './post-visibility';

const PUBLIC_OF_PUBLIC_ACCOUNT = {
  visibility: PostVisibility.PUBLIC,
  author: { isPrivate: false },
};

describe('visiblePostsWhere', () => {
  it('limits anonymous viewers to public posts of public accounts, retweets included', () => {
    expect(visiblePostsWhere(undefined, [])).toEqual({
      OR: [
        { kind: PostKind.ORIGINAL, ...PUBLIC_OF_PUBLIC_ACCOUNT },
        {
          kind: PostKind.RETWEET,
          originalPost: { is: PUBLIC_OF_PUBLIC_ACCOUNT },
          author: { isPrivate: false },
        },
      ],
    });
  });

  it('adds everything by the viewer and the accounts they follow', () => {
    const readable = {
      OR: [
        PUBLIC_OF_PUBLIC_ACCOUNT,
        { authorId: { in: ['viewer', 'friend'] } },
      ],
    };

    expect(visiblePostsWhere('viewer', ['friend'])).toEqual({
      OR: [
        { kind: PostKind.ORIGINAL, ...readable },
        {
          kind: PostKind.RETWEET,
          originalPost: { is: readable },
          OR: [
            { author: { isPrivate: false } },
            { authorId: { in: ['viewer', 'friend'] } },
          ],
        },
      ],
    });
  });
});
