import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import api from '../lib/api';
import toast from 'react-hot-toast';
import Avatar from '../components/common/Avatar';
import { Sun, Moon, Shield, Users, UserPlus, Trash2, Eye, EyeOff, Lock, LockKeyhole, LockKeyholeOpen, Pencil, X as XIcon, MapPinned } from 'lucide-react';
import { navItems, NavLinkItem } from '../components/layout/Sidebar';

// Flatten top-level items AND their subItems into one list of toggleable routes,
// so items like /tasks and /boards (which only exist as subItems) are included.
const ALL_PERMISSION_ITEMS: { to: string; label: string; icon: NavLinkItem['icon'] }[] = (() => {
    const seen = new Set<string>();
    const items: { to: string; label: string; icon: NavLinkItem['icon'] }[] = [];

    navItems
        .filter((n): n is NavLinkItem => !n.break)
        .forEach((item) => {
            if (!seen.has(item.to)) {
                seen.add(item.to);
                items.push({ to: item.to, label: item.label, icon: item.icon });
            }
            if (item.subItems) {
                item.subItems
                    .filter((sub) => !sub.subItems)
                    .forEach((sub) => {
                        if (!seen.has(sub.to)) {
                            seen.add(sub.to);
                            items.push({ to: sub.to, label: `${item.label} — ${sub.label}`, icon: item.icon });
                        }
                    });
            }
        });

    return items;
})();

const ALL_ALLOWED_TABS = ALL_PERMISSION_ITEMS.map((i) => i.to);

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', manager: 'Manager', member: 'Team Member' };

const SettingsPage: React.FC = () => {
    const { user } = useAuthStore();
    const { isDark, toggle } = useThemeStore();
    const [users, setUsers] = useState<any[]>([]);
    const [showCreateUser, setShowCreateUser] = useState(false);
    // const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'member' });
    const [newUser, setNewUser] = useState({
        name: '',
        email: '',
        password: '',
        role: 'member',
        permissions: { allowedTabs: ALL_ALLOWED_TABS },
    });
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        name: "", 
        email: "", 
        role: 'member', 
        permissions: { 
            allowedTabs: ALL_ALLOWED_TABS 
        } 
    });
    const [savingEdit, setSavingEdit] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [passwordData, setPasswordData] = useState({ newPassword: '', confirmPassword: '' });
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    const isAdmin = user?.role === 'admin';
    const isAdminOrManager = isAdmin || user?.role === 'manager';

    const [geoFenceRadius, setGeoFenceRadius] = useState(100);
    const [savingGeoFence, setSavingGeoFence] = useState(false);

    useEffect(() => {
        if (isAdminOrManager) {
            api.get('/settings').then(({ data }) => {
                if (data.settings?.geoFenceRadius) {
                    setGeoFenceRadius(data.settings.geoFenceRadius);
                }
            }).catch(() => {});
        }
    }, [isAdminOrManager]);

    const handleSaveGeoFence = async () => {
        setSavingGeoFence(true);
        try {
            await api.put('/settings', { geoFenceRadius });
            toast.success('Geo-fence radius updated');
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to update');
        } finally {
            setSavingGeoFence(false);
        }
    };

    useEffect(() => {
        if (isAdmin) {
            api.get('/auth/users').then(({ data }) => setUsers(data.users || []));
        }
    }, [isAdmin]);

    const createUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post('/auth/users/create', newUser);
            const { data } = await api.get('/auth/users');
            setUsers(data.users || []);
            setShowCreateUser(false);
            setNewUser({ name: '', email: '', password: '', role: 'member', permissions: { allowedTabs: navItems.filter((n): n is NavLinkItem => !n.break).map(n => n.to) } });
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to create user');
        } finally {
            setSaving(false);
        }
    };
    // ADD:
const startEditUser = (u: any) => {
    setEditingUserId(u._id);
    setEditForm({
        name: u.name,
        email : u.email,
        role: u.role,
        permissions: { allowedTabs: u.permissions?.allowedTabs ?? ALL_ALLOWED_TABS },
    });
};

const updateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    setSavingEdit(true);
    try {
        const { data } = await api.put(`/auth/users/${editingUserId}`, editForm);
        setUsers(prev => prev.map(u => u._id === editingUserId ? data.user : u));
        setEditingUserId(null);
        alert(data.message);
    } catch (e: any) {
        alert(e.response?.data?.message || 'Failed to update user');
    } finally {
        setSavingEdit(false);
    }
};

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user?._id) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('avatar', file);

            const { data } = await api.put(`/auth/users/${user._id}/avatar`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            // Update local storage and store
            localStorage.setItem('flowdesk_user', JSON.stringify(data.user));
            useAuthStore.setState({ user: data.user });

            // alert('Profile picture updated successfully!');
        } catch (error: any) {
            alert(error.response?.data?.message || 'Failed to update image');
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveAvatar = async () => {
        if (!user?._id) return;
        setUploading(true);
        try {
            const { data } = await api.delete(`/auth/users/${user._id}/avatar`);

            // Update local storage and store
            localStorage.setItem('flowdesk_user', JSON.stringify(data.user));
            useAuthStore.setState({ user: data.user });

            alert('Profile picture removed successfully!');
        } catch (error: any) {
            alert(error.response?.data?.message || 'Failed to remove avatar');
        } finally {
            setUploading(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setPasswordError('Passwords do not match');
            return;
        }
        if (passwordData.newPassword.length < 6) {
            setPasswordError('Password must be at least 6 characters long');
            return;
        }

        setPasswordLoading(true);
        try {
            await api.put('/auth/change-password', { newPassword: passwordData.newPassword });
            setPasswordSuccess('Password changed successfully');
            setPasswordData({ newPassword: '', confirmPassword: '' });
        } catch (error: any) {
            setPasswordError(error.response?.data?.message || 'Failed to change password');
        } finally {
            setPasswordLoading(false);
        }
    };

    const deactivateUser = async (id: string) => {
        if (!confirm('Deactivate this user?')) return;
        try {
            await api.delete(`/auth/users/${id}`);
            setUsers(prev => prev.map(u => u._id === id ? { ...u, isActive: false } : u));
        } catch { }
    };

    const activateUser = async (id: string) => {
        try {
            await api.put(`/auth/users/${id}/activate`);
            setUsers(prev => prev.map(u => u._id === id ? { ...u, isActive: true } : u));
            toast.success('User activated successfully');
        } catch {
            toast.error('Failed to activate user');
        }
    };

    const permanentDeleteUser = async (id: string) => {
        if (!isAdmin) return;
        if (!confirm('WARNING: This will PERMANENTLY delete the user and all their personal data. This cannot be undone. Are you sure?')) return;
        if (!confirm('Are you REALLY sure?')) return;

        try {
            await api.delete(`/auth/users/${id}/permanent`);
            setUsers(prev => prev.filter(u => u._id !== id));
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to delete user');
        }
    };

    const isMobile = window.innerWidth < 768;

    return (
        <div style={{ maxWidth: 800, width: '100%' }}>
            <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: isMobile ? 16 : 24 }}>Settings</h1>

            {/* Appearance */}
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 16 }}>Appearance</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {isDark ? <Moon size={18} /> : <Sun size={18} />}
                        <div>
                            <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{isDark ? 'Dark' : 'Light'} Theme</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Toggle between light and dark mode</div>
                        </div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={toggle}>
                        Switch to {isDark ? 'Light' : 'Dark'}
                    </button>
                </div>
            </div>

            {/* Profile */}
            <div className="card" style={{ padding: 24, marginBottom: 16 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 20 }}>Profile Overview</h3>
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 16 : 24, alignItems: isMobile ? 'center' : 'center' }}>
                    <div
                        onClick={() => !uploading && fileInputRef.current?.click()}
                        style={{ cursor: 'pointer', position: 'relative', flexShrink: 0 }}
                    >
                        <Avatar
                            src={user?.avatar}
                            name={user?.name}
                            size={isMobile ? 64 : 80}
                            style={{
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                border: '3px solid var(--color-surface)'
                            }}
                        />
                        <div
                            className="avatar-overlay"
                            style={{
                                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                color: 'white', opacity: uploading ? 1 : 0, transition: 'all 0.2s',
                                backdropFilter: 'blur(2px)', borderRadius: '50%'
                            }}>
                            {uploading ? (
                                <div style={{
                                    width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)',
                                    borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite'
                                }} />
                            ) : (
                                <>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 4 }}>
                                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                        <circle cx="12" cy="13" r="4"></circle>
                                    </svg>
                                    <span style={{ fontSize: '0.625rem', fontWeight: 500 }}>Update</span>
                                </>
                            )}
                        </div>
                    </div>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleAvatarUpload} />
                    <div style={{ flex: 1, textAlign: isMobile ? 'center' : 'left', minWidth: 0 }}>
                        <div style={{ fontSize: isMobile ? '1.1rem' : '1.25rem', fontWeight: 600, marginBottom: 4 }}>{user?.name}</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 8, wordBreak: 'break-all' }}>{user?.email}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: isMobile ? 'center' : 'flex-start' }}>
                            <div style={{
                                padding: '4px 10px',
                                background: 'var(--color-primary-light)', color: 'var(--color-primary)',
                                borderRadius: 12, fontSize: '0.75rem', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 4
                            }}>
                                <Shield size={12} strokeWidth={2.5} />
                                {ROLE_LABELS[user?.role || '']}
                            </div>
                            {user?._id && !isMobile && (
                                <div style={{
                                    padding: '4px 10px',
                                    background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)',
                                    borderRadius: 12, fontSize: '0.75rem', fontWeight: 600,
                                }}>
                                    Employee ID: {user.employeeId}
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0, ...(isMobile ? { width: '100%', justifyContent: 'center' } : { marginLeft: 'auto', textAlign: 'right' }) }}>
                        {user?.avatar && (
                            <button
                                className="btn btn-ghost"
                                onClick={handleRemoveAvatar}
                                disabled={uploading}
                                style={{ color: 'var(--color-error)', fontSize: isMobile ? '0.8rem' : undefined }}
                            >
                                Remove Photo
                            </button>
                        )}
                        <button
                            className="btn btn-secondary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            style={{ fontSize: isMobile ? '0.8rem' : undefined }}
                        >
                            {uploading ? 'Updating...' : 'Change Photo'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Security */}
            <div className="card" style={{ padding: 24, marginBottom: 16 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Lock size={18} /> Security
                </h3>
                <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: isMobile ? '100%' : 400 }}>
                    {passwordError && <div style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{passwordError}</div>}
                    {passwordSuccess && <div style={{ color: 'var(--color-success)', fontSize: '0.875rem' }}>{passwordSuccess}</div>}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>New Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="input"
                                type={showNewPassword ? 'text' : 'password'}
                                required
                                minLength={6}
                                value={passwordData.newPassword}
                                onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                style={{ width: '100%', paddingRight: 40 }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                            >
                                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Confirm New Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="input"
                                type={showConfirmPassword ? 'text' : 'password'}
                                required
                                minLength={6}
                                value={passwordData.confirmPassword}
                                onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                style={{ width: '100%', paddingRight: 40 }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                            >
                                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 8 }}>
                        <button type="submit" className="btn btn-primary" disabled={passwordLoading}>
                            {passwordLoading ? 'Updating...' : 'Change Password'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Geo-Fence Settings (Admin/Manager) */}
            {isAdminOrManager && (
                <div className="card" style={{ padding: 20, marginBottom:16 }}>
                    <div style={{ marginBottom: 16 }}>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>
                            <MapPinned size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
                            Geo-Fence Settings
                        </h3>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                            Set the global geo-fence radius (in meters) for all field visits ( minimum 1m to maximum 10000m )
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <input
                            type="number"
                            min={0}
                            max={10000}
                            value={geoFenceRadius}
                            onChange={e => setGeoFenceRadius(Number(e.target.value))}
                            className="input"
                            style={{ width: 120 }}
                        />
                        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>meters</span>
                        <button
                            onClick={handleSaveGeoFence}
                            disabled={savingGeoFence}
                            className="btn btn-primary btn-sm"
                        >
                            {savingGeoFence ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            )}

            {/* User Management (Admin only) */}
            {isAdmin && (
                <div className="card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                            <Users size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
                            User Management
                        </h3>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowCreateUser(!showCreateUser)}>
                            <UserPlus size={16} /> Add User
                        </button>
                    </div>

                    {showCreateUser && (
                        <form onSubmit={createUser} className="card" style={{ padding: 16, marginBottom: 16, border: '1px solid var(--color-primary)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                <input className="input" required placeholder="Full name" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
                                <input className="input" type="email" required placeholder="Email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                <input className="input" type="password" required placeholder="Password" minLength={6} value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
                                <select className="select" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </div>
                            {/* Tab Permissions */}
                            <div>
                                <label style={{ fontSize: '0.8125rem', fontWeight: 500, marginBottom: 8, display: 'block', color: 'var(--color-text-secondary)' }}>
                                    Module Access
                                </label>
                                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 8 }}>

                                    {ALL_PERMISSION_ITEMS.map(item => {
                                        const isChecked = newUser.permissions.allowedTabs.includes(item.to);
                                        return (
                                            <label
                                                key={item.to}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    padding: '6px 10px',
                                                    borderRadius: 6,
                                                    border: `1px solid ${isChecked ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                                    background: isChecked ? 'var(--color-primary-light)' : 'transparent',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8125rem',
                                                    fontWeight: 500,
                                                    color: isChecked ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                                    transition: 'all 0.15s',
                                                    userSelect: 'none',
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => {
                                                        const current = newUser.permissions.allowedTabs;
                                                        const updated = isChecked
                                                            ? current.filter(t => t !== item.to)
                                                            : [...current, item.to];
                                                        setNewUser({ ...newUser, permissions: { allowedTabs: updated } });
                                                    }}
                                                    style={{ display: 'none' }}
                                                />
                                                <item.icon size={14} />
                                                {item.label}
                                            </label>
                                        );
                                    })}
                                    {/* {navItems.filter(item => !item.break).map(item => {
                                        const isChecked = newUser.permissions.allowedTabs.includes(item.to);
                                        return (
                                            <label
                                                key={item.to}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    padding: '6px 10px',
                                                    borderRadius: 6,
                                                    border: `1px solid ${isChecked ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                                    background: isChecked ? 'var(--color-primary-light)' : 'transparent',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8125rem',
                                                    fontWeight: 500,
                                                    color: isChecked ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                                    transition: 'all 0.15s',
                                                    userSelect: 'none',
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => {
                                                        const current = newUser.permissions.allowedTabs;
                                                        const updated = isChecked
                                                            ? current.filter(t => t !== item.to)
                                                            : [...current, item.to];
                                                        setNewUser({ ...newUser, permissions: { allowedTabs: updated } });
                                                    }}
                                                    style={{ display: 'none' }}
                                                />
                                                <item.icon size={14} />
                                                {item.label}
                                            </label>
                                        );
                                    })} */}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCreateUser(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Creating...' : 'Create User'}</button>
                            </div>
                        </form>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {/* {users
                            .filter(u => u._id !== user?._id)
                            .map(u => (
                                <div key={u._id} style={{
                                    padding: '10px 14px', borderRadius: 8,
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    flexWrap: isMobile ? 'wrap' as any : 'nowrap' as any, gap: isMobile ? 8 : 0,
                                    background: u.isActive ? 'transparent' : 'var(--color-surface-hover)',
                                    opacity: u.isActive ? 1 : 0.5,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <Avatar src={u.avatar} name={u.name} size={32} />
                                        <div>
                                            <div style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{u.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{u.email}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span className="badge" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
                                            {ROLE_LABELS[u.role]}
                                        </span>
                                        <button className="btn btn-ghost btn-sm" onClick={() => startEditUser(u)} style={{ color: 'var(--color-text-secondary)' }} title="Edit permissions">
                                            <Pencil size={16} />
                                        </button>
                                        {u.isActive && u._id !== user?._id && (
                                            <button className="btn btn-ghost btn-sm" onClick={() => deactivateUser(u._id)} style={{ color: 'var(--color-warning)' }} title="Deactivate">
                                                <Shield size={16} />
                                            </button>
                                        )}
                                        {u._id !== user?._id && (
                                            <button className="btn btn-ghost btn-sm" onClick={() => permanentDeleteUser(u._id)} style={{ color: 'var(--color-error)' }} title="Delete Permanently">
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))} */}
                            {users
                                .filter(u => u._id !== user?._id)
                                .map(u => (
                                    <div key={u._id}>
                                        <div style={{
                                            padding: '10px 14px', borderRadius: 8,
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            flexWrap: isMobile ? 'wrap' as any : 'nowrap' as any, gap: isMobile ? 8 : 0,
                                            background: u.isActive ? 'transparent' : 'var(--color-surface-hover)',
                                            opacity: u.isActive ? 1 : 0.5,
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <Avatar src={u.avatar} name={u.name} size={32} />
                                                <div>
                                                    <div style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{u.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{u.email}</div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span className="badge" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
                                                    {ROLE_LABELS[u.role]}
                                                </span>
                                                <button className="btn btn-ghost btn-sm" onClick={() => startEditUser(u)} style={{ color: 'var(--color-text-secondary)' }} title="Edit permissions">
                                                    <Pencil size={16} />
                                                </button>
                                                {u.isActive && u._id !== user?._id && (
                                                    <button className="btn btn-ghost btn-sm" onClick={() => deactivateUser(u._id)} style={{ color: 'var(--color-warning)' }} title="Deactivate">
                                                        <LockKeyhole size={16} />
                                                    </button>
                                                )}
                                                {!u.isActive && u._id !== user?._id && (
                                                    <button className="btn btn-ghost btn-sm" onClick={() => activateUser(u._id)} style={{ color: 'var(--color-success)' }} title="Activate">
                                                        <LockKeyholeOpen size={16} />
                                                    </button>
                                                )}
                                                {/* {!u.isActive && u._id !== user?._id && ( */}
                                                    <button className="btn btn-ghost btn-sm" onClick={() => permanentDeleteUser(u._id)} style={{ color: 'var(--color-danger)' }} title="Activate">
                                                        <Trash2 size={16} />
                                                    </button>
                                                {/* // )} */}


                                            </div>
                                        </div>

                                        {editingUserId === u._id && (
                                            <form onSubmit={updateUser} className="card" style={{ padding: 16, marginTop: 6, marginBottom: 10, border: '1px solid var(--color-primary)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Editing: {u.name}</span>
                                                    <button type="button" onClick={() => setEditingUserId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                                                        <XIcon size={16} />
                                                    </button>
                                                </div>

                                                <div className='flex items-center justify-center'>
                                                    <span className='min-w-20' >
                                                        Name : 
                                                    </span>
                                                    <div className='flex-1' >
                                                        <input  className='input flex-1' value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} type='text'
                                                            required
                                                            minLength={6}
                                                            style={{ width: '100%', paddingRight: 40 }}
                                                        >
                                                        </input>
                                                    </div>
                                                </div>
                                                <div className='flex items-center justify-center'>
                                                    <span className='min-w-20' >
                                                        Role : 
                                                    </span>
                                                    <div className='flex-1' >
                                                        <select className="select flex-1" value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                                                            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className='flex items-center justify-center'>
                                                    <span className='min-w-20' >
                                                        Email : 
                                                    </span>
                                                    <div className='flex-1' >
                                                        <input  className='input flex-1' value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} type='text'
                                                            required
                                                            minLength={6}
                                                            style={{ width: '100%', paddingRight: 40 }}
                                                        >
                                                        </input>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label style={{ fontSize: '0.8125rem', fontWeight: 500, marginBottom: 8, display: 'block', color: 'var(--color-text-secondary)' }}>
                                                        Module Access / Permission
                                                    </label>
                                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 8 }}>
                                                        {ALL_PERMISSION_ITEMS.map(item => {
                                                            const isChecked = editForm.permissions.allowedTabs.includes(item.to);
                                                            return (
                                                                <label
                                                                    key={item.to}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 8,
                                                                        padding: '6px 10px',
                                                                        borderRadius: 6,
                                                                        border: `1px solid ${isChecked ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                                                        background: isChecked ? 'var(--color-primary-light)' : 'transparent',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.8125rem',
                                                                        fontWeight: 500,
                                                                        color: isChecked ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                                                        transition: 'all 0.15s',
                                                                        userSelect: 'none',
                                                                    }}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isChecked}
                                                                        onChange={() => {
                                                                            const current = editForm.permissions.allowedTabs;
                                                                            const updated = isChecked
                                                                                ? current.filter(t => t !== item.to)
                                                                                : [...current, item.to];
                                                                            setEditForm({ ...editForm, permissions: { allowedTabs: updated } });
                                                                        }}
                                                                        style={{ display: 'none' }}
                                                                    />
                                                                    <item.icon size={14} />
                                                                    {item.label}
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingUserId(null)}>Cancel</button>
                                                    <button type="submit" className="btn btn-primary btn-sm" disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save Changes'}</button>
                                                </div>
                                            </form>
                                        )}
                                    </div>
                                ))}
                                </div>
                            </div>
                        )}
        </div >
    );
};

export default SettingsPage;
