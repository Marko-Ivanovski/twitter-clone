'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { ApiError, registerUser } from '../../lib/auth';
import { checkPasswordStrength, USERNAME_PATTERN } from '@/utils/validation';

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    setPasswordErrors(checkPasswordStrength(val));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    
    // Final check
    const currentErrors = checkPasswordStrength(password);
    if (currentErrors.length > 0) {
        setSubmitting(false);
        setPasswordErrors(currentErrors);
        return;
    }

    try {
      await registerUser({
        email,
        username,
        password,
        displayName: displayName || undefined,
      });
      router.replace('/login');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Unable to register');
      } else {
        setError('Unable to register');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    email.trim().length > 0 &&
    USERNAME_PATTERN.test(username) &&
    password.length >= 8 &&
    passwordErrors.length === 0 &&
    !submitting;
  const passwordHasError = passwordErrors.length > 0 && password.length > 0;
  const usernameHasError = username.length > 0 && !USERNAME_PATTERN.test(username);

  return (
    <div className="gradient-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Create your account</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">Join Twitter Clone to start posting.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-800 dark:text-slate-200">
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-gray-400 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:bg-slate-950"
              placeholder="you@example.com"
              autoComplete="email"
              required
              type="email"
            />
          </label>
          <label className="block text-sm font-medium text-gray-800 dark:text-slate-200">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-gray-400 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:bg-slate-950"
              placeholder="yourhandle"
              autoComplete="username"
              required
              minLength={3}
              maxLength={30}
              aria-invalid={usernameHasError}
            />
            {usernameHasError && (
              <span className="mt-1 block text-xs text-red-600 dark:text-red-300">
                3 to 30 characters: letters, numbers, and underscores only.
              </span>
            )}
          </label>
          <label className="block text-sm font-medium text-gray-800 dark:text-slate-200">
            Display name (optional)
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-gray-400 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:bg-slate-950"
              placeholder="Your name"
            />
          </label>
          <label className="block text-sm font-medium text-gray-800 dark:text-slate-200">
            Password
            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => handlePasswordChange(event.target.value)}
                className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm outline-none transition focus:bg-white dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-950 ${
                  passwordHasError
                    ? 'border-red-300 focus:border-red-400 dark:border-red-500 dark:focus:border-red-400'
                    : 'border-gray-200 focus:border-gray-400 dark:border-slate-700 dark:focus:border-slate-500'
                }`}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          
          {passwordErrors.length > 0 && password.length > 0 && (
            <div className="text-xs text-red-600 space-y-1 dark:text-red-300">
                <p className="font-semibold text-gray-700 dark:text-slate-200">Password requirements:</p>
                <ul className="list-disc pl-4">
                    {passwordErrors.map((err, i) => (
                        <li key={i}>{err}</li>
                    ))}
                </ul>
            </div>
          )}

          {error ? <p className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <div className="mt-4 text-sm text-gray-600 dark:text-slate-300">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-gray-900 hover:underline dark:text-slate-100">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
