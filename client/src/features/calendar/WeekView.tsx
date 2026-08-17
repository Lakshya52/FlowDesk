import React, { useState, useEffect, useRef } from "react";
import {
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isSameDay,
  startOfDay,
  endOfDay,
} from "date-fns";
import { useCalendarStore } from '@/store/calendarStore';

import { useQueryClient } from "@tanstack/react-query";
import api from '@/lib/api';
import toast from "react-hot-toast";

interface WeekViewProps {
  events: any[];
}

const WeekView: React.FC<WeekViewProps> = ({ events }) => {
  const { currentDate, openEventModal, openEventDrawer } = useCalendarStore();
  const [now, setNow] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const currentHour = new Date().getHours();
      const scrollTop = Math.max(0, (currentHour - 2) * 64); // 64px per hour in WeekView
      scrollRef.current.scrollTop = scrollTop;
    }
  }, []);

  const queryClient = useQueryClient();
  const dragRef = useRef<{
    eventId: string;
    startY: number;
    startX: number;
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

  const startDate = startOfWeek(currentDate);
  const endDate = endOfWeek(currentDate);

  const days = [];
  let day = startDate;
  while (day <= endDate) {
    days.push(day);
    day = addDays(day, 1);
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const handleDragStart = (
    e: React.MouseEvent,
    event: any,
    dayIndex: number,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const HOUR_PX = 64;
    const SNAP_MINUTES = 15;
    // const SNAP_PX = (SNAP_MINUTES / 60) * HOUR_PX;

    // Get column width for horizontal movement
    // Get column width for horizontal movement
    const columnEl = el.parentElement as HTMLElement;
    const gridEl = columnEl?.parentElement as HTMLElement;
    const columnWidth = columnEl?.offsetWidth || 100;

    // Build an ordered array of day columns (excluding the time gutter)
    const dayColumns = gridEl
      ? (Array.from(gridEl.children).filter(
          (c) => (c as HTMLElement).style.position === "relative",
        ) as HTMLElement[])
      : [];

    dragRef.current = {
      eventId: event._id,
      startY: e.clientY,
      startX: e.clientX,
      originalStart: new Date(event.startDate),
      originalEnd: new Date(event.endDate),
      el,
    };

    el.style.opacity = "0.85";
    el.style.zIndex = "99";
    el.style.boxShadow = "var(--shadow-xl)";
    el.style.transition =
      "transform 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94)";

    // Ghost element
    const ghost = document.createElement("div");
    ghost.style.cssText = `
    position: absolute;
    left: 4px; right: 4px;
    height: ${el.offsetHeight}px;
    border-radius: 4px;
    border: 2px dashed ${event.calendar?.color || "#6366f1"};
    background: ${event.calendar?.color || "#6366f1"}15;
    pointer-events: none;
    z-index: 98;
    top: ${el.offsetTop}px;
    transition: top 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  `;
    columnEl?.appendChild(ghost);

    // Track which column ghost is in
    let ghostColumnEl = columnEl;
    // let currentDayOffset = 0;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;

      const deltaY = ev.clientY - dragRef.current.startY;
      const deltaX = ev.clientX - dragRef.current.startX;

      // Vertical snap
      const rawMinutes = (deltaY / HOUR_PX) * 60;
      const snappedMinutes =
        Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
      const snappedDeltaY = (snappedMinutes / 60) * HOUR_PX;
      const snapDiff = Math.abs(deltaY - snappedDeltaY);

      // Horizontal: which day column are we over?
      const dayOffset = Math.round(deltaX / columnWidth);
      const clampedDayOffset = Math.max(
        -dayIndex,
        Math.min(6 - dayIndex, dayOffset),
      );

      // Move dragged element
      el.style.transform = `translate(${clampedDayOffset * columnWidth}px, ${snapDiff < 4 ? snappedDeltaY : deltaY}px)`;

      // Move ghost to correct column
      // Move ghost to correct column
      const targetColIndex = dayIndex + clampedDayOffset;
      const newColumnEl = dayColumns[targetColIndex];
      if (newColumnEl && newColumnEl !== ghostColumnEl) {
        ghostColumnEl?.removeChild(ghost);
        newColumnEl.appendChild(ghost);
        ghostColumnEl = newColumnEl;
        // currentDayOffset = clampedDayOffset;
      }

      // Update ghost vertical position
      const newTop = el.offsetTop + snappedDeltaY;
      ghost.style.top = `${newTop}px`;

      // Time label
      const newStart = new Date(
        dragRef.current.originalStart.getTime() + snappedMinutes * 60000,
      );
      const h = newStart.getHours();
      const m = newStart.getMinutes().toString().padStart(2, "0");
      const ampm = h >= 12 ? "PM" : "AM";
      ghost.title = `${h % 12 || 12}:${m} ${ampm}`;
    };

    const onMouseUp = async (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (!dragRef.current) return;

      ghost.remove();

      const deltaY = ev.clientY - dragRef.current.startY;
      const deltaX = ev.clientX - dragRef.current.startX;
      const rawMinutes = (deltaY / HOUR_PX) * 60;
      const deltaMinutes = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
      const dayOffset = Math.round(deltaX / columnWidth);
      const clampedDayOffset = Math.max(
        -dayIndex,
        Math.min(6 - dayIndex, dayOffset),
      );

      el.style.opacity = "1";
      el.style.zIndex = "";
      el.style.transform = "";
      el.style.boxShadow = "";
      el.style.transition = "";

      const didDrag = Math.abs(deltaY) > 5 || Math.abs(deltaX) > 5;
      dragRef.current.el.dataset.dragged = didDrag ? "true" : "false";

      if (deltaMinutes === 0 && clampedDayOffset === 0) {
        dragRef.current = null;
        return;
      }

      const newStart = new Date(
        dragRef.current.originalStart.getTime() +
          deltaMinutes * 60000 +
          clampedDayOffset * 24 * 60 * 60 * 1000,
      );
      const newEnd = new Date(
        dragRef.current.originalEnd.getTime() +
          deltaMinutes * 60000 +
          clampedDayOffset * 24 * 60 * 60 * 1000,
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
        overflowX: "auto",
        overflowY: "hidden",
      }}
    >
      <div
        style={{
          minWidth: "700px",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--color-border)",
            backgroundColor: "var(--color-bg)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "64px",
              borderRight: "1px solid var(--color-border)",
            }}
          ></div>
          {days.map((day) => {
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={day.toString()}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  textAlign: "center",
                  borderRight: "1px solid var(--color-border)",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-secondary)",
                    fontWeight: 500,
                    textTransform: "uppercase",
                  }}
                >
                  {format(day, "EEE")}
                </div>
                <div
                  style={{
                    fontSize: "18px",
                    marginTop: "4px",
                    width: "32px",
                    height: "32px",
                    margin: "4px auto 0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    backgroundColor: isToday
                      ? "var(--color-primary)"
                      : "transparent",
                    color: isToday ? "#ffffff" : "var(--color-text)",
                    fontWeight: isToday ? "bold" : "normal",
                  }}
                >
                  {format(day, "d")}
                </div>
              </div>
            );
          })}
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
                  height: "64px",
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

          <div
            style={{
              flex: 1,
              display: "flex",
              position: "relative",
              height: "fit-content",
            }}
          >
            {days.map((day, idx) => {
              // Get events for this day
              const dayStart = startOfDay(day);
              const dayEnd = endOfDay(day);
              const dayEvents = events.filter((e) => {
                const eStart = new Date(e.startDate);
                const eEnd = new Date(e.endDate);
                return (
                  !e.allDay &&
                  (isSameDay(eStart, day) ||
                    isSameDay(eEnd, day) ||
                    (eStart < dayStart && eEnd > dayEnd))
                );
              });

              return (
                <div
                  key={day.toString()}
                  style={{
                    flex: 1,
                    borderRight:
                      idx === days.length - 1
                        ? "none"
                        : "1px solid var(--color-border)",
                    position: "relative",
                  }}
                >
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      style={{
                        height: "64px",
                        borderBottom: "1px solid var(--color-surface-hover)",
                        cursor: "pointer",
                        transition: "background-color 0.2s",
                      }}
                      onClick={() => {
                        const newDate = new Date(day);
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
                    const dayStartTime = startOfDay(day);
                    const dayEndTime = endOfDay(day);
                    const actualStart =
                      start < dayStartTime ? dayStartTime : start;
                    const actualEnd = end > dayEndTime ? dayEndTime : end;
                    const top =
                      actualStart.getHours() * 64 +
                      (actualStart.getMinutes() / 60) * 64;
                    const durationHours =
                      (actualEnd.getTime() - actualStart.getTime()) /
                      (1000 * 60 * 60);
                    const height = Math.max(durationHours * 64, 24); // min height 24px

                    return (
                      <div
                        key={event._id}
                        onMouseDown={(e) => handleDragStart(e, event, idx)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (e.currentTarget.dataset.dragged === "true") {
                            e.currentTarget.dataset.dragged = "false";
                            return;
                          }
                          openEventDrawer(event._id);
                        }}
                        style={{
                          position: "absolute",
                          cursor: "grab",
                          left: "4px",
                          right: "4px",
                          borderRadius: "4px",
                          padding: "4px",
                          fontSize: "12px",
                          overflow: "hidden",
                          // cursor: "pointer",
                          boxShadow: "var(--shadow-sm)",
                          transition: "all 0.2s",
                          top: `${top}px`,
                          height: `${height}px`,
                          backgroundColor: `${event.calendar?.color || "#6366f1"}30`,
                          borderLeft: `3px solid ${event.calendar?.color || "#6366f1"}`,
                          color: "var(--color-text)",
                        }}
                        onMouseOver={(e) =>
                          (e.currentTarget.style.filter = "brightness(0.95)")
                        }
                        onMouseOut={(e) =>
                          (e.currentTarget.style.filter = "none")
                        }
                      >
                        <div style={{ fontWeight: 600, fontSize: "10px" }}>
                          {format(start, "HH:mm")}
                        </div>
                        <div
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {event.title}
                        </div>
                      </div>
                    );
                  })}

                  {/* Current Time Line */}
                  {isSameDay(day, now) && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: `${now.getHours() * 64 + (now.getMinutes() / 60) * 64}px`,
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
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeekView;
