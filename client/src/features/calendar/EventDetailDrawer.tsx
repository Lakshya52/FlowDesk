import React from 'react';
import { X, Clock, MapPin, AlignLeft, Tag, Trash2, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { useCalendarStore } from '@/store/calendarStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import Avatar from '@/shared/components/Avatar';

interface EventDetailDrawerProps {
  events: any[];
}

const EventDetailDrawer: React.FC<EventDetailDrawerProps> = ({ events }) => {
  const { isEventDrawerOpen, closeEventDrawer, selectedEventId, openEventModal } = useCalendarStore();
  const queryClient = useQueryClient();
  
  const event = events.find(e => e._id === selectedEventId);

  if (!isEventDrawerOpen || !event) return null;

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    
    try {
      await api.delete(`/calendar-events/${event._id}`);
      toast.success('Event deleted');
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      closeEventDrawer();
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete event');
    }
  };

  const handleEdit = () => {
    closeEventDrawer();
    openEventModal(event._id);
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          zIndex: 40,
          transition: 'opacity 0.3s'
        }}
        onClick={closeEventDrawer}
      />
      
      {/* Drawer */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        height: '100%',
        width: '100%',
        maxWidth: '400px',
        backgroundColor: 'var(--color-surface)',
        boxShadow: 'var(--shadow-xl)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.3s ease-in-out',
        transform: isEventDrawerOpen ? 'translateX(0)' : 'translateX(100%)',
        borderLeft: '1px solid var(--color-border)'
      }}>
        
        {/* Header Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {!event.isSystem && (
              <>
                <button 
                  onClick={handleEdit}
                  style={{ padding: '8px', color: 'var(--color-text-secondary)', borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseOver={(e) => { e.currentTarget.style.color = 'var(--color-primary)'; e.currentTarget.style.backgroundColor = 'var(--color-primary-light)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                  title="Edit event"
                >
                  <Edit2 size={18} />
                </button>
                <button 
                  onClick={handleDelete}
                  style={{ padding: '8px', color: 'var(--color-text-secondary)', borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseOver={(e) => { e.currentTarget.style.color = 'var(--color-danger)'; e.currentTarget.style.backgroundColor = 'var(--color-danger-light)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                  title="Delete event"
                >
                  <Trash2 size={18} />
                </button>
              </>
            )}
          </div>
          <button 
            onClick={closeEventDrawer}
            style={{ padding: '8px', color: 'var(--color-text-tertiary)', borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseOver={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
            onMouseOut={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* Title Area */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div 
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  boxShadow: 'var(--shadow-sm)',
                  backgroundColor: event.calendar?.color || '#6366f1'
                }}
              />
              <span 
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: `${event.calendar?.color || '#6366f1'}15`,
                  color: event.calendar?.color || '#6366f1'
                }}
              >
                {event.calendar?.name || 'Calendar'}
              </span>
              {event.isImportant && (
                <span style={{ fontSize: '12px', backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)', padding: '2px 8px', borderRadius: '9999px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Important
                </span>
              )}
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--color-text)', lineHeight: 1.25, margin: 0 }}>
              {event.title}
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Time */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <Clock size={20} color="var(--color-text-tertiary)" style={{ marginTop: '2px' }} />
              <div>
                <div style={{ color: 'var(--color-text)', fontWeight: 500 }}>
                  {format(new Date(event.startDate), 'EEEE, MMMM d, yyyy')}
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '2px' }}>
                  {event.allDay 
                    ? 'All Day' 
                    : `${format(new Date(event.startDate), 'h:mm a')} - ${format(new Date(event.endDate), 'h:mm a')}`
                  }
                </div>
              </div>
            </div>

            {/* Location */}
            {event.location && (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <MapPin size={20} color="var(--color-text-tertiary)" style={{ marginTop: '2px' }} />
                <div style={{ color: 'var(--color-text)' }}>
                  {event.location}
                </div>
              </div>
            )}

            {/* Description */}
            {event.description && (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <AlignLeft size={20} color="var(--color-text-tertiary)" style={{ marginTop: '2px' }} />
                <div style={{ color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>
                  {event.description}
                </div>
              </div>
            )}

            {/* Tags/Meta */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <Tag size={20} color="var(--color-text-tertiary)" />
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ padding: '4px 10px', backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)', fontSize: '12px', borderRadius: '6px', textTransform: 'capitalize', fontWeight: 500 }}>
                  {event.eventType}
                </span>
                {event.priority && event.priority !== 'medium' && (
                  <span style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    textTransform: 'capitalize',
                    fontWeight: 500,
                    backgroundColor: event.priority === 'high' ? 'var(--color-warning-light)' : event.priority === 'urgent' ? 'var(--color-danger-light)' : 'var(--color-surface-hover)',
                    color: event.priority === 'high' ? 'var(--color-warning)' : event.priority === 'urgent' ? 'var(--color-danger)' : 'var(--color-text-secondary)'
                  }}>
                    {event.priority} Priority
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Creator / System Note */}
          <div style={{ paddingTop: '24px', borderTop: '1px solid var(--color-border)' }}>
            {event.isSystem || event.calendar?.isSystem ? (
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--color-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🤖</div>
                System generated event
              </div>
            ) : event.createdBy && (
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* <img 
                  src={event.createdBy.avatar || `https://ui-avatars.com/api/?name=${event.createdBy.name}`} 
                  alt={event.createdBy.name} 
                  style={{ width: '24px', height: '24px', borderRadius: '50%' }}
                /> */}
                <Avatar src={event.createdBy.avatar} name={event.createdBy.name} size={28} />
                Created by {event.createdBy.name}
              </div>
            )}
          </div>
          
        </div>
      </div>
    </>
  );
};

export default EventDetailDrawer;
