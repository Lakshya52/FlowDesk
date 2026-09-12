/**
 * CanvasPage Component
 *
 * A full-page individual workspace canvas. It provides an infinite plane where a single
 * user can pan, zoom, add, write, drag, and resize sticky notes. Includes server sync
 * interactions for CRUD operations on personal notes.
 */
import React, {
	useState,
	useRef,
	useEffect,
	useCallback,
	useMemo,
} from "react";
import {
	Plus,
	Minus,
	// Maximize,
	Shrink,
	MousePointer2,
	Hand,
	Undo2,
	Redo2,
	Loader2,
	RefreshCcw,
	Expand,
	CheckCircle2,
	Trash2,
	AlertCircle,
	Palette,
	EllipsisVertical,
	FileCode,
	FileText,
	FileType,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import toast from "react-hot-toast";
import api from "../lib/api";
import CanvasNavigator from "../components/common/CanvasNavigator";
import RichTextEditor, {
	RichTextToolbar,
} from "../components/common/RichTextEditor";
import {
	exportNoteAsHTML,
	exportNoteAsTXT,
	exportNoteAsPDF,
} from "../components/common/NoteExportMenu";

interface Note {
	_id: string;
	x: number;
	y: number;
	width?: number;
	height?: number;
	title?: string;
	content: string;
	color: string;
	connections?: string[];
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface ConnectionLine {
	key: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	fromId: string;
	toId: string;
}

const COLORS = ["#fef9c3", "#dcfce7", "#dbeafe", "#f3e8ff", "#fee2e2"];

/** localStorage key for the canvas view state (zoom, pan, background color). */
const VIEW_STORAGE_KEY = "flowdesk_canvas_view";

const CANVAS_BG_PRESETS: { label: string; value: string }[] = [
	{ label: "Default", value: "" },
	{ label: "White", value: "#ffffff" },
	{ label: "Slate", value: "#0f172a" },
	{ label: "Black", value: "#0a0a0a" },
	{ label: "Indigo", value: "#1e1b4b" },
	{ label: "Navy", value: "#172554" },
	{ label: "Forest", value: "#14532d" },
	{ label: "Teal", value: "#134e4a" },
	{ label: "Olive", value: "#44403c" },
	{ label: "Maroon", value: "#881337" },
];

/**
 * Small icon button used inside a note's unified header. Stops the event so
 * clicking it never starts a note drag or puts focus into the body editor.
 */
const NoteHeaderButton: React.FC<{
	onClick: () => void;
	title?: string;
	children: React.ReactNode;
}> = ({ onClick, title, children }) => (
	<button
		style={{cursor: "pointer"}}
		onClick={(e) => {
			e.stopPropagation();
			onClick();
		}}
		onMouseDown={(e) => {
			e.stopPropagation();
			e.preventDefault();
		}}
		onTouchStart={(e) => {
			e.stopPropagation();
		}}
		title={title}
		className="flex items-center rounded border-0 bg-transparent p-1 opacity-65 transition-opacity hover:opacity-100"
	>
		{children}
	</button>
);

/**
 * Undo/Redo buttons for the top toolbar. Subscribes directly to the active
 * note's Tiptap editor (transaction/update events) so it always reflects the
 * editor's true canUndo/canRedo state and drives the undo/redo commands on it.
 */
const ToolbarUndoRedo: React.FC<{ editor: Editor | null }> = ({ editor }) => {
	// Force a re-render whenever the editor's history changes.
	const [, setVersion] = useState(0);

	useEffect(() => {
		if (!editor) return;
		const refresh = () => setVersion((v) => v + 1);
		editor.on("transaction", refresh);
		editor.on("update", refresh);
		return () => {
			editor.off("transaction", refresh);
			editor.off("update", refresh);
		};
	}, [editor]);

	const canUndo = !!editor?.can().undo();
	const canRedo = !!editor?.can().redo();

	return (
		<div className="flex gap-1 rounded-full bg-(--color-bg-secondary) p-1">
			<button
				onClick={() => editor?.chain().focus().undo().run()}
				disabled={!canUndo}
				onMouseDown={(e) => {
					e.preventDefault();
					e.stopPropagation();
				}}
				className="btn btn-xs btn-ghost h-9 w-9 rounded-full p-0"
				style={{ opacity: canUndo ? 1 : 0.4 }}
				title="Undo (Ctrl+Z)"
			>
				<Undo2 size={16} />
			</button>
			<button
				onClick={() => editor?.chain().focus().redo().run()}
				disabled={!canRedo}
				onMouseDown={(e) => {
					e.preventDefault();
					e.stopPropagation();
				}}
				className="btn btn-xs btn-ghost h-9 w-9 rounded-full p-0"
				style={{ opacity: canRedo ? 1 : 0.4 }}
				title="Redo (Ctrl+Y)"
			>
				<Redo2 size={16} />
			</button>
		</div>
	);
};

/** Tiny autosave status shown in the note header while editing. */
const SaveIndicator: React.FC<{ status: SaveStatus }> = ({ status }) => {
	if (status === "saving") {
		return (
			<span className="flex items-center gap-1 text-[0.62rem] opacity-70">
				<Loader2 size={12} className="animate-spin" /> Saving
			</span>
		);
	}
	if (status === "saved") {
		return (
			<span className="flex items-center gap-1 text-[0.62rem] text-success">
				<CheckCircle2 size={12} /> Saved
			</span>
		);
	}
	if (status === "error") {
		return (
			<span className="flex items-center gap-1 text-[0.62rem] text-danger">
				<AlertCircle size={12} /> Error
			</span>
		);
	}
	return null;
};

interface NoteWindowProps {
	note: Note;
	isMobile: boolean;
	isLinking: boolean;
	isFocused: boolean;
	autoFocus: boolean;
	hoveredNoteId: string | null;
	hoveredDropId: string | null;
	linkingSourceId: string | null;
	saveStatus: SaveStatus;
	zIndex: number;
	onBringToFront: (id: string) => void;
	onNoteMouseDown: (e: React.MouseEvent, id: string) => void;
	onNoteTouchStart: (e: React.TouchEvent, id: string) => void;
	onTitleChange: (id: string, title: string) => void;
	onColorChange: (id: string, color: string) => void;
	onDelete: (id: string) => void;
	onHover: (id: string | null) => void;
	onLinkingStart: (e: React.MouseEvent, id: string) => void;
	onLinkingStartTouch: (e: React.TouchEvent, id: string) => void;
	onResizeMouseDown: (e: React.MouseEvent, id: string) => void;
	onResizeTouchStart: (e: React.TouchEvent, id: string) => void;
	onEditorReady: (id: string, editor: Editor) => void;
	onFocusNote: (id: string) => void;
	onBlurNote: (id: string) => void;
	onContentChange: (id: string, html: string) => void;
}

/**
 * A single sticky note. Memoized so that panning/zooming/dragging other notes
 * (which only change the canvas transform or a different note's position) do
 * not re-render every note on the canvas every frame.
 */
const NoteWindow: React.FC<NoteWindowProps> = ({
	note,
	isMobile,
	isLinking,
	isFocused,
	autoFocus,
	hoveredNoteId,
	hoveredDropId,
	linkingSourceId,
	saveStatus,
	zIndex,
	onBringToFront,
	onNoteMouseDown,
	onNoteTouchStart,
	onTitleChange,
	onColorChange,
	onDelete,
	onHover,
	onLinkingStart,
	onLinkingStartTouch,
	onResizeMouseDown,
	onResizeTouchStart,
	onEditorReady,
	onFocusNote,
	onBlurNote,
	onContentChange,
}) => {
	const isThisLinking = linkingSourceId === note._id;
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const pressPosRef = useRef<{ x: number; y: number } | null>(null);

	// Close the options menu on outside click.
	useEffect(() => {
		if (!menuOpen) return;
		const close = (e: MouseEvent) => {
			if (
				menuRef.current &&
				!menuRef.current.contains(e.target as Node)
			) {
				setMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", close);
		return () => document.removeEventListener("mousedown", close);
	}, [menuOpen]);

	return (
		<div
			className="canvas-note absolute flex cursor-default flex-col rounded-xl border border-black/5 p-4 shadow-md"
			data-note-id={note._id}
			style={{
				left: note.x,
				top: note.y,
				width: note.width || 200,
				height: "auto",
				// Manual height is a floor only: the note always grows to fit
				// content and can never shrink below it — no clipping, no scrollbar.
				minHeight: Math.max(note.height || 140, 140),
				background: note.color,
				zIndex,
				color: "#1e293b",
				touchAction: "none",
				outline: isFocused
					? "2px solid rgba(99,102,241,0.55)"
					: hoveredNoteId === note._id
						? "2px solid rgba(99,102,241,0.25)"
						: "none",
				outlineOffset: 1,
			}}
			onMouseDownCapture={() => onBringToFront(note._id)}
			onTouchStartCapture={() => onBringToFront(note._id)}
			onMouseEnter={() => onHover(note._id)}
			onMouseLeave={() => onHover(null)}
			onMouseDown={(e) => onNoteMouseDown(e, note._id)}
			onTouchStart={(e) => onNoteTouchStart(e, note._id)}
		>
			{/* Unified Header: move / title / edit / format / download / color / delete */}
			<div
				className="relative z-10 mb-2.5 flex cursor-grab flex-col gap-1.5 border-b pb-2 border-black/10"
				title="Drag to move"
			>
				{/* Row 1: drag + title + actions */}
				<div className="flex min-w-0 items-center justify-between gap-1.5">
					<div className="flex min-w-0 flex-1 items-center gap-1.5">
						{/* <Grip size={16} className="shrink-0 opacity-50" /> */}
						{/* <div
							style={{
								width: 8,
								height: 8,
								flexShrink: 0,
							}}
						/> */}
						{/* Always-editable title: rename without entering body edit mode */}
						<input
							value={note.title || ""}
							placeholder="Untitled"
							title="Rename note"
							onChange={(e) =>
								onTitleChange(note._id, e.target.value)
							}
							onMouseDown={(e) => e.stopPropagation()}
							onTouchStart={(e) => e.stopPropagation()}
							onFocus={(e) => e.stopPropagation()}
							className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[0.78rem] font-semibold text-slate-800 outline-none placeholder:font-medium placeholder:text-slate-400"
						/>
					</div>

					<div className="flex shrink-0 items-center gap-1">
						<SaveIndicator status={saveStatus} />

						{/* Three-dot menu: color, download, delete */}
						<div className="relative" ref={menuRef}>
							<NoteHeaderButton
								onClick={() => setMenuOpen((v) => !v)}
								title="Note options"
							>
								<EllipsisVertical size={16} />
							</NoteHeaderButton>
							{menuOpen && (
								<div
									onMouseDown={(e) => e.stopPropagation()}
									onTouchStart={(e) => e.stopPropagation()}
									className="absolute top-full right-0 z-[1000] mt-1.5 w-60 rounded-2xl border border-border bg-surface p-2 text-text shadow-xl"
								>
									<p className="px-2.5 pt-1.5 pb-1 text-[11px] font-bold tracking-wide text-text-tertiary uppercase">
										Color
									</p>
									<div className="flex flex-wrap gap-2 px-2.5 pb-1">
										{COLORS.map((c) => (
											<button
												key={c}
												onClick={(e) => {
													e.stopPropagation();
													onColorChange(note._id, c);
													setMenuOpen(false);
												}}
												title={c}
												aria-label={`Set color ${c}`}
												style={{
													width: 28,
													height: 28,
													borderRadius: "50%",
													background: c,
													border:
														note.color === c
															? "3px solid var(--color-primary)"
															: "1px solid rgba(0,0,0,0.15)",
													cursor: "pointer",
												}}
											/>
										))}
									</div>

									<div className="my-1.5 h-px bg-border" />
									<p className="px-2.5 pt-1 pb-1 text-[11px] font-bold tracking-wide text-text-tertiary uppercase">
										Download
									</p>
									{[
										{
											label: "HTML file",
											icon: (
												<FileCode
													size={16}
													color="#f97316"
												/>
											),
											run: () =>
												exportNoteAsHTML(
													note.content || "",
													note._id,
												),
										},
										{
											label: "PDF document",
											icon: (
												<FileText
													size={16}
													color="#ef4444"
												/>
											),
											run: () =>
												exportNoteAsPDF(
													note.content || "",
												),
										},
										{
											label: "Plain text",
											icon: (
												<FileType
													size={16}
													color="#6366f1"
												/>
											),
											run: () =>
												exportNoteAsTXT(
													note.content || "",
													note._id,
												),
										},
									].map((opt) => (
										<button
											key={opt.label}
											onClick={(e) => {
												e.stopPropagation();
												opt.run();
												setMenuOpen(false);
											}}
											className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-text hover:bg-surface-hover"
										>
											{opt.icon}
											{opt.label}
										</button>
									))}

									<div className="my-1.5 h-px bg-border" />
									<button
										onClick={(e) => {
											e.stopPropagation();
											setMenuOpen(false);
											onDelete(note._id);
										}}
										className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-danger hover:bg-danger-light"
									>
										<Trash2 size={16} />
										Delete note
									</button>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Always-live editor: click the canvas and just type. The header
				remains the drag handle; the body never starts a note drag. */}
			<RichTextEditor
				content={note.content || ""}
				placeholder="Write something…"
				onChange={(html) => onContentChange(note._id, html)}
				hideToolbar
				autoFocus={autoFocus}
				onReady={(ed) => onEditorReady(note._id, ed)}
				onFocus={() => onFocusNote(note._id)}
				onBlur={() => onBlurNote(note._id)}
				className="flex-1"
			/>

			{/* Idle drag shield: same size as the note, only while not editing.
				Press-and-drag moves the note (events bubble to the note root);
				a plain click focuses the editor with caret precision. Header
				controls, resize and linking handles sit above it (z-10). */}
			{!isFocused && (
				<div
					className="absolute inset-0 z-[5] cursor-grab active:cursor-grabbing"
					onMouseDown={(e) => {
						// Record only: focusing here would unmount this shield
						// mid-gesture (focus → isFocused) and destabilize the
						// press. Tracking bubbles to the note root.
						pressPosRef.current = {
							x: e.clientX,
							y: e.clientY,
						};
					}}
					onClick={(e) => {
						// Focus after the gesture completes, when targets are
						// stable — a genuine click starts typing exactly where
						// hit; a drag release does nothing.
						const p = pressPosRef.current;
						pressPosRef.current = null;
						if (
							!p ||
							Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5
						)
							return;
						const root =
							e.currentTarget
								.parentElement as HTMLElement | null;
						if (root)
							focusEditorAtPoint(root, e.clientX, e.clientY);
					}}
				/>
			)}

			{/* Resize Handle */}
			<div
				data-note-control
				onMouseDown={(e) => onResizeMouseDown(e, note._id)}
				onTouchStart={(e) => onResizeTouchStart(e, note._id)}
				className="absolute right-0 bottom-0 z-10 flex items-center justify-center opacity-30"
				style={{
					width: isMobile ? 32 : 20,
					height: isMobile ? 32 : 20,
					cursor: "nwse-resize",
				}}
			>
				<svg
					width="10"
					height="10"
					viewBox="0 0 10 10"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						d="M10 0L0 10M10 5L5 10M10 8L8 10"
						stroke="currentColor"
						strokeWidth="1"
						strokeLinecap="round"
					/>
				</svg>
			</div>

			{/* Left Connection Point (drop target) */}
			<div
				data-note-control
				className="absolute top-1/2 -left-3.5 z-10 flex h-[26px] w-[26px] -translate-y-1/2 items-center justify-center"
				style={{
					cursor: "crosshair",
					opacity:
						hoveredDropId === note._id
							? 1
							: isLinking
								? 0.7
								: hoveredNoteId === note._id
									? 1
									: 0,
					transition: "opacity 0.15s ease",
					pointerEvents: isLinking ? "auto" : "none",
				}}
				title="Drop connection here"
			>
				<div
					style={{
						width: 13,
						height: 13,
						borderRadius: "50%",
						background:
							hoveredDropId === note._id ? "#10b981" : "#fff",
						border: "2px solid #6366f1",
						boxShadow:
							hoveredDropId === note._id
								? "0 0 0 3px rgba(16,185,129,0.25)"
								: "0 0 0 3px rgba(99,102,241,0.15)",
						transform:
							hoveredDropId === note._id
								? "scale(1.25)"
								: "scale(1)",
						transition: "all 0.15s ease",
					}}
				/>
			</div>

			{/* Right Connection Point (drag to link) */}
			<div
				data-note-control
				onMouseDown={(e) => onLinkingStart(e, note._id)}
				onTouchStart={(e) => onLinkingStartTouch(e, note._id)}
				className={`absolute top-1/2 left-full z-10 flex h-[26px] w-[26px] -translate-x-1/2 -translate-y-1/2 items-center justify-center ${
					isThisLinking ? "cursor-grabbing" : "cursor-crosshair"
				}`}
				style={{
					opacity: isThisLinking
						? 1
						: hoveredNoteId === note._id || isLinking
							? 0.9
							: 0,
					transition: "opacity 0.15s ease",
				}}
				title="Drag to connect notes"
			>
				<div
					style={{
						width: 13,
						height: 13,
						borderRadius: "50%",
						background: isThisLinking ? "#6366f1" : "#fff",
						border: "2px solid #6366f1",
						boxShadow: "0 0 0 3px rgba(99,102,241,0.15)",
						transform: isThisLinking ? "scale(1.25)" : "scale(1)",
						transition: "all 0.15s ease",
					}}
				/>
			</div>
		</div>
	);
};

/**
 * Focuses the note's editor, placing the caret at the given viewport point
 * when it lands inside the editable area (otherwise focuses the editor end).
 * Used by the idle drag overlay so a click starts typing exactly where hit.
 */
const focusEditorAtPoint = (noteRoot: HTMLElement, x: number, y: number) => {
	const ed = noteRoot.querySelector(
		'[contenteditable="true"]',
	) as HTMLElement | null;
	if (!ed) return;
	const doc = noteRoot.ownerDocument;
	try {
		let range: Range | null = null;
		if (typeof doc.caretRangeFromPoint === "function") {
			range = doc.caretRangeFromPoint(x, y);
		} else {
			const pos = (doc as Document & {
				caretPositionFromPoint?: (
					x: number,
					y: number,
				) => { offsetNode: Node; offset: number } | null;
			}).caretPositionFromPoint?.(x, y);
			if (pos) {
				range = doc.createRange();
				range.setStart(pos.offsetNode, pos.offset);
				range.collapse(true);
			}
		}
		const sel = doc.getSelection();
		if (
			range &&
			sel &&
			(ed === range.commonAncestorContainer ||
				ed.contains(range.commonAncestorContainer))
		) {
			sel.removeAllRanges();
			sel.addRange(range);
			ed.focus({ preventScroll: true });
			return;
		}
	} catch {
		/* fall through to plain focus */
	}
	ed.focus({ preventScroll: true });
};

const MemoNote = React.memo(NoteWindow);

const CanvasPage: React.FC = () => {
	const [notes, setNotes] = useState<Note[]>([]);
	const [loading, setLoading] = useState(true);

	// Canvas Transformation State (persisted so users return to their last view)
	const [scale, setScale] = useState<number>(() => {
		try {
			const saved = JSON.parse(
				localStorage.getItem(VIEW_STORAGE_KEY) || "{}",
			);
			return typeof saved.scale === "number" &&
				saved.scale >= 0.1 &&
				saved.scale <= 5
				? saved.scale
				: 1;
		} catch {
			return 1;
		}
	});
	const [offset, setOffset] = useState<{ x: number; y: number }>(() => {
		try {
			const saved = JSON.parse(
				localStorage.getItem(VIEW_STORAGE_KEY) || "{}",
			);
			return saved.offset &&
				typeof saved.offset.x === "number" &&
				typeof saved.offset.y === "number"
				? saved.offset
				: { x: 0, y: 0 };
		} catch {
			return { x: 0, y: 0 };
		}
	});
	const [bgColor, setBgColor] = useState<string>(() => {
		try {
			const saved = JSON.parse(
				localStorage.getItem(VIEW_STORAGE_KEY) || "{}",
			);
			return typeof saved.bgColor === "string" ? saved.bgColor : "";
		} catch {
			return "";
		}
	});
	const [showBgMenu, setShowBgMenu] = useState(false);

	const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

	useEffect(() => {
		const handleResize = () => {
			setIsMobile(window.innerWidth < 768);
		};
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	// Interaction Flags
	const [isPanning, setIsPanning] = useState(false);
	const [isDraggingNode, setIsDraggingNode] = useState(false);
	const [isResizing, setIsResizing] = useState(false);
	const [isLinking, setIsLinking] = useState(false);

	// Active Element References
	const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
	const [resizingNoteId, setResizingNoteId] = useState<string | null>(null);
	const [isFullScreen, setIsFullScreen] = useState(false);
	const [selectedTool, setSelectedTool] = useState<"select" | "pan">(
		"select",
	);
	const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
	const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);

	// Connection linking state
	const [linkingSourceId, setLinkingSourceId] = useState<string | null>(null);
	const [linkMousePos, setLinkMousePos] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const [hoveredDropId, setHoveredDropId] = useState<string | null>(null);

	// Layering: clicking a note brings it to the front of all other notes.
	const [zLayers, setZLayers] = useState<Record<string, number>>({});
	const zCounterRef = useRef(10);

	const bringToFront = useCallback((id: string) => {
		setZLayers((prev) => {
			const next = zCounterRef.current + 10;
			zCounterRef.current = next;
			return { ...prev, [id]: next };
		});
	}, []);

	// Notes size themselves to content (height auto, no scrollbar), so link
	// endpoints use measured DOM heights instead of the stored height field.
	const [noteHeights, setNoteHeights] = useState<Record<string, number>>({});
	useEffect(() => {
		const root = containerRef.current;
		if (!root) return;
		const ro = new ResizeObserver((entries) => {
			setNoteHeights((prev) => {
				let changed = false;
				const next = { ...prev };
				for (const en of entries) {
					const id = (en.target as HTMLElement).getAttribute(
						"data-note-id",
					);
					if (!id) continue;
					// Border-box: contentRect excludes the note's p-4 padding
					// (32px), which put every endpoint ~16px above center.
					const bb = (
						en as ResizeObserverEntry & {
							borderBoxSize?: { blockSize: number }[];
						}
					).borderBoxSize;
					const h =
						bb && bb[0]
							? bb[0].blockSize
							: en.contentRect.height;
					if (Math.abs((next[id] ?? -1) - h) > 0.5) {
						next[id] = h;
						changed = true;
					}
				}
				return changed ? next : prev;
			});
		});
		root.querySelectorAll(".canvas-note").forEach((el) =>
			ro.observe(el, { box: "border-box" }),
		);
		return () => ro.disconnect();
		// Length only: content edits don't add/remove elements, and existing
		// observations keep firing on size changes. (Resubscribing per
		// keystroke was a major source of lag.)
	}, [notes.length]);

	const effH = useCallback(
		(n: Note) => noteHeights[n._id] ?? 140,
		[noteHeights],
	);
	// Ref mirror for callbacks that read notes via notesRef (no state access).
	const noteHeightsRef = useRef<Record<string, number>>({});
	useEffect(() => {
		noteHeightsRef.current = noteHeights;
	}, [noteHeights]);
	const effHById = (id: string) => noteHeightsRef.current[id] ?? 140;

	// Autosave state for note edits.
	const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>(
		{},
	);
	const saveTimerRef = useRef<number | null>(null);
	const pendingSavesRef = useRef<Record<string, Record<string, unknown>>>(
		{},
	);


	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLDivElement>(null);
	const topToolsRef = useRef<HTMLDivElement>(null);
	const notesRef = useRef<Note[]>(notes);

	const scaleRef = useRef(scale);
	const offsetRef = useRef(offset);
	const linkingSourceIdRef = useRef<string | null>(null);
	const linkMousePosRef = useRef<{ x: number; y: number } | null>(null);

	// Pointer origin and last position, kept in refs so deltas are measured
	// against the immediately-previous event (state updates lag behind fast
	// mousemove/touchmove sequences and cause the dragged note to "drift").
	const mousePosRef = useRef({ x: 0, y: 0 });
	const startMousePosRef = useRef({ x: 0, y: 0 });

	const pinchStartDistanceRef = useRef<number | null>(null);
	const pinchStartScaleRef = useRef<number>(1);

	const pinchCenterRef = useRef({
		x: 0,
		y: 0,
	});

	const lastPanCenterRef = useRef({
		x: 0,
		y: 0,
	});

	const touchMovedRef = useRef(false);

	useEffect(() => {
		notesRef.current = notes;
	}, [notes]);

	useEffect(() => {
		scaleRef.current = scale;
	}, [scale]);

	useEffect(() => {
		offsetRef.current = offset;
	}, [offset]);

	// Persist zoom/pan + background color so the view is restored next visit.
	useEffect(() => {
		try {
			localStorage.setItem(
				VIEW_STORAGE_KEY,
				JSON.stringify({ scale, offset, bgColor }),
			);
		} catch {
			/* storage unavailable – ignore */
		}
	}, [scale, offset, bgColor]);

	useEffect(() => {
		const updateSize = () => {
			if (containerRef.current) {
				const rect = containerRef.current.getBoundingClientRect();
				setContainerSize({ width: rect.width, height: rect.height });
			}
		};
		updateSize();
		window.addEventListener("resize", updateSize);
		return () => window.removeEventListener("resize", updateSize);
	}, []);

	// Fetch notes on mount
	useEffect(() => {
		fetchNotes();
	}, []);

	/**
	 * Initializes the canvas with the current user's saved notes
	 * fetched from the backend API.
	 */
	const fetchNotes = async () => {
		try {
			const { data } = await api.get("/canvas");
			setNotes(data);
		} catch (error) {
			console.error("Failed to fetch notes", error);
		} finally {
			setLoading(false);
		}
	};

	// Helper to convert screen coordinates into canvas (untransformed) coordinates.
	const screenToCanvas = useCallback((clientX: number, clientY: number) => {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return { x: 0, y: 0 };
		return {
			x: (clientX - rect.left - offsetRef.current.x) / scaleRef.current,
			y: (clientY - rect.top - offsetRef.current.y) / scaleRef.current,
		};
	}, []);

	/**
	 * Adds a directional connection from `sourceId` (right handle) to `targetId`
	 * (left handle) and persists it to the backend.
	 */
	const addConnection = useCallback(
		async (sourceId: string, targetId: string) => {
			const source = notesRef.current.find((n) => n._id === sourceId);
			if (!source || sourceId === targetId) return;
			const current = source.connections || [];
			if (current.includes(targetId)) return;

			const connections = [...current, targetId];
			setNotes((prev) =>
				prev.map((n) =>
					n._id === sourceId ? { ...n, connections } : n,
				),
			);
			try {
				await api.put(`/canvas/${sourceId}`, { connections });
			} catch (error) {
				console.error("Failed to save connection", error);
			}
		},
		[],
	);

	/**
	 * Removes an existing connection between two connected notes and persists it.
	 */
	const removeConnection = useCallback(
		async (sourceId: string, targetId: string) => {
			const source = notesRef.current.find((n) => n._id === sourceId);
			if (!source) return;
			const connections = (source.connections || []).filter(
				(id) => id !== targetId,
			);
			setNotes((prev) =>
				prev.map((n) =>
					n._id === sourceId ? { ...n, connections } : n,
				),
			);
			try {
				await api.put(`/canvas/${sourceId}`, { connections });
			} catch (error) {
				console.error("Failed to remove connection", error);
			}
		},
		[],
	);

	const resetLinking = useCallback(() => {
		setIsLinking(false);
		setLinkingSourceId(null);
		setLinkMousePos(null);
		setHoveredDropId(null);
		linkingSourceIdRef.current = null;
		linkMousePosRef.current = null;
	}, []);

	/**
	 * Fires when a connection drag gesture ends. If the cursor is close enough to
	 * another note's left connection point, a connection is created.
	 */
	const completeLink = useCallback(() => {
		const sourceId = linkingSourceIdRef.current;
		const pos = linkMousePosRef.current;
		if (!sourceId || !pos) {
			resetLinking();
			return;
		}

		const radius = Math.max(28 / scaleRef.current, 14);
		for (const target of notesRef.current) {
			if (target._id === sourceId) continue;
			const ly = target.y + effHById(target._id) / 2;
			if (Math.hypot(pos.x - target.x, pos.y - ly) <= radius) {
				addConnection(sourceId, target._id);
				break;
			}
		}
		resetLinking();
	}, [addConnection, resetLinking]);

	const startLinking = useCallback(
		(e: React.MouseEvent, sourceId: string) => {
			e.stopPropagation();
			setIsLinking(true);
			setLinkingSourceId(sourceId);
			linkingSourceIdRef.current = sourceId;
			const pos = screenToCanvas(e.clientX, e.clientY);
			setLinkMousePos(pos);
			linkMousePosRef.current = pos;
		},
		[screenToCanvas],
	);

	const startLinkingTouch = useCallback(
		(e: React.TouchEvent, sourceId: string) => {
			if (e.touches.length !== 1) return;
			const touch = e.touches[0];
			e.stopPropagation();
			setIsLinking(true);
			setLinkingSourceId(sourceId);
			linkingSourceIdRef.current = sourceId;
			const pos = screenToCanvas(touch.clientX, touch.clientY);
			setLinkMousePos(pos);
			linkMousePosRef.current = pos;
			touchMovedRef.current = false;
		},
		[screenToCanvas],
	);

	const updateLinkingPos = useCallback(
		(clientX: number, clientY: number) => {
			const pos = screenToCanvas(clientX, clientY);
			setLinkMousePos(pos);
			linkMousePosRef.current = pos;

			// Highlight the drop target whose left point is under the cursor.
			const sourceId = linkingSourceIdRef.current;
			const radius = Math.max(28 / scaleRef.current, 14);
			let dropId: string | null = null;
			for (const target of notesRef.current) {
				if (target._id === sourceId) continue;
				const ly = target.y + effHById(target._id) / 2;
				if (Math.hypot(pos.x - target.x, pos.y - ly) <= radius) {
					dropId = target._id;
					break;
				}
			}
			setHoveredDropId(dropId);
		},
		[screenToCanvas],
	);

	// Build the list of connection lines between notes for rendering.
	const connectionLines = useMemo<ConnectionLine[]>(() => {
		const targets = new Map(notes.map((n) => [n._id, n]));
		const lines: ConnectionLine[] = [];
		for (const note of notes) {
			for (const targetId of note.connections || []) {
				const target = targets.get(targetId);
				if (!target) continue;
				const x1 = note.x + (note.width || 200);
				const y1 = note.y + effH(note) / 2;
				const x2 = target.x;
				const y2 = target.y + effH(target) / 2;
				lines.push({
					key: `${note._id}:${targetId}`,
					x1,
					y1,
					x2,
					y2,
					fromId: note._id,
					toId: targetId,
				});
			}
		}
		return lines;
	}, [notes, effH]);

	// Bounding box of every line endpoint (plus the live drag cursor) so the SVG
	// is always large enough to draw them all, no matter where the notes are.
	const svgBounds = useMemo<{
		x: number;
		y: number;
		width: number;
		height: number;
	} | null>(() => {
		const points: { x: number; y: number }[] = [];
		for (const line of connectionLines) {
			points.push({ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 });
		}
		if (isLinking && linkingSourceId && linkMousePos) {
			const src = notes.find((n) => n._id === linkingSourceId);
			if (src) {
				points.push(
					{
						x: src.x + (src.width || 200),
						y: src.y + effH(src) / 2,
					},
					linkMousePos,
				);
			}
		}
		if (points.length === 0) return null;
		const pad = 8;
		const xs = points.map((p) => p.x);
		const ys = points.map((p) => p.y);
		const minX = Math.min(...xs) - pad;
		const minY = Math.min(...ys) - pad;
		return {
			x: minX,
			y: minY,
			width: Math.max(...xs) - minX + pad,
			height: Math.max(...ys) - minY + pad,
		};
	}, [connectionLines, isLinking, linkingSourceId, linkMousePos, notes, effH]);

	// Helper to zoom towards a specific point
	/**
	 * Calculates and updates the transformation matrix to seamlessly zoom in/out
	 * towards a specific coordinate point on the screen (usually the mouse cursor center point).
	 */
	const zoomTowards = useCallback(
		(newScale: number, centerX: number, centerY: number) => {
			setScale((prevScale) => {
				const s1 = prevScale;
				const s2 = newScale;

				setOffset((prevOffset) => ({
					x: centerX - (centerX - prevOffset.x) * (s2 / s1),
					y: centerY - (centerY - prevOffset.y) * (s2 / s1),
				}));

				return s2;
			});
		},
		[],
	);
	const getTouchDistance = (touches: React.TouchList) => {
		const dx = touches[0].clientX - touches[1].clientX;
		const dy = touches[0].clientY - touches[1].clientY;

		return Math.sqrt(dx * dx + dy * dy);
	};

	const getTouchCenter = (touches: React.TouchList) => {
		return {
			x: (touches[0].clientX + touches[1].clientX) / 2,
			y: (touches[0].clientY + touches[1].clientY) / 2,
		};
	};

	// Zoom handler (native non-passive listener; React's onWheel is passive so
	// preventDefault() here would be ignored and log a console warning).
	const handleWheel = useCallback(
		(e: WheelEvent) => {
			if (e.altKey) {
				e.preventDefault();
				const rect = containerRef.current?.getBoundingClientRect();
				if (!rect) return;

				const mouseX = e.clientX - rect.left;
				const mouseY = e.clientY - rect.top;

				const delta = -e.deltaY * 0.001;
				const newScale = Math.min(Math.max(0.1, scale + delta), 5);

				zoomTowards(newScale, mouseX, mouseY);
			} else {
				setOffset((prev) => ({
					x: prev.x - e.deltaX,
					y: prev.y - e.deltaY,
				}));
			}
		},
		[scale, zoomTowards],
	);

	/**
	 * Initializes interactions based on current tool mode or hotkey modifiers.
	 * Determines whether to start panning the canvas or tracking for other behaviors.
	 */
	const handleMouseDown = (e: React.MouseEvent) => {
		const isMiddleButton = e.button === 1;
		const isAltPressed = e.altKey;

		// Rule 1 & 3: Pan tool or Alt/Middle mouse button starts panning
		if (
			selectedTool === "pan" ||
			isMiddleButton ||
			(selectedTool === "select" && isAltPressed)
		) {
			setIsPanning(true);
			mousePosRef.current = { x: e.clientX, y: e.clientY };
			return;
		}

		mousePosRef.current = { x: e.clientX, y: e.clientY };
		startMousePosRef.current = { x: e.clientX, y: e.clientY };
	};

	/**
	 * Handles fluid interactions like canvas panning, note dragging, and note resizing
	 * by comparing the current cursor offset against the initial mousedown position
	 * scaled by the current zoom level.
	 */
	const handleMouseMove = (e: React.MouseEvent) => {
		if (isPanning) {
			const dx = e.clientX - mousePosRef.current.x;
			const dy = e.clientY - mousePosRef.current.y;
			setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
			mousePosRef.current = { x: e.clientX, y: e.clientY };
		} else if (isLinking) {
			updateLinkingPos(e.clientX, e.clientY);
		} else if (draggedNoteId) {
			// Threshold check: prevent accidental movement on simple clicks
			if (!isDraggingNode) {
				const moveDist = Math.sqrt(
					Math.pow(e.clientX - startMousePosRef.current.x, 2) +
						Math.pow(e.clientY - startMousePosRef.current.y, 2),
				);
				if (moveDist > 3) {
					setIsDraggingNode(true);
					// A real drag won over editing: drop focus so stray keys
					// can't type mid-drag.
					(
						document.activeElement as HTMLElement | null
					)?.blur?.();
				}
				return;
			}

			const dx = (e.clientX - mousePosRef.current.x) / scaleRef.current;
			const dy = (e.clientY - mousePosRef.current.y) / scaleRef.current;
			setNotes((prev) =>
				prev.map((n) =>
					n._id === draggedNoteId
						? { ...n, x: n.x + dx, y: n.y + dy }
						: n,
				),
			);
			mousePosRef.current = { x: e.clientX, y: e.clientY };
		} else if (isResizing && resizingNoteId) {
			const dx = (e.clientX - mousePosRef.current.x) / scaleRef.current;
			const dy = (e.clientY - mousePosRef.current.y) / scaleRef.current;
			setNotes((prev) =>
				prev.map((n) =>
					n._id === resizingNoteId
						? {
								...n,
								width: Math.max(150, (n.width || 200) + dx),
								height: Math.max(100, (n.height || 140) + dy),
							}
						: n,
				),
			);
			mousePosRef.current = { x: e.clientX, y: e.clientY };
		}
	};

	const handleTouchStart = (e: React.TouchEvent) => {
		touchMovedRef.current = false;

		if (e.touches.length === 2) {
			const center = getTouchCenter(e.touches);

			pinchStartDistanceRef.current = getTouchDistance(e.touches);

			pinchStartScaleRef.current = scale;

			pinchCenterRef.current = center;

			lastPanCenterRef.current = center;

			setIsPanning(true);

			return;
		}

		if (e.touches.length === 1) {
			const touch = e.touches[0];

			if (selectedTool === "pan") {
				setIsPanning(true);

				mousePosRef.current = {
					x: touch.clientX,
					y: touch.clientY,
				};

				return;
			}

			mousePosRef.current = {
				x: touch.clientX,
				y: touch.clientY,
			};

			startMousePosRef.current = {
				x: touch.clientX,
				y: touch.clientY,
			};
		}
	};

	const handleTouchMove = (e: React.TouchEvent) => {
		if (e.touches.length === 2) {
			// touchAction: "none" on the container already suppresses default
			// browser gestures, so no preventDefault() is needed here.

			const distance = getTouchDistance(e.touches);

			const center = getTouchCenter(e.touches);

			touchMovedRef.current = true;

			if (pinchStartDistanceRef.current) {
				const zoomRatio = distance / pinchStartDistanceRef.current;

				const nextScale = Math.min(
					Math.max(pinchStartScaleRef.current * zoomRatio, 0.1),
					5,
				);

				zoomTowards(nextScale, center.x, center.y);
			}

			const dx = center.x - lastPanCenterRef.current.x;

			const dy = center.y - lastPanCenterRef.current.y;

			setOffset((prev) => ({
				x: prev.x + dx,
				y: prev.y + dy,
			}));

			lastPanCenterRef.current = center;

			return;
		}

		if (e.touches.length !== 1) return;

		const touch = e.touches[0];

		const movedDistance = Math.sqrt(
			Math.pow(touch.clientX - startMousePosRef.current.x, 2) +
				Math.pow(touch.clientY - startMousePosRef.current.y, 2),
		);

		if (movedDistance > 4) {
			touchMovedRef.current = true;
		}

		if (isLinking) {
			updateLinkingPos(touch.clientX, touch.clientY);
			return;
		}

		if (isPanning) {
			const dx = touch.clientX - mousePosRef.current.x;
			const dy = touch.clientY - mousePosRef.current.y;

			setOffset((prev) => ({
				x: prev.x + dx,
				y: prev.y + dy,
			}));

			mousePosRef.current = {
				x: touch.clientX,
				y: touch.clientY,
			};

			return;
		}

		if (draggedNoteId) {
			if (!isDraggingNode) {
				if (movedDistance > 4) {
					setIsDraggingNode(true);
					(
						document.activeElement as HTMLElement | null
					)?.blur?.();
				} else {
					return;
				}
			}

			const dx =
				(touch.clientX - mousePosRef.current.x) / scaleRef.current;

			const dy =
				(touch.clientY - mousePosRef.current.y) / scaleRef.current;

			setNotes((prev) =>
				prev.map((note) =>
					note._id === draggedNoteId
						? {
								...note,
								x: note.x + dx,
								y: note.y + dy,
							}
						: note,
				),
			);

			mousePosRef.current = {
				x: touch.clientX,
				y: touch.clientY,
			};

			return;
		}

		if (isResizing && resizingNoteId) {
			const dx =
				(touch.clientX - mousePosRef.current.x) / scaleRef.current;

			const dy =
				(touch.clientY - mousePosRef.current.y) / scaleRef.current;

			setNotes((prev) =>
				prev.map((note) =>
					note._id === resizingNoteId
						? {
								...note,
								width: Math.max(150, (note.width || 200) + dx),
								height: Math.max(
									100,
									(note.height || 140) + dy,
								),
							}
						: note,
				),
			);

			mousePosRef.current = {
				x: touch.clientX,
				y: touch.clientY,
			};
		}
	};

	// Attach the wheel handler as a native non-passive listener. React's
	// synthetic onWheel is passive at the root, causing
	// "Unable to preventDefault inside passive event listener invocation."
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		el.addEventListener("wheel", handleWheel, { passive: false });
		return () => el.removeEventListener("wheel", handleWheel);
	}, [handleWheel]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Escape always just drops focus (hides the format bar).
			if (e.key === "Escape") {
				(document.activeElement as HTMLElement | null)?.blur?.();
				return;
			}

			// Never hijack keystrokes typed into inputs or note editors.
			const t = e.target as HTMLElement | null;
			if (
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLInputElement ||
				t?.isContentEditable ||
				t?.closest?.('[contenteditable="true"]')
			)
				return;

			if (e.key === "v" || e.key === "V") setSelectedTool("select");
			if (e.key === "h" || e.key === "H") setSelectedTool("pan");

			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;

			if (e.key === "+" || e.key === "=") {
				zoomTowards(
					Math.min(scaleRef.current + 0.2, 5),
					rect.width / 2,
					rect.height / 2,
				);
			}
			if (e.key === "-" || e.key === "_") {
				zoomTowards(
					Math.max(scaleRef.current - 0.2, 0.1),
					rect.width / 2,
					rect.height / 2,
				);
			}
			if (e.key === "0") {
				setScale(1);
				setOffset({ x: 0, y: 0 });
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [zoomTowards]);

	/**
	 * Completes dragging or resizing interactions and saves updated note properties
	 * (position or dimensions) asynchronously to the backend database.
	 */
	const handleMouseUp = useCallback(async () => {
		const wasInteracting = isDraggingNode || isResizing;
		const targetId = draggedNoteId || resizingNoteId;

		// Finalize any in-progress connection drag (no-op if not linking).
		completeLink();

		// Immediately disable flags to kill the "buttery" effect and snap state
		setIsDraggingNode(false);
		setIsPanning(false);
		setIsResizing(false);
		setDraggedNoteId(null);
		setResizingNoteId(null);

		pinchStartDistanceRef.current = null;
		touchMovedRef.current = false;

		if (wasInteracting && targetId) {
			const note = notesRef.current.find((n) => n._id === targetId);
			if (note) {
				try {
					await api.put(`/canvas/${targetId}`, {
						x: note.x,
						y: note.y,
						width: note.width || 200,
						height: note.height || 140,
						content: note.content,
						color: note.color,
					});
				} catch (error) {
					console.error("Failed to save note properties", error);
				}
			}
		}
	}, [
		isDraggingNode,
		isResizing,
		draggedNoteId,
		resizingNoteId,
		completeLink,
	]);

	useEffect(() => {
		// Only register global listeners when actively dragging/resizing/panning/linking
		if (!isDraggingNode && !isResizing && !isPanning && !isLinking) return;
		window.addEventListener("mouseup", handleMouseUp);
		window.addEventListener("touchend", handleMouseUp);
		return () => {
			window.removeEventListener("mouseup", handleMouseUp);
			window.removeEventListener("touchend", handleMouseUp);
		};
	}, [handleMouseUp, isDraggingNode, isResizing, isPanning, isLinking]);

	const addNoteAt = async (x: number, y: number) => {
		const newNoteData = {
			x: x - 100,
			y: y - 60,
			width: 400,
			height: 400,
			title: "",
			content: "",
			color: COLORS[Math.floor(Math.random() * COLORS.length)],
		};

		try {
			const { data } = await api.post("/canvas", newNoteData);
			setNotes([...notes, data]);
			// Focus the fresh note so the user can just start typing.
			setAutoFocusId(data._id);
			setFocusedNoteId(data._id);
		} catch (error) {
			console.error("Failed to create note", error);
		}
	};

	const addNote = async () => {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return;

		const centerX = (rect.width / 2 - offset.x) / scale;
		const centerY = (rect.height / 2 - offset.y) / scale;

		await addNoteAt(centerX, centerY);
	};

	const deleteNote = useCallback(async (id: string) => {
		try {
			await api.delete(`/canvas/${id}`);
			editorsRef.current.delete(id);
			delete pendingSavesRef.current[id];
			delete pendingContentRef.current[id];
			setFocusedNoteId((prev) => (prev === id ? null : prev));
			setNoteHeights((prev) => {
				if (!(id in prev)) return prev;
				const next = { ...prev };
				delete next[id];
				return next;
			});
			setSaveStatus((prev) => {
				if (!(id in prev)) return prev;
				const next = { ...prev };
				delete next[id];
				return next;
			});
			setNotes((prev) =>
				prev
					.filter((n) => n._id !== id)
					.map((n) =>
						n.connections?.includes(id)
							? {
									...n,
									connections: n.connections.filter(
										(c) => c !== id,
									),
								}
							: n,
					),
			);
		} catch (error) {
			console.error("Failed to delete note", error);
		}
	}, []);

	// Per-note pending saves: typing in one note must never drop another
	// note's unsaved changes, and each indicator tracks only its own note.
	const flushSave = useCallback(async () => {
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
			saveTimerRef.current = null;
		}
		const entries = Object.entries(pendingSavesRef.current);
		pendingSavesRef.current = {};
		if (entries.length === 0) return;
		await Promise.all(
			entries.map(async ([id, changes]) => {
				try {
					await api.put(`/canvas/${id}`, changes);
					setSaveStatus((s) => ({ ...s, [id]: "saved" }));
					window.setTimeout(() => {
						// Only clear if nothing newer started saving meanwhile.
						setSaveStatus((s) =>
							s[id] === "saved" ? { ...s, [id]: "idle" } : s,
						);
					}, 1500);
				} catch (error) {
					console.error("Failed to save note changes", error);
					setSaveStatus((s) => ({ ...s, [id]: "error" }));
				}
			}),
		);
	}, []);

	const scheduleSave = useCallback(() => {
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		saveTimerRef.current = window.setTimeout(() => {
			saveTimerRef.current = null;
			flushSave();
		}, 800);
	}, [flushSave]);

	const queueChange = useCallback(
		(id: string, changes: Record<string, unknown>) => {
			pendingSavesRef.current[id] = {
				...pendingSavesRef.current[id],
				...changes,
			};
			setSaveStatus((s) =>
				s[id] === "saving" ? s : { ...s, [id]: "saving" },
			);
			scheduleSave();
		},
		[scheduleSave],
	);

	// Trailing mirror of editor content into state. The editor owns its text,
	// so parent re-renders (page, minimap lines, export data) catch up on
	// pause instead of on every keystroke — this is what keeps typing smooth.
	const pendingContentRef = useRef<Record<string, string>>({});
	const contentSyncTimer = useRef<number | null>(null);

	const updateNoteContent = useCallback(
		(id: string, content: string) => {
			// Save path always sees every keystroke immediately.
			queueChange(id, { content });
			// Render path catches up trailing.
			pendingContentRef.current[id] = content;
			if (contentSyncTimer.current)
				clearTimeout(contentSyncTimer.current);
			contentSyncTimer.current = window.setTimeout(() => {
				contentSyncTimer.current = null;
				const pending = pendingContentRef.current;
				pendingContentRef.current = {};
				const ids = Object.keys(pending);
				if (ids.length === 0) return;
				setNotes((prev) => {
					let changed = false;
					const next = prev.map((n) => {
						const c = pending[n._id];
						if (c !== undefined && c !== n.content) {
							changed = true;
							return { ...n, content: c };
						}
						return n;
					});
					return changed ? next : prev;
				});
			}, 350);
		},
		[queueChange],
	);

	const handleTitleChange = useCallback(
		(id: string, title: string) => {
			setNotes((prev) =>
				prev.map((n) => (n._id === id ? { ...n, title } : n)),
			);
			queueChange(id, { title });
		},
		[queueChange],
	);

	/** Immediately persist a discrete change (e.g. note color). */
	const updateNoteColor = useCallback(async (id: string, color: string) => {
		setNotes((prev) =>
			prev.map((n) => (n._id === id ? { ...n, color } : n)),
		);
		try {
			await api.put(`/canvas/${id}`, { color });
		} catch (error) {
			console.error("Failed to save note color", error);
		}
	}, []);

	// Two-step clear-board confirmation (resets if abandoned).
	const [clearStep, setClearStep] = useState<0 | 1 | 2>(0);
	const clearTimer = useRef<number | null>(null);
	const armClearReset = () => {
		if (clearTimer.current) clearTimeout(clearTimer.current);
		clearTimer.current = window.setTimeout(() => {
			clearTimer.current = null;
			setClearStep(0);
		}, 5000);
	};

	const handleClearBoard = async () => {
		if (notes.length === 0) return;
		if (clearStep < 2) {
			setClearStep((s) => (s === 0 ? 1 : 2));
			armClearReset();
			return;
		}
		if (clearTimer.current) {
			clearTimeout(clearTimer.current);
			clearTimer.current = null;
		}
		setClearStep(0);
		try {
			await api.delete("/canvas");
			editorsRef.current.clear();
			pendingSavesRef.current = {};
			pendingContentRef.current = {};
			setNotes([]);
			setNoteHeights({});
			setSaveStatus({});
			setFocusedNoteId(null);
			setAutoFocusId(null);
			toast.success("Board cleared");
		} catch (error) {
			console.error("Failed to clear board", error);
			toast.error("Failed to clear board");
		}
	};

	// Flush any pending autosave when leaving the page.
	useEffect(() => {
		return () => {
			if (contentSyncTimer.current) {
				clearTimeout(contentSyncTimer.current);
				contentSyncTimer.current = null;
			}
			if (clearTimer.current) {
				clearTimeout(clearTimer.current);
				clearTimer.current = null;
			}
			flushSave();
		};
	}, [flushSave]);

	const resetView = () => {
		setScale(1);
		setOffset({ x: 0, y: 0 });
	};

	// Stable per-note handlers so MemoNote's shallow prop comparison can skip
	// re-rendering notes that didn't actually change.
	const handleNoteMouseDown = useCallback(
		(e: React.MouseEvent, id: string) => {
			// Always stop propagation in Select mode to prevent canvas-level actions
			if (selectedTool === "select") {
				e.stopPropagation();
			}
			if (isLinking) return;
			if (selectedTool === "pan") return;

			// Drag-vs-edit is decided before this runs (idle shield focuses,
			// focused editor keeps the press local), so tracking always starts
			// here. A real drag blurs the editor at the movement threshold.
			if (selectedTool === "select") {
				setDraggedNoteId(id);
				mousePosRef.current = { x: e.clientX, y: e.clientY };
				startMousePosRef.current = { x: e.clientX, y: e.clientY };
			}
		},
		[selectedTool, isLinking],
	);

	const handleNoteTouchStart = useCallback(
		(e: React.TouchEvent, id: string) => {
			if (e.touches.length !== 1) return;
			const touch = e.touches[0];

			// Always stop propagation in Select mode to prevent canvas-level actions
			if (selectedTool === "select") {
				e.stopPropagation();
			}
			if (isLinking) return;
			if (selectedTool === "pan") return;

			if (selectedTool === "select") {
				touchMovedRef.current = false;
				setDraggedNoteId(id);
				mousePosRef.current = { x: touch.clientX, y: touch.clientY };
				startMousePosRef.current = {
					x: touch.clientX,
					y: touch.clientY,
				};
			}
		},
		[selectedTool, isLinking],
	);

	// When an editing session started (to tell a fresh double-click open apart
	/**
	 * Focus tracking for the shared top toolbar: it always drives whichever
	 * note's editor is currently focused. editorsRef holds every live editor
	 * instance (one per note — notes are always editable, there is no
	 * open/close edit mode).
	 */
	const editorsRef = useRef(new Map<string, Editor>());
	const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);
	const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
	const focusedEditor = focusedNoteId
		? (editorsRef.current.get(focusedNoteId) ?? null)
		: null;

	const handleEditorReady = useCallback((id: string, editor: Editor) => {
		editorsRef.current.set(id, editor);
	}, []);

	const handleFocusNote = useCallback((id: string) => {
		bringToFront(id);
		setFocusedNoteId(id);
	}, [bringToFront]);

	// True while a toolbar popup that steals focus (link dialog) is open: the
	// resulting editor blur must not hide the toolbar out from under it.
	const toolbarLockRef = useRef(false);

	// Sidebar width for sizing the format bar: 100dvw minus the sidebar
	// (from localStorage, like AppLayout) minus margins. On mobile the
	// sidebar is a drawer, so it takes no canvas space.
	const readSidebarWidth = () => {
		if (typeof window === "undefined" || window.innerWidth < 768) return 0;
		const saved = parseInt(
			localStorage.getItem("sidebar-width") || "",
			10,
		);
		return Number.isFinite(saved) && saved > 0 ? saved : 260;
	};
	const formatMaxWidth =
		containerSize.width > 0
			? containerSize.width - 48
			: `calc(100dvw - ${readSidebarWidth()}px - 48px)`;
	// Compact essentials+More mode is only for narrow desktop canvases —
	// mobile (<md) always shows every tool, wrapped inside the width above.
	const tbCompact =
		!isMobile && containerSize.width > 0 && containerSize.width < 560;

	const handleBlurNote = useCallback((id: string) => {
		if (toolbarLockRef.current) return;
		setFocusedNoteId((prev) => (prev === id ? null : prev));
	}, []);

	const handleNoteHover = useCallback((id: string | null) => {
		setHoveredNoteId(id);
	}, []);



	const handleResizeMouseDown = useCallback(
		(e: React.MouseEvent, id: string) => {
			// Only Select tool can resize
			if (selectedTool !== "select") return;
			e.stopPropagation();
			setIsResizing(true);
			setResizingNoteId(id);
			mousePosRef.current = { x: e.clientX, y: e.clientY };
			startMousePosRef.current = { x: e.clientX, y: e.clientY };
		},
		[selectedTool],
	);

	const handleResizeTouchStart = useCallback(
		(e: React.TouchEvent, id: string) => {
			// Only Select tool can resize
			if (selectedTool !== "select") return;
			if (e.touches.length !== 1) return;
			const touch = e.touches[0];
			e.stopPropagation();
			setIsResizing(true);
			setResizingNoteId(id);
			mousePosRef.current = { x: touch.clientX, y: touch.clientY };
			startMousePosRef.current = { x: touch.clientX, y: touch.clientY };
		},
		[selectedTool],
	);

	return (
		<div
			ref={containerRef}
			className="overflow-hidden select-none touch-none"
			style={{
				position: isFullScreen ? "fixed" : "absolute",
				inset: 0,
				zIndex: isFullScreen ? 2000 : 10,
				background: bgColor || "var(--color-bg)",
				cursor: isPanning
					? "grabbing"
					: isLinking
						? "crosshair"
						: selectedTool === "pan"
							? "grab"
							: "auto",
			}}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}
			onTouchStart={handleTouchStart}
			onTouchMove={handleTouchMove}
			onTouchEnd={handleMouseUp}
			onTouchCancel={handleMouseUp}
		>
			{/* Grid Pattern */}
			<div
				className="pointer-events-none absolute inset-0 opacity-30"
				style={{
					backgroundImage: `
                        radial-gradient(circle at 1px 1px, var(--color-text-tertiary) 1px, transparent 0),
                        linear-gradient(to right, var(--color-border) 1px, transparent 1px),
                        linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)
                    `,
					backgroundSize: `
                        ${20 * scale}px ${20 * scale}px,
                        ${100 * scale}px ${100 * scale}px,
                        ${100 * scale}px ${100 * scale}px
                    `,
					backgroundPosition: `
                        ${offset.x}px ${offset.y}px,
                        ${offset.x}px ${offset.y}px,
                        ${offset.x}px ${offset.y}px
                    `,
				}}
			/>

			{/* Transform Container */}
			<div
				ref={canvasRef}
				className="absolute origin-top-left will-change-transform"
				style={{
					transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
					//   transition: isPanning ? "none" : "transform 0.05s linear",
					transition:
						isPanning || isDraggingNode || isResizing
							? "none"
							: "transform 0.05s linear",
				}}
			>
				{/* Connection Lines */}
				{svgBounds && (
					<svg
						className="pointer-events-none absolute z-0 overflow-visible"
						style={{
							left: svgBounds.x,
							top: svgBounds.y,
							width: svgBounds.width,
							height: svgBounds.height,
						}}
					>
						{connectionLines.map((line) => {
							const x1 = line.x1 - svgBounds.x;
							const y1 = line.y1 - svgBounds.y;
							const x2 = line.x2 - svgBounds.x;
							const y2 = line.y2 - svgBounds.y;
							const mx = x1 + (x2 - x1) * 0.5;
							const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
							return (
								<g key={line.key}>
									{/* White halo for contrast */}
									<path
										d={d}
										fill="none"
										stroke="rgba(255,255,255,0.85)"
										strokeWidth={5}
										strokeLinecap="round"
									/>
									<path
										d={d}
										fill="none"
										stroke="#64748b"
										strokeWidth={2.5}
										strokeLinecap="round"
									/>
									{/* Wide invisible hit area for removing a connection */}
									<path
										d={d}
										fill="none"
										stroke="transparent"
										strokeWidth={12}
										className="cursor-pointer [pointer-events:stroke]"
										onMouseDown={(e) => {
											e.stopPropagation();
											removeConnection(
												line.fromId,
												line.toId,
											);
										}}
									>
										<title>
											Click to remove connection
										</title>
									</path>
								</g>
							);
						})}

						{/* Live line while dragging a connection */}
						{isLinking &&
							linkingSourceId &&
							linkMousePos &&
							(() => {
								const src = notes.find(
									(n) => n._id === linkingSourceId,
								);
								if (!src) return null;
								const sx =
									src.x + (src.width || 200) - svgBounds.x;
								const sy =
									src.y +
									effH(src) / 2 -
									svgBounds.y;
								const tx = linkMousePos.x - svgBounds.x;
								const ty = linkMousePos.y - svgBounds.y;
								const mx = sx + (tx - sx) * 0.5;
								return (
									<path
										d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`}
										fill="none"
										stroke="#6366f1"
										strokeWidth={2.5}
										strokeDasharray="6 4"
										strokeLinecap="round"
									/>
								);
							})()}
					</svg>
				)}
				{notes.map((note) => (
					<MemoNote
						key={note._id}
						note={note}
						isMobile={isMobile}
						isLinking={isLinking}
						isFocused={focusedNoteId === note._id}
						autoFocus={autoFocusId === note._id}
						hoveredNoteId={hoveredNoteId}
						hoveredDropId={hoveredDropId}
						linkingSourceId={linkingSourceId}
						saveStatus={saveStatus[note._id] || "idle"}
						zIndex={zLayers[note._id] ?? 10}
						onBringToFront={bringToFront}
						onNoteMouseDown={handleNoteMouseDown}
						onNoteTouchStart={handleNoteTouchStart}
						onTitleChange={handleTitleChange}
						onColorChange={updateNoteColor}
						onDelete={deleteNote}
						onHover={handleNoteHover}
						onLinkingStart={startLinking}
						onLinkingStartTouch={startLinkingTouch}
						onResizeMouseDown={handleResizeMouseDown}
						onResizeTouchStart={handleResizeTouchStart}
						onEditorReady={handleEditorReady}
						onFocusNote={handleFocusNote}
						onBlurNote={handleBlurNote}
						onContentChange={updateNoteContent}
					/>
				))}
			</div>

			{loading && (
				<div className="absolute inset-0 z-[2000] flex items-center justify-center bg-[rgba(255,255,255,0.1)] backdrop-blur-[2px]">
					<Loader2
						className="animate-spin text-(--color-primary)"
						size={32}
					/>
				</div>
			)}

			{/* Clear board: two explicit confirmations, then delete-all */}
			{notes.length > 0 && (
				<div
					className="absolute z-[1000]"
					style={{
						bottom: isMobile ? 60 : 78,
						right: isMobile ? 12 : 24,
					}}
				>
					<button
						onClick={handleClearBoard}
						title={
							clearStep === 0
								? "Delete all notes"
								: clearStep === 1
									? "Click again to confirm"
									: `Really delete all ${notes.length} notes?`
						}
						className={
							clearStep === 0
								? "btn btn-ghost btn-xs"
								: clearStep === 1
									? "btn btn-secondary btn-xs"
									: "btn btn-xs"
						}
						style={
							clearStep === 0
								? { opacity: 0.75 }
								: clearStep === 1
									? {
											border: "1px solid #f59e0b",
											color: "#b45309",
											background: "#fffbeb",
										}
									: {
											background: "#ef4444",
											color: "#fff",
											fontWeight: 700,
										}
						}
					>
						<Trash2 size={14} />
						{clearStep === 0
							? "Clear All"
							: clearStep === 1
								? "Sure?"
								: `Really... Delete ${notes.length} notes?`}
					</button>
				</div>
			)}

			{/* Controls */}
			<div
				className={`canvas-controls absolute flex items-center rounded-xl border border-border bg-surface shadow-lg ${
					isMobile ? "gap-2 p-1.5" : "gap-3 p-2"
				}`}
				style={{
					bottom: isMobile ? 12 : 24,
					right: isMobile ? 12 : 24,
					color: "var(--color-text)",
				}}
			>
				<button
					className="btn btn-secondary btn-xs"
					onClick={() => {
						const rect =
							containerRef.current?.getBoundingClientRect();
						if (rect)
							zoomTowards(
								Math.max(scale - 0.2, 0.1),
								rect.width / 2,
								rect.height / 2,
							);
					}}
				>
					<Minus size={16} />
				</button>

				<span className="w-10 text-center text-[0.8rem] font-semibold">
					{Math.round(scale * 100)}%
				</span>

				<button
					className="btn btn-secondary btn-xs"
					onClick={() => {
						const rect =
							containerRef.current?.getBoundingClientRect();
						if (rect)
							zoomTowards(
								Math.min(scale + 0.2, 5),
								rect.width / 2,
								rect.height / 2,
							);
					}}
				>
					<Plus size={16} />
				</button>
				<div className="h-5 w-px bg-border" />
				<button
					className="btn btn-secondary btn-xs"
					onClick={resetView}
					title="Reset View"
				>
					<RefreshCcw size={16} />
				</button>
				<div className="h-5 w-px bg-border" />
				<div className="relative flex">
					<button
						className="btn btn-secondary btn-xs"
						onClick={() => setShowBgMenu((v) => !v)}
						title="Canvas Background Color"
						aria-label="Canvas Background Color"
					>
						<Palette size={16} />
					</button>
					{showBgMenu && (
						<div
							className="absolute right-0 z-[1020] cursor-default rounded-xl border border-border bg-surface p-2.5 text-text shadow-lg"
							style={{
								bottom: "calc(100% + 8px)",
								width: 186,
							}}
						>
							<div className="flex flex-col gap-2.5">
								<span className="text-[11px] font-bold uppercase tracking-[0.04em] opacity-70">
									Background
								</span>
								<div className="flex flex-wrap gap-1.5">
									{CANVAS_BG_PRESETS.map((preset) => (
										<button
											key={preset.label}
											title={preset.label}
											onClick={() =>
												setBgColor(preset.value)
											}
											className="h-[22px] w-[22px] cursor-pointer rounded-full"
											style={{
												border:
													bgColor === preset.value
														? "2px solid var(--color-primary)"
														: "2px solid var(--color-border)",
												background:
													preset.value ||
													"var(--color-surface-hover)",
												boxShadow: preset.value
													? "inset 0 0 0 1px rgba(255,255,255,0.25)"
													: "none",
											}}
										/>
									))}
								</div>
								<label className="flex cursor-pointer items-center gap-2 text-xs">
									Custom
									<input
										type="color"
										value={bgColor || "#ffffff"}
										onChange={(e) =>
											setBgColor(e.target.value)
										}
										className="h-6 w-9 cursor-pointer border-0 bg-transparent p-0"
									/>
								</label>
							</div>
						</div>
					)}
				</div>
				<button
					className={`btn ${isFullScreen ? "btn-primary" : "btn-secondary"} btn-xs`}
					onClick={() => setIsFullScreen(!isFullScreen)}
					title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
				>
					{isFullScreen ? <Shrink size={16} /> : <Expand size={16} />}
				</button>
			</div>

			{/* Top Tools: main pill + dedicated formatting row while editing */}
			<div
				ref={topToolsRef}
				className={`absolute z-[1000] flex gap-2 ${
					isMobile
						? focusedEditor
							? "top-0 right-0 left-0 flex-col-reverse items-stretch"
							: "top-3 right-0 left-0 flex-col items-center"
						: "w-max max-w-[94vw] flex-col items-center"
				}`}
				style={
					isMobile
						? undefined
						: {
								top: 24,
								left: "50%",
								transform: "translateX(-50%)",
							}
				}
			>
				{/* main toolbar */}
				<div className={`flex max-w-[94vw] flex-row items-center gap-1.5 rounded-full border border-border bg-surface p-2 shadow-lg transition-all duration-300 ease-out ${isMobile ? "self-center" : ""}`}>
					<div className="flex gap-1 rounded-full bg-(--color-bg-secondary) p-1">
            {/* pointer */}
						<button
							onClick={() => setSelectedTool("select")}
							className={`btn btn-xs ${selectedTool === "select" ? "btn-primary" : "btn-ghost"}`}
							style={{
								borderRadius: 20,
								width: 36,
								height: 36,
								padding: 0,
							}}
							title="Select Tool (V)"
						>
							<MousePointer2 size={16} />
						</button>
            {/* pan */}
						<button
							onClick={() => setSelectedTool("pan")}
							className={`btn btn-xs ${selectedTool === "pan" ? "btn-primary" : "btn-ghost"}`}
							style={{
								borderRadius: 20,
								width: 36,
								height: 36,
								padding: 0,
							}}
							title="Pan Tool (H)"
						>
							<Hand size={16} />
						</button>
					</div>

					<div className="mx-1 h-6 w-px bg-border" />

          {/* Undo / Redo (live-wired to whichever note is focused) */}
          <ToolbarUndoRedo editor={focusedEditor} />

					<button
						onClick={addNote}
						disabled={loading}
						className="btn btn-primary flex h-9 items-center rounded-full text-[0.85rem] font-semibold"
						style={{
							padding: isMobile ? "6px 10px" : "6px 16px",
							gap: isMobile ? 4 : 8,
							opacity: loading ? 0.7 : 1,
							margin: "4px",
              borderRadius: "50px"
						}}
					>
						<Plus size={16} /> {!isMobile && "Add Note"}
					</button>
				</div>

				{/* Rich text formatting follows the focused note (notes are
					always editable — no edit mode). Wraps so dropdowns open fully. */}
				{focusedEditor && (
					<div
						className={`animate-slide-in border border-border bg-surface shadow-lg ${isMobile ? "w-full rounded-none border-x-0 border-t-0" : "max-w-[94vw] rounded-full"}`}
						style={isMobile ? undefined : { maxWidth: formatMaxWidth }}
					>
						<RichTextToolbar
							editor={focusedEditor}
							onOverlayOpen={(open) => {
								toolbarLockRef.current = open;
							}}
							compact={tbCompact}
						/>
					</div>
				)}
			</div>

			{/* Canvas Navigator */}
			{!isMobile && (
				<CanvasNavigator
					notes={notes}
					scale={scale}
					offset={offset}
					containerWidth={containerSize.width}
					containerHeight={containerSize.height}
					onOffsetChange={setOffset}
				/>
			)}
		</div>
	);
};

export default CanvasPage;
