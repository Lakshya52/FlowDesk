import React, { useState } from "react";
import {
  format,
  addMonths,
  startOfYear,
  endOfMonth,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
} from "date-fns";
import { useCalendarStore } from "../../store/calendarStore";

interface YearViewProps {
  events: any[];
}

const YearView: React.FC<YearViewProps> = ({ events }) => {
  const { currentDate, setCurrentDate, setCurrentView } = useCalendarStore();

  const yearStart = startOfYear(currentDate);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(yearStart, i));

  // const getEventCountForDay = (date: Date) => {
  //   const dayStart = startOfDay(date);
  //   const dayEnd = endOfDay(date);
  //   return events.filter(event => {
  //     const eStart = new Date(event.startDate);
  //     const eEnd = new Date(event.endDate);
  //     return isSameDay(eStart, date) || isSameDay(eEnd, date) || (eStart < dayStart && eEnd > dayEnd);
  //   }).length;
  // };

  // const getHeatmapColor = (count: number) => {
  //   if (count === 0) return { backgroundColor: 'transparent', color: 'var(--color-text)' };
  //   if (count <= 2) return { backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)', fontWeight: 500 };
  //   if (count <= 4) return { backgroundColor: 'var(--color-primary)', color: '#ffffff', fontWeight: 'bold' };
  //   return { backgroundColor: 'var(--color-primary-hover)', color: '#ffffff', fontWeight: 'bold' };
  // };

  const [tooltip, setTooltip] = useState<{
    dayKey: string;
    x: number;
    y: number;
  } | null>(null);

  const getEventsForDay = (date: Date) => {
    return events.filter((e) => isSameDay(new Date(e.startDate), date));
  };

  const renderMonth = (monthDate: Date) => {
    const mStart = startOfMonth(monthDate);
    const mEnd = endOfMonth(mStart);
    const startDate = startOfWeek(mStart);
    const endDate = endOfWeek(mEnd);

    const days = [];
    let day = startDate;
    while (day <= endDate) {
      days.push(day);
      day = addDays(day, 1);
    }

    return (
      <div
        key={monthDate.toString()}
        style={{
          backgroundColor: "var(--color-surface)",
          padding: "16px",
          borderRadius: "12px",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <h3
          style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "var(--color-text)",
            marginBottom: "16px",
            cursor: "pointer",
            transition: "color 0.2s",
          }}
          onClick={() => {
            setCurrentDate(monthDate);
            setCurrentView("month");
          }}
          onMouseOver={(e) =>
            (e.currentTarget.style.color = "var(--color-primary)")
          }
          onMouseOut={(e) =>
            (e.currentTarget.style.color = "var(--color-text)")
          }
        >
          {format(monthDate, "MMMM")}
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: "4px",
            marginBottom: "8px",
          }}
        >
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div
              key={i}
              style={{
                textAlign: "center",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--color-text-tertiary)",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: "4px",
          }}
        >
          {days.map((d, i) => {
            const isCurrentMonth = isSameMonth(d, monthDate);
            const isToday = isSameDay(d, new Date());
            const dayEvents = isCurrentMonth ? getEventsForDay(d) : [];
            const visibleDots = dayEvents.slice(0, 3);
            const extraCount = dayEvents.length - visibleDots.length;
            const dayKey = format(d, "yyyy-MM-dd");

            return (
              <div
                key={i}
                onClick={() => {
                  if (isCurrentMonth) {
                    setCurrentDate(d);
                    setCurrentView("day");
                  }
                }}
                onMouseEnter={(e) => {
                  if (isCurrentMonth && dayEvents.length > 0) {
                    setTooltip({ dayKey, x: e.clientX, y: e.clientY });
                  }
                  if (isCurrentMonth)
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      "var(--color-surface-hover)";
                }}
                onMouseLeave={(e) => {
                  setTooltip(null);
                  if (isCurrentMonth)
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      "transparent";
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  paddingTop: "4px",
                  paddingBottom: "4px",
                  minHeight: "44px",
                  borderRadius: "6px",
                  cursor: isCurrentMonth ? "pointer" : "default",
                  transition: "background-color 0.15s",
                  backgroundColor: "transparent",
                  position: "relative",
                }}
              >
                {/* Date number */}
                <div
                  style={{
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  fontSize: '13px',
                  fontWeight: isToday ? 700 : 400,
                  backgroundColor: isToday ? 'var(--color-primary)' : 'transparent',
                  color: isToday ? '#fff' : !isCurrentMonth ? 'transparent' : 'var(--color-text)',
                }}>
                  {isCurrentMonth ? format(d, "d") : ""}
                </div>

                {/* Event dots */}
                {isCurrentMonth && dayEvents.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "2px",
                      marginTop: "3px",
                      flexWrap: "nowrap",
                    }}
                  >
                    {visibleDots.map((ev, idx) => (
                      <div
                        key={idx}
                        style={{
                          width: "5px",
                          height: "5px",
                          borderRadius: "50%",
                          backgroundColor: ev.calendar?.color || "#6366f1",
                          flexShrink: 0,
                        }}
                      />
                    ))}
                    {extraCount > 0 && (
                      <span
                        style={{
                          fontSize: "9px",
                          color: "var(--color-text-muted)",
                          lineHeight: 1,
                        }}
                      >
                        +{extraCount}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const tooltipEvents = tooltip
    ? events.filter(e => isSameDay(new Date(e.startDate), new Date(tooltip.dayKey)))
    : [];

  return (
    <div style={{ flex: 1, backgroundColor: 'var(--color-bg)', overflowY: 'auto', padding: '24px', position: 'relative' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
          {months.map(renderMonth)}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && tooltipEvents.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: tooltip.y + 12,
            left: tooltip.x + 12,
            zIndex: 50,
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-lg)',
            padding: '10px 14px',
            minWidth: '180px',
            maxWidth: '240px',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '8px' }}>
            {format(new Date(tooltip.dayKey), 'EEE, MMM d')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {tooltipEvents.map((ev, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: ev.calendar?.color || '#6366f1', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ev.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default YearView;
