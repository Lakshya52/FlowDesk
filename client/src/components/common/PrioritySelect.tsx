import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { PRIORITY_META, TaskPriority, PriorityIcon } from './PriorityIcon';

const ORDER: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

interface PrioritySelectProps {
    value?: string;
    onChange: (next: string) => void;
    className?: string;
    style?: React.CSSProperties;
    ariaLabel?: string;
    disabled?: boolean;
    // Compact badge look for inline use (e.g. kanban cards): same
    // `badge badge-*` styling as PriorityBadge, popover unchanged.
    compact?: boolean;
}

// Native <option> elements cannot render icons, so this is a custom dropdown
// that looks like a `.select` (same class, same chevron) but shows the
// Jira-style priority mark next to every option. The open list is
// `position: fixed` so it is never clipped by modal cards with
// `overflow: hidden` or rounded corners.
export const PrioritySelect: React.FC<PrioritySelectProps> = ({
    value = 'medium',
    onChange,
    className = '',
    style,
    ariaLabel = 'Priority',
    disabled = false,
    compact = false,
}) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);

    const meta = PRIORITY_META[value as TaskPriority] || PRIORITY_META.medium;
    const key = (PRIORITY_META[value as TaskPriority] ? value : 'medium') as string;

    const measure = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (!r) return;
        const estHeight = ORDER.length * 36 + 8;
        const flip = r.bottom + estHeight + 8 > window.innerHeight;
        setPos({
            top: flip ? Math.max(8, r.top - estHeight - 4) : r.bottom + 4,
            left: Math.min(r.left, window.innerWidth - r.width - 8),
            width: r.width,
        });
    };

    useEffect(() => {
        if (!open) return;
        const close = () => setOpen(false);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (
                btnRef.current?.contains(t) ||
                popRef.current?.contains(t)
            )
                return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
            document.removeEventListener('mousedown', onDown);
        };
    }, [open]);

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={compact ? `badge badge-${key}` : `select ${className}`}
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                disabled={disabled}
                title={compact ? (disabled ? meta.label : `Change priority (now ${meta.label})`) : undefined}
                onClick={() => {
                    if (disabled) return;
                    if (open) {
                        setOpen(false);
                    } else {
                        // Measure before opening so the portaled list paints
                        // in the right place on its very first frame.
                        measure();
                        setOpen(true);
                    }
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Escape' && open) {
                        e.stopPropagation();
                        setOpen(false);
                    }
                }}
                style={
                    compact
                        ? {
                              fontSize: '0.625rem',
                              gap: 4,
                              cursor: disabled ? 'default' : 'pointer',
                              border: 'none',
                              ...style,
                          }
                        : {
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              textAlign: 'left',
                              ...style,
                          }
                }
            >
                <PriorityIcon priority={value} size={compact ? 12 : 14} />
                <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</span>
            </button>
            {open &&
                createPortal(
                    <div
                        ref={popRef}
                        role="listbox"
                        aria-label={ariaLabel}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') e.stopPropagation();
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                            position: 'fixed',
                            top: pos.top,
                            left: pos.left,
                            width: Math.max(pos.width, 180),
                            zIndex: 4960,
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 8,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
                            padding: 4,
                            maxHeight: 240,
                            overflowY: 'auto',
                        }}
                    >
                    {ORDER.map((k) => {
                        const m = PRIORITY_META[k];
                        const selected = value === k;
                        return (
                            <div
                                key={k}
                                role="option"
                                aria-selected={selected}
                                onClick={() => {
                                    onChange(k);
                                    setOpen(false);
                                    btnRef.current?.focus();
                                }}
                                onMouseEnter={(e) =>
                                    (e.currentTarget.style.background =
                                        'var(--color-surface-hover)')
                                }
                                onMouseLeave={(e) =>
                                    (e.currentTarget.style.background = selected
                                        ? 'var(--color-surface-hover)'
                                        : 'transparent')
                                }
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px 10px',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    fontSize: '0.8125rem',
                                    background: selected
                                        ? 'var(--color-surface-hover)'
                                        : 'transparent',
                                }}
                            >
                                <PriorityIcon priority={k} size={14} />
                                <span style={{ flex: 1, color: m.color, fontWeight: 600 }}>
                                    {m.label}
                                </span>
                                {selected && (
                                    <Check size={14} style={{ color: 'var(--color-primary)' }} />
                                )}
                            </div>
                        );
                    })}
                    </div>,
                    document.body
                )}
        </>
    );
};

export default PrioritySelect;
