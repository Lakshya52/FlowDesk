import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, MapPin, AlignLeft, Calendar as CalendarIcon, Tag } from 'lucide-react';
import { format } from 'date-fns';
import { useCalendarStore } from '@/store/calendarStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import Modal from '@/shared/components/Modal';

interface EventModalProps {
  calendars: any[];
}

const EventModal: React.FC<EventModalProps> = ({ calendars }) => {
  const { isEventModalOpen, closeEventModal, selectedEventId, currentDate } = useCalendarStore();
  const queryClient = useQueryClient();
        const startDateRef = useRef<HTMLInputElement>(null);
const endDateRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    calendar: '',
    startDate: '',
    endDate: '',
    allDay: false,
    location: '',
    description: '',
    eventType: 'meeting',
    priority: 'medium',
    isImportant: false
  });

  const myCalendars = calendars.filter(c => !c.isSystem && (c.owner?._id || c.owner));

  useEffect(() => {
    if (isEventModalOpen) {
      if (selectedEventId) {
        // Edit mode - fetch event
        fetchEventDetails();
      } else {
        // Create mode
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        setFormData({
          title: '',
          calendar: myCalendars.length > 0 ? myCalendars[0]._id : '',
          startDate: `${dateStr}T09:00`,
          endDate: `${dateStr}T10:00`,
          allDay: false,
          location: '',
          description: '',
          eventType: 'meeting',
          priority: 'medium',
          isImportant: false
        });
      }
    }
  }, [isEventModalOpen, selectedEventId, currentDate, myCalendars.length]);

  const fetchEventDetails = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/calendar-events/${selectedEventId}`);
      const ev = res.data;
      
      const sDate = new Date(ev.startDate);
      const eDate = new Date(ev.endDate);

      
      // format for local datetime-local input
      const pad = (n: number) => n.toString().padStart(2, '0');
      const formatDT = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      
      setFormData({
        title: ev.title || '',
        calendar: ev.calendar?._id || ev.calendar || '',
        startDate: formatDT(sDate),
        endDate: formatDT(eDate),
        allDay: ev.allDay || false,
        location: ev.location || '',
        description: ev.description || '',
        eventType: ev.eventType || 'meeting',
        priority: ev.priority || 'medium',
        isImportant: ev.isImportant || false
      });
    } catch (error) {
      console.error(error);
      toast.error('Failed to fetch event details');
      closeEventModal();
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.calendar || !formData.startDate || !formData.endDate) {
      toast.error('Please fill all required fields');
      return;
    }
    
    if (new Date(formData.startDate) > new Date(formData.endDate)) {
      toast.error('End date must be after start date');
      return;
    }

    try {
      setLoading(true);
      
      const payload = {
        ...formData,
        startDate: new Date(formData.startDate).toISOString(),
        endDate: new Date(formData.endDate).toISOString(),
      };

      if (selectedEventId) {
        await api.put(`/calendar-events/${selectedEventId}`, payload);
        toast.success('Event updated');
      } else {
        await api.post('/calendar-events', payload);
        toast.success('Event created');
      }
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      closeEventModal();
    } catch (error) {
      console.error(error);
      toast.error('Failed to save event');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '14px', fontWeight: 500, color: 'var(--color-text)', marginBottom: '4px' };
  const iconWrapperStyle: React.CSSProperties = { position: 'absolute' as const, left: '12px', top: '34px', color: 'var(--color-text-tertiary)' };
  const inputWithIconStyle: React.CSSProperties = { ...inputStyle, paddingLeft: '36px' };

  return (
    <Modal isOpen={isEventModalOpen} onClose={closeEventModal}>
      <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: '12px', boxShadow: 'var(--shadow-xl)', width: '100%', maxWidth: '676px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--color-border)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
            {selectedEventId ? 'Edit Event' : 'New Event'}
          </h2>
          <button 
            onClick={closeEventModal}
            style={{ color: 'var(--color-text-tertiary)', border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', borderRadius: '6px', transition: 'all 0.2s' }}
            onMouseOver={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
            onMouseOut={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <form id="event-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Title */}
            <div>
              <input
                type="text"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="Event Title"
                style={{ width: '100%', fontSize: '24px', fontWeight: 600, border: 'none', borderBottom: '2px solid var(--color-border)', paddingBottom: '8px', outline: 'none', color: 'var(--color-text)', backgroundColor: 'transparent' }}
                onFocus={(e) => { e.currentTarget.style.borderBottomColor = 'var(--color-primary)'; }}
                onBlur={(e) => { e.currentTarget.style.borderBottomColor = 'var(--color-border)'; }}
                required
              />
            </div>

            {/* Date / Time */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: 'var(--color-bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Clock size={20} color="var(--color-text-secondary)" />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <input
                    ref={startDateRef}
                    type={formData.allDay ? 'date' : 'datetime-local'}
                    value={formData.startDate.substring(0, formData.allDay ? 10 : 16)}
                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                    onClick={() => startDateRef.current?.showPicker()}
                    style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', cursor: 'pointer' }}
                    required
                  />
                  <span style={{ color: 'var(--color-text-secondary)' }}>to</span>
                  <input
                    ref={endDateRef}
                    type={formData.allDay ? 'date' : 'datetime-local'}
                    value={formData.endDate.substring(0, formData.allDay ? 10 : 16)}
                    onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                    onClick={() => endDateRef.current?.showPicker()}
                    style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', cursor: 'pointer' }}
                    required
                  />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '32px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--color-text)', cursor: 'pointer' }}>
                  <input 
                    type="checkbox"
                    checked={formData.allDay}
                    onChange={e => setFormData({ ...formData, allDay: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                  />
                  All day event
                </label>
              </div>
            </div>

            {/* Calendar Selection */}
            <div style={{ position: 'relative' }}>
              <label style={labelStyle}>Calendar</label>
              <CalendarIcon size={18} style={iconWrapperStyle} />
              <select
                value={formData.calendar}
                onChange={e => setFormData({ ...formData, calendar: e.target.value })}
                style={inputWithIconStyle}
                required
              >
                <option value="" disabled>Select a calendar</option>
                {myCalendars.map(cal => (
                  <option key={cal._id} value={cal._id}>{cal.name}</option>
                ))}
              </select>
            </div>

            {/* Location */}
            <div style={{ position: 'relative' }}>
              <label style={labelStyle}>Location</label>
              <MapPin size={18} style={iconWrapperStyle} />
              <input
                type="text"
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
                placeholder="Add location"
                style={inputWithIconStyle}
              />
            </div>

            {/* Description */}
            <div style={{ position: 'relative' }}>
              <label style={labelStyle}>Description</label>
              <AlignLeft size={18} style={{ ...iconWrapperStyle, top: '34px' }} />
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Add description"
                rows={3}
                style={{ ...inputWithIconStyle, resize: 'none' }}
              />
            </div>

            {/* Meta data row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>Type</label>
                <Tag size={18} style={iconWrapperStyle} />
                <select
                  value={formData.eventType}
                  onChange={e => setFormData({ ...formData, eventType: e.target.value })}
                  style={inputWithIconStyle}
                >
                  <option value="meeting">Meeting</option>
                  <option value="task">Task</option>
                  <option value="reminder">Reminder</option>
                  <option value="holiday">Holiday</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>Priority</label>
                <select
                  value={formData.priority}
                  onChange={e => setFormData({ ...formData, priority: e.target.value })}
                  style={inputStyle}
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            {/* Flags */}
            <div style={{ paddingTop: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--color-text)', cursor: 'pointer' }}>
                <input 
                  type="checkbox"
                  checked={formData.isImportant}
                  onChange={e => setFormData({ ...formData, isImportant: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: 500 }}>Mark as Important</span>
              </label>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
          <button
            type="button"
            onClick={closeEventModal}
            style={{ padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: 'var(--color-text)', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--color-surface)'}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="event-form"
            disabled={loading}
            style={{ padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: '#ffffff', backgroundColor: 'var(--color-primary)', border: '1px solid transparent', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center' }}
            onMouseOver={(e) => { if (!loading) e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)'; }}
            onMouseOut={(e) => { if (!loading) e.currentTarget.style.backgroundColor = 'var(--color-primary)'; }}
          >
            {loading ? 'Saving...' : 'Save Event'}
          </button>
        </div>

      </div>
    </Modal>
  );
};

export default EventModal;
