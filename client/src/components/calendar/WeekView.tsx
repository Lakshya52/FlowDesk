import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import {
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isSameDay,
  startOfDay,
  endOfDay,
} from "date-fns";
import { useCalendarStore } from "../../store/calendarStore";
import { useCalendarEventDrag } from "../../hooks/useCalendarEventDrag";
import { onActivateKey } from "../../lib/keyboard";

interface WeekViewProps {
  events: any[];
}

const DEFAULT_HOUR_PX = 64;
const MIN_ZOOM = 0.35; // 35%
const MAX_ZOOM = 2.5; // 250%
const MIN_HOUR_PX = DEFAULT_HOUR_PX * MIN_ZOOM;
const MAX_HOUR_PX = DEFAULT_HOUR_PX * MAX_ZOOM;

const WeekView: React.FC<WeekViewProps> = ({ events }) => {
  const { currentDate, openEventModal, openEventDrawer } = useCalendarStore();
  const [now, setNow] = useState(new Date());
  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_PX);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Fractional source of truth for smooth trackpad/pinch accumulation.
  // `hourHeight` state mirrors it for rendering; `renderedHRef` tracks what
  // the DOM currently shows so cursor anchoring stays exact mid-gesture.
  const zoomRef = useRef(DEFAULT_HOUR_PX);
  const renderedHRef = useRef(DEFAULT_HOUR_PX);
  const pendingAnchorRef = useRef<{
    cursorY: number;
    timeHours: number;
  } | null>(null);
  const zoomRafRef = useRef(0);

  useEffect(() => {
    if (scrollRef.current) {
      const currentHour = new Date().getHours();
      const scrollTop = Math.max(0, (currentHour - 2) * zoomRef.current);
      scrollRef.current.scrollTop = scrollTop;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply cursor-anchored scroll *before paint* so zoom never visibly jumps.
  useLayoutEffect(() => {
    renderedHRef.current = hourHeight;
    const el = scrollRef.current;
    const anchor = pendingAnchorRef.current;
    if (!el || !anchor) return;
    pendingAnchorRef.current = null;
    el.scrollTop = Math.max(
      0,
      anchor.timeHours * hourHeight - anchor.cursorY,
    );
  }, [hourHeight]);

  const applyZoom = (next: number, cursorY?: number) => {
    const el = scrollRef.current;
    if (el) {
      const y = cursorY ?? el.clientHeight / 2;
      pendingAnchorRef.current = {
        cursorY: y,
        timeHours: (el.scrollTop + y) / renderedHRef.current,
      };
    }
    zoomRef.current = next;
    setHourHeight(next);
  };

  // Alt + wheel => vertical-only zoom (adjust px-per-hour), anchored at cursor.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const commit = () => {
      zoomRafRef.current = 0;
      setHourHeight(zoomRef.current);
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.altKey) return;
      e.preventDefault();
      e.stopPropagation();

      // Normalize line-mode deltas (Firefox) to ~pixels.
      const rawDelta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      // Clamp huge jumps so one aggressive tick can't leap min<->max.
      const delta = Math.max(-100, Math.min(100, rawDelta));
      const oldZoom = zoomRef.current;
      // Exponential factor => smooth on both notched wheels and trackpads.
      // Wheel up (deltaY < 0) zooms in (taller hours), wheel down zooms out.
      const factor = Math.exp(-delta * 0.0015);
      const next = Math.max(
        MIN_HOUR_PX,
        Math.min(MAX_HOUR_PX, oldZoom * factor),
      );
      if (Math.abs(next - oldZoom) < 0.05) return;

      // Anchor against the currently *rendered* height (DOM truth), not the
      // in-flight target, so queued ticks in the same frame stay consistent.
      const rect = el.getBoundingClientRect();
      const cursorY = e.clientY - rect.top;
      pendingAnchorRef.current = {
        cursorY,
        timeHours: (el.scrollTop + cursorY) / renderedHRef.current,
      };

      zoomRef.current = next;
      // One state commit per frame no matter how many ticks arrive.
      if (!zoomRafRef.current) {
        zoomRafRef.current = requestAnimationFrame(commit);
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
        zoomRafRef.current = 0;
      }
    };
  }, []);

  // Alt+0 resets, Alt + +/- steps zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable);
      if (
        !typing &&
        e.altKey &&
        (e.key === "0" || e.key === "+" || e.key === "=" || e.key === "-")
      ) {
        e.preventDefault();
        if (e.key === "0") {
          applyZoom(DEFAULT_HOUR_PX);
        } else {
          // Proportional step so +/- feels even at 30% and at 250%.
          const oldH = zoomRef.current;
          const next = Math.max(
            MIN_HOUR_PX,
            Math.min(
              MAX_HOUR_PX,
              e.key === "-" ? oldH / 1.1 : oldH * 1.1,
            ),
          );
          applyZoom(next);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

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
  const { beginDrag } = useCalendarEventDrag({
    hourPx: hourHeight,
    allowDayChange: true,
    dayCount: 7,
    ghostLeft: "4px",
    ghostRight: "4px",
  });

  const handleDragStart = (
    e: React.MouseEvent,
    event: any,
    dayIndex: number,
  ) => {
    beginDrag(e, event, dayIndex);
  };

  const zoomPercent = Math.round((hourHeight / DEFAULT_HOUR_PX) * 100);

  return (
    <div
      title="Hold Alt and scroll to zoom the timeline vertically"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--color-surface)",
        overflowX: "auto",
        overflowY: "hidden",
        position: "relative",
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
                  height: `${hourHeight}px`,
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
                      role="button"
                      tabIndex={0}
                      aria-label={`Create event ${format(day, "EEE MMM d")} at ${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`}
                      className="cal-focusable"
                      style={{
                        height: `${hourHeight}px`,
                        borderBottom: "1px solid var(--color-surface-hover)",
                        cursor: "pointer",
                        transition: "background-color 0.2s",
                      }}
                      onClick={() => {
                        const newDate = new Date(day);
                        newDate.setHours(hour, 0, 0, 0);
                        openEventModal(undefined, newDate);
                      }}
                      onKeyDown={onActivateKey(() => {
                        const newDate = new Date(day);
                        newDate.setHours(hour, 0, 0, 0);
                        openEventModal(undefined, newDate);
                      })}
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
                      actualStart.getHours() * hourHeight +
                      (actualStart.getMinutes() / 60) * hourHeight;
                    const durationHours =
                      (actualEnd.getTime() - actualStart.getTime()) /
                      (1000 * 60 * 60);
                    // Min height shrinks with zoom so events can still pack
                    // densely at 30% instead of overlapping each other.
                    const minHeight = Math.min(24, hourHeight * 0.75);
                    const height = Math.max(durationHours * hourHeight, minHeight);

                    return (
                      <div
                        key={event._id}
                        role="button"
                        tabIndex={0}
                        aria-label={event.title}
                        className="cal-focusable"
                        onMouseDown={(e) => handleDragStart(e, event, idx)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (e.currentTarget.dataset.dragged === "true") {
                            e.currentTarget.dataset.dragged = "false";
                            return;
                          }
                          openEventDrawer(event._id);
                        }}
                        onKeyDown={onActivateKey(() => openEventDrawer(event._id))}
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
                          // NOTE: never transition `all` here — animating
                          // top/height fights the Alt+wheel zoom and makes
                          // events lag/dance behind the cursor.
                          transition:
                            "background-color 0.2s, box-shadow 0.2s, filter 0.2s",
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
                        top: `${now.getHours() * hourHeight + (now.getMinutes() / 60) * hourHeight}px`,
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
      {/* Zoom hint + controls — always visible */}
      <div
        style={{
          position: "absolute",
          right: "16px",
          bottom: "16px",
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 10px",
          borderRadius: "8px",
          fontSize: "12px",
          backgroundColor: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-md)",
          color: "var(--color-text-secondary)",
          pointerEvents: "auto",
        }}
      >
          <span>Alt + scroll to zoom • {zoomPercent}%</span>
          {hourHeight !== DEFAULT_HOUR_PX && (
            <button
              type="button"
              onClick={() => applyZoom(DEFAULT_HOUR_PX)}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                padding: "2px 8px",
                fontSize: "12px",
                cursor: "pointer",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text)",
              }}
            >
              Reset
            </button>
          )}
      </div>
    </div>
  );
};

export default WeekView;
