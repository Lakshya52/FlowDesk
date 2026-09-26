import { Request, Response } from "express";
import { Readable } from "stream";

/**
 * Server-side proxy for GitHub releases.
 *
 * Why: browsers fetching api.github.com directly share the 60 req/hour
 * unauthenticated quota per office IP — one busy morning locks the whole
 * team out. This proxy caches responses in memory (5 min TTL) so the
 * entire company costs GitHub ~12 requests/hour max, survives short
 * GitHub outages via stale-while-error, and keeps working if the repo
 * ever goes private (set GITHUB_TOKEN).
 *
 * Privacy: list responses are SANITIZED — only the fields our UI needs
 * (tag/name/body/date/flags + asset id/name/size) ever reach the browser,
 * so no github.com URLs, author data, or API links leak via DevTools.
 * File bytes are streamed through /assets/:assetId below, so downloads
 * never expose the upstream host either.
 */

const REPO = process.env.GITHUB_RELEASES_REPO || "Lakshya52/FlowDesk";
const TTL_MS = 5 * 60 * 1000;

// Only genuine release artifacts may be downloaded through the proxy.
const ALLOWED_ASSET = /\.(exe|AppImage|dmg|apk|tar\.gz|yml|blockmap)$/i;

interface SanitizedAsset {
    id: number;
    name: string;
    size: number;
}

interface SanitizedRelease {
    tag_name: string;
    name: string;
    body: string;
    published_at: string;
    draft: boolean;
    prerelease: boolean;
    assets: SanitizedAsset[];
}

let cache: { at: number; data: SanitizedRelease[] } | null = null;

async function ghFetch(path: string, accept = "application/vnd.github+json") {
    const headers: Record<string, string> = {
        "User-Agent": "FlowDesk-Releases-Proxy",
        Accept: accept,
    };
    if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    return fetch(`https://api.github.com/repos/${REPO}${path}`, { headers });
}

// GitHub auto-appends "**Full Changelog**: https://github.com/<owner>/<repo>/compare/..."
// to generated release notes (and authors may paste repo links). Strip those
// so the upstream host never reaches the browser inside note text.
function sanitizeBody(body: string): string {
    const withoutChangelogLine = body
        .split("\n")
        .filter((line) => !(/full\s*changelog/i.test(line) && /github\.com/i.test(line)))
        .join("\n");
    return withoutChangelogLine
        .replace(/https?:\/\/(www\.)?github\.com\/[^\s)'"`\]]*/gi, "")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

function sanitizeRelease(r: any): SanitizedRelease {
    return {
        tag_name: String(r?.tag_name ?? ""),
        name: sanitizeBody(String(r?.name ?? r?.tag_name ?? "")),
        body: sanitizeBody(String(r?.body ?? "")),
        published_at: String(r?.published_at ?? ""),
        draft: r?.draft === true,
        prerelease: r?.prerelease === true,
        assets: Array.isArray(r?.assets)
            ? r.assets
                .filter((a: any) => typeof a?.id === "number" && typeof a?.name === "string")
                .map((a: any) => ({
                    id: a.id as number,
                    name: a.name as string,
                    size: typeof a.size === "number" ? a.size : 0,
                }))
            : [],
    };
}

async function fetchSanitizedReleases(): Promise<SanitizedRelease[]> {
    const all: SanitizedRelease[] = [];
    for (let page = 1; page <= 10; page++) {
        const resp = await ghFetch(`/releases?per_page=100&page=${page}`);
        if (!resp.ok) {
            throw new Error(`GitHub API responded with ${resp.status}`);
        }
        const batch = (await resp.json()) as any[];
        for (const r of batch) all.push(sanitizeRelease(r));
        if (batch.length < 100) break;
    }
    return all;
}

export const getReleases = async (req: any, res: Response): Promise<void> => {
    try {
        if (cache && Date.now() - cache.at < TTL_MS) {
            res.json({ releases: cache.data });
            return;
        }

        const all = await fetchSanitizedReleases();
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

/**
 * Stream a release asset's bytes through our own domain.
 *
 * The asset id is numeric-only and the upstream URL is constructed
 * server-side from REPO, so callers cannot steer fetches elsewhere.
 * A metadata lookup first enforces the installer-artifact allowlist.
 */
export const downloadReleaseAsset = async (req: Request, res: Response): Promise<void> => {
    try {
        const assetId = String(req.params.assetId ?? "");
        if (!/^\d{1,12}$/.test(assetId)) {
            res.status(400).json({ message: "Invalid asset id" });
            return;
        }

        const metaResp = await ghFetch(`/releases/assets/${assetId}`);
        if (metaResp.status === 404) {
            res.status(404).json({ message: "Asset not found" });
            return;
        }
        if (!metaResp.ok) {
            throw new Error(`GitHub API responded with ${metaResp.status}`);
        }
        const meta = (await metaResp.json()) as any;
        const name = String(meta?.name ?? "");
        if (!ALLOWED_ASSET.test(name)) {
            res.status(403).json({ message: "File type not allowed" });
            return;
        }

        const fileResp = await ghFetch(`/releases/assets/${assetId}`, "application/octet-stream");
        if (!fileResp.ok || !fileResp.body) {
            throw new Error(`GitHub API responded with ${fileResp.status}`);
        }

        res.setHeader(
            "Content-Type",
            fileResp.headers.get("content-type") || "application/octet-stream",
        );
        const length = fileResp.headers.get("content-length");
        if (length) res.setHeader("Content-Length", length);
        res.setHeader("Content-Disposition", `attachment; filename="${name.replace(/"/g, "")}"`);
        res.setHeader("Cache-Control", "public, max-age=3600");

        Readable.fromWeb(fileResp.body as any).pipe(res);
    } catch (error: any) {
        if (!res.headersSent) {
            res.status(502).json({
                message: `Failed to download asset: ${error?.message ?? "unknown error"}`,
            });
        } else {
            res.end();
        }
    }
};
