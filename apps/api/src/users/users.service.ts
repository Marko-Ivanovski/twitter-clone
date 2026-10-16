import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificationType, Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { isRecordNotFound, isUniqueViolation } from '../prisma/prisma-errors';
import { mapPostsForViewer, postInclude } from '../posts/post.mapper';
import { buildVisiblePostsWhere } from '../posts/post-visibility';
import { isOwnUploadUrl } from '../uploads/upload-url';
import { UpdateUserDto } from './dto/update-user.dto';

interface CreateUserInput {
  email: string;
  username: string;
  passwordHash: string;
  displayName?: string | null;
}

interface UpdateUserResult {
  user: User;
  passwordChanged: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async searchUsers(query: string, limit: number) {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const safeLimit = Math.min(Math.max(limit, 1), 20);

    return this.prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: trimmed, mode: 'insensitive' } },
          { displayName: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
      orderBy: {
        username: 'asc',
      },
      take: safeLimit,
    });
  }

  createUser(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        username: input.username.toLowerCase(),
        passwordHash: input.passwordHash,
        displayName: input.displayName,
      },
    });
  }

  async updateUser(id: string, dto: UpdateUserDto): Promise<UpdateUserResult> {
    const currentUser = await this.findById(id);
    if (!currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }

    const email = dto.email?.trim().toLowerCase();
    const emailChanged = email !== undefined && email !== currentUser.email;
    const passwordChanged = Boolean(dto.password);

    if (emailChanged || passwordChanged) {
      await this.assertCurrentPassword(currentUser, dto.currentPassword);
    }

    if (dto.avatarUrl && !isOwnUploadUrl(dto.avatarUrl)) {
      throw new BadRequestException('Invalid avatar URL');
    }

    const data: Prisma.UserUpdateInput = {
      displayName: dto.displayName,
      bio: dto.bio,
      avatarUrl: dto.avatarUrl,
    };
    if (emailChanged) {
      data.email = email;
    }
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      data.tokenVersion = { increment: 1 };
    }

    try {
      const user = await this.prisma.user.update({ where: { id }, data });
      return { user, passwordChanged };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }
  }

  async getProfile(username: string, viewerId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            followers: true,
            following: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    let isFollowing = false;
    if (viewerId && viewerId !== user.id) {
      const follow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: viewerId,
            followingId: user.id,
          },
        },
      });
      isFollowing = !!follow;
    }

    const visibleWhere = await buildVisiblePostsWhere(this.prisma, viewerId);
    const postsCount = await this.prisma.post.count({
      where: { AND: [{ authorId: user.id }, visibleWhere] },
    });

    return {
      ...user,
      postsCount,
      followersCount: user._count?.followers ?? 0,
      followingCount: user._count?.following ?? 0,
      isFollowing,
    };
  }

  async getUserPosts(
    username: string,
    limit: number,
    offset: number,
    viewerId?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: {
        id: true,
      },
    });

    if (!user) {
      return null;
    }

    const visibleWhere = await buildVisiblePostsWhere(this.prisma, viewerId);
    const whereClause: Prisma.PostWhereInput = {
      AND: [{ authorId: user.id }, visibleWhere],
    };

    const [total, posts] = await Promise.all([
      this.prisma.post.count({ where: whereClause }),
      this.prisma.post.findMany({
        where: whereClause,
        take: limit + 1,
        skip: offset,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: postInclude,
      }),
    ]);

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;

    const mappedItems = await mapPostsForViewer(this.prisma, items, viewerId);

    return {
      items: mappedItems,
      total,
      limit,
      offset,
      hasMore,
    };
  }

  async followUser(followerId: string, followingUsername: string) {
    const targetUser = await this.findByUsername(followingUsername);

    if (!targetUser) {
      return { notFound: true };
    }

    if (targetUser.id === followerId) {
      return { selfFollow: true };
    }

    try {
      await this.prisma.follow.create({
        data: {
          followerId,
          followingId: targetUser.id,
        },
      });
      await this.notifications.notify({
        type: NotificationType.FOLLOW,
        actorId: followerId,
        recipientId: targetUser.id,
      });
      return { success: true };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { alreadyFollowing: true };
      }
      throw error;
    }
  }

  async unfollowUser(followerId: string, followingUsername: string) {
    const targetUser = await this.findByUsername(followingUsername);

    if (!targetUser) {
      return { notFound: true };
    }

    try {
      await this.prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId,
            followingId: targetUser.id,
          },
        },
      });
    } catch (error) {
      if (!isRecordNotFound(error)) {
        throw error;
      }
    }

    await this.notifications.retract({
      type: NotificationType.FOLLOW,
      actorId: followerId,
      recipientId: targetUser.id,
    });

    return { success: true };
  }

  private async assertCurrentPassword(user: User, currentPassword?: string) {
    const matches = currentPassword
      ? await bcrypt.compare(currentPassword, user.passwordHash)
      : false;

    if (!matches) {
      throw new ForbiddenException('Current password is incorrect');
    }
  }
}
