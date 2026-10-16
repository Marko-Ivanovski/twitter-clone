import type { CookieOptions, Response } from 'express';
import {
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
} from './auth.constants';
import type { TokenPair } from './auth.types';

const baseCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
});

export function setAuthCookies(res: Response, tokens: TokenPair) {
  res.cookie('access_token', tokens.accessToken, {
    ...baseCookieOptions(),
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  });
  res.cookie('refresh_token', tokens.refreshToken, {
    ...baseCookieOptions(),
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

export function clearAuthCookies(res: Response) {
  res.cookie('access_token', '', { ...baseCookieOptions(), maxAge: 0 });
  res.cookie('refresh_token', '', { ...baseCookieOptions(), maxAge: 0 });
}
