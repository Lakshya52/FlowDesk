"use client";
import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import packageJson from "../../../package.json";
import { useChatStore } from "../../store/chatStore";
import { useAuthStore } from "../../store/authStore";
import {
	LayoutDashboard,
	FolderKanban,
	// CheckSquare,
	CalendarDays,
	BarChart3,
	// FileText,
	Settings,
	// Zap,
	Users,
	// Menu,
	// ChevronLeft,
	ChevronDown,
	// ChevronRight
	Building2,
	Shapes,
	Mail,
	MessageSquare,
	PanelRightClose,
	PanelLeftClose,
	X,
	Headset,
	PanelLeftOpen,
	HardDrive,
	// ScrollText,
} from "lucide-react";

interface SidebarProps {
	isOpen: boolean;
	toggleSidebar: () => void;
	width?: number;
}

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

type NavItem = NavLinkItem | NavBreakItem;

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
			// { to: "/crm/plan", label: "Plan" },
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
			{ to: "/assignments", label: "Porjects" },
			{ to: "/tasks", label: "Kanban View" },
			{ to: "/boards", label: "Sprints" },
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
	// { to: "/settings", icon: Settings, label: "Settings" },
];

export const getFirstAllowedRoute = (user: any): string => {
	if (!user) return "/dashboard";
	if (user.role === "admin") return "/dashboard";

	const allowed = user.permissions?.allowedTabs ?? navItems.filter((n): n is NavLinkItem => !n.break).map((n) => n.to);

	// Check parent items first
	const firstParentMatch = navItems.find((item): item is NavLinkItem => !item.break && allowed.includes(item.to));
	if (firstParentMatch) return firstParentMatch.to;

	// If no parent matches, check subItems (e.g. /tasks)
	for (const item of navItems) {
		if (!item.break && item.subItems) {
			const firstSubMatch = item.subItems.find((sub) =>
				allowed.includes(sub.to),
			);
			if (firstSubMatch) return firstSubMatch.to;
		}
	}

	return "/dashboard";
};

const Sidebar: React.FC<SidebarProps> = ({
	isOpen,
	toggleSidebar,
	width = 260,
}) => {
	const { totalUnreadCount } = useChatStore();
	const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(
		{},
	);
	const { user } = useAuthStore();
	const location = useLocation();

	const visibleNavItems =
		user?.role === "admin"
			? navItems
            : navItems.filter((item) => {
                    const allowedTabs =
                        user?.permissions?.allowedTabs ??
                        navItems.filter((n): n is NavLinkItem => !n.break).map((n) => n.to);
                    if (item.break) return true;
                    if (allowedTabs.includes(item.to)) return true;
                    if (item.subItems && item.subItems.some(sub => allowedTabs.includes(sub.to))) return true;
                    return false;
                });

	const toggleExpand = (to: string) => {
		setExpandedItems((prev) => ({
			...prev,
			[to]: !prev[to],
		}));
	};

	return (
		<aside
			style={{
				width: isOpen ? `${width}px` : "80px",
				transition: "width 0s linear", // Remove transition for smooth dragging
				background: "var(--color-surface)",
				borderRight: "1px solid var(--color-border)",
				display: "flex",
				flexDirection: "column",
				height: "100vh",
				flexShrink: 0,
				position: "relative",
			}}
		>
			{/* Logo */}
			<div
				style={{
					padding: isOpen ? "20px 24px" : "20px 0",
					display: "flex",
					alignItems: "center",
					justifyContent: isOpen ? "flex-start" : "center",
					gap: "10px",
					borderBottom: "1px solid var(--color-border)",
				}}
			>
				<div
					className={`${isOpen ? " w-full" : ""} flex item-center justify-between `}
				>
					<div
						className={`${isOpen ? "" : ""} flex items-center justify-center gap-2`}
					>
						<div
							style={{
								width: 32,
								height: 32,
								borderRadius: 8,
								// background: 'linear-gradient(135deg, var(--color-primary), #a78bfa)',
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								flexShrink: 0,
							}}
						>
							<div className="group flex items-cente justify-center">
								<img
									onClick={toggleSidebar}
									src="/icon.ico"
									alt="FlowDesk logo"
									className={`rounded-lg ${isOpen ? "" : "group-hover:hidden"}`}
								/>
								{/* the icon of opening */}
								<PanelLeftOpen
									onClick={toggleSidebar}
									size={20}
									style={{
										background:
											"var(--color-surface-hover)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										cursor: "pointer",
										color: "var(--color-text-secondary)",
									}}
								/>
							</div>

							{/* <Zap size={18} color="white" /> */}
						</div>
						{isOpen && (
							<span
								style={{
									fontSize: "1.125rem",
									fontWeight: 700,
									letterSpacing: "-0.02em",
									color: "var(--color-text)",
									whiteSpace: "nowrap",
								}}
							>
								FlowDesk
							</span>
						)}
						{/* {!isOpen && (
							<span
								style={{
									fontSize: "1.125rem",
									fontWeight: 700,
									letterSpacing: "-0.02em",
									color: "var(--color-text)",
									whiteSpace: "nowrap",
								}}
							>
								Flow
							</span>
						)} */}
					</div>
					{isOpen && (
						<button
							onClick={toggleSidebar}
							className={`${isOpen ? "" : "hidden"}`}
							style={{
								background: "var(--color-surface-hover)",
								border: "none",
								borderRadius: "8px",
								width: 32,
								height: 32,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								cursor: "pointer",
								color: "var(--color-text-secondary)",
							}}
						>
							{window.innerWidth < 768 ? (
								<X size={16} />
							) : isOpen ? (
								<PanelLeftClose size={16} />
							) : (
								<PanelRightClose size={16} />
							)}
						</button>
					)}
				</div>
			</div>

			{/* Toggle/Close Button */}
			{!isOpen && (
				<div
					style={{
						display: "flex",
						justifyContent: isOpen ? "flex-end" : "center",
						padding: isOpen ? "12px 16px 0" : "12px 0 0",
					}}
				>
					{/* <button
						onClick={toggleSidebar}
						style={{
							background: "var(--color-surface-hover)",
							border: "none",
							borderRadius: "8px",
							width: 32,
							height: 32,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							cursor: "pointer",
							color: "var(--color-text-secondary)",
						}}
					>
						{window.innerWidth < 768 ? (
							<X size={16} />
						) : isOpen ? (
							<PanelLeftClose size={16} />
						) : (
							<PanelRightClose size={16} />
						)}
					</button> */}
				</div>
			)}

			{/* Navigation */}
			<nav
				style={{
					flex: 1,
					padding: isOpen ? "12px" : "12px 8px",
					overflowY: "auto",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "8px",
					}}
				>
					{visibleNavItems.map((item) => {
						if (item.break) {
							return (
								<div
									key={Math.random()}
									style={{
										height: "1px",
										background: "var(--color-border)",
										margin: isOpen ? "8px 0" : "8px 4px",
									}}
								/>
							);
						}

						const hasSubItems =
							!!item.subItems && item.subItems.length > 0;
						const isActiveParent =
							hasSubItems &&
							item.subItems!.some(
								(sub) =>
									location.pathname === sub.to ||
									location.pathname.startsWith(sub.to + "/"),
							);
						const isExpanded =
							expandedItems[item.to] ?? isActiveParent;

						return (
							<div
								key={item.to}
								style={{
									display: "flex",
									flexDirection: "column",
								}}
							>
								{hasSubItems ? (
									// Parent with subItems - clickable to toggle
									<div
										onClick={() => toggleExpand(item.to)}
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: isOpen
												? "flex-start"
												: "center",
											gap: "12px",
											padding: isOpen
												? "10px 12px"
												: "12px",
											borderRadius: "8px",
											fontSize: "0.875rem",
											fontWeight: isActiveParent
												? 600
												: 400,
											color: isActiveParent
												? "var(--color-primary)"
												: "var(--color-text-secondary)",
											background: isActiveParent
												? "var(--color-primary-light)"
												: "transparent",
											cursor: "pointer",
											transition: "all 0.15s ease",
											textDecoration: "none",
										}}
										onMouseEnter={(e) => {
											if (!isActiveParent) {
												e.currentTarget.style.background =
													"var(--color-surface-hover)";
											}
										}}
										onMouseLeave={(e) => {
											if (!isActiveParent) {
												e.currentTarget.style.background =
													"transparent";
											}
										}}
									>
										<item.icon
											size={20}
											style={{ flexShrink: 0 }}
										/>
										{isOpen && (
											<>
												<span
													style={{
														whiteSpace: "nowrap",
														flex: 1,
													}}
												>
													{item.label}
												</span>
												<ChevronDown
													size={16}
													style={{
														transform: isExpanded
															? "rotate(0deg)"
															: "rotate(-90deg)",
														transition:
															"transform 0.2s ease",
														flexShrink: 0,
													}}
												/>
											</>
										)}
									</div>
								) : (
									<NavLink
										to={item.to}
										end={item.to === "/dashboard"}
										style={({ isActive }) => ({
											display: "flex",
											alignItems: "center",
											justifyContent: isOpen
												? "flex-start"
												: "center",
											gap: "12px",
											padding: isOpen
												? "10px 12px"
												: "12px",
											borderRadius: "8px",
											fontSize: "0.875rem",
											fontWeight: isActive ? 600 : 400,
											color: isActive
												? "var(--color-primary)"
												: "var(--color-text-secondary)",
											background: isActive
												? "var(--color-primary-light)"
												: "transparent",
											textDecoration: "none",
											transition: "all 0.15s ease",
										})}
										onMouseEnter={(e) => {
											const el = e.currentTarget;
											if (
												!el.classList.contains("active")
											) {
												el.style.background =
													"var(--color-surface-hover)";
											}
										}}
										onMouseLeave={(e) => {
											const el = e.currentTarget;
											if (
												!el.classList.contains("active")
											) {
												el.style.background =
													"transparent";
											}
										}}
									>
										<div
											style={{
												position: "relative",
												display: "flex",
												alignItems: "center",
											}}
										>
											<item.icon
												size={20}
												style={{ flexShrink: 0 }}
											/>
											{item.to === "/chat" &&
												totalUnreadCount > 0 &&
												!isOpen && (
													<span
														style={{
															position:
																"absolute",
															top: "-4px",
															right: "-4px",
															width: "8px",
															height: "8px",
															borderRadius: "50%",
															background:
																"var(--color-danger)",
															boxShadow:
																"0 0 0 2px var(--color-surface)",
														}}
													/>
												)}
										</div>
										{isOpen && (
											<span
												style={{ whiteSpace: "nowrap" }}
											>
												{item.label}
											</span>
										)}
										{item.to === "/chat" &&
											totalUnreadCount > 0 &&
											isOpen && (
												<span
													style={{
														marginLeft: "auto",
														background:
															"var(--color-danger)",
														color: "white",
														fontSize: "0.7rem",
														fontWeight: 700,
														minWidth: "18px",
														height: "18px",
														borderRadius: "9px",
														display: "flex",
														alignItems: "center",
														justifyContent:
															"center",
														padding: "0 5px",
														lineHeight: 1,
													}}
												>
													{totalUnreadCount}
												</span>
											)}
										{item.new && isOpen && (
											<span
												style={{
													fontSize: "0.6rem",
													background: "#22c55e",
													color: "white",
													padding: "2px 6px",
													borderRadius: 10,
													fontWeight: 700,
													textTransform: "uppercase",
													lineHeight: 1,
												}}
											>
												New&nbsp;Features
											</span>
										)}
									</NavLink>
								)}

								{item.subItems && isOpen && isExpanded && (
									<div
										style={{
											display: "flex",
											flexDirection: "column",
											marginLeft: "21px",
											marginTop: "4px",
											marginBottom: "4px",
										}}
									>
										{item.subItems.filter(sub => !sub.adminOnly || user?.role === "admin" || user?.role === "manager").map((sub, idx, arr) => {
											const isLast =
												idx ===
												arr.length - 1;
											const hasNested =
												!!sub.subItems && sub.subItems.length > 0;
											const isNestedExpanded =
												expandedItems[sub.to] ?? (location.pathname.startsWith(sub.to + "/") || location.pathname === sub.to);
											return (
												<div key={sub.to} style={{ display: "flex", flexDirection: "column" }}>
													<div
														style={{
															position: "relative",
															display: "flex",
															alignItems: "center",
														}}
													>
														<div
															style={{
																position: "absolute",
																left: 0,
																top: 0,
																bottom: isLast && !(hasNested && isNestedExpanded)
																	? "50%"
																	: "-4px",
																borderLeft: "2px solid var(--color-border)",
																borderBottom: isLast && !(hasNested && isNestedExpanded)
																	? "2px solid var(--color-border)"
																	: "none",
																borderBottomLeftRadius: isLast && !(hasNested && isNestedExpanded) ? "8px" : "0",
																width: isLast && !(hasNested && isNestedExpanded) ? "20px" : "0",
															}}
														/>
														{!isLast && (
															<div
																style={{
																	position: "absolute",
																	left: 0,
																	top: "50%",
																	width: "20px",
																	borderTop: "2px solid var(--color-border)",
																}}
															/>
														)}

														{hasNested ? (
															<div
																onClick={() => toggleExpand(sub.to)}
																style={{
																	marginLeft: "24px",
																	padding: "8px 12px",
																	borderRadius: "6px",
																	fontSize: "0.8125rem",
																	fontWeight: 500,
																	color: "var(--color-text-secondary)",
																	cursor: "pointer",
																	width: "100%",
																	display: "flex",
																	alignItems: "center",
																	gap: "6px",
																}}
															>
																<span style={{ flex: 1 }}>{sub.label}</span>
																<ChevronDown
																	size={12}
																	style={{
																		transform: isNestedExpanded ? "rotate(0deg)" : "rotate(-90deg)",
																		transition: "transform 0.2s ease",
																	}}
																/>
															</div>
														) : (
															<NavLink
																to={sub.to}
																style={({ isActive }) => ({
																	marginLeft: "24px",
																	padding: "8px 12px",
																	borderRadius: "6px",
																	fontSize: "0.8125rem",
																	fontWeight: isActive ? 600 : 400,
																	color: isActive ? "var(--color-primary)" : "var(--color-text-secondary)",
																	textDecoration: "none",
																	width: "100%",
																	transition: "all 0.15s ease",
																})}
																onMouseEnter={(e) => { if (!e.currentTarget.classList.contains("active")) e.currentTarget.style.color = "var(--color-text)"; }}
																onMouseLeave={(e) => { if (!e.currentTarget.classList.contains("active")) e.currentTarget.style.color = "var(--color-text-secondary)"; }}
															>
																{sub.label}
															</NavLink>
														)}
													</div>

													{hasNested && isNestedExpanded && (
														<div style={{ marginLeft: "44px", display: "flex", flexDirection: "column" }}>
															{sub.subItems!.filter(n => !n.adminOnly || user?.role === "admin" || user?.role === "manager").map((nested, nidx, narr) => {
																const isNestedLast = nidx === narr.length - 1;
																return (
																	<div key={nested.to} style={{ position: "relative", display: "flex", alignItems: "center" }}>
																		<div style={{
																			position: "absolute",
																			left: 0, top: 0,
																			bottom: isNestedLast ? "50%" : "-4px",
																			borderLeft: "2px solid var(--color-border)",
																			borderBottom: isNestedLast ? "2px solid var(--color-border)" : "none",
																			borderBottomLeftRadius: isNestedLast ? "8px" : "0",
																			width: isNestedLast ? "20px" : "0",
																		}} />
																		{!isNestedLast && (
																			<div style={{ position: "absolute", left: 0, top: "50%", width: "20px", borderTop: "2px solid var(--color-border)" }} />
																		)}
																		<NavLink
																			to={nested.to}
																			style={({ isActive }) => ({
																				marginLeft: "24px",
																				padding: "7px 10px",
																				borderRadius: "6px",
																				fontSize: "0.75rem",
																				fontWeight: isActive ? 600 : 400,
																				color: isActive ? "var(--color-primary)" : "var(--color-text-tertiary)",
																				textDecoration: "none",
																				width: "100%",
																			})}
																		>
																			{nested.label}
																		</NavLink>
																	</div>
																);
															})}
														</div>
													)}
												</div>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</nav>

			{/* Footer */}
			{isOpen && (
				<div
					style={{
						padding: "16px",
						borderTop: "1px solid var(--color-border)",
						fontSize: "0.75rem",
						color: "var(--color-text-tertiary)",
						textAlign: "center",
						whiteSpace: "nowrap",
					}}
				>
					FlowDesk v{packageJson.version}
				</div>
			)}
		</aside>
	);
};

export default Sidebar;
