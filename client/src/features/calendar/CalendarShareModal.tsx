import React, { useState, useEffect } from 'react';
import { X, Share2 } from 'lucide-react';
import { useCalendarStore } from '@/store/calendarStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import Avatar from '@/shared/components/Avatar';
import Modal from '@/shared/components/Modal';

const CalendarShareModal: React.FC = () => {
  const { isShareModalOpen, closeShareModal, selectedCalendarId } = useCalendarStore();
  const queryClient = useQueryClient();
  
  const [calendarMeta, setCalendarMeta] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [shareUserId, setShareUserId] = useState('');
  const [sharePermission, setSharePermission] = useState('viewer');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (isShareModalOpen && selectedCalendarId) {
      const loadCalendar = async () => {
        try {
          const res = await api.get('/calendars');
          const cal = res.data.find((c: any) => c._id === selectedCalendarId);
          if (cal) {
            setCalendarMeta(cal);
          }
        } catch {
          // ignore
        }
      };
      loadCalendar();

      const fetchUsers = async () => {
        try {
          const res = await api.get('/auth/users?all=true');
          setUsersList(res.data.users || res.data || []);
        } catch {
          // ignore
        }
      };
      fetchUsers();
    } else if (!isShareModalOpen) {
      setShareUserId('');
      setSharePermission('viewer');
    }
  }, [isShareModalOpen, selectedCalendarId]);

  if (!isShareModalOpen || !selectedCalendarId) return null;

  const handleShare = async () => {
    if (!shareUserId || !selectedCalendarId) return;
    try {
      setSharing(true);
      const targetUser = usersList.find((u: any) => u._id === shareUserId);
      if (!targetUser) {
        toast.error('User not found');
        return;
      }
      await api.post(`/calendars/${selectedCalendarId}/share`, {
        userId: targetUser._id,
        permission: sharePermission
      });
      toast.success(`Calendar shared with ${targetUser.name || targetUser.email}`);
      setShareUserId('');
      
      const res = await api.get('/calendars');
      const cal = res.data.find((c: any) => c._id === selectedCalendarId);
      if (cal) setCalendarMeta(cal);
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to share calendar');
    } finally {
      setSharing(false);
    }
  };

  const handleRemoveShare = async (userId: string) => {
    if (!selectedCalendarId) return;
    try {
      await api.delete(`/calendars/${selectedCalendarId}/share/${userId}`);
      toast.success('User removed');
      const res = await api.get('/calendars');
      const cal = res.data.find((c: any) => c._id === selectedCalendarId);
      if (cal) setCalendarMeta(cal);
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
    } catch {
      toast.error('Failed to remove user');
    }
  };

  return (
    <Modal isOpen={isShareModalOpen} onClose={closeShareModal}>
      <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: '12px', boxShadow: 'var(--shadow-xl)', width: '100%', maxWidth: '480px', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid var(--color-border)', maxHeight: '90vh' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
            Share Calendar
          </h2>
          <button 
            onClick={closeShareModal}
            style={{ color: 'var(--color-text-tertiary)', border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', borderRadius: '6px', transition: 'all 0.2s' }}
            onMouseOver={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
            onMouseOut={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '24px' }}>
          {calendarMeta && (
            <div style={{ marginBottom: '20px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              Sharing settings for <strong>{calendarMeta.name}</strong>
            </div>
          )}

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--color-text)', marginBottom: '8px' }}>
              <Share2 size={16} color="var(--color-text-tertiary)" />
              Invite Users
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <select
                value={shareUserId}
                onChange={e => setShareUserId(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '13px', outline: 'none', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
              >
                <option value="">Select a user...</option>
                {usersList.map(u => (
                  <option key={u._id} value={u._id}>{u.name || u.email}</option>
                ))}
              </select>
              <select
                value={sharePermission}
                onChange={e => setSharePermission(e.target.value)}
                style={{ padding: '8px 8px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '13px', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button
                type="button"
                onClick={handleShare}
                disabled={sharing || !shareUserId}
                style={{ padding: '8px 12px', borderRadius: '6px', border: 'none', fontSize: '13px', fontWeight: 500, cursor: sharing || !shareUserId ? 'not-allowed' : 'pointer', backgroundColor: 'var(--color-primary)', color: '#fff', opacity: sharing || !shareUserId ? 0.5 : 1, whiteSpace: 'nowrap' }}
              >
                {sharing ? '...' : 'Add'}
              </button>
            </div>

            {/* Shared users list */}
            {calendarMeta?.sharedWith?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', margin: '8px 0' }}>People with access</h4>
                {calendarMeta.sharedWith.map((s: any) => (
                  <div key={s.user?._id || s.user} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '6px', backgroundColor: 'var(--color-bg)', fontSize: '13px', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar src={s.user?.avatar} name={s.user?.name || s.user?.email || 'User'} size={28} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>
                          {s.user?.name || s.user?.email || s.user}
                        </span>
                        <span style={{ color: 'var(--color-text-tertiary)', fontSize: '11px', marginTop: '2px' }}>
                          {s.permission} {s.status === 'pending' && <span style={{ color: '#f59e0b', fontWeight: 600 }}> • Pending</span>}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveShare(s.user?._id || s.user)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-tertiary)', padding: '4px', borderRadius: '4px' }}
                      onMouseOver={(e) => { e.currentTarget.style.color = 'var(--color-danger)'; e.currentTarget.style.backgroundColor = 'var(--color-danger-light)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '13px', backgroundColor: 'var(--color-bg)', borderRadius: '6px', border: '1px dashed var(--color-border)' }}>
                This calendar hasn't been shared with anyone yet.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '16px 24px', borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', flexShrink: 0 }}>
          <button
            type="button"
            onClick={closeShareModal}
            style={{ padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: '#ffffff', backgroundColor: 'var(--color-primary)', border: '1px solid transparent', borderRadius: '6px', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CalendarShareModal;
