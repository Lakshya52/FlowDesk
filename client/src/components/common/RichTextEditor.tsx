import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent, Extension, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { FontFamily } from '@tiptap/extension-font-family';
import { TextStyle } from '@tiptap/extension-text-style';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import {
    Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
    Code2, List, ListOrdered, CheckSquare, Quote, AlignLeft, AlignCenter,
    AlignRight, AlignJustify, Link as LinkIcon, Unlink, Highlighter,
    Palette, RemoveFormatting, ChevronDown
} from 'lucide-react';

interface RichTextEditorProps {
    content: string;
    onChange: (content: string) => void;
    onBlur?: () => void;
    placeholder?: string;
    readOnly?: boolean;
    onEdit?: () => void;
    hideToolbar?: boolean;
    onReady?: (editor: Editor) => void;
}

const FONT_FAMILIES = [
    { label: 'Inter', value: 'Inter, sans-serif' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Times', value: '"Times New Roman", serif' },
    { label: 'Courier', value: '"Courier New", monospace' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Verdana', value: 'Verdana, sans-serif' },
];

const FONT_SIZES = [
    { label: '12px', value: '12px' },
    { label: '14px', value: '14px' },
    { label: '16px', value: '16px' },
    { label: '18px', value: '18px' },
    { label: '20px', value: '20px' },
    { label: '24px', value: '24px' },
];

const HEADINGS = [
    { label: 'Paragraph', value: 'paragraph', style: { fontSize: '0.7rem' } as React.CSSProperties },
    { label: 'Heading 1', value: 'h1', style: { fontSize: '0.95rem', fontWeight: 700 } as React.CSSProperties },
    { label: 'Heading 2', value: 'h2', style: { fontSize: '0.85rem', fontWeight: 700 } as React.CSSProperties },
    { label: 'Heading 3', value: 'h3', style: { fontSize: '0.78rem', fontWeight: 700 } as React.CSSProperties },
];

const TEXT_COLORS = [
    { label: 'Default', value: null },
    { label: 'Slate', value: '#334155' },
    { label: 'Rose', value: '#e11d48' },
    { label: 'Orange', value: '#ea580c' },
    { label: 'Amber', value: '#d97706' },
    { label: 'Lime', value: '#65a30d' },
    { label: 'Teal', value: '#0d9488' },
    { label: 'Blue', value: '#2563eb' },
    { label: 'Violet', value: '#7c3aed' },
    { label: 'Pink', value: '#db2777' },
];

const HIGHLIGHT_COLORS = [
    { label: 'None', value: null },
    { label: 'Yellow', value: '#fef08a' },
    { label: 'Green', value: '#bbf7d0' },
    { label: 'Blue', value: '#bae6fd' },
    { label: 'Purple', value: '#e9d5ff' },
    { label: 'Pink', value: '#fbcfe8' },
    { label: 'Red', value: '#fecaca' },
];

// Custom FontSize extension
const FontSize = Extension.create({
    name: 'fontSize',
    addOptions() {
        return {
            types: ['textStyle'],
        };
    },
    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    fontSize: {
                        default: null,
                        parseHTML: element => element.style.fontSize,
                        renderHTML: attributes => {
                            if (!attributes.fontSize) return {};
                            return { style: `font-size: ${attributes.fontSize}` };
                        },
                    },
                },
            },
        ];
    },
    addCommands() {
        return {
            setFontSize: (fontSize: string) => ({ chain }) => {
                return chain().setMark('textStyle', { fontSize }).run();
            },
            unsetFontSize: () => ({ chain }) => {
                return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
            },
        };
    },
});

const ToolbarButton: React.FC<{
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
}> = ({ onClick, isActive, disabled, title, children }) => (
    <button
        type="button"
        disabled={disabled}
        onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
        }}
        onClick={onClick}
        title={title}
        className={`rounded transition-colors ${isActive
                ? 'bg-primary-light text-primary'
                : 'text-text-secondary hover:bg-surface-hover'
            } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        style={{ cursor: disabled ? "not-allowed" : "pointer", padding: "4px" }}
    >
        {children}
    </button>
);

const Divider = () => (
    <div className="w-px h-4 bg-border self-center" style={{ margin: "0 4px" }} />
);

/** Generic dropdown used for font family / font size / heading level. */
const SelectMenu: React.FC<{
    label: string;
    current: string;
    title?: string;
    options: { label: string; value: string; style?: React.CSSProperties }[];
    onSelect: (value: string) => void;
}> = ({ label, current, title, options, onSelect }) => {
    const [open, setOpen] = useState(false);
    const display = options.find(o => o.value === current)?.label ?? label;
    const displayStyle =
        options.find(o => o.value === current)?.style ?? { fontSize: '0.7rem' };

    return (
        <div className="relative">
            <button
                type="button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onClick={() => setOpen((o) => !o)}
                className="flex items-center rounded text-xs font-medium text-text bg-surface border border-border hover:bg-surface-hover"
                style={{ padding: "5px 6px", gap: "4px", cursor: "pointer" }}
                title={title}
            >
                <span style={{ ...displayStyle }}>{display}</span>
                <ChevronDown size={14} />
            </button>
            {open && (
                <div
                    className="absolute top-full left-0 bg-surface border border-border rounded-lg shadow-lg z-50"
                    style={{ marginTop: "4px", padding: "4px", minWidth: 130 }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                            className={`w-full text-left rounded px-2.5 py-1.5 text-xs text-text hover:bg-surface-hover flex items-center justify-between ${current === opt.value ? 'bg-primary-light text-primary' : ''
                                }`}
                            style={{ cursor: "pointer", ...(opt.style || {}) }}
                            onClick={() => {
                                onSelect(opt.value);
                                setOpen(false);
                            }}
                        >
                            <span style={{ ...(opt.style || {}) }}>{opt.label}</span>
                            {current === opt.value && (
                                <CheckSquare size={12} style={{ opacity: 0.7, color: 'var(--color-primary)' }} />
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

/**
 * Reusable formatting toolbar. Rendered inside the note header so the user has a
 * single unified header with every note action.
 */
export const RichTextToolbar: React.FC<{ editor: Editor }> = ({ editor }) => {
    const [showColorMenu, setShowColorMenu] = useState(false);
    const [showHighlightMenu, setShowHighlightMenu] = useState(false);
    const [showLinkMenu, setShowLinkMenu] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");

    const state = useEditorState({
        editor,
        selector: ({ editor }) => ({
            bold: editor.isActive('bold'),
            italic: editor.isActive('italic'),
            underline: editor.isActive('underline'),
            strike: editor.isActive('strike'),
            code: editor.isActive('code'),
            codeBlock: editor.isActive('codeBlock'),
            bulletList: editor.isActive('bulletList'),
            orderedList: editor.isActive('orderedList'),
            taskList: editor.isActive('taskList'),
            blockquote: editor.isActive('blockquote'),
            paragraph: editor.isActive('paragraph'),
            headingLevel: editor.isActive('heading')
                ? (`h${(editor.getAttributes('heading').level as number) ?? 1}` as string)
                : "",
            alignLeft: editor.isActive({ textAlign: 'left' }),
            alignCenter: editor.isActive({ textAlign: 'center' }),
            alignRight: editor.isActive({ textAlign: 'right' }),
            alignJustify: editor.isActive({ textAlign: 'justify' }),
            link: editor.isActive('link'),
            linkHref: (editor.getAttributes('link') as { href?: string }).href ?? "",
            fontFamily: (editor.getAttributes('textStyle').fontFamily as string) || "",
            fontSize: (editor.getAttributes('textStyle').fontSize as string) || "",
            textColor: (editor.getAttributes('textStyle').color as string) || "",
            highlight: editor.isActive('highlight'),
        }),
    });

    const closeOverlays = () => {
        setShowColorMenu(false);
        setShowHighlightMenu(false);
        setShowLinkMenu(false);
    };

    const openLinkMenu = () => {
        closeOverlays();
        setLinkUrl(editor.getAttributes('link').href || "");
        setShowLinkMenu(true);
    };

    const applyLink = () => {
        const href = linkUrl.trim();
        if (href) {
            editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
        } else {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
        }
        setShowLinkMenu(false);
    };

    const removeLink = () => {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        setShowLinkMenu(false);
    };

    return (
        <div
            className="flex flex-col"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            style={{
                gap: "4px",
                padding: "4px 6px",
                background: "var(--color-surface)",
                borderRadius: 8,
                border: "1px solid var(--color-border)",
            }}
        >
            {/* Row 1: inline styles */}
            <div className="flex flex-wrap items-center justify-start" style={{ gap: "2px" }}>
                <SelectMenu
                    label="Style"
                    current={state.headingLevel || (state.paragraph ? 'paragraph' : '')}
                    title="Text style / heading"
                    options={HEADINGS}
                    onSelect={(value) => {
                        closeOverlays();
                        if (value === 'paragraph') {
                            editor.chain().focus().setParagraph().run();
                        } else {
                            const level = Number(value.replace('h', '')) as 1 | 2 | 3;
                            editor.chain().focus().toggleHeading({ level }).run();
                        }
                    }}
                />

                <Divider />

                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    isActive={state.bold}
                    title="Bold (Ctrl+B)"
                >
                    <Bold size={15} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    isActive={state.italic}
                    title="Italic (Ctrl+I)"
                >
                    <Italic size={15} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    isActive={state.underline}
                    title="Underline (Ctrl+U)"
                >
                    <UnderlineIcon size={15} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    isActive={state.strike}
                    title="Strikethrough"
                >
                    <Strikethrough size={15} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    isActive={state.code}
                    title="Inline code"
                >
                    <Code size={15} />
                </ToolbarButton>

                <Divider />

                {/* Text color */}
                <div className="relative">
                    <ToolbarButton
                        onClick={() => {
                            closeOverlays();
                            setShowColorMenu((v) => !v);
                        }}
                        isActive={!!state.textColor}
                        title="Text color"
                    >
                        <Palette size={15} />
                    </ToolbarButton>
                    {showColorMenu && (
                        <div
                            className="absolute top-full left-0 bg-surface border border-border rounded-lg shadow-lg z-50"
                            style={{ marginTop: "4px", padding: "8px", width: 150 }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <div className="flex flex-wrap" style={{ gap: "6px" }}>
                                {TEXT_COLORS.map((color) => (
                                    <button
                                        key={color.label}
                                        type="button"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        className={`rounded-full flex items-center justify-center ${!state.textColor && color.value === null ? 'ring-2 ring-primary' : ''}`}
                                        style={{
                                            width: 18,
                                            height: 18,
                                            cursor: "pointer",
                                            border: color.value
                                                ? "2px solid rgba(0,0,0,0.12)"
                                                : "2px dashed var(--color-border-hover)",
                                            background: color.value || "#fff",
                                            ...(color.value === state.textColor
                                                ? { boxShadow: "0 0 0 2px var(--color-primary)" }
                                                : {}),
                                        }}
                                        title={color.label}
                                        onClick={() => {
                                            if (color.value) {
                                                editor.chain().focus().setColor(color.value).run();
                                            } else {
                                                editor.chain().focus().unsetColor().run();
                                            }
                                            setShowColorMenu(false);
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Highlight */}
                <div className="relative">
                    <ToolbarButton
                        onClick={() => {
                            closeOverlays();
                            setShowHighlightMenu((v) => !v);
                        }}
                        isActive={state.highlight}
                        title="Highlight"
                    >
                        <Highlighter size={15} />
                    </ToolbarButton>
                    {showHighlightMenu && (
                        <div
                            className="absolute top-full left-0 bg-surface border border-border rounded-lg shadow-lg z-50"
                            style={{ marginTop: "4px", padding: "8px", width: 150 }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <div className="flex flex-wrap" style={{ gap: "6px" }}>
                                {HIGHLIGHT_COLORS.map((hl) => (
                                    <button
                                        key={hl.label}
                                        type="button"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        className={`rounded-full flex items-center justify-center ${!state.highlight && hl.value === null ? 'ring-2 ring-primary' : ''}`}
                                        style={{
                                            width: 18,
                                            height: 18,
                                            cursor: "pointer",
                                            border: hl.value
                                                ? "2px solid rgba(0,0,0,0.12)"
                                                : "2px dashed var(--color-border-hover)",
                                            background: hl.value || "#fff",
                                            ...(hl.value && state.highlight && editor.getAttributes('highlight').color === hl.value
                                                ? { boxShadow: "0 0 0 2px var(--color-primary)" }
                                                : {}),
                                        }}
                                        title={hl.label}
                                        onClick={() => {
                                            if (hl.value) {
                                                editor.chain().focus().toggleHighlight({ color: hl.value }).run();
                                            } else {
                                                editor.chain().focus().unsetHighlight().run();
                                            }
                                            setShowHighlightMenu(false);
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <Divider />

                {/* Link */}
                <div className="relative">
                    <ToolbarButton
                        onClick={openLinkMenu}
                        isActive={state.link}
                        title="Add or edit link"
                    >
                        {state.link ? <Unlink size={15} /> : <LinkIcon size={15} />}
                    </ToolbarButton>
                    {showLinkMenu && (
                        <div
                            className="absolute top-full left-0 bg-surface border border-border rounded-lg shadow-lg z-50"
                            style={{ marginTop: "4px", padding: "8px", width: 190 }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <input
                                autoFocus
                                type="text"
                                value={linkUrl}
                                placeholder="https://…"
                                onMouseDown={(e) => e.stopPropagation()}
                                onChange={(e) => setLinkUrl(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') applyLink();
                                    if (e.key === 'Escape') setShowLinkMenu(false);
                                }}
                                className="w-full rounded bg-bg text-text border border-border px-2 py-1 text-xs outline-none focus:border-primary"
                                style={{ boxSizing: "border-box" }}
                            />
                            <div className="flex items-center justify-between" style={{ gap: 6, marginTop: 6 }}>
                                <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                    onClick={applyLink}
                                    className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-hover"
                                    style={{ cursor: "pointer" }}
                                >
                                    Apply
                                </button>
                                {state.link && (
                                    <button
                                        type="button"
                                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                        onClick={removeLink}
                                        className="rounded py-1 text-xs text-danger hover:bg-danger-light"
                                        style={{ cursor: "pointer" }}
                                    >
                                        Remove link
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Row 2: blocks / structure */}
            <div className="flex flex-wrap items-center justify-start" style={{ gap: "2px" }}>
                <SelectMenu
                    label="Font"
                    current={state.fontFamily}
                    title="Font family"
                    options={FONT_FAMILIES.map(f => ({ ...f, style: { fontFamily: f.value } as React.CSSProperties }))}
                    onSelect={(value) => {
                        closeOverlays();
                        editor.chain().focus().setFontFamily(value).run();
                    }}
                />
                <SelectMenu
                    label="Size"
                    current={state.fontSize}
                    title="Font size"
                    options={FONT_SIZES.map(s => ({ ...s, style: { fontSize: s.value } as React.CSSProperties }))}
                    onSelect={(value) => {
                        closeOverlays();
                        editor.chain().focus().setFontSize(value).run();
                    }}
                />

                <Divider />

                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    isActive={state.bulletList}
                    title="Bullet list"
                >
                    <List size={15} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    isActive={state.orderedList}
                    title="Numbered list"
                >
                    <ListOrdered size={15} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleTaskList().run()}
                    isActive={state.taskList}
                    title="Checkbox list"
                >
                    <CheckSquare size={15} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    isActive={state.blockquote}
                    title="Blockquote"
                >
                    <Quote size={15} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                    isActive={state.codeBlock}
                    title="Code block"
                >
                    <Code2 size={15} />
                </ToolbarButton>

                <Divider />

                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('left').run()}
                    isActive={state.alignLeft}
                    title="Align left"
                >
                    <AlignLeft size={15} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('center').run()}
                    isActive={state.alignCenter}
                    title="Align center"
                >
                    <AlignCenter size={15} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('right').run()}
                    isActive={state.alignRight}
                    title="Align right"
                >
                    <AlignRight size={15} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                    isActive={state.alignJustify}
                    title="Justify"
                >
                    <AlignJustify size={15} />
                </ToolbarButton>

                <Divider />

                <ToolbarButton
                    onClick={() => {
                        editor.chain().focus().clearNodes().setParagraph().unsetAllMarks().run();
                    }}
                    title="Clear formatting"
                >
                    <RemoveFormatting size={15} />
                </ToolbarButton>
            </div>
        </div>
    );
};

const RichTextEditor: React.FC<RichTextEditorProps> = ({
    content,
    onChange,
    onBlur,
    placeholder,
    readOnly = false,
    onEdit,
    hideToolbar = false,
    onReady
}) => {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                // Re-enable bullet/numbered lists (disabled before to favor the
                // task checkbox list; both work side by side).
                bulletList: {},
                orderedList: {},
                listItem: {},
                link: {
                    openOnClick: false,
                    autolink: true,
                    defaultProtocol: 'https',
                    HTMLAttributes: {
                        rel: 'noopener noreferrer nofollow',
                        target: '_blank',
                    },
                },
            }),
            TextStyle,
            FontFamily,
            FontSize,
            TextAlign.configure({
                types: ['heading', 'paragraph'],
            }),
            TaskList.configure({
                HTMLAttributes: {
                    class: 'not-prose list-none',
                },
            }),
            TaskItem.configure({
                nested: true,
                HTMLAttributes: {
                    class: 'flex items-center gap-2',
                },
            }),
            Color,
            Highlight.configure({
                multicolor: true,
            }),
            Placeholder.configure({
                placeholder: placeholder || 'Write something…',
            }),
        ],
        content,
        autofocus: 'end',
        editable: !readOnly,
        editorProps: {
            attributes: {
                class: 'note-content-area focus:outline-none max-w-none',
            },
        },
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        onBlur: () => {
            onBlur?.();
        },
    });

    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            editor.commands.setContent(content);
        }
    }, [content, editor]);

    useEffect(() => {
        if (editor) {
            editor.setEditable(!readOnly);
            if (!readOnly) {
                editor.commands.focus('end');
            }
        }
    }, [readOnly, editor]);

    useEffect(() => {
        if (editor && onReady) onReady(editor);
    }, [editor, onReady]);

    if (!editor) {
        return null;
    }

    return (
        <div
            className="flex flex-col h-full"
            onMouseDown={(e) => {
                if (readOnly && onEdit) {
                    onEdit();
                }
                e.stopPropagation();
            }}
        >
            {!readOnly && !hideToolbar && <RichTextToolbar editor={editor} />}

            <EditorContent
                editor={editor}
                className="flex-1"
                onMouseDown={(e) => {
                    if (readOnly && onEdit) {
                        onEdit();
                    }
                    e.stopPropagation();
                }}
            />

            <style>{`
                .ProseMirror {
                    outline: none;
                    flex: 1;
                }
                .ProseMirror p {
                    margin: 0.5em 0 !important;
                }
                .ProseMirror h1, .ProseMirror h2, .ProseMirror h3 {
                    font-weight: 700;
                    line-height: 1.3;
                    margin: 0.6em 0 0.3em !important;
                }
                .ProseMirror h1 { font-size: 1.5em; }
                .ProseMirror h2 { font-size: 1.25em; }
                .ProseMirror h3 { font-size: 1.1em; }
                .ProseMirror ul, .ProseMirror ol {
                    padding-left: 1.25em;
                }
                .ProseMirror ul { list-style: disc; }
                .ProseMirror ol { list-style: decimal; }
                .ProseMirror li { margin: 0.25em 0; }
                .ProseMirror li > p { margin: 0 !important; }
                .ProseMirror blockquote {
                    border-left: 3px solid #cbd5e1;
                    padding-left: 0.75em;
                    color: #64748b;
                    font-style: italic;
                    margin: 0.75em 0;
                }
                .ProseMirror code {
                    background: #f1f5f9;
                    color: #be123c;
                    padding: 0.15em 0.35em;
                    border-radius: 4px;
                    font-size: 0.9em;
                    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                }
                .ProseMirror pre {
                    background: #0f172a;
                    color: #e2e8f0;
                    padding: 12px;
                    border-radius: 8px;
                    margin: 0.75em 0;
                }
                .ProseMirror pre code {
                    background: transparent;
                    color: inherit;
                    padding: 0;
                    font-size: 0.9em;
                }
                .ProseMirror ul[data-type="taskList"] {
                    list-style: none;
                    padding: 0;
                }
                .ProseMirror ul[data-type="taskList"] li {
                    display: flex;
                    align-items: center;
                    gap: 0.5em;
                    margin: 0.25em 0;
                }
                .ProseMirror ul[data-type="taskList"] li > label {
                    margin: 0;
                    cursor: pointer;
                    flex-shrink: 0;
                }
                .ProseMirror ul[data-type="taskList"] li > div {
                    flex: 1;
                }
                .ProseMirror-focused {
                    outline: none;
                }
                .ProseMirror-selectednode {
                    outline: 2px solid #6366f1;
                }
                .ProseMirror p.is-editor-empty:first-child::before {
                    content: attr(data-placeholder);
                    float: left;
                    height: 0;
                    pointer-events: none;
                    color: #94a3b8;
                }
                .ProseMirror a {
                    color: #4f46e5;
                    text-decoration: underline;
                    cursor: pointer;
                }
            `}</style>
        </div>
    );
};

export default RichTextEditor;