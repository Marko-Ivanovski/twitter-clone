import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PostVisibility, Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { mapPostsForViewer, postInclude } from '../posts/post.mapper';
import { buildVisiblePostsWhere } from '../posts/post-visibility';
import { isOwnUploadUrl } from '../uploads/upload-url';
import { UpdateUserDto } from './dto/update-user.dto';
import { FollowsService } from './follows.service';

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
    private readonly follows: FollowsService,
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
        isPrivate: true,
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
      isPrivate: dto.isPrivate,
    };
    if (emailChanged) {
      data.email = email;
    }
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      data.tokenVersion = { increment: 1 };
    }

    let user: User;
    try {
      user = await this.prisma.user.update({ where: { id }, data });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }

    if (currentUser.isPrivate && !user.isPrivate) {
      await this.follows.acceptAllPending(id);
    }

    return { user, passwordChanged };
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
        isPrivate: true,
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

    const { _count, ...profile } = user;
    const followStatus = await this.follows.getStatus(viewerId, user.id);
    const canViewPosts =
      !user.isPrivate || viewerId === user.id || followStatus === 'following';

    // A locked profile still shows a post count, limited to public posts.
    const postsWhere: Prisma.PostWhereInput = canViewPosts
      ? {
          AND: [
            { authorId: user.id },
            await buildVisiblePostsWhere(this.prisma, viewerId),
          ],
        }
      : { authorId: user.id, visibility: PostVisibility.PUBLIC };
    const postsCount = await this.prisma.post.count({ where: postsWhere });

    return {
      ...profile,
      postsCount,
      followersCount: _count.followers,
      followingCount: _count.following,
      followStatus,
      canViewPosts,
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
        isPrivate: true,
      },
    });

    if (!user) {
      return null;
    }

    if (
      user.isPrivate &&
      viewerId !== user.id &&
      (await this.follows.getStatus(viewerId, user.id)) !== 'following'
    ) {
      throw new ForbiddenException('This account is private');
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

  private async assertCurrentPassword(user: User, currentPassword?: string) {
    const matches = currentPassword
      ? await bcrypt.compare(currentPassword, user.passwordHash)
      : false;

    if (!matches) {
      throw new ForbiddenException('Current password is incorrect');
    }
  }
}
