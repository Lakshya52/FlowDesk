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
	// Maximize,
	MousePointer2,
	Hand,
	Loader2,
	RefreshCcw,
	CheckCircle2,
	Trash2,
	AlertCircle,
	Brush,
	Eraser,
	Type,
	AlignLeft,
	AlignCenter,
	AlignRight,
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

// Freehand brush stroke in canvas (untransformed) coordinates. Width is in
// canvas units so strokes zoom together with the board.
interface Stroke {
	_id: string;
	points: { x: number; y: number }[];
	color: string;
	width: number;
}

type CanvasTool = "select" | "pan" | "brush" | "eraser" | "text";

// Free-standing text box on the board. Fixed typography by design (no font
// controls) — selection, moving and resizing all happen with the Select tool.
type TextAlign = "left" | "center" | "right";

interface TextItem {
	_id: string;
	x: number;
	y: number;
	width: number;
	text: string;
	fontSize: number;
	align: TextAlign;
}

const TEXT_ALIGNMENTS: { value: TextAlign; Icon: typeof AlignLeft; label: string }[] = [
	{ value: "left", Icon: AlignLeft, label: "Align left" },
	{ value: "center", Icon: AlignCenter, label: "Align center" },
	{ value: "right", Icon: AlignRight, label: "Align right" },
];

const TEXT_DEFAULT_WIDTH = 240;
const TEXT_MIN_WIDTH = 80;
const TEXT_MAX_WIDTH = 2000;

// Eraser-shaped cursor so the tool doesn't read as "draw" (crosshair).
// Falls back to crosshair if the data URI is unsupported.
const ERASER_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cg transform='rotate(-45 14 14)'%3E%3Crect x='7' y='10' width='14' height='9' rx='2.5' fill='%23f1f5f9' stroke='%23475569' stroke-width='1.5'/%3E%3Crect x='7' y='10' width='5.5' height='9' fill='%23f472b6'/%3E%3C/g%3E%3C/svg%3E") 14 14, crosshair`;
const TEXT_DEFAULT_FONT = 15;
const TEXT_MIN_FONT = 8;
const TEXT_MAX_FONT = 120;

const BRUSH_COLORS = [
	"#111827",
	"#ef4444",
	"#f97316",
	"#eab308",
	"#22c55e",
	"#06b6d4",
	"#6366f1",
	"#d946ef",
];

const MIN_POINT_GAP = 2.5; // canvas units between recorded points (keeps payloads small)
const MAX_STROKE_POINTS = 2000;

/** SVG path for a point list; a lone point renders as a dot. */
const strokePath = (points: { x: number; y: number }[]) => {
	if (points.length === 0) return "";
	if (points.length === 1) {
		const p = points[0];
		return `M ${p.x} ${p.y} L ${p.x + 0.01} ${p.y + 0.01}`;
	}
	return `M ${points[0].x} ${points[0].y}` + points.slice(1).map((p) => ` L ${p.x} ${p.y}`).join("");
};

/** Distance from point p to segment ab (canvas units). Used by the eraser. */
const pointSegDist = (
	p: { x: number; y: number },
	a: { x: number; y: number },
	b: { x: number; y: number },
) => {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
	const t = Math.min(
		1,
		Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq),
	);
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

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

/** localStorage key for the canvas view state (zoom, pan). */
const VIEW_STORAGE_KEY = "flowdesk_canvas_view";

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
							{/* Note menu uses z 1000 (canvas-internal), not the 50
							    dropdown band: sibling notes stack unbounded via
							    bring-to-front (+10/click), so 50 would sink under them. */}
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

// Inline editor for canvas text boxes. Fixed typography by design — no font
// controls. Enter commits, Shift+Enter adds a line, Escape cancels.
const TextBoxEditor: React.FC<{
	value: string;
	onChange: (v: string) => void;
	onCommit: () => void;
	onCancel: () => void;
}> = ({ value, onChange, onCommit, onCancel }) => {
	const autoresize = (el: HTMLTextAreaElement | null) => {
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	};
	return (
		<textarea
			autoFocus
			ref={autoresize}
			rows={1}
			value={value}
			placeholder=""
			onChange={(e) => {
				onChange(e.target.value);
				autoresize(e.target);
			}}
			onBlur={onCommit}
			onKeyDown={(e) => {
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					(e.target as HTMLTextAreaElement).blur();
				} else if (e.key === "Escape") {
					e.stopPropagation();
					onCancel();
				}
			}}
			onMouseDown={(e) => e.stopPropagation()}
			onTouchStart={(e) => e.stopPropagation()}
			onDoubleClick={(e) => e.stopPropagation()}
			style={{
				width: "100%",
				resize: "none",
				overflow: "hidden",
				background: "transparent",
				border: "none",
				outline: "none",
				padding: 0,
				margin: 0,
				font: "inherit",
				color: "inherit",
				userSelect: "text",
				WebkitUserSelect: "text",
			}}
		/>
	);
};

// Circular zoom dial (see design): tick ring + live % readout. Grab the rim
// and turn around the hub to zoom (clockwise in), double-click to reset.
// Stops propagation so dial gestures never start board pans or drafts.
const ZoomWheel: React.FC<{
	size: number;
	scale: number;
	hovered: boolean;
	onHoverChange: (hovered: boolean) => void;
	onZoomAtCenter: (next: number) => void;
	onReset: () => void;
}> = ({ size, scale, hovered, onHoverChange, onZoomAtCenter, onReset }) => {
	const [dragging, setDragging] = useState(false);
	const dragRef = useRef<{ grabAngle: number; startFraction: number } | null>(null);
	const wheelRef = useRef<HTMLDivElement | null>(null);

	// Pointer angle around the hub in degrees (0° = east, clockwise positive
	// to match SVG rotation). Null inside the hub dead zone, where tiny moves
	// would swing the angle wildly.
	const angleOf = (clientX: number, clientY: number): number | null => {
		const rect = wheelRef.current?.getBoundingClientRect();
		if (!rect) return null;
		const dx = clientX - (rect.left + rect.width / 2);
		const dy = clientY - (rect.top + rect.height / 2);
		if (Math.hypot(dx, dy) < 15) return null;
		return (Math.atan2(dy, dx) * 180) / Math.PI;
	};

	const c = size / 2;
	const rOuter = size * 0.472;
	const rInner = size * 0.428;
	const TICKS = 120;
	// Ring rotation follows zoom so turning the dial is visible, capped at a
	// 120° sweep: 10% → 165°, 500% → 285°. The arc stays inside the visible
	// top-left of the cropped wheel, and zooming in turns clockwise like a
	// real knob. Tick 0 is the primary-colored pointer.
	const fraction = Math.min(1, Math.max(0, (scale - 0.1) / (5 - 0.1)));
	const deg = 165 + fraction * 120;
	const ticks = [];
	for (let i = 0; i < TICKS; i++) {
		const a = (i / TICKS) * Math.PI * 2;
		const inner = i === 0 ? rInner - size * 0.03 : rInner;
		ticks.push({
			x1: c + inner * Math.cos(a),
			y1: c + inner * Math.sin(a),
			x2: c + rOuter * Math.cos(a),
			y2: c + rOuter * Math.sin(a),
			pointer: i === 0,
		});
	}

	return (
		<div
			ref={wheelRef}
			onPointerDown={(e) => {
				e.stopPropagation();
				(e.target as HTMLElement).setPointerCapture?.(e.pointerId);
				const a = angleOf(e.clientX, e.clientY);
				if (a === null) return;
				dragRef.current = { grabAngle: a, startFraction: fraction };
				setDragging(true);
			}}
			onPointerMove={(e) => {
				const d = dragRef.current;
				if (!d) return;
				const a = angleOf(e.clientX, e.clientY);
				if (a === null) return;
				// Shortest signed arc from grab, in degrees; the 120° sweep
				// spans the full zoom range, clockwise to zoom in.
				const delta = ((((a - d.grabAngle) % 360) + 540) % 360) - 180;
				const f = Math.min(1, Math.max(0, d.startFraction + delta / 120));
				onZoomAtCenter(0.1 + f * (5 - 0.1));
			}}
			onPointerUp={() => {
				dragRef.current = null;
				setDragging(false);
			}}
			onPointerCancel={() => {
				dragRef.current = null;
				setDragging(false);
			}}
			onDoubleClick={(e) => {
				e.stopPropagation();
				onReset();
			}}
			onMouseDown={(e) => e.stopPropagation()}
			onTouchStart={(e) => e.stopPropagation()}
			onMouseEnter={() => onHoverChange(true)}
			onMouseLeave={() => onHoverChange(false)}
			title="Drag around to rotate • Double-click to reset"
			style={{
				width: size,
				height: size,
				borderRadius: "50%",
				background: "var(--color-surface)",
				border: "1px solid var(--color-border)",
				boxShadow: "0 8px 28px rgba(0,0,0,0.16)",
				cursor: dragging ? "grabbing" : "grab",
				touchAction: "none",
				userSelect: "none",
				// Grow from the cropped corner so the visible quadrant scales up.
				transform: hovered ? "scale(1.12)" : "scale(1)",
				transformOrigin: "top left",
				transition: "transform 0.25s ease",
			}}
		>
			<svg width={size} height={size} aria-hidden>
				<g transform={`rotate(${deg} ${c} ${c})`}>
					{ticks.map((t, i) => (
						<line
							key={i}
							x1={t.x1}
							y1={t.y1}
							x2={t.x2}
							y2={t.y2}
							stroke={
								t.pointer
									? "var(--color-primary)"
									: "var(--color-text-tertiary)"
							}
							strokeWidth={
								t.pointer
									? Math.max(3, size * 0.016)
									: Math.max(2.5, size * 0.013)
							}
							opacity={t.pointer ? 1 : 0.6}
							strokeLinecap="round"
						/>
					))}
				</g>
				<text
					x={c}
					y={c + size * 0.048}
					textAnchor="middle"
					fontSize={size * 0.13}
					fontWeight={800}
					fill="var(--color-text)"
					style={{ letterSpacing: "-0.02em", pointerEvents: "none" }}
				>
					{Math.round(scale * 100)}%
				</text>
			</svg>
		</div>
	);
};

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
	const [selectedTool, setSelectedTool] = useState<CanvasTool>(
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

	// Persist zoom/pan so the view is restored next visit.
	useEffect(() => {
		try {
			localStorage.setItem(
				VIEW_STORAGE_KEY,
				JSON.stringify({ scale, offset }),
			);
		} catch {
			/* storage unavailable – ignore */
		}
	}, [scale, offset]);

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

	// ── Brush strokes (freehand ink, persisted per user like notes) ──
	const [strokes, setStrokes] = useState<Stroke[]>([]);
	const strokesRef = useRef<Stroke[]>([]);
	useEffect(() => {
		strokesRef.current = strokes;
	}, [strokes]);
	const [brushColor, setBrushColor] = useState("#6366f1");
	const [brushWidth, setBrushWidth] = useState(4);
	// Live stroke being drawn (rendered immediately, saved on pointer-up).
	const [liveStroke, setLiveStroke] = useState<{
		points: { x: number; y: number }[];
		color: string;
		width: number;
	} | null>(null);
	// True while a stroke gesture is in progress (registers global pointer-up).
	const [drawingActive, setDrawingActive] = useState(false);
	// Mutable draw session; refs keep stable callbacks (e.g. handleMouseUp)
	// correct without re-subscribing listeners mid-stroke.
	const drawRef = useRef<{
		active: boolean;
		mode: "brush" | "erase";
		color: string;
		width: number;
		points: { x: number; y: number }[];
	} | null>(null);

	const fetchStrokes = useCallback(async () => {
		try {
			const { data } = await api.get("/canvas/strokes");
			if (Array.isArray(data)) setStrokes(data);
		} catch (error) {
			console.error("Failed to fetch strokes", error);
		}
	}, []);

	// ── Text boxes (fixed typography; select/move/resize via Select tool) ──
	const [texts, setTexts] = useState<TextItem[]>([]);
	const textsRef = useRef<TextItem[]>([]);
	useEffect(() => {
		textsRef.current = texts;
	}, [texts]);
	// Selected texts (Select tool; marquee can hold several), text being
	// edited, and the not-yet-saved draft placed with the Text tool.
	const [selectedTextIds, setSelectedTextIds] = useState<string[]>([]);
	const selectedTextIdsRef = useRef<string[]>([]);
	useEffect(() => {
		selectedTextIdsRef.current = selectedTextIds;
	}, [selectedTextIds]);

	// Members moved by the last text drag (for the mouseup save).
	const moveTextIdsRef = useRef<string[]>([]);
	// Marquee rubber-band in board-container px (null when inactive).
	const [marquee, setMarquee] = useState<{
		x0: number;
		y0: number;
		x1: number;
		y1: number;
	} | null>(null);
	const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
	const [editingTextId, setEditingTextId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");
	const [draftText, setDraftText] = useState<{
		x: number;
		y: number;
		width: number;
	} | null>(null);
	// Drag/resize bookkeeping for text boxes (mirrors the note pattern).
	const [draggedTextId, setDraggedTextId] = useState<string | null>(null);
	const [resizingTextId, setResizingTextId] = useState<string | null>(null);
	const [isResizingText, setIsResizingText] = useState(false);

	const fetchTexts = useCallback(async () => {
		try {
			const { data } = await api.get("/canvas/texts");
			if (Array.isArray(data)) setTexts(data);
		} catch (error) {
			console.error("Failed to fetch texts", error);
		}
	}, []);

	// Fetch notes on mount
	useEffect(() => {
		fetchNotes();
		fetchStrokes();
		fetchTexts();
	}, [fetchStrokes, fetchTexts]);

	// Open the editor for a saved text box, prefilled with its content.
	const startTextEdit = useCallback(
		(id: string) => {
			const t = textsRef.current.find((x) => x._id === id);
			if (!t) return;
			setSelectedTextIds([id]);
			setEditValue(t.text);
			setEditingTextId(id);
		},
		[],
	);

	// Commit the editor: empty text removes the box (drafts vanish without
	// a server call), otherwise POST for drafts / PUT for saved boxes.
	const commitTextEdit = useCallback(async () => {
		const value = editValue;
		const editingId = editingTextId;
		const draft = draftText;
		setEditingTextId(null);
		setDraftText(null);
		const trimmed = value.trim();
		if (!trimmed) {
			if (editingId) {
				const id = editingId;
				setTexts((prev) => prev.filter((t) => t._id !== id));
				setSelectedTextIds((prev) => prev.filter((x) => x !== id));
				try {
					await api.delete(`/canvas/texts/${id}`);
				} catch (error) {
					console.error("Failed to delete text", error);
				}
			}
			return;
		}
		if (draft && !editingId) {
			const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
			setTexts((prev) => [
				...prev,
				{ _id: tempId, x: draft.x, y: draft.y, width: draft.width, text: trimmed, fontSize: TEXT_DEFAULT_FONT, align: "left" },
			]);
			setSelectedTextIds([tempId]);
			// Done typing → hand the user the Select tool with the new box selected.
			setSelectedTool("select");
			try {
				const { data } = await api.post("/canvas/texts", {
					x: draft.x,
					y: draft.y,
					width: draft.width,
					text: trimmed,
					fontSize: TEXT_DEFAULT_FONT,
					align: "left",
				});
				setTexts((prev) => prev.map((t) => (t._id === tempId ? data : t)));
				setSelectedTextIds([data._id]);
			} catch (error) {
				console.error("Failed to save text", error);
				setTexts((prev) => prev.filter((t) => t._id !== tempId));
				toast.error("Failed to save text");
			}
			return;
		}
		if (editingId) {
			const id = editingId;
			const prevText = textsRef.current.find((t) => t._id === id)?.text;
			if (prevText === trimmed) return;
			setTexts((prev) => prev.map((t) => (t._id === id ? { ...t, text: trimmed } : t)));
			// Done typing → hand the user the Select tool with the box selected.
			setSelectedTool("select");
			try {
				await api.put(`/canvas/texts/${id}`, { text: trimmed });
			} catch (error) {
				console.error("Failed to save text", error);
				toast.error("Failed to save text");
			}
		}
	}, [editValue, editingTextId, draftText]);

	// Abandon the editor: drafts vanish, saved boxes keep their old text.
	const cancelTextEdit = useCallback(() => {
		setEditingTextId(null);
		setDraftText(null);
	}, []);

	// Leaving the Text tool with an empty, uncommitted draft must not strand
	// the blinking caret on the board — discard it. Runs only on actual tool
	// transitions (tracked via ref), never while typing or clearing text.
	const prevToolRef = useRef<CanvasTool>(selectedTool);
	useEffect(() => {
		if (prevToolRef.current !== selectedTool) {
			prevToolRef.current = selectedTool;
			if (selectedTool !== "text" && draftText && editValue.trim() === "") {
				setDraftText(null);
			}
		}
	}, [selectedTool, draftText, editValue]);

	// Change a text box's alignment (optimistic, persisted).
	const updateTextAlign = useCallback(async (id: string, align: TextAlign) => {
		setTexts((prev) => prev.map((t) => (t._id === id ? { ...t, align } : t)));
		if (id.startsWith("temp-")) return;
		try {
			await api.put(`/canvas/texts/${id}`, { align });
		} catch (error) {
			console.error("Failed to save text alignment", error);
			toast.error("Failed to save alignment");
		}
	}, []);

	// Delete a text box (Delete key while selected).
	const deleteText = useCallback(
		async (id: string) => {
			setTexts((prev) => prev.filter((t) => t._id !== id));
			setSelectedTextIds((prev) => prev.filter((x) => x !== id));
			if (editingTextId === id) setEditingTextId(null);
			if (id.startsWith("temp-")) return;
			try {
				await api.delete(`/canvas/texts/${id}`);
			} catch (error) {
				console.error("Failed to delete text", error);
				toast.error("Failed to delete text");
			}
		},
		[editingTextId],
	);

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

	// Persist a finished freehand stroke (optimistic add, swap in the real id).
	const commitStroke = useCallback(
		async (
			points: { x: number; y: number }[],
			color: string,
			width: number,
		) => {
			if (points.length === 0) return;
			const payload = {
				points: points.slice(0, MAX_STROKE_POINTS),
				color,
				width,
			};
			const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
			setStrokes((prev) => [...prev, { _id: tempId, ...payload }]);
			try {
				const { data } = await api.post("/canvas/strokes", payload);
				setStrokes((prev) =>
					prev.map((s) => (s._id === tempId ? data : s)),
				);
			} catch (error) {
				console.error("Failed to save stroke", error);
				setStrokes((prev) => prev.filter((s) => s._id !== tempId));
				toast.error("Failed to save drawing");
			}
		},
		[],
	);

	// Delete every stroke touching point p (eraser). Optimistic remove;
	// refetch on failure so a failed delete can't silently lose ink.
	const eraseAt = useCallback(
		(p: { x: number; y: number }) => {
			const hit = new Set<string>();
			for (const s of strokesRef.current) {
				const r = s.width / 2 + 8;
				const pts = s.points;
				for (let i = 0; i < pts.length; i++) {
					const a = pts[i];
					const b = pts[Math.min(i + 1, pts.length - 1)];
					if (pointSegDist(p, a, b) <= r) {
						hit.add(s._id);
						break;
					}
				}
			}
			if (hit.size === 0) return;
			setStrokes((prev) => prev.filter((s) => !hit.has(s._id)));
			hit.forEach((id) => {
				if (id.startsWith("temp-")) return;
				api.delete(`/canvas/strokes/${id}`).catch(() => fetchStrokes());
			});
		},
		[fetchStrokes],
	);

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

	// Begin a brush/eraser gesture. Returns false when the press belongs to
	// a note or UI control so notes keep working under draw tools.
	const beginDrawAt = (
		clientX: number,
		clientY: number,
		target: EventTarget | null,
	) => {
		if (
			(target as HTMLElement | null)?.closest?.(
				"button, input, select, textarea, a, .canvas-note, .canvas-text, [contenteditable='true']",
			)
		) {
			return false;
		}
		const p = screenToCanvas(clientX, clientY);
		// Don't let keystrokes leak into a focused note editor mid-stroke.
		(document.activeElement as HTMLElement | null)?.blur?.();
		if (selectedTool === "brush") {
			drawRef.current = {
				active: true,
				mode: "brush",
				color: brushColor,
				width: brushWidth,
				points: [p],
			};
			setLiveStroke({ points: [p], color: brushColor, width: brushWidth });
		} else {
			drawRef.current = {
				active: true,
				mode: "erase",
				color: "",
				width: 0,
				points: [],
			};
			eraseAt(p);
		}
		setDrawingActive(true);
		mousePosRef.current = { x: clientX, y: clientY };
		return true;
	};

	// Extend the active gesture with the latest pointer position.
	const appendDrawAt = (clientX: number, clientY: number) => {
		const d = drawRef.current;
		if (!d?.active) return;
		const p = screenToCanvas(clientX, clientY);
		if (d.mode === "erase") {
			eraseAt(p);
			return;
		}
		const last = d.points[d.points.length - 1];
		if (Math.hypot(p.x - last.x, p.y - last.y) < MIN_POINT_GAP) return;
		d.points.push(p);
		if (d.points.length > MAX_STROKE_POINTS) {
			d.points.splice(0, d.points.length - MAX_STROKE_POINTS);
		}
		setLiveStroke({ points: [...d.points], color: d.color, width: d.width });
	};

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

		// Brush/eraser claims empty-board presses; notes and UI keep theirs.
		if (selectedTool === "brush" || selectedTool === "eraser") {
			beginDrawAt(e.clientX, e.clientY, e.target);
			return;
		}

		// Text tool drops a draft on empty board; notes/text/UI keep theirs.
		if (selectedTool === "text" && e.button === 0) {
			// Critical: block the mousedown default focus shift. Without this
			// the browser yanks focus back to <body> right after the draft's
			// autofocused editor mounts, its blur-commit fires on the empty
			// value, and the draft is wiped within the same click.
			e.preventDefault();
			const el = e.target as HTMLElement | null;
			if (
				el?.closest?.(
					"button, input, select, textarea, a, .canvas-note, .canvas-text, [contenteditable='true']",
				)
			)
				return;
			const p = screenToCanvas(e.clientX, e.clientY);
			(document.activeElement as HTMLElement | null)?.blur?.();
			cancelTextEdit();
			setSelectedTextIds([]);
			setEditValue("");
			setDraftText({ x: p.x, y: p.y, width: TEXT_DEFAULT_WIDTH });
			return;
		}

		// Select mode: background presses clear the text selection and arm
		// the marquee (notes/text stop propagation, UI is guarded out, so a
		// drag from here is always empty-board rubber-banding).
		if (selectedTool === "select") {
			setSelectedTextIds([]);
			const el = e.target as HTMLElement | null;
			if (
				!el?.closest?.(
					"button, input, select, textarea, a, [contenteditable='true']",
				)
			) {
				const rect = containerRef.current?.getBoundingClientRect();
				if (rect) {
					marqueeStartRef.current = {
						x: e.clientX - rect.left,
						y: e.clientY - rect.top,
					};
				}
			}
		}

		mousePosRef.current = { x: e.clientX, y: e.clientY };
		startMousePosRef.current = { x: e.clientX, y: e.clientY };
	};

	// Grow the rubber band; returns true while marqueeing.
	const updateMarquee = (clientX: number, clientY: number) => {
		const start = marqueeStartRef.current;
		if (!start || selectedTool !== "select") return false;
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return false;
		const x = clientX - rect.left;
		const y = clientY - rect.top;
		if (
			!marquee &&
			Math.hypot(x - start.x, y - start.y) < 4
		) {
			return false;
		}
		setMarquee({ x0: start.x, y0: start.y, x1: x, y1: y });
		return true;
	};

	// Marquee release: select every text box its rectangle touches.
	const finishMarquee = () => {
		const m = marquee;
		marqueeStartRef.current = null;
		if (!m) return false;
		setMarquee(null);
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return true;
		const x0 = Math.min(m.x0, m.x1);
		const x1 = Math.max(m.x0, m.x1);
		const y0 = Math.min(m.y0, m.y1);
		const y1 = Math.max(m.y0, m.y1);
		const hits: string[] = [];
		document.querySelectorAll(".canvas-text").forEach((el) => {
			const r = (el as HTMLElement).getBoundingClientRect();
			const ex0 = r.left - rect.left;
			const ex1 = r.right - rect.left;
			const ey0 = r.top - rect.top;
			const ey1 = r.bottom - rect.top;
			if (ex0 <= x1 && ex1 >= x0 && ey0 <= y1 && ey1 >= y0) {
				const id = (el as HTMLElement).getAttribute("data-text-id");
				if (id) hits.push(id);
			}
		});
		setSelectedTextIds(hits);
		return true;
	};

	// Double-click a text box (Select tool) to edit its content.
	const handleBoardDoubleClick = (e: React.MouseEvent) => {
		if (selectedTool !== "select") return;
		const el = (e.target as HTMLElement | null)?.closest?.(
			".canvas-text",
		) as HTMLElement | null;
		const id = el?.getAttribute("data-text-id");
		if (id) startTextEdit(id);
	};

	/**
	 * Handles fluid interactions like canvas panning, note dragging, and note resizing
	 * by comparing the current cursor offset against the initial mousedown position
	 * scaled by the current zoom level.
	 */
	const handleMouseMove = (e: React.MouseEvent) => {
		// Active brush/eraser gesture owns the pointer until pointer-up.
		if (drawRef.current?.active) {
			appendDrawAt(e.clientX, e.clientY);
			return;
		}
		// Marquee rubber-banding owns empty-board drags in Select mode.
		if (
			marqueeStartRef.current &&
			!draggedNoteId &&
			!draggedTextId &&
			!isResizing &&
			!isResizingText
		) {
			if (updateMarquee(e.clientX, e.clientY)) return;
		}
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
		} else if (draggedTextId) {
			// Text drag mirrors note drag: threshold first, then follow.
			if (!isDraggingNode) {
				const moveDist = Math.sqrt(
					Math.pow(e.clientX - startMousePosRef.current.x, 2) +
						Math.pow(e.clientY - startMousePosRef.current.y, 2),
				);
				if (moveDist > 3) {
					setIsDraggingNode(true);
					(
						document.activeElement as HTMLElement | null
					)?.blur?.();
				}
				return;
			}

			const dx = (e.clientX - mousePosRef.current.x) / scaleRef.current;
			const dy = (e.clientY - mousePosRef.current.y) / scaleRef.current;
			// Dragging a selected member moves the whole marquee group.
			const sel = selectedTextIdsRef.current;
			const moveIds =
				sel.includes(draggedTextId) && sel.length > 0 ? sel : [draggedTextId];
			moveTextIdsRef.current = moveIds;
			setTexts((prev) =>
				prev.map((t) =>
					moveIds.includes(t._id)
						? { ...t, x: t.x + dx, y: t.y + dy }
						: t,
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
		} else if (isResizingText && resizingTextId) {
			// Corner drag scales the whole box (width + font) from the grab snapshot.
			applyTextScale(textScaleFactor(e.clientX, e.clientY), resizingTextId);
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

			// Single-finger draw/erase with brush tools (two fingers still pan/zoom).
			if (selectedTool === "brush" || selectedTool === "eraser") {
				beginDrawAt(touch.clientX, touch.clientY, e.target);
				return;
			}

			// Single tap with the text tool drops a draft (notes/UI keep theirs).
			if (selectedTool === "text") {
				const el = e.target as HTMLElement | null;
				if (
					!el?.closest?.(
						"button, input, select, textarea, a, .canvas-note, .canvas-text, [contenteditable='true']",
					)
				) {
					const p = screenToCanvas(touch.clientX, touch.clientY);
					(document.activeElement as HTMLElement | null)?.blur?.();
					cancelTextEdit();
					setSelectedTextIds([]);
					setEditValue("");
					setDraftText({ x: p.x, y: p.y, width: TEXT_DEFAULT_WIDTH });
				}
				return;
			}

			// Select mode: clear selections and arm the marquee (notes/text
			// stop propagation, UI is guarded out, so a drag from here is
			// empty-board rubber-banding).
			if (selectedTool === "select") {
				setSelectedTextIds([]);
				const el = e.target as HTMLElement | null;
				if (
					!el?.closest?.(
						"button, input, select, textarea, a, [contenteditable='true']",
					)
				) {
					const rect = containerRef.current?.getBoundingClientRect();
					if (rect) {
						marqueeStartRef.current = {
							x: touch.clientX - rect.left,
							y: touch.clientY - rect.top,
						};
					}
				}
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

		// Active brush/eraser gesture owns the touch until touch-end.
		if (drawRef.current?.active) {
			appendDrawAt(touch.clientX, touch.clientY);
			return;
		}

		// Marquee rubber-banding owns empty-board drags in Select mode.
		if (
			marqueeStartRef.current &&
			!draggedNoteId &&
			!draggedTextId &&
			!isResizing &&
			!isResizingText
		) {
			if (updateMarquee(touch.clientX, touch.clientY)) return;
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
			return;
		}

		if (draggedTextId) {
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

			// Dragging a selected member moves the whole marquee group.
			const sel = selectedTextIdsRef.current;
			const moveIds =
				sel.includes(draggedTextId) && sel.length > 0 ? sel : [draggedTextId];
			moveTextIdsRef.current = moveIds;
			setTexts((prev) =>
				prev.map((t) =>
					moveIds.includes(t._id)
						? { ...t, x: t.x + dx, y: t.y + dy }
						: t,
				),
			);

			mousePosRef.current = {
				x: touch.clientX,
				y: touch.clientY,
			};

			return;
		}

		if (isResizingText && resizingTextId) {
			// Corner drag scales the whole box (width + font) from the grab snapshot.
			applyTextScale(textScaleFactor(touch.clientX, touch.clientY), resizingTextId);
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

	// Spacebar-hold temporary pan (Figma-style): holding Space switches to
	// pan, releasing it restores whatever tool was active. Refs (not state)
	// so press/release pairs stay correct across re-renders.
	const spacePrevTool = useRef<CanvasTool | null>(null);
	const restoreAfterSpace = useCallback(() => {
		if (spacePrevTool.current === null) return;
		const prev = spacePrevTool.current;
		spacePrevTool.current = null;
		// Only restore if the user didn't pick another tool mid-hold.
		setSelectedTool((cur) => (cur === "pan" ? prev : cur));
	}, []);

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

			// Hold Space for temporary pan; keyup (or window blur) restores.
			if (e.code === "Space" && !e.repeat) {
				e.preventDefault();
				if (spacePrevTool.current === null && selectedTool !== "pan") {
					spacePrevTool.current = selectedTool;
					setSelectedTool("pan");
				}
				return;
			}

			if (e.key === "v" || e.key === "V") setSelectedTool("select");
			if (e.key === "h" || e.key === "H") setSelectedTool("pan");
			if (e.key === "b" || e.key === "B") setSelectedTool("brush");
			if (e.key === "e" || e.key === "E") setSelectedTool("eraser");
			if (e.key === "t" || e.key === "T") setSelectedTool("text");

			// Delete selected text boxes (only with Select tool, never mid-edit).
			if (
				(e.key === "Delete" || e.key === "Backspace") &&
				selectedTool === "select" &&
				selectedTextIds.length > 0 &&
				!editingTextId
			) {
				e.preventDefault();
				selectedTextIds.forEach((id) => deleteText(id));
			}

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
		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.code === "Space") {
				e.preventDefault();
				restoreAfterSpace();
			}
		};
		// Losing the window mid-hold (Alt+Tab) must not strand the pan tool.
		const handleBlur = () => restoreAfterSpace();
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		window.addEventListener("blur", handleBlur);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
			window.removeEventListener("blur", handleBlur);
		};
	}, [zoomTowards, selectedTool, selectedTextIds, editingTextId, deleteText, restoreAfterSpace]);

	/**
	 * Completes dragging or resizing interactions and saves updated note properties
	 * (position or dimensions) asynchronously to the backend database.
	 */
	const handleMouseUp = useCallback(async () => {
		// Commit any in-progress brush stroke (eraser already applied live).
		if (drawRef.current?.active) {
			const d = drawRef.current;
			drawRef.current = null;
			setDrawingActive(false);
			setLiveStroke(null);
			if (d.mode === "brush") commitStroke(d.points, d.color, d.width);
		}
		// Marquee release selects every touched text box (clears the arm too).
		finishMarquee();
		const wasInteracting = isDraggingNode || isResizing;
		const targetId = draggedNoteId || resizingNoteId;
		const wasTextInteracting =
			(isDraggingNode && draggedTextId) || (isResizingText && resizingTextId);
		const textTargetIds =
			moveTextIdsRef.current.length > 0
				? moveTextIdsRef.current
				: draggedTextId || resizingTextId
					? [draggedTextId || resizingTextId as string]
					: [];
		moveTextIdsRef.current = [];

		// Finalize any in-progress connection drag (no-op if not linking).
		completeLink();

		// Immediately disable flags to kill the "buttery" effect and snap state
		setIsDraggingNode(false);
		setIsPanning(false);
		setIsResizing(false);
		setIsResizingText(false);
		setDraggedNoteId(null);
		setResizingNoteId(null);
		setDraggedTextId(null);
		setResizingTextId(null);

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

		if (wasTextInteracting && textTargetIds.length > 0) {
			await Promise.all(
				textTargetIds
					.filter((id) => !id.startsWith("temp-"))
					.map(async (id) => {
						const t = textsRef.current.find((x) => x._id === id);
						if (!t) return;
						try {
							await api.put(`/canvas/texts/${id}`, {
								x: t.x,
								y: t.y,
								width: t.width,
								fontSize: t.fontSize,
							});
						} catch (error) {
							console.error("Failed to save text properties", error);
						}
					}),
			);
		}

	}, [
		isDraggingNode,
		isResizing,
		draggedNoteId,
		resizingNoteId,
		draggedTextId,
		resizingTextId,
		isResizingText,
		completeLink,
		commitStroke,
		marquee,
	]);

	useEffect(() => {
		// Only register global listeners when actively dragging/resizing/panning/linking/drawing/marqueeing,
		// so an off-window release still finalizes (a stuck marquee would linger otherwise).
		if (!isDraggingNode && !isResizing && !isResizingText && !isPanning && !isLinking && !drawingActive && !marquee) return;
		window.addEventListener("mouseup", handleMouseUp);
		window.addEventListener("touchend", handleMouseUp);
		return () => {
			window.removeEventListener("mouseup", handleMouseUp);
			window.removeEventListener("touchend", handleMouseUp);
		};
	}, [handleMouseUp, isDraggingNode, isResizing, isResizingText, isPanning, isLinking, drawingActive, marquee]);

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

	// Two-step clear-board confirmation (resets if abandoned). The armed
	// confirm lasts 3s — enough for a deliberate second click, short enough
	// that a stray first click doesn't leave the red state lingering.
	const [clearStep, setClearStep] = useState<0 | 1 | 2>(0);
	const clearTimer = useRef<number | null>(null);
	// ── Board-clear wipe animation ─────────────────────────────────────
	// UX flow: user confirms clear → a light band sweeps across the board
	// while notes fade out → the DELETE request commits once the sweep
	// finishes. Server state is untouched until then, so a failed request
	// simply fades the board back in instead of losing notes.
	// Timing: WIPE_MS must stay slightly above both the sweep (0.65s in
	// .canvas-wipe-bar) and the fade (0.55s on the transform container)
	// defined in index.css, otherwise the board would vanish mid-sweep.
	const [wiping, setWiping] = useState(false);
	const wipeTimer = useRef<number | null>(null);
	const WIPE_MS = 680;
	const armClearReset = () => {
		if (clearTimer.current) clearTimeout(clearTimer.current);
		clearTimer.current = window.setTimeout(() => {
			clearTimer.current = null;
			setClearStep(0);
		}, 3000);
	};

	const handleClearBoard = async () => {
		if ((notes.length === 0 && strokes.length === 0 && texts.length === 0) || wiping) return;
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
		// Start the wipe; the delete commits inside the timer below so the
		// user sees the full sweep before notes disappear for good.
		setWiping(true);
		wipeTimer.current = window.setTimeout(async () => {
			wipeTimer.current = null;
			try {
				await api.delete("/canvas");
				try {
					await api.delete("/canvas/strokes");
				} catch (strokeError) {
					console.error("Failed to clear strokes", strokeError);
				}
				try {
					await api.delete("/canvas/texts");
				} catch (textError) {
					console.error("Failed to clear texts", textError);
				}
				editorsRef.current.clear();
				pendingSavesRef.current = {};
				pendingContentRef.current = {};
				setNotes([]);
				setStrokes([]);
				setTexts([]);
				setSelectedTextIds([]);
				setEditingTextId(null);
				setDraftText(null);
				setLiveStroke(null);
				setNoteHeights({});
				setSaveStatus({});
				setFocusedNoteId(null);
				setAutoFocusId(null);
				toast.success("Board cleared");
			} catch (error) {
				console.error("Failed to clear board", error);
				toast.error("Failed to clear board");
			} finally {
				setWiping(false);
			}
		}, WIPE_MS);
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
			if (wipeTimer.current) {
				clearTimeout(wipeTimer.current);
				wipeTimer.current = null;
			}
			flushSave();
		};
	}, [flushSave]);

	const resetView = () => {
		setScale(1);
		setOffset({ x: 0, y: 0 });
	};

	// Zoom-wheel hover grows the whole assembly: the crop box and the inner
	// dial share one state + duration, so the orbs ride left smoothly as the
	// box widens (flex reflows every animation frame).
	const [wheelHovered, setWheelHovered] = useState(false);

	// Zoom around the viewport center (used by the zoom wheel dial).
	const zoomAtCenter = useCallback(
		(next: number) => {
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			zoomTowards(next, rect.width / 2, rect.height / 2);
		},
		[zoomTowards],
	);

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

	// Text boxes only respond to the Select tool. Presses inside the inline
	// editor or the mini toolbar stay local so typing never starts a drag.
	const handleTextMouseDown = useCallback(
		(e: React.MouseEvent, id: string) => {
			if (selectedTool !== "select") return;
			if ((e.target as HTMLElement | null)?.closest?.("textarea, input, button")) return;
			e.stopPropagation();
			if (isLinking) return;
			// Preserve a marquee group when grabbing one of its members so the
			// whole group moves; otherwise select just this box.
			setSelectedTextIds((prev) => (prev.includes(id) ? prev : [id]));
			setDraggedTextId(id);
			mousePosRef.current = { x: e.clientX, y: e.clientY };
			startMousePosRef.current = { x: e.clientX, y: e.clientY };
		},
		[selectedTool, isLinking],
	);

	const handleTextTouchStart = useCallback(
		(e: React.TouchEvent, id: string) => {
			if (e.touches.length !== 1) return;
			if (selectedTool !== "select") return;
			if ((e.target as HTMLElement | null)?.closest?.("textarea, input, button")) return;
			e.stopPropagation();
			if (isLinking) return;
			const touch = e.touches[0];
			touchMovedRef.current = false;
			setSelectedTextIds((prev) => (prev.includes(id) ? prev : [id]));
			setDraggedTextId(id);
			mousePosRef.current = { x: touch.clientX, y: touch.clientY };
			startMousePosRef.current = {
				x: touch.clientX,
				y: touch.clientY,
			};
		},
		[selectedTool, isLinking],
	);

	// Grab snapshot for proportional text scaling (box + font grow together).
	// sx/sy orient the handle: pulling outward grows (bottom-right drags
	// down-right to enlarge).
	const textResizeStartRef = useRef<{
		width: number;
		fontSize: number;
		sx: number;
		sy: number;
	} | null>(null);

	// Single bottom-left handle: drags scale width and font size together
	// from the grab snapshot (dominant drag axis wins).
	const handleTextResizeStart = useCallback(
		(clientX: number, clientY: number, id: string, sx = 1, sy = 1) => {
			const t = textsRef.current.find((x) => x._id === id);
			textResizeStartRef.current = {
				width: t?.width ?? TEXT_DEFAULT_WIDTH,
				fontSize: t?.fontSize || TEXT_DEFAULT_FONT,
				sx,
				sy,
			};
			setSelectedTextIds((prev) => (prev.includes(id) ? prev : [id]));
			setResizingTextId(id);
			setIsResizingText(true);
			mousePosRef.current = { x: clientX, y: clientY };
		},
		[],
	);

	// Scale factor from a corner drag: dominant axis over grab width,
	// clamped so neither width nor font size can leave its bounds.
	const textScaleFactor = (clientX: number, clientY: number) => {
		const snap = textResizeStartRef.current;
		if (!snap) return 1;
		const dx = (clientX - mousePosRef.current.x) / scaleRef.current;
		const dy = (clientY - mousePosRef.current.y) / scaleRef.current;
		// Orient deltas so outward pulls are positive for this handle.
		const hx = (snap.sx ?? 1) * dx;
		const hy = (snap.sy ?? 1) * dy;
		const delta = Math.abs(hx) >= Math.abs(hy) ? hx : hy;
		const k = (snap.width + delta) / snap.width;
		return Math.min(
			Math.max(
				k,
				TEXT_MIN_WIDTH / snap.width,
				TEXT_MIN_FONT / snap.fontSize,
				0.1,
			),
			TEXT_MAX_WIDTH / snap.width,
			TEXT_MAX_FONT / snap.fontSize,
		);
	};

	const applyTextScale = (k: number, id: string) => {
		const snap = textResizeStartRef.current;
		if (!snap) return;
		const width = snap.width * k;
		const fontSize = Math.round(snap.fontSize * k * 10) / 10;
		setTexts((prev) =>
			prev.map((t) => (t._id === id ? { ...t, width, fontSize } : t)),
		);
	};

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
				position: "absolute",
				inset: 0,
				zIndex: 10,
				background: "var(--color-bg)",
				cursor: isPanning
					? "grabbing"
					: isLinking
						? "crosshair"
						: selectedTool === "brush"
							? "crosshair"
							: selectedTool === "eraser"
								? ERASER_CURSOR
								: selectedTool === "text"
								? "text"
								: selectedTool === "pan"
									? "grab"
									: "auto",
			}}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onDoubleClick={handleBoardDoubleClick}
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

			{/* Transform Container (notes + connection lines live here).
			    During a wipe it fades out via opacity only — transform is left
			    alone so pan/zoom position is preserved if the clear fails. */}
			<div
				ref={canvasRef}
				className="absolute origin-top-left will-change-transform"
				style={{
					transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
					//   transition: isPanning ? "none" : "transform 0.05s linear",
					transition:
						wiping
							? "opacity 0.55s ease" // keep in sync with WIPE_MS above
							: isPanning || isDraggingNode || isResizing || isResizingText
								? "none"
								: "transform 0.05s linear",
					opacity: wiping ? 0 : 1,
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
				{/* Freehand ink layer (above notes, never intercepts pointer input) */}
				{(strokes.length > 0 || liveStroke) && (
					<svg
						className="pointer-events-none absolute overflow-visible"
						style={{ left: 0, top: 0, width: 8, height: 8, zIndex: 0 }}
						aria-hidden
					>
						{strokes.map((s) => (
							<path
								key={s._id}
								d={strokePath(s.points)}
								fill="none"
								stroke={s.color}
								strokeWidth={s.width}
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						))}
						{liveStroke && liveStroke.points.length > 0 && (
							<path
								d={strokePath(liveStroke.points)}
								fill="none"
								stroke={liveStroke.color}
								strokeWidth={liveStroke.width}
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						)}
					</svg>
				)}
				{/* Text boxes (above ink; Select moves/resizes, double-click edits).
				    Fixed z 1000 like other board chrome so text stays above notes. */}
				{texts.map((t) => {
					const isSelected = selectedTextIds.includes(t._id);
					const isEditing = editingTextId === t._id;
					return (
						<div
							key={t._id}
							data-text-id={t._id}
							className="canvas-text"
							onMouseDown={(e) => handleTextMouseDown(e, t._id)}
							onTouchStart={(e) => handleTextTouchStart(e, t._id)}
							onDoubleClick={() => {
								if (selectedTool === "select") startTextEdit(t._id);
							}}
							style={{
								position: "absolute",
								left: t.x,
								top: t.y,
								// Hug the text when just viewing; fixed width while
								// editing so there is room to type. max-content is
								// intrinsic (ignores the zero-size transformed
								// ancestor), unlike auto shrink-wrap which collapses
								// to one character per line. Stored width caps wrapping.
								display: isEditing ? "block" : "inline-block",
								width: isEditing ? t.width : "max-content",
								maxWidth: isEditing ? undefined : t.width,
								zIndex: 1000,
								padding: 8,
								borderRadius: 0,
								fontSize: t.fontSize || TEXT_DEFAULT_FONT,
								fontWeight: 500,
								lineHeight: 1.5,
								textAlign: t.align || "left",
								color: "var(--color-text)",
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
								outline: isSelected
									? "1.5px solid var(--color-primary)"
									: "1px solid transparent",
								background: isSelected
									? "color-mix(in srgb, var(--color-primary) 6%, transparent)"
									: "transparent",
								cursor: selectedTool === "select" ? "move" : "default",
							}}
						>
							{isEditing ? (
								<TextBoxEditor
									value={editValue}
									onChange={setEditValue}
									onCommit={commitTextEdit}
									onCancel={cancelTextEdit}
								/>
							) : t.text ? (
								<>{t.text}</>
							) : (
								<span style={{ opacity: 0.4 }}>
									Empty text — double-click to edit
								</span>
							)}
							{isSelected && !isEditing && (
								<>
									<div
										style={{
											position: "absolute",
											top: -34,
											right: 0,
											display: "flex",
											gap: 4,
											background: "var(--color-surface)",
											border: "1px solid var(--color-border)",
											borderRadius: 999,
											padding: 3,
											boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
										}}
										onMouseDown={(e) => e.stopPropagation()}
										onTouchStart={(e) => e.stopPropagation()}
									>
										{TEXT_ALIGNMENTS.map(({ value, Icon, label }) => {
											const active = (t.align || "left") === value;
											return (
												<button
													key={value}
													onClick={() => updateTextAlign(t._id, value)}
													title={label}
													style={{
														border: "none",
														cursor: "pointer",
														display: "flex",
														padding: 4,
														borderRadius: 6,
														background: active
															? "var(--color-primary-light)"
															: "none",
														color: active
															? "var(--color-primary)"
															: "var(--color-text-secondary)",
													}}
												>
													<Icon size={13} />
												</button>
											);
										})}
										<div
											style={{
												width: 1,
												alignSelf: "stretch",
												background: "var(--color-border)",
												margin: "2px 0",
											}}
										/>
										<button
											onClick={() => deleteText(t._id)}
											title="Delete text"
											style={{
												border: "none",
												background: "none",
												cursor: "pointer",
												color: "var(--color-error)",
												display: "flex",
												padding: 4,
											}}
										>
											<Trash2 size={13} />
										</button>
									</div>
									<div
										title="Resize text"
										onMouseDown={(e) => {
											e.stopPropagation();
											handleTextResizeStart(e.clientX, e.clientY, t._id, 1, 1);
										}}
										onTouchStart={(e) => {
											if (e.touches.length !== 1) return;
											e.stopPropagation();
											const touch = e.touches[0];
											handleTextResizeStart(touch.clientX, touch.clientY, t._id, 1, 1);
										}}
										style={{
											position: "absolute",
											right: -7,
											bottom: -7,
											width: 13,
											height: 13,
											borderRadius: 0,
											background: "var(--color-primary)",
											border: "2px solid #fff",
											cursor: "nwse-resize",
											boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
										}}
									/>
								</>
							)}
						</div>
					);
				})}
				{draftText && (
					// Draft while typing: deliberately chromeless — no box, no
					// placeholder. While still empty, a blinking caret block
					// marks the spot so the draft is findable on the grid.
					<div
						className="canvas-text"
						style={{
							position: "absolute",
							left: draftText.x,
							top: draftText.y,
							width: draftText.width,
							zIndex: 1000,
							padding: 8,
							borderRadius: 8,
							fontSize: 15,
							fontWeight: 500,
							lineHeight: 1.5,
							color: "var(--color-text)",
							outline: "none",
							background: "transparent",
						}}
					>
						{editValue === "" && (
							<span
								className="canvas-draft-caret"
								aria-hidden
								style={{ position: "absolute", left: 8, top: 8 }}
							/>
						)}
						<TextBoxEditor
							value={editValue}
							onChange={setEditValue}
							onCommit={commitTextEdit}
							onCancel={cancelTextEdit}
						/>
					</div>
				)}
			</div>

			{loading && (
				<div className="absolute inset-0 z-[2000] flex items-center justify-center bg-[rgba(255,255,255,0.1)] backdrop-blur-[2px]">
					<Loader2
						className="animate-spin text-(--color-primary)"
						size={32}
					/>
				</div>
			)}

			{/* Marquee rubber band (Select-tool drag on empty board). z 2000
			    app-overlays band: the transform container scopes inner note
			    layers, so this always paints above notes; ties with loading
			    and wipe overlays, neither of which co-occurs with a drag. */}
			{marquee && (
				<div
					className="pointer-events-none absolute"
					style={{
						left: Math.min(marquee.x0, marquee.x1),
						top: Math.min(marquee.y0, marquee.y1),
						width: Math.abs(marquee.x1 - marquee.x0),
						height: Math.abs(marquee.y1 - marquee.y0),
						zIndex: 2000,
						border: "1px solid var(--color-primary)",
						background:
							"color-mix(in srgb, var(--color-primary) 8%, transparent)",
						borderRadius: 2,
					}}
					aria-hidden
				/>
			)}

			{/* Wipe sweep: light band passes over the fading board on clear.
			    z 2000 (app-overlays band) sits above notes/clear-button —
			    whose note layers grow unbounded — and ties with the loading
			    overlay, which never co-occurs; pointer-events-none so it
			    never steals input. */}
			{wiping && (
				<div
					className="pointer-events-none absolute inset-0 overflow-hidden"
					style={{ zIndex: 2000 }}
					aria-hidden
				>
					<div className="canvas-wipe-bar" />
				</div>
			)}

			{/* Brush settings: colors + width, visible while the brush is active */}
			{selectedTool === "brush" && (
				<div
					className="absolute z-[1000] rounded-xl border border-border bg-surface shadow-lg"
					style={{
						// Sits above the bottom-right zoom wheel cluster.
						bottom: isMobile ? 180 : 210,
						right: isMobile ? 12 : 24,
						padding: 12,
						width: 196,
					}}
				>
					<div
						style={{
							fontSize: "0.7rem",
							fontWeight: 700,
							color: "var(--color-text-tertiary)",
							textTransform: "uppercase",
							letterSpacing: "0.05em",
							marginBottom: 8,
						}}
					>
						Brush
					</div>
					<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
						{BRUSH_COLORS.map((c) => (
							<button
								key={c}
								onClick={() => setBrushColor(c)}
								title={c}
								style={{
									width: 24,
									height: 24,
									borderRadius: "50%",
									background: c,
									border:
										brushColor === c
											? "2px solid var(--color-primary)"
											: "1px solid var(--color-border)",
									cursor: "pointer",
									padding: 0,
								}}
							/>
						))}
						<input
							type="color"
							value={brushColor}
							onChange={(e) => setBrushColor(e.target.value)}
							title="Custom color"
							style={{
								width: 24,
								height: 24,
								padding: 0,
								border: "1px dashed var(--color-border)",
								borderRadius: "50%",
								cursor: "pointer",
								background: "none",
							}}
						/>
					</div>
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						<input
							type="range"
							min={2}
							max={24}
							value={brushWidth}
							onChange={(e) => setBrushWidth(Number(e.target.value))}
							title={`Brush width (${brushWidth}px)`}
							style={{ flex: 1, cursor: "pointer", accentColor: "var(--color-primary)" }}
						/>
						<div
							style={{
								width: 28,
								height: 28,
								borderRadius: "50%",
								background: "var(--color-surface-hover)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								flexShrink: 0,
							}}
						>
							<div
								style={{
									width: Math.min(brushWidth, 22),
									height: Math.min(brushWidth, 22),
									borderRadius: "50%",
									background: brushColor,
								}}
							/>
						</div>
					</div>
				</div>
			)}

			{/* Bottom-right cluster: clear + reset orbs + zoom wheel.
			    The wheel is cropped by the viewport corner like the design. */}
			<div
				className="absolute"
				style={{
					right: 0,
					bottom: 0,
					zIndex: 1000,
					display: "flex",
					alignItems: "flex-end",
				}}
			>
				{(notes.length > 0 || strokes.length > 0 || texts.length > 0) && (
					<div
						className="group"
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							margin: isMobile
								? "0 10px 12px 12px"
								: "0 14px 24px 24px",
						}}
					>
						<span
							className={clearStep > 0 ? undefined : "hidden group-hover:block"}
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								whiteSpace: "nowrap",
								padding: "8px 14px",
								borderRadius: 999,
								background: "var(--color-surface)",
								boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
								...(clearStep === 0
									? {
											border: "1px solid var(--color-border)",
											color: "var(--color-text-secondary)",
										}
									: clearStep === 1
										? {
												border: "1px solid #f59e0b",
												color: "#b45309",
											}
										: {
												border: "1px solid #ef4444",
												color: "#ef4444",
											}),
							}}
						>
							{clearStep === 0
								? "Clear All"
								: clearStep === 1
									? "Sure?"
									: `Really... Clear board?`}
						</span>
						<button
							onClick={handleClearBoard}
							disabled={wiping}
							title={
								clearStep === 0
									? "Delete all notes and drawings"
									: clearStep === 1
										? "Click again to confirm"
										: `Really delete ${notes.length} notes, ${strokes.length} drawings and ${texts.length} texts?`
							}
							style={{
								width: isMobile ? 40 : 44,
								height: isMobile ? 40 : 44,
								borderRadius: "50%",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								background: "var(--color-surface)",
								border: "1px solid var(--color-border)",
								boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
								cursor: "pointer",
								flexShrink: 0,
								...(clearStep === 0
									? { opacity: 0.75, color: "var(--color-text-secondary)" }
									: clearStep === 1
										? {
												border: "1px solid #f59e0b",
												color: "#b45309",
												background: "#fffbeb",
											}
										: {
												background: "#ef4444",
												border: "1px solid #ef4444",
												color: "#fff",
											}),
							}}
						>
							<Trash2 size={18} />
						</button>
					</div>
				)}
				<button
					onClick={resetView}
					title="Reset View"
					style={{
						width: isMobile ? 40 : 44,
						height: isMobile ? 40 : 44,
						borderRadius: "50%",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						background: "var(--color-surface)",
						border: "1px solid var(--color-border)",
						boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
						color: "var(--color-text-secondary)",
						cursor: "pointer",
						margin: isMobile ? "0 10px 12px 0" : "0 14px 24px 0",
					}}
				>
					<RefreshCcw size={18} />
				</button>
				<div
					style={{
						width: wheelHovered
							? isMobile
								? 112
								: 150
							: isMobile
								? 100
								: 135,
						height: wheelHovered
							? isMobile
								? 112
								: 150
							: isMobile
								? 100
								: 135,
						overflow: "hidden",
						position: "relative",
						transition: "width 0.25s ease, height 0.25s ease",
					}}
				>
					<ZoomWheel
						size={isMobile ? 140 : 190}
						scale={scale}
						hovered={wheelHovered}
						onHoverChange={setWheelHovered}
						onZoomAtCenter={zoomAtCenter}
						onReset={resetView}
					/>
				</div>
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
            {/* brush */}
						<button
							onClick={() => setSelectedTool("brush")}
							className={`btn btn-xs ${selectedTool === "brush" ? "btn-primary" : "btn-ghost"}`}
							style={{
								borderRadius: 20,
								width: 36,
								height: 36,
								padding: 0,
							}}
							title="Brush Tool (B)"
						>
							<Brush size={16} />
						</button>
            {/* eraser */}
						<button
							onClick={() => setSelectedTool("eraser")}
							className={`btn btn-xs ${selectedTool === "eraser" ? "btn-primary" : "btn-ghost"}`}
							style={{
								borderRadius: 20,
								width: 36,
								height: 36,
								padding: 0,
							}}
							title="Eraser Tool (E)"
						>
							<Eraser size={16} />
						</button>
            {/* text */}
						<button
							onClick={() => setSelectedTool("text")}
							className={`btn btn-xs ${selectedTool === "text" ? "btn-primary" : "btn-ghost"}`}
							style={{
								borderRadius: 20,
								width: 36,
								height: 36,
								padding: 0,
							}}
							title="Text Tool (T)"
						>
							<Type size={16} />
						</button>
					</div>

					<div className="mx-1 h-6 w-px bg-border" />

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
					connections={connectionLines}
					strokes={strokes}
					texts={texts}
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
