import { useState, useEffect } from "react"
import { ChevronDown, Download, Loader2, AlertCircle, RefreshCw, Calendar, Tag } from "lucide-react"

interface DownloadLink {
  label: string
  url: string
}

interface OsDownloads {
  os: string
  icon: string
  links: DownloadLink[]
}

interface ReleaseData {
  version: string
  isLatest: boolean
  published: string
  downloads: OsDownloads[]
}

const GITHUB_REPO = "Lakshya52/FlowDesk"

// Fetch every published release by paginating through the GitHub API
// (unauthenticated limit is 60 req/h per IP — surfaced clearly below).
async function fetchAllReleases(): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100&page=${page}`
    )
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error(
          "GitHub API rate limit exceeded — please try again in about an hour"
        )
      }
      throw new Error(`GitHub API responded with ${res.status}`)
    }
    const batch = (await res.json()) as Record<string, unknown>[]
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all
}

// const WindowsIcon: ComponentType<{ size?: number; className?: string }> = ({ size = 20, className }) => (
//   <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
//     <rect x="3" y="3" width="8" height="8" rx="1" />
//     <rect x="13" y="3" width="8" height="8" rx="1" />
//     <rect x="3" y="13" width="8" height="8" rx="1" />
//     <rect x="13" y="13" width="8" height="8" rx="1" />
//   </svg>
// )

// const LinuxIcon: ComponentType<{ size?: number; className?: string }> = ({ size = 20, className }) => (
//   <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
//     <circle cx="12" cy="5" r="2.5" />
//     <path d="M9 8h6l1.5 3.5L18 13v3l-1.5 1.5L15 16l-1 2h-4l-1-2-1.5 1.5L6 16v-3l1.5-1.5L9 8Z" />
//     <path d="M9 16v3a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-3" />
//   </svg>
// )

function skipAsset(name: string): boolean {
  return /latest\.yml|\.blockmap|builder-debug\.yml/i.test(name)
}

function categorizeAsset(name: string, version: string): { os: string; label: string } | null {
  const base = name.replace(new RegExp(`[-]?${version}`, "i"), "").toLowerCase()

  if (base.includes(".dmg")) {
    const arch = base.includes("arm64") ? "Apple Silicon" : "Intel"
    return { os: "macOS", label: `macOS ${arch} (.dmg)` }
  }

  if (base.includes(".apk")) {
    return { os: "Android", label: "Android (.apk)" }
  }

  if (base.includes(".appimage")) {
    return { os: "Linux", label: "Linux x64 (.AppImage)" }
  }

  if (base.includes(".tar.gz")) {
    const arch = base.includes("arm64") ? "ARM64" : "x64"
    return { os: "Linux", label: `Linux ${arch} (.tar.gz)` }
  }

  if (base.includes(".exe")) {
    if (base.includes("arm64")) {
      return { os: "Windows", label: "Windows ARM64 (.exe)" }
    }
    if (base.includes("setup")) {
      return { os: "Windows", label: "Windows x64 Installer (.exe)" }
    }
    return { os: "Windows", label: "Windows x64 Portable (.exe)" }
  }

  return null
}

const osIcons: Record<string, string> = {
  macOS: "/AppleIcon.svg",
  Windows: "/WindowsIcon.svg",
  Linux: "/LinuxIcon.svg",
  Android: "/AndroidIcon.svg",
}

function buildDownloads(assets: { name: string; browser_download_url: string }[], version: string): OsDownloads[] {
  const map = new Map<string, DownloadLink[]>()

  for (const asset of assets) {
    if (skipAsset(asset.name)) continue
    const cat = categorizeAsset(asset.name, version)
    if (!cat) continue
    if (!map.has(cat.os)) map.set(cat.os, [])
    map.get(cat.os)!.push({ label: cat.label, url: asset.browser_download_url })
  }

  return Array.from(map.entries()).map(([os, links]) => ({
    os,
    icon: osIcons[os] || "/WindowsIcon.svg",
    links,
  }))
}

function parseVersion(tag: string): string {
  return tag.replace(/^v/, "")
}

// Numeric semver comparison so "Latest" is the HIGHEST version, not just
// whichever release GitHub happened to create last.
function compareVersions(a: string, b: string): number {
  const core = (v: string) =>
    v
      .replace(/^v/i, "")
      .split(/[-+]/)[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0)
  const pa = core(a)
  const pb = core(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na !== nb) return na - nb
  }
  // Same numeric core: a full release outranks a pre-release (e.g. -beta)
  const preA = /-\w/.test(a) ? 1 : 0
  const preB = /-\w/.test(b) ? 1 : 0
  return preB - preA
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
  } catch {
    return dateStr
  }
}

function DownloadCard({ os, icon, links }: OsDownloads) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <img src={icon} alt={os} className="w-5 h-5" />
        <h4 className="text-sm font-semibold text-gray-900">{os}</h4>
      </div>
      <div className="flex flex-col gap-2">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.url}
            className="text-sm text-gray-600 hover:text-black flex items-center gap-2 py-1.5 px-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <Download size={12} className="shrink-0" />
            {link.label}
          </a>
        ))}
      </div>
    </div>
  )
}

function VersionCard({ version, isLatest, isOpen, onToggle, downloads, published }: {
  version: string
  isLatest?: boolean
  isOpen: boolean
  onToggle: () => void
  downloads: OsDownloads[]
  published: string
}) {
  return (
    <div className={`rounded-2xl border transition-all duration-300 ${ isOpen ? "border-[#a87ef7]/30 shadow-sm shadow-[#a87ef7]/10" : "border-gray-200 hover:border-gray-300" } ${isLatest ? "bg-white" : "bg-white/80"}`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-5 cursor-pointer text-left"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
              v{version}
            </span>
            {isLatest && (
              <span className="text-[11px] font-semibold bg-[#a87ef7]/10 text-[#a87ef7] px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Tag size={10} />
                Latest
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Calendar size={11} />
            {formatDate(published)}
          </div>
        </div>
        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? "max-h-150 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-6 pb-6 pt-2 border-t border-gray-100">
          {downloads.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-4">
              No download assets available for this release.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {downloads.map((os) => (
                <DownloadCard key={os.os} {...os} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Releases() {
  const [releases, setReleases] = useState<ReleaseData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openVersion, setOpenVersion] = useState("")

  const fetchReleases = async () => {
    setLoading(true)
    setError(null)
    try {
    const data = await fetchAllReleases()

    const parsed: ReleaseData[] = data
      .filter((r) => !r.draft)
      .map((r) => {
        const tag = r.tag_name as string
        const version = parseVersion(tag)
        const assets = (r.assets as { name: string; browser_download_url: string }[]) || []
        return {
          version,
          isLatest: false, // assigned after sorting below
          published: r.published_at as string,
          downloads: buildDownloads(assets, version),
        }
      })
      // Deduplicate (same version can appear once per draft/publish cycle)
      .filter(
        (r, idx, arr) => arr.findIndex((x) => x.version === r.version) === idx
      )
      .sort((a, b) => compareVersions(b.version, a.version))

    if (parsed.length > 0) parsed[0].isLatest = true

      setReleases(parsed)
      if (parsed.length > 0) setOpenVersion(parsed[0].version)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch releases")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReleases()
  }, [])

  return (
    <div className="min-h-screen w-full bg-[#f8fafc]">
      {/* Hero */}
      <div className="relative overflow-hidden min-h-75 max-h-125 h-[60dvh] md:h-[70dvh] w-full bg-white">
        <div className="sm:flex hidden h-full w-full absolute inset-0">
          {Array.from({ length: 24 }).map((_, index) => (
            <div
              key={index}
              className="w-1/12 bg-linear-to-r from-[#a87ef7] via-[#a08afacb] to-[#a87ef7ab] opacity-75"
            />
          ))}
        </div>
        <div className="sm:hidden flex h-full w-full absolute inset-0">
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={index}
              className="w-1/7 bg-linear-to-r from-[#a87ef7] via-[#a08afacb] to-[#a87ef7ab] opacity-75"
            />
          ))}
        </div>
        <div className="relative w-[90dvw] sm:w-[80vw] md:w-[75vw] mx-auto flex flex-col items-start justify-end h-[85%]">
          <h1 className="text-4xl md:text-5xl font-manrope-bold text-[#0a0038]/75 leading-tight">
            Releases
          </h1>
          <p className="mt-3 text-sm text-[#0a0038]/60 max-w-2xl leading-relaxed">
            Download previous FlowDesk releases. By default, they auto-update to the latest version.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="w-[90dvw] sm:w-[80vw] md:w-[75vw] mx-auto -mt-6 relative z-10 pb-16 ">
        {loading && (
          <div className="flex items-center justify-center py-20 text-gray-400 bg-white rounded-2xl border border-gray-200">
            <Loader2 size={24} className="animate-spin mr-3" />
            Loading releases...
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 bg-white rounded-2xl border border-gray-200">
            <AlertCircle size={24} className="text-red-400 mb-3" />
            <p className="text-sm mb-4">{error}</p>
            <button
              onClick={fetchReleases}
              className="flex items-center gap-2 text-sm text-gray-600 border border-gray-300 rounded-full px-4 py-2 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <RefreshCw size={14} />
              Retry
            </button>
          </div>
        )}

        {!loading && !error && releases.length === 0 && (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm bg-white rounded-2xl border border-gray-200">
            No releases published yet.
          </div>
        )}

        {!loading && !error && releases.length > 0 && (
          <div className="flex flex-col gap-3">
            {releases.map((r) => (
              <VersionCard
                key={r.version}
                version={r.version}
                isLatest={r.isLatest}
                isOpen={openVersion === r.version}
                onToggle={() =>
                  setOpenVersion(openVersion === r.version ? "" : r.version)
                }
                downloads={r.downloads}
                published={r.published}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
