import React from 'react';
import { Star } from 'lucide-react';

interface EventChipProps {
  title: string;
  color: string;
  time?: string;
  isImportant?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

const EventChip: React.FC<EventChipProps> = ({ 
  title, 
  color, 
  time, 
  isImportant, 
  onClick
}) => {
  return (
    <div 
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      style={{ 
        display: 'flex',
        alignItems: 'center',
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '12px',
        cursor: 'pointer',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        backgroundColor: `${color}30`,
        color: 'var(--color-text)',
        borderLeft: `3px solid ${color}`,
        marginBottom: '4px'
      }}
      onMouseOver={(e) => (e.currentTarget.style.filter = 'brightness(0.95)')}
      onMouseOut={(e) => (e.currentTarget.style.filter = 'none')}
    >
      {isImportant && <Star size={10} style={{ marginRight: '4px', fill: 'currentColor', flexShrink: 0 }} />}
      {time && <span style={{ fontWeight: 600, marginRight: '4px', flexShrink: 0 }}>{time}</span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
    </div>
  );
};

export default EventChip;
