import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';

export type FollowStatus = 'none' | 'requested' | 'following';

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async getStatus(
    viewerId: string | undefined,
    targetId: string,
  ): Promise<FollowStatus> {
    if (!viewerId || viewerId === targetId) {
      return 'none';
    }

    const [follow, request] = await Promise.all([
      this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: viewerId,
            followingId: targetId,
          },
        },
      }),
      this.prisma.followRequest.findUnique({
        where: {
          requesterId_targetId: { requesterId: viewerId, targetId },
        },
      }),
    ]);

    if (follow) return 'following';
    return request ? 'requested' : 'none';
  }

  async follow(
    followerId: string,
    username: string,
  ): Promise<{ status: 'following' | 'requested' }> {
    const target = await this.findUser(username);
    if (target.id === followerId) {
      throw new ConflictException('Cannot follow yourself');
    }

    if (target.isPrivate) {
      return this.request(followerId, target.id);
    }

    try {
      await this.prisma.follow.create({
        data: { followerId, followingId: target.id },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Already following');
      }
      throw error;
    }

    await this.notifications.notify({
      type: NotificationType.FOLLOW,
      actorId: followerId,
      recipientId: target.id,
    });
    return { status: 'following' };
  }

  async unfollow(
    followerId: string,
    username: string,
  ): Promise<{ status: 'none' }> {
    const target = await this.findUser(username);

    const [unfollowed, cancelled] = await Promise.all([
      this.prisma.follow.deleteMany({
        where: { followerId, followingId: target.id },
      }),
      this.prisma.followRequest.deleteMany({
        where: { requesterId: followerId, targetId: target.id },
      }),
    ]);

    if (unfollowed.count > 0) {
      await this.notifications.retract({
        type: NotificationType.FOLLOW,
        actorId: followerId,
        recipientId: target.id,
      });
    }
    if (cancelled.count > 0) {
      await this.notifications.retract({
        type: NotificationType.FOLLOW_REQUEST,
        actorId: followerId,
        recipientId: target.id,
      });
    }

    return { status: 'none' };
  }

  async acceptRequest(targetId: string, requesterUsername: string) {
    const requester = await this.findUser(requesterUsername);
    await this.removeRequest(requester.id, targetId);
    await this.completeAcceptance(requester.id, targetId);
  }

  async declineRequest(targetId: string, requesterUsername: string) {
    const requester = await this.findUser(requesterUsername);
    await this.removeRequest(requester.id, targetId);
    await this.notifications.retract({
      type: NotificationType.FOLLOW_REQUEST,
      actorId: requester.id,
      recipientId: targetId,
    });
  }

  // Runs inside the caller's transaction so the privacy switch, the new
  // follows and the removed requests commit or roll back together.
  async acceptAllPendingIn(
    tx: Prisma.TransactionClient,
    targetId: string,
  ): Promise<string[]> {
    const pending = await tx.followRequest.findMany({
      where: { targetId },
      select: { requesterId: true },
    });
    if (pending.length === 0) return [];

    const requesterIds = pending.map((request) => request.requesterId);
    await tx.follow.createMany({
      data: requesterIds.map((requesterId) => ({
        followerId: requesterId,
        followingId: targetId,
      })),
      skipDuplicates: true,
    });
    await tx.followRequest.deleteMany({
      where: { targetId, requesterId: { in: requesterIds } },
    });
    return requesterIds;
  }

  async notifyAccepted(targetId: string, requesterIds: string[]) {
    for (const requesterId of requesterIds) {
      await this.sendAcceptedNotifications(requesterId, targetId);
    }
  }

  private async request(requesterId: string, targetId: string) {
    const alreadyFollowing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: requesterId,
          followingId: targetId,
        },
      },
    });
    if (alreadyFollowing) {
      throw new ConflictException('Already following');
    }

    try {
      await this.prisma.followRequest.create({
        data: { requesterId, targetId },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { status: 'requested' as const };
      }
      throw error;
    }

    await this.notifications.notify({
      type: NotificationType.FOLLOW_REQUEST,
      actorId: requesterId,
      recipientId: targetId,
    });
    return { status: 'requested' as const };
  }

  private async removeRequest(requesterId: string, targetId: string) {
    const removed = await this.prisma.followRequest.deleteMany({
      where: { requesterId, targetId },
    });
    if (removed.count === 0) {
      throw new NotFoundException('Follow request not found');
    }
  }

  private async completeAcceptance(requesterId: string, targetId: string) {
    try {
      await this.prisma.follow.create({
        data: { followerId: requesterId, followingId: targetId },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }

    await this.sendAcceptedNotifications(requesterId, targetId);
  }

  private async sendAcceptedNotifications(
    requesterId: string,
    targetId: string,
  ) {
    await this.notifications.retract({
      type: NotificationType.FOLLOW_REQUEST,
      actorId: requesterId,
      recipientId: targetId,
    });
    await this.notifications.notify({
      type: NotificationType.FOLLOW_ACCEPTED,
      actorId: targetId,
      recipientId: requesterId,
    });
  }

  private async findUser(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true, isPrivate: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
