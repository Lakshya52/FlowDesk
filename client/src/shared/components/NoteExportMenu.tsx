import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileCode, FileType } from 'lucide-react';

interface NoteExportMenuProps {
    noteContent: string;
    noteId: string;
    /** Size of the trigger icon */
    iconSize?: number;
    /** Optional inline style for the trigger button */
    style?: React.CSSProperties;
}

/**
 * Builds a full styled HTML document string from raw editor HTML content.
 * Used by all three export formats as the canonical representation.
 */
const buildStyledHtml = (content: string): string => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Note</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  body {
    font-family: Inter, Arial, sans-serif;
    padding: 32px;
    line-height: 1.7;
    color: #1e293b;
    max-width: 800px;
    margin: 0 auto;
    background: #fff;
  }
  p { margin: 0.35em 0; }
  b, strong { font-weight: 700; }
  i, em { font-style: italic; }
  u { text-decoration: underline; }
  ul[data-type="taskList"] { list-style: none; padding: 0; }
  ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; margin: 0.25em 0; }
  ul[data-type="taskList"] li > label { flex-shrink: 0; }
  ul[data-type="taskList"] li > div { flex: 1; }
  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
${content}
</body>
</html>`;
};

/**
 * Converts HTML content to structured plain text, preserving paragraph breaks
 * and basic structure while stripping tags.
 */
const htmlToPlainText = (html: string): string => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;

    // Replace block-level elements with newlines before extracting text
    const blockTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'br', 'tr'];
    blockTags.forEach(tag => {
        const els = tmp.getElementsByTagName(tag);
        for (let i = els.length - 1; i >= 0; i--) {
            const el = els[i];
            if (tag === 'br') {
                el.replaceWith('\n');
            } else if (tag === 'li') {
                el.insertAdjacentText('beforebegin', '\n• ');
            } else if (tag === 'tr') {
                el.insertAdjacentText('afterend', '\n');
            } else {
                el.insertAdjacentText('afterend', '\n\n');
            }
        }
    });

    // Handle task list checkboxes
    const inputs = tmp.querySelectorAll('input[type="checkbox"]');
    inputs.forEach(input => {
        const checked = (input as HTMLInputElement).checked;
        const replacement = document.createTextNode(checked ? '[x] ' : '[ ] ');
        input.replaceWith(replacement);
    });

    let text = tmp.textContent || tmp.innerText || '';
    // Collapse 3+ newlines into 2
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
};

const NoteExportMenu: React.FC<NoteExportMenuProps> = ({
    noteContent,
    noteId,
    iconSize = 16,
    style = {}
}) => {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const exportHTML = () => {
        const html = buildStyledHtml(noteContent);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        downloadBlob(blob, `note-${noteId}.html`);
        setOpen(false);
    };

    const exportTXT = () => {
        const text = htmlToPlainText(noteContent);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, `note-${noteId}.txt`);
        setOpen(false);
    };

    const exportPDF = () => {
        const html = buildStyledHtml(noteContent);

        // Open a hidden iframe, write the styled content, and trigger print → Save as PDF
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.style.opacity = '0';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
            iframeDoc.open();
            iframeDoc.write(html);
            iframeDoc.close();

            // Wait for fonts/styles to load then print
            iframe.onload = () => {
                setTimeout(() => {
                    iframe.contentWindow?.print();
                    // Cleanup after a delay to allow print dialog to render
                    setTimeout(() => {
                        document.body.removeChild(iframe);
                    }, 1000);
                }, 300);
            };

            // Fallback if onload doesn't fire (already loaded)
            setTimeout(() => {
                try {
                    iframe.contentWindow?.print();
                } catch { /* ignore */ }
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 1000);
            }, 800);
        }

        setOpen(false);
    };

    const formats = [
        {
            label: 'HTML File',
            desc: 'Rich formatted document',
            icon: <FileCode size={16} />,
            action: exportHTML,
            color: '#f97316'
        },
        {
            label: 'PDF Document',
            desc: 'Print-ready with styling',
            icon: <FileText size={16} />,
            action: exportPDF,
            color: '#ef4444'
        },
        {
            label: 'Plain Text',
            desc: 'Simple text file',
            icon: <FileType size={16} />,
            action: exportTXT,
            color: '#6366f1'
        },
    ];

    return (
        <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen(prev => !prev);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title="Export note"
                style={{
                    padding: 4,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    opacity: 0.6,
                    ...style
                }}
            >
                <Download size={iconSize} />
            </button>

            {open && (
                <div
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: 6,
                        background: '#ffffff',
                        borderRadius: 10,
                        boxShadow: '0 8px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
                        border: '1px solid #e2e8f0',
                        overflow: 'hidden',
                        zIndex: 9999,
                        minWidth: 210,
                        animation: 'noteExportFadeIn 0.15s ease-out',
                    }}
                >
                    <div style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid #f1f5f9',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                    }}>
                        Export as
                    </div>
                    {formats.map((fmt) => (
                        <button
                            key={fmt.label}
                            onClick={(e) => {
                                e.stopPropagation();
                                fmt.action();
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '10px 12px',
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'background 0.15s',
                                fontSize: '0.85rem',
                                color: '#1e293b',
                            }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc';
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                            }}
                        >
                            <div style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                background: `${fmt.color}15`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: fmt.color,
                                flexShrink: 0
                            }}>
                                {fmt.icon}
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '0.8rem', lineHeight: 1.3 }}>
                                    {fmt.label}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#94a3b8', lineHeight: 1.3 }}>
                                    {fmt.desc}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            <style>{`
                @keyframes noteExportFadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default NoteExportMenu;
