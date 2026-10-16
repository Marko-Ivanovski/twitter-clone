'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useState, useRef, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { LogOut, Moon, Search, Settings, Sun, User } from 'lucide-react';
import { searchUsers, UserSearchResult } from '@/lib/users';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { buildAvatarUrl, setAvatarFallback } from '@/utils/avatar';
import { NotificationBell } from '@/components/notifications/NotificationBell';

export function Navigation() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setSearchLoading(true);

    const timeoutId = setTimeout(async () => {
      try {
        const results = await searchUsers(trimmed, 10, controller.signal);
        if (active) {
          setSearchResults(results);
        }
      } catch (error) {
        if (active && !(error instanceof Error && error.name === 'AbortError')) {
          setSearchResults([]);
        }
      } finally {
        if (active) {
          setSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchQuery]);

  const hasSearch = searchQuery.trim().length > 0;

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex items-center justify-between sm:justify-start">
          <Link href="/" className="shrink-0 text-xl font-semibold text-gray-900 dark:text-slate-100">
            Twitter Clone
          </Link>
        </div>

        <div className="w-full sm:flex-1 sm:px-6" ref={searchRef}>
          <div className="relative flex w-full items-center sm:mx-auto sm:max-w-sm">
            <Search className="absolute left-3 h-4 w-4 text-gray-400 dark:text-slate-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search users"
              aria-label="Search users"
              className="w-full rounded-full border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300 focus:ring-2 focus:ring-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700"
            />
            {searchOpen && hasSearch && (
              <div className="absolute top-full z-30 mt-2 w-full rounded-lg border border-gray-100 bg-white shadow-lg ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-900">
                {searchLoading ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                    <LoadingSpinner size="sm" />
                    Searching...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">No users found</div>
                ) : (
                  <div className="max-h-72 overflow-y-auto py-2">
                    {searchResults.map((result) => (
                      <Link
                        key={result.id}
                        href={`/user/${result.username}`}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-gray-800 transition hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-800"
                        onClick={() => {
                          setSearchOpen(false);
                          setSearchQuery('');
                        }}
                      >
                        <img
                          src={buildAvatarUrl(result.avatarUrl, result.username)}
                          alt={result.username}
                          className="h-8 w-8 rounded-full object-cover"
                          onError={(event) => setAvatarFallback(event, result.username)}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-900 dark:text-slate-100">
                            {result.displayName || result.username}
                          </div>
                          <div className="truncate text-xs text-gray-500 dark:text-slate-400">@{result.username}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          {!user ? (
            <Link
              href="/login"
              className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-900 transition hover:bg-gray-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Log in
            </Link>
          ) : (
            <div className="flex items-center gap-1">
              <NotificationBell />
              <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 rounded-full p-1 transition hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <img
                  src={buildAvatarUrl(user.avatarUrl, user.username)}
                  alt={user.username}
                  className="h-8 w-8 rounded-full object-cover"
                  onError={(event) => setAvatarFallback(event, user.username)}
                />
                <span className="hidden text-sm font-medium text-gray-700 dark:text-slate-200 sm:block">
                  @{user.username}
                </span>
              </button>

              {isOpen && (
                <div className="absolute right-0 mt-2 w-52 origin-top-right rounded-lg border border-gray-100 bg-white shadow-lg ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200 dark:border-slate-800 dark:bg-slate-900">
                  <div className="p-1">
                    <Link
                      href={`/user/${user.username}`}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      onClick={() => setIsOpen(false)}
                    >
                      <User size={16} />
                      My Profile
                    </Link>
                    <Link
                      href="/settings/profile"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      onClick={() => setIsOpen(false)}
                    >
                      <Settings size={16} />
                      Edit Profile
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        toggleTheme();
                        setIsOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                    </button>
                    <button
                      onClick={() => {
                        logout();
                        setIsOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      <LogOut size={16} />
                      Log out
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
