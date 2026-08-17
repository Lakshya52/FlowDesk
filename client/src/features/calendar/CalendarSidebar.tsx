import React, { useState, useEffect } from "react";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Edit3,
  // UserPlus,
  Share2,
  Pin,
  GripVertical,
} from "lucide-react";
import { useCalendarStore } from '@/store/calendarStore';

import { Check, X } from "lucide-react";
// import { useCalendarStore } from '@/store/calendarStore';
import { useAuthStore } from '@/store/authStore';
import { useQueryClient } from "@tanstack/react-query";
import api from '@/lib/api';

interface CalendarSidebarProps {
  calendars: any[];
}

const CalendarSidebar: React.FC<CalendarSidebarProps> = ({ calendars }) => {
  const {
    currentDate,
    setCurrentDate,
    visibleCalendarIds,
    toggleCalendarVisibility,
    openCalendarModal,
    openShareModal,
  } = useCalendarStore();

  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [miniCalDate, setMiniCalDate] = useState(currentDate);
  const [orderedCalendars, setOrderedCalendars] = useState(calendars);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [pinnedCalendarIds, setPinnedCalendarIds] = useState<Set<string>>(new Set());

  // Sync orderedCalendars with incoming calendars prop
  useEffect(() => {
    setOrderedCalendars(calendars);
  }, [calendars]);

  const pendingInvitations = calendars.filter((c) =>
    c.sharedWith?.some(
      (s: any) =>
        (s.user?._id || s.user) === user?._id && s.status === "pending",
    ),
  );

  // const myCalendars = calendars.filter(
  //   (c) => c.isSystem || c.owner?._id === user?._id || c.owner === user?._id,
  // );
  const myCalendars = orderedCalendars
    .filter(
      (c) =>
        c.isSystem ||
        c.owner?._id === user?._id ||
        c.owner === user?._id ||
        c.sharedWith?.some(
          (s: any) =>
            (s.user?._id || s.user) === user?._id && s.status === "accepted",
        ),
    )
    .sort((a, b) => {
      // Pinned calendars appear first
      const aPinned = pinnedCalendarIds.has(a._id);
      const bPinned = pinnedCalendarIds.has(b._id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });

  const handleAccept = async (calendarId: string) => {
    try {
      await api.put(`/calendars/${calendarId}/share/accept`);
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async (calendarId: string) => {
    try {
      await api.put(`/calendars/${calendarId}/share/reject`);
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDragStart = (calendarId: string) => {
    setDraggedItem(calendarId);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.style.opacity = "0.5";
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = "1";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetCalendar: any) => {
    e.preventDefault();
    e.currentTarget.style.opacity = "1";

    if (!draggedItem || draggedItem === targetCalendar._id) {
      setDraggedItem(null);
      return;
    }

    // Find indices in orderedCalendars
    const draggedIndex = orderedCalendars.findIndex((c) => c._id === draggedItem);
    const targetIndex = orderedCalendars.findIndex((c) => c._id === targetCalendar._id);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedItem(null);
      return;
    }

    // Swap the items in orderedCalendars
    const newOrder = [...orderedCalendars];
    [newOrder[draggedIndex], newOrder[targetIndex]] = [
      newOrder[targetIndex],
      newOrder[draggedIndex],
    ];

    setOrderedCalendars(newOrder);
    setDraggedItem(null);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = "1";
    setDraggedItem(null);
  };

  const togglePinCalendar = (calendarId: string) => {
    const newPinned = new Set(pinnedCalendarIds);
    if (newPinned.has(calendarId)) {
      newPinned.delete(calendarId);
    } else {
      newPinned.add(calendarId);
    }
    setPinnedCalendarIds(newPinned);
  };

  // const myCalendars = calendars.filter(
  //   (c) => c.isSystem || c.owner?._id || c.owner,
  // );

  // Mini Calendar generation
  const monthStart = startOfMonth(miniCalDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const dateFormat = "d";
  const rows = [];
  let days = [];
  let day = startDate;
  let formattedDate = "";

  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      formattedDate = format(day, dateFormat);
      const cloneDay = day;

      const isSelected = isSameDay(day, currentDate);
      const isCurrentMonth = isSameMonth(day, monthStart);
      const isToday = isSameDay(day, new Date());

      let dayStyle: React.CSSProperties = {
        width: "32px",
        height: "32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "12px",
        borderRadius: "50%",
        cursor: "pointer",
        color: !isCurrentMonth
          ? "var(--color-text-tertiary)"
          : "var(--color-text)",
      };

      if (isToday && !isSelected) {
        dayStyle = {
          ...dayStyle,
          color: "var(--color-primary)",
          fontWeight: "bold",
          backgroundColor: "var(--color-primary-light)",
        };
      }
      if (isSelected) {
        dayStyle = {
          ...dayStyle,
          backgroundColor: "var(--color-primary)",
          color: "#ffffff",
          fontWeight: 500,
        };
      }

      days.push(
        <div
          key={day.toString()}
          onClick={() => setCurrentDate(cloneDay)}
          style={dayStyle}
          onMouseOver={(e) => {
            if (!isSelected && isCurrentMonth) {
              e.currentTarget.style.backgroundColor =
                "var(--color-surface-hover)";
            }
          }}
          onMouseOut={(e) => {
            if (!isSelected && isCurrentMonth) {
              e.currentTarget.style.backgroundColor = isToday
                ? "var(--color-primary-light)"
                : "transparent";
            }
          }}
        >
          {formattedDate}
        </div>,
      );
      day = addDays(day, 1);
    }
    rows.push(
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
          marginBottom: "4px",
        }}
        key={day.toString()}
      >
        {days}
      </div>,
    );
    days = [];
  }

  const visibleCalendars = myCalendars.filter(c => visibleCalendarIds.has(c._id));

const miniCalBg = visibleCalendars.length === 0
  ? 'var(--color-surface)'
  : visibleCalendars.length === 1
  ? `${visibleCalendars[0].color}25`
  : `linear-gradient(135deg, ${visibleCalendars.map((c, i) => `${c.color}25 ${(i / (visibleCalendars.length - 1)) * 100}%`).join(', ')})`;

  const isDraggBool = myCalendars.length > 1;

  return (
    <div
      style={{
        width: "256px",
        flexShrink: 0,
        backgroundColor: "var(--color-bg)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Mini Calendar */}
      <div
  style={{
    padding: "16px",
    borderBottom: "1px solid var(--color-border)",
    background: miniCalBg,
    transition: "background 0.25s ease",
  }}
>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--color-text)",
              margin: 0,
            }}
          >
            {format(miniCalDate, "MMMM yyyy")}
          </h3>
          <div style={{ display: "flex" }}>
            <button
              onClick={() => setMiniCalDate(subMonths(miniCalDate, 1))}
              style={{
                padding: "4px",
                color: "var(--color-text-secondary)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                borderRadius: "4px",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--color-surface-hover)")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setMiniCalDate(addMonths(miniCalDate, 1))}
              style={{
                padding: "4px",
                color: "var(--color-text-secondary)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                borderRadius: "4px",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--color-surface-hover)")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
            marginBottom: "8px",
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--color-text-tertiary)",
          }}
        >
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d} style={{ width: "32px", textAlign: "center" }}>
              {d}
            </div>
          ))}
        </div>

        <div>{rows}</div>
      </div>

      {/* Calendar Lists */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <h3
              style={{
                fontSize: "12px",
                fontWeight: "bold",
                color: "var(--color-text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                margin: 0,
              }}
            >
              My Calendars
            </h3>
            <button
              onClick={() => openCalendarModal()}
              style={{
                color: "var(--color-text-tertiary)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: "4px",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.color = "var(--color-primary)")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.color = "var(--color-text-tertiary)")
              }
            >
              <PlusCircle size={14} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {myCalendars.map((cal) => (
              <div
              className="group"
                key={cal._id}
                draggable={isDraggBool}
                onDragStart={() => handleDragStart(cal._id)}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, cal)}
                onDragEnd={handleDragEnd}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "6px",
                  borderRadius: "4px",
                  cursor: draggedItem === cal._id ? "grabbing" : "grab",
                  backgroundColor: `${cal.color}25`,
                  transition: "all 0.2s ease",
                  opacity: draggedItem === cal._id ? 0.5 : 1,
                  border: draggedItem === cal._id ? `2px dashed ${cal.color}` : "none",

                  // borderLeft: `3px solid ${cal.color}`,
                }}
                
                onMouseOver={(e) => {
                  if (draggedItem !== cal._id) {
                    e.currentTarget.style.backgroundColor = `${cal.color}40`;
                  }
                  // e.currentTarget.style.backgroundColor =
                  //   "var(--color-surface-hover)";
                  const editBtns =
                    e.currentTarget.querySelectorAll(".edit-btn");
                  editBtns.forEach((btn: any) => (btn.style.opacity = "1"));
                }}
                onMouseOut={(e) => {
                  if (draggedItem !== cal._id) {
                    e.currentTarget.style.backgroundColor = `${cal.color}25`;
                  }
                  // e.currentTarget.style.backgroundColor = "transparent";
                  const editBtns =
                    e.currentTarget.querySelectorAll(".edit-btn");
                  editBtns.forEach((btn: any) => (btn.style.opacity = "0"));
                }}
              >
                <input
                  type="checkbox"
                  style={{
                    width: "16px",
                    height: "16px",
                    cursor: "pointer",
                    accentColor: cal.color,
                  }}
                  checked={visibleCalendarIds.has(cal._id)}
                  onChange={() => toggleCalendarVisibility(cal._id)}
                />
                <GripVertical size={14} opacity={50} className={`${myCalendars.length == 1 ? "hidden" : "hidden group-hover:block"}`} />
                <span
                  style={{
                    fontSize: "14px",
                    color: "var(--color-text)",
                    flex: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {cal.name}
                  {cal.owner?._id !== user?._id &&
                    cal.owner !== user?._id &&
                    !cal.isSystem && (
                      <span
                        style={{
                          marginLeft: "6px",
                          fontSize: "10px",
                          fontWeight: 600,
                          color: "var(--color-primary)",
                          backgroundColor: "var(--color-primary-light)",
                          padding: "1px 5px",
                          borderRadius: "4px",
                          verticalAlign: "middle",
                        }}
                      >
                        Shared
                      </span>
                    )}
                </span>
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    className="edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePinCalendar(cal._id);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: pinnedCalendarIds.has(cal._id)
                        ? "var(--color-primary)"
                        : "var(--color-text-tertiary)",
                      padding: "2px",
                      opacity: 0,
                      transition: "opacity 0.2s, color 0.2s",
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.color = "var(--color-primary)")
                    }
                    onMouseOut={(e) => {
                      e.currentTarget.style.color = pinnedCalendarIds.has(
                        cal._id
                      )
                        ? "var(--color-primary)"
                        : "var(--color-text-tertiary)";
                    }}
                    title={
                      pinnedCalendarIds.has(cal._id)
                        ? "Unpin Calendar"
                        : "Pin Calendar"
                    }
                  >
                    <Pin size={13} fill={pinnedCalendarIds.has(cal._id) ? "currentColor" : "none"} />
                  </button>
                  {/* <button
                    className="edit-btn"style={{
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "6px",
    borderRadius: "4px",
    cursor: "pointer",
                    onClick={(e) => {
                      e.stopPropagation();
                      openShareModal(cal._id);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--color-text-tertiary)",
                      padding: "2px",
                      opacity: 0,
                      transition: "opacity 0.2s",
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.color = "var(--color-primary)")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.color =
                        "var(--color-text-tertiary)")
                    }
                    title="Share Calendar"
                  >
                    <Share2 size={13} />
                  </button> */}
                  {(cal.owner?._id === user?._id ||
                    cal.owner === user?._id) && (
                    <button
                      className="edit-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        openShareModal(cal._id);
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--color-text-tertiary)",
                        padding: "2px",
                        opacity: 0,
                        transition: "opacity 0.2s",
                      }}
                      onMouseOver={(e) =>
                        (e.currentTarget.style.color = "var(--color-primary)")
                      }
                      onMouseOut={(e) =>
                        (e.currentTarget.style.color =
                          "var(--color-text-tertiary)")
                      }
                      title="Share Calendar"
                    >
                      <Share2 size={13} />
                    </button>
                  )}
                  <button
                    className="edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCalendarModal(cal._id);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--color-text-tertiary)",
                      padding: "2px",
                      opacity: 0,
                      transition: "opacity 0.2s",
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.color = "var(--color-primary)")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.color =
                        "var(--color-text-tertiary)")
                    }
                    title="Edit Calendar"
                  >
                    <Edit3 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {pendingInvitations.length > 0 && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <h3
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  color: "var(--color-text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  margin: 0,
                }}
              >
                Invitations
              </h3>
              <span
                style={{
                  fontSize: "11px",
                  backgroundColor: "var(--color-primary)",
                  color: "#fff",
                  borderRadius: "9999px",
                  padding: "1px 7px",
                  fontWeight: 600,
                }}
              >
                {pendingInvitations.length}
              </span>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              {pendingInvitations.map((cal) => (
                <div
                  key={cal._id}
                  style={{
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        backgroundColor: cal.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "var(--color-text)",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cal.name}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    Shared by {cal.owner?.name || "Someone"}
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={() => handleAccept(cal._id)}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                        padding: "4px",
                        fontSize: "12px",
                        fontWeight: 500,
                        borderRadius: "4px",
                        border: "none",
                        cursor: "pointer",
                        backgroundColor: "var(--color-primary)",
                        color: "#fff",
                      }}
                      onMouseOver={(e) =>
                        (e.currentTarget.style.opacity = "0.85")
                      }
                      onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
                    >
                      <Check size={12} /> Accept
                    </button>
                    <button
                      onClick={() => handleReject(cal._id)}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                        padding: "4px",
                        fontSize: "12px",
                        fontWeight: 500,
                        borderRadius: "4px",
                        border: "1px solid var(--color-border)",
                        cursor: "pointer",
                        backgroundColor: "transparent",
                        color: "var(--color-text-secondary)",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor =
                          "var(--color-danger-light)";
                        e.currentTarget.style.color = "var(--color-danger)";
                        e.currentTarget.style.borderColor =
                          "var(--color-danger)";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color =
                          "var(--color-text-secondary)";
                        e.currentTarget.style.borderColor =
                          "var(--color-border)";
                      }}
                    >
                      <X size={12} /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CalendarSidebar;
