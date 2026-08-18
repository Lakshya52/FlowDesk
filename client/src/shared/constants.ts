export const STORAGE_KEYS = {
  TOKEN: 'flowdesk_token',
  USER: 'flowdesk_user',
  TENANT: 'flowdesk_tenant',
  THEME: 'flowdesk_theme',
  SIDEBAR_WIDTH: 'sidebar-width',
} as const;

export const MOBILE_BREAKPOINT = 768;

export const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export const SEARCH_DEBOUNCE_MS = 300;

export const IDLE_TIMEOUT_MS = 180_000;

export const PUBLIC_ROUTES = ['/', '/release', '/404'] as const;

export const FOOTER_ROUTES = ['/', '/release', '/login', '/register'] as const;
