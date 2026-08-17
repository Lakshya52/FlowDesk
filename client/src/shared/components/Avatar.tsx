import React from 'react';

interface AvatarProps {
    src?: string;
    name?: string;
    size?: number;
    style?: React.CSSProperties;
    className?: string;
}

const Avatar: React.FC<AvatarProps> = ({ src, name, size = 32, style, className }) => {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'https://flowdesk-backend-l5tt.onrender.com';
    const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

    const baseStyle: React.CSSProperties = {
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: size * 0.4,
        fontWeight: 600,
        overflow: 'hidden',
        flexShrink: 0,
        ...style
    };

    if (src) {
        return (
            <div
                className={className}
                style={{
                    ...baseStyle,
                    background: `url(${socketUrl}${src}) center/cover`,
                }}
                title={name}
            />
        );
    }

    return (
        <div
            className={className}
            style={{
                ...baseStyle,
                background: 'linear-gradient(135deg, var(--color-primary), #a78bfa)',
            }}
            title={name}
        >
            {initials}
        </div>
    );
};

export default Avatar;
