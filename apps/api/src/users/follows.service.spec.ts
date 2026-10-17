import { ConflictException, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { FollowsService } from './follows.service';

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

const makePrisma = () => ({
  user: { findUnique: jest.fn() },
  follow: {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  followRequest: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

describe('FollowsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let notifications: { notify: jest.Mock; retract: jest.Mock };
  let service: FollowsService;

  const target = (isPrivate: boolean) =>
    prisma.user.findUnique.mockResolvedValue({ id: 'bob', isPrivate });

  beforeEach(() => {
    prisma = makePrisma();
    notifications = {
      notify: jest.fn().mockResolvedValue(undefined),
      retract: jest.fn().mockResolvedValue(undefined),
    };
    service = new FollowsService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('follow', () => {
    it('follows a public account and notifies it', async () => {
      target(false);
      await expect(service.follow('ana', 'bob')).resolves.toEqual({
        status: 'following',
      });
      expect(prisma.follow.create).toHaveBeenCalledWith({
        data: { followerId: 'ana', followingId: 'bob' },
      });
      expect(notifications.notify).toHaveBeenCalledWith({
        type: NotificationType.FOLLOW,
        actorId: 'ana',
        recipientId: 'bob',
      });
    });

    it('rejects following a public account twice without notifying', async () => {
      target(false);
      prisma.follow.create.mockRejectedValue(uniqueViolation());
      await expect(service.follow('ana', 'bob')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('sends a request to a private account', async () => {
      target(true);
      await expect(service.follow('ana', 'bob')).resolves.toEqual({
        status: 'requested',
      });
      expect(prisma.follow.create).not.toHaveBeenCalled();
      expect(prisma.followRequest.create).toHaveBeenCalledWith({
        data: { requesterId: 'ana', targetId: 'bob' },
      });
      expect(notifications.notify).toHaveBeenCalledWith({
        type: NotificationType.FOLLOW_REQUEST,
        actorId: 'ana',
        recipientId: 'bob',
      });
    });

    it('treats a repeated request as still requested without a second notification', async () => {
      target(true);
      prisma.followRequest.create.mockRejectedValue(uniqueViolation());
      await expect(service.follow('ana', 'bob')).resolves.toEqual({
        status: 'requested',
      });
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('rejects a request to a private account already followed', async () => {
      target(true);
      prisma.follow.findUnique.mockResolvedValue({});
      await expect(service.follow('ana', 'bob')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects following yourself and unknown users', async () => {
      target(false);
      await expect(service.follow('bob', 'bob')).rejects.toBeInstanceOf(
        ConflictException,
      );
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.follow('ana', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('unfollow', () => {
    it('unfollows and retracts the follow notification', async () => {
      target(false);
      prisma.follow.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.unfollow('ana', 'bob')).resolves.toEqual({
        status: 'none',
      });
      expect(notifications.retract).toHaveBeenCalledWith({
        type: NotificationType.FOLLOW,
        actorId: 'ana',
        recipientId: 'bob',
      });
    });

    it('cancels a pending request and retracts its notification', async () => {
      target(true);
      prisma.followRequest.deleteMany.mockResolvedValue({ count: 1 });
      await service.unfollow('ana', 'bob');
      expect(prisma.followRequest.deleteMany).toHaveBeenCalledWith({
        where: { requesterId: 'ana', targetId: 'bob' },
      });
      expect(notifications.retract).toHaveBeenCalledWith({
        type: NotificationType.FOLLOW_REQUEST,
        actorId: 'ana',
        recipientId: 'bob',
      });
    });
  });

  describe('requests', () => {
    beforeEach(() =>
      prisma.user.findUnique.mockResolvedValue({ id: 'ana', isPrivate: false }),
    );

    it('accepting creates the follow, clears the request and tells the requester', async () => {
      prisma.followRequest.deleteMany.mockResolvedValue({ count: 1 });
      await service.acceptRequest('bob', 'ana');
      expect(prisma.follow.create).toHaveBeenCalledWith({
        data: { followerId: 'ana', followingId: 'bob' },
      });
      expect(notifications.retract).toHaveBeenCalledWith({
        type: NotificationType.FOLLOW_REQUEST,
        actorId: 'ana',
        recipientId: 'bob',
      });
      expect(notifications.notify).toHaveBeenCalledWith({
        type: NotificationType.FOLLOW_ACCEPTED,
        actorId: 'bob',
        recipientId: 'ana',
      });
    });

    it('accepting a request that does not exist is a 404', async () => {
      await expect(service.acceptRequest('bob', 'ana')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.follow.create).not.toHaveBeenCalled();
    });

    it('declining clears the request without following', async () => {
      prisma.followRequest.deleteMany.mockResolvedValue({ count: 1 });
      await service.declineRequest('bob', 'ana');
      expect(prisma.follow.create).not.toHaveBeenCalled();
      expect(notifications.retract).toHaveBeenCalledWith({
        type: NotificationType.FOLLOW_REQUEST,
        actorId: 'ana',
        recipientId: 'bob',
      });
    });

    it('declining a request that does not exist is a 404', async () => {
      await expect(service.declineRequest('bob', 'ana')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('accepts every pending request inside the caller’s transaction', async () => {
    const tx = {
      followRequest: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ requesterId: 'ana' }, { requesterId: 'carl' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      follow: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };

    const accepted = await service.acceptAllPendingIn(
      tx as unknown as Prisma.TransactionClient,
      'bob',
    );

    expect(accepted).toEqual(['ana', 'carl']);
    expect(tx.follow.createMany).toHaveBeenCalledWith({
      data: [
        { followerId: 'ana', followingId: 'bob' },
        { followerId: 'carl', followingId: 'bob' },
      ],
      skipDuplicates: true,
    });
    expect(tx.followRequest.deleteMany).toHaveBeenCalledWith({
      where: { targetId: 'bob', requesterId: { in: ['ana', 'carl'] } },
    });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('notifies accepted requesters after the transaction', async () => {
    await service.notifyAccepted('bob', ['ana', 'carl']);
    expect(notifications.retract).toHaveBeenCalledWith({
      type: NotificationType.FOLLOW_REQUEST,
      actorId: 'carl',
      recipientId: 'bob',
    });
    expect(notifications.notify).toHaveBeenCalledWith({
      type: NotificationType.FOLLOW_ACCEPTED,
      actorId: 'bob',
      recipientId: 'ana',
    });
  });

  it('reports follow status from the viewer’s side', async () => {
    await expect(service.getStatus(undefined, 'bob')).resolves.toBe('none');
    await expect(service.getStatus('bob', 'bob')).resolves.toBe('none');
    prisma.followRequest.findUnique.mockResolvedValue({});
    await expect(service.getStatus('ana', 'bob')).resolves.toBe('requested');
    prisma.follow.findUnique.mockResolvedValue({});
    await expect(service.getStatus('ana', 'bob')).resolves.toBe('following');
  });
});
