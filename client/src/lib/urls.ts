/**
 * URL helpers.
 *
 * `VITE_API_URL` / `VITE_SOCKET_URL` are often configured with a trailing
 * slash (e.g. `https://flowdesk-api.raksco.in/api/`). Joining such a base
 * with a path that starts with `/` produces `//`, which Express treats as a
 * different route (`/api//partners/import/sample` !==
 * `/api/partners/import/sample`). Always build URLs through these helpers.
 */

const env = import.meta.env;

export const stripTrailingSlashes = (value: string): string =>
    value.trim().replace(/\/+$/, "");

/** Join a base URL and a path with exactly one slash between them. */
export const joinUrl = (base: string, path = ""): string => {
    // Absolute URLs (including blob:/data: previews) must be left untouched.
    if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) return path;

    const normalizedBase = stripTrailingSlashes(base);
    const normalizedPath = path.replace(/^\/+/, "");
    return normalizedPath ? `${normalizedBase}/${normalizedPath}` : normalizedBase;
};

export const API_BASE_URL = stripTrailingSlashes(
    (env.VITE_API_URL as string | undefined) || "http://localhost:5000/api",
);

export const SOCKET_BASE_URL = stripTrailingSlashes(
    (env.VITE_SOCKET_URL as string | undefined) || "http://localhost:5000",
);

/** Build an API URL. Accepts paths with or without a leading slash. */
export const apiUrl = (
    path = "",
    fallback = "http://localhost:5000/api",
): string => joinUrl((env.VITE_API_URL as string | undefined) || fallback, path);

/**
 * Build a URL for server-hosted files (uploads, avatars, attachments).
 * `fallback` lets callers keep their existing default host.
 */
export const mediaUrl = (
    path = "",
    fallback = "http://localhost:5000",
): string => joinUrl((env.VITE_SOCKET_URL as string | undefined) || fallback, path);
