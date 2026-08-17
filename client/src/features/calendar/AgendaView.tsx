import React, {useState } from 'react';
import { format, isSameDay, addDays, startOfDay } from 'date-fns';
import { Clock, MapPin, AlignLeft } from 'lucide-react';
import { useCalendarStore } from '@/store/calendarStore';

interface AgendaViewProps {
  events: any[];
}

const RANGE_OPTIONS = [
  { label: 'Next 7 days', days: 7 },
  { label: 'Next 30 days', days: 30 },
  { label: 'Next 90 days', days: 90 },
  { label: 'All events', days: null },
];

const AgendaView: React.FC<AgendaViewProps> = ({ events }) => {
  const { currentDate, openEventDrawer } = useCalendarStore();
  const [rangeDays, setRangeDays] = useState<number | null>(30);

  const rangeEnd = rangeDays ? addDays(startOfDay(new Date()), rangeDays) : null;

  // Sort events chronologically
  const sortedEvents = [...events].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  
  // Filter: from currentDate, up to rangeEnd if set
  const upcomingEvents = sortedEvents.filter(e => {
    const end = new Date(e.endDate);
    const start = new Date(e.startDate);
    if (end < startOfDay(new Date(currentDate))) return false;
    if (rangeEnd && start > rangeEnd) return false;
    return true;
  });

  // Group by day
  const groupedEvents: { [key: string]: any[] } = {};
  upcomingEvents.forEach(event => {
    const dayKey = format(new Date(event.startDate), 'yyyy-MM-dd');
    if (!groupedEvents[dayKey]) {
      groupedEvents[dayKey] = [];
    }
    groupedEvents[dayKey].push(event);
  });

  const days = Object.keys(groupedEvents).sort();

  if (upcomingEvents.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '36px', marginBottom: '16px' }}>📅</div>
          <h3 style={{ fontSize: '18px', fontWeight: 500, color: 'var(--color-text)' }}>No upcoming events</h3>
          <p style={{ fontSize: '14px', marginTop: '4px' }}>You're all caught up!</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, backgroundColor: 'var(--color-surface)', overflowY: 'auto', padding: '16px', paddingBottom: '48px' }}>
      
      {/* Range Filter */}
      <div style={{ maxWidth: '768px', margin: '0 auto 24px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {RANGE_OPTIONS.map(opt => (
          <button
            key={opt.label}
            onClick={() => setRangeDays(opt.days)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              border: '1px solid var(--color-border)',
              backgroundColor: rangeDays === opt.days ? 'var(--color-primary)' : 'var(--color-surface)',
              color: rangeDays === opt.days ? '#fff' : 'var(--color-text)',
              transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: '768px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {days.map(dayKey => {
          const date = new Date(dayKey);
          const dayEvents = groupedEvents[dayKey];
          const isToday = isSameDay(date, new Date());
          
          return (
            <div key={dayKey} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ width: '96px', flexShrink: 0, paddingTop: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, textTransform: 'uppercase', color: isToday ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                  {format(date, 'EEE')}
                </div>
                <div style={{ fontSize: '30px', fontWeight: isToday ? 500 : 300, color: isToday ? 'var(--color-primary-hover)' : 'var(--color-text)' }}>
                  {format(date, 'd')}
                </div>
              </div>
              
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '2px solid var(--color-border)', paddingLeft: '16px', minWidth: '250px' }}>
                {dayEvents.map(event => (
                  <div 
                    key={event._id}
                    onClick={() => openEventDrawer(event._id)}
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      padding: '16px',
                      boxShadow: 'var(--shadow-sm)',
                      cursor: 'pointer',
                      transition: 'box-shadow 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                      const titleEl = e.currentTarget.querySelector('.event-title') as HTMLElement;
                      if (titleEl) titleEl.style.color = 'var(--color-primary)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                      const titleEl = e.currentTarget.querySelector('.event-title') as HTMLElement;
                      if (titleEl) titleEl.style.color = 'var(--color-text)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div 
                        style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          marginTop: '6px',
                          flexShrink: 0,
                          backgroundColor: event.calendar?.color || '#6366f1'
                        }}
                      ></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                          <h4 className="event-title" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)', transition: 'color 0.2s', margin: 0 }}>
                            {event.title}
                          </h4>
                          {event.isImportant && (
                            <span style={{ fontSize: '12px', backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500 }}>
                              Important
                            </span>
                          )}
                        </div>
                        
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', marginTop: '8px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500, color: 'var(--color-text)' }}>
                            <Clock size={14} color="var(--color-text-tertiary)" />
                            {event.allDay 
                              ? 'All Day' 
                              : `${format(new Date(event.startDate), 'h:mm a')} - ${format(new Date(event.endDate), 'h:mm a')}`
                            }
                          </div>
                          
                          {event.location && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <MapPin size={14} color="var(--color-text-tertiary)" />
                              {event.location}
                            </div>
                          )}
                        </div>
                        
                        {event.description && (
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginTop: '12px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                            <AlignLeft size={14} color="var(--color-text-tertiary)" style={{ marginTop: '2px', flexShrink: 0 }} />
                            <p style={{ margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {event.description}
                            </p>
                          </div>
                        )}
                        
                        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span 
                            style={{ 
                              fontSize: '12px',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              backgroundColor: `${event.calendar?.color || '#6366f1'}15`,
                              color: event.calendar?.color || '#6366f1'
                            }}
                          >
                            {event.calendar?.name || 'Calendar'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AgendaView;
