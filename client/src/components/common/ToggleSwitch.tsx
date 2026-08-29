import React from 'react';

interface ToggleSwitchProps {
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
    size?: number;
    label?: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, disabled, size = 20, label }) => {
    const trackWidth = size * 2;
    const trackHeight = size;
    const knobSize = size - 6;

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={onChange}
            disabled={disabled}
            style={{
                position: 'relative',
                width: trackWidth,
                height: trackHeight,
                borderRadius: trackHeight / 2,
                background: checked ? 'var(--color-primary)' : 'var(--color-border)',
                border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                padding: 0,
                flexShrink: 0,
                transition: 'background 0.2s ease',
                boxShadow: checked
                    ? '0 0 0 3px var(--color-primary-light)'
                    : 'inset 0 1px 2px rgba(0,0,0,0.1)',
            }}
            aria-label={label}
        >
            <span
                style={{
                    position: 'absolute',
                    top: 3,
                    left: checked ? trackWidth - knobSize - 3 : 3,
                    width: knobSize,
                    height: knobSize,
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                    transition: 'left 0.2s ease',
                }}
            />
        </button>
    );
};

export default ToggleSwitch;
