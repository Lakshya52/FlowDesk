import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useCalendarStore } from '@/store/calendarStore';
import CalendarSidebar from './CalendarSidebar';
import CalendarToolbar from './CalendarToolbar';
import MonthView from './MonthView';
import WeekView from './WeekView';
import DayView from './DayView';
import YearView from './YearView';
import AgendaView from './AgendaView';
import EventModal from './EventModal';
import CalendarModal from './CalendarModal';
import CalendarShareModal from './CalendarShareModal';
import ImportModal from './ImportModal';
import EventDetailDrawer from './EventDetailDrawer';

const CalendarPage: React.FC = () => {
  const { 
    currentView, 
    currentDate,
    setAllCalendarsVisible,
    visibleCalendarIds,
    openEventModal,
    navigateToday,
    isCalendarSidebarOpen,
    setCalendarSidebarOpen,
    searchQuery,
  } = useCalendarStore();

  // Handle Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      
      if (e.key === 't' || e.key === 'T') navigateToday();
      if (e.key === 'n' || e.key === 'N') openEventModal();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateToday, openEventModal]);

  // Fetch Calendars
  const { data: calendars = [], isLoading: loadingCalendars } = useQuery({
    queryKey: ['calendars'],
    queryFn: async () => {
      const res = await api.get('/calendars');
      return res.data;
    }
  });

  // Initialize visible calendars only on first load
  useEffect(() => {
    if (calendars.length > 0 && visibleCalendarIds.size === 0) {
      setAllCalendarsVisible(calendars.map((c: any) => c._id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendars.length]);

  // Determine query range based on view
  const getQueryRange = () => {
    const date = new Date(currentDate);
    const start = new Date(date.getFullYear(), date.getMonth() - 1, 1).toISOString();
    const end = new Date(date.getFullYear(), date.getMonth() + 2, 0).toISOString();
    return { start, end };
  };

  const { start, end } = getQueryRange();

  // Filter events by search query
  const { data: rawEvents = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['calendar-events', start, end, Array.from(visibleCalendarIds).join(',')],
    queryFn: async () => {
      if (visibleCalendarIds.size === 0) return [];
      
      const res = await api.get('/calendar-events', {
        params: {
          start,
          end,
          calendars: Array.from(visibleCalendarIds).join(',')
        }
      });
      return res.data;
    },
    enabled: visibleCalendarIds.size > 0
  });

  const events = searchQuery.trim()
    ? rawEvents.filter((e: any) => {
        const q = searchQuery.toLowerCase();
        return (
          e.title?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.location?.toLowerCase().includes(q) ||
          e.calendar?.name?.toLowerCase().includes(q)
        );
      })
    : rawEvents;

  if (loadingCalendars) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg)' }}>
        <div style={{ animation: 'spin 1s linear infinite', borderRadius: '50%', height: '48px', width: '48px', borderTop: '2px solid var(--color-primary)', borderBottom: '2px solid var(--color-primary)' }}>
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)', width: '100%', backgroundColor: 'var(--color-surface)', overflow: 'hidden', color: 'var(--color-text)' }}>
      <CalendarToolbar />
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        
        {/* Mobile Sidebar Overlay */}
        {isCalendarSidebarOpen && (
          <div 
            onClick={() => setCalendarSidebarOpen(false)}
            style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 30, display: 'block' }}
            className="md:hidden"
          />
        )}
        
        {/* Sidebar Container */}
        <div 
          className={`sidebar-container ${isCalendarSidebarOpen ? 'open' : ''}`}
          style={{ zIndex: 40, height: '100%', display: 'flex' }}
        >
          <CalendarSidebar calendars={calendars} />
        </div>
        
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', backgroundColor: 'var(--color-surface)' }}>
          {loadingEvents && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 10, backgroundColor: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
              <div style={{ animation: 'spin 1s linear infinite', borderRadius: '50%', height: '32px', width: '32px', borderTop: '2px solid var(--color-primary)', borderBottom: '2px solid var(--color-primary)' }}></div>
            </div>
          )}
          
          {currentView === 'month' && <MonthView events={events} />}
          {currentView === 'week' && <WeekView events={events} />}
          {currentView === 'day' && <DayView events={events} />}
          {currentView === 'year' && <YearView events={events} />}
          {currentView === 'agenda' && <AgendaView events={events} />}
        </main>
      </div>

      {/* Modals & Drawers */}
      <EventModal calendars={calendars} />
      <CalendarModal />
      <CalendarShareModal />
      <ImportModal />
      <EventDetailDrawer events={events} />
    </div>
  );
};

export default CalendarPage;