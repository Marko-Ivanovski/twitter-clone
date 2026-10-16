import { PostKind, PostVisibility } from '@prisma/client';
import { visiblePostsWhere } from './post-visibility';

describe('visiblePostsWhere', () => {
  it('limits anonymous viewers to public originals and retweets of public posts', () => {
    expect(visiblePostsWhere(undefined, [])).toEqual({
      OR: [
        { kind: PostKind.ORIGINAL, visibility: PostVisibility.PUBLIC },
        {
          kind: PostKind.RETWEET,
          originalPost: { is: { visibility: PostVisibility.PUBLIC } },
        },
      ],
    });
  });

  it('applies the same readability rule to originals and to retweeted originals', () => {
    const readable = {
      OR: [
        { visibility: PostVisibility.PUBLIC },
        { authorId: { in: ['viewer', 'friend'] } },
      ],
    };

    expect(visiblePostsWhere('viewer', ['friend'])).toEqual({
      OR: [
        { kind: PostKind.ORIGINAL, ...readable },
        { kind: PostKind.RETWEET, originalPost: { is: readable } },
      ],
    });
  });
});
