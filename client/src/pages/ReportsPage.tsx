import * as React from "react";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import api from "../lib/api";
import FilterBar from "../components/reports/FilterBar";
import EmployeeTrackingReport from "../components/reports/EmployeeTrackingReport";
import WorkloadReport from "../components/reports/WorkloadReport";
import ActivityReport from "../components/reports/ActivityReport";
import ProjectHealthReport from "../components/reports/ProjectHealthReport";
import { useQuery } from "@tanstack/react-query";

import DrilldownModal from "../components/reports/DrilldownModal";
import {
  Download,
  FileText,
  BarChart3,
  PieChart,
  ChevronDown,
  LayoutDashboard,
  Activity,
  Users,
  FolderKanban,
  AlertCircle,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";

const TABS = [
  {
    id: "employee",
    label: "Tracking",
    icon: <Users size={18} />,
    component: EmployeeTrackingReport,
    description: "Completion, overdue & delivery pace per person",
  },
  {
    id: "workload",
    label: "Workload",
    icon: <LayoutDashboard size={18} />,
    component: WorkloadReport,
    description: "Estimated hours, capacity & stale work",
  },
  {
    id: "activity",
    label: "Activity",
    icon: <Activity size={18} />,
    component: ActivityReport,
    description: "Actions over time, contributors & inactivity",
  },
  {
    id: "project-health",
    label: "Projects",
    icon: <FolderKanban size={18} />,
    component: ProjectHealthReport,
    description: "Red / yellow / green health across all projects",
  },
];

const ReportsPage = (): React.JSX.Element => {
  const { reportType } = useParams<{ reportType: string }>();
  const activeTab = reportType || "employee";
  const user = useAuthStore((s) => s.user);
  const [filters, setFilters] = useState<any>({
    startDate: "",
    endDate: "",
    teamId: "",
    employeeId: "",
    projectId: "",
    status: "",
  });
  const [filterOptions, setFilterOptions] = useState<{
    teams: any[];
    employees: any[];
    assignments: any[];
  }>({
    teams: [],
    employees: [],
    assignments: [],
  });

  const [drilldown, setDrilldown] = useState<{
    open: boolean;
    title: string;
    data: any[];
  }>({
    open: false,
    title: "",
    data: [],
  });

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data: queryFilterOptions } = useQuery({
    queryKey: ['reportFilters'],
    queryFn: async () => {
      const [filterRes, assignmentsRes] = await Promise.allSettled([
        api.get('/dashboard/report-filters'),
        api.get('/assignments'),
      ]);
      const newOptions = {
        teams: [],
        employees: [],
        assignments: [],
      } as typeof filterOptions;
      if (filterRes.status === 'fulfilled') {
        const filterData = filterRes.value.data;
        newOptions.teams = filterData.teams || [];
        newOptions.employees = filterData.employees || [];
      }
      if (assignmentsRes.status === 'fulfilled') {
        const assignmentsData = assignmentsRes.value.data;
        newOptions.assignments = assignmentsData.assignments || assignmentsData.data?.assignments || [];
      }
      return newOptions;
    },
  });
  useEffect(() => {
    if (queryFilterOptions) {
      setFilterOptions(queryFilterOptions);
    }
  }, [queryFilterOptions]);

  const handleExport = async (type: "csv" | "pdf" | "excel") => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    let url: string | null = null;
    try {
      const response = await api.get("/reports/export", {
        params: { type, reportType: activeTab, ...filters },
        responseType: "blob",
      });
      url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      const extension = type === "excel" ? "xlsx" : type;
      link.setAttribute("download", `flowdesk-${activeTab}-report-${new Date().toISOString().slice(0, 10)}.${extension}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err) {
      console.error(err);
      setExportError("Export failed. Please try again.");
    } finally {
      if (url) window.URL.revokeObjectURL(url);
      setExporting(false);
      setIsExportOpen(false);
    }
  };

  useEffect(() => {
    if (!exportError) return;
    const t = setTimeout(() => setExportError(null), 5000);
    return () => clearTimeout(t);
  }, [exportError]);

  const handleDrilldown = (title: string, data: any[]) => {
    setDrilldown({ open: true, title, data });
  };

  const activeTabData = TABS.find((t) => t.id === activeTab);
  const ActiveComponent = activeTabData?.component || EmployeeTrackingReport;

  return (
    <div className="min-h-screen bg-(--color-bg) pb-20">
      {/* Page Header */}
      <div className="bg-surface border-b border-border top-0 z-30 card rounded-2xl px-4 sm:px-8 lg:px-16 py-6 sm:py-10">
        <div className="max-w-350 mx-auto flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <h1 className="text-xl sm:text-3xl font-black text-text tracking-tight flex items-center gap-4">
              {activeTabData?.icon ?? <BarChart3 className="text-primary" size={28} />}
              {activeTabData?.label || "Reports & Analytics"}
            </h1>
            <p className="text-base text-text-secondary mt-2 font-medium">
              {activeTabData?.description || "Comprehensive insights across projects, teams, and individual performance."}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setIsExportOpen(!isExportOpen)}
                disabled={exporting}
                className="btn btn-primary h-12 px-6 gap-3 shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all font-bold text-sm disabled:opacity-60 disabled:pointer-events-none"
              >
                <Download size={18} className={exporting ? "animate-bounce" : ""} />
                <span>{exporting ? "Exporting…" : "Export Report"}</span>
                <ChevronDown
                  size={16}
                  className={`transition-transform duration-300 ${isExportOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isExportOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsExportOpen(false)}
                  ></div>
                  <div className="absolute right-0 mt-4 w-60 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-50 animate-fade-in p-2.5 backdrop-blur-xl bg-surface/95 border border-border">
                    <button
                      onClick={() => handleExport("csv")}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-text-secondary hover:bg-(--color-primary)/5 hover:text-primary transition-all rounded-2xl group/item"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-(--color-primary)/10 flex items-center justify-center text-primary group-hover/item:scale-110 transition-transform">
                          <FileText size={18} />
                        </div>
                        CSV Data
                      </div>
                      <div className="w-1.5 h-1.5 rounded-full bg-(--color-primary)/30 group-hover/item:bg-(--color-primary) transition-colors"></div>
                    </button>
                    <button
                      onClick={() => handleExport("excel")}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-text-secondary hover:bg-success/5 hover:text-success transition-all rounded-2xl group/item"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success group-hover/item:scale-110 transition-transform">
                          <BarChart3 size={18} />
                        </div>
                        Excel Sheet
                      </div>
                      <div className="w-1.5 h-1.5 rounded-full bg-success/30 group-hover/item:bg-success transition-colors"></div>
                    </button>
                    <button
                      onClick={() => handleExport("pdf")}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-text-secondary hover:bg-danger/5 hover:text-danger transition-all rounded-2xl group/item"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-danger/10 flex items-center justify-center text-danger group-hover/item:scale-110 transition-transform">
                          <PieChart size={18} />
                        </div>
                        PDF Report
                      </div>
                      <div className="w-1.5 h-1.5 rounded-full bg-danger/30 group-hover/item:bg-danger transition-colors"></div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-350 mx-auto mt-6 sm:mt-8">

        {exportError && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-semibold mb-5 animate-fade-in">
            <AlertCircle size={18} />
            {exportError}
          </div>
        )}

        {/* Filters Section */}
        <div style={{ marginBottom: "20px" }}>
          <FilterBar
            filters={filters}
            setFilters={setFilters}
            filterOptions={filterOptions}
            onReset={() =>
              setFilters({
                startDate: "",
                endDate: "",
                teamId: "",
                employeeId: "",
                projectId: "",
                status: "",
              })
            }
            user={user}
          />
        </div>

        {/* Report Content */}
        <div className="animate-fade-in" key={activeTab}>
          <ActiveComponent filters={filters} onDrilldown={handleDrilldown} />
        </div>
      </div>

      <DrilldownModal
        isOpen={drilldown.open}
        onClose={() => setDrilldown({ ...drilldown, open: false })}
        title={drilldown.title}
        data={drilldown.data}
      />
    </div>
  );
};

export default ReportsPage;
