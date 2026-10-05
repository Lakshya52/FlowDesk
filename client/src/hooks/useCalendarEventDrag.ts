import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import toast from "react-hot-toast";

interface CalendarDragOptions {
  /** Pixels per hour in the grid (DayView 80, WeekView 64). */
  hourPx: number;
  /** Allow dragging across day columns (WeekView). DayView: false. */
  allowDayChange?: boolean;
  /** Number of day columns for clamping horizontal drag (WeekView: 7). */
  dayCount?: number;
  /** Ghost horizontal insets, matching each view's event padding. */
  ghostLeft?: string;
  ghostRight?: string;
  /** Snap granularity in minutes. */
  snapMinutes?: number;
}

interface DragState {
  eventId: string;
  startY: number;
  startX: number;
  originalStart: Date;
  originalEnd: Date;
  el: HTMLElement;
}

/**
 * Shared drag-to-reschedule logic for the Day and Week calendar views.
 * Single source of truth for lift styles, snap math, the ghost marker,
 * click-vs-drag detection, and the move API call — views only pass their
 * grid geometry (hour height, day columns, ghost insets).
 */
export const useCalendarEventDrag = ({
  hourPx: HOUR_PX,
  allowDayChange = false,
  dayCount = 1,
  ghostLeft = "4px",
  ghostRight = "4px",
  snapMinutes: SNAP_MINUTES = 15,
}: CalendarDragOptions) => {
  const queryClient = useQueryClient();
  const dragRef = useRef<DragState | null>(null);

  const beginDrag = (e: React.MouseEvent, event: any, dayIndex = 0) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const color = event.calendar?.color || "#6366f1";

    const columnEl = el.parentElement as HTMLElement | null;
    const gridEl = columnEl?.parentElement as HTMLElement | null;
    const columnWidth = columnEl?.offsetWidth || 100;

    // Ordered day columns (excluding the time gutter) for horizontal drag
    const dayColumns: HTMLElement[] =
      allowDayChange && gridEl
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
    // Scale bands: dragged event floats above the page (100), snap ghost
    // is an elevated drag marker (20). Never off-scale one-offs.
    el.style.zIndex = "100";
    el.style.boxShadow = "var(--shadow-xl)";
    el.style.transition =
      "transform 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94)";

    // Ghost element marking the snap target (tinted fill, no border)
    const ghost = document.createElement("div");
    ghost.style.cssText = `
    position: absolute;
    left: ${ghostLeft}; right: ${ghostRight};
    height: ${el.offsetHeight}px;
    border-radius: 4px;
    background: ${color}15;
    pointer-events: none;
    z-index: 20;
    top: ${el.offsetTop}px;
    transition: top 0.08s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  `;
    columnEl?.appendChild(ghost);

    let ghostColumnEl = columnEl;

    const formatLabel = (d: Date) => {
      const h = d.getHours();
      const m = d.getMinutes().toString().padStart(2, "0");
      return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;

      const deltaY = ev.clientY - dragRef.current.startY;
      const deltaX = ev.clientX - dragRef.current.startX;

      const rawMinutes = (deltaY / HOUR_PX) * 60;
      const snappedMinutes =
        Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
      const snappedDeltaY = (snappedMinutes / 60) * HOUR_PX;
      const snapDiff = Math.abs(deltaY - snappedDeltaY);

      let clampedDayOffset = 0;
      if (allowDayChange) {
        const dayOffset = Math.round(deltaX / columnWidth);
        clampedDayOffset = Math.max(
          -dayIndex,
          Math.min(dayCount - 1 - dayIndex, dayOffset),
        );
      }

      // Event follows the pointer, snapping magnetically when close
      const shownY = snapDiff < 4 ? snappedDeltaY : deltaY;
      el.style.transform = allowDayChange
        ? `translate(${clampedDayOffset * columnWidth}px, ${shownY}px)`
        : `translateY(${shownY}px)`;

      if (allowDayChange) {
        const targetColIndex = dayIndex + clampedDayOffset;
        const newColumnEl = dayColumns[targetColIndex];
        if (newColumnEl && newColumnEl !== ghostColumnEl) {
          ghostColumnEl?.removeChild(ghost);
          newColumnEl.appendChild(ghost);
          ghostColumnEl = newColumnEl;
        }
      }

      const newTop = el.offsetTop + snappedDeltaY;
      ghost.style.top = `${newTop}px`;

      const label = formatLabel(
        new Date(
          dragRef.current.originalStart.getTime() + snappedMinutes * 60000,
        ),
      );
      ghost.title = label;
      ghost.setAttribute("data-time", label);
      ghost.style.setProperty("--ghost-label", `"${label}"`);
    };

    const onMouseUp = async (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (!dragRef.current) return;

      ghost.remove();

      const deltaY = ev.clientY - dragRef.current.startY;
      const deltaX = ev.clientX - dragRef.current.startX;
      const rawMinutes = (deltaY / HOUR_PX) * 60;
      const deltaMinutes =
        Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
      let clampedDayOffset = 0;
      if (allowDayChange) {
        const dayOffset = Math.round(deltaX / columnWidth);
        clampedDayOffset = Math.max(
          -dayIndex,
          Math.min(dayCount - 1 - dayIndex, dayOffset),
        );
      }

      el.style.opacity = "1";
      el.style.zIndex = "";
      el.style.transform = "";
      el.style.boxShadow = "";
      el.style.transition = "";

      const didDrag =
        Math.abs(deltaY) > 5 || (allowDayChange && Math.abs(deltaX) > 5);
      dragRef.current.el.dataset.dragged = didDrag ? "true" : "false";

      if (deltaMinutes === 0 && clampedDayOffset === 0) {
        dragRef.current = null;
        return;
      }

      const dayMs = clampedDayOffset * 24 * 60 * 60 * 1000;
      const newStart = new Date(
        dragRef.current.originalStart.getTime() +
          deltaMinutes * 60000 +
          dayMs,
      );
      const newEnd = new Date(
        dragRef.current.originalEnd.getTime() + deltaMinutes * 60000 + dayMs,
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

  return { beginDrag };
};
