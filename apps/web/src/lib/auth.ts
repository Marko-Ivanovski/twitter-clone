import { apiFetch, ApiError } from './api';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RegisterInput {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}

interface LoginInput {
  identifier: string;
  password: string;
}

export { ApiError };

export const registerUser = (input: RegisterInput): Promise<AuthUser> =>
  apiFetch<AuthUser>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const loginUser = (input: LoginInput): Promise<AuthUser> =>
  apiFetch<AuthUser>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const logoutUser = (): Promise<void> =>
  apiFetch<void>('/api/auth/logout', {
    method: 'POST',
  });

export const fetchCurrentUser = (): Promise<AuthUser> =>
  apiFetch<AuthUser>('/api/auth/me');
