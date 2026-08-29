import { create } from 'zustand';

interface IconsAnimationState {
    enabled: boolean;
    toggle: () => void;
}

export const useIconsAnimationStore = create<IconsAnimationState>((set) => ({
    enabled: localStorage.getItem('flowdesk_icons_animation') !== 'off',
    toggle: () =>
        set((state) => {
            const enabled = !state.enabled;
            localStorage.setItem('flowdesk_icons_animation', enabled ? 'on' : 'off');
            return { enabled };
        }),
}));
