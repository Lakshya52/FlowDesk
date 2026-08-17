import React from 'react';

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
}

const CanvasNavigator: React.FC<CanvasNavigatorProps> = ({
    notes, scale, offset, containerWidth, containerHeight, onOffsetChange
}) => {
    // Navigator settings
    const navWidth = 180;
    const navHeight = 120;
    const padding = 30;

    // Calculate the bounding box of all notes + current viewport
    const viewportX1 = -offset.x / scale;
    const viewportY1 = -offset.y / scale;
    const viewportX2 = (containerWidth - offset.x) / scale;
    const viewportY2 = (containerHeight - offset.y) / scale;

    const allItems = [
        ...notes.map(n => ({ x: n.x, y: n.y, w: n.width || 200, h: n.height || 140 })),
        { x: viewportX1, y: viewportY1, w: viewportX2 - viewportX1, h: viewportY2 - viewportY1 }
    ];

    const minX = Math.min(...allItems.map(i => i.x)) - padding;
    const minY = Math.min(...allItems.map(i => i.y)) - padding;
    const maxX = Math.max(...allItems.map(i => i.x + i.w)) + padding;
    const maxY = Math.max(...allItems.map(i => i.y + i.h)) + padding;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    const fitScale = Math.min(navWidth / contentWidth, navHeight / contentHeight);
    const innerNavWidth = contentWidth * fitScale;
    const innerNavHeight = contentHeight * fitScale;
    const dx = (navWidth - innerNavWidth) / 2;
    const dy = (navHeight - innerNavHeight) / 2;

    const toNavX = (x: number) => (x - minX) * fitScale + dx;
    const toNavY = (y: number) => (y - minY) * fitScale + dy;

    const handleNavigatorInteraction = (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const navX = e.clientX - rect.left;
        const navY = e.clientY - rect.top;

        // Map navigator coordinates back to canvas space
        const targetCanvasX = (navX - dx) / fitScale + minX;
        const targetCanvasY = (navY - dy) / fitScale + minY;

        // Center the viewport on the clicked point
        const newOffsetX = - (targetCanvasX * scale) + containerWidth / 2;
        const newOffsetY = - (targetCanvasY * scale) + containerHeight / 2;

        onOffsetChange({ x: newOffsetX, y: newOffsetY });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        handleNavigatorInteraction(e);

        const onMouseMove = (moveEvent: MouseEvent) => {
            handleNavigatorInteraction(moveEvent as unknown as React.MouseEvent);
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    return (
        <div
            className="absolute bottom-4 left-4 z-1000 select-none"
            style={{ fontFamily: 'Inter, sans-serif' }}
        >
            <div
                className="bg-white/95 backdrop-blur-sm border border-slate-200 shadow-xl rounded-lg overflow-hidden"
                style={{ width: navWidth + 16, height: navHeight + 16 }}
            >
                <div
                    className="relative w-full h-full bg-slate-50 cursor-crosshair"
                    onMouseDown={handleMouseDown}
                    style={{
                        backgroundImage: `radial-gradient(circle at 1px 1px, #cbd5e1 1px, transparent 0)`,
                        backgroundSize: '8px 8px'
                    }}
                >
                    {/* Render Notes */}
                    {notes.map(note => (
                        <div
                            key={note.id || note._id}
                            className="absolute rounded-sm opacity-70 shadow-sm"
                            style={{
                                left: toNavX(note.x),
                                top: toNavY(note.y),
                                width: Math.max(6, (note.width || 200) * fitScale),
                                height: Math.max(4, (note.height || 140) * fitScale),
                                background: note.color,
                                border: '1px solid rgba(0,0,0,0.15)'
                            }}
                        />
                    ))}

                    {/* Render Viewport */}
                    <div
                        className="absolute border-2 border-indigo-500 bg-indigo-500/10 rounded"
                        style={{
                            left: toNavX(viewportX1),
                            top: toNavY(viewportY1),
                            width: (viewportX2 - viewportX1) * fitScale,
                            height: (viewportY2 - viewportY1) * fitScale,
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default CanvasNavigator;
