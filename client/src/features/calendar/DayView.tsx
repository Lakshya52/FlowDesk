import React, { useState, useEffect, useRef } from "react";
import { format, isSameDay, startOfDay, endOfDay } from "date-fns";
import { useCalendarStore } from '@/store/calendarStore';

import { useQueryClient } from "@tanstack/react-query";
import api from '@/lib/api';
import toast from "react-hot-toast";

interface DayViewProps {
  events: any[];
}

const DayView: React.FC<DayViewProps> = ({ events }) => {
  const { currentDate, openEventModal, openEventDrawer } = useCalendarStore();
  const [now, setNow] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const currentHour = new Date().getHours();
      const scrollTop = Math.max(0, (currentHour - 2) * 80); // 80px per hour, scroll 2hrs before current
      scrollRef.current.scrollTop = scrollTop;
    }
  }, []);
  const queryClient = useQueryClient();
  const dragRef = useRef<{
    eventId: string;
    startY: number;
    originalStart: Date;
    originalEnd: Date;
    el: HTMLElement;
  } | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const dayStart = startOfDay(currentDate);
  const dayEnd = endOfDay(currentDate);

  const dayEvents = events.filter((e) => {
    const eStart = new Date(e.startDate);
    const eEnd = new Date(e.endDate);
    return (
      !e.allDay &&
      (isSameDay(eStart, currentDate) ||
        isSameDay(eEnd, currentDate) ||
        (eStart < dayStart && eEnd > dayEnd))
    );
  });

  const allDayEvents = events.filter((e) => {
    const eStart = new Date(e.startDate);
    const eEnd = new Date(e.endDate);
    return (
      e.allDay &&
      (isSameDay(eStart, currentDate) ||
        isSameDay(eEnd, currentDate) ||
        (eStart < dayStart && eEnd > dayEnd))
    );
  });

  const handleDragStart = (e: React.MouseEvent, event: any) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const HOUR_PX = 80; // 64 for WeekView
    const SNAP_MINUTES = 15;
    const SNAP_PX = (SNAP_MINUTES / 60) * HOUR_PX;

    dragRef.current = {
      eventId: event._id,
      startY: e.clientY,
      originalStart: new Date(event.startDate),
      originalEnd: new Date(event.endDate),
      el,
    };

    el.style.opacity = "0.85";
    el.style.zIndex = "99";
    el.style.boxShadow = "var(--shadow-xl)";
    el.style.transition =
      "transform 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94)"; // snap spring

    // Ghost line element showing snap target
    const ghost = document.createElement("div");
    ghost.style.cssText = `
    position: absolute;
    left: 8px; right: 16px;
    height: ${el.offsetHeight}px;
    border-radius: 4px;
    border: 2px dashed ${event.calendar?.color || "#6366f1"}70;
    pointer-events: none;
    z-index: 98;
    top: ${el.offsetTop}px;
    transition: top 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  `;
    el.parentElement?.appendChild(ghost);

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const rawDelta = ev.clientY - dragRef.current.startY;

      // Snap delta to nearest 15min interval
      const snappedDelta = Math.round(rawDelta / SNAP_PX) * SNAP_PX;
      const rawMinutes = (rawDelta / HOUR_PX) * 60;
      const snappedMinutes =
        Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;

      // Event follows mouse smoothly but snaps visually
      el.style.transform = `translateY(${rawDelta}px)`;

      // Ghost snaps to grid
      const newTop = el.offsetTop + snappedDelta;
      ghost.style.top = `${newTop}px`;

      // Show time label on ghost
      const newStart = new Date(
        dragRef.current.originalStart.getTime() + snappedMinutes * 60000,
      );
      const h = newStart.getHours();
      const m = newStart.getMinutes().toString().padStart(2, "0");
      const ampm = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 || 12;
      ghost.setAttribute("data-time", `${displayH}:${m} ${ampm}`);
      ghost.style.setProperty("--ghost-label", `"${displayH}:${m} ${ampm}"`);

      // Magnetic pull: when close to snap point, jump the dragged element too
      const snapDiff = Math.abs(rawDelta - snappedDelta);
      if (snapDiff < 4) {
        el.style.transform = `translateY(${snappedDelta}px)`;
      }
    };

    const onMouseUp = async (ev: MouseEvent) => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    if (!dragRef.current) return;

    ghost.remove();

    const rawDelta = ev.clientY - dragRef.current.startY;
    dragRef.current.el.dataset.dragged = Math.abs(rawDelta) > 5 ? 'true' : 'false';
      const rawMinutes = (rawDelta / HOUR_PX) * 60;
      const deltaMinutes = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;

      el.style.opacity = "1";
      el.style.zIndex = "";
      el.style.transform = "";
      el.style.boxShadow = "";
      el.style.transition = "";

      if (deltaMinutes === 0) {
        dragRef.current = null;
        return;
      }

      const newStart = new Date(
        dragRef.current.originalStart.getTime() + deltaMinutes * 60000,
      );
      const newEnd = new Date(
        dragRef.current.originalEnd.getTime() + deltaMinutes * 60000,
      );

      try {
        await api.put(`/calendar-events/${dragRef.current.eventId}/move`, {
          startDate: newStart.toISOString(),
          endDate: newEnd.toISOString(),
          allDay: false,
        });
        queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
        toast.success("Event rescheduled");
      } catch {
        toast.error("Failed to reschedule event");
      }
      dragRef.current = null;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--color-surface)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-bg)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              width: "64px",
              borderRight: "1px solid var(--color-border)",
            }}
          ></div>
          <div style={{ flex: 1, padding: "12px 16px" }}>
            <div
              style={{
                fontSize: "14px",
                color: "var(--color-text-secondary)",
                fontWeight: 500,
                textTransform: "uppercase",
              }}
            >
              {format(currentDate, "EEEE")}
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: "bold",
                color: "var(--color-text)",
              }}
            >
              {format(currentDate, "MMMM d, yyyy")}
            </div>
          </div>
        </div>

        {/* All day events section */}
        {allDayEvents.length > 0 && (
          <div
            style={{
              display: "flex",
              backgroundColor: "var(--color-surface)",
              borderBottom: "1px solid var(--color-border)",
              minHeight: "40px",
            }}
          >
            <div
              style={{
                width: "64px",
                borderRight: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                color: "var(--color-text-secondary)",
                fontWeight: 500,
              }}
            >
              All Day
            </div>
            <div
              style={{
                flex: 1,
                padding: "4px",
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
              }}
            >
              {allDayEvents.map((event) => (
                <div
                  key={event._id}
                  onClick={(e) => {
                    e.stopPropagation();
                    openEventDrawer(event._id);
                  }}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    cursor: "pointer",
                    transition: "background-color 0.2s",
                    boxShadow: "var(--shadow-sm)",
                    backgroundColor: `${event.calendar?.color || "#6366f1"}30`,
                    color: "var(--color-text)",
                    borderLeft: `3px solid ${event.calendar?.color || "#6366f1"}`,
                  }}
                >
                  {event.title}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Time Grid */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: "auto", display: "flex" }}
      >
        <div
          style={{
            width: "64px",
            flexShrink: 0,
            backgroundColor: "var(--color-bg)",
            borderRight: "1px solid var(--color-border)",
            height: "fit-content",
          }}
          className="this"
        >
          {hours.map((hour) => (
            <div
              key={hour}
              style={{
                height: "80px",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-end",
                paddingRight: "8px",
                paddingTop: "4px",
                fontSize: "12px",
                color: "var(--color-text-secondary)",
              }}
            >
              {hour === 0
                ? "12 AM"
                : hour < 12
                  ? `${hour} AM`
                  : hour === 12
                    ? "12 PM"
                    : `${hour - 12} PM`}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, position: "relative", height: "fit-content" }}>
          {hours.map((hour) => (
            <div
              key={hour}
              style={{
                height: "80px",
                borderBottom: "1px solid var(--color-surface-hover)",
                cursor: "pointer",
                transition: "background-color 0.2s",
              }}
              onClick={() => {
                const newDate = new Date(currentDate);
                newDate.setHours(hour);
                openEventModal(undefined, newDate);
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--color-primary-light)")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            ></div>
          ))}

          {/* Render Events */}
          {dayEvents.map((event) => {
            const start = new Date(event.startDate);
            const end = new Date(event.endDate);
            const dayStartTime = startOfDay(currentDate);
            const dayEndTime = endOfDay(currentDate);
            const actualStart = start < dayStartTime ? dayStartTime : start;
            const actualEnd = end > dayEndTime ? dayEndTime : end;
            const top =
              actualStart.getHours() * 80 +
              (actualStart.getMinutes() / 60) * 80;
            const durationHours =
              (actualEnd.getTime() - actualStart.getTime()) / (1000 * 60 * 60);
            const height = Math.max(durationHours * 80, 24);

            return (
              <div
                key={event._id}
                onMouseDown={(e) => handleDragStart(e, event)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.currentTarget.dataset.dragged === 'true') {
                    e.currentTarget.dataset.dragged = 'false';
                    return;
                  }
                  openEventDrawer(event._id);
                }}
                style={{
                  position: "absolute",
                  cursor: "grab",
                  left: "8px",
                  right: "16px",
                  borderRadius: "4px",
                  padding: "8px",
                  fontSize: "14px",
                  overflow: "hidden",
                  // cursor: "pointer",
                  boxShadow: "var(--shadow-md)",
                  transition: "all 0.2s",
                  border: "1px solid var(--color-surface-hover)",
                  top: `${top}px`,
                  height: `${height}px`,
                  backgroundColor: `${event.calendar?.color || "#6366f1"}20`,
                  borderLeft: `4px solid ${event.calendar?.color || "#6366f1"}`,
                  color: "var(--color-text)",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.boxShadow = "var(--shadow-lg)")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.boxShadow = "var(--shadow-md)")
                }
              >
                <div
                  style={{
                    fontWeight: 600,
                    color: "var(--color-text)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{event.title}</span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {format(start, "h:mm a")} - {format(end, "h:mm a")}
                  </span>
                </div>
                {event.description && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-secondary)",
                      marginTop: "4px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {event.description}
                  </div>
                )}
                {event.location && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-secondary)",
                      marginTop: "4px",
                    }}
                  >
                    📍 {event.location}
                  </div>
                )}
              </div>
            );
          })}

          {/* Current Time Line */}
          {isSameDay(currentDate, now) && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: `${now.getHours() * 80 + (now.getMinutes() / 60) * 80}px`,
                height: "2px",
                backgroundColor: "var(--color-danger)",
                zIndex: 20,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "-4px",
                  top: "-4px",
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-danger)",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DayView;
