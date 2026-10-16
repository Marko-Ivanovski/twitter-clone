import { NotificationType } from '@prisma/client';
import { NotificationItem } from './notification.types';
import { NotificationsStream } from './notifications.stream';

const item = (id: string): NotificationItem => ({
  id,
  type: NotificationType.LIKE,
  createdAt: new Date(),
  read: false,
  actor: { username: 'ana', displayName: null, avatarUrl: null },
  postId: 'post-1',
  postSnippet: null,
  commentSnippet: null,
});

describe('NotificationsStream', () => {
  it('delivers an item only to subscribers of that user', () => {
    const stream = new NotificationsStream();
    const forBob: string[] = [];
    const forCarl: string[] = [];
    stream.subscribe('bob').subscribe((n) => forBob.push(n.id));
    stream.subscribe('carl').subscribe((n) => forCarl.push(n.id));

    stream.publish('bob', item('n1'));

    expect(forBob).toEqual(['n1']);
    expect(forCarl).toEqual([]);
  });

  it('delivers to every open connection of the same user', () => {
    const stream = new NotificationsStream();
    const tabA: string[] = [];
    const tabB: string[] = [];
    stream.subscribe('bob').subscribe((n) => tabA.push(n.id));
    stream.subscribe('bob').subscribe((n) => tabB.push(n.id));

    stream.publish('bob', item('n1'));

    expect(tabA).toEqual(['n1']);
    expect(tabB).toEqual(['n1']);
  });

  it('stops delivering after unsubscribe and ignores users with no listeners', () => {
    const stream = new NotificationsStream();
    const received: string[] = [];
    const subscription = stream
      .subscribe('bob')
      .subscribe((n) => received.push(n.id));

    subscription.unsubscribe();
    stream.publish('bob', item('n1'));
    stream.publish('nobody', item('n2'));

    expect(received).toEqual([]);
  });
});
