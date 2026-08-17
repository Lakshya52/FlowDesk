import React, { useState, useEffect } from "react";
import { X, Palette, Trash2 } from "lucide-react";
import { useCalendarStore } from '@/store/calendarStore';
import api from '@/lib/api';
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import Modal from '@/shared/components/Modal';

const COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#0ea5e9", // light blue
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#a855f7", // purple
  "#ec4899", // pink
  "#64748b", // slate
];

const CalendarModal: React.FC = () => {
  const { isCalendarModalOpen, closeCalendarModal, selectedCalendarId } =
    useCalendarStore();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [calendarMeta, setCalendarMeta] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "#6366f1",
  });

  // Load existing calendar data when editing
  useEffect(() => {
    if (isCalendarModalOpen && selectedCalendarId) {
      const loadCalendar = async () => {
        try {
          const res = await api.get("/calendars");
          const cal = res.data.find((c: any) => c._id === selectedCalendarId);
          if (cal) {
            setCalendarMeta(cal);
            console.log(calendarMeta);
            setFormData({
              name: cal.name || "",
              description: cal.description || "",
              color: cal.color || "#6366f1",
            });
          }
        } catch {
          // ignore
        }
      };
      loadCalendar();
    } else if (isCalendarModalOpen && !selectedCalendarId) {
      setCalendarMeta(null);
      setFormData({
        name: "",
        description: "",
        color: "#6366f1",
      });
    }
  }, [isCalendarModalOpen, selectedCalendarId]);

  if (!isCalendarModalOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.name) {
      toast.error("Calendar name is required");
      return;
    }

    try {
      setLoading(true);
      if (selectedCalendarId) {
        await api.put(`/calendars/${selectedCalendarId}`, formData);
        toast.success("Calendar updated");
      } else {
        await api.post("/calendars", formData);
        toast.success("Calendar created");
      }
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      closeCalendarModal();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save calendar");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCalendarId) return;
    if (
      !window.confirm(
        "Are you sure you want to delete this calendar? All events in it will also be deleted.",
      )
    )
      return;

    try {
      setDeleting(true);
      await api.delete(`/calendars/${selectedCalendarId}`);
      toast.success("Calendar deleted");
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      closeCalendarModal();
    } catch (error: any) {
      const msg = error?.response?.data?.message || "Failed to delete calendar";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  // const isDefault = calendarMeta?.isDefault;

  return (
    <Modal isOpen={isCalendarModalOpen} onClose={closeCalendarModal}>
      <div
        style={{
          backgroundColor: "var(--color-surface)",
          borderRadius: "12px",
          boxShadow: "var(--shadow-xl)",
          width: "100%",
          maxWidth: "480px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--color-border)",
          maxHeight: "90vh",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid var(--color-border)",
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontSize: "20px",
              fontWeight: 600,
              color: "var(--color-text)",
              margin: 0,
            }}
          >
            {selectedCalendarId ? "Edit Calendar" : "New Calendar"}
          </h2>
          <button
            onClick={closeCalendarModal}
            style={{
              color: "var(--color-text-tertiary)",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "6px",
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = "var(--color-text-secondary)";
              e.currentTarget.style.backgroundColor =
                "var(--color-surface-hover)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = "var(--color-text-tertiary)";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          <form
            onSubmit={handleSubmit}
            style={{
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--color-text)",
                  marginBottom: "4px",
                }}
              >
                Calendar Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border)",
                  fontSize: "14px",
                  outline: "none",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-primary)";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 1px var(--color-primary)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                placeholder="e.g. Work, Personal, Training"
                required
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--color-text)",
                  marginBottom: "4px",
                }}
              >
                Description (Optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={2}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border)",
                  fontSize: "14px",
                  resize: "none",
                  outline: "none",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-primary)";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 1px var(--color-primary)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                placeholder="What is this calendar for?"
              />
            </div>

            <div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--color-text)",
                  marginBottom: "12px",
                }}
              >
                <Palette size={16} color="var(--color-text-tertiary)" />
                Calendar Color
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, color })}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      backgroundColor: color,
                      border:
                        formData.color === color
                          ? `2px solid ${color}`
                          : "2px solid var(--color-border)",
                      cursor: "pointer",
                      transition: "transform 0.2s",
                      transform:
                        formData.color === color ? "scale(1.1)" : "scale(1)",
                      boxShadow:
                        formData.color === color
                          ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${color}`
                          : "none",
                      outline: "none",
                    }}
                    onMouseOver={(e) => {
                      if (formData.color !== color)
                        e.currentTarget.style.transform = "scale(1.1)";
                    }}
                    onMouseOut={(e) => {
                      if (formData.color !== color)
                        e.currentTarget.style.transform = "scale(1)";
                    }}
                  />
                ))}
              </div>
            </div>
          </form>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: selectedCalendarId ? "space-between" : "flex-end",
            gap: "12px",
            padding: "16px 24px",
            borderTop: "1px solid var(--color-border)",
            backgroundColor: "var(--color-bg)",
            flexShrink: 0,
          }}
        >
          {selectedCalendarId && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--color-danger)",
                backgroundColor: "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: deleting ? "not-allowed" : "pointer",
                opacity: deleting ? 0.5 : 1,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor =
                  "var(--color-danger-light)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Trash2 size={16} />
              {deleting ? "Deleting..." : "Delete Calendar"}
            </button>
          )}
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              type="button"
              onClick={closeCalendarModal}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--color-text)",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                cursor: "pointer",
                boxShadow: "var(--shadow-sm)",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--color-surface-hover)")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--color-surface)")
              }
            >
              Cancel
            </button>
            <button
              onClick={() => handleSubmit()}
              disabled={loading}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#ffffff",
                backgroundColor: "var(--color-primary)",
                border: "1px solid transparent",
                borderRadius: "6px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
                boxShadow: "var(--shadow-sm)",
                display: "flex",
                alignItems: "center",
              }}
              onMouseOver={(e) => {
                if (!loading)
                  e.currentTarget.style.backgroundColor =
                    "var(--color-primary-hover)";
              }}
              onMouseOut={(e) => {
                if (!loading)
                  e.currentTarget.style.backgroundColor =
                    "var(--color-primary)";
              }}
            >
              {loading ? "Saving..." : "Save Calendar"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CalendarModal;
