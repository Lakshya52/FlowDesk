import * as React from "react";
import { AlertTriangle, RefreshCw, Inbox } from "lucide-react";

export const ReportError = ({ onRetry, message }: { onRetry: () => void; message?: string }) => (
    <div className="card p-16 flex flex-col items-center justify-center text-center" style={{ marginBottom: "20px" }}>
        <div className="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center text-danger mb-5">
            <AlertTriangle size={26} />
        </div>
        <h3 className="text-lg font-bold text-text">Couldn't load this report</h3>
        <p className="text-sm text-text-secondary max-w-sm mt-2">
            {message || "Something went wrong while generating the report. Your data is safe — try again."}
        </p>
        <button onClick={onRetry} className="btn btn-primary mt-6 gap-2 px-6">
            <RefreshCw size={15} />
            Retry
        </button>
    </div>
);

export const ReportEmpty = ({ title = "No data found", subtitle }: { title?: string; subtitle?: string }) => (
    <div className="card p-16 flex flex-col items-center justify-center text-center opacity-70" style={{ marginBottom: "20px" }}>
        <div className="w-14 h-14 rounded-2xl bg-surface-hover flex items-center justify-center text-text-tertiary mb-5">
            <Inbox size={26} />
        </div>
        <h3 className="text-lg font-bold text-text">{title}</h3>
        {subtitle && <p className="text-sm text-text-secondary max-w-sm mt-2">{subtitle}</p>}
    </div>
);

/** Horizontal bar used across reports — pure CSS, theme-aware. */
export const MiniBar = ({ pct, color }: { pct: number; color: string }) => (
    <div className="w-full h-1.5 bg-surface-hover rounded-full overflow-hidden border border-border">
        <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color }}
        />
    </div>
);

interface StatCardProps {
    label: string;
    value: React.ReactNode;
    sub?: string;
    icon: React.ReactNode;
    color: string;
}

export const StatCard = ({ label, value, sub, icon, color }: StatCardProps) => (
    <div className="card p-6 flex flex-col justify-between hover:shadow-lg transition-all group border-border/60">
        <div className="flex items-start justify-between">
            <span className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider mt-1 text-left">{label}</span>
            <div className="p-3 rounded-xl bg-surface-hover group-hover:bg-primary-light transition-colors duration-300" style={{ color }}>
                {icon}
            </div>
        </div>
        <div className="mt-4">
            <h3 className="text-3xl font-bold text-text tracking-tight">{value}</h3>
            {sub && <p className="text-xs text-text-tertiary mt-1 font-medium">{sub}</p>}
        </div>
    </div>
);

/** Standard chart tooltip styling for recharts. */
export const chartTooltipStyle: React.CSSProperties = {
    backgroundColor: "var(--color-surface)",
    borderRadius: "12px",
    border: "1px solid var(--color-border)",
    boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.12))",
    padding: "12px",
    fontSize: "13px",
};

export const axisTick = { fontSize: 11, fontWeight: 600, fill: "var(--color-text-tertiary)" };
