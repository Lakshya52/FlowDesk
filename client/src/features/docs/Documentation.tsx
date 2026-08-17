import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
	Search,
	Menu,
	X,
	ChevronRight,
	ArrowRight,
	ArrowLeft,
	Clipboard,
	Check,
	Sun,
	Moon,
} from "lucide-react";
import type { Section } from './content';
import pages, { linkSlugs } from './content';
import { useThemeStore } from '@/store/themeStore';

const navSections = [
	{
		title: "GETTING STARTED",
		links: ["Welcome to FlowDesk", "Getting Started", "Your Account"],
	},
	{
		title: "WORKING WITH PROJECTS",
		links: [
			"Creating Projects",
			"Project Types",
			"Working with Tasks",
			"Deadlines & Notifications",
		],
	},
	{
		title: "COLLABORATION",
		links: [
			"Your Team",
			"Chat & Communication",
			"AI Buddy",
			"Collaborative Canvas",
		],
	},
	{
		title: "ROLES & PERMISSIONS",
		links: ["Understanding Roles", "What You Can Do"],
	},
];

const GitHubIcon = () => (
	<svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
		<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
	</svg>
);

function ActiveNavLink({
	href,
	children,
	active,
	onClick,
}: {
	href: string;
	children: React.ReactNode;
	active?: boolean;
	onClick?: () => void;
}) {
	return (
		<Link
			to={href}
			onClick={onClick}
			className={`text-sm py-1.5 pl-3 rounded-lg cursor-pointer block transition-all duration-200 ${
				active
					? "bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] text-(--color-text) font-semibold border-l-[3px] border-(--color-primary) pl-2.25"
					: "text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] hover:text-(--color-text) hover:bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)]"
			}`}
		>
			{children}
		</Link>
	);
}

function Sidebar({
	open,
	onClose,
	currentSlug,
	searchQuery,
	onSearchChange,
	inputRef,
}: {
	open: boolean;
	onClose: () => void;
	currentSlug: string;
	searchQuery: string;
	onSearchChange: (v: string) => void;
	inputRef: React.RefObject<HTMLInputElement | null>;
}) {
	const q = searchQuery.toLowerCase();

	const filteredSections = q
		? navSections
				.map((s) => ({
					...s,
					links: s.links.filter((l) => l.toLowerCase().includes(q)),
				}))
				.filter((s) => s.links.length > 0)
		: navSections;

	return (
		<>
			{open && (
				<div
					className="fixed inset-0 bg-black/20 z-40 lg:hidden"
					onClick={onClose}
				/>
			)}
			<aside
				className={`${
					open ? "translate-x-0" : "-translate-x-full"
				} lg:translate-x-0 fixed lg:sticky top-0 left-0 z-50 lg:z-auto h-[calc(100dvh-56px)] w-65 backdrop-blur-xl bg-[color-mix(in_srgb,var(--color-surface)_80%,transparent)] border-r border-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] flex flex-col transition-transform duration-300 ease-in-out`}
			>
				<button
					onClick={onClose}
					className="lg:hidden text-[color-mix(in_srgb,var(--color-text)_40%,transparent)] hover:text-(--color-text) -ml-1"
				>
					<X size={18} className="m-5" />
				</button>

				<div className="px-4 pt-4 pb-2 shrink-0">
					<div className="relative">
					<Search
						size={14}
						className="absolute left-3 top-1/2 -translate-y-1/2 text-[color-mix(in_srgb,var(--color-text)_30%,transparent)]"
					/>
					<input
						ref={inputRef}
						type="text"
						placeholder="Search docs..."
						value={searchQuery}
						onChange={(e) => onSearchChange(e.target.value)}
						className="w-full pl-9 pr-10 py-2 text-sm bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)] border border-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] rounded-lg outline-none focus:border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)] transition-colors font-manrope text-(--color-text)"
					/>
					<kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[color-mix(in_srgb,var(--color-text)_30%,transparent)] bg-(--color-surface) border border-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] rounded px-1.5 py-0.5 font-mono">
							{/* ⌘K */}
							Ctrl + K
						</kbd>
					</div>
				</div>

				<nav className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-thin scrollbar-thumb-[color-mix(in_srgb,var(--color-primary)_20%,transparent)] scrollbar-track-transparent">
					{filteredSections.length === 0 ? (
						<p className="text-sm text-[color-mix(in_srgb,var(--color-text)_30%,transparent)] mt-4 text-center font-manrope">
							No results found
						</p>
					) : (
						filteredSections.map((section) => (
							<div key={section.title}>
								<h4 className="text-[11px] uppercase tracking-widest font-bold text-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] mt-5 mb-2 font-manrope">
									{section.title}
								</h4>
								<div className="flex flex-col gap-px">
									{section.links.map((link) => {
										const slug = linkSlugs[link];
										return (
											<ActiveNavLink
												key={link}
												href={`/documentation/${slug}`}
												active={slug === currentSlug}
												onClick={() =>
													onSearchChange("")
												}
											>
												{link}
											</ActiveNavLink>
										);
									})}
								</div>
							</div>
						))
					)}
				</nav>
			</aside>
		</>
	);
}

function CodeBlock({ children }: { children: React.ReactNode }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="relative group bg-(--color-text) rounded-xl p-4 my-4">
			<button
				onClick={() => {
					navigator.clipboard.writeText(
						String(children).replace(/\$ /g, ""),
					);
					setCopied(true);
					setTimeout(() => setCopied(false), 2000);
				}}
				className="absolute top-3 right-3 text-white/40 hover:text-white transition-colors"
			>
				{copied ? (
					<Check size={14} className="text-(--color-primary)" />
				) : (
					<Clipboard size={14} />
				)}
			</button>
			<pre className="text-sm font-mono text-(--color-primary) overflow-x-auto whitespace-pre-wrap">
				{children}
			</pre>
		</div>
	);
}

function Callout({ children }: { children: React.ReactNode }) {
	return (
		<div className="bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)] border-l-4 border-(--color-primary) p-4 rounded-r-lg text-sm text-(--color-text) my-6 font-manrope">
			{children}
		</div>
	);
}

function renderSections(sections: Section[]) {
	return sections.map((s, i) => {
		switch (s.type) {
			case "h2":
				return (
					<h2
						key={i}
						id={s.id}
						data-heading={s.id}
						className="text-xl font-bold text-(--color-text) mt-10 mb-3 pb-2 border-b border-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] font-manrope"
					>
						{s.content}
					</h2>
				);
			case "h3":
				return (
					<h3
						key={i}
						className="text-base font-bold text-(--color-text) mt-6 mb-2 font-manrope"
					>
						{s.content}
					</h3>
				);
			case "p": {
				const text = s.content as string;
				const withLinks = text
					.replace(/<a>(.*?)<\/a>/g, (_, label) => {
						const slug = linkSlugs[label];
						return `<a href="/documentation/${slug}" class="text-[var(--color-primary)] hover:underline font-medium">${label}</a>`;
					})
					.replace(
						/<code>(.*?)<\/code>/g,
						'<code class="text-sm bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] text-[var(--color-primary)] px-1.5 py-0.5 rounded font-mono font-medium">$1</code>',
					)
					.replace(
						/<strong>(.*?)<\/strong>/g,
						'<strong class="text-[var(--color-text)] font-semibold">$1</strong>',
					);
				return (
					<p
						key={i}
						className="text-[color-mix(in_srgb,var(--color-text)_70%,transparent)] text-[15px] leading-7 mb-4 font-manrope"
						dangerouslySetInnerHTML={{ __html: withLinks }}
					/>
				);
			}
			case "list": {
				const items = s.content as [string, string][];
				return (
					<ul key={i} className="space-y-3 mb-4">
						{items.map(([title, desc]) => {
							const linkedTitle = title.replace(/<a>(.*?)<\/a>/g, (_, label) => {
								const slug = linkSlugs[label];
								return `<a href="/documentation/${slug}" class="text-[var(--color-primary)] hover:underline font-medium">${label}</a>`;
							});
							const linkedDesc = desc.replace(/<a>(.*?)<\/a>/g, (_, label) => {
								const slug = linkSlugs[label];
								return `<a href="/documentation/${slug}" class="text-[var(--color-primary)] hover:underline font-medium">${label}</a>`;
							});
							return (
								<li
									key={title}
									className="flex items-start gap-3 text-[15px] text-[color-mix(in_srgb,var(--color-text)_70%,transparent)] leading-7 font-manrope"
								>
									<Check
										size={16}
										className="text-(--color-primary) mt-1.25 shrink-0"
									/>
									<span>
										<strong
											className="text-(--color-text) font-semibold"
											dangerouslySetInnerHTML={{ __html: linkedTitle + ":" }}
										/>{" "}
										<span dangerouslySetInnerHTML={{ __html: linkedDesc }} />
									</span>
								</li>
							);
						})}
					</ul>
				);
			}
			case "ordered": {
				const items = s.content as string[];
				return (
					<ol
						key={i}
						className="list-decimal list-inside space-y-2 text-[color-mix(in_srgb,var(--color-text)_70%,transparent)] text-[15px] leading-7 mb-4 font-manrope"
					>
						{items.map((item) => (
							<li
								key={item}
								dangerouslySetInnerHTML={{
									__html: item.replace(
										/<code>(.*?)<\/code>/g,
										'<code class="text-sm bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] text-[var(--color-primary)] px-1.5 py-0.5 rounded font-mono font-medium">$1</code>',
									),
								}}
							/>
						))}
					</ol>
				);
			}
			case "code":
				return <CodeBlock key={i}>{s.content as string}</CodeBlock>;
			case "callout":
				return <Callout key={i}>{s.content as string}</Callout>;
			case "table": {
				const { headers, rows } = s.content as {
					headers: string[];
					rows: [string, string, string][];
				};
				return (
					<div key={i} className="overflow-x-auto my-6">
						<table className="w-full text-sm border-collapse">
							<thead>
								<tr className="border-b border-[color-mix(in_srgb,var(--color-primary)_15%,transparent)]">
									{headers.map((h) => (
										<th
											key={h}
											className="text-left py-3 pr-4 font-bold text-(--color-text) font-manrope"
										>
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{rows.map((row, ri) => (
									<tr
										key={ri}
										className="border-b border-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]"
									>
										{row.map((cell, ci) => (
											<td
												key={ci}
												className={`py-3 ${ci === 0 ? "pr-4 font-semibold text-(--color-text) font-manrope" : ci === 1 ? "px-4 text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] font-manrope" : "pl-4 text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] font-manrope"}`}
											>
												{cell}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				);
			}
			case "arch-cards": {
				const items = s.content as [string, string][];
				return (
					<div key={i} className="grid gap-4 my-6">
						{items.map(([title, desc]) => (
							<div
								key={title}
								className="border border-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] rounded-xl p-4 bg-[color-mix(in_srgb,var(--color-primary)_3%,transparent)]"
							>
								<h4 className="text-sm font-bold text-(--color-text) mb-1 font-manrope">
									{title}
								</h4>
								<p className="text-sm text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] leading-6 font-manrope">
									{desc}
								</p>
							</div>
						))}
					</div>
				);
			}
			case "image": {
				const { src, alt, caption } = s.content as { src: string; alt: string; caption: string };
				return (
					<figure key={i} className="my-6">
						<div className="rounded-xl overflow-hidden border border-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_3%,transparent)]">
							<img
								src={src}
								alt={alt}
								className="w-full h-auto object-cover"
								loading="lazy"
							/>
						</div>
						{caption && (
							<figcaption className="text-center text-xs text-[color-mix(in_srgb,var(--color-text)_40%,transparent)] mt-2 font-manrope">
								{caption}
							</figcaption>
						)}
					</figure>
				);
			}
			default:
				return null;
		}
	});
}

function getTocHeadings(sections: Section[]): { id: string; text: string }[] {
	return sections
		.filter((s) => s.type === "h2" && s.id)
		.map((s) => ({ id: s.id!, text: s.content as string }));
}

export default function Documentation() {
	const { slug = "introduction" } = useParams<{ slug: string }>();
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [activeHeading, setActiveHeading] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const contentRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const tocRef = useRef<HTMLDivElement>(null);

	const page = pages[slug];

	useEffect(() => {
		if (!page) return;
		const firstH2 = page.sections.find((s) => s.type === "h2" && s.id);
		if (firstH2) setActiveHeading(firstH2.id!);
	}, [slug, page]);

	useEffect(() => {
		if (contentRef.current) {
			contentRef.current.scrollTop = 0;
		}
	}, [slug]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "k") {
				e.preventDefault();
				searchInputRef.current?.focus();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActiveHeading(
							entry.target.getAttribute("data-heading") || "",
						);
					}
				}
			},
			{ rootMargin: "-80px 0px -60% 0px" },
		);
		const elements = document.querySelectorAll("[data-heading]");
		elements.forEach((el) => observer.observe(el));
		return () => observer.disconnect();
	}, [slug]);

	useEffect(() => {
		if (!tocRef.current || !activeHeading) return;
		const activeLink = tocRef.current.querySelector(`[data-toc-heading="${activeHeading}"]`) as HTMLElement | null;
		if (activeLink) {
			activeLink.scrollIntoView({ behavior: "smooth", block: "nearest" });
		}
	}, [activeHeading]);

	const tocHeadings = page ? getTocHeadings(page.sections) : [];
	const { isDark, toggle } = useThemeStore();

	if (!page) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-(--color-bg)">
				<div className="text-center">
					<h1 className="text-2xl font-bold text-(--color-text) mb-2 font-manrope">
						Page not found
					</h1>
					<p className="text-[color-mix(in_srgb,var(--color-text)_50%,transparent)] mb-4 font-manrope">
						The documentation page "{slug}" does not exist.
					</p>
					<Link
						to="/documentation/introduction"
						className="text-(--color-primary) hover:underline font-medium font-manrope"
					>
						Back to Introduction
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="flex items-start justify-center" >

			<div className="min-h-screen flex flex-col w-full 2xl:w-[70dvw]">
				<header className="h-14 border-b border-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_80%,transparent)] backdrop-blur-xl flex items-center px-4 lg:px-6 shrink-0 sticky top-0 z-30">
					<button
						onClick={() => setSidebarOpen(true)}
						className="lg:hidden text-[color-mix(in_srgb,var(--color-text)_50%,transparent)] hover:text-(--color-text) mr-3"
					>
						<Menu size={18} />
					</button>
					<div className="flex items-center gap-2 mr-6">
						<div
							style={{
								width: 28,
								height: 28,
								borderRadius: 8,
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
							}}
							className="overflow-hidden"
						>
							<img
								src="/icon.ico"
								alt="FlowDesk logo"
								className="rounded-xl scale-125"
							/>
						</div>

					<Link
						to="/"
						className="font-bold text-sm text-(--color-text) font-manrope"
					>
						FlowDesk
					</Link>
					<span className="text-[color-mix(in_srgb,var(--color-primary)_30%,transparent)] text-sm mx-1">/</span>
					<span className="text-sm text-[color-mix(in_srgb,var(--color-text)_50%,transparent)] font-manrope">
						Docs
					</span>
				</div>
			<div className="ml-auto flex items-center gap-4 text-sm">
				<button
					onClick={toggle}
					className="text-[color-mix(in_srgb,var(--color-text)_40%,transparent)] hover:text-(--color-text) transition-colors cursor-pointer "
					aria-label="Toggle theme"
				>
					{isDark ? <Sun size={20} /> : <Moon size={20} />}
				</button>
				<Link
					to="https://github.com/Lakshya52/flowdesk/"
					target="_blank"
					className="text-[color-mix(in_srgb,var(--color-text)_40%,transparent)] hover:text-(--color-text) transition-colors hidden sm:inline"
				>
					<GitHubIcon />
				</Link>
				<Link
					to="/login"
					className="bg-(--color-primary) text-(--color-surface) px-4 py-1.5 rounded-full text-sm font-bold hover:bg-(--color-primary-hover) transition-colors inline-block font-manrope"
				>
					Get&nbsp;Started
				</Link>
			</div>
				</header>

				<div className="flex flex-1 overflow-hidden">
					<Sidebar
						open={sidebarOpen}
						onClose={() => setSidebarOpen(false)}
						currentSlug={slug}
						searchQuery={searchQuery}
						onSearchChange={setSearchQuery}
						inputRef={searchInputRef}
					/>

				<main
					ref={contentRef}
					className="flex-1 overflow-y-auto h-[calc(100vh-3.5rem)] scrollbar-thin scrollbar-thumb-[color-mix(in_srgb,var(--color-primary)_20%,transparent)] scrollbar-track-transparent"
				>
					<div className="max-w-2xl mx-auto px-6 lg:px-8 py-10">
						<nav className="flex items-center gap-1 text-xs text-[color-mix(in_srgb,var(--color-text)_30%,transparent)] mb-6 font-manrope">
							{page.breadcrumbs.map((crumb, i) => (
								<span
									key={i}
									className="flex items-center gap-1"
								>
									{i > 0 && <ChevronRight size={12} />}
									{crumb.slug ? (
										<Link
											to={`/documentation/${crumb.slug}`}
											className="hover:text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] transition-colors"
										>
											{crumb.label}
										</Link>
									) : (
										<span
											className={
												i ===
												page.breadcrumbs.length - 1
													? "text-[color-mix(in_srgb,var(--color-text)_50%,transparent)]"
													: ""
											}
										>
											{crumb.label}
										</span>
									)}
								</span>
							))}
						</nav>

						<h1 className="text-3xl font-bold text-(--color-text) mb-2 font-manrope">
							{page.title}
						</h1>
						<p className="text-[color-mix(in_srgb,var(--color-text)_50%,transparent)] text-sm mb-2 font-manrope">
							{page.description}
						</p>
						<div className="flex items-center gap-2 text-xs text-[color-mix(in_srgb,var(--color-text)_30%,transparent)] mb-8 font-manrope">
							<span>Last updated: {page.lastUpdated}</span>
							<span>·</span>
							<span>{page.readingTime}</span>
						</div>

						{renderSections(page.sections)}

						<div className="flex justify-between border-t border-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] pt-6 mt-12">
							{page.prev ? (
								<Link
									to={`/documentation/${page.prev.slug}`}
									className="flex items-center gap-1 text-sm text-[color-mix(in_srgb,var(--color-text)_40%,transparent)] hover:text-(--color-primary) transition-colors font-manrope"
								>
									<ArrowLeft size={14} />
									{page.prev.title}
								</Link>
							) : (
								<div />
							)}
							{page.next ? (
								<Link
									to={`/documentation/${page.next.slug}`}
									className="flex items-center gap-1 text-sm text-[color-mix(in_srgb,var(--color-text)_40%,transparent)] hover:text-(--color-primary) transition-colors font-manrope"
								>
									{page.next.title}
									<ArrowRight size={14} />
								</Link>
							) : (
								<div />
							)}
						</div>
					</div>
				</main>

			<aside className="hidden xl:block w-50 shrink-0 border-l border-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] h-[calc(100vh-3.5rem)] sticky top-14 overflow-y-auto">
				<div ref={tocRef} className="px-4 py-8">
					<h4 className="text-[11px] uppercase tracking-wide text-[color-mix(in_srgb,var(--color-primary)_50%,transparent)] mb-3 font-bold font-manrope">
						On this page
					</h4>
					<nav className="flex flex-col gap-px">
						{tocHeadings.map((h) => (
							<a
								key={h.id}
								data-toc-heading={h.id}
								href={`#${h.id}`}
								onClick={(e) => {
									e.preventDefault(); 
									const el = document.getElementById(h.id);
									if (el)
										el.scrollIntoView({
											behavior: "smooth",
										});
								}}
								className={`text-sm py-1 transition-colors font-manrope ${
									activeHeading === h.id
										? "text-(--color-text) font-semibold"
										: "text-[color-mix(in_srgb,var(--color-text)_40%,transparent)] hover:text-(--color-text)"
								}`}
							>
								{h.text}
							</a>
						))}
					</nav>
				</div>
			</aside>
				</div>
			</div>
		</div>

	);
}
