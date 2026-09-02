import React, { useState, useEffect } from "react";
import {
	Search,
	MapPin,
	User,
	Building2,
	CheckCircle,
	LogIn,
	LogOut,
	X,
	MessageSquareText,
	CalendarDays,
	Loader2,
	MapPinned,
	ShieldAlert,
	Timer,
	DollarSign,
	ExternalLink,
	WifiOff,
	GalleryHorizontal,
	ChartNoAxesGantt,
	Plus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import FieldVisitCheckIn from "./FieldVisitCheckIn";

interface Location {
	type: string;
	coordinates: number[];
	address?: string;
}

interface Visit {
	_id: string;
	employeeId: {
		_id: string;
		name: string;
		email: string;
		avatar?: string;
		employeeId: string;
	};
	clientId: string;
	clientType: "company" | "lead";
	clientName: string;
	scheduledDate?: string;
	scheduledTime?: string;
	checkInTime?: string;
	checkOutTime?: string;
	checkInSelfie?: string;
	checkInLocation?: Location;
	checkOutLocation?: Location;
	status: "scheduled" | "checked_in" | "checked_out" | "cancelled";
	outcome?: "completed" | "rescheduled" | "no_contact" | "met_other";
	meetingNotes?: string;
	rescheduledDate?: string;
	rescheduledTime?: string;
	otherPersonName?: string;
	otherPersonContact?: string;
	otherPersonNotes?: string;
	otherPersonOutcome?: string;
	remarks?: string;
	remarksAddedAt?: string;
	geoFenceBreached?: boolean;
	geoFenceRadius?: number;
	trackingLost?: boolean;
	trackingStartedAt?: string;
	trackingEndedAt?: string;
	expenses?: any[];
	createdAt?: string;
}

interface Props {
	onAddRemarks: (id: string) => void;
	onCheckInComplete?: (visitId: string) => void;
	refreshKey?: number;
}

const STATUS_COLORS: Record<string, string> = {
	scheduled: "bg-(--color-primary-light) text-(--color-primary)",
	checked_in: "bg-(--color-success-light) text-(--color-success)",
	checked_out: "bg-(--color-surface-hover) text-(--color-text-secondary)",
	cancelled: "bg-(--color-danger-light) text-(--color-danger)",
};

const OUTCOME_COLORS: Record<string, string> = {
	completed: "bg-(--color-success-light) text-(--color-success)",
	rescheduled: "bg-(--color-warning-light) text-(--color-warning)",
	no_contact: "bg-(--color-danger-light) text-(--color-danger)",
	met_other: "bg-(--color-primary-light) text-(--color-primary-hover)",
};

const FieldVisitList: React.FC<Props> = ({
	onAddRemarks,
	onCheckInComplete,
	refreshKey,
}) => {
	const { user } = useAuthStore();
	const navigate = useNavigate();
	const currentUserId = user?._id;
	const isAdminOrManager = user?.role === "admin" || user?.role === "manager";
	const [visits, setVisits] = useState<Visit[]>([]);
	const [loading, setLoading] = useState(true);
	const [previewImage, setPreviewImage] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<string>("");
	const [outcomeFilter, setOutcomeFilter] = useState<string>("");
	const [viewMode, setViewMode] = useState<"card" | "timeline">("card");
	const [checkingInVisitId, setCheckingInVisitId] = useState<string | null>(
		null,
	);
	const [showSchedule, setShowSchedule] = useState(false);
	const [scheduleLeads, setScheduleLeads] = useState<any[]>([]);
	const [scheduleLeadSearch, setScheduleLeadSearch] = useState("");
	const [scheduleSelectedLead, setScheduleSelectedLead] = useState<any>(null);
	const [scheduleDate, setScheduleDate] = useState(
		new Date().toISOString().split("T")[0],
	);
	const [scheduleTime, setScheduleTime] = useState("10:00");
	const [scheduling, setScheduling] = useState(false);
	const [scheduleShowCreateLead, setScheduleShowCreateLead] = useState(false);
	const [scheduleCampaigns, setScheduleCampaigns] = useState<any[]>([]);
	const [scheduleNewLead, setScheduleNewLead] = useState({
		name: "",
		phone: "",
		companyName: "",
		city: "",
		state: "",
		addressLine: "",
		campaignId: "",
	});
	const [scheduleCreatingLead, setScheduleCreatingLead] = useState(false);

	const fetchVisits = async () => {
		try {
			setLoading(true);
			const params: any = { limit: 100000 };
			if (statusFilter) params.status = statusFilter;
			if (outcomeFilter) params.outcome = outcomeFilter;
			const res = await api.get("/field-visits", { params });
			setVisits(res.data.visits || []);
		} catch {
			// silent
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchVisits();
	}, [statusFilter, outcomeFilter, refreshKey]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (checkingInVisitId) setCheckingInVisitId(null);
				else if (previewImage) setPreviewImage(null);
				else if (showSchedule) {
					setShowSchedule(false);
					setScheduleSelectedLead(null);
				}
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [checkingInVisitId, previewImage, showSchedule]);

	const [checkingOut, setCheckingOut] = useState<string | null>(null);

	const handleQuickCheckOut = async (visitId: string) => {
		setCheckingOut(visitId);
		try {
			await api.post(`/field-visits/${visitId}/check-out`, {});
			toast.success("Checked out successfully");
			fetchVisits();
		} catch (err: any) {
			toast.error(err.response?.data?.message || "Check-out failed");
		} finally {
			setCheckingOut(null);
		}
	};

	const handleCheckinComplete = (newVisitId?: string) => {
		setCheckingInVisitId(null);
		fetchVisits();
		if (newVisitId && onCheckInComplete) {
			onCheckInComplete(newVisitId);
		}
	};

	const handleSchedule = async () => {
		if (!scheduleSelectedLead) return;
		setScheduling(true);
		try {
			await api.post("/field-visits", {
				clientId: scheduleSelectedLead._id,
				clientType: "lead",
				clientName:
					scheduleSelectedLead.name ||
					scheduleSelectedLead.companyName ||
					"",
				scheduledDate: new Date(scheduleDate).toISOString(),
				scheduledTime: scheduleTime,
			});
			toast.success("Visit scheduled");
			setShowSchedule(false);
			setScheduleSelectedLead(null);
			fetchVisits();
		} catch (err: any) {
			toast.error(err.response?.data?.message || "Failed to schedule");
		} finally {
			setScheduling(false);
		}
	};

	const handleCreateScheduleLead = async () => {
		if (!scheduleNewLead.name.trim()) {
			toast.error("Name is required");
			return;
		}
		setScheduleCreatingLead(true);
		try {
			const res = await api.post("/leads", {
				name: scheduleNewLead.name.trim(),
				phone: scheduleNewLead.phone.trim(),
				companyName: scheduleNewLead.companyName.trim(),
				city: scheduleNewLead.city.trim(),
				state: scheduleNewLead.state.trim(),
				addressLine: scheduleNewLead.addressLine.trim(),
				campaignId: scheduleNewLead.campaignId,
				source: "field_visit",
			});
			const created = res.data.lead;
			setScheduleSelectedLead({
				_id: created._id,
				name: created.name,
				companyName: created.companyName,
				city: created.city,
				state: created.state,
				phone: created.phone,
			});
			setScheduleShowCreateLead(false);
			toast.success("Lead created successfully");
		} catch (err: any) {
			toast.error(err.response?.data?.message || "Failed to create lead");
		} finally {
			setScheduleCreatingLead(false);
		}
	};

	const filtered = visits.filter((v) => {
		if (!search) return true;
		const q = search.toLowerCase();
		return (
			v.clientName?.toLowerCase().includes(q) ||
			v.employeeId?.name?.toLowerCase().includes(q) ||
			v.meetingNotes?.toLowerCase().includes(q)
		);
	});

	const formatTime = (t?: string) => {
		if (!t) return "";
		return new Date(t).toLocaleString("en-IN", {
			day: "numeric",
			month: "short",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	return (
		<>
			<div className="space-y-4">
				<div className="flex flex-col sm:flex-row gap-3">
					<div className="relative flex-1 min-w-0">
						<Search
							size={16}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-tertiary)"
						/>
						<input
							type="text"
							placeholder="Search visits..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="w-full pl-9 pr-3 py-2 border border-(--color-border) rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
						/>
					</div>
					<div className="flex gap-2 flex-wrap">
						<select
							value={statusFilter}
							onChange={(e) => setStatusFilter(e.target.value)}
							className="px-3 py-2 border border-(--color-border) rounded-lg text-sm min-w-32.5 cursor-pointer"
						>
							<option value="">All Status</option>
							<option value="scheduled">Scheduled</option>
							<option value="checked_in">Checked In</option>
							<option value="checked_out">Checked Out</option>
							<option value="cancelled">Cancelled</option>
						</select>
						<select
							value={outcomeFilter}
							onChange={(e) => setOutcomeFilter(e.target.value)}
							className="px-3 py-2 border border-(--color-border) rounded-lg text-sm min-w-35 cursor-pointer"
						>
							<option value="">All Outcomes</option>
							<option value="completed">Completed</option>
							<option value="rescheduled">Rescheduled</option>
							<option value="no_contact">No Contact</option>
							<option value="met_other">Met Other</option>
						</select>
						<div className="relative flex items-center bg-(--color-surface-hover) rounded-lg p-1 border border-(--color-border)">
							<div
								className={`absolute top-1 bottom-1 left-1 w-9 bg-(--color-surface) rounded-md shadow-sm border border-(--color-border) transition-transform duration-200 ease-out ${
									viewMode === "timeline"
										? "translate-x-9"
										: "translate-x-0"
								}`}
							/>
							<button
								onClick={() => setViewMode("card")}
								className={`relative z-10 flex items-center justify-center w-9 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
									viewMode === "card"
										? "text-(--color-text)"
										: "text-(--color-text-tertiary) hover:text-(--color-text-secondary)"
								}`}
								title="Card view"
							>
								<GalleryHorizontal size={16} />
							</button>
							<button
								onClick={() => setViewMode("timeline")}
								className={`relative z-10 flex items-center justify-center w-9 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
									viewMode === "timeline"
										? "text-(--color-text)"
										: "text-(--color-text-tertiary) hover:text-(--color-text-secondary)"
								}`}
								title="Timeline view"
							>
								<ChartNoAxesGantt size={16} />
							</button>
						</div>
						<button
							onClick={() => {
								setScheduleSelectedLead(null);
								setScheduleLeadSearch("");
								setScheduleDate(
									new Date().toISOString().split("T")[0],
								);
								setScheduleTime("10:00");
								setShowSchedule(true);
								api.get("/leads", { params: { limit: 100000 } })
									.then((r) =>
										setScheduleLeads(r.data.leads || []),
									)
									.catch(() => {});
							}}
							className="btn btn-primary flex items-center cursor-pointer justify-center gap-1.5 px-4 py-2 bg-(--color-surface) border border-(--color-primary-light) text-(--color-primary) text-sm font-medium rounded-lg hover:bg-(--color-primary-light) transition-colors min-w-25"
						>
							<CalendarDays size={16} />
							Schedule
						</button>
					</div>
				</div>

				{loading ? (
					<div className="text-center py-8 text-(--color-text-tertiary)">
						Loading visits...
					</div>
				) : filtered.length === 0 ? (
					<div className="text-center py-8 text-(--color-text-tertiary)">
						No field visits found
					</div>
				) : viewMode === "timeline" ? (
					<div className="space-y-0">
						{(() => {
							const grouped: Record<string, Visit[]> = {};
							filtered.forEach((v) => {
								const d = new Date(
									v.createdAt || Date.now(),
								).toLocaleDateString("en-IN", {
									day: "numeric",
									month: "long",
									year: "numeric",
								});
								if (!grouped[d]) grouped[d] = [];
								grouped[d].push(v);
							});
							return Object.entries(grouped).map(
								([dateLabel, visits]) => (
									<div key={dateLabel}>
										<div className="sticky top-0 z-10 bg-(--color-surface-hover)/90 backdrop-blur-sm px-4 py-2 border-b border-(--color-border)">
											<span className="text-sm font-semibold text-(--color-text-secondary)">
												{dateLabel}
											</span>
											<span className="text-xs text-(--color-text-tertiary) ml-2">
												{visits.length} visit
												{visits.length > 1 ? "s" : ""}
											</span>
										</div>
										{visits.map((visit, idx) => {
											const dotColor =
												visit.status === "checked_in"
													? "bg-(--color-success)"
													: visit.status ===
														  "checked_out"
														? "bg-(--color-primary)"
														: visit.status ===
															  "cancelled"
															? "bg-(--color-primary)"
															: "bg-(--color-primary)";
											const showLine =
												idx < visits.length - 1;
											return (
												<div
													key={visit._id}
													className="relative flex gap-4 px-4 py-3 hover:bg-(--color-surface-hover) transition-colors"
												>
													<div className="flex flex-col items-center shrink-0 pt-0.5">
														<div
															className={`w-3 h-3 rounded-full ${dotColor} ring-2 ring-white`}
														/>
														{showLine && (
															<div className="w-0.5 flex-1 bg-(--color-primary-light) mt-1" />
														)}
													</div>
													<div className="flex-1 min-w-0 pb-3 border-b border-(--color-border)">
														<div className="flex items-center gap-2 flex-wrap">
															<span className="text-xs text-(--color-text-tertiary) shrink-0">
																{new Date(
																	visit.createdAt ||
																		Date.now(),
																).toLocaleTimeString(
																	"en-IN",
																	{
																		hour: "2-digit",
																		minute: "2-digit",
																	},
																)}
															</span>
															<span
																className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[visit.status] || ""}`}
															>
																{visit.status.replace(
																	"_",
																	" ",
																)}
															</span>
															{visit.outcome && (
																<span
																	className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${OUTCOME_COLORS[visit.outcome] || ""}`}
																>
																	{visit.outcome ===
																	"no_contact"
																		? "No Contact"
																		: visit.outcome ===
																			  "met_other"
																			? "Met Other"
																			: visit.outcome.replace(
																					"_",
																					" ",
																				)}
																</span>
															)}
															{visit.status ===
																"checked_out" &&
																!visit.remarks && (
																	<span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-(--color-warning-light) text-(--color-warning)">
																		Remarks
																		pending
																	</span>
																)}
														</div>
														<div className="flex items-center gap-2 mt-1">
															<Building2
																size={13}
																className="text-(--color-text-tertiary) shrink-0"
															/>
															<button
																onClick={() =>
																	navigate(
																		`/crm/dial?leadId=${visit.clientId}`,
																	)
																}
																className="text-sm font-medium text-(--color-primary) hover:text-(--color-primary) hover:underline truncate"
															>
																{visit.clientName ||
																	visit.clientType}
															</button>
														</div>
														<div className="flex items-center gap-2 mt-0.5 text-xs text-(--color-text-tertiary)">
															<User
																size={11}
																className="text-(--color-text-tertiary) shrink-0"
															/>
															<span>
																{visit
																	.employeeId
																	?.name ||
																	"Unknown"}
															</span>
															{visit.checkInTime && (
																<>
																	<span className="text-(--color-text-tertiary)">
																		|
																	</span>
																	<MapPin
																		size={
																			11
																		}
																		className="text-(--color-success) shrink-0"
																	/>
																	<span>
																		In:{" "}
																		{new Date(
																			visit.checkInTime,
																		).toLocaleTimeString(
																			"en-IN",
																			{
																				hour: "2-digit",
																				minute: "2-digit",
																			},
																		)}
																	</span>
																</>
															)}
															{visit.checkOutTime && (
																<>
																	<span className="text-(--color-text-tertiary)">
																		|
																	</span>
																	<CheckCircle
																		size={
																			11
																		}
																		className="text-(--color-primary) shrink-0"
																	/>
																	<span>
																		Out:{" "}
																		{new Date(
																			visit.checkOutTime,
																		).toLocaleTimeString(
																			"en-IN",
																			{
																				hour: "2-digit",
																				minute: "2-digit",
																			},
																		)}
																	</span>
																</>
															)}
														</div>
														{visit.meetingNotes && (
															<p className="text-xs text-(--color-text-tertiary) mt-1 line-clamp-1">
																{
																	visit.meetingNotes
																}
															</p>
														)}
														{visit.remarks && (
															<p className="text-xs text-(--color-text-tertiary) mt-1 line-clamp-1 italic">
																"{visit.remarks}
																"
															</p>
														)}
														<div className="flex gap-2 mt-2">
															{visit.employeeId
																?._id ===
																currentUserId &&
																visit.status ===
																	"scheduled" && (
																	<button
																		onClick={() =>
																			setCheckingInVisitId(
																				visit._id,
																			)
																		}
																		className="flex items-center gap-1 px-2.5 py-1 bg-(--color-primary) text-white text-[10px] font-medium rounded-md hover:bg-(--color-primary-hover)"
																	>
																		<LogIn
																			size={
																				11
																			}
																		/>{" "}
																		Check In
																	</button>
																)}
															{visit.employeeId
																?._id ===
																currentUserId &&
																visit.status ===
																	"checked_in" && (
																	<button
																		onClick={() =>
																			handleQuickCheckOut(
																				visit._id,
																			)
																		}
																		disabled={
																			checkingOut ===
																			visit._id
																		}
																		className="flex items-center gap-1 px-2.5 py-1 bg-(--color-warning) text-white text-[10px] font-medium rounded-md hover:bg-(--color-primary-hover) disabled:opacity-50"
																	>
																		{checkingOut ===
																		visit._id ? (
																			<Loader2
																				size={
																					11
																				}
																				className="animate-spin"
																			/>
																		) : (
																			<LogOut
																				size={
																					11
																				}
																			/>
																		)}{" "}
																		Check
																		Out
																	</button>
																)}
															{visit.employeeId
																?._id ===
																currentUserId &&
																visit.status ===
																	"checked_out" && (
																	<button
																		onClick={() =>
																			onAddRemarks(
																				visit._id,
																			)
																		}
																		className="flex items-center gap-1 px-2.5 py-1 bg-(--color-primary) text-white text-[10px] font-medium rounded-md hover:bg-(--color-surface-hover)"
																	>
																		<MessageSquareText
																			size={
																				11
																			}
																		/>{" "}
																		{visit.remarks
																			? "Edit"
																			: "Add Remarks"}
																	</button>
																)}
														</div>
													</div>
												</div>
											);
										})}
									</div>
								),
							);
						})()}
					</div>
				) : (
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{filtered.map((visit) => {
							return (
								<div
									key={visit._id}
									className="bg-(--color-surface) rounded-xl border border-(--color-border) p-4 hover:shadow-md transition-shadow"
								>
									<div className="flex items-start justify-between mb-3">
										<div className="flex items-center gap-2">
											{visit.employeeId?.avatar ? (
												<img
													src={`${import.meta.env.VITE_SOCKET_URL || "https://flowdesk-backend-l5tt.onrender.com"}${visit.employeeId.avatar}`}
													className="w-8 h-8 rounded-full object-cover"
												/>
											) : (
												<div className="w-8 h-8 rounded-full bg-(--color-primary-light) flex items-center justify-center">
													<User
														size={14}
														className="text-(--color-primary)"
													/>
												</div>
											)}
											<div>
												<p className="text-sm font-medium text-(--color-text)">
													{visit.employeeId?.name ||
														"Unknown"}
												</p>
												<p className="text-xs text-(--color-text-tertiary)">
													{
														visit.employeeId
															?.employeeId
													}
												</p>
											</div>
										</div>
										<span
											className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[visit.status] || ""}`}
										>
											{visit.status.replace("_", " ")}
										</span>
									</div>

									<div className="flex items-center gap-1.5 text-sm text-(--color-text-secondary) mb-1.5 cursor-pointer">
										<Building2
											size={14}
											className="text-(--color-text-tertiary)"
										/>
										<button
											onClick={() =>
												navigate(
													`/crm/dial?leadId=${visit.clientId}`,
												)
											}
											className="cursor-pointer text-(--color-primary) hover:text-(--color-primary) hover:underline text-left"
										>
											{visit.clientName ||
												visit.clientType}
										</button>
									</div>

									{(visit.scheduledDate ||
										visit.scheduledTime) &&
										!visit.checkInTime && (
											<div className="flex items-center gap-1.5 text-xs text-(--color-text-tertiary) mb-1">
												<CalendarDays size={12} />
												<span>
													Scheduled:{" "}
													{visit.scheduledDate
														? formatTime(
																visit.scheduledDate,
															)
														: ""}
													{visit.scheduledTime
														? ` at ${visit.scheduledTime}`
														: ""}
												</span>
											</div>
										)}

									{visit.createdAt && (
										<div className="flex items-center gap-1.5 text-xs text-(--color-text-tertiary) mb-1">
											<Timer size={12} />
											<span>
												Created:{" "}
												{formatTime(visit.createdAt)}
											</span>
										</div>
									)}

									{visit.checkInTime && (
										<div className="flex items-center gap-1.5 text-xs text-(--color-text-tertiary) mb-1">
											<MapPin
												size={12}
												className="text-(--color-success)"
											/>
											<span>
												Checked in:{" "}
												{formatTime(visit.checkInTime)}
											</span>
										</div>
									)}
									{visit.checkInLocation?.address && (
										<div className="ml-5 mb-1 flex items-start gap-1">
											<p className="text-[10px] text-(--color-text-tertiary) line-clamp-1 flex-1">
												{visit.checkInLocation.address}
											</p>
											{visit.checkInLocation?.coordinates
												?.length === 2 && (
												<a
													href={`https://www.google.com/maps?q=${visit.checkInLocation.coordinates[1]},${visit.checkInLocation.coordinates[0]}`}
													target="_blank"
													rel="noopener noreferrer"
													className="shrink-0 text-(--color-primary) hover:text-(--color-primary-hover)"
													title="View on map"
												>
													<ExternalLink size={12} />
												</a>
											)}
										</div>
									)}
									{visit.checkInSelfie && (
										<div className="mb-2 ml-5">
											<img
												src={`${import.meta.env.VITE_SOCKET_URL || "https://flowdesk-backend-l5tt.onrender.com"}/uploads/${visit.checkInSelfie}`}
												className="w-full max-h-40 rounded-lg object-cover border border-(--color-border) cursor-pointer hover:opacity-90 transition-opacity"
												onClick={() =>
													setPreviewImage(
														`${import.meta.env.VITE_SOCKET_URL || "https://flowdesk-backend-l5tt.onrender.com"}/uploads/${visit.checkInSelfie}`,
													)
												}
											/>
										</div>
									)}

									{visit.checkOutTime && (
										<div className="flex items-center gap-1.5 text-xs text-(--color-text-tertiary) mb-1">
											<CheckCircle
												size={12}
												className="text-(--color-primary)"
											/>
											<span>
												Checked out:{" "}
												{formatTime(visit.checkOutTime)}
											</span>
										</div>
									)}
									{visit.checkOutLocation?.address && (
										<div className="ml-5 mb-1 flex items-start gap-1">
											<p className="text-[10px] text-(--color-text-tertiary) line-clamp-1 flex-1">
												{visit.checkOutLocation.address}
											</p>
											{visit.checkOutLocation?.coordinates
												?.length === 2 && (
												<a
													href={`https://www.google.com/maps?q=${visit.checkOutLocation.coordinates[1]},${visit.checkOutLocation.coordinates[0]}`}
													target="_blank"
													rel="noopener noreferrer"
													className="shrink-0 text-(--color-primary) hover:text-(--color-primary-hover)"
													title="View on map"
												>
													<ExternalLink size={12} />
												</a>
											)}
										</div>
									)}

									{isAdminOrManager &&
										visit.trackingStartedAt && (
											<div className="flex items-center gap-1.5 text-xs text-(--color-text-tertiary) mb-1">
												<MapPinned
													size={12}
													className="text-(--color-primary-light)"
												/>
												<span>
													Tracking:{" "}
													{formatTime(
														visit.trackingStartedAt,
													)}
													{visit.trackingEndedAt
														? ` - ${formatTime(visit.trackingEndedAt)}`
														: " (active)"}
												</span>
											</div>
										)}

									{isAdminOrManager && visit.trackingLost && (
										<div className="flex items-center gap-1.5 text-xs font-semibold text-(--color-warning) mb-1">
											<WifiOff
												size={12}
												className="text-(--color-warning)"
											/>
											<span>
												Tracking lost — GPS/internet off
											</span>
										</div>
									)}

									{isAdminOrManager &&
										visit.geoFenceBreached !==
											undefined && (
											<div
												className={`flex items-center gap-1.5 text-xs mb-1 ${visit.geoFenceBreached ? "text-(--color-danger) font-semibold" : "text-(--color-text-tertiary)"}`}
											>
												<ShieldAlert
													size={12}
													className={
														visit.geoFenceBreached
															? "text-(--color-danger)"
															: ""
													}
												/>
												<span>
													Geo-fence:{" "}
													{visit.geoFenceBreached
														? "⚠ Breached"
														: `Within ${visit.geoFenceRadius || 100}m`}
												</span>
											</div>
										)}

									{visit.expenses &&
										visit.expenses.length > 0 && (
											<div className="flex items-center gap-1.5 text-xs text-(--color-text-tertiary) mb-1">
												<DollarSign
													size={12}
													className="text-(--color-success)"
												/>
												<span>
													{visit.expenses.length}{" "}
													expense
													{visit.expenses.length !== 1
														? "s"
														: ""}{" "}
													recorded
												</span>
											</div>
										)}

									{visit.meetingNotes && (
										<p className="text-xs text-(--color-text-tertiary) mt-2 line-clamp-2">
											{visit.meetingNotes}
										</p>
									)}

									{visit.remarks && (
										<div className="mt-2 p-2 bg-(--color-surface-hover) rounded-lg border border-(--color-border)">
											<div className="flex items-center gap-1 mb-1">
												<MessageSquareText
													size={11}
													className="text-(--color-text-tertiary)"
												/>
												<span className="text-[10px] text-(--color-text-tertiary) font-medium">
													Remarks
												</span>
											</div>
											<p className="text-xs text-(--color-text-secondary) line-clamp-2">
												{visit.remarks}
											</p>
										</div>
									)}

									{visit.outcome &&
										visit.status === "checked_out" && (
											<div className="mt-2">
												<span
													className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${OUTCOME_COLORS[visit.outcome] || ""}`}
												>
													{visit.outcome ===
													"no_contact"
														? "No Contact"
														: visit.outcome ===
															  "met_other"
															? "Met Other Person"
															: visit.outcome.replace(
																	"_",
																	" ",
																)}
												</span>
											</div>
										)}

									{visit.outcome === "rescheduled" &&
										(visit.rescheduledDate ||
											visit.rescheduledTime) && (
											<div className="flex items-center gap-1.5 text-xs text-(--color-warning) mt-1">
												<CalendarDays size={12} />
												<span>
													Rescheduled:{" "}
													{visit.rescheduledDate
														? new Date(
																visit.rescheduledDate,
															).toLocaleDateString(
																"en-IN",
															)
														: ""}
													{visit.rescheduledTime
														? ` at ${visit.rescheduledTime}`
														: ""}
												</span>
											</div>
										)}

									{visit.outcome === "met_other" &&
										visit.otherPersonName && (
											<div className="mt-1 p-2 bg-(--color-primary-light) rounded-lg border border-(--color-primary-light)">
												<p className="text-xs font-medium text-(--color-primary-hover)">
													Met with:{" "}
													{visit.otherPersonName}
												</p>
												{visit.otherPersonContact && (
													<p className="text-[10px] text-(--color-primary)">
														{
															visit.otherPersonContact
														}
													</p>
												)}
												{visit.otherPersonNotes && (
													<p className="text-[10px] text-(--color-primary) mt-0.5">
														{visit.otherPersonNotes}
													</p>
												)}
											</div>
										)}

									{visit.status === "checked_out" &&
										!visit.remarks && (
											<div className="flex items-center gap-1.5 text-xs font-semibold text-(--color-warning) mt-1">
												<MessageSquareText size={12} />
												<span>Remarks pending</span>
											</div>
										)}

									<div className="mt-3 pt-3 border-t border-(--color-border) flex gap-2">
										{visit.employeeId?._id ===
											currentUserId &&
											visit.status === "scheduled" && (
												<button
													onClick={() =>
														setCheckingInVisitId(
															visit._id,
														)
													}
													className=" cursor-pointer flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-(--color-primary) text-white text-xs font-medium rounded-lg hover:bg-(--color-primary-hover) transition-colors"
												>
													<LogIn size={13} /> Check In
												</button>
											)}
										{visit.employeeId?._id ===
											currentUserId &&
											visit.status === "checked_in" && (
												<button
													onClick={() =>
														handleQuickCheckOut(
															visit._id,
														)
													}
													disabled={
														checkingOut ===
														visit._id
													}
													className="cursor-pointer flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-(--color-warning) text-white text-xs font-medium rounded-lg hover:bg-(--color-primary-hover) disabled:opacity-50 transition-colors"
												>
													{checkingOut ===
													visit._id ? (
														<Loader2
															size={13}
															className="animate-spin"
														/>
													) : (
														<LogOut size={13} />
													)}
													{checkingOut === visit._id
														? "Checking out..."
														: "Check Out"}
												</button>
											)}
										{visit.employeeId?._id ===
											currentUserId &&
											visit.status === "checked_out" && (
												<button
													onClick={() =>
														onAddRemarks(visit._id)
													}
													className="cursor-pointer flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-(--color-primary) text-white text-xs font-medium rounded-lg hover:bg-(--color-surface-hover) transition-colors"
												>
													<MessageSquareText
														size={13}
													/>{" "}
													{visit.remarks
														? "Edit Remarks"
														: "Add Remarks"}
												</button>
											)}
										{visit.employeeId?._id !==
											currentUserId && (
											<span className="flex-1 text-center text-xs text-(--color-text-tertiary) py-1.5">
												Assigned to{" "}
												{visit.employeeId?.name}
											</span>
										)}
										{visit.status === "cancelled" &&
											visit.employeeId?._id ===
												currentUserId && (
												<span className="flex-1 text-center text-xs text-(--color-text-tertiary) py-1.5">
													Cancelled
												</span>
											)}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{checkingInVisitId !== null && (
				<div className="fixed inset-0 z-[3000] bg-black/40 flex items-center justify-center p-4">
					<div className="relative bg-(--color-surface) rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
						<button
							onClick={() => setCheckingInVisitId(null)}
							className="absolute top-3 right-3 z-10 bg-(--color-surface)/80 rounded-full p-1 text-(--color-text-tertiary) hover:text-(--color-text-secondary)"
						>
							<X size={18} />
						</button>
						<FieldVisitCheckIn
							visitId={checkingInVisitId}
							onComplete={handleCheckinComplete}
							onCancel={() => setCheckingInVisitId(null)}
						/>
					</div>
				</div>
			)}

			{previewImage && (
				<div
					className="fixed inset-0 z-[3000] bg-black/80 flex flex-col gap-4 items-center justify-center p-4"
					onClick={() => setPreviewImage(null)}
				>
					<img
						src={previewImage}
						className="max-w-full max-h-full rounded-lg object-contain"
					/>
					<button
						onClick={() => setPreviewImage(null)}
						className=" cursor-pointer
           bg-(--color-surface)/20 rounded-full p-1 text-white hover:bg-(--color-surface)/40"
					>
						<X size={24} />
					</button>
				</div>
			)}

			{showSchedule && (
				<div className="fixed inset-0 z-[3000] bg-black/40 flex items-center justify-center p-4">
					<div className="bg-(--color-surface) rounded-xl max-w-md w-full p-5 space-y-4">
						<div className="flex items-center justify-between">
							<h3 className="font-semibold text-(--color-text)">
								Schedule Visit
							</h3>
							<button
								onClick={() => {
									setShowSchedule(false);
									setScheduleSelectedLead(null);
									setScheduleShowCreateLead(false);
								}}
								className="cursor-pointer text-(--color-text-tertiary) hover:text-(--color-text-secondary)"
							>
								<X size={18} />
							</button>
						</div>

						{scheduleShowCreateLead ? (
							<div>
								<h4 className="text-sm font-semibold text-(--color-text) mb-3">Create New Lead</h4>
								<div className="space-y-3">
									<div>
										<label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">Campaign (optional)</label>
										<select
											value={scheduleNewLead.campaignId}
											onChange={(e) => setScheduleNewLead((p) => ({ ...p, campaignId: e.target.value }))}
											className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm"
										>
											<option value="">Select campaign...</option>
											{scheduleCampaigns.map((c) => (
												<option key={c._id} value={c._id}>{c.name}</option>
											))}
										</select>
									</div>
									<div>
										<label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">Name *</label>
										<input
											type="text"
											value={scheduleNewLead.name}
											onChange={(e) => setScheduleNewLead((p) => ({ ...p, name: e.target.value }))}
											placeholder="Lead name"
											className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm"
										/>
									</div>
									<div className="grid grid-cols-2 gap-2">
										<div>
											<label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">Phone</label>
											<input
												type="text"
												value={scheduleNewLead.phone}
												onChange={(e) => setScheduleNewLead((p) => ({ ...p, phone: e.target.value }))}
												placeholder="Phone number"
												className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">Company</label>
											<input
												type="text"
												value={scheduleNewLead.companyName}
												onChange={(e) => setScheduleNewLead((p) => ({ ...p, companyName: e.target.value }))}
												placeholder="Company name"
												className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm"
											/>
										</div>
									</div>
									<div className="grid grid-cols-2 gap-2">
										<div>
											<label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">City</label>
											<input
												type="text"
												value={scheduleNewLead.city}
												onChange={(e) => setScheduleNewLead((p) => ({ ...p, city: e.target.value }))}
												placeholder="City"
												className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">State</label>
											<input
												type="text"
												value={scheduleNewLead.state}
												onChange={(e) => setScheduleNewLead((p) => ({ ...p, state: e.target.value }))}
												placeholder="State"
												className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm"
											/>
										</div>
									</div>
									<div>
										<label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">Address</label>
										<input
											type="text"
											value={scheduleNewLead.addressLine}
											onChange={(e) => setScheduleNewLead((p) => ({ ...p, addressLine: e.target.value }))}
											placeholder="Address"
											className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm"
										/>
									</div>
									<div className="flex justify-end gap-2 pt-2">
										<button
											onClick={() => setScheduleShowCreateLead(false)}
											className="px-4 py-2 text-sm text-(--color-text-secondary) border border-(--color-border) rounded-lg hover:bg-(--color-surface-hover)"
										>
											Back
										</button>
										<button
											onClick={handleCreateScheduleLead}
											disabled={scheduleCreatingLead || !scheduleNewLead.name.trim()}
											className="px-4 py-2 text-sm bg-(--color-success) text-white rounded-lg hover:bg-(--color-success) disabled:opacity-50 flex items-center gap-1"
										>
											{scheduleCreatingLead && <Loader2 size={14} className="animate-spin" />}
											Create & Select
										</button>
									</div>
								</div>
							</div>
						) : (
							<>
								<div>
									<div className="flex items-center gap-2 mb-1">
										<Building2
											size={14}
											className="text-(--color-primary)"
										/>
										<span className="text-sm font-medium text-(--color-text-secondary)">
											Select Lead
										</span>
									</div>
									<input
										type="text"
										placeholder="Search leads..."
										value={scheduleLeadSearch}
										onChange={(e) =>
											setScheduleLeadSearch(e.target.value)
										}
										className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm"
									/>
								</div>

								{scheduleSelectedLead ? (
									<div className="p-3 bg-(--color-primary-light) rounded-lg border border-(--color-primary-light) flex items-center justify-between">
										<div>
											<p className="text-sm font-medium text-(--color-primary-hover)">
												{scheduleSelectedLead.name || scheduleSelectedLead.companyName || "Selected"}
											</p>
											{scheduleSelectedLead.companyName && (
												<p className="text-xs text-(--color-primary)">{scheduleSelectedLead.companyName}</p>
											)}
										</div>
										<button
											onClick={() => setScheduleSelectedLead(null)}
											className="cursor-pointer text-(--color-text-tertiary) hover:text-(--color-text-secondary)"
										>
											<X size={16} />
										</button>
									</div>
								) : (
									<div className="max-h-40 overflow-y-auto space-y-1">
										{scheduleLeads
											.filter((c) => {
												if (!scheduleLeadSearch) return true;
												const q = scheduleLeadSearch.toLowerCase();
												return (
													(c.name || "")
														.toLowerCase()
														.includes(q) ||
													(c.companyName || "")
														.toLowerCase()
														.includes(q)
												);
											})
											.map((c) => (
												<button
													key={c._id}
													onClick={() =>
														setScheduleSelectedLead(c)
													}
													className={` cursor-pointer w-full text-left px-3 py-2 rounded-lg text-sm border ${
														scheduleSelectedLead?._id === c._id
															? "bg-(--color-primary-light) border-(--color-primary-light)"
															: "border-transparent hover:bg-(--color-surface-hover)"
													}`}
												>
													<p className="font-medium text-(--color-text)">
														{c.name ||
															c.companyName ||
															"Unnamed"}
													</p>
													{c.companyName && (
														<p className="text-xs text-(--color-text-tertiary)">
															{c.companyName}
														</p>
													)}
												</button>
											))}
										{scheduleLeads.length === 0 && (
											<p className="text-xs text-(--color-text-tertiary) text-center py-4">
												Loading leads...
											</p>
										)}
									</div>
								)}

								{!scheduleSelectedLead && (
									<button
										onClick={() => {
											api.get("/campaigns")
												.then((r) => setScheduleCampaigns(r.data.campaigns || []))
												.catch(() => {});
											setScheduleShowCreateLead(true);
										}}
										className="cursor-pointer w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-(--color-border) rounded-lg text-sm text-(--color-text-tertiary) hover:text-(--color-text-secondary) hover:border-(--color-border-hover) transition-colors"
									>
										<Plus size={16} /> Create Quick Lead
									</button>
								)}

								<div>
									<label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">Date</label>
									<input
										type="date"
										value={scheduleDate}
										onChange={(e) => setScheduleDate(e.target.value)}
										className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm"
									/>
								</div>
								<div>
									<label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">Time</label>
									<input
										type="time"
										value={scheduleTime}
										onChange={(e) => setScheduleTime(e.target.value)}
										step="60"
										className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm"
									/>
								</div>

								<div className="flex justify-end gap-2">
									<button
										onClick={() => {
											setShowSchedule(false);
											setScheduleSelectedLead(null);
										}}
										className="px-4 py-2 text-sm text-(--color-text-secondary) border border-(--color-border) rounded-lg hover:bg-(--color-surface-hover)"
									>
										Cancel
									</button>
									<button
										onClick={handleSchedule}
										disabled={!scheduleSelectedLead || scheduling}
										className="px-4 py-2 text-sm bg-(--color-primary) text-white rounded-lg hover:bg-(--color-primary-hover) disabled:opacity-50 flex items-center gap-1"
									>
										{scheduling && <Loader2 size={14} className="animate-spin" />}
										Schedule
									</button>
								</div>
							</>
						)}
					</div>
				</div>
			)}
		</>
	);
};

export default FieldVisitList;
