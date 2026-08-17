import { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, CheckCircle2, Phone, Target, Clock, Inbox, PhoneCall, CalendarCheck, MessageSquare, Loader2 } from 'lucide-react';
import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useCrmSocket } from '@/shared/hooks/useCrmSocket';

const DEFAULT_TIME_BLOCKS = [
  // { time: '09:00', label: '9:00 AM', text: 'Morning catch-up & high priority callbacks' },
  { time: '10:00', label: '10:00 AM', text: 'Morning catch-up & high priority callbacks' },
  { time: '11:00', label: '11:00 AM', text: 'Cold calling & Follow-ups on interested leads' },
  { time: '12:00', label: '12:00 PM', text: 'Lunch break' },
  { time: '13:00', label: '1:00 PM', text: 'Cold calling' },
  { time: '14:00', label: '2:00 PM', text: 'Client meetings / demos' },
  { time: '15:00', label: '3:00 PM', text: 'Admin work & CRM updating' },
  { time: '16:00', label: '4:00 PM', text: 'Wrap-up & plan next day' },
];

const FILL_COLORS: Record<string, string> = {
  new: '#6366f1',
  attempted: '#8b5cf6',
  connected: '#3b82f6',
  interested: '#0ea5e9',
  callback_scheduled: '#06b6d4',
  meeting_scheduled: '#10b981',
  not_interested: '#f59e0b',
  not_reachable: '#f97316',
  do_not_call: '#ef4444',
  closed_won: '#22c55e',
  closed_lost: '#dc2626',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'New', attempted: 'Attempted', connected: 'Connected',
  interested: 'Interested', callback_scheduled: 'Callback Scheduled',
  meeting_scheduled: 'Meeting Scheduled', not_interested: 'Not Interested',
  not_reachable: 'Not Reachable', do_not_call: 'Do Not Call',
  closed_won: 'Closed / Won', closed_lost: 'Closed / Lost',
};

const PRIORITY_LABELS: Record<string, string> = {
  very_high: 'Very High', high: 'High', medium: 'Medium', low: 'Low',
};

const Plan = () => {
  useCrmSocket();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [goals, setGoals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('plan_goals') || '{"calls":50,"conversions":5}'); }
    catch { return { calls: 50, conversions: 5 }; }
  });
  const [timeBlocks, setTimeBlocks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('plan_timeBlocks') || JSON.stringify(DEFAULT_TIME_BLOCKS)); }
    catch { return DEFAULT_TIME_BLOCKS; }
  });
  const [notes, setNotes] = useState('');

  useEffect(() => {
    localStorage.setItem('plan_goals', JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem('plan_timeBlocks', JSON.stringify(timeBlocks));
  }, [timeBlocks]);

  // Load notes for selected date
  useEffect(() => {
    const saved = localStorage.getItem(`plan_notes_${format(selectedDate, 'yyyy-MM-dd')}`);
    setNotes(saved || '');
  }, [selectedDate]);

  // Save notes when changed
  useEffect(() => {
    if (notes) localStorage.setItem(`plan_notes_${format(selectedDate, 'yyyy-MM-dd')}`, notes);
    else localStorage.removeItem(`plan_notes_${format(selectedDate, 'yyyy-MM-dd')}`);
  }, [notes, selectedDate]);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  const { data: followups = [], isLoading: loadingFollowups } = useQuery({
    queryKey: ["leads", "upcoming", "plan"],
    queryFn: async () => {
      const { data } = await api.get('/leads/upcoming');
      return data.success ? data.leads || [] : [];
    },
  });

  const { data: priorityLeads = [], isLoading: loadingPriority } = useQuery({
    queryKey: ["leads", "plan", "priority"],
    queryFn: async () => {
      const { data } = await api.get('/leads', { params: { limit: 10, status: 'callback_scheduled,meeting_scheduled,interested,new' } });
      return (data.success ? data.leads || [] : []).filter((l: any) =>
        ['callback_scheduled', 'meeting_scheduled', 'interested', 'new'].includes(l.status)
      );
    },
  });

  const { data: todayEvents = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["calendar-events", dateStr],
    queryFn: async () => {
      const { data } = await api.get('/calendar-events', { params: { start: dateStr, end: dateStr } });
      return data.events || [];
    },
  });

  const handlePrevDay = () => setSelectedDate(d => addDays(d, -1));
  const handleNextDay = () => setSelectedDate(d => addDays(d, 1));
  const isToday = isSameDay(selectedDate, new Date());

  const updateTimeBlock = (idx: number, text: string) => {
    setTimeBlocks((prev: any[]) => prev.map((b, i) => i === idx ? { ...b, text } : b));
  };

  const handleGoalChange = (field: 'calls' | 'conversions', value: string) => {
    setGoals((prev: any) => ({ ...prev, [field]: parseInt(value) || 0 }));
  };

  const progressCalls = priorityLeads.filter((l: any) =>
    ['connected', 'interested', 'callback_scheduled', 'meeting_scheduled', 'not_interested', 'not_reachable'].includes(l.status)
  ).length;

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
            Daily Planner
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
            Plan your calls, track your targets, and stay on top of follow-ups
          </p>
        </div>

        {/* Date Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isToday && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(new Date())}
              style={{ padding: '4px 10px', fontWeight: 600, fontSize: '0.75rem' }}>
              Today
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px', borderRadius: 6, background: 'var(--color-surface-hover)' }}>
            <button className="btn btn-ghost btn-sm" onClick={handlePrevDay} style={{ padding: '2px 6px', borderRadius: 4 }}>
              <ChevronLeft size={15} />
            </button>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', minWidth: 150, textAlign: 'center', justifyContent: 'center' }}>
              <Calendar size={14} style={{ color: 'var(--color-primary)' }} />
              {format(selectedDate, 'MMM dd, yyyy')}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={handleNextDay} style={{ padding: '2px 6px', borderRadius: 4 }}>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Daily Targets */}
          <div className="card animate-fade-in" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Target size={20} style={{ color: 'var(--color-primary)' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Daily Targets</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 6 }}>Call Target</label>
                <div style={{ position: 'relative' }}>
                  <Phone size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--color-text-tertiary)' }} />
                  <input type="number" className="input" value={goals.calls}
                    onChange={e => handleGoalChange('calls', e.target.value)}
                    style={{ paddingLeft: 36, fontSize: '1rem', fontWeight: 600 }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 6 }}>Conversion Target</label>
                <div style={{ position: 'relative' }}>
                  <CheckCircle2 size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--color-text-tertiary)' }} />
                  <input type="number" className="input" value={goals.conversions}
                    onChange={e => handleGoalChange('conversions', e.target.value)}
                    style={{ paddingLeft: 36, fontSize: '1rem', fontWeight: 600 }} />
                </div>
              </div>
            </div>
            {/* Progress bar */}
            {isToday && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                  <span>Progress</span>
                  <span>{Math.min(progressCalls, goals.calls)} / {goals.calls} calls</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--color-surface-hover)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, width: `${Math.min((progressCalls / Math.max(goals.calls, 1)) * 100, 100)}%`, background: 'var(--color-primary)', transition: 'width 0.3s ease' }} />
                </div>
              </div>
            )}
          </div>

          {/* Time Blocking */}
          <div className="card animate-fade-in" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <Clock size={20} style={{ color: 'var(--color-info)' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Time Blocking</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {timeBlocks.map((block: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 70, fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'right' }}>
                    {block.label}
                  </div>
                  <input
                    type="text"
                    className="input"
                    value={block.text}
                    onChange={e => updateTimeBlock(idx, e.target.value)}
                    placeholder="What are you doing this hour?"
                    style={{ flex: 1, fontSize: '0.8125rem' }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Today's Events */}
          <div className="card animate-fade-in" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <CalendarCheck size={20} style={{ color: 'var(--color-primary)' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Today's Events</h3>
              {loadingEvents && <Loader2 size={14} className="animate-spin" />}
            </div>
            {todayEvents.length === 0 && !loadingEvents ? (
              <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Calendar size={20} />
                <span>No events scheduled for this day</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {todayEvents.map((ev: any) => (
                  <div key={ev._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--color-surface-hover)' }}>
                    <div style={{ width: 3, height: 32, borderRadius: 2, background: ev.color || 'var(--color-primary)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                        {ev.startDate ? format(parseISO(ev.startDate), 'h:mm a') : ''} {ev.location ? `\u00b7 ${ev.location}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.625rem', padding: '2px 6px', borderRadius: 4, background: 'var(--color-primary-light)', color: 'var(--color-primary)', fontWeight: 600, textTransform: 'uppercase' }}>
                      {ev.eventType}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Follow-ups */}
          <div className="card animate-fade-in" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <PhoneCall size={20} style={{ color: 'var(--color-warning)' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Follow-ups & Callbacks</h3>
              {loadingFollowups && <Loader2 size={14} className="animate-spin" />}
            </div>
            {followups.length === 0 && !loadingFollowups ? (
              <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <PhoneCall size={20} />
                <span>No follow-ups scheduled</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {followups.filter((l: any) => l.nextFollowupAt).slice(0, 15).map((lead: any) => (
                  <div key={lead._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--color-surface-hover)' }}>
                    <div style={{ width: 3, height: 32, borderRadius: 2, background: FILL_COLORS[lead.status] || 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{lead.name}</div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                        {lead.companyName || lead.phone || ''} {lead.nextFollowupAt ? `\u00b7 ${format(parseISO(lead.nextFollowupAt), 'MMM d, h:mm a')}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.625rem', padding: '2px 6px', borderRadius: 4, background: `${FILL_COLORS[lead.status]}20`, color: FILL_COLORS[lead.status], fontWeight: 600 }}>
                      {STATUS_LABELS[lead.status] || lead.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Priority Leads Queue */}
          <div className="card animate-fade-in" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Phone size={20} style={{ color: 'var(--color-primary)' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Leads to Contact</h3>
              {loadingPriority && <Loader2 size={14} className="animate-spin" />}
            </div>
            {priorityLeads.length === 0 && !loadingPriority ? (
              <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Inbox size={20} />
                <span>No leads needing attention</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                {priorityLeads.slice(0, 20).map((lead: any) => (
                  <div key={lead._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--color-surface-hover)' }}>
                    <div style={{ width: 3, height: 36, borderRadius: 2, background: FILL_COLORS[lead.status] || 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{lead.name}</div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                        {lead.companyName || lead.phone || ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span style={{ fontSize: '0.625rem', padding: '2px 6px', borderRadius: 4, background: `${FILL_COLORS[lead.status]}20`, color: FILL_COLORS[lead.status], fontWeight: 600 }}>
                        {STATUS_LABELS[lead.status] || lead.status}
                      </span>
                      {lead.priority && (
                        <span style={{ fontSize: '0.6rem', color: 'var(--color-text-tertiary)', fontWeight: 500, textTransform: 'uppercase' }}>
                          {PRIORITY_LABELS[lead.priority] || lead.priority}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="card animate-fade-in" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <MessageSquare size={20} style={{ color: 'var(--color-text-tertiary)' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Daily Notes</h3>
            </div>
            <textarea
              className="input"
              placeholder="Note down important reminders for this day..."
              style={{ minHeight: 120, resize: 'vertical', fontSize: '0.8125rem' }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

        </div>
      </div>
    </div>
  );
};

export default Plan;



// import { useState, useEffect, useMemo } from 'react';
// import {
//   Calendar, ChevronLeft, ChevronRight, CheckCircle2, Phone, Target, Clock,
//   AlertTriangle, Inbox, PhoneCall, CalendarCheck, MessageSquare, Loader2,
//   Flame, Zap, PhoneOff, CalendarClock, Sparkles, TrendingUp, TrendingDown,
// } from 'lucide-react';
// import { format, addDays, isSameDay, parseISO, isToday as isTodayFn } from 'date-fns';
// import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
// import api from '@/lib/api';
// import { useCrmSocket } from '@/shared/hooks/useCrmSocket';
// import { getSocket } from '@/shared/hooks/useSocket';
// import { useAuthStore } from '@/store/authStore';

// const DEFAULT_TIME_BLOCKS = [
//   { time: '10:00', label: '10:00 AM', text: 'Morning catch-up & high priority callbacks' },
//   { time: '11:00', label: '11:00 AM', text: 'Cold calling & Follow-ups on interested leads' },
//   { time: '12:00', label: '12:00 PM', text: 'Lunch break' },
//   { time: '13:00', label: '1:00 PM', text: 'Cold calling' },
//   { time: '14:00', label: '2:00 PM', text: 'Client meetings / demos' },
//   { time: '15:00', label: '3:00 PM', text: 'Admin work & CRM updating' },
//   { time: '16:00', label: '4:00 PM', text: 'Wrap-up & plan next day' },
// ];

// const FILL_COLORS: Record<string, string> = {
//   new: '#6366f1', attempted: '#8b5cf6', connected: '#3b82f6', interested: '#0ea5e9',
//   callback_scheduled: '#06b6d4', meeting_scheduled: '#10b981', not_interested: '#f59e0b',
//   not_reachable: '#f97316', do_not_call: '#ef4444', closed_won: '#22c55e', closed_lost: '#dc2626',
// };

// const STATUS_LABELS: Record<string, string> = {
//   new: 'New', attempted: 'Attempted', connected: 'Connected', interested: 'Interested',
//   callback_scheduled: 'Callback Scheduled', meeting_scheduled: 'Meeting Scheduled',
//   not_interested: 'Not Interested', not_reachable: 'Not Reachable', do_not_call: 'Do Not Call',
//   closed_won: 'Closed / Won', closed_lost: 'Closed / Lost',
// };

// const PRIORITY_LABELS: Record<string, string> = {
//   very_high: 'Very High', high: 'High', medium: 'Medium', low: 'Low',
// };

// // Workday window used for the pace indicator
// const WORKDAY_START_HOUR = 10;
// const WORKDAY_END_HOUR = 18;

// const CircularProgress = ({ value, max, size = 96, stroke = 9, color = 'var(--color-primary)' }: { value: number; max: number; size?: number; stroke?: number; color?: string }) => {
//   const radius = (size - stroke) / 2;
//   const circumference = 2 * Math.PI * radius;
//   const pct = Math.min(value / Math.max(max, 1), 1);
//   const offset = circumference * (1 - pct);
//   return (
//     <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
//       <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-surface-hover)" strokeWidth={stroke} />
//       <circle
//         cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
//         strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
//         style={{ transition: 'stroke-dashoffset 0.5s ease' }}
//       />
//     </svg>
//   );
// };

// const Plan = () => {
//   useCrmSocket();
//   const queryClient = useQueryClient();
//   const { user } = useAuthStore();

//   const [selectedDate, setSelectedDate] = useState(new Date());
//   const [goals, setGoals] = useState(() => {
//     try { return JSON.parse(localStorage.getItem('plan_goals') || '{"calls":50,"conversions":5}'); }
//     catch { return { calls: 50, conversions: 5 }; }
//   });
//   const [timeBlocks, setTimeBlocks] = useState(() => {
//     try { return JSON.parse(localStorage.getItem('plan_timeBlocks') || JSON.stringify(DEFAULT_TIME_BLOCKS)); }
//     catch { return DEFAULT_TIME_BLOCKS; }
//   });
//   const [notes, setNotes] = useState('');
//   const [actingLeadId, setActingLeadId] = useState<string | null>(null);
//   const [now, setNow] = useState(new Date());

//   useEffect(() => { localStorage.setItem('plan_goals', JSON.stringify(goals)); }, [goals]);
//   useEffect(() => { localStorage.setItem('plan_timeBlocks', JSON.stringify(timeBlocks)); }, [timeBlocks]);

//   useEffect(() => {
//     const saved = localStorage.getItem(`plan_notes_${format(selectedDate, 'yyyy-MM-dd')}`);
//     setNotes(saved || '');
//   }, [selectedDate]);

//   useEffect(() => {
//     if (notes) localStorage.setItem(`plan_notes_${format(selectedDate, 'yyyy-MM-dd')}`, notes);
//     else localStorage.removeItem(`plan_notes_${format(selectedDate, 'yyyy-MM-dd')}`);
//   }, [notes, selectedDate]);

//   // Live clock for pace calculation
//   useEffect(() => {
//     const t = setInterval(() => setNow(new Date()), 30000);
//     return () => clearInterval(t);
//   }, []);

//   // Listen for live lead updates to refresh the wins feed + streak instantly
//   useEffect(() => {
//     const socket = getSocket();
//     const onLeadUpdated = () => {
//       queryClient.invalidateQueries({ queryKey: ['activity-logs', 'today'] });
//     };
//     socket.on('crm:lead:updated', onLeadUpdated);
//     return () => { socket.off('crm:lead:updated', onLeadUpdated); };
//   }, [queryClient]);

//   const dateStr = format(selectedDate, 'yyyy-MM-dd');
//   const isToday = isSameDay(selectedDate, new Date());

//   const { data: followups = [], isLoading: loadingFollowups } = useQuery({
//     queryKey: ['leads', 'upcoming', 'plan'],
//     queryFn: async () => {
//       const { data } = await api.get('/leads/upcoming');
//       return data.success ? data.leads || [] : [];
//     },
//   });

//   const { data: priorityLeads = [], isLoading: loadingPriority } = useQuery({
//     queryKey: ['leads', 'plan', 'priority'],
//     queryFn: async () => {
//       const { data } = await api.get('/leads', { params: { limit: 10, status: 'callback_scheduled,meeting_scheduled,interested,new' } });
//       return (data.success ? data.leads || [] : []).filter((l: any) =>
//         ['callback_scheduled', 'meeting_scheduled', 'interested', 'new'].includes(l.status)
//       );
//     },
//   });

//   const { data: todayEvents = [], isLoading: loadingEvents } = useQuery({
//     queryKey: ['calendar-events', dateStr],
//     queryFn: async () => {
//       const { data } = await api.get('/calendar-events', { params: { start: dateStr, end: dateStr } });
//       return data.events || [];
//     },
//   });

//   // Today's activity logs -> wins feed + live call/conversion counts
//   const { data: activityLogs = [], isLoading: loadingActivity } = useQuery({
//     queryKey: ['activity-logs', 'today'],
//     queryFn: async () => {
//       const { data } = await api.get('/activity-logs', { params: { limit: 200 } });
//       if (!data.success) return [];
//       const startOfToday = new Date();
//       startOfToday.setHours(0, 0, 0, 0);
//       return (data.logs || []).filter((log: any) => {
//         const logUserId = typeof log.user === 'object' ? log.user?._id : log.user;
//         return logUserId === user?._id && new Date(log.createdAt) >= startOfToday;
//       });
//     },
//     refetchInterval: 60000,
//   });

//   const callsToday = useMemo(
//     () => activityLogs.filter((l: any) => /^Call #\d+ recorded/.test(l.action)).length,
//     [activityLogs]
//   );
//   const conversionsToday = useMemo(
//     () => activityLogs.filter((l: any) =>
//       /status changed/i.test(l.action) && /closed_won/i.test(l.action.replace(/ /g, '_'))
//     ).length,
//     [activityLogs]
//   );

//   // Pace indicator: expected calls by now vs. actual
//   const paceInfo = useMemo(() => {
//     if (!isToday) return null;
//     const hour = now.getHours() + now.getMinutes() / 60;
//     if (hour < WORKDAY_START_HOUR) return { label: 'Day not started yet', diff: 0, onTrack: true };
//     const clampedHour = Math.min(hour, WORKDAY_END_HOUR);
//     const elapsedFraction = (clampedHour - WORKDAY_START_HOUR) / (WORKDAY_END_HOUR - WORKDAY_START_HOUR);
//     const expectedCalls = Math.round(goals.calls * Math.min(elapsedFraction, 1));
//     const diff = callsToday - expectedCalls;
//     return { label: diff >= 0 ? `+${diff} ahead of pace` : `${Math.abs(diff)} behind pace`, diff, onTrack: diff >= 0 };
//   }, [now, callsToday, goals.calls, isToday]);

//   // Streak: consecutive past days (from localStorage record) where call target was hit
//   const [streak, setStreak] = useState(0);
//   useEffect(() => {
//     try {
//       const record = JSON.parse(localStorage.getItem('plan_streak_record') || '{}');
//       let count = 0;
//       let d = addDays(new Date(), -1);
//       while (record[format(d, 'yyyy-MM-dd')] === true) {
//         count++;
//         d = addDays(d, -1);
//       }
//       setStreak(count);
//     } catch { setStreak(0); }
//   }, []);

//   useEffect(() => {
//     if (!isToday) return;
//     if (callsToday >= goals.calls && goals.calls > 0) {
//       try {
//         const record = JSON.parse(localStorage.getItem('plan_streak_record') || '{}');
//         record[dateStr] = true;
//         localStorage.setItem('plan_streak_record', JSON.stringify(record));
//       } catch { /* noop */ }
//     }
//   }, [callsToday, goals.calls, isToday, dateStr]);

//   const handlePrevDay = () => setSelectedDate(d => addDays(d, -1));
//   const handleNextDay = () => setSelectedDate(d => addDays(d, 1));

//   const updateTimeBlock = (idx: number, text: string) => {
//     setTimeBlocks((prev: any[]) => prev.map((b, i) => i === idx ? { ...b, text } : b));
//   };

//   const handleGoalChange = (field: 'calls' | 'conversions', value: string) => {
//     setGoals((prev: any) => ({ ...prev, [field]: parseInt(value) || 0 }));
//   };

//   // Inline quick-action mutation -> recordCall (increments callCount + sets status together)
//   const quickActionMutation = useMutation({
//     mutationFn: async ({ leadId, status }: { leadId: string; status: string }) => {
//       const { data } = await api.put(`/leads/${leadId}/call`, { status });
//       return data;
//     },
//     onMutate: async ({ leadId }) => {
//       setActingLeadId(leadId);
//       await queryClient.cancelQueries({ queryKey: ['leads', 'plan', 'priority'] });
//       const previous = queryClient.getQueryData<any[]>(['leads', 'plan', 'priority']);
//       return { previous };
//     },
//     onError: (_err, _vars, context) => {
//       if (context?.previous) queryClient.setQueryData(['leads', 'plan', 'priority'], context.previous);
//     },
//     onSettled: () => {
//       setActingLeadId(null);
//       queryClient.invalidateQueries({ queryKey: ['leads', 'plan', 'priority'] });
//       queryClient.invalidateQueries({ queryKey: ['leads', 'upcoming', 'plan'] });
//       queryClient.invalidateQueries({ queryKey: ['activity-logs', 'today'] });
//     },
//   });

//   const targetHit = isToday && goals.calls > 0 && callsToday >= goals.calls;

//   return (
//     <div style={{ maxWidth: 1200 }}>
//       {/* ── Header ── */}
//       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
//         <div>
//           <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
//             Daily Planner
//           </h1>
//           <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
//             Plan your calls, track your targets, and stay on top of follow-ups
//           </p>
//         </div>

//         <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
//           {!isToday && (
//             <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(new Date())}
//               style={{ padding: '4px 10px', fontWeight: 600, fontSize: '0.75rem' }}>
//               Today
//             </button>
//           )}
//           <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px', borderRadius: 6, background: 'var(--color-surface-hover)' }}>
//             <button className="btn btn-ghost btn-sm" onClick={handlePrevDay} style={{ padding: '2px 6px', borderRadius: 4 }}>
//               <ChevronLeft size={15} />
//             </button>
//             <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', minWidth: 150, textAlign: 'center', justifyContent: 'center' }}>
//               <Calendar size={14} style={{ color: 'var(--color-primary)' }} />
//               {format(selectedDate, 'MMM dd, yyyy')}
//             </span>
//             <button className="btn btn-ghost btn-sm" onClick={handleNextDay} style={{ padding: '2px 6px', borderRadius: 4 }}>
//               <ChevronRight size={15} />
//             </button>
//           </div>
//         </div>
//       </div>

//       <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24, alignItems: 'start' }}>

//         {/* ── LEFT COLUMN ── */}
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

//           {/* Momentum Dashboard */}
//           {targetHit ? (
//             <div className="card animate-fade-in" style={{
//               padding: 24, display: 'flex', alignItems: 'center', gap: 16,
//               background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))',
//               border: '1px solid rgba(34,197,94,0.3)',
//             }}>
//               <Sparkles size={28} style={{ color: '#22c55e', flexShrink: 0 }} />
//               <div>
//                 <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#16a34a' }}>
//                   Target smashed — {callsToday}/{goals.calls} calls
//                 </div>
//                 <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
//                   Great work today. Keep the streak alive tomorrow.
//                 </div>
//               </div>
//             </div>
//           ) : (
//             <div className="card animate-fade-in" style={{ padding: 24 }}>
//               <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
//                 <Target size={20} style={{ color: 'var(--color-primary)' }} />
//                 <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Momentum</h3>
//               </div>

//               <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
//                 {/* Ring */}
//                 <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
//                   <CircularProgress value={callsToday} max={goals.calls} />
//                   <div style={{
//                     position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
//                     alignItems: 'center', justifyContent: 'center',
//                   }}>
//                     <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{callsToday}</span>
//                     <span style={{ fontSize: '0.625rem', color: 'var(--color-text-tertiary)' }}>/ {goals.calls}</span>
//                   </div>
//                 </div>

//                 {/* Stats */}
//                 <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 180 }}>
//                   {streak > 0 && (
//                     <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', fontWeight: 600, color: '#f97316' }}>
//                       <Flame size={16} />
//                       {streak}-day streak hitting your call target
//                     </div>
//                   )}
//                   {paceInfo && (
//                     <div style={{
//                       display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', fontWeight: 600,
//                       color: paceInfo.onTrack ? '#16a34a' : 'var(--color-warning)',
//                     }}>
//                       {paceInfo.onTrack ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
//                       {paceInfo.label}
//                     </div>
//                   )}
//                   <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
//                     <CheckCircle2 size={16} style={{ color: 'var(--color-primary)' }} />
//                     {conversionsToday} / {goals.conversions} conversions today
//                   </div>
//                 </div>
//               </div>

//               {/* Goal inputs */}
//               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
//                 <div>
//                   <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 6 }}>Call Target</label>
//                   <div style={{ position: 'relative' }}>
//                     <Phone size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--color-text-tertiary)' }} />
//                     <input type="number" className="input" value={goals.calls}
//                       onChange={e => handleGoalChange('calls', e.target.value)}
//                       style={{ paddingLeft: 36, fontSize: '1rem', fontWeight: 600 }} />
//                   </div>
//                 </div>
//                 <div>
//                   <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 6 }}>Conversion Target</label>
//                   <div style={{ position: 'relative' }}>
//                     <CheckCircle2 size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--color-text-tertiary)' }} />
//                     <input type="number" className="input" value={goals.conversions}
//                       onChange={e => handleGoalChange('conversions', e.target.value)}
//                       style={{ paddingLeft: 36, fontSize: '1rem', fontWeight: 600 }} />
//                   </div>
//                 </div>
//               </div>
//             </div>
//           )}

//           {/* Action Queue */}
//           <div className="card animate-fade-in" style={{ padding: 24 }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
//               <Zap size={20} style={{ color: 'var(--color-danger)' }} />
//               <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Action Queue</h3>
//               {loadingPriority && <Loader2 size={14} className="animate-spin" />}
//             </div>
//             {priorityLeads.length === 0 && !loadingPriority ? (
//               <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
//                 <Inbox size={20} />
//                 <span>No leads needing attention right now</span>
//               </div>
//             ) : (
//               <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
//                 {priorityLeads.slice(0, 20).map((lead: any) => {
//                   const acting = actingLeadId === lead._id && quickActionMutation.isPending;
//                   return (
//                     <div key={lead._id} style={{
//                       padding: '12px 14px', borderRadius: 10, background: 'var(--color-surface-hover)',
//                       display: 'flex', flexDirection: 'column', gap: 10,
//                     }}>
//                       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//                         <div style={{ width: 3, height: 32, borderRadius: 2, background: FILL_COLORS[lead.status] || 'var(--color-text-tertiary)', flexShrink: 0 }} />
//                         <div style={{ flex: 1, minWidth: 0 }}>
//                           <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{lead.name}</div>
//                           <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
//                             {lead.companyName || lead.phone || ''}
//                           </div>
//                         </div>
//                         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
//                           <span style={{ fontSize: '0.625rem', padding: '2px 6px', borderRadius: 4, background: `${FILL_COLORS[lead.status]}20`, color: FILL_COLORS[lead.status], fontWeight: 600 }}>
//                             {STATUS_LABELS[lead.status] || lead.status}
//                           </span>
//                           {lead.priority && (
//                             <span style={{ fontSize: '0.6rem', color: 'var(--color-text-tertiary)', fontWeight: 500, textTransform: 'uppercase' }}>
//                               {PRIORITY_LABELS[lead.priority] || lead.priority}
//                             </span>
//                           )}
//                         </div>
//                       </div>

//                       {/* Inline quick actions */}
//                       <div style={{ display: 'flex', gap: 6 }}>
//                         <button
//                           className="btn btn-sm"
//                           disabled={acting}
//                           onClick={() => quickActionMutation.mutate({ leadId: lead._id, status: 'connected' })}
//                           style={{ flex: 1, fontSize: '0.7rem', background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
//                         >
//                           {acting ? <Loader2 size={12} className="animate-spin" /> : <Phone size={12} />} Connected
//                         </button>
//                         <button
//                           className="btn btn-sm"
//                           disabled={acting}
//                           onClick={() => quickActionMutation.mutate({ leadId: lead._id, status: 'callback_scheduled' })}
//                           style={{ flex: 1, fontSize: '0.7rem', background: 'rgba(6,182,212,0.12)', color: '#0891b2', border: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
//                         >
//                           <CalendarClock size={12} /> Callback
//                         </button>
//                         <button
//                           className="btn btn-sm"
//                           disabled={acting}
//                           onClick={() => quickActionMutation.mutate({ leadId: lead._id, status: 'not_reachable' })}
//                           style={{ flex: 1, fontSize: '0.7rem', background: 'rgba(249,115,22,0.12)', color: '#ea580c', border: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
//                         >
//                           <PhoneOff size={12} /> No Answer
//                         </button>
//                       </div>
//                     </div>
//                   );
//                 })}
//               </div>
//             )}
//           </div>

//           {/* Time Blocking */}
//           <div className="card animate-fade-in" style={{ padding: 24 }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
//               <Clock size={20} style={{ color: 'var(--color-info)' }} />
//               <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Time Blocking</h3>
//             </div>
//             <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
//               {timeBlocks.map((block: any, idx: number) => {
//                 const blockHour = parseInt(block.time.split(':')[0], 10);
//                 const isActive = isToday && now.getHours() === blockHour;
//                 return (
//                   <div key={idx} style={{
//                     display: 'flex', alignItems: 'center', gap: 12, padding: isActive ? '6px 8px' : 0,
//                     borderRadius: 8, background: isActive ? 'var(--color-primary-light)' : 'transparent',
//                     transition: 'background 0.2s',
//                   }}>
//                     <div style={{ minWidth: 70, fontSize: '0.75rem', fontWeight: 600, color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
//                       {isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary)', display: 'inline-block' }} />}
//                       {block.label}
//                     </div>
//                     <input
//                       type="text"
//                       className="input"
//                       value={block.text}
//                       onChange={e => updateTimeBlock(idx, e.target.value)}
//                       placeholder="What are you doing this hour?"
//                       style={{ flex: 1, fontSize: '0.8125rem' }}
//                     />
//                   </div>
//                 );
//               })}
//             </div>
//           </div>
//         </div>

//         {/* ── RIGHT COLUMN ── */}
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

//           {/* Today's Wins */}
//           <div className="card animate-fade-in" style={{ padding: 24 }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
//               <Sparkles size={20} style={{ color: '#f59e0b' }} />
//               <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Today's Wins</h3>
//               {loadingActivity && <Loader2 size={14} className="animate-spin" />}
//             </div>
//             {activityLogs.length === 0 && !loadingActivity ? (
//               <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
//                 <Sparkles size={20} />
//                 <span>Your first action today will show up here</span>
//               </div>
//             ) : (
//               <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
//                 {activityLogs.slice(0, 30).map((log: any) => (
//                   <div key={log._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--color-surface-hover)' }}>
//                     <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', marginTop: 5, flexShrink: 0 }} />
//                     <div style={{ flex: 1, minWidth: 0 }}>
//                       <div style={{ fontSize: '0.78125rem', fontWeight: 500 }}>{log.action}</div>
//                       <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
//                         {log.metadata?.name ? `${log.metadata.name} · ` : ''}{format(parseISO(log.createdAt), 'h:mm a')}
//                       </div>
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>

//           {/* Today's Events */}
//           <div className="card animate-fade-in" style={{ padding: 24 }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
//               <CalendarCheck size={20} style={{ color: 'var(--color-primary)' }} />
//               <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Today's Events</h3>
//               {loadingEvents && <Loader2 size={14} className="animate-spin" />}
//             </div>
//             {todayEvents.length === 0 && !loadingEvents ? (
//               <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
//                 <Calendar size={20} />
//                 <span>No events scheduled for this day</span>
//               </div>
//             ) : (
//               <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
//                 {todayEvents.map((ev: any) => (
//                   <div key={ev._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--color-surface-hover)' }}>
//                     <div style={{ width: 3, height: 32, borderRadius: 2, background: ev.color || 'var(--color-primary)', flexShrink: 0 }} />
//                     <div style={{ flex: 1, minWidth: 0 }}>
//                       <div style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
//                       <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
//                         {ev.startDate ? format(parseISO(ev.startDate), 'h:mm a') : ''} {ev.location ? `\u00b7 ${ev.location}` : ''}
//                       </div>
//                     </div>
//                     <span style={{ fontSize: '0.625rem', padding: '2px 6px', borderRadius: 4, background: 'var(--color-primary-light)', color: 'var(--color-primary)', fontWeight: 600, textTransform: 'uppercase' }}>
//                       {ev.eventType}
//                     </span>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>

//           {/* Upcoming Follow-ups */}
//           <div className="card animate-fade-in" style={{ padding: 24 }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
//               <PhoneCall size={20} style={{ color: 'var(--color-warning)' }} />
//               <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Follow-ups & Callbacks</h3>
//               {loadingFollowups && <Loader2 size={14} className="animate-spin" />}
//             </div>
//             {followups.length === 0 && !loadingFollowups ? (
//               <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
//                 <PhoneCall size={20} />
//                 <span>No follow-ups scheduled</span>
//               </div>
//             ) : (
//               <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
//                 {followups.filter((l: any) => l.nextFollowupAt).slice(0, 15).map((lead: any) => (
//                   <div key={lead._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--color-surface-hover)' }}>
//                     <div style={{ width: 3, height: 32, borderRadius: 2, background: FILL_COLORS[lead.status] || 'var(--color-text-tertiary)', flexShrink: 0 }} />
//                     <div style={{ flex: 1, minWidth: 0 }}>
//                       <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{lead.name}</div>
//                       <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
//                         {lead.companyName || lead.phone || ''} {lead.nextFollowupAt ? `\u00b7 ${format(parseISO(lead.nextFollowupAt), 'MMM d, h:mm a')}` : ''}
//                       </div>
//                     </div>
//                     <span style={{ fontSize: '0.625rem', padding: '2px 6px', borderRadius: 4, background: `${FILL_COLORS[lead.status]}20`, color: FILL_COLORS[lead.status], fontWeight: 600 }}>
//                       {STATUS_LABELS[lead.status] || lead.status}
//                     </span>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>

//           {/* Notes */}
//           <div className="card animate-fade-in" style={{ padding: 24 }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
//               <MessageSquare size={20} style={{ color: 'var(--color-text-tertiary)' }} />
//               <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Daily Notes</h3>
//             </div>
//             <textarea
//               className="input"
//               placeholder="Note down important reminders for this day..."
//               style={{ minHeight: 120, resize: 'vertical', fontSize: '0.8125rem' }}
//               value={notes}
//               onChange={e => setNotes(e.target.value)}
//             />
//           </div>

//         </div>
//       </div>
//     </div>
//   );
// };

// export default Plan;