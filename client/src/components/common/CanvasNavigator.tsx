import React, { useCallback, useRef } from 'react';

interface Note {
    id?: string;
    _id?: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    color: string;
    [key: string]: any;
}

interface CanvasNavigatorProps {
    notes: Note[];
    scale: number;
    offset: { x: number; y: number };
    containerWidth: number;
    containerHeight: number;
    onOffsetChange: (newOffset: { x: number; y: number }) => void;
    /** Override positioning (default: absolute bottom-left of the canvas). */
    className?: string;
    style?: React.CSSProperties;
}

const NAV_WIDTH = 200;
const NAV_HEIGHT = 132;
const PADDING = 40;
const PAN_STEP = 60;

const clamp = (v: number, min: number, max: number) =>
    Math.min(Math.max(v, min), max);

/**
 * Mini-map for the canvas. Always-visible map surface with pointer
 * (mouse + touch) drag and keyboard panning. Fully theme-aware — no
 * hardcoded light-mode colors.
 */
const CanvasNavigator: React.FC<CanvasNavigatorProps> = ({
    notes, scale, offset, containerWidth, containerHeight, onOffsetChange,
    className = '', style,
}) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);

    // Viewport size: prefer the measured container, but fall back to the window
    // so the map never disappears just because measurement hasn't landed yet.
    const vw =
        containerWidth >= 10
            ? containerWidth
            : typeof window !== 'undefined'
              ? window.innerWidth
              : 800;
    const vh =
        containerHeight >= 10
            ? containerHeight
            : typeof window !== 'undefined'
              ? window.innerHeight
              : 600;

    const safeScale = scale > 0 ? scale : 1;
    const viewportX1 = -offset.x / safeScale;
    const viewportY1 = -offset.y / safeScale;
    const viewportX2 = (vw - offset.x) / safeScale;
    const viewportY2 = (vh - offset.y) / safeScale;

    const allItems = [
        ...notes.map(n => ({ x: n.x, y: n.y, w: n.width || 300, h: n.height || 220 })),
        { x: viewportX1, y: viewportY1, w: Math.max(viewportX2 - viewportX1, 1), h: Math.max(viewportY2 - viewportY1, 1) }
    ];

    const minX = Math.min(...allItems.map(i => i.x)) - PADDING;
    const minY = Math.min(...allItems.map(i => i.y)) - PADDING;
    const maxX = Math.max(...allItems.map(i => i.x + i.w)) + PADDING;
    const maxY = Math.max(...allItems.map(i => i.y + i.h)) + PADDING;

    const contentWidth = Math.max(maxX - minX, 1);
    const contentHeight = Math.max(maxY - minY, 1);

    const fitScale = clamp(
        Math.min(NAV_WIDTH / contentWidth, NAV_HEIGHT / contentHeight),
        0.005,
        1.5,
    );
    const dx = (NAV_WIDTH - contentWidth * fitScale) / 2;
    const dy = (NAV_HEIGHT - contentHeight * fitScale) / 2;

    const toNavX = (x: number) => (x - minX) * fitScale + dx;
    const toNavY = (y: number) => (y - minY) * fitScale + dy;

    const centerOnNavPoint = useCallback((clientX: number, clientY: number) => {
        const el = mapRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const navX = clientX - rect.left;
        const navY = clientY - rect.top;

        const targetCanvasX = (navX - dx) / fitScale + minX;
        const targetCanvasY = (navY - dy) / fitScale + minY;

        onOffsetChange({
            x: -(targetCanvasX * safeScale) + vw / 2,
            y: -(targetCanvasY * safeScale) + vh / 2,
        });
    }, [dx, dy, fitScale, minX, minY, safeScale, vw, vh, onOffsetChange]);

    const handlePointerDown = (e: React.PointerEvent) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        draggingRef.current = true;
        centerOnNavPoint(e.clientX, e.clientY);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!draggingRef.current) return;
        centerOnNavPoint(e.clientX, e.clientY);
    };

    const endDrag = () => {
        draggingRef.current = false;
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const step = PAN_STEP;
        let nx = offset.x;
        let ny = offset.y;
        if (e.key === 'ArrowLeft') nx += step;
        else if (e.key === 'ArrowRight') nx -= step;
        else if (e.key === 'ArrowUp') ny += step;
        else if (e.key === 'ArrowDown') ny -= step;
        else return;
        e.preventDefault();
        onOffsetChange({ x: nx, y: ny });
    };

    const viewportW = Math.max((viewportX2 - viewportX1) * fitScale, 8);
    const viewportH = Math.max((viewportY2 - viewportY1) * fitScale, 8);

    return (
        <div
            className={`absolute bottom-5 left-5 z-[900] select-none ${className}`}
            style={{ fontFamily: 'Inter, sans-serif', ...style }}
        >
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
                {/* Map surface: click to jump, drag to pan (mouse + touch) */}
                <div
                    ref={mapRef}
                    role="application"
                    aria-label="Canvas mini-map. Click or drag to move the view. Arrow keys pan when focused."
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    className="relative cursor-grab touch-none outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-primary"
                    style={{
                        width: NAV_WIDTH,
                        height: NAV_HEIGHT,
                        background: 'var(--color-surface)',
                        backgroundImage: `radial-gradient(circle at 1px 1px, var(--color-border-hover) 1px, transparent 0)`,
                        backgroundSize: '10px 10px',
                    }}
                >
                    {notes.map(note => (
                        <div
                            key={note.id || note._id}
                            className="pointer-events-none absolute rounded-[3px] opacity-80 shadow-sm"
                            style={{
                                left: toNavX(note.x),
                                top: toNavY(note.y),
                                width: Math.max(6, (note.width || 300) * fitScale),
                                height: Math.max(4, (note.height || 220) * fitScale),
                                background: note.color,
                                border: '1px solid rgba(0,0,0,0.2)',
                            }}
                        />
                    ))}

                    {/* Viewport window */}
                    <div
                        className="pointer-events-none absolute rounded"
                        style={{
                            left: clamp(toNavX(viewportX1), -viewportW, NAV_WIDTH),
                            top: clamp(toNavY(viewportY1), -viewportH, NAV_HEIGHT),
                            width: viewportW,
                            height: viewportH,
                            border: '2px solid var(--color-primary)',
                            background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                            boxShadow: '0 1px 6px rgba(0,0,0,0.2)',
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default CanvasNavigator;
