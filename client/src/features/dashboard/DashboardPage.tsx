import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import api from '@/lib/api';
import Avatar from '@/shared/components/Avatar';
import { useAuthStore } from '@/store/authStore';
import {
  FolderKanban,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Line,
  LineChart,
} from "recharts";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  todo: "#94a3b8",
  in_progress: "#3b82f6",
  review: "#f59e0b",
  completed: "#22c55e",
};

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  completed: "Completed",
};

const slideStyles = `
  @keyframes slideInFromBottom {
    from { transform: translateY(40px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  @keyframes slideInFromTop {
    from { transform: translateY(-40px); opacity: 0; }
    to   { transform: translateY(0);     opacity: 1; }
  }
  .slide-next { animation: slideInFromBottom 0.28s cubic-bezier(0.22, 1, 0.36, 1) both; }
  .slide-prev { animation: slideInFromTop    0.28s cubic-bezier(0.22, 1, 0.36, 1) both; }
`;

const activityQueryFn = async (page: number) => {
  const { data } = await api.get(`/dashboard/stats?page=${page}`);
  return {
    recentActivity: data.recentActivity ?? [],
    currentPage: data.currentPage ?? page,
    totalPages: data.totalPages ?? 1,
  };
};

const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<"next" | "prev">("next");

  // Inject slide animation styles once
  useEffect(() => {
    if (!document.getElementById("activity-slide-styles")) {
      const tag = document.createElement("style");
      tag.id = "activity-slide-styles";
      tag.textContent = slideStyles;
      document.head.appendChild(tag);
    }
  }, []);

  // Static stats — no page dependency, never re-fetches on pagination
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data } = await api.get(`/dashboard/stats?page=1`);
      const { recentActivity, currentPage, totalPages, ...rest } = data;
      return rest;
    },
  });

  // Paginated activity — only this changes on Prev/Next
  const { data: activityData, isFetching: activityFetching } = useQuery({
    queryKey: ["dashboard-activity", page],
    queryFn: () => activityQueryFn(page),
    placeholderData: keepPreviousData,
  });

  // Prefetch next page as soon as current page data arrives
  useEffect(() => {
    if (activityData && page < activityData.totalPages) {
      queryClient.prefetchQuery({
        queryKey: ["dashboard-activity", page + 1],
        queryFn: () => activityQueryFn(page + 1),
      });
    }
  }, [page, activityData, queryClient]);

  const { data: teamsData } = useQuery({
    queryKey: ["my-teams"],
    queryFn: async () => {
      const { data } = await api.get("/teams?all=true");
      return data.teams || [];
    },
  });

  const data = statsData;
  const myTeams = teamsData || [];
  const loading = statsLoading && !statsData;

  const recentActivity: any[] = activityData?.recentActivity ?? [];
  const currentPage: number = activityData?.currentPage ?? page;
  const totalPages: number = activityData?.totalPages ?? 1;

  const goNext = () => {
    setDirection("next");
    setPage((p) => p + 1);
  };

  const goPrev = () => {
    setDirection("prev");
    setPage((p) => Math.max(1, p - 1));
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 120, borderRadius: 12 }}
            />
          ))}
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}
        >
          <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
          <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const statCards = [
    {
      label: "Active Projects",
      value: data.stats?.activeAssignments,
      total: data.stats?.totalAssignments,
      icon: FolderKanban,
      color: "#6366f1",
      bg: "var(--color-primary-light)",
      action: () => navigate("/assignments"),
    },
    {
      label: "Due Today",
      value: data.stats?.tasksDueToday,
      icon: Clock,
      color: "#3b82f6",
      bg: "var(--color-info-light)",
      action: () => navigate("/tasks"),
    },
    {
      label: "Overdue Tasks",
      value: data.stats?.overdueTasks,
      icon: AlertTriangle,
      color: "#ef4444",
      bg: "var(--color-danger-light)",
      action: () => navigate("/tasks"),
    },
	{
		label: "Completed This Week",
		value: data.stats?.completedThisWeek,
		icon: CheckCircle2,
		color: "#22c55e",
		bg: "var(--color-success-light)",
		action: () => navigate("/tasks"),
	},
  ];

  const pieData = data.tasksByStatus.map((s: any) => ({
    name: STATUS_LABELS[s._id] || s._id,
    value: s.count,
    color: STATUS_COLORS[s._id] || "#94a3b8",
  }));

  const workloadData = data.teamWorkload.map((w: any) => ({
    name: w.name.split(" ")[0],
    tasks: w.taskCount,
    projects: w.projectCount,
  }));

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Greeting */}
      <div
        style={{
          marginBottom: 20,
        //   display: "flex",
        //   justifyContent: "space-between",
        //   alignItems: "flex-end",
        }}
        className="flex flex-col sm:flex-row items-start sm:items-end sm:justify-between gap-4"
      >
        <div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Good{" "}
            {new Date().getHours() < 12
              ? "morning"
              : new Date().getHours() < 17
                ? "afternoon"
                : "evening"}
            , {user?.name?.split(" ")[0]}
          </h1>
          <p
            style={{
              color: "var(--color-text-secondary)",
              fontSize: "0.875rem",
              marginTop: 4,
            }}
          >
            {user?.role === "admin"
              ? "Here's your organization's overview."
              : user?.role === "manager"
                ? "Here's an overview of your teams."
                : "Here's what's happening with your tasks today."}
          </p>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate("/tasks")}
          >
            <CheckCircle2 size={16} /> Tasks
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate("/assignments")}
          >
            <FolderKanban size={16} /> Projects
          </button>
          {(user?.role === "admin" || user?.role === "manager") && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigate("/reports")}
            >
              <TrendingUp size={16} /> Reports
            </button>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 20,
          marginBottom: 32,
        }}
      >
        {statCards.map((card) => (
          <div
            key={card.label}
            className="card animate-fade-in"
            style={{
              padding: "24px",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
              cursor: "pointer",
              position: "relative",
              overflow: "hidden",
            }}
            onClick={card.action}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.boxShadow = "0 12px 24px rgba(0,0,0,0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--color-text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 12,
                  }}
                >
                  {card.label}
                </div>
                <div
                  style={{
                    fontSize: "2.25rem",
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {card.value}
                  {card.total !== undefined && (
                    <span
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        color: "var(--color-text-tertiary)",
                        marginLeft: 6,
                      }}
                    >
                      / {card.total}
                    </span>
                  )}
                </div>
              </div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: card.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 4px 12px ${card.color}20`,
                }}
              >
                <card.icon size={22} color={card.color} strokeWidth={2.5} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6 mb-6">
        {/* Left Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Charts Row */}
          {(user?.role === "admin" || user?.role === "manager") && (
            <div
              className={`grid grid-cols-1 ${workloadData.length > 0 && data.weeklyCompletionData?.length > 0 ? "md:grid-cols-2" : ""} gap-6`}
            >
              {workloadData.length > 0 && (
                <div className="card" style={{ padding: "20px" }}>
                  <h3
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      marginBottom: 16,
                    }}
                  >
                    {user.role === "admin"
                      ? "Organization Workload"
                      : "Team Workload"}
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={workloadData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-border)"
                      />
                      <XAxis
                        dataKey="name"
                        tick={{
                          fontSize: 12,
                          fill: "var(--color-text-secondary)",
                        }}
                      />
                      <YAxis
                        tick={{
                          fontSize: 12,
                          fill: "var(--color-text-secondary)",
                        }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                          fontSize: "0.8125rem",
                        }}
                      />
                      <Bar
                        dataKey="tasks"
                        name="Tasks"
                        fill="var(--color-primary)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="projects"
                        name="Projects"
                        fill="var(--color-info)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      justifyContent: "center",
                      marginTop: 12,
                      fontSize: "0.75rem",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: "var(--color-primary)",
                        }}
                      />
                      Tasks
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: "var(--color-info)",
                        }}
                      />
                      Projects
                    </span>
                  </div>
                </div>
              )}
              {data.weeklyCompletionData?.length > 0 && (
                <div className="card" style={{ padding: "20px" }}>
                  <h3
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      marginBottom: 16,
                    }}
                  >
                    Weekly Performance Trend
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data.weeklyCompletionData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-border)"
                      />
                      <XAxis
                        dataKey="_id"
                        tick={{
                          fontSize: 10,
                          fill: "var(--color-text-secondary)",
                        }}
                        tickFormatter={(val: string) =>
                          val.split("-").slice(1).join("/")
                        }
                      />
                      <YAxis
                        tick={{
                          fontSize: 12,
                          fill: "var(--color-text-secondary)",
                        }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                          fontSize: "0.8125rem",
                        }}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="completed"
                        name="Tasks Completed"
                        stroke="var(--color-success)"
                        strokeWidth={3}
                        dot={{ fill: "var(--color-success)", r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Recent Activity */}
          <div className="card" style={{ padding: "20px", overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                Recent Activity
                {activityFetching && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: "0.6875rem",
                      color: "var(--color-text-tertiary)",
                      fontWeight: 400,
                    }}
                  >
                    Loading…
                  </span>
                )}
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-ghost btn-xs"
                  disabled={page === 1 || activityFetching}
                  onClick={goPrev}
                >
                  Prev
                </button>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-text-tertiary)",
                    alignSelf: "center",
                  }}
                >
                  Page {currentPage} of {totalPages || 1}
                </span>
                <button
                  className="btn btn-ghost btn-xs"
                  disabled={page >= totalPages || activityFetching}
                  onClick={goNext}
                >
                  Next
                </button>
              </div>
            </div>

            {recentActivity.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--color-text-tertiary)",
                  fontSize: "0.875rem",
                }}
              >
                <TrendingUp
                  size={32}
                  style={{ margin: "0 auto 8px", opacity: 0.3 }}
                />
                <div>No activity yet</div>
              </div>
            ) : (
              // key={page} forces remount on every page change, restarting the CSS animation
              <div
                key={page}
                className={direction === "next" ? "slide-next" : "slide-prev"}
                style={{ display: "flex", flexDirection: "column" }}
              >
                {recentActivity.map((act: any) => (
                  <div
                    key={act._id}
                    style={{
                      padding: "12px 0",
                      borderBottom: "1px solid var(--color-border)",
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <Avatar
                      src={act.user?.avatar}
                      name={act.user?.name}
                      size={32}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.8125rem" }}>
                        <span style={{ fontWeight: 600 }}>
                          {act.user?.name}
                        </span>{" "}
                        <span
                          style={{
                            color: act.action.includes("created")
                              ? "var(--color-success)"
                              : act.action.includes("deleted")
                                ? "var(--color-danger)"
                                : "var(--color-text-secondary)",
                          }}
                        >
                          {act.action}
                        </span>
                        {act.metadata?.title && (
                          <span style={{ fontWeight: 500 }}>
                            : {act.metadata.title}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "0.6875rem",
                          color: "var(--color-text-tertiary)",
                          marginTop: 2,
                        }}
                      >
                        {format(new Date(act.createdAt), "MMM d, h:mm a")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Task Status Pie */}
          <div className="card" style={{ padding: "20px" }}>
            <h3
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              Task Breakdown
            </h3>
            {pieData.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry: any, index: number) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    width: "100%",
                  }}
                >
                  {pieData.map((item: any) => (
                    <div
                      key={item.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: "0.75rem",
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: item.color,
                        }}
                      />
                      <span
                        style={{
                          color: "var(--color-text-secondary)",
                          flex: 1,
                        }}
                      >
                        {item.name}
                      </span>
                      <span style={{ fontWeight: 600 }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  height: 180,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-text-tertiary)",
                  fontSize: "0.875rem",
                }}
              >
                No tasks assigned
              </div>
            )}
          </div>

          {/* My Teams */}
          <div className="card" style={{ padding: "20px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <Users size={18} color="var(--color-primary)" />
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                {user?.role === "admin" ? "All Teams" : "My Teams"}
              </h3>
            </div>
            {myTeams.filter(
              (t: any) =>
                user?.role === "admin" ||
                t.manager?._id === user?._id ||
                t.manager === user?._id ||
                t.members.some((m: any) => m._id === user?._id),
            ).length === 0 ? (
              <div
                style={{
                  padding: 16,
                  textAlign: "center",
                  color: "var(--color-text-tertiary)",
                  fontSize: "0.75rem",
                }}
              >
                No teams joined yet
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {myTeams
                  .filter(
                    (t: any) =>
                      user?.role === "admin" ||
                      t.manager?._id === user?._id ||
                      t.manager === user?._id ||
                      t.members.some((m: any) => m._id === user?._id),
                  )
                  .slice(0, 5)
                  .map((team: any) => (
                    <div
                      key={team._id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "var(--color-surface-hover)",
                        border: "1px solid var(--color-border)",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Avatar
                        name={team.name}
                        size={32}
                        style={{ borderRadius: 8 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {team.name}
                        </div>
                        <div
                          style={{
                            fontSize: "0.6875rem",
                            color: "var(--color-text-tertiary)",
                          }}
                        >
                          {team.members?.length || 0} members
                        </div>
                      </div>
                    </div>
                  ))}
                {myTeams.length > 5 && (
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => navigate("/teams")}
                    style={{ alignSelf: "center" }}
                  >
                    View all teams
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
