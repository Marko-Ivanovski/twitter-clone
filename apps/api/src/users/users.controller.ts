import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  NotFoundException,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  Patch,
  Body,
  Inject,
  forwardRef,
} from '@nestjs/common';
import type { Response } from 'express';
import { UsersService } from './users.service';
import { FollowsService } from './follows.service';
import { AuthService } from '../auth/auth.service';
import { setAuthCookies } from '../auth/auth.cookies';
import { CREDENTIAL_THROTTLE } from '../auth/auth.constants';
import { Throttle } from '@nestjs/throttler';
import type { AuthRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { toUserDto } from './dto/user.dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly followsService: FollowsService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  @Get()
  async searchUsers(
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    if (limit < 1 || limit > 20) {
      limit = 10;
    }

    if (!search.trim()) {
      return [];
    }

    return this.usersService.searchUsers(search, limit);
  }

  @Get(':username')
  @UseGuards(OptionalJwtAuthGuard)
  async getUserProfile(
    @Param('username') username: string,
    @Req() req: AuthRequest,
  ) {
    const profile = await this.usersService.getProfile(username, req.user?.sub);
    if (!profile) {
      throw new NotFoundException('User not found');
    }
    return profile;
  }

  @Get(':username/posts')
  @UseGuards(OptionalJwtAuthGuard)
  async getUserPosts(
    @Param('username') username: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Req() req: AuthRequest,
  ) {
    if (limit < 1 || limit > 100) limit = 20;
    if (offset < 0) offset = 0;

    const result = await this.usersService.getUserPosts(
      username,
      limit,
      offset,
      req.user?.sub,
    );
    if (!result) {
      throw new NotFoundException('User not found');
    }
    return result;
  }

  @Post(':username/follow')
  @UseGuards(JwtAuthGuard)
  followUser(@Param('username') username: string, @Req() req: AuthRequest) {
    return this.followsService.follow(req.user!.sub, username);
  }

  @Delete(':username/follow')
  @UseGuards(JwtAuthGuard)
  unfollowUser(@Param('username') username: string, @Req() req: AuthRequest) {
    return this.followsService.unfollow(req.user!.sub, username);
  }

  @Post('me/follow-requests/:username/accept')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async acceptFollowRequest(
    @Param('username') username: string,
    @Req() req: AuthRequest,
  ) {
    await this.followsService.acceptRequest(req.user!.sub, username);
  }

  @Post('me/follow-requests/:username/decline')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async declineFollowRequest(
    @Param('username') username: string,
    @Req() req: AuthRequest,
  ) {
    await this.followsService.declineRequest(req.user!.sub, username);
  }

  @Patch('me')
  @Throttle(CREDENTIAL_THROTTLE)
  @UseGuards(JwtAuthGuard)
  async patchUser(
    @Body() dto: UpdateUserDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, passwordChanged } = await this.usersService.updateUser(
      req.user!.sub,
      dto,
    );

    // A password change revokes every existing session, so the current one
    // gets fresh tokens to stay signed in.
    if (passwordChanged) {
      setAuthCookies(res, await this.authService.issueTokens(user));
    }

    return toUserDto(user);
  }
}
