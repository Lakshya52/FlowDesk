/**
 * ProjectCanvas Component
 *
 * An interactive collaborative whiteboard for projects. Features infinite panning,
 * zoom functionality, and draggable/resizable sticky notes. Changes are synced 
 * up to the server to persist collaboration. Tracks note authorship and edit history.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
    RefreshCcw,
    Expand,
    Plus,
    Minus,
    // Maximize, 
    Trash2, 
    Move, 
    Shrink, 
    // Focus, 
    MousePointer2, Hand, X
} from "lucide-react";
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import Avatar from '@/shared/components/Avatar';
import CanvasNavigator from '@/shared/components/CanvasNavigator';
import RichTextEditor from '@/shared/components/RichTextEditor';
import NoteExportMenu from '@/shared/components/NoteExportMenu';

interface Note {
    id: string; // Internal temporary ID or from server
    _id?: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    content: string;
    color: string;
    createdBy?: {
        _id: string;
        name: string;
        avatar?: string;
    };
    editedBy?: {
        _id: string;
        name: string;
        avatar?: string;
    }[];
}

const COLORS = ["#fef9c3", "#dcfce7", "#dbeafe", "#f3e8ff", "#fee2e2"];

interface ProjectCanvasProps {
    assignmentId: string;
    initialData?: any;
    startFullScreen?: boolean;
    onExitFullScreen?: () => void;
}

const ProjectCanvas: React.FC<ProjectCanvasProps> = ({ assignmentId, initialData, startFullScreen = false, onExitFullScreen }) => {
    const { user } = useAuthStore();
    const [notes, setNotes] = useState<Note[]>(initialData || []);

    // Canvas Transformation State
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });

    // Interaction Flags
    const [isPanning, setIsPanning] = useState(false);
    const [isDraggingNode, setIsDraggingNode] = useState(false);
    const [isResizing, setIsResizing] = useState(false);

    // Active Element References
    const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
    const [resizingNoteId, setResizingNoteId] = useState<string | null>(null);
    const [activeEditId, setActiveEditId] = useState<string | null>(null);
    const [startMousePos, setStartMousePos] = useState({ x: 0, y: 0 });
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    // const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);

    const [isFullScreen, setIsFullScreen] = useState(startFullScreen);
    const [selectedTool, setSelectedTool] = useState<'select' | 'pan'>('select');

    const containerRef = useRef<HTMLDivElement>(null);
    const notesRef = useRef<Note[]>(notes);

    useEffect(() => {
        notesRef.current = notes;
    }, [notes]);

    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setContainerSize({ width: rect.width, height: rect.height });
            }
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    /**
     * Persistently syncs the entire current state of the canvas notes to the backend.
     * Triggered on user interaction drop/finish to reduce spammy updates.
     */
    const saveCanvas = useCallback(async (updatedNotes: Note[]) => {
        try {
            await api.patch(`/assignments/${assignmentId}/canvas`, {
                canvasData: updatedNotes
            });
        } catch (error) {
            console.error("Failed to save project canvas", error);
        }
    }, [assignmentId]);

    /**
     * Calculates and updates the transformation matrix to seamlessly zoom in/out
     * towards a specific coordinate point on the screen (usually the mouse cursor center point).
     */
    const zoomTowards = (newScale: number, centerX: number, centerY: number) => {
        setScale(prevScale => {
            const s1 = prevScale;
            const s2 = newScale;
            setOffset(prevOffset => ({
                x: centerX - (centerX - prevOffset.x) * (s2 / s1),
                y: centerY - (centerY - prevOffset.y) * (s2 / s1)
            }));
            return s2;
        });
    };

    const handleWheel = (e: React.WheelEvent) => {
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
            setOffset(prev => ({
                x: prev.x - e.deltaX,
                y: prev.y - e.deltaY
            }));
        }
    };

    /**
     * Initializes interactions based on current tool mode or hotkey modifiers.
     * Determines whether to start panning the canvas or tracking for other behaviors.
     */
    const handleMouseDown = (e: React.MouseEvent) => {
        const isMiddleButton = e.button === 1;
        const isAltPressed = e.altKey;

        // Rule 1: Pan tool or Alt/Middle mouse button starts panning
        if (selectedTool === 'pan' || isMiddleButton || (selectedTool === 'select' && isAltPressed)) {
            setIsPanning(true);
            setMousePos({ x: e.clientX, y: e.clientY });
            return;
        }

        setMousePos({ x: e.clientX, y: e.clientY });
        setStartMousePos({ x: e.clientX, y: e.clientY });
    };

    /**
     * Handles fluid interactions like canvas panning, note dragging, and note resizing 
     * by comparing the current cursor offset against the initial mousedown position 
     * scaled by the current zoom level.
     */
    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            const dx = e.clientX - mousePos.x;
            const dy = e.clientY - mousePos.y;
            setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            setMousePos({ x: e.clientX, y: e.clientY });
        } else if (draggedNoteId) {
            // Threshold check: prevent accidental movement on simple clicks
            if (!isDraggingNode) {
                const moveDist = Math.sqrt(Math.pow(e.clientX - startMousePos.x, 2) + Math.pow(e.clientY - startMousePos.y, 2));
                if (moveDist > 3) {
                    setIsDraggingNode(true);
                }
                return;
            }

            const dx = (e.clientX - mousePos.x) / scale;
            const dy = (e.clientY - mousePos.y) / scale;
            const updated = notes.map(n => n.id === draggedNoteId ? { ...n, x: n.x + dx, y: n.y + dy } : n);
            setNotes(updated);
            setMousePos({ x: e.clientX, y: e.clientY });
        } else if (isResizing && resizingNoteId) {
            const dx = (e.clientX - mousePos.x) / scale;
            const dy = (e.clientY - mousePos.y) / scale;
            const updated = notes.map(n => n.id === resizingNoteId ? {
                ...n,
                width: Math.max(150, (n.width || 200) + dx),
                height: Math.max(100, (n.height || 140) + dy)
            } : n);
            setNotes(updated);
            setMousePos({ x: e.clientX, y: e.clientY });
        }
    };

    /**
     * Manages collaborative data tracking by recording authorship history.
     * Appends the current user to the `editedBy` array if they aren't the creator
     * and haven't already edited the note.
     */
    const recordEdit = useCallback((noteId: string, currentNotes: Note[]): Note[] => {
        if (!user) return currentNotes;

        return currentNotes.map(n => {
            if (n.id !== noteId) return n;

            // If user is creator, no need to add to editedBy
            if (n.createdBy?._id === user._id) return n;

            const editors = n.editedBy || [];
            if (editors.find(e => e._id === user._id)) return n;

            return {
                ...n,
                editedBy: [...editors, { _id: user._id, name: user.name, avatar: user.avatar }]
            };
        });
    }, [user]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

            if (e.key === 'v' || e.key === 'V') setSelectedTool('select');
            if (e.key === 'h' || e.key === 'H') setSelectedTool('pan');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleMouseUp = useCallback(() => {
        const wasInteracting = isDraggingNode || isResizing;
        const targetId = draggedNoteId || resizingNoteId;

        // Immediately disable flags to kill the "buttery" effect and snap state
        setIsPanning(false);
        setIsDraggingNode(false);
        setIsResizing(false);
        setDraggedNoteId(null);
        setResizingNoteId(null);

        if (wasInteracting && targetId) {
            const updated = recordEdit(targetId, notesRef.current);
            setNotes(updated);
            saveCanvas(updated);
        }
    }, [isDraggingNode, isResizing, draggedNoteId, resizingNoteId, recordEdit, saveCanvas]);

    useEffect(() => {
        if (!isDraggingNode && !isResizing) return;
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseUp, isDraggingNode, isResizing]);

    const addNoteAt = (x: number, y: number) => {
        const newNote: Note = {
            id: Math.random().toString(36).substr(2, 9),
            x: x - 200,
            y: y - 100,
            width: 450,
            height: 350,
            content: "<p>New Note</p>",
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            createdBy: user ? { _id: user._id, name: user.name, avatar: user.avatar } : undefined,
            editedBy: []
        };

        const updated = [...notes, newNote];
        setNotes(updated);
        saveCanvas(updated);
    };

    const addNote = () => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const centerX = (rect.width / 2 - offset.x) / scale;
        const centerY = (rect.height / 2 - offset.y) / scale;

        addNoteAt(centerX, centerY);
    };

    const deleteNote = (id: string) => {
        const updated = notes.filter(n => n.id !== id);
        setNotes(updated);
        saveCanvas(updated);
    };

    const updateNoteContent = (id: string, content: string) => {
        setNotes(notes.map(n => n.id === id ? { ...n, content } : n));
    };

    const saveContent = (id: string, content: string) => {
        const updatedWithContent = notes.map(n => n.id === id ? { ...n, content } : n);
        const updated = recordEdit(id, updatedWithContent);
        setNotes(updated);
        saveCanvas(updated);
    };

    const resetView = () => {
        setScale(1);
        setOffset({ x: 0, y: 0 });
    };

    return (
        <div
            ref={containerRef}
            style={{
                position: isFullScreen ? "fixed" : "relative",
                inset: isFullScreen ? 0 : "auto",
                height: isFullScreen ? "100vh" : 600,
                width: isFullScreen ? "100vw" : "100%",
                zIndex: isFullScreen ? 9999 : 1,
                borderRadius: isFullScreen ? 0 : 12,
                overflow: "hidden",
                background: "var(--color-bg)",
                cursor: isPanning ? "grabbing" : (selectedTool === 'pan' ? 'grab' : "auto"),
                userSelect: "none",
                border: isFullScreen ? "none" : "1px solid var(--color-border)"
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* Grid Pattern */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `
                        radial-gradient(circle at 1px 1px, var(--color-text-tertiary) 1px, transparent 0)
                    `,
                    backgroundSize: `${20 * scale}px ${20 * scale}px`,
                    backgroundPosition: `${offset.x}px ${offset.y}px`,
                    pointerEvents: "none",
                    opacity: 0.2
                }}
            />

            {/* Transform Container */}
            <div
                style={{
                    position: "absolute",
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    transformOrigin: "0 0",
                    transition: isPanning ? "none" : "transform 0.05s linear"
                }}
            >
                {notes.map(note => (
                    <div
                        key={note.id}
                        style={{
                            position: "absolute",
                            left: note.x,
                            top: note.y,
                            width: note.width || 200,
                            height: note.height || "auto",
                            minHeight: 140,
                            background: note.color,
                            padding: 16,
                            borderRadius: 12,
                            boxShadow: "var(--shadow-md)",
                            border: "1px solid rgba(0,0,0,0.05)",
                            zIndex: activeEditId === note.id ? 1000 : 1,
                            color: "#1e293b",
                            display: "flex",
                            flexDirection: "column"
                        }}
                        // onMouseEnter={() => setHoveredNoteId(note.id)}
                        // onMouseLeave={() => setHoveredNoteId(null)}
                        onMouseDown={(e) => {
                            // Always stop propagation in Select mode to prevent canvas-level actions
                            if (selectedTool === 'select') {
                                e.stopPropagation();
                            }

                            if (activeEditId === note.id) return;

                            // Rule 1: Pan tool drags the board, not the note
                            if (selectedTool === 'pan') return;

                            // Rule 3: Select tool allows dragging
                            if (selectedTool === 'select') {
                                setDraggedNoteId(note.id);
                                setMousePos({ x: e.clientX, y: e.clientY });
                                setStartMousePos({ x: e.clientX, y: e.clientY });
                            }
                        }}
                    >
                        <div className="flex justify-between mb-2 opacity-40" >
                            <Move size={16} className="cursor-grab" />
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <NoteExportMenu noteContent={note.content} noteId={note.id} iconSize={16} />
                                {activeEditId === note.id && (
                                    <X
                                        size={16}
                                        className="cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            saveContent(note.id, note.content);
                                            setActiveEditId(null);
                                        }}
                                    />
                                )}
                                <Trash2
                                    size={16}
                                    className="cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                                />
                            </div>
                        </div>

                        <div
                            style={{
                                flex: 1,
                                background: 'rgba(255,255,255,0.5)',
                                borderRadius: 8,
                                overflow: 'hidden'
                            }}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                if (activeEditId !== note.id) {
                                    setActiveEditId(note.id);
                                }
                            }}
                        >
                            {activeEditId === note.id ? (
                                <RichTextEditor
                                    content={note.content}
                                    onChange={(html) => updateNoteContent(note.id, html)}
                                    onBlur={() => {
                                        saveContent(note.id, note.content);
                                        setActiveEditId(null);
                                    }}
                                />
                            ) : (
                                <div
                                    className="note-content-area flex-1 cursor-text max-w-none"
                                    onClick={() => setActiveEditId(note.id)}
                                    dangerouslySetInnerHTML={{ __html: note.content }}
                                />
                            )}
                        </div>
                        {activeEditId !== note.id && (
                            <div className="text-xs text-muted-foreground text-right mt-1.5" >
                                Click to edit
                            </div>
                        )}
{/* b lock some ngnix nagri */}
                        {/* Authorship Info */}
                        <div className="mt-3 pt-2 flex justify-between items-center " style={{ borderTop: "1px solid rgba(0,0,0,0.05)"}}>
                            {note.createdBy && (
                                <div className="flex items-center gap-1.5">
                                    <Avatar src={note.createdBy.avatar} name={note.createdBy.name} size={18} />
                                    <span className="text-xs font-medium opacity-60">{note.createdBy.name}</span>
                                </div>
                            )}

                            {note.editedBy && note.editedBy.length > 0 && (
                                <div className="flex items-center">
                                    {note.editedBy.slice(0, 3).map((editor, idx) => (
                                        <div key={editor._id} style={{ marginLeft: idx === 0 ? 0 : -6 }}>
                                            <Avatar
                                                src={editor.avatar}
                                                name={editor.name}
                                                size={16}
                                                style={{ border: "1px solid white" }}
                                            />
                                        </div>
                                    ))}
                                    {note.editedBy.length > 3 && (
                                        <span style={{ fontSize: "0.6rem", opacity: 0.4, marginLeft: 4 }}>
                                            +{note.editedBy.length - 3}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Resize Handle */}
                        <div
                            onMouseDown={(e) => {
                                // Rule 3: Only Select tool can resize
                                if (selectedTool !== 'select') return;

                                e.stopPropagation();
                                setIsResizing(true);
                                setResizingNoteId(note.id);
                                setMousePos({ x: e.clientX, y: e.clientY });
                            }}
                            className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-center justify-center opacity-30"
                        >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M10 0L0 10M10 5L5 10M10 8L8 10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                            </svg>
                        </div>
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div className="absolute bottom-3 right-3 bg-(--color-surface py-1.5 px-2.5 rounded-lg flex gap-2.5 items-center shadow-[var(--shadow-md) border border-(--color-border)">
                <button className="btn btn-ghost btn-xs" onClick={() => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (rect) zoomTowards(Math.min(scale + 0.2, 5), rect.width / 2, rect.height / 2);
                }}><Plus size={16} /></button>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, width: 35, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
                <button className="btn btn-ghost btn-xs" onClick={() => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (rect) zoomTowards(Math.max(scale - 0.2, 0.1), rect.width / 2, rect.height / 2);
                }}><Minus size={16} /></button>


                <div style={{ width: 1, height: 20, background: "var(--color-border)" }} />
                <button className="btn btn-secondary btn-xs" onClick={resetView} title="Reset View"><RefreshCcw size={16} /></button>
                <button
                    className={`btn ${isFullScreen ? 'btn-primary' : 'btn-ghost'} btn-xs`}
                    onClick={() => {
                        if (isFullScreen && onExitFullScreen) {
                            onExitFullScreen();
                        }
                        setIsFullScreen(!isFullScreen);
                    }}
                    title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
                >
                    {isFullScreen ? <Shrink size={16} /> : <Expand size={16} />}
                </button>
            </div>

            {/* Top Toolbar */}
            <div
                style={{
                    position: "absolute",
                    top: 12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    display: "flex",
                    gap: 8,
                    zIndex: 100,
                    background: "var(--color-surface)",
                    padding: "6px",
                    borderRadius: 50,
                    boxShadow: "var(--shadow-lg)",
                    border: "1px solid var(--color-border)",
                    alignItems: "center"
                }}
            >
                <div style={{ display: 'flex', background: 'var(--color-bg-secondary)', borderRadius: 40, padding: 4, gap: 4 }}>
                    <button
                        onClick={() => setSelectedTool('select')}
                        className={`btn btn-xs ${selectedTool === 'select' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ borderRadius: 20, width: 36, height: 36, padding: 0 }}
                        title="Select Tool (V)"
                    >
                        <MousePointer2 size={16} />
                    </button>
                    <button
                        onClick={() => setSelectedTool('pan')}
                        className={`btn btn-xs ${selectedTool === 'pan' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ borderRadius: 20, width: 36, height: 36, padding: 0 }}
                        title="Pan Tool (H)"
                    >
                        <Hand size={16} />
                    </button>
                </div>

                <div style={{ width: 1, height: 24, background: 'var(--color-border)', margin: '0 4px' }} />

                <button
                    onClick={addNote}
                    className="btn btn-primary btn-sm"
                    style={{ borderRadius: 20, height: 36, display: 'flex', alignItems: 'center', gap: 8, margin: 4 }}
                >
                    <Plus size={16} /> Add Note
                </button>
            </div>

            {/* Hint Info */}
            <div style={{
                position: "absolute",
                top: 12,
                left: 12,
                background: "rgba(255,255,255,0.8)",
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: "0.7rem",
                color: "var(--color-text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: "1px solid var(--color-border)",
                zIndex: 10
            }}>
                <span style={{ fontWeight: 600 }}>Whiteboard</span>
                <span style={{ opacity: 0.5 }}>|</span>
                <span><b>V</b> Select • <b>H</b> Pan</span>
            </div>

            {/* Canvas Navigator */}
            <CanvasNavigator
                notes={notes}
                scale={scale}
                offset={offset}
                containerWidth={containerSize.width}
                containerHeight={containerSize.height}
                onOffsetChange={setOffset}
            />
        </div>
    );
};

export default ProjectCanvas;
