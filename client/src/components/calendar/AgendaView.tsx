import React, {useState } from 'react';
import { format, isSameDay, addDays, startOfDay } from 'date-fns';
import { Clock, MapPin, AlignLeft, CalendarX } from 'lucide-react';
import { useCalendarStore } from '../../store/calendarStore';
import { onActivateKey } from '../../lib/keyboard';

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

  // Anchor the whole window to the current view date (the range end used to
  // anchor to today while the start used currentDate, yielding empty windows).
  const windowStart = startOfDay(new Date(currentDate));
  const rangeEnd = rangeDays ? addDays(windowStart, rangeDays) : null;

  // Sort events chronologically
  const sortedEvents = [...events].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  // Keep events overlapping the window, expanding multi-day events so they
  // appear under every day they touch (span capped for safety).
  const MAX_SPAN_DAYS = 400;
  const dayEntries: { key: string; date: Date; event: any; continued: boolean }[] = [];
  sortedEvents.forEach((e) => {
    const startDay = startOfDay(new Date(e.startDate));
    const endDay = startOfDay(new Date(e.endDate));
    if (endDay < windowStart) return;
    if (rangeEnd && startDay > rangeEnd) return;
    const fromDay = startDay < windowStart ? windowStart : startDay;
    let toDay = endDay;
    if (rangeEnd && toDay > rangeEnd) toDay = rangeEnd;
    const spanCap = addDays(fromDay, MAX_SPAN_DAYS);
    if (toDay > spanCap) toDay = spanCap;
    for (let d = fromDay; d <= toDay; d = addDays(d, 1)) {
      // Local date construction avoids the UTC-midnight label shift of
      // new Date('yyyy-MM-dd') in negative-offset timezones.
      const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      dayEntries.push({
        key: format(local, 'yyyy-MM-dd'),
        date: local,
        event: e,
        continued: local > startDay,
      });
    }
  });

  // Group by day
  const groupedEvents: { [key: string]: { date: Date; entries: { event: any; continued: boolean }[] } } = {};
  dayEntries.forEach(({ key, date, event, continued }) => {
    if (!groupedEvents[key]) groupedEvents[key] = { date, entries: [] };
    groupedEvents[key].entries.push({ event, continued });
  });

  const days = Object.keys(groupedEvents).sort();

  // Month sections for sticky dividers on long ranges
  const sections: { month: string; days: string[] }[] = [];
  days.forEach((dayKey) => {
    const month = format(groupedEvents[dayKey].date, 'MMMM yyyy');
    const last = sections[sections.length - 1];
    if (last && last.month === month) last.days.push(dayKey);
    else sections.push({ month, days: [dayKey] });
  });

  if (dayEntries.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '16px' }}><CalendarX size={36} color="var(--color-text-tertiary)" /></div>
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
        {sections.map(section => (
          <div key={section.month} style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--color-surface)', padding: '8px 0 4px', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)' }}>
              {section.month}
            </div>
            {section.days.map(dayKey => {
              const { date, entries } = groupedEvents[dayKey];
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
                {entries.map(({ event, continued }) => (
                  <div 
                    key={event._id}
                    role="button"
                    tabIndex={0}
                    aria-label={event.title}
                    className="cal-focusable"
                    onClick={() => openEventDrawer(event._id)}
                    onKeyDown={onActivateKey(() => openEventDrawer(event._id))}
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
                          {continued && (
                            <span style={{ fontSize: '12px', backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500 }}>
                              Continued
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
        ))}
      </div>
    </div>
  );
};

export default AgendaView;
