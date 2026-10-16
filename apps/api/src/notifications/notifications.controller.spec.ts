import type { AuthRequest } from '../auth/auth.types';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsStream } from './notifications.stream';

const requestFor = (exp?: number) =>
  ({ user: { sub: 'bob', exp } }) as unknown as AuthRequest;

describe('NotificationsController.stream', () => {
  let controller: NotificationsController;

  beforeEach(() => {
    jest.useFakeTimers({ now: 0 });
    controller = new NotificationsController(
      {} as NotificationsService,
      new NotificationsStream(),
    );
  });

  afterEach(() => jest.useRealTimers());

  it('closes when the access token expires so the client must re-authenticate', () => {
    let completed = false;
    controller
      .stream(requestFor(60))
      .subscribe({ complete: () => (completed = true) });

    jest.advanceTimersByTime(59_000);
    expect(completed).toBe(false);

    jest.advanceTimersByTime(1_000);
    expect(completed).toBe(true);
  });

  it('closes immediately when the token carries no expiry', () => {
    let completed = false;
    controller
      .stream(requestFor(undefined))
      .subscribe({ complete: () => (completed = true) });

    jest.advanceTimersByTime(0);
    expect(completed).toBe(true);
  });
});
