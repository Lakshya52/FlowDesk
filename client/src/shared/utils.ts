import { ApiError } from './types';

export function getApiErrorMessage(error: unknown, fallback = 'An error occurred'): string {
  if (!error) return fallback;
  const err = error as ApiError;
  return err.response?.data?.message || err.message || fallback;
}

export function safeGetStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function safeSetStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    // Storage full or private browsing - fail silently
  }
}

export function canViewItem(item: { adminOnly?: boolean }, user: { role?: string } | null): boolean {
  return !item.adminOnly || user?.role === 'admin' || user?.role === 'manager';
}

export function isRouteAllowed(pathname: string, allowedTabs: string[]): boolean {
  const topLevel = '/' + pathname.split('/')[1];
  return allowedTabs.includes(topLevel) || allowedTabs.includes(pathname);
}
