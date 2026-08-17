import React from 'react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, format, startOfDay, endOfDay } from 'date-fns';
import { useCalendarStore } from '../../store/calendarStore';
import EventChip from './EventChip';

interface MonthViewProps {
  events: any[];
}

const MonthView: React.FC<MonthViewProps> = ({ events }) => {
  const { currentDate, openEventModal, openEventDrawer } = useCalendarStore();
  
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const days = [];
  let day = startDate;

  while (day <= endDate) {
    days.push(day);
    day = addDays(day, 1);
  }

  const getEventsForDay = (date: Date) => {
    return events.filter(event => {
      const eStart = new Date(event.startDate);
      const eEnd = new Date(event.endDate);
      return isSameDay(eStart, date) || isSameDay(eEnd, date) || (date > startOfDay(eStart) && date < endOfDay(eEnd));
    });
  };

  return (
    <div className='flex-1 flex flex-col h-full bg-(--color-surface) overflow-x-auto overflow-y-hidden'>
      <div className='min-w-125 flex flex-col h-full'>
        {/* Days of week header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', flexShrink: 0 }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} style={{ padding: '8px 0', textAlign: 'center', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-secondary)', borderRight: '1px solid var(--color-border)' }}>
              {day}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridAutoRows: '1fr', overflowY: 'auto' }}>
          {days.map((day) => {
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isToday = isSameDay(day, new Date());
          const dayEvents = getEventsForDay(day);

          return (
            <div 
              key={day.toString()}
              onClick={() => openEventModal(undefined, day)}
              style={{
                minHeight: '80px',
                borderBottom: '1px solid var(--color-border)',
                borderRight: '1px solid var(--color-border)',
                padding: '4px',
                cursor: 'pointer',
                backgroundColor: !isCurrentMonth ? 'var(--color-bg)' : 'transparent',
                transition: 'background-color 0.2s',
                // scrollbarWidth: 'none',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = !isCurrentMonth ? 'var(--color-bg)' : 'transparent';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', padding: '0 4px' }}>
                <span style={{
                  fontSize: '14px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  fontWeight: !isCurrentMonth ? 'normal' : 500,
                  backgroundColor: isToday ? 'var(--color-primary)' : 'transparent',
                  color: isToday ? '#ffffff' : (!isCurrentMonth ? 'var(--color-text-tertiary)' : 'var(--color-text)')
                }}>
                  {format(day, 'd')}
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden', height: 'calc(100% - 32px)' }}>
                {dayEvents.slice(0, 3).map(event => (
                  <EventChip
                    key={event._id}
                    title={event.title}
                    color={event.calendar?.color || '#6366f1'}
                    time={event.allDay ? undefined : format(new Date(event.startDate), 'HH:mm')}
                    isImportant={event.isImportant}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEventDrawer(event._id);
                    }}
                  />
                ))}
                {dayEvents.length > 3 && (
                  <div 
                    style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 500, padding: '0 4px' }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--color-primary)'}
                    onMouseOut={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}
                  >
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
};

export default MonthView;
