import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  ver?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
