import React from 'react';
import { ChevronDown, ChevronUp, ChevronsUp, Equal } from 'lucide-react';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// Jira-style mark per priority: the arrow direction shows severity at a glance,
// the color matches the existing `badge-*` palette in index.css.
export const PRIORITY_META: Record<TaskPriority, { Icon: React.ElementType; color: string; label: string }> = {
    urgent: { Icon: ChevronsUp, color: '#ef4444', label: 'Urgent' },
    high: { Icon: ChevronUp, color: '#f97316', label: 'High' },
    medium: { Icon: Equal, color: '#f59e0b', label: 'Medium' },
    low: { Icon: ChevronDown, color: '#3b82f6', label: 'Low' },
};

interface PriorityIconProps {
    priority?: string;
    size?: number;
}

export const PriorityIcon: React.FC<PriorityIconProps> = ({ priority, size = 14 }) => {
    const meta = PRIORITY_META[(priority || 'medium') as TaskPriority] || PRIORITY_META.medium;
    const { Icon, color } = meta;
    return <Icon size={size} color={color} strokeWidth={2.5} style={{ flexShrink: 0 }} />;
};

interface PriorityBadgeProps {
    priority?: string;
    label?: string;
    fontSize?: string | number;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority = 'medium', label, fontSize }) => {
    const meta = PRIORITY_META[priority as TaskPriority] || PRIORITY_META.medium;
    return (
        <span
            className={`badge badge-${priority}`}
            title={meta.label}
            style={{ fontSize, gap: 4 }}
        >
            <PriorityIcon priority={priority} size={12} />
            {label ?? meta.label}
        </span>
    );
};

export default PriorityIcon;
