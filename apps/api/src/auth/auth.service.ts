import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { UsersService } from '../users/users.service';
import { UserDto, toUserDto } from '../users/dto/user.dto';
import { JwtPayload, TokenPair } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  getAccessTokenSecret,
  getRefreshTokenSecret,
} from './auth.constants';

interface AuthResult {
  user: UserDto;
  tokens: TokenPair;
}

// Compared against when no user matches, so a missing account takes as long
// to reject as a wrong password and usernames can't be probed by timing.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-equalizer', 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase().trim();
    const username = dto.username.toLowerCase().trim();

    const existingEmail = await this.usersService.findByEmail(email);
    if (existingEmail) {
      throw new ConflictException('Email already in use');
    }

    const existingUsername = await this.usersService.findByUsername(username);
    if (existingUsername) {
      throw new ConflictException('Username already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    let user: User;
    try {
      user = await this.usersService.createUser({
        email,
        username,
        passwordHash,
        displayName: dto.displayName?.trim() || null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email or username already in use');
      }
      throw error;
    }

    const tokens = await this.issueTokens(user);
    return { user: toUserDto(user), tokens };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const identifier = dto.identifier.trim().toLowerCase();
    const user =
      (await this.usersService.findByEmail(identifier)) ??
      (await this.usersService.findByUsername(identifier));

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user);
    return { user: toUserDto(user), tokens };
  }

  async getCurrentUser(userId: string): Promise<UserDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    return toUserDto(user);
  }

  async refresh(refreshToken?: string): Promise<AuthResult> {
    if (!refreshToken) {
      throw new UnauthorizedException('Unauthorized');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: getRefreshTokenSecret(),
      });
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || payload.ver !== user.tokenVersion) {
      throw new UnauthorizedException('Unauthorized');
    }

    const tokens = await this.issueTokens(user);
    return { user: toUserDto(user), tokens };
  }

  async issueTokens(
    user: Pick<User, 'id' | 'tokenVersion'>,
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: user.id, ver: user.tokenVersion };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: getAccessTokenSecret(),
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      }),
      this.jwtService.signAsync(payload, {
        secret: getRefreshTokenSecret(),
        expiresIn: REFRESH_TOKEN_EXPIRES_IN,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
