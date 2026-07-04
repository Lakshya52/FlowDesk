import React, { useState } from 'react';
import { X, Chrome, CheckCircle, Loader, Check } from 'lucide-react';
import { useCalendarStore } from '../../store/calendarStore';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import Modal from '../common/Modal';
// declare global {
//   interface Window {
//     electronAPI?: {
//       onGoogleAuthSuccess?: (callback: () => void) => void;
//       removeGoogleAuthListener?: () => void;
//     };
//   }
// }

type ImportStep = 'idle' | 'connecting' | 'selecting' | 'importing' | 'success' | 'error';

interface GoogleCalendar {
  id: string;
  name: string;
  color: string;
  primary: boolean;
}

const ImportModal: React.FC = () => {
  const { isImportModalOpen, closeImportModal } = useCalendarStore();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<ImportStep>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, calendarName: '' });

  if (!isImportModalOpen) return null;

 const handleGoogleConnect = async () => {
  setStep('connecting');
  setErrorMsg('');
  try {
    const res = await api.get('/import/google-calendar/auth-url');
    const { authUrl } = res.data;

    // Open in external browser (Electron uses shell.openExternal via setWindowOpenHandler)
    window.open(authUrl, '_blank');

    const fetchCalendars = async () => {
      try {
        const listRes = await api.get('/import/google-calendar/list');
        setGoogleCalendars(listRes.data.calendars);
        setSelectedIds(new Set(listRes.data.calendars.map((c: GoogleCalendar) => c.id)));
        setStep('selecting');
      } catch {
        setStep('error');
        setErrorMsg('Failed to fetch your Google calendars.');
      }
    };

    // Listen for deep link callback from Electron main process
    if (window.electronAPI?.onGoogleAuthSuccess) {
      window.electronAPI.onGoogleAuthSuccess(async () => {
        window.electronAPI?.removeGoogleAuthListener?.();
        await fetchCalendars();
      });
    } else {
      // Fallback for browser (dev mode) — use postMessage
      const handleMessage = async (event: MessageEvent) => {
        if (event.data !== 'google-oauth-success') return;
        window.removeEventListener('message', handleMessage);
        await fetchCalendars();
      };
      window.addEventListener('message', handleMessage);
    }
  } catch {
    setStep('error');
    setErrorMsg('Could not initiate Google sign-in. Please try again.');
  }
};

  const toggleCalendar = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };


  const handleImport = async () => {
    if (selectedIds.size === 0) return;
    setStep('importing');

    const selected = googleCalendars.filter(c => selectedIds.has(c.id));
    setImportProgress({ current: 0, total: selected.length, calendarName: '' });

    try {
      for (let i = 0; i < selected.length; i++) {
        const cal = selected[i];
        setImportProgress({ current: i, total: selected.length, calendarName: cal.name });
        await api.post('/import/google-calendar/sync-one', {
          calendarId: cal.id,
          calendarName: cal.name,
          calendarColor: cal.color,
        });
        setImportProgress({ current: i + 1, total: selected.length, calendarName: cal.name });
      }
      await queryClient.invalidateQueries({ queryKey: ['calendars'] });
      await queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      setStep('success');
    } catch {
      setStep('error');
      setErrorMsg('Import failed. Please try again.');
    }
  };

const handleClose = () => {
    setStep('idle');
    setErrorMsg('');
    setGoogleCalendars([]);
    setSelectedIds(new Set());
    setImportProgress({ current: 0, total: 0, calendarName: '' });
    closeImportModal();
  };

  return (
    <Modal isOpen={isImportModalOpen} onClose={handleClose}>
      <div style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-lg)',
        width: '100%', maxWidth: '440px',
        padding: '24px',
        position: 'relative',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
            Import from Google Calendar
          </h2>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Step: idle */}
        {step === 'idle' && (
          <>
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
              Connect your Google account to choose which calendars to import.
            </p>
            <button
              onClick={handleGoogleConnect}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '12px',
                padding: '12px 16px',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontSize: '14px', fontWeight: 500,
                color: 'var(--color-text)', cursor: 'pointer',
              }}
              onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
              onMouseOut={e => (e.currentTarget.style.backgroundColor = 'var(--color-surface)')}
            >
              <Chrome size={18} color="#4285F4" />
              Continue with Google
            </button>
            <p style={{ marginTop: '16px', fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              We only read your calendar data. We never modify or delete your Google events.
            </p>
          </>
        )}

        {/* Step: connecting */}
        {step === 'connecting' && (
          <div className='flex items-center flex-col' style={{ textAlign: 'center', padding: '24px 0' }}>
            <Loader size={32} color="var(--color-primary)" style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
              Waiting for Google authorization...
            </p>
          </div>
        )}

        {/* Step: selecting */}
        {step === 'selecting' && (
          <>
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              Select the calendars you want to import:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto', marginBottom: '20px' }}>
              {googleCalendars.map(cal => (
                <div
                  key={cal.id}
                  onClick={() => toggleCalendar(cal.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    cursor: 'pointer',
                    backgroundColor: selectedIds.has(cal.id) ? `${cal.color}18` : 'transparent',
                    transition: 'background-color 0.15s',
                  }}
                >
                  {/* Color dot */}
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: cal.color, flexShrink: 0 }} />
                  
                  <span style={{ flex: 1, fontSize: '14px', color: 'var(--color-text)', fontWeight: cal.primary ? 500 : 400 }}>
                    {cal.name}
                    {cal.primary && <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--color-text-muted)' }}>(primary)</span>}
                  </span>

                  {/* Checkbox */}
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                    border: `2px solid ${selectedIds.has(cal.id) ? cal.color : 'var(--color-border)'}`,
                    backgroundColor: selectedIds.has(cal.id) ? cal.color : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selectedIds.has(cal.id) && <Check size={12} color="#fff" strokeWidth={3} />}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleClose}
                style={{
                  flex: 1, padding: '10px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px', fontSize: '14px',
                  color: 'var(--color-text)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={selectedIds.size === 0}
                style={{
                  flex: 2, padding: '10px',
                  backgroundColor: selectedIds.size === 0 ? 'var(--color-border)' : 'var(--color-primary)',
                  border: 'none', borderRadius: '8px',
                  fontSize: '14px', fontWeight: 500,
                  color: '#fff', cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Import {selectedIds.size} Calendar{selectedIds.size !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {/* Step: importing */}
        {step === 'importing' && (
          <div style={{ padding: '24px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
              <Loader size={28} color="var(--color-primary)" style={{ animation: 'spin 1s linear infinite' }} />
            </div>

            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text)', textAlign: 'center', marginBottom: '6px' }}>
              Importing your calendars and events...
            </p>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: '20px', minHeight: '18px' }}>
              {importProgress.calendarName ? `Syncing "${importProgress.calendarName}"` : 'Starting...'}
            </p>

            {/* Progress bar */}
            <div style={{ backgroundColor: 'var(--color-border)', borderRadius: '999px', height: '8px', overflow: 'hidden', marginBottom: '10px' }}>
              <div style={{
                height: '100%',
                borderRadius: '999px',
                backgroundColor: 'var(--color-primary)',
                width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%`,
                transition: 'width 0.4s ease',
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-muted)' }}>
              <span>{importProgress.current} of {importProgress.total} calendars</span>
              <span>{importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%</span>
            </div>
          </div>
        )}

        {/* Step: success */}
        {step === 'success' && (
          <div className="flex items-center flex-col"  style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircle size={48} color="var(--color-primary)" style={{ marginBottom: '12px' }} />
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
              Import Successful!
            </p>
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
              Your selected Google Calendar{selectedIds.size !== 1 ? 's have' : ' has'} been imported.
            </p>
            <button
              onClick={handleClose}
              style={{
                padding: '10px 24px',
                backgroundColor: 'var(--color-primary)', color: '#fff',
                border: 'none', borderRadius: '8px',
                fontSize: '14px', fontWeight: 500, cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        )}

        {/* Step: error */}
        {(step === 'error') && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ fontSize: '14px', color: 'var(--color-danger, #ef4444)', marginBottom: '16px' }}>
              {errorMsg}
            </p>
            <button
              onClick={() => setStep('idle')}
              style={{
                padding: '10px 24px',
                backgroundColor: 'var(--color-primary)', color: '#fff',
                border: 'none', borderRadius: '8px',
                fontSize: '14px', fontWeight: 500, cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ImportModal;