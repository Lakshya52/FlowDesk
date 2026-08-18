import {
	LayoutDashboard,
	FolderKanban,
	CalendarDays,
	BarChart3,
	Settings,
	Users,
	Building2,
	Shapes,
	Mail,
	MessageSquare,
	Headset,
	HardDrive,
} from "lucide-react";
import type { User } from "@/shared/types";

export interface NavLinkItem {
	break?: false;
	to: string;
	icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
	label: string;
	subItems?: SubNavItem[];
	new?: boolean;
}

export interface SubNavItem {
	to: string;
	label: string;
	subItems?: SubNavItem[];
	adminOnly?: boolean;
}

interface NavBreakItem {
	break: true;
}

export type NavItem = NavLinkItem | NavBreakItem;

export const navItems: NavItem[] = [
	{ to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
	{
		to: "/crm",
		icon: Headset,
		label: "CRM",
		subItems: [
			{ to: "/crm/dashboard", label: "Overview" },
			{ to: "/crm/campaigns", label: "Campaigns" },
			{ to: "/crm/dial", label: "Dial Queue" },
			{ to: "/crm/schedule", label: "Schedule" },
			{ to: "/crm/summary", label: "Summary" },
			{ to: "/crm/logs", label: "Logs" },
			{ to: "/crm/field-visits", label: "Field Visits" },
		],
	},
	{ break: true },
	{
		to: "/assignments",
		icon: FolderKanban,
		label: "Productivity",
		subItems: [
			{ to: "/assignments", label: "Projects" },
			{ to: "/tasks", label: "Kanban View" },
			{ to: "/boards", label: "Sprint Boards" },
		],
	},
	{ to: "/teams", icon: Users, label: "Our Teams" },
	{ to: "/canvas", icon: Shapes, label: "Canvas", new: false },
	{ to: "/calendar", icon: CalendarDays, label: "Calendar", new: false },
	{ break: true },
	{
		to: "/clients",
		icon: Building2,
		label: "Companies & Clients",
		new: false,
	},
	{ to: "/chat", icon: MessageSquare, label: "Chat" },
	{ to: "/bulk-email", icon: Mail, label: "Bulk Messaging", new: false },
	{
		to: "/reports",
		icon: BarChart3,
		label: "Reports",
		subItems: [
			{ to: "/reports/employee", label: "Tracking" },
			{ to: "/reports/workload", label: "Workload" },
			{ to: "/reports/activity", label: "User Activity" },
		],
	},
	{ break: true },
	{ to: "/backup", icon: HardDrive, label: "Backup" },
	{ to: "/settings", icon: Settings, label: "Settings" },
];

const allTopLevelRoutes = navItems
	.filter((n): n is NavLinkItem => !n.break)
	.map((n) => n.to);

export function getFirstAllowedRoute(user: Pick<User, 'role' | 'permissions'> | null): string {
	if (!user || user.role === "admin") return "/dashboard";

	const allowed = user.permissions?.allowedTabs ?? allTopLevelRoutes;

	const firstParentMatch = navItems.find(
		(item): item is NavLinkItem => !item.break && allowed.includes(item.to),
	);
	if (firstParentMatch) return firstParentMatch.to;

	for (const item of navItems) {
		if (!item.break && item.subItems) {
			const firstSubMatch = item.subItems.find((sub) => allowed.includes(sub.to));
			if (firstSubMatch) return firstSubMatch.to;
		}
	}

	return "/dashboard";
}
