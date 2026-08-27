import { Response } from "express";

/**
 * Server-side proxy for GitHub releases.
 *
 * Why: browsers fetching api.github.com directly share the 60 req/hour
 * unauthenticated quota per office IP — one busy morning locks the whole
 * team out. This proxy caches responses in memory (5 min TTL) so the
 * entire company costs GitHub ~12 requests/hour max, survives short
 * GitHub outages via stale-while-error, and keeps working if the repo
 * ever goes private (set GITHUB_TOKEN).
 */

const REPO = process.env.GITHUB_RELEASES_REPO || "Lakshya52/FlowDesk";
const TTL_MS = 5 * 60 * 1000;

let cache: { at: number; data: unknown[] } | null = null;

async function ghFetch(path: string) {
    const headers: Record<string, string> = {
        "User-Agent": "FlowDesk-Releases-Proxy",
        Accept: "application/vnd.github+json",
    };
    if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    return fetch(`https://api.github.com/repos/${REPO}${path}`, { headers });
}

export const getReleases = async (req: any, res: Response): Promise<void> => {
    try {
        if (cache && Date.now() - cache.at < TTL_MS) {
            res.json({ releases: cache.data });
            return;
        }

        const all: unknown[] = [];
        for (let page = 1; page <= 10; page++) {
            const resp = await ghFetch(`/releases?per_page=100&page=${page}`);
            if (!resp.ok) {
                throw new Error(`GitHub API responded with ${resp.status}`);
            }
            const batch = (await resp.json()) as unknown[];
            all.push(...batch);
            if (batch.length < 100) break;
        }

        cache = { at: Date.now(), data: all };
        res.json({ releases: all });
    } catch (error: any) {
        // Stale-while-error: serve the last good copy rather than failing
        if (cache) {
            res.json({ releases: cache.data, stale: true });
            return;
        }
        res.status(502).json({
            message: `Failed to fetch releases: ${error?.message ?? "unknown error"}`,
        });
    }
};
