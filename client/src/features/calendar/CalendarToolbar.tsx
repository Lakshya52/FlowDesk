import React, { useState, useRef, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Menu,
  CalendarIcon,
  X,
  Import,
  // ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { useCalendarStore, CalendarView } from '@/store/calendarStore';

const CalendarToolbar: React.FC = () => {
  const {
    currentDate,
    currentView,
    setCurrentView,
    navigateNext,
    navigatePrev,
    navigateToday,
    searchQuery,
    setSearchQuery,
    openEventModal,
    openCalendarModal,
    openImportModal,
    toggleCalendarSidebar,
  } = useCalendarStore();

  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        createMenuRef.current &&
        !createMenuRef.current.contains(e.target as Node)
      ) {
        setShowCreateMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const views: { value: CalendarView; label: string }[] = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "year", label: "Year" },
    { value: "agenda", label: "Agenda" },
  ];

  const getFormatString = () => {
    switch (currentView) {
      case "year":
        return "yyyy";
      case "month":
        return "MMMM yyyy";
      case "week":
        return "MMM yyyy";
      case "day":
        return "MMMM d, yyyy";
      case "agenda":
        return "MMMM yyyy";
      default:
        return "MMMM yyyy";
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px",
        backgroundColor: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        gap: "16px",
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <button
          className="mobile-hamburger"
          onClick={toggleCalendarSidebar}
          style={{
            padding: "8px",
            backgroundColor: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: "6px",
            cursor: "pointer",
            color: "var(--color-text)",
          }}
        >
          <Menu size={20} />
        </button>

        <div ref={createMenuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowCreateMenu((prev) => !prev)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              backgroundColor: "var(--color-primary)",
              color: "white",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
              boxShadow: "var(--shadow-sm)",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor =
                "var(--color-primary-hover)")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--color-primary)")
            }
          >
            <Plus size={18} />
            <span>Create</span>
            {/* <ChevronDown size={14} /> */}
          </button>

          {showCreateMenu && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                boxShadow: "var(--shadow-lg)",
                zIndex: 50,
                overflow: "hidden",
                minWidth: "160px",
              }}
            >
              <button
                onClick={() => {
                  openEventModal();
                  setShowCreateMenu(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 16px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--color-text)",
                  backgroundColor: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--color-surface-hover)")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <Plus size={16} color="var(--color-primary)" />
                New Event
              </button>
              <button
                onClick={() => {
                  openCalendarModal();
                  setShowCreateMenu(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 16px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--color-text)",
                  backgroundColor: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--color-surface-hover)")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <CalendarIcon size={16} color="var(--color-primary)" />
                New Calendar
              </button>
              <button
                onClick={() => {
                  openImportModal();
                  setShowCreateMenu(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 16px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--color-text)",
                  backgroundColor: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--color-surface-hover)")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <Import  size={16} color="var(--color-primary)" />
                {/* <CalendarIcon /> */}
                Import
              </button>
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "var(--color-surface-hover)",
            borderRadius: "6px",
            padding: "4px",
          }}
        >
          <button
            onClick={navigateToday}
            style={{
              padding: "4px 12px",
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--color-text)",
              backgroundColor: "transparent",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--color-surface)")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            Today
          </button>
          <div
            style={{
              width: "1px",
              height: "16px",
              backgroundColor: "var(--color-border)",
              margin: "0 4px",
            }}
          ></div>
          <button
            onClick={navigatePrev}
            style={{
              padding: "4px",
              color: "var(--color-text-secondary)",
              backgroundColor: "transparent",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--color-surface)")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={navigateNext}
            style={{
              padding: "4px",
              color: "var(--color-text-secondary)",
              backgroundColor: "transparent",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--color-surface)")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <h2
          style={{
            fontSize: "20px",
            fontWeight: "bold",
            color: "var(--color-text)",
            minWidth: "150px",
            margin: 0,
          }}
        >
          {format(currentDate, getFormatString())}
        </h2>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        {currentView === "agenda" && (
          
        <div style={{ position: "relative", width: "256px" }}>
          <Search
            size={18}
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-tertiary)",
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 16px 8px 36px",
              backgroundColor: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              fontSize: "14px",
              outline: "none",
              color: "var(--color-text)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-primary)";
              e.currentTarget.style.backgroundColor = "var(--color-surface)";
              e.currentTarget.style.boxShadow =
                "0 0 0 2px rgba(99, 102, 241, 0.2)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border)";
              e.currentTarget.style.backgroundColor = "var(--color-bg)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-tertiary)',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
                borderRadius: '50%',
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
              onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            >
              <X />
            </button>
          )}
        </div>
        )}

        <div
          style={{
            display: "flex",
            backgroundColor: "var(--color-surface-hover)",
            borderRadius: "6px",
            padding: "4px",
            overflowX: "auto",
          }}
        >
          {views.map((view) => (
            <button
              key={view.value}
              onClick={() => setCurrentView(view.value)}
              style={{
                padding: "6px 12px",
                fontSize: "14px",
                fontWeight: 500,
                borderRadius: "4px",
                textTransform: "capitalize",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.2s",
                backgroundColor:
                  currentView === view.value
                    ? "var(--color-surface)"
                    : "transparent",
                color:
                  currentView === view.value
                    ? "var(--color-primary)"
                    : "var(--color-text-secondary)",
                boxShadow:
                  currentView === view.value ? "var(--shadow-sm)" : "none",
              }}
              onMouseOver={(e) => {
                if (currentView !== view.value)
                  e.currentTarget.style.backgroundColor = "var(--color-border)";
              }}
              onMouseOut={(e) => {
                if (currentView !== view.value)
                  e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CalendarToolbar;
