import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';

const clampLimit = (limit: number) => (limit < 1 || limit > 100 ? 20 : limit);
const clampOffset = (offset: number) => Math.max(offset, 0);

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async getTimeline(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('type') type: string | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.postsService.getTimeline(
      clampLimit(limit),
      clampOffset(offset),
      req.user?.sub,
      type === 'following' ? 'following' : 'all',
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createPost(@Body() dto: CreatePostDto, @Req() req: AuthRequest) {
    return this.postsService.createPost(req.user!.sub, dto);
  }

  @Patch(':postId')
  @UseGuards(JwtAuthGuard)
  async updatePost(
    @Param('postId') postId: string,
    @Body() dto: UpdatePostDto,
    @Req() req: AuthRequest,
  ) {
    return this.postsService.updatePost(postId, req.user!.sub, dto);
  }

  @Delete(':postId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePost(@Param('postId') postId: string, @Req() req: AuthRequest) {
    await this.postsService.deletePost(postId, req.user!.sub);
  }

  @Get(':postId')
  @UseGuards(OptionalJwtAuthGuard)
  async getPost(@Param('postId') postId: string, @Req() req: AuthRequest) {
    return this.postsService.getPostById(postId, req.user?.sub);
  }

  @Post(':postId/like')
  @UseGuards(JwtAuthGuard)
  async likePost(@Param('postId') postId: string, @Req() req: AuthRequest) {
    return this.postsService.likePost(postId, req.user!.sub);
  }

  @Delete(':postId/like')
  @UseGuards(JwtAuthGuard)
  async unlikePost(@Param('postId') postId: string, @Req() req: AuthRequest) {
    return this.postsService.unlikePost(postId, req.user!.sub);
  }

  @Post(':postId/retweet')
  @UseGuards(JwtAuthGuard)
  async retweetPost(@Param('postId') postId: string, @Req() req: AuthRequest) {
    return this.postsService.retweetPost(postId, req.user!.sub);
  }

  @Delete(':postId/retweet')
  @UseGuards(JwtAuthGuard)
  async unretweetPost(
    @Param('postId') postId: string,
    @Req() req: AuthRequest,
  ) {
    return this.postsService.unretweetPost(postId, req.user!.sub);
  }

  @Get(':postId/comments')
  @UseGuards(OptionalJwtAuthGuard)
  async getComments(
    @Param('postId') postId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Req() req: AuthRequest,
  ) {
    return this.postsService.getComments(
      postId,
      clampLimit(limit),
      clampOffset(offset),
      req.user?.sub,
    );
  }

  @Post(':postId/comments')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async addComment(
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
    @Req() req: AuthRequest,
  ) {
    return this.postsService.addComment(postId, req.user!.sub, dto);
  }
}
