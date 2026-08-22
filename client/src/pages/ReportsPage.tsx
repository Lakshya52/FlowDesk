import * as React from "react";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import api from "../lib/api";
import FilterBar from "../components/reports/FilterBar";
import EmployeeTrackingReport from "../components/reports/EmployeeTrackingReport";
import WorkloadReport from "../components/reports/WorkloadReport";
import ActivityReport from "../components/reports/ActivityReport";
import { useQuery } from "@tanstack/react-query"

import DrilldownModal from "../components/reports/DrilldownModal";
import {
  Download,
  FileText,
  BarChart3,
  PieChart,
  // Settings2,
  // Calendar as CalendarIcon,
  ChevronDown,
  LayoutDashboard,
  // Clock,
  Activity,
  Users,
} from "lucide-react";

const TABS = [
  {
    id: "employee",
    label: "Tracking",
    icon: <Users size={18} />,
    component: EmployeeTrackingReport,
    description: "Assignments & Active Days",
  },
  {
    id: "workload",
    label: "Workload",
    icon: <LayoutDashboard size={18} />,
    component: WorkloadReport,
    description: "Capacity & distribution",
  },
  {
    id: "activity",
    label: "Activity",
    icon: <Activity size={18} />,
    component: ActivityReport,
    description: "Interactions & files",
  },
];

const ReportsPage = (): React.JSX.Element => {
  const { reportType } = useParams<{ reportType: string }>();
  const activeTab = reportType || "employee";
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

  const user = JSON.parse(localStorage.getItem("flowdesk_user") || "{}");

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
    try {
      const response = await api.get("/reports/export", {
        params: { type, reportType: activeTab, ...filters },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      const extension = type === "excel" ? "xlsx" : type;
      link.setAttribute("download", `report-${activeTab}-${Date.now()}.${extension}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err) {
      console.error(err);
      alert("Export failed. Please try again.");
    } finally {
      setIsExportOpen(false);
    }
  };

  const handleDrilldown = (title: string, data: any[]) => {
    setDrilldown({ open: true, title, data });
  };

  const activeTabData = TABS.find((t) => t.id === activeTab);
  const ActiveComponent = activeTabData?.component || EmployeeTrackingReport;

  return (
    <div className="min-h-screen bg-(--color-bg) pb-20">
      {/* Page Header */}
      <div className="bg-surface border-b border-border top-0 z-30 card rounded-2xl px-4 sm:px-8 lg:px-16 py-6 sm:py-10">
        <div className="max-w-350 mx-auto flex flex-col md:flex-row md:items-center justify-between gap-8" style={{
          padding: "20px"
        }}>
          <div>
            <h1 className="text-xl sm:text-3xl font-black text-text tracking-tight flex items-center gap-4">
              <div className="">
                {activeTabData?.icon
                  ? React.cloneElement(activeTabData.icon as React.ReactElement)
                  : <BarChart3 className="text-primary" size={28} />
                }
              </div>
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
                className="btn btn-primary h-12 px-6 gap-3 shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all font-bold text-sm"
              >
                <Download size={18} />
                <span>Export Report</span>
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
                  <div className="absolute right-0 mt-4 w-60 bg-indigo-400 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-50 animate-fade-in p-2.5 backdrop-blur-xl bg-surface/95">
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


        {/* Filters Section */}
        <div className="" style={{
          marginBottom: "20px",
        }} >
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
