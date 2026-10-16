import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthRequest, JwtPayload } from '../auth.types';
import { getAccessTokenSecret } from '../auth.constants';
import { readAccessToken } from './jwt-auth.guard';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = readAccessToken(request);

    if (!token) {
      return true;
    }

    try {
      request.user = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: getAccessTokenSecret(),
      });
    } catch {
      // An invalid token on a public route is treated as anonymous.
    }

    return true;
  }
}
