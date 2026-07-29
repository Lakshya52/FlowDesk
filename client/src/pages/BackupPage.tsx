import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { Download, Clock, Mail, Calendar, Trash2, Loader2, HardDrive, Send, Plus } from 'lucide-react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FREQ_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const BackupPage: React.FC = () => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    frequency: 'daily',
    hour: 2,
    minute: 0,
    dayOfWeek: 0,
    dayOfMonth: 1,
    email: user?.email || '',
    isActive: true,
  });

  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    try {
      const { data } = await api.get('/backup/schedule');
      setSchedules(data.schedules || []);
    } catch (err: any) {
      toast.error('Failed to load backup schedules');
    }
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const response = await api.post('/backup/export', {}, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const disposition = response.headers['content-disposition'];
      const match = disposition?.match(/filename="(.+)"/);
      link.download = match ? match[1] : `flowdesk-backup-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Backup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!form.email) {
      toast.error('Email is required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/backup/schedule', form);
      toast.success('Backup schedule created');
      setShowForm(false);
      setForm({ ...form, email: user?.email || '', hour: 2, minute: 0, frequency: 'daily', dayOfWeek: 0, dayOfMonth: 1, isActive: true });
      loadSchedules();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create schedule');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    try {
      await api.delete(`/backup/schedule/${id}`);
      toast.success('Schedule removed');
      loadSchedules();
    } catch (err: any) {
      toast.error('Failed to remove schedule');
    }
  };

  const handleEmailNow = (scheduleEmail: string) => {
    const targetEmail = scheduleEmail || user?.email;
    if (!targetEmail) {
      toast.error('No email configured');
      return;
    }
    setEmailLoading(targetEmail);
    api.post('/backup/email-now', { email: targetEmail })
      .then(() => toast.success(`Backup sent to ${targetEmail}`))
      .catch((err) => toast.error(err.response?.data?.message || 'Failed'))
      .finally(() => setEmailLoading(null));
  };

  if (!user || user.role !== 'admin') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--color-text-tertiary)' }}>
        Only admins can access backup settings.
      </div>
    );
  }

  const timeStr = (h: number, m: number) =>
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ padding: 10, borderRadius: 12, background: 'var(--color-primary-light)' }}>
          <HardDrive style={{ width: 24, height: 24, color: 'var(--color-primary)' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Backup</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>Export your tenant data or schedule automatic backups</p>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px 0' }}>Download Backup</h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: '0 0 16px 0' }}>Download a ZIP of all your tenant data</p>
        <button
          onClick={handleExport}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : <Download style={{ width: 16, height: 16 }} />}
          {loading ? 'Generating...' : 'Download Backup Now'}
        </button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Scheduled Backups</h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>Automatically email backups on a schedule</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn btn-primary"
          >
            <Plus style={{ width: 16, height: 16 }} />
            Add Schedule
          </button>
        </div>

        {showForm && (
          <div style={{ marginBottom: 24, padding: 16, background: 'var(--color-surface-hover)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <select
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
              className="select"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <input
              type="time"
              value={timeStr(form.hour, form.minute)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number);
                setForm({ ...form, hour: h, minute: m });
              }}
              className="input"
            />
            {form.frequency === 'weekly' && (
              <select
                value={form.dayOfWeek}
                onChange={(e) => setForm({ ...form, dayOfWeek: +e.target.value })}
                className="select"
              >
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            )}
            {form.frequency === 'monthly' && (
              <input
                type="number"
                value={form.dayOfMonth}
                onChange={(e) => setForm({ ...form, dayOfMonth: Math.min(31, Math.max(1, +e.target.value)) })}
                className="input"
                min={1} max={31}
              />
            )}
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="admin@company.com"
              className="input"
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                style={{ borderRadius: 4, border: '1px solid var(--color-border)', accentColor: 'var(--color-primary)' }}
              />
              <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Active</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleCreateSchedule}
                disabled={saving}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                {saving ? 'Creating...' : 'Create Schedule'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {schedules.length === 0 && !showForm && (
          <p style={{ fontSize: 14, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '32px 0', margin: 0 }}>
            No schedules yet. Click "Add Schedule" to create one.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {schedules.map((s) => (
            <div
              key={s._id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 16,
                background: 'var(--color-surface-hover)',
                borderRadius: 12,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Calendar style={{ width: 16, height: 16, color: 'var(--color-text-tertiary)' }} />
                  <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>
                    {FREQ_LABELS[s.frequency] || s.frequency}
                  </span>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>at</span>
                  <Clock style={{ width: 16, height: 16, color: 'var(--color-text-tertiary)' }} />
                  <span style={{ fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>{timeStr(s.hour, s.minute)}</span>
                  {s.frequency === 'weekly' && (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>({DAYS[s.dayOfWeek]})</span>
                  )}
                  {s.frequency === 'monthly' && (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>(day {s.dayOfMonth})</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)' }}>
                  <Mail style={{ width: 16, height: 16 }} />
                  <span>{s.email}</span>
                  <span
                    className={s.isActive ? 'badge badge-completed' : 'badge badge-todo'}
                    style={{ marginLeft: 8 }}
                  >
                    {s.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  Next: {new Date(s.nextRunAt).toLocaleString()}
                  {s.lastRunAt && <> · Last: {new Date(s.lastRunAt).toLocaleString()}</>}
                  {s.lastRunStatus && (
                    <span style={{ marginLeft: 4, color: s.lastRunStatus === 'success' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      ({s.lastRunStatus})
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => handleEmailNow(s.email)}
                  disabled={emailLoading === s.email}
                  className="btn btn-ghost btn-sm"
                  title="Send backup now"
                  style={{ color: 'var(--color-success)' }}
                >
                  {emailLoading === s.email ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : <Send style={{ width: 16, height: 16 }} />}
                </button>
                <button
                  onClick={() => handleDeleteSchedule(s._id)}
                  className="btn btn-ghost btn-sm"
                  title="Remove schedule"
                  style={{ color: 'var(--color-danger)' }}
                >
                  <Trash2 style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BackupPage;
