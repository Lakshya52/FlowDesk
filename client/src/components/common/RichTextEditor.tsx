import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { FontFamily } from '@tiptap/extension-font-family';
import { TextStyle } from '@tiptap/extension-text-style';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {
    Bold, Italic, Underline as UnderlineIcon, CheckSquare,
    AlignLeft, AlignCenter, AlignRight, ChevronDown
} from 'lucide-react';

interface RichTextEditorProps {
    content: string;
    onChange: (content: string) => void;
    onBlur?: () => void;
    placeholder?: string;
    readOnly?: boolean;
    onEdit?: () => void;
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

const RichTextEditor: React.FC<RichTextEditorProps> = ({
    content,
    onChange,
    onBlur,
    readOnly = false,
    onEdit
}) => {
    const [showFontFamilyDropdown, setShowFontFamilyDropdown] = useState(false);
    const [showFontSizeDropdown, setShowFontSizeDropdown] = useState(false);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                bulletList: false,
                orderedList: false,
                listItem: false,
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

    if (!editor) {
        return null;
    }

    const ToolbarButton: React.FC<{
        onClick: () => void;
        isActive?: boolean;
        title: string;
        children: React.ReactNode;
    }> = ({ onClick, isActive, title, children }) => (
        <button
            type="button"
            onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
            onClick={onClick}
            title={title}
            className={`rounded transition-colors ${isActive
                    ? 'bg-indigo-100 text-indigo-600'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
            style={{ cursor: "pointer", padding: "4px" }}
        >
            {children}
        </button>
    );

    const currentFontFamily = editor.getAttributes('textStyle').fontFamily;
    const currentFontSize = editor.getAttributes('textStyle').fontSize;

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
            {!readOnly && (
                <div
                    className="flex flex-wrap items-center border-b border-slate-200 bg-slate-50 rounded-t-lg"
                    style={{ padding: "10px", gap: "4px", marginBottom: "4px" }}
                >
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        isActive={editor.isActive('bold')}
                        title="Bold (Ctrl+B)"
                    >
                        <Bold size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        isActive={editor.isActive('italic')}
                        title="Italic (Ctrl+I)"
                    >
                        <Italic size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        isActive={editor.isActive('underline')}
                        title="Underline (Ctrl+U)"
                    >
                        <UnderlineIcon size={16} />
                    </ToolbarButton>

                    <div className="w-px h-4 bg-slate-300" style={{ margin: "0 4px" }} />

                    {/* Font Family */}
                    <div className="relative">
                        <button
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                            onClick={() => setShowFontFamilyDropdown(!showFontFamilyDropdown)}
                            className="flex items-center rounded text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50"
                            style={{ padding: "6px 8px", gap: "4px", cursor: "pointer" }}
                            title="Font Family"
                        >
                            <span style={{ fontFamily: currentFontFamily || 'inherit' }}>
                                {FONT_FAMILIES.find(f => f.value === currentFontFamily)?.label || 'Font'}
                            </span>
                            <ChevronDown size={16} />
                        </button>
                        {showFontFamilyDropdown && (
                            <div
                                className="absolute top-full left-0 bg-white border border-slate-200 rounded shadow-lg z-50 py-1 min-w-35"
                                style={{ marginTop: "4px", padding: "10px", cursor: "pointer" }}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                {FONT_FAMILIES.map(font => (
                                    <button
                                        key={font.value}
                                        type="button"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 ${currentFontFamily === font.value ? 'bg-indigo-50 text-indigo-600' : ''
                                            }`}
                                        style={{ fontFamily: font.value, cursor: "pointer", padding: "10px", borderRadius: "10px" }}
                                        onClick={() => {
                                            editor.chain().focus().setFontFamily(font.value).run();
                                            setShowFontFamilyDropdown(false);
                                        }}
                                    >
                                        {font.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Font Size */}
                    <div className="relative">
                        <button
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                            onClick={() => setShowFontSizeDropdown(!showFontSizeDropdown)}
                            className="flex items-center rounded text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50"
                            style={{ padding: "6px 8px", gap: "4px", cursor: "pointer" }}
                            title="Font Size"
                        >
                            <span>{currentFontSize || '16px'}</span>
                            <ChevronDown size={16} />
                        </button>
                        {showFontSizeDropdown && (
                            <div
                                className="absolute top-full left-0 bg-white border border-slate-200 rounded shadow-lg z-50 py-1 min-w-20"
                                style={{ marginTop: "4px", padding: "4px" }}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                {FONT_SIZES.map(size => (
                                    <button
                                        key={size.value}
                                        type="button"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        className={`w-full text-left rounded text-xs hover:bg-slate-100 ${currentFontSize === size.value ? 'bg-indigo-50 text-indigo-600' : ''
                                            }`}
                                        style={{ padding: "6px 12px", cursor: "pointer", fontSize: size.value }}
                                        onClick={() => {
                                            editor.chain().focus().setFontSize(size.value).run();
                                            setShowFontSizeDropdown(false);
                                        }}
                                    >
                                        {size.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="w-px h-4 bg-slate-300" style={{ margin: "0 4px" }} />

                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleTaskList().run()}
                        isActive={editor.isActive('taskList')}
                        title="Checkbox List"
                    >
                        <CheckSquare size={16} />
                    </ToolbarButton>

                    <div className="w-px h-4 bg-slate-300" style={{ margin: "0 4px" }} />

                    <ToolbarButton
                        onClick={() => editor.chain().focus().setTextAlign('left').run()}
                        isActive={editor.isActive({ textAlign: 'left' })}
                        title="Align Left"
                    >
                        <AlignLeft size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().setTextAlign('center').run()}
                        isActive={editor.isActive({ textAlign: 'center' })}
                        title="Align Center"
                    >
                        <AlignCenter size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().setTextAlign('right').run()}
                        isActive={editor.isActive({ textAlign: 'right' })}
                        title="Align Right"
                    >
                        <AlignRight size={16} />
                    </ToolbarButton>
                </div>
            )}

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
                .ProseMirror ul, .ProseMirror ol {
                    padding-left: 1.25em;
                }
                .ProseMirror ul[data-type="taskList"] {
                    list-style: none;
                    padding: 0;
                }
                .ProseMirror ul[data-type="taskList"] li {
                    display: flex;
                    align-items: center;
                    gap: 0.5em;
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
            `}</style>
        </div>
    );
};

export default RichTextEditor;
