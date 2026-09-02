import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import Sidebar from './Sidebar';
import Header from './Header';
import WhatsNewModal from '../common/WhatsNewModal';
import { WhatsNewEntry, fetchWhatsNewEntry, hasNewVersion, markVersionSeen } from '../../lib/whatsnew';
import packageJson from '../../../package.json';

const AppLayout: React.FC = () => {
    const { user } = useAuthStore();
    const location = useLocation();
    const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(window.innerWidth >= 768);
    const [sidebarWidth, setSidebarWidth] = React.useState(() => {
        const saved = localStorage.getItem('sidebar-width');
        return saved ? parseInt(saved, 10) : 260;
    });
    const [isResizing, setIsResizing] = React.useState(false);

    // "What's new" — fetch the latest GitHub release, compare to localStorage,
    // and show the modal if the version is newer (or this is the first run).
    const [whatsNewEntry, setWhatsNewEntry] = React.useState<WhatsNewEntry | null>(null);

    React.useEffect(() => {
        const currentVersion = packageJson.version;
        // Always mark the current version on first-ever run so existing
        // users don't see a stale changelog. New versions will override.
        if (!localStorage.getItem("flowdesk-last-seen-version")) {
            markVersionSeen(currentVersion);
        }

        // Only fetch the modal if the user hasn't seen this version yet
        if (!hasNewVersion(currentVersion)) return;

        let cancelled = false;
        fetchWhatsNewEntry(currentVersion).then((entry) => {
            if (!cancelled && entry) setWhatsNewEntry(entry);
        });
        return () => { cancelled = true; };
    }, []);

    React.useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            // Auto close/open based on screen switch
            setIsSidebarOpen(!mobile);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    React.useEffect(() => {
        if (isMobile) {
            setIsSidebarOpen(false);
        }
    }, [location.pathname, isMobile]);

    React.useEffect(() => {
        if (!isResizing && !isMobile) {
            localStorage.setItem('sidebar-width', sidebarWidth.toString());
        }
    }, [sidebarWidth, isResizing, isMobile]);

        const stopResizing = React.useCallback(() => {
        setIsResizing(false);
    }, []);

    const startResizing = React.useCallback(() => {
        if (isMobile) return;
        setIsResizing(true);
        // Safety: auto-reset after 5s in case mouseup is missed
        setTimeout(() => setIsResizing(false), 5000);
    }, [isMobile]);

    const resize = React.useCallback(
        (mouseMoveEvent: MouseEvent) => {
            if (isResizing && !isMobile) {
                const newWidth = mouseMoveEvent.clientX;
                if (newWidth > 180 && newWidth < 600) {
                    setSidebarWidth(newWidth);
                }
            }
        },
        [isResizing, isMobile]
    );
    React.useEffect(() => {
        const handleBlur = () => setIsResizing(false);
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        window.addEventListener("blur", handleBlur);
        document.addEventListener("mouseleave", handleBlur);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
            window.removeEventListener("blur", handleBlur);
            document.removeEventListener("mouseleave", handleBlur);
        };
    }, [resize, stopResizing]);

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return (
        <div style={{ 
            display: 'flex', 
            height: '100vh', 
            overflow: 'hidden',
            cursor: isResizing ? 'col-resize' : 'default',
            userSelect: isResizing ? 'none' : 'auto',
            position: 'relative',
        }}>
            {isMobile && isSidebarOpen && (
                <div 
                    onClick={() => setIsSidebarOpen(false)} 
                    style={{ 
                        position: 'fixed', 
                        inset: 0, 
                        background: 'rgba(0,0,0,0.5)', 
                        zIndex: 4800,
                        backdropFilter: 'blur(2px)',
                    }} 
                />
            )}
            
            <div style={{
                position: isMobile ? 'fixed' : 'relative',
                left: isMobile ? (isSidebarOpen ? 0 : '-280px') : 0,
                zIndex: 4900,
                transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                height: '100vh',
                background: 'var(--color-surface)',
                boxShadow: isMobile && isSidebarOpen ? '4px 0 24px rgba(0,0,0,0.15)' : 'none',
            }}>
                <Sidebar isOpen={isSidebarOpen} toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} width={isMobile ? 260 : sidebarWidth} />
            </div>
            
            {/* Resizer Handle */}
            {isSidebarOpen && !isMobile && (
                <div
                    onMouseDown={startResizing}
                    style={{
                        width: '4px',
                        cursor: 'col-resize',
                        background: isResizing ? 'var(--color-primary)' : 'transparent',
                        zIndex: 20,
                        transition: 'background 0.2s ease',
                        marginLeft: '-2px', // overlapping the border
                        marginRight: '-2px',
                    }}
                    onMouseEnter={(e) => { if(!isResizing) e.currentTarget.style.background = 'var(--color-primary-light)'; }}
                    onMouseLeave={(e) => { if(!isResizing) e.currentTarget.style.background = 'transparent'; }}
                />
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%', height: '100%' }}>
                <Header toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
                <main id="main-content-scroll"
                    className="overflow-auto relative bg-(var(--color-bg))"
                style={{
                    flex: 1,
                    padding: location.pathname === '/canvas' ? '0' : (isMobile ? '16px' : '24px 32px'),
                }}>
                    <div className="animate-fade-in">
                        <Outlet />
                    </div>
                </main>
            </div>
            <WhatsNewModal
                open={!!whatsNewEntry}
                entry={whatsNewEntry!}
                onClose={() => setWhatsNewEntry(null)}
            />
        </div>
    );
};

export default AppLayout;
