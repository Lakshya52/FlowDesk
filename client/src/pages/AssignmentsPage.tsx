import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import Avatar from "../components/common/Avatar";
import Modal from "../components/common/Modal";
import { useAuthStore } from "../store/authStore";
import {
  Plus,
  Search,
  FolderKanban,
  Users,
  Filter,
  User,
  X,
  Building2,
  Download,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};
const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  delayed: "Delayed",
};

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: "0.75rem",
  textTransform: "uppercase",
  color: "var(--color-text-secondary)",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace: "nowrap",
  maxWidth: 160,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const AssignmentsPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [activeTab, setActiveTab] = useState<
    "all" | "ongoing" | "completed" | "blueprints"
  >("all");
  const [showCreate, setShowCreate] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(() => {
    const saved = localStorage.getItem("projects_items_per_page");
    return saved ? parseInt(saved, 10) : 10;
  });

  const handleItemsPerPageChange = (val: number) => {
    setItemsPerPage(val);
    localStorage.setItem("projects_items_per_page", val.toString());
    setCurrentPage(1);
  };

  // Admin filter state
  const [filterMode, setFilterMode] = useState<
    "All" | "My Projects" | "By Team" | "By Person" | "By Company"
  >("All");
  const [filterTeamId, setFilterTeamId] = useState("");
  const [filterUserId, setFilterUserId] = useState("");

  const [form, setForm] = useState({
    title: "",
    clientName: "",
    companyId: "",
    description: "",
    priority: "medium",
    status: "not_started",
    startDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    noDueDate: false,
    team: [] as string[],
    teams: [] as string[],
    isRecurring: false,
    recurringPattern: "monthly" as any,
    recurringStartDate: "",
    recurringTime: "00:00",
  });

  const [saving, setSaving] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

    // Safety: close company dropdown on Escape
    React.useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") setShowCompanyDropdown(false);
        };
        window.addEventListener("keydown", handleEscape);
        return () => {
            window.removeEventListener("keydown", handleEscape);
            setShowCompanyDropdown(false);
        };
    }, []);

  const [confirmState, setConfirmState] = useState<
    "none" | "create_company" | "navigate_clients"
  >("none");

  const isAdmin = user?.role === "admin";
  const canCreate = true; // Everyone can create projects

  // Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<"upload" | "preview" | "result">("upload");
  const [importing, setImporting] = useState(false);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewTasks, setPreviewTasks] = useState<any[]>([]);
  const [importResult, setImportResult] = useState<{
    imported: number;
    tasksImported?: number;
    errors: any[];
  } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const selectedFileRef = React.useRef<File | null>(null);

  const { data: assignmentsData, isLoading: loading } = useQuery({
    queryKey: ["assignments", search, companyFilter],
    queryFn: async () => {
      const params: any = {};
      if (search) params.search = search;
      if (companyFilter) params.companyId = companyFilter;
      
      const { data } = await api.get("/assignments", { params });
      return data.assignments || [];
    },
  });
  const assignments = assignmentsData || [];

  const { data: adminData } = useQuery({
    queryKey: ["admin_data"],
    queryFn: async () => {
      const [tRes, uRes, cRes] = await Promise.all([
        api.get("/teams?all=true"),
        api.get("/auth/users?all=true"),
        api.get("/companies"),
      ]);
      const flatCompanies: any[] = [];
      const flatten = (items: any[]) => {
        items.forEach((item) => {
          const { children, ...rest } = item;
          flatCompanies.push(rest);
          if (children) flatten(children);
        });
      };
      flatten(cRes.data.companies || []);
      return {
        teams: tRes.data.teams || [],
        users: uRes.data.users || [],
        companies: flatCompanies,
      };
    },
    enabled: isAdmin,
  });
  const filterTeams = adminData?.teams || [];
  const filterUsers = adminData?.users || [];
  const filterCompanies = adminData?.companies || [];

  const baseAssignments = React.useMemo(() => {
    if (!isAdmin || filterMode === "All") return assignments;

    return assignments.filter((a: any) => {
      if (filterMode === "My Projects") {
        const inTeam = a.team?.some((m: any) => {
          const memberId = (m._id || m)?.toString?.() || "";
          return memberId === user?._id;
        });
        const isCreator =
          a.createdBy?._id?.toString?.() === user?._id ||
          a.createdBy?.toString?.() === user?._id;
        return inTeam || isCreator;
      }
      if (filterMode === "By Team" && filterTeamId) {
        return a.teams?.some((t: any) => {
          const teamId = (t._id || t)?.toString?.() || "";
          return teamId === filterTeamId;
        });
      }
      if (filterMode === "By Person" && filterUserId) {
        return a.team?.some((m: any) => {
          const memberId = (m._id || m)?.toString?.() || "";
          return memberId === filterUserId;
        });
      }
      if (filterMode === "By Company" && companyFilter) {
        const assignmentCompanyId =
          a.companyId?._id?.toString() || a.companyId?.toString();
        return assignmentCompanyId === companyFilter;
      }
      return true;
    });
  }, [
    assignments,
    filterMode,
    filterTeamId,
    filterUserId,
    companyFilter,
    isAdmin,
    user,
  ]);

  const allCount = baseAssignments.filter(
    (a: any) => !(a.isRecurring && !a.parentAssignmentId),
  ).length;
  const ongoingCount = baseAssignments.filter(
    (a: any) =>
      !(a.isRecurring && !a.parentAssignmentId) && a.status !== "completed",
  ).length;
  const completedCount = baseAssignments.filter(
    (a: any) =>
      !(a.isRecurring && !a.parentAssignmentId) && a.status === "completed",
  ).length;
  const blueprintsCount = baseAssignments.filter(
    (a: any) => a.isRecurring && !a.parentAssignmentId,
  ).length;

  const filteredAssignments = React.useMemo(() => {
    let result = baseAssignments;

    if (activeTab === "all") {
      result = result.filter(
        (a: any) => !(a.isRecurring && !a.parentAssignmentId),
      );
    } else if (activeTab === "ongoing") {
      result = result.filter(
        (a: any) =>
          !(a.isRecurring && !a.parentAssignmentId) && a.status !== "completed",
      );
    } else if (activeTab === "completed") {
      result = result.filter(
        (a: any) =>
          !(a.isRecurring && !a.parentAssignmentId) && a.status === "completed",
      );
    } else if (activeTab === "blueprints") {
      result = result.filter(
        (a: any) => a.isRecurring && !a.parentAssignmentId,
      );
    }

    if (statusFilter && (activeTab === "ongoing" || activeTab === "all")) {
      result = result.filter((a: any) => a.status === statusFilter);
    }

    return result;
  }, [baseAssignments, activeTab, statusFilter]);

  const { data: createData } = useQuery({
    queryKey: ["create_data"],
    queryFn: async () => {
      const [uRes, tRes, cRes] = await Promise.all([
        api.get("/auth/users?all=true"),
        api.get("/teams?all=true"),
        api.get("/companies"),
      ]);
      const flatCompanies: any[] = [];
      const flatten = (items: any[]) => {
        items.forEach((item) => {
          const { children, ...rest } = item;
          flatCompanies.push(rest);
          if (children) flatten(children);
        });
      };
      flatten(cRes.data.companies || []);
      return {
        users: uRes.data.users || [],
        teams: tRes.data.teams || [],
        companies: flatCompanies,
      };
    },
    enabled: showCreate,
  });
  const allUsers = createData?.users || [];
  const allTeams = createData?.teams || [];
  const allCompanies = createData?.companies || [];

  useEffect(() => {
    if (showCreate && user?._id) {
      setForm((prev) => ({
        ...prev,
        team: Array.from(new Set([...prev.team, user._id])),
      }));
    }
  }, [showCreate, user]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    activeTab,
    search,
    statusFilter,
    companyFilter,
    filterMode,
    filterTeamId,
    filterUserId,
    itemsPerPage,
  ]);

  useEffect(() => {
    // Run after render to ensure scroll works every time
    const mainScroll = document.getElementById("main-content-scroll");
    if (mainScroll) {
      mainScroll.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentPage]);

  const filteredCompanies = allCompanies.filter((c) =>
    c.name.toLowerCase().includes(companySearch.toLowerCase()),
  );

  const handleCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!form.companyId && form.clientName) {
      const existingCompany = allCompanies.find(
        (c) => c.name.toLowerCase() === form.clientName.toLowerCase(),
      );
      if (existingCompany) {
        const updatedForm = {
          ...form,
          companyId: existingCompany._id,
          clientName: existingCompany.name,
        };
        setForm(updatedForm);
        await saveProject(updatedForm);
        return;
      } else {
        setConfirmState("create_company");
        return;
      }
    }

    await saveProject(form);
  };

  const handleQuickAddCompany = async (
    name: string,
    shouldCreateProject: boolean = false,
  ) => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post("/companies", { name });
      const newCompany = data.company;

      // Optimistically add to companies list
      queryClient.setQueryData(["create_data"], (old: any) => {
        if (!old) return old;
        return { ...old, companies: [...old.companies, newCompany] };
      });
      queryClient.invalidateQueries({ queryKey: ["admin_data"] });

      const updatedForm = {
        ...form,
        clientName: newCompany.name,
        companyId: newCompany._id,
      };
      setForm(updatedForm);
      setCompanySearch(newCompany.name);
      setShowCompanyDropdown(false);
      setConfirmState("none");

      if (shouldCreateProject) {
        await saveProject(updatedForm);
      }
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed to add company");
    } finally {
      setSaving(false);
    }
  };

  const saveProject = async (projectData: typeof form) => {
    setSaving(true);
    try {
      const creatorTeam = user?._id
        ? Array.from(new Set([...projectData.team, user._id]))
        : projectData.team;
      const { data } = await api.post("/assignments", {
        ...projectData,
        team: creatorTeam,
        dueDate: projectData.noDueDate ? null : projectData.dueDate,
        recurringStartDate: projectData.isRecurring
          ? projectData.recurringStartDate
          : undefined,
        recurringPattern: projectData.isRecurring
          ? projectData.recurringPattern
          : undefined,
        recurringTime:
          projectData.isRecurring && projectData.recurringPattern === "daily"
            ? projectData.recurringTime
            : undefined,
      });
      setShowCreate(false);
      setForm({
        title: "",
        clientName: "",
        companyId: "",
        description: "",
        priority: "medium",
        status: "not_started",
        startDate: new Date().toISOString().split("T")[0],
        dueDate: "",
        noDueDate: false,
        team: [],
        teams: [],
        isRecurring: false,
        recurringPattern: "monthly",
        recurringStartDate: "",
        recurringTime: "00:00",
      });
      setCompanySearch("");
      if (data.assignment?._id) {
        navigate(`/assignments/${data.assignment._id}`);
      } else {
        queryClient.invalidateQueries({ queryKey: ["assignments"] });
      }
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  const toggleTeamMember = (id: string) => {
    setForm((prev) => ({
      ...prev,
      team: prev.team.includes(id)
        ? prev.team.filter((t) => t !== id)
        : [...prev.team, id],
    }));
  };

  const toggleTeam = (id: string) => {
    setForm((prev) => {
      const teamSelected = prev.teams.includes(id);
      const nextTeams = teamSelected
        ? prev.teams.filter((t) => t !== id)
        : [...prev.teams, id];
      const team = allTeams.find((t: any) => t._id === id);
      const managerId = team?.manager?._id;
      const nextTeamMembers = new Set(prev.team);

      if (teamSelected && managerId) {
        const stillRelevantManager = nextTeams.some((tid: any) => {
          const selectedTeam = allTeams.find((t: any) => t._id === tid);
          return selectedTeam?.manager?._id === managerId;
        });
        if (!stillRelevantManager) {
          nextTeamMembers.delete(managerId);
        }
      }

      if (user?._id) {
        nextTeamMembers.add(user._id);
      }

      return {
        ...prev,
        teams: nextTeams,
        team: Array.from(nextTeamMembers),
      };
    });
  };

  const selectAllTeamMembers = (teamId: string) => {
    const team = allTeams.find((t: any) => t._id === teamId);
    if (!team) return;

    const memberIds = [
      ...(team.members?.map((m: any) => m._id) || []),
      team.manager?._id,
    ].filter(Boolean);

    setForm((prev) => ({
      ...prev,
      team: Array.from(new Set([...prev.team, ...memberIds, user?._id])),
    }));
  };

  const deselectAllTeamMembers = (teamId: string) => {
    const team = allTeams.find((t: any) => t._id === teamId);
    if (!team) return;

    const memberIds = [
      ...(team.members?.map((m: any) => m._id) || []),
      team.manager?._id,
    ].filter(Boolean);

    setForm((prev) => ({
      ...prev,
      team: prev.team.filter(
        (id) => !memberIds.includes(id) || id === user?._id,
      ),
    }));
  };

  const usersInAnyTeam = new Set(
    allTeams.flatMap((team: any) =>
      [
        ...(team.members?.map((m: any) => m._id.toString()) || []),
        team.manager?._id?.toString(),
      ].filter(Boolean),
    ),
  );

  const usersNotInAnyTeam = allUsers.filter(
    (u: any) => !usersInAnyTeam.has(u._id.toString()) && u._id !== user?._id,
  );

  const totalPages = Math.ceil(filteredAssignments.length / itemsPerPage);
  const paginatedAssignments = filteredAssignments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  return (
    <div style={{ maxWidth: 1200 }} className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Projects
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--color-text-secondary)",
              marginTop: 2,
            }}
          >
            {filteredAssignments.length} Project
            {filteredAssignments.length !== 1 ? "s" : ""}
            {isAdmin &&
              filterMode !== "All" &&
              ` (filtered from ${assignments.length})`}
          </p>
        </div>
        {canCreate && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowImportModal(true)}
            >
              <Download size={16} /> Import
            </button>
            <button
              className="btn btn-primary w-full sm:w-auto"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={16} /> New Project
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        className="flex overflow-x-scroll gap-4 border-b border-(--color-border) "
        style={{}}
      >
        <button
          onClick={() => {
            setActiveTab("all");
            setStatusFilter("");
          }}
          className="flex"
          style={{
            padding: "8px 4px",
            fontSize: "0.875rem",
            fontWeight: 600,
            color:
              activeTab === "all"
                ? "var(--color-primary)"
                : "var(--color-text-secondary)",
            borderBottom: `2px solid ${activeTab === "all" ? "var(--color-primary)" : "transparent"}`,
          }}
        >
          All{" "}
          <span
            style={{
              marginLeft: 4,
              padding: "2px 8px",
              borderRadius: 12,
              fontSize: "0.75rem",
              background:
                activeTab === "all"
                  ? "var(--color-primary-light)"
                  : "var(--color-surface-hover)",
              color:
                activeTab === "all"
                  ? "var(--color-primary)"
                  : "var(--color-text-tertiary)",
            }}
          >
            {allCount}
          </span>
        </button>
        <button
          onClick={() => {
            setActiveTab("ongoing");
            setStatusFilter("");
          }}
          className="flex"
          style={{
            padding: "8px 4px",
            fontSize: "0.875rem",
            fontWeight: 600,
            color:
              activeTab === "ongoing"
                ? "var(--color-primary)"
                : "var(--color-text-secondary)",
            borderBottom: `2px solid ${activeTab === "ongoing" ? "var(--color-primary)" : "transparent"}`,
          }}
        >
          Ongoing{" "}
          <span
            style={{
              marginLeft: 4,
              padding: "2px 8px",
              borderRadius: 12,
              fontSize: "0.75rem",
              background:
                activeTab === "ongoing"
                  ? "var(--color-primary-light)"
                  : "var(--color-surface-hover)",
              color:
                activeTab === "ongoing"
                  ? "var(--color-primary)"
                  : "var(--color-text-tertiary)",
            }}
          >
            {ongoingCount}
          </span>
        </button>
        <button
          onClick={() => {
            setActiveTab("completed");
            setStatusFilter("");
          }}
          className="flex"
          style={{
            padding: "8px 4px",
            fontSize: "0.875rem",
            fontWeight: 600,
            color:
              activeTab === "completed"
                ? "var(--color-primary)"
                : "var(--color-text-secondary)",
            borderBottom: `2px solid ${activeTab === "completed" ? "var(--color-primary)" : "transparent"}`,
          }}
        >
          Completed{" "}
          <span
            style={{
              marginLeft: 4,
              padding: "2px 8px",
              borderRadius: 12,
              fontSize: "0.75rem",
              background:
                activeTab === "completed"
                  ? "var(--color-primary-light)"
                  : "var(--color-surface-hover)",
              color:
                activeTab === "completed"
                  ? "var(--color-primary)"
                  : "var(--color-text-tertiary)",
            }}
          >
            {completedCount}
          </span>
        </button>
        <button
          onClick={() => {
            setActiveTab("blueprints");
            setStatusFilter("");
          }}
          className="flex"
          style={{
            padding: "8px 4px",
            fontSize: "0.875rem",
            fontWeight: 600,
            color:
              activeTab === "blueprints"
                ? "var(--color-primary)"
                : "var(--color-text-secondary)",
            borderBottom: `2px solid ${activeTab === "blueprints" ? "var(--color-primary)" : "transparent"}`,
          }}
        >
          Recurring{" "}
          <span
            style={{
              marginLeft: 4,
              padding: "2px 8px",
              borderRadius: 12,
              fontSize: "0.75rem",
              background:
                activeTab === "blueprints"
                  ? "var(--color-primary-light)"
                  : "var(--color-surface-hover)",
              color:
                activeTab === "blueprints"
                  ? "var(--color-primary)"
                  : "var(--color-text-tertiary)",
            }}
          >
            {blueprintsCount}
          </span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4  sm:items-center">
        <div className="w-full sm:max-w-[360px] relative">
          <Search
            size={16}
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-tertiary)",
            }}
          />
          <input
            className="input"
            style={{
              paddingLeft: 40,
              height: 40,
              borderRadius: 10,
              fontSize: "0.875rem",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(activeTab === "ongoing" || activeTab === "all") && (
          <div style={{ position: "relative" }} className="w-full sm:w-auto">
            <select
              style={{
                width: "100%",
                minWidth: 160,
                height: 40,
                padding: "0 12px",
                borderRadius: 10,
                fontSize: "0.8125rem",
                fontWeight: 500,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                cursor: "pointer",
              }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              {Object.entries(STATUS_LABELS)
                .filter(([k]) => k !== "completed")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {/* Admin Filters */}
      {isAdmin && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: "1rem",
            padding: "12px 16px",
            borderRadius: 12,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            flexWrap: "wrap",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Filter
              size={16}
              style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}
            />
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--color-text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Filter
            </span>
          </div>

          <div
            style={{
              width: 1,
              height: 20,
              background: "var(--color-border)",
              flexShrink: 0,
            }}
          />

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "All", label: "All", icon: <FolderKanban size={12} /> },
              {
                key: "My Projects",
                label: "My Projects",
                icon: <User size={12} />,
              },
              { key: "By Team", label: "By Team", icon: <Users size={12} /> },
              {
                key: "By Person",
                label: "By Person",
                icon: <User size={12} />,
              },
              {
                key: "By Company",
                label: "By Company",
                icon: <Building2 size={12} />,
              },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  setFilterMode(opt.key as any);
                  if (opt.key === "All" || opt.key === "My Projects") {
                    setFilterTeamId("");
                    setFilterUserId("");
                  }
                  if (opt.key !== "By Company") {
                    setCompanyFilter("");
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 12px",
                  borderRadius: 20,
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  border: "none",
                  cursor: "pointer",
                  background:
                    filterMode === opt.key
                      ? "var(--color-primary)"
                      : "var(--color-surface-hover)",
                  color:
                    filterMode === opt.key
                      ? "white"
                      : "var(--color-text-secondary)",
                }}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>

          {filterMode === "By Team" && (
            <select
              style={{
                width: 180,
                fontSize: "0.75rem",
                height: 32,
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                background: "var(--color-bg)",
                padding: "0 10px",
              }}
              value={filterTeamId}
              onChange={(e) => setFilterTeamId(e.target.value)}
            >
              <option value="">Select team...</option>
              {filterTeams.map((t: any) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          {filterMode === "By Person" && (
            <select
              style={{
                width: 180,
                fontSize: "0.75rem",
                height: 32,
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                background: "var(--color-bg)",
                padding: "0 10px",
              }}
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
            >
              <option value="">Select person...</option>
              {filterUsers.map((u: any) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}

          {filterMode === "By Company" && (
            <select
              style={{
                width: 180,
                fontSize: "0.75rem",
                height: 32,
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                background: "var(--color-bg)",
                padding: "0 10px",
              }}
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
            >
              <option value="">Select company...</option>
              {filterCompanies.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {(filterMode !== "All" || companyFilter) && (
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "6px 10px",
                borderRadius: 20,
                fontSize: "0.7rem",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
                background: "rgba(239, 68, 68, 0.1)",
                color: "#ef4444",
                marginLeft: "auto",
              }}
              onClick={() => {
                setFilterMode("All");
                setFilterTeamId("");
                setFilterUserId("");
                setCompanyFilter("");
              }}
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>
      )}

      {/* Pagination summary and page size selector */}
      {!loading && filteredAssignments.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            padding: "0 4px",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "var(--color-text-secondary)",
            }}
          >
            Page{" "}
            <span style={{ color: "var(--color-text)" }}>{currentPage}</span> of{" "}
            <span style={{ color: "var(--color-text)" }}>
              {totalPages || 1}
            </span>
            {/* total projects count */}
            {/* <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400, marginLeft: 4 }}>({filteredAssignments.length} project{filteredAssignments.length !== 1 ? 's' : ''} total)</span> */}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-text-secondary)",
                fontWeight: 500,
              }}
            >
              Show:
            </span>
            <select
              className="select"
              style={{
                width: "auto",
                minWidth: 120,
                height: 32,
                padding: "0 28px 0 10px",
                borderRadius: 8,
                fontSize: "0.75rem",
                fontWeight: 500,
                backgroundPosition: "right 6px center",
                backgroundSize: "12px",
              }}
              value={itemsPerPage}
              onChange={(e) =>
                handleItemsPerPageChange(parseInt(e.target.value, 10))
              }
            >
              <option value={5}>5 per page</option>
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>
        </div>
      )}

      {/* Project List */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 100, borderRadius: 12 }}
            />
          ))}
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <FolderKanban
            size={48}
            style={{
              margin: "0 auto 12px",
              color: "var(--color-text-tertiary)",
              opacity: 0.3,
            }}
          />
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            No projects found
          </div>
          <div
            style={{
              fontSize: "0.875rem",
              color: "var(--color-text-secondary)",
            }}
          >
            Try a different filter or create your first project.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {paginatedAssignments.map((a: any) => (
            <div
              key={a._id}
              className="card"
              style={{ padding: "16px 20px", cursor: "pointer" }}
              onClick={() => navigate(`/assignments/${a._id}`)}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0"
              >
                {/* project details */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      //   display: "flex",
                      //   alignItems: "center",
                      gap: 10,
                      marginBottom: 6,
                    }}
                    className="flex flex-col-reverse sm:flex-row items-start sm:items-center justify-center sm:justify-start"
                  >
                    <span style={{ fontSize: "0.9375rem", fontWeight: 600 }}>
                      {a.title}
                    </span>
                    <div className="flex gap-2">
                      {a.isRecurring && !a.parentAssignmentId && (
                        <span
                          className="badge"
                          style={{
                            background: "var(--color-primary-light)",
                            color: "var(--color-primary)",
                          }}
                        >
                          Blueprint
                        </span>
                      )}
                      <span className={`badge badge-${a.priority}`}>
                        {PRIORITY_LABELS[a.priority]}
                      </span>
                      {activeTab !== "blueprints" && (
                        <span className={`badge badge-${a.status}`}>
                          {STATUS_LABELS[a.status]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--color-text-secondary)",
                      marginBottom: 6,
                    }}
                  >
                    {a.clientName && <span>Client: {a.clientName}</span>}
                    {activeTab === "blueprints" ? (
                      <span style={{ textTransform: "capitalize" }}>
                        {" "}
                        · Pattern: {a.recurringPattern}
                      </span>
                    ) : (
                      <span>
                        {" "}
                        ·{" "}
                        {a.dueDate && new Date(a.dueDate).getFullYear() > 1970
                          ? `Due ${format(new Date(a.dueDate), "MMM d, yyyy")}`
                          : "No Due Date"}
                      </span>
                    )}
                  </div>
                  {a.teams?.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {a.teams.map((t: any) => (
                        <span
                          key={t._id}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: "var(--color-primary-light)",
                            fontSize: "0.6875rem",
                            fontWeight: 500,
                            color: "var(--color-primary)",
                          }}
                        >
                          <Users size={10} /> {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {/* users profile images */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                  }}
                  className="flex w-full sm:w-auto items-center justify-end"
                >
                  {a.team?.slice(0, 3).map((member: any, i: number) => (
                    <Avatar
                      key={member._id}
                      src={member.avatar}
                      name={member.name}
                      size={28}
                      style={{
                        border: "2px solid var(--color-surface)",
                        marginLeft: i > 0 ? -8 : 0,
                        zIndex: 10 - i,
                      }}
                    />
                  ))}
                  {a.team?.length > 3 && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--color-text-tertiary)",
                        marginLeft: 4,
                      }}
                    >
                      +{a.team.length - 3}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 16,
                marginTop: 24,
                paddingBottom: 24,
              }}
            >
              <button
                className="btn btn-secondary btn-sm"
                style={{ minWidth: 100 }}
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              >
                Previous
              </button>
              <span
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                }}
              >
                Page {currentPage} of {totalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                style={{ minWidth: 100 }}
                disabled={currentPage === totalPages}
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} zIndex={100}>
        <div
          className="card animate-fade-in w-full max-w-[560px] p-5 sm:p-7 max-h-[90vh] overflow-auto"
        >
            <h2 className="text-lg font-bold mb-5">Create Project</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    marginBottom: 4,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Title *
                </label>
                <input
                  className="input"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Project title"
                />
              </div>
              <div style={{ position: "relative" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    marginBottom: 4,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Company / Client *
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    className="input"
                    required
                    value={companySearch || form.clientName}
                    onChange={(e) => {
                      setCompanySearch(e.target.value);
                      setShowCompanyDropdown(true);
                      setForm((prev) => ({
                        ...prev,
                        clientName: e.target.value,
                        companyId: "",
                      }));
                    }}
                    onFocus={() => setShowCompanyDropdown(true)}
                    onBlur={() =>
                      setTimeout(() => setShowCompanyDropdown(false), 200)
                    }
                    placeholder="Search or enter company name"
                  />
                  {showCompanyDropdown &&
                    (companySearch || allCompanies.length > 0) && (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          background: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "0 0 8px 8px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                          zIndex: 10,
                          maxHeight: 200,
                          overflowY: "auto",
                        }}
                      >
                        {filteredCompanies.length > 0 ? (
                          filteredCompanies.map((c) => (
                            <div
                              key={c._id}
                              style={{
                                padding: "8px 12px",
                                cursor: "pointer",
                                fontSize: "0.875rem",
                              }}
                              className="hover-bg"
                              onClick={() => {
                                setForm((prev) => ({
                                  ...prev,
                                  clientName: c.name,
                                  companyId: c._id,
                                }));
                                setCompanySearch(c.name);
                                setShowCompanyDropdown(false);
                              }}
                            >
                              {c.name}{" "}
                              {c.parentCompanyId && (
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    color: "var(--color-text-tertiary)",
                                    marginLeft: 6,
                                  }}
                                >
                                  (Subsidiary)
                                </span>
                              )}
                            </div>
                          ))
                        ) : companySearch ? (
                          <div
                            style={{
                              padding: "10px 12px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              background: "var(--color-primary-light)",
                            }}
                            className="hover-bg"
                            onClick={() => handleQuickAddCompany(companySearch)}
                          >
                            <Plus size={16} color="var(--color-primary)" />
                            <div
                              style={{
                                fontSize: "0.875rem",
                                fontWeight: 500,
                                color: "var(--color-primary)",
                              }}
                            >
                              Add <strong>"{companySearch}"</strong> as new
                              company
                            </div>
                          </div>
                        ) : (
                          <div
                            style={{
                              padding: "8px 12px",
                              fontSize: "0.875rem",
                              color: "var(--color-text-tertiary)",
                            }}
                          >
                            Type to search or add a company
                          </div>
                        )}
                      </div>
                    )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      marginBottom: 4,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Assignment Type
                  </label>
                  <select
                    className="select"
                    value={form.isRecurring ? "true" : "false"}
                    onChange={(e) => {
                      const isRec = e.target.value === "true";
                      setForm({
                        ...form,
                        isRecurring: isRec,
                        recurringStartDate: isRec
                          ? new Date().toISOString().split("T")[0]
                          : "",
                      });
                    }}
                  >
                    <option value="false">Transactional Project</option>
                    <option value="true">Recurring Project</option>
                  </select>
                </div>
                {form.isRecurring && (
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8125rem",
                        fontWeight: 500,
                        marginBottom: 4,
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      Recurring Pattern
                    </label>
                    <select
                      className="select"
                      value={form.recurringPattern}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          recurringPattern: e.target.value as any,
                        })
                      }
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                )}
              </div>

              {form.isRecurring && (
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      marginBottom: 4,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Recurring Start Date *
                  </label>
                  <input
                    className="input"
                    type="date"
                    required
                    value={form.recurringStartDate}
                    onChange={(e) =>
                      setForm({ ...form, recurringStartDate: e.target.value })
                    }
                  />
                </div>
              )}

              {form.isRecurring && form.recurringPattern === "daily" && (
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      marginBottom: 4,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Daily Time *
                  </label>
                  <input
                    className="input"
                    type="time"
                    required
                    value={form.recurringTime}
                    onChange={(e) =>
                      setForm({ ...form, recurringTime: e.target.value })
                    }
                  />
                </div>
              )}

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    marginBottom: 4,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Description
                </label>
                <textarea
                  className="input"
                  rows={3}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Description..."
                  style={{ resize: "vertical" }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      marginBottom: 4,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Priority
                  </label>
                  <select
                    className="select"
                    value={form.priority}
                    onChange={(e) =>
                      setForm({ ...form, priority: e.target.value })
                    }
                  >
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      marginBottom: 4,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Start Date *
                  </label>
                  <input
                    className="input"
                    type="date"
                    required
                    value={form.startDate}
                    onChange={(e) =>
                      setForm({ ...form, startDate: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      marginBottom: 4,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Due Date *
                  </label>
                  <input
                    className="input"
                    type="date"
                    required={!form.noDueDate}
                    disabled={form.noDueDate}
                    value={form.dueDate}
                    onChange={(e) =>
                      setForm({ ...form, dueDate: e.target.value })
                    }
                  />
                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <input
                      type="checkbox"
                      id="noDueDate"
                      checked={form.noDueDate}
                      onChange={(e) =>
                        setForm({ ...form, noDueDate: e.target.checked })
                      }
                    />
                    <label
                      htmlFor="noDueDate"
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--color-text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      No due date
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    marginBottom: 8,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Assign Teams
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {allTeams.map((t: any) => (
                    <button
                      key={t._id}
                      type="button"
                      className={`btn btn-sm ${form.teams.includes(t._id) ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => toggleTeam(t._id)}
                    >
                      <Users size={12} /> {t.name}
                    </button>
                  ))}
                </div>
              </div>

              {form.teams.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      marginBottom: 8,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Team Members
                  </label>
                  {form.teams.map((teamId) => {
                    const team = allTeams.find((t: any) => t._id === teamId);
                    if (!team) return null;
                    const manager = team.manager;
                    const members = (team.members || []).filter(
                      (m: any) => m._id !== manager?._id,
                    );
                    const memberIds = [
                      ...members.map((m: any) => m._id),
                      manager?._id,
                    ].filter(Boolean);
                    const allMembersSelected =
                      memberIds.length > 0 &&
                      memberIds.every((id) => form.team.includes(id));

                    return (
                      <div
                        key={teamId}
                        style={{
                          marginBottom: 12,
                          padding: 12,
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 8,
                          }}
                        >
                          <strong>{team.name}</strong>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() =>
                              allMembersSelected
                                ? deselectAllTeamMembers(teamId)
                                : selectAllTeamMembers(teamId)
                            }
                          >
                            {allMembersSelected ? "Deselect All" : "Select All"}
                          </button>
                        </div>
                        <div
                          style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                        >
                          {manager && (
                            <button
                              type="button"
                              className={`btn btn-sm ${form.team.includes(manager._id) ? "btn-primary" : "btn-secondary"}`}
                              onClick={() => toggleTeamMember(manager._id)}
                            >
                              {manager.name} (Manager)
                            </button>
                          )}
                          {members.map((m: any) => (
                            <button
                              key={m._id}
                              type="button"
                              className={`btn btn-sm ${form.team.includes(m._id) ? "btn-primary" : "btn-secondary"}`}
                              onClick={() => toggleTeamMember(m._id)}
                            >
                              {m.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {usersNotInAnyTeam.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      marginBottom: 8,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Other Individual Members
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {usersNotInAnyTeam.map((u: any) => (
                      <button
                        key={u._id}
                        type="button"
                        className={`btn btn-sm ${form.team.includes(u._id) ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => toggleTeamMember(u._id)}
                      >
                        {u.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                  disabled={saving}
                >
                  {saving ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportStep("upload");
          setPreviewRows([]);
          setPreviewTasks([]);
          setImportResult(null);
          selectedFileRef.current = null;
        }}
        zIndex={50}
      >
        <div
          className="card animate-fade-in"
          style={{
            maxWidth: 680,
            width: "100%",
            padding: 0,
            borderRadius: 16,
            maxHeight: "90vh",
            overflowY: "auto",
          }}
        >
            {/* Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--color-surface)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {importStep === "result" && importResult ? (
                  importResult.imported > 0 ? (
                    // <CheckCircle size={20} color="var(--color-success)" />
                    null
                  ) : (
                    <AlertCircle size={20} color="var(--color-danger)" />
                  )
                ) : (
                  <Download size={20} />
                )}
                <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
                  {importStep === "upload"
                    ? "Import Projects"
                    : importStep === "preview"
                      ? "Review Imported Projects"
                      : "Import Completed"}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportStep("upload");
                  setPreviewRows([]);
                  setPreviewTasks([]);
                  setImportResult(null);
                  selectedFileRef.current = null;
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)",
                  padding: 4,
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Upload step */}
            {importStep === "upload" && (
              <div style={{ padding: 24 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    selectedFileRef.current = file;
                    setImporting(true);
                    try {
                      const formData = new FormData();
                      formData.append("file", file);
                      const { data } = await api.post(
                        "/assignments/import/preview",
                        formData,
                        {
                          headers: {
                            "Content-Type": "multipart/form-data",
                          },
                        },
                      );
                      if (data.success) {
                        setPreviewRows(data.rows || []);
                        setPreviewTasks(data.tasks || []);
                        setImportStep("preview");
                      }
                    } catch (err: any) {
                      alert(
                        err?.response?.data?.message || "Preview failed",
                      );
                    } finally {
                      setImporting(false);
                      if (fileInputRef.current)
                        fileInputRef.current.value = "";
                    }
                  }}
                />

                <div
                  onClick={() =>
                    !importing && fileInputRef.current?.click()
                  }
                  className="border-2 border-dashed border-(--color-border) flex flex-col items-center justify-center"
                  style={{
                    borderRadius: 12,
                    padding: "32px 24px",
                    cursor: importing ? "default" : "pointer",
                    marginBottom: 16,
                  }}
                >
                  {importing ? (
                    <Loader2 size={32} className="animate-spin" />
                  ) : (
                    <Upload
                      size={32}
                      style={{ opacity: 0.4 }}
                    />
                  )}
                  <p
                    style={{
                      marginTop: 8,
                      fontWeight: 600,
                      color: "var(--color-text)",
                    }}
                  >
                    {importing
                      ? "Reading file..."
                      : "Click to upload Excel file"}
                  </p>
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    .xlsx or .xls format
                  </p>
                </div>

                <a
                  href={`${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}/assignments/import/sample`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    fontSize: "0.85rem",
                    color: "var(--color-primary)",
                    textDecoration: "none",
                  }}
                >
                  <Download size={14} /> Download sample format
                </a>
              </div>
            )}

            {/* Preview step */}
            {importStep === "preview" && (
              <div style={{ padding: 24 }}>
                <div
                  style={{
                    marginBottom: 16,
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.85rem",
                      padding: "4px 12px",
                      borderRadius: 12,
                      background: "var(--color-success-light, #d1fae5)",
                      color: "var(--color-success, #059669)",
                      fontWeight: 600,
                    }}
                  >
                    {previewRows.filter((r: any) => r.errors.length === 0).length} Valid
                  </span>
                  {previewRows.filter((r: any) => r.errors.length > 0).length >
                    0 && (
                    <span
                      style={{
                        fontSize: "0.85rem",
                        padding: "4px 12px",
                        borderRadius: 12,
                        background: "var(--color-danger-light, #fee2e2)",
                        color: "var(--color-danger, #dc2626)",
                        fontWeight: 600,
                      }}
                    >
                    {previewRows.filter((r: any) => r.errors.length > 0).length} Errors
                  </span>
                  )}
                  {previewTasks.length > 0 && (
                    <span
                      style={{
                        fontSize: "0.85rem",
                        padding: "4px 12px",
                        borderRadius: 12,
                        background: "var(--color-info-light, #dbeafe)",
                        color: "var(--color-info, #2563eb)",
                        fontWeight: 600,
                      }}
                    >
                      {previewTasks.filter((t: any) => t.errors.length === 0).length} Tasks
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    {previewRows.length} project{previewRows.length !== 1 ? "s" : ""}
                    {previewTasks.length > 0 && `, ${previewTasks.length} task${previewTasks.length !== 1 ? "s" : ""}`}
                  </span>
                </div>

                <div
                  style={{
                    maxHeight: 320,
                    overflowY: "auto",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    marginBottom: 16,
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      fontSize: "0.8rem",
                      borderCollapse: "collapse",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: "var(--color-surface)",
                          position: "sticky",
                          top: 0,
                        }}
                      >
                        <th style={thStyle}>#</th>
                        <th style={thStyle}>Title</th>
                        <th style={thStyle}>Client</th>
                        <th style={thStyle}>Priority</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Start</th>
                        <th style={thStyle}>Due</th>
                        <th style={thStyle}>Recurring</th>
                        <th style={thStyle}>Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row: any, idx: number) => (
                        <tr
                          key={idx}
                          style={{
                            background:
                              row.errors.length > 0
                                ? "rgba(239, 68, 68, 0.05)"
                                : idx % 2 === 0
                                  ? "var(--color-surface)"
                                  : "transparent",
                          }}
                        >
                          <td style={tdStyle}>{row.row}</td>
                          <td style={tdStyle}>{row.title}</td>
                          <td style={tdStyle}>{row.clientName}</td>
                          <td style={tdStyle}>{row.priority}</td>
                          <td style={tdStyle}>
                            {row.status?.replace(/_/g, " ")}
                          </td>
                          <td style={tdStyle}>{row.startDate}</td>
                          <td style={tdStyle}>
                            {row.dueDate || "No due date"}
                          </td>
                          <td style={tdStyle}>
                            {row.isRecurring === true ||
                            String(row.isRecurring).toLowerCase() === "true"
                              ? "Yes"
                              : "No"}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              color:
                                row.errors.length > 0
                                  ? "var(--color-danger)"
                                  : "var(--color-success)",
                            }}
                          >
                            {row.errors.length > 0
                              ? row.errors.join("; ")
                              : "✓"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="btn"
                    style={{ flex: 1, padding: 10 }}
                    onClick={() => {
                      setImportStep("upload");
                      setPreviewRows([]);
                      setPreviewTasks([]);
                      selectedFileRef.current = null;
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, padding: 10 }}
                    disabled={
                      importing ||
                      previewRows.filter((r: any) => r.errors.length === 0)
                        .length === 0
                    }
                    onClick={async () => {
                      setImporting(true);
                      try {
                        const file = selectedFileRef.current;
                        if (!file) return;
                        const formData = new FormData();
                        formData.append("file", file);
                        const { data } = await api.post(
                          "/assignments/import/excel",
                          formData,
                          {
                            headers: {
                              "Content-Type": "multipart/form-data",
                            },
                          },
                        );
                        setImportResult({
                          imported: data.imported || 0,
                          tasksImported: data.tasksImported || 0,
                          errors: data.errors || [],
                        });
                        setImportStep("result");
                        if (data.imported > 0) {
                          queryClient.invalidateQueries({
                            queryKey: ["assignments"],
                          });
                        }
                      } catch (err: any) {
                        alert(
                          err?.response?.data?.message ||
                            "Import failed",
                        );
                      } finally {
                        setImporting(false);
                      }
                    }}
                  >
                    {importing ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : null}
                    {importing
                      ? "Importing..."
                      : `Import ${previewRows.filter((r: any) => r.errors.length === 0).length} Projects`}
                  </button>
                </div>
              </div>
            )}

            {/* Result step */}
            {importStep === "result" && importResult && (
              <div style={{ padding: 24 }}>
                <div className="flex  flex-col items-center justify-center"
                  style={{  textAlign: "center", marginBottom: 20 }}
                >
                  {importResult.imported > 0 ? (
                    <CheckCircle
                      size={24}
                      style={{ color: "var(--color-success)" }}
                    />
                  ) : (
                    <AlertCircle
                      size={24}
                      style={{ color: "var(--color-danger)" }}
                    />
                  )}
                  <h3
                    style={{
                      margin: "8px 0 4px",
                      fontSize: "1.1rem",
                      fontWeight: 700,
                    }}
                  >
                    {importResult.imported} project
                    {importResult.imported !== 1 ? "s" : ""}
                    {importResult.tasksImported != null && importResult.tasksImported > 0
                      ? `, ${importResult.tasksImported} task${importResult.tasksImported !== 1 ? "s" : ""}`
                      : ""} imported
                  </h3>
                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {importResult.errors.length > 0
                      ? `${importResult.errors.length} error(s)`
                      : "All projects imported successfully"}
                  </p>
                </div>
                {importResult.errors.length > 0 && (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: 12,
                      borderRadius: 8,
                      background: "rgba(239, 68, 68, 0.08)",
                      fontSize: "0.8rem",
                    }}
                  >
                    {importResult.errors.map(
                      (e: any, i: number) => (
                        <div key={i} style={{ marginBottom: 4 }}>
                          <strong>Row {e.row}:</strong> {e.message}
                        </div>
                      ),
                    )}
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  style={{ width: "100%", padding: 10 }}
                  onClick={() => {
                    setShowImportModal(false);
                    setImportStep("upload");
                    setPreviewRows([]);
                    setPreviewTasks([]);
                    setImportResult(null);
                    selectedFileRef.current = null;
                  }}
                >
                  Done
                </button>
                </div>
            )}
          </div>
        </Modal>

      {/* Confirmation Modals */}
      <Modal isOpen={confirmState !== "none"} onClose={() => setConfirmState("none")} zIndex={200}>
        <div
          className="card animate-fade-in"
          style={{
            width: "100%",
            maxWidth: 400,
            padding: 24,
            textAlign: "center",
          }}
        >
            {confirmState === "create_company" ? (
              <>
                <div
                  style={{
                    marginBottom: 16,
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: "var(--color-primary-light)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Building2 size={24} color="var(--color-primary)" />
                  </div>
                </div>
                <h3
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  Company Not Found
                </h3>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--color-text-secondary)",
                    marginBottom: 24,
                  }}
                >
                  The company <strong>"{form.clientName}"</strong> does not
                  exist. Do you want to create it now?
                </p>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  <button
                    className="btn btn-primary"
                    onClick={() => handleQuickAddCompany(form.clientName, true)}
                    disabled={saving}
                  >
                    Yes, create and continue
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setConfirmState("navigate_clients")}
                  >
                    No, I will do it myself
                  </button>
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    marginBottom: 16,
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: "rgba(59, 130, 246, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Users size={24} color="#3b82f6" />
                  </div>
                </div>
                <h3
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  Navigate to Companies?
                </h3>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--color-text-secondary)",
                    marginBottom: 24,
                  }}
                >
                  Please create the company in the "companies / clients" tab.
                  Navigate now?
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => setConfirmState("none")}
                  >
                    No
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => navigate("/clients")}
                  >
                    Yes, navigate now
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
    </div>
  );
};

export default AssignmentsPage;
