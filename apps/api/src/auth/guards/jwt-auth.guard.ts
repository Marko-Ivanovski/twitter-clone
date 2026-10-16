import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthRequest, JwtPayload } from '../auth.types';
import { getAccessTokenSecret } from '../auth.constants';

export const readAccessToken = (request: AuthRequest): string | undefined => {
  const token: unknown = request.cookies?.['access_token'];
  return typeof token === 'string' && token ? token : undefined;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = readAccessToken(request);

    if (!token) {
      throw new UnauthorizedException('Unauthorized');
    }

    try {
      request.user = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: getAccessTokenSecret(),
      });
      return true;
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }
  }
}
