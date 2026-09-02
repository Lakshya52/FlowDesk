// "What's new" — powered by GitHub Releases.
//
// No manual array to maintain. The latest release's notes are fetched from
// the backend proxy (/api/releases → GitHub API, cached 5 min), parsed into
// a WhatsNewEntry, and compared against a localStorage timestamp to decide
// whether to show the modal.

import api from "./api";

// ---------------------------------------------------------------------------
// Types

export interface WhatsNewChange {
  type: "new" | "fixed" | "improved";
  text: string;
}

export interface WhatsNewEntry {
  version: string;
  date: string;
  title: string;
  body: string;        // raw markdown from GitHub release body
  image?: string;       // optional hero image
  changes: WhatsNewChange[]; // parsed from body; also kept for the modal's badge counts
}

// ---------------------------------------------------------------------------
// GitHub Release → WhatsNewEntry parser
//
// Expects a standard GitHub release object with fields:
//   tag_name, name, body, published_at, draft, prerelease

interface GhRelease {
  tag_name: string;
  name?: string;
  body?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: unknown[];
}

const HEADING_MAP: Record<string, WhatsNewChange["type"]> = {
  "new features": "new",
  "new": "new",
  "features": "new",
  "added": "new",
  "what's new": "new",
  "whats new": "new",
  "bug fixes": "fixed",
  "fixes": "fixed",
  "fixed": "fixed",
  "improvements": "improved",
  "improved": "improved",
  "improvement": "improved",
  "changes": "improved",
  "chore": "improved",
  "other": "improved",
};

function parseVersion(tag: string): string {
  return tag.replace(/^v/i, "").trim();
}

function parseMarkdownToChanges(body: string): WhatsNewChange[] {
  const lines = body.split("\n");
  const changes: WhatsNewChange[] = [];
  let currentType: WhatsNewChange["type"] | null = null;

  for (const raw of lines) {
    const line = raw.trim();

    // Detect markdown headings (## or ###)
    const headingMatch = line.match(/^#{2,3}\s+(.+)$/i);
    if (headingMatch) {
      const heading = headingMatch[1].toLowerCase().trim();
      // Look up in map
      const mapped = HEADING_MAP[heading];
      if (mapped) {
        currentType = mapped;
      } else {
        // Fuzzy: check if any key is a substring of the heading
        const fuzzy = Object.keys(HEADING_MAP).find(
          (k) => heading.includes(k) || k.includes(heading),
        );
        currentType = fuzzy ? HEADING_MAP[fuzzy] : "improved";
      }
      continue;
    }

    // Detect list items (•, -, *, numbered)
    const bulletMatch = line.match(/^\s*[-*•]\s+(.+)/);
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.+)/);
    const text = bulletMatch?.[1] ?? numberedMatch?.[1];

    if (text && currentType) {
      changes.push({ type: currentType, text: text.trim() });
    }
  }

  return changes;
}

function formatPublishedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function toEntry(r: GhRelease): WhatsNewEntry {
  const body = r.body ?? "";
  return {
    version: parseVersion(r.tag_name),
    date: r.published_at ? formatPublishedDate(r.published_at) : "",
    title: r.name ?? `v${parseVersion(r.tag_name)}`,
    body,
    changes: parseMarkdownToChanges(body),
  };
}

// ---------------------------------------------------------------------------
// Fetching — reuses the same backend proxy the Releases page uses.
// The backend caches for 5 min, so repeated calls in the same session are free.

let _cache: { version: string; entry: WhatsNewEntry } | null = null;

/**
 * Fetch the release whose tag matches `targetVersion` (e.g. the current
 * package.json version).  Falls back to the latest published non-draft
 * release if an exact match isn't found.
 */
export async function fetchWhatsNewEntry(
  targetVersion: string,
): Promise<WhatsNewEntry | null> {
  // Fast-path: already fetched for this version this session
  if (_cache?.version === targetVersion) return _cache.entry;

  try {
    const { data } = await api.get("/releases");
    const releases = (data.releases ?? []) as GhRelease[];

    const nonDraft = releases.filter(
      (r) => !r.draft && !r.prerelease,
    );

    // Try exact version match first
    const exact = nonDraft.find(
      (r) => parseVersion(r.tag_name) === targetVersion,
    );
    if (exact) {
      const entry = toEntry(exact);
      _cache = { version: targetVersion, entry };
      return entry;
    }

    // Fallback: latest release (first in array from API = newest)
    if (nonDraft.length > 0) {
      const entry = toEntry(nonDraft[0]);
      _cache = { version: targetVersion, entry };
      return entry;
    }

    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Version comparison helpers (unchanged)

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

const STORAGE_KEY = "flowdesk-last-seen-version";

export function getLastSeenVersion(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function markVersionSeen(version: string): void {
  localStorage.setItem(STORAGE_KEY, version);
}

/** Whether the current running version is newer than the last seen version. */
export function hasNewVersion(currentVersion: string): boolean {
  const last = getLastSeenVersion();
  if (!last) return true; // first run of the feature
  return compareVersions(currentVersion, last) > 0;
}