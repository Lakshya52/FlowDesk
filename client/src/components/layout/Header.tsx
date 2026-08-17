import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useThemeStore } from "../../store/themeStore";
import {
  Bell,
  Sun,
  Moon,
  LogOut,
  Search,
  ChevronDown,
  Menu,
} from "lucide-react";
import api from "../../lib/api";
import { useQueryClient } from "@tanstack/react-query";
import Avatar from "../common/Avatar";
import { getSocket } from "../../hooks/useSocket";
import { useChatStore } from "../../store/chatStore";
// import { useCalendarStore } from "../../store/calendarStore";

interface HeaderProps {
  toggleSidebar?: () => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
  const { user, logout } = useAuthStore();
  const { isDark, toggle } = useThemeStore();
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotif, setShowNotif] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const queryClient = useQueryClient();
  const socketRef = useRef<any>(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const { data } = await api.get("/notifications");
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      } catch {}
    };
    fetchNotifications();

    if (user?._id) {
      useChatStore.getState().fetchConversations();
    }

    // Native notifications handled by Electron via IPC (no browser permission needed)

    // Socket connection for notifications
    const socket = getSocket();
    socketRef.current = socket;

    const joinUserRoom = () => {
      if (user?._id) {
        console.log(`📡 Joining notification room: user_${user._id}`);
        socket.emit("join_user", user._id);
      }
    };

    if (socket.connected) {
      joinUserRoom();
    }

    socket.on("connect", () => {
      console.log("📡 Notification socket connected");
      joinUserRoom();
    });

    socket.on("new_notification", (notification: any) => {
      console.log("🔔 New notification received via socket:", notification);
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);

      // Trigger native notification ONLY in Electron by delegating to main process
      if (window.electronAPI) {
        console.log(
          "🔔 Delegating notification to main process for Desktop feel...",
        );
        window.electronAPI.showNotification({
          title: notification.title,
          message: notification.message,
          link: notification.link,
        });
      }
      // In browser: no notifications shown (Electron-only feature)
    });

    socket.on("new_chat_message", (message: any) => {
      console.log("💬 New chat message received globally:", message);
      const state = useChatStore.getState();
      if (user?._id) {
        state.handleNewMessage(message, user._id);
      }

      const isDifferentChat =
        message.conversation !== state.activeConversationId;
      const isFromOthers = message.sender._id !== user?._id;
      if (isFromOthers && isDifferentChat) {
        // Play notification chime!
        try {
          const audio = new Audio(
            "https://assets.mixkit.co/active_storage/sfx/2869/2869-120.wav",
          );
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch {}
      }
    });

    socket.on(
      "user_status_change",
      ({
        userId,
        status,
      }: {
        userId: string;
        status: "online" | "offline";
      }) => {
        console.log(`📡 User ${userId} status changed to ${status}`);
        useChatStore
          .getState()
          .handleUserStatusChange(userId, status, user?._id);
      },
    );

    socket.on(
      "message_reaction_updated",
      ({ messageId, conversationId, reactions }: any) => {
        useChatStore
          .getState()
          .handleReactionUpdate(messageId, conversationId, reactions);
      },
    );

    socket.on("conversation_deleted", (deletedConversationId: string) => {
      useChatStore.getState().handleConversationDeleted(deletedConversationId);
    });

    socket.on("message_deleted", (payload: any) => {
      useChatStore.getState().handleMessageDeleted(payload);
    });

    socket.on("new_conversation", (conv: any) => {
      console.log("💬 New conversation received globally:", conv);
      useChatStore.getState().addConversation(conv);
    });

    // Listen for navigation requests from the main process (e.g. from notification click)
    if (window.electronAPI) {
      window.electronAPI.onNavigate((link) => {
        console.log("🔗 Navigation requested from main process:", link);
        navigate(link);
      });
    }

    // --- Active presence / idle tracking ---
    let idleTimeout: any;
    let isUserOnline = true;

    const updateStatus = (status: "online" | "offline") => {
      if (!user?._id) return;
      if (status === "online" && !isUserOnline) {
        isUserOnline = true;
        socket.emit("user_active_status", {
          userId: user._id,
          status: "online",
        });
      } else if (status === "offline" && isUserOnline) {
        isUserOnline = false;
        socket.emit("user_active_status", {
          userId: user._id,
          status: "offline",
        });
      }
    };

    const resetIdleTimer = () => {
      updateStatus("online");
      clearTimeout(idleTimeout);
      // Mark user offline after 3 minutes of inactivity
      idleTimeout = setTimeout(() => {
        updateStatus("offline");
      }, 180000);
    };

    const activityEvents = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];
    const handleActivity = () => {
      resetIdleTimer();
    };

    const handleFocus = () => {
      updateStatus("online");
      resetIdleTimer();
    };

    const handleBlur = () => {
      updateStatus("offline");
    };

    if (user?._id) {
      activityEvents.forEach((evt) =>
        window.addEventListener(evt, handleActivity),
      );
      window.addEventListener("focus", handleFocus);
      window.addEventListener("blur", handleBlur);
      resetIdleTimer();
    }

    return () => {
      if (user?._id) {
        activityEvents.forEach((evt) =>
          window.removeEventListener(evt, handleActivity),
        );
        window.removeEventListener("focus", handleFocus);
        window.removeEventListener("blur", handleBlur);
      }
      clearTimeout(idleTimeout);
    };
  }, [user?._id]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setShowProfile(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node))
        setShowNotif(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowSearch(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setShowSearch(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data } = await api.get(
          `/dashboard/search?query=${searchQuery}`,
        );
        setSearchResults(data);
        setShowSearch(true);
      } catch {
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const markAsRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await api.put("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  };

  // const acceptShare = async (
  //   calendarId: string,
  //   notifId: string,
  //   e: React.MouseEvent,
  // ) => {
  //   e.stopPropagation();
  //   try {
  //     await api.put(`/calendars/${calendarId}/share/accept`);
  //     await markAsRead(notifId);
  //     useCalendarStore.getState().fetchCalendars();
  //   } catch (err) {
  //     console.error(err);
  //   }
  // };

  // const rejectShare = async (
  //   calendarId: string,
  //   notifId: string,
  //   e: React.MouseEvent,
  // ) => {
  //   e.stopPropagation();
  //   try {
  //     await api.put(`/calendars/${calendarId}/share/reject`);
  //     await markAsRead(notifId);
  //   } catch (err) {
  //     console.error(err);
  //   }
  // };
  // After
const acceptShare = async (calendarId: string, notifId: string, e: React.MouseEvent) => {
  e.stopPropagation();
  try {
    await api.put(`/calendars/${calendarId}/share/accept`);
    await markAsRead(notifId);
    queryClient.invalidateQueries({ queryKey: ['calendars'] });
  } catch (err) {
    console.error(err);
  }
};

const rejectShare = async (calendarId: string, notifId: string, e: React.MouseEvent) => {
  e.stopPropagation();
  try {
    await api.put(`/calendars/${calendarId}/share/reject`);
    await markAsRead(notifId);
    queryClient.invalidateQueries({ queryKey: ['calendars'] });
  } catch (err) {
    console.error(err);
  }
};

  const roleLabel =
    user?.role === "admin"
      ? "Admin"
      : user?.role === "manager"
        ? "Manager"
        : "Team Member";

  return (
    <header
      style={{
        // height: 56,
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: window.innerWidth < 768 ? "12px 16px" : "14.5px 24px",
        height: "fit-content",
        flexShrink: 0,
        gap: 12,
      }}
    >
      {/* Mobile Hamburger menu toggle */}
      <div className="md:hidden flex items-center">
        <button
          className="btn btn-ghost btn-sm flex items-center justify-center"
          onClick={toggleSidebar}
          style={{ padding: 4 }}
        >
          <Menu size={20} />
        </button>
      </div>
      {/* Search */}
      <div
        ref={searchRef}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flex: 1,
          maxWidth: 400,
          position: "relative",
          padding: "5px 10px",
          borderRadius: "10px",
        }}
        className="py-1.25 px-2.5 bg-[#fafafa]/10 text-white"
      >
        <Search size={16} color="var(--color-text-tertiary)" />
        <input
          type="text"
          placeholder="Search Projects, tasks etc..."
          className="input"
          style={{
            border: "none",
            boxShadow: "none",
            padding: "6px 0",
            background: "transparent",
          }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => searchQuery && setShowSearch(true)}
        />
        {isSearching && (
          <div className="spinner-xs" style={{ marginLeft: 8 }} />
        )}

        {showSearch && searchResults && (
          <div
            className="card animate-fade-in"
            style={{
              position: "absolute",
              top: "100%",
              left: -32,
              right: 0,
              marginTop: 8,
              maxHeight: 480,
              overflow: "auto",
              zIndex: 100,
              padding: "12px 0",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {/* Tasks */}
            {searchResults.tasks?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    padding: "4px 16px",
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: "var(--color-text-tertiary)",
                    textTransform: "uppercase",
                  }}
                >
                  Tasks
                </div>
                {searchResults.tasks.map((t: any) => (
                  <div
                    key={t._id}
                    style={{
                      padding: "8px 16px",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                    onClick={() => {
                      navigate(
                        `/assignments/${t.assignment._id}?tab=tasks&taskId=${t._id}`,
                      );
                      setShowSearch(false);
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "var(--color-surface-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <div style={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                      {t.title}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      {t.assignment.title}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Assignments */}
            {searchResults.assignments?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    padding: "4px 16px",
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: "var(--color-text-tertiary)",
                    textTransform: "uppercase",
                  }}
                >
                  Project Assignments
                </div>
                {searchResults.assignments.map((a: any) => (
                  <div
                    key={a._id}
                    style={{
                      padding: "8px 16px",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                    onClick={() => {
                      navigate(`/assignments/${a._id}`);
                      setShowSearch(false);
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "var(--color-surface-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <div style={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                      {a.title}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      {a.clientName}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Users */}
            {searchResults.users?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    padding: "4px 16px",
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: "var(--color-text-tertiary)",
                    textTransform: "uppercase",
                  }}
                >
                  Employees
                </div>
                {searchResults.users.map((u: any) => (
                  <div
                    key={u._id}
                    style={{
                      padding: "8px 16px",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                    onClick={() => {
                      setShowSearch(false);
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "var(--color-surface-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <Avatar src={u.avatar} name={u.name} size={28} />
                    <div>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                        {u.name}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-text-tertiary)",
                        }}
                      >
                        {u.employeeId} ·{" "}
                        {u.role === "member" ? "Team Member" : u.role}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Teams */}
            {searchResults.teams?.length > 0 && (
              <div>
                <div
                  style={{
                    padding: "4px 16px",
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: "var(--color-text-tertiary)",
                    textTransform: "uppercase",
                  }}
                >
                  Teams
                </div>
                {searchResults.teams.map((team: any) => (
                  <div
                    key={team._id}
                    style={{
                      padding: "8px 16px",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                    onClick={() => {
                      navigate("/teams");
                      setShowSearch(false);
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "var(--color-surface-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <div style={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                      {team.name}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      {team.members?.length || 0} members
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* No results */}
            {!searchResults.tasks?.length &&
              !searchResults.assignments?.length &&
              !searchResults.users?.length &&
              !searchResults.teams?.length && (
                <div
                  style={{
                    padding: "24px 16px",
                    textAlign: "center",
                    color: "var(--color-text-tertiary)",
                    fontSize: "0.875rem",
                  }}
                >
                  No results found for "{searchQuery}"
                </div>
              )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        style={{ display: "flex", alignItems: "center" }}
        className="gap-0 sm:gap-2"
      >
        {/* Theme toggle */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={toggle}
          title="Toggle theme"
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Notifications */}
        <div ref={notifRef} style={{ position: "relative" }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowNotif(!showNotif)}
            style={{ position: "relative" }}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--color-danger)",
                  border: "2px solid var(--color-surface)",
                }}
              />
            )}
          </button>

          {showNotif && (
            <div
              className="card animate-fade-in"
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: 8,
                width: 360,
                maxHeight: 420,
                overflow: "auto",
                zIndex: 50,
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--color-border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: "0.75rem" }}
                    onClick={markAllRead}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div
                  style={{
                    padding: 32,
                    textAlign: "center",
                    color: "var(--color-text-tertiary)",
                    fontSize: "0.875rem",
                  }}
                >
                  No notifications yet
                </div>
              ) : (
                notifications.slice(0, 10).map((n) => (
                  <div
                    key={n._id}
                    onClick={() => {
                      if (!n.isRead) markAsRead(n._id);
                      if (n.link) {
                        navigate(n.link);
                        setShowNotif(false);
                      }
                    }}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--color-border)",
                      cursor: "pointer",
                      background: n.isRead
                        ? "transparent"
                        : "var(--color-primary-light)",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "var(--color-surface-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = n.isRead
                        ? "transparent"
                        : "var(--color-primary-light)";
                    }}
                  >
                    <div style={{ fontWeight: 500, fontSize: "0.8125rem" }}>
                      {n.title}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--color-text-secondary)",
                        marginTop: 2,
                      }}
                    >
                      {n.message}
                    </div>
                    {n.type === "calendar_shared" &&
                      n.metadata?.calendarId &&
                      !n.isRead && (
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            marginTop: "8px",
                          }}
                        >
                          <button
                            style={{
                              padding: "4px 12px",
                              fontSize: "12px",
                              borderRadius: "4px",
                              backgroundColor: "var(--color-primary)",
                              color: "white",
                              border: "none",
                              cursor: "pointer",
                              fontWeight: 500,
                            }}
                            onClick={(e) =>
                              acceptShare(n.metadata.calendarId, n._id, e)
                            }
                          >
                            Accept
                          </button>
                          <button
                            style={{
                              padding: "4px 12px",
                              fontSize: "12px",
                              borderRadius: "4px",
                              backgroundColor: "var(--color-surface-hover)",
                              color: "var(--color-text)",
                              border: "none",
                              cursor: "pointer",
                              fontWeight: 500,
                            }}
                            onClick={(e) =>
                              rejectShare(n.metadata.calendarId, n._id, e)
                            }
                          >
                            Reject
                          </button>
                        </div>
                      )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Profile */}
        <div ref={profileRef} style={{ position: "relative", marginLeft: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowProfile(!showProfile)}
            style={{ gap: 8 }}
          >
            <Avatar src={user?.avatar} name={user?.name} size={28} />
            <div className="hidden md:block" style={{ textAlign: "left" }}>
              <div
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  lineHeight: 1.2,
                }}
              >
                {user?.name}
              </div>
              <div
                style={{
                  fontSize: "0.6875rem",
                  color: "var(--color-text-tertiary)",
                  lineHeight: 1.2,
                }}
              >
                {roleLabel}
              </div>
            </div>
            <ChevronDown
              size={16}
              color="var(--color-text-tertiary)"
              className="hidden md:block"
            />
          </button>

          {showProfile && (
            <div
              className="card animate-fade-in"
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: 8,
                width: 200,
                padding: "4px",
                zIndex: 50,
              }}
            >
              <button
                className="btn btn-ghost"
                style={{
                  width: "100%",
                  justifyContent: "flex-start",
                  borderRadius: 6,
                  color: "var(--color-danger)",
                }}
                onClick={logout}
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
