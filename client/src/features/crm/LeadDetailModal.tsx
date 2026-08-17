import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
	Building,
	X,
	Clock,
	MessageSquare,
	PhoneCall,
	Pen,
	Trash2,
	Calendar,
	// Icon,
	LucideIcon,
	PhoneOutgoing,
	UserRound,
	ThumbsUp,
	CalendarClock,
	CalendarCheck,
	ThumbsDown,
	PhoneOff,
	Angry,
	Laugh,
	Frown,
} from "lucide-react";
import type { Lead } from "./DialQueue";

const SECTION_CLASS =
	"border border-(--color-border) rounded-xl overflow-hidden";
const HEADER_CLASS =
	"flex items-center gap-2 px-4 py-3 bg-(--color-surface) border-b border-(--color-border)";

interface LeadDetailModalProps {
	selectedLead: Lead | null;
	setSelectedLead: (l: Lead | null) => void;
	setUpdatingLead: (v: boolean) => void;
	isAdmin: boolean;
	isManager: boolean;
	isCalling: boolean;
	setIsCalling: (v: boolean) => void;
	callDuration: number;
	isEditingLead: boolean;
	setIsEditingLead: (v: boolean) => void;
	editForm: Record<string, string | undefined>;
	setEditForm: (
		f:
			| Record<string, string | undefined>
			| ((
					prev: Record<string, string | undefined>,
			  ) => Record<string, string | undefined>),
	) => void;
	showAllContactDetails: boolean;
	setShowAllContactDetails: (
		v: boolean | ((prev: boolean) => boolean),
	) => void;
	followupDate: string;
	setFollowupDate: (v: string) => void;
	schedulingFollowup: boolean;
	scheduleType: "follow_up" | "meeting";
	setScheduleType: (v: "follow_up" | "meeting") => void;
	newNote: string;
	setNewNote: (v: string) => void;
	updatingLead: boolean;
	handleDeleteLead: () => void;
	handleSaveLead: () => void;
	handleStatusChange: (id: string, status: Lead["status"]) => void;
	handleToggleCall: () => void;
	handleAddNote: () => void;
	handleScheduleFollowup: () => void;
	getInitials: (name: string) => string;
	getCampaignName: (id: any) => string;
	formatDate: (d?: string) => string;
	formatDateShort: (d?: string) => string;
	formatDuration: (s: number) => string;
}

export const PRIORITY_COLORS: Record<string, string> = {
	"very high": "var(--color-danger)",
	high: "var(--color-warning)",
	medium: "var(--color-primary)",
	low: "var(--color-text-tertiary)",
};

type BadgeVariant = "todo" | "warning" | "in_progress" | "done" | "not_started";

type StatusBadge = {
	variant: BadgeVariant;
	Icon: LucideIcon;
};

export const STATUS_BADGE: Record<string, StatusBadge> = {
	new: { variant: "todo", Icon: UserRound },
	attempted: { variant: "warning", Icon: PhoneOutgoing },
	connected: { variant: "in_progress", Icon: PhoneCall },
	interested: { variant: "in_progress", Icon: ThumbsUp },
	callback_scheduled: { variant: "in_progress", Icon: CalendarClock },
	meeting_scheduled: { variant: "in_progress", Icon: CalendarCheck },
	not_interested: { variant: "not_started", Icon: ThumbsDown },
	not_reachable: { variant: "not_started", Icon: PhoneOff },
	do_not_call: { variant: "not_started", Icon: Angry },
	closed_won: { variant: "done", Icon: Laugh },
	closed_lost: { variant: "not_started", Icon: Frown },
};

export const STATUS_OPTIONS: Lead["status"][] = [
	"new",
	"attempted",
	"connected",
	"interested",
	"callback_scheduled",
	"meeting_scheduled",
	"not_interested",
	"not_reachable",
	"do_not_call",
	"closed_won",
	"closed_lost",
];

const EditFields = [
	{ label: "Name", key: "name" },
	{ label: "Phone", key: "phone" },
	{ label: "Alt Phone", key: "alternatePhone" },
	{ label: "Email", key: "email" },
	{ label: "Website", key: "website" },
	{ label: "Company", key: "companyName" },
	{ label: "Industry", key: "industry" },
	{ label: "Designation", key: "designation" },
	{ label: "Address Line", key: "addressLine" },
	{ label: "City", key: "city" },
	{ label: "State", key: "state" },
	{ label: "Pincode", key: "pincode" },
	{ label: "PAN", key: "companyPan" },
	{ label: "GST", key: "companyGst" },
];

const DRAG_THRESHOLD = 120;

export default function LeadDetailModal({
	selectedLead,
	setSelectedLead,
	setUpdatingLead,
	isAdmin,
	isManager,
	isCalling,
	setIsCalling,
	callDuration,
	isEditingLead,
	setIsEditingLead,
	editForm,
	setEditForm,
	showAllContactDetails,
	setShowAllContactDetails,
	followupDate,
	setFollowupDate,
	schedulingFollowup,
	scheduleType,
	setScheduleType,
	newNote,
	setNewNote,
	updatingLead,
	handleDeleteLead,
	handleSaveLead,
	handleStatusChange,
	handleToggleCall,
	handleAddNote,
	handleScheduleFollowup,
	getInitials,
	getCampaignName,
	formatDate,
	formatDateShort,
	formatDuration,
}: LeadDetailModalProps) {
	if (!selectedLead) return null;

	const [mounted, setMounted] = useState(false);
	const [dragOffset, setDragOffset] = useState(0);
	const [isExiting, setIsExiting] = useState(false);
	const [expandedMobile, setExpandedMobile] = useState(false);
	const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
	const [statusDropdownPos, setStatusDropdownPos] = useState({
		top: 0,
		left: 0,
		width: 0,
	});
	const statusDropdownRef = useRef<HTMLDivElement>(null);
	const statusTriggerRef = useRef<HTMLButtonElement>(null);
	const dragOffsetRef = useRef(0);
	const cardRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		requestAnimationFrame(() => setMounted(true));
	}, []);

	const priorityColor =
		PRIORITY_COLORS[selectedLead.priority] || "var(--color-text-tertiary)";

	const closeModal = () => {
		
		setIsEditingLead(false)
		setUpdatingLead(false)
		setSelectedLead(null);
		setIsCalling(false);
		setIsEditingLead(false);
		setNewNote(""); // test passed
	};

	const animateClose = () => {
		setIsExiting(true);
		setTimeout(closeModal, 250);
	};

	/* Expand to 92dvh on mobile when user scrolls content */
	useEffect(() => {
		const el = contentRef.current;
		if (!el) return;
		const onScroll = () => {
			if (window.innerWidth >= 640) return;
			setExpandedMobile(el.scrollTop > 0);
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, []);

	/* Close status dropdown on outside click */
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (
				statusDropdownRef.current &&
				!statusDropdownRef.current.contains(e.target as Node) &&
				statusTriggerRef.current &&
				!statusTriggerRef.current.contains(e.target as Node)
			) {
				setStatusDropdownOpen(false);
			}
		};
		if (statusDropdownOpen) {
			document.addEventListener("mousedown", handler);
		}
		return () => document.removeEventListener("mousedown", handler);
	}, [statusDropdownOpen]);

	const toggleStatusDropdown = useCallback(() => {
		if (!statusDropdownOpen && statusTriggerRef.current) {
			const rect = statusTriggerRef.current.getBoundingClientRect();
			setStatusDropdownPos({
				top: rect.bottom + window.scrollY + 4,
				left: rect.left + window.scrollX,
				width: rect.width,
			});
		}
		setStatusDropdownOpen((o) => !o);
	}, [statusDropdownOpen]);

	/* Touch handlers on the card for drag-to-dismiss (mobile only) */
	const touchStartY = useRef(0);
	const isDraggingRef = useRef(false);

	useEffect(() => {
		const el = cardRef.current;
		if (!el) return;
		const onStart = (e: TouchEvent) => {
			if (window.innerWidth >= 640) return;
			touchStartY.current = e.touches[0].clientY;
		};
		const onMove = (e: TouchEvent) => {
			if (window.innerWidth >= 640) return;
			const atTop = contentRef.current
				? contentRef.current.scrollTop <= 0
				: true;
			const delta = e.touches[0].clientY - touchStartY.current;
			if (!isDraggingRef.current) {
				if (atTop && delta > 0) {
					isDraggingRef.current = true;
				} else {
					return;
				}
			}
			if (delta > 0) {
				e.preventDefault();
				setDragOffset(delta);
				dragOffsetRef.current = delta;
			} else {
				setDragOffset(0);
				dragOffsetRef.current = 0;
				isDraggingRef.current = false;
			}
		};
		const onEnd = () => {
			if (!isDraggingRef.current) return;
			isDraggingRef.current = false;
			if (dragOffsetRef.current > DRAG_THRESHOLD) {
				animateClose();
			} else {
				setDragOffset(0);
				dragOffsetRef.current = 0;
			}
		};
		el.addEventListener("touchstart", onStart, { passive: true });
		el.addEventListener("touchmove", onMove, { passive: false });
		el.addEventListener("touchend", onEnd);
		return () => {
			el.removeEventListener("touchstart", onStart);
			el.removeEventListener("touchmove", onMove);
			el.removeEventListener("touchend", onEnd);
		};
	}, []);

	const startEditing = () => {
		setUpdatingLead(true)
		setEditForm({
			name: selectedLead.name,
			phone: selectedLead.phone,
			alternatePhone: selectedLead.alternatePhone,
			email: selectedLead.email,
			website: selectedLead.website,
			companyName: selectedLead.companyName,
			industry: selectedLead.industry,
			designation: selectedLead.designation,
			addressLine: selectedLead.addressLine,
			city: selectedLead.city,
			state: selectedLead.state,
			pincode: selectedLead.pincode,
			companyPan: selectedLead.companyPan,
			companyGst: selectedLead.companyGst,
			priority: selectedLead.priority,
		});
		setIsEditingLead(true);
	};

	const isDraggingRender = dragOffset > 0;
	const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
	const translateY = isExiting
		? "100%"
		: !mounted
			? "100%"
			: isDraggingRender
				? `${dragOffset}px`
				: "0";
	const transition = isDraggingRender
		? "none"
		: "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease, max-height 0.3s ease";
	const cardOpacity = !mounted && !isExiting ? 0 : 1;
	// const backdropOpacity = !mounted && !isExiting ? 0 : 1;

	return (
		<div
			className="backdrop-blur-sm bg-(--color-primary-light)/40 h-full w-full fixed inset-0 z-50 flex items-end sm:items-center justify-center transition-opacity duration-200"
			// style={{ backgroundColor: `rgba(0,0,0,${0.2 * backdropOpacity})` }}
			onClick={closeModal}
		>
			<div
				ref={cardRef}
				className="w-full sm:max-w-300 max-h-[80dvh] sm:max-h-[90dvh] flex flex-col bg-(--color-surface)
					rounded-t-3xl sm:rounded-2xl
					border border-(--color-border) sm:m-4 sm:shadow-xl
					overflow-hidden"
				style={{
					transform: `translateY(${translateY})`,
					transition,
					opacity: cardOpacity,
					borderColor:
						"color-mix(in srgb, var(--color-primary) 50%, transparent)",
					overscrollBehavior: "contain",
					maxHeight: isMobile
						? expandedMobile
							? "92dvh"
							: "80dvh"
						: undefined,
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* ── Drag Handle (mobile only) ──  */}
				<div className="flex sm:hidden items-center justify-center pt-3 pb-1.5 -mb-1 select-none">
					<div className="flex flex-col items-center gap-1">
						<div className="w-9 h-1 rounded-full bg-(--color-border)" />
					</div>
				</div>

				{/* ── Header ── */}
				<div className="flex items-start sm:items-center justify-between gap-2 px-3 sm:px-6 pt-2 sm:pt-5 pb-3 sm:pb-4 shrink-0 border-b sm:border-none border-(--color-border)">
					<div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
						{/* <div className="hidden sm:flex bg-(--color-primary) font-bold text-xl h-12 w-12 text-(--color-bg) items-center justify-center rounded-full shrink-0">
							{getInitials(selectedLead.name)}
						</div> */}
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
								{/* <div className="flex sm:hidden bg-(--color-primary) font-bold text-sm h-8 w-8 text-(--color-bg) items-center justify-center rounded-full shrink-0">
									{getInitials(selectedLead.name)}
								</div> */}
								<h2 className="text-(--color-text) font-bold text-base sm:text-2xl truncate">
									{selectedLead.name}
								</h2>
								<span
									className={`badge badge-${STATUS_BADGE[selectedLead.status] || "todo"} text-[0.6rem] sm:text-[0.65rem] px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg shrink-0`}
								>
									{selectedLead.status.replace(/_/g, " ")}
								</span>
								<span
									className="text-[0.6rem] sm:text-[0.65rem] font-semibold px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg shrink-0"
									style={{
										background: `${priorityColor}15`,
										color: priorityColor,
									}}
								>
									{selectedLead.priority}
								</span>
							</div>
							<div className="flex flex-wrap items-center gap-x-1.5 sm:gap-x-2.5 text-(--color-text-tertiary) text-[0.62rem] sm:text-[0.72rem] mt-0.5 truncate">
								{selectedLead.designation && (
									<span className="truncate max-w-30 sm:max-w-none">
										{selectedLead.designation}
									</span>
								)}
								<span className="hidden sm:inline">|</span>
								<span className="truncate max-w-20 sm:max-w-none">
									Src: {selectedLead.source}
								</span>
								<span className="hidden sm:inline">|</span>
								<span className="truncate max-w-25 sm:max-w-none">
									Camp:{" "}
									{getCampaignName(selectedLead.campaignId)}
								</span>
							</div>
						</div>
					</div>
					<div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
						{(isAdmin || isManager) && (
							<button
								onClick={handleDeleteLead}
								title="Delete Lead"
								className="bg-(--color-danger-light) text-(--color-danger) border-none cursor-pointer w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center hover:opacity-80"
							>
								<Trash2 size={20} className="sm:size-3.5" />
							</button>
						)}
						<button
							onClick={closeModal}
							className="bg-(--color-primary) text-(--color-bg) border-none cursor-pointer w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center hover:opacity-90"
						>
							<X size={20} className="sm:size-4" />
						</button>
					</div>
				</div>

				{/* ── Single scrollable content area (mobile) / 3-column grid (lg+) ── */}
				<div
					ref={contentRef}
					className="flex-1 overflow-y-auto min-h-0 px-3 sm:px-6 pb-3 sm:pb-6 pt-2 sm:pt-0"
					style={{
						overflowY: "auto",
						scrollbarWidth: "none",     // Firefox
						msOverflowStyle: "none",    // IE/Edge Legacy
					}}
				>
					<div className={`grid grid-cols-1 ${!updatingLead ? "lg:grid-cols-2 xl:grid-cols-3" : null } gap-3 sm:gap-4 h-full `}>
						{/* ═══ COLUMN 1: Contact + Call ═══ */}
						<div className="flex flex-col gap-3 sm:gap-4">
							{/* Contact Information */}
							<div
								className={SECTION_CLASS}
								style={{
									borderColor:
										"color-mix(in srgb, var(--color-primary) 20%, transparent)",
								}}
							>
								<div className={HEADER_CLASS}>
									<Building
										size={14}
										className="text-(--color-primary)"
									/>
									<span className="text-[0.8rem] sm:text-[0.82rem] font-semibold text-(--color-text)">
										Contact
									</span>
									{/* {(isAdmin || isManager) &&
										!isEditingLead ? (
											<button
												onClick={startEditing}
												title="Edit Lead"
												className="ml-auto bg-(--color-primary-light) border-none cursor-pointer text-(--color-primary) w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center hover:opacity-80"
											>
												<Pen
													size={12}
													className="sm:size-[14px]"
												/>
											</button>
										) : (
											<button
												onClick={() =>{
													setIsEditingLead(false)
													setUpdatingLead(false)
												}}
												title="Edit Lead"
												className="ml-auto bg-(--color-primary-light) border-none cursor-pointer text-(--color-primary) w-fit h-7  sm:h-8 rounded-lg gap-2 p-4 flex items-center justify-center hover:opacity-80"
											>
												<X
													size={12}
													className="sm:size-[14px]"
												/>
												<span className="text-xs" >
													Cancle Edits
												</span> 
											</button>
										)} */}
									{(isAdmin || isManager) &&
										!isEditingLead && (
											<button
												onClick={startEditing}
												title="Edit Lead"
												className="ml-auto bg-(--color-primary-light) border-none cursor-pointer text-(--color-primary) w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center hover:opacity-80"
											>
												<Pen
													size={12}
													className="sm:size-3.5"
												/>
											</button>
										)
									}
								</div>

								{isEditingLead ? (
									<>
										<div className="grid  grid-cols-1 sm:grid-cols-3 gap-2 p-3">
											{EditFields.map((f) => (
												<div key={f.key}>
													<label className="block text-[0.65rem] sm:text-[0.7rem] text-(--color-text-tertiary) mb-0.5">
														{f.label}
													</label>
													<input
														className="input w-full px-2 py-1.5 text-xs sm:text-sm rounded-md"
														value={
															editForm[f.key] || ""
														}
														onChange={(e) =>
															setEditForm((prev) => ({
																...prev,
																[f.key]:
																	e.target.value,
															}))
														}
													/>
												</div>
											))}
											<div>
												<label className="block text-[0.65rem] sm:text-[0.7rem] text-(--color-text-tertiary) mb-0.5">
													Priority
												</label>
												<select
													className="input w-full px-2 py-1.5 text-xs sm:text-sm rounded-md"
													value={
														editForm.priority ||
														"medium"
													}
													onChange={(e) =>
														setEditForm((prev) => ({
															...prev,
															priority:
																e.target.value,
														}))
													}
												>
													<option value="very high">
														Very High
													</option>
													<option value="high">
														High
													</option>
													<option value="medium">
														Medium
													</option>
													<option value="low">Low</option>
												</select>
											</div>
										</div>
										<div className="flex gap-2 m-3 mt-1">
											<button
												onClick={() =>{
													setIsEditingLead(false)
													setUpdatingLead(false)
												}}
												className="btn btn-secondary flex-1 py-2 rounded-lg text-xs sm:text-sm font-semibold "
											>
												Cancle Edits
											</button>
											<button
												className="btn btn-primary flex-1 py-2 rounded-lg text-xs sm:text-sm font-semibold"
												disabled={
													!	updatingLead ||
													!editForm.name
												}
												onClick={handleSaveLead}
											>
												{!updatingLead
													? "Saving..."
													: "Save Edits"}
											</button>
										</div>
									</>
								) : (
									<>
										<div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
											{[
												{
													label: "Phone",
													value: selectedLead.phone,
													phone: true,
												},
												{
													label: "Alt Phone",
													value: selectedLead.alternatePhone,
													phone: true,
												},
												{
													label: "Email",
													value: selectedLead.email,
												},
												{
													label: "Website",
													value: selectedLead.website,
												},
												{
													label: "Company",
													value: selectedLead.companyName,
												},
												{
													label: "Industry",
													value: selectedLead.industry,
												},
												{
													label: "PAN",
													value: selectedLead.companyPan,
												},
												{
													label: "GST",
													value: selectedLead.companyGst,
												},
												{
													label: "Address",
													fullWidth: true,
													value: [
														selectedLead.addressLine,
														selectedLead.city,
														selectedLead.state,
														selectedLead.pincode,
													]
														.filter(Boolean)
														.join(", "),
												},
											]
												.filter(
													(item) =>
														item.phone ||
														showAllContactDetails,
												)
												.map((item, i, arr) => {
													const isPhone = item.phone;
													return (
														<div
															key={i}
															className={`${isPhone ? "bg-(--color-primary-light) px-3 sm:px-4 py-2 sm:py-2.5" : "px-3 sm:px-4 py-1 sm:py-1.5"}`}
															style={{
																gridColumn:
																	item.fullWidth
																		? "1 / -1"
																		: undefined,
																borderRight:
																	!item.fullWidth &&
																	i % 2 === 0
																		? "1px solid var(--color-border)"
																		: "none",
																borderBottom:
																	i <
																	arr.length -
																		1
																		? "1px solid var(--color-border)"
																		: "none",
															}}
														>
															<div
																className="text-[0.6rem] sm:text-[0.65rem] flex items-center gap-1 mb-0.5"
																style={{
																	color: isPhone
																		? "var(--color-primary)"
																		: "var(--color-text-tertiary)",
																}}
															>
																{item.label}
															</div>
															<div
																className={`${isPhone ? "text-base sm:text-lg font-bold text-(--color-primary)" : "text-[0.75rem] sm:text-[0.82rem] font-medium text-(--color-text)"} break-all`}
															>
																{item.value ||
																	"—"}
															</div>
														</div>
													);
												})}
										</div>
										<button
											onClick={() =>
												setShowAllContactDetails(
													(p) => !p,
												)
											}
											className="w-full flex items-center justify-center gap-1 py-2 sm:py-2.5 bg-(--color-surface) border-t border-(--color-border) text-[0.7rem] sm:text-[0.78rem] font-semibold text-(--color-primary) cursor-pointer"
										>
											{showAllContactDetails
												? "Show Less"
												: "View More"}
										</button>
									</>
								)}
							</div>

							{/* Call Activity */}
							{!updatingLead &&
								<div
									className={SECTION_CLASS}
									style={{
										borderColor:
											"color-mix(in srgb, var(--color-primary) 20%, transparent)",
									}}
								>
									<div className={HEADER_CLASS}>
										<PhoneCall
											size={14}
											className="text-(--color-primary)"
										/>
										<span className="text-[0.8rem] sm:text-[0.82rem] font-semibold text-(--color-text)">
											Call Activity
										</span>
									</div>
									<div className="p-2 sm:p-3">
										<div className="flex gap-1.5 sm:gap-2.5 mb-2 sm:mb-3">
											{[
												{
													label: "Calls",
													value: selectedLead.callCount,
													className:
														"text-base sm:text-lg font-bold text-(--color-primary)",
												},
												{
													label: "Last",
													value: selectedLead.lastCallAt
														? formatDateShort(
																selectedLead.lastCallAt,
															)
														: "Never",
													className:
														"text-xs sm:text-sm font-semibold text-(--color-text)",
												},
												{
													label: "Timer",
													className: `text-xs sm:text-sm font-semibold flex items-center justify-center gap-0.5 sm:gap-1 ${isCalling ? "text-(--color-danger)" : "text-(--color-text)"}`,
													value: (
														<>
															<Clock
																size={11}
																className="sm:size-3.25"
															/>
															{formatDuration(
																callDuration,
															)}
														</>
													),
												},
											].map((item, i) => (
												<div
													key={i}
													className="flex-1 text-center p-1.5 sm:p-2 bg-(--color-surface) rounded-lg"
												>
													<div className="text-[0.6rem] sm:text-[0.65rem] text-(--color-text-tertiary) mb-0.5">
														{item.label}
													</div>
													<div className={item.className}>
														{item.value}
													</div>
												</div>
											))}
										</div>

										<div className="flex gap-2 mb-2">
											<div
												className="relative flex-1"
												ref={statusDropdownRef}
											>
												<button
													ref={statusTriggerRef}
													type="button"
													className="input flex-1 w-full py-1.5 sm:py-2 px-2 text-[0.72rem] sm:text-[0.8rem] rounded-lg font-semibold text-(--color-text) border-2 border-(--color-primary) bg-(--color-primary-light) cursor-pointer flex items-center gap-1.5"
													onClick={toggleStatusDropdown}
												>
													{(() => {
														const IconComp =
															STATUS_BADGE[
																selectedLead.status
															]?.Icon;
														return IconComp ? (
															<IconComp size={14} />
														) : null;
													})()}
													{selectedLead.status.replace(
														/_/g,
														" ",
													)}
												</button>
												{statusDropdownOpen &&
													createPortal(
														<div
															ref={statusDropdownRef}
															className="fixed z-9999 bg-(--color-surface) border border-(--color-border) rounded-lg shadow-lg max-h-50 overflow-y-auto"
															style={{
																top: statusDropdownPos.top,
																left: statusDropdownPos.left,
																width: statusDropdownPos.width,
															}}
														>
															{STATUS_OPTIONS.map(
																(s) => {
																	const IconComp =
																		STATUS_BADGE[
																			s
																		]?.Icon;
																	return (
																		<button
																			key={s}
																			type="button"
																			className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-[0.72rem] sm:text-[0.8rem] font-semibold text-left cursor-pointer border-none
																		${s === selectedLead.status ? "bg-(--color-primary-light) text-(--color-primary)" : "bg-transparent text-(--color-text) hover:bg-(--color-primary-light)"}`}
																			onClick={() => {
																				handleStatusChange(
																					selectedLead._id,
																					s,
																				);
																				setStatusDropdownOpen(
																					false,
																				);
																			}}
																		>
																			{IconComp && (
																				<IconComp
																					size={
																						14
																					}
																				/>
																			)}
																			{s.replace(
																				/_/g,
																				" ",
																			)}
																		</button>
																	);
																},
															)}
														</div>,
														document.body,
													)}
											</div>
										</div>

										<button
											onClick={handleToggleCall}
											className="w-full flex items-center justify-center gap-1.5 sm:gap-2 py-2 rounded-lg font-semibold border-none cursor-pointer text-[0.8rem] sm:text-[0.88rem]"
											style={{
												background: isCalling
													? "var(--color-danger)"
													: "var(--color-primary)",
												color: "white",
											}}
										>
											<PhoneCall
												size={14}
												className="sm:size-4"
											/>
											{isCalling ? "End Call" : "Start Call"}
										</button>
									</div>
								</div>
							}
						</div>

						{/* ═══ COLUMN 2: Schedule + Activity Trail ═══ */}
						{!updatingLead &&
						
						<div
							className="flex flex-col border border-(--color-border) rounded-xl overflow-hidden"
							style={{
								borderColor:
									"color-mix(in srgb, var(--color-primary) 20%, transparent)",
							}}
						>
							<div className="shrink-0 p-3 sm:px-4 sm:py-3 border-b border-(--color-border)">
								<div className="flex items-center gap-2 mb-2">
									<Calendar
										size={14}
										className="text-(--color-primary)"
									/>
									<span className="text-[0.8rem] sm:text-[0.82rem] font-semibold text-(--color-text)">
										Schedule
									</span>
								</div>
								{(selectedLead.nextFollowupAt ||
									selectedLead.meetingAt) && (
									<div className="text-[0.7rem] sm:text-[0.78rem] text-(--color-text-secondary) mb-2 px-2 py-1.5 bg-(--color-primary-light) rounded-md flex items-center gap-1.5 flex-wrap">
										<span className="font-semibold text-(--color-primary) shrink-0">
											{selectedLead.scheduleType ===
											"meeting"
												? "Meeting"
												: "Follow-up"}
											:
										</span>
										<span className="truncate">
											{formatDate(
												selectedLead.meetingAt ||
													selectedLead.nextFollowupAt,
											)}
										</span>
									</div>
								)}
								<div className="flex gap-1.5 mb-2">
									{(["follow_up", "meeting"] as const).map(
										(type) => (
											<button
												key={type}
												onClick={() =>
													setScheduleType(type)
												}
												className={`
												flex items-center justify-center gap-2 px-1 

												flex-1 py-2 text-[0.8rem] sm:text-[0.88rem] font-semibold rounded-md border border-(--color-primary)/20 cursor-pointer whitespace-nowrap  ${
													scheduleType === type
														? "bg-(--color-primary) text-white"
														: "bg-(--color-surface) text-(--color-text-tertiary)"
												}`}
											>
												{type === "follow_up"
													? "Follow-up"
													: "Meeting"}
											</button>
										),
									)}
								</div>
								<div className="flex gap-1.5 sm:gap-2">
									<input
										type="datetime-local"
										className="input flex-1 px-2 py-1.5 text-[0.7rem] sm:text-[0.78rem] rounded-md"
										value={followupDate}
										onChange={(e) =>
											setFollowupDate(e.target.value)
										}
									/>
									<button
										className="btn btn-primary px-2.5 sm:px-3.5 py-1.5 rounded-md text-[0.7rem] sm:text-[0.78rem] font-semibold whitespace-nowrap"
										disabled={
											!followupDate || schedulingFollowup
										}
										onClick={handleScheduleFollowup}
									>
										{schedulingFollowup
											? "Saving..."
											: "Save"}
									</button>
								</div>
							</div>

							<div className="flex-1 overflow-y-auto min-h-0 p-3 sm:px-4 sm:py-3">
								<div className="flex items-center gap-2 mb-2">
									<Clock
										size={14}
										className="text-(--color-primary)"
									/>
									<span className="text-[0.8rem] sm:text-[0.82rem] font-semibold text-(--color-text)">
										Activity Trail
									</span>
								</div>
								<div className="flex gap-2 mb-2">
									{[
										{
											label: "Follow-ups",
											value: selectedLead.followUpCount,
										},
										{
											label: "Meetings",
											value: selectedLead.meetingCount,
										},
									].map((item) => (
										<div
											key={item.label}
											className="flex-1 text-center p-1 sm:p-1.5 bg-(--color-surface) rounded-md"
										>
											<div className="text-[0.6rem] sm:text-[0.65rem] text-(--color-text-tertiary)">
												{item.label}
											</div>
											<div className="text-sm sm:text-base font-bold text-(--color-primary)">
												{item.value}
											</div>
										</div>
									))}
								</div>

								<div className="flex flex-col gap-2">

									<div className="max-h-50 overflow-scroll ">
										{[...selectedLead.followUpLogs]
											.reverse()
											.map((log, idx, arr) => (
												<div
													key={idx}
												className="flex items-center gap-1.5 sm:gap-2 py-1 text-[0.65rem] sm:text-[0.72rem] text-(--color-text-secondary)"
												style={{
													borderBottom:
														idx < arr.length - 1
															? "1px solid var(--color-border)"
															: "none",
													opacity: idx === 0 ? 1 : 0.4,
												}}
											>
												<div className="w-1.5 h-1.5 rounded-full bg-(--color-primary) shrink-0" />
												<span className="font-semibold mr-1 shrink-0">
													Follow-up
													</span>
													<span className="truncate">
														{formatDate(
															log.scheduledAt,
														)}
													</span>
												</div>
											))}
									</div>
									<div className="my-1 h-px bg-linear-to-r from-transparent via-(--color-border) to-transparent" />
									<div className="max-h-50 overflow-scroll ">
										{[...selectedLead.meetingLogs]
											.reverse()
											.map((log, idx, arr) => (
												<div
													key={idx}
												className="flex items-center gap-1.5 sm:gap-2 py-1 text-[0.65rem] sm:text-[0.72rem] text-(--color-text-secondary)"
												style={{
													borderBottom:
														idx < arr.length - 1
															? "1px solid var(--color-border)"
															: "none",
													opacity: idx === 0 ? 1 : 0.4,
												}}
											>
												<div
													className="w-1.5 h-1.5 rounded-full shrink-0"
														style={{
															background:
																log.status ===
																"done"
																	? "var(--color-success)"
																	: log.status ===
																		"canceled"
																		? "var(--color-danger)"
																		: "var(--color-warning)",
														}}
													/>
													<span className="font-semibold mr-1 shrink-0">
														Meeting ({log.status})
													</span>
													<span className="truncate">
														{formatDate(
															log.scheduledAt,
														)}
													</span>
												</div>
											))}
									</div>
								</div>

								{selectedLead.followUpLogs.length === 0 &&
									selectedLead.meetingLogs.length === 0 && (
										<p className="text-[0.7rem] sm:text-[0.75rem] text-(--color-text-tertiary) text-center py-2 m-0">
											No follow-ups or meetings yet.
										</p>
									)}
							</div>
						</div>
}

						{/* ═══ COLUMN 3: Notes ═══ */}
						{!updatingLead &&
						<div
							className="lg:col-span-2 xl:col-span-1 border border-(--color-border) rounded-xl overflow-hidden flex flex-col"
							style={{
								borderColor:
									"color-mix(in srgb, var(--color-primary) 20%, transparent)",
							}}
						>
							<div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-(--color-border)">
								<div className="flex items-center gap-2">
									<MessageSquare
										size={14}
										className="text-(--color-primary)"
									/>
									<span className="text-(--color-text) font-semibold text-xs sm:text-sm">
										Notes ({selectedLead.notes.length})
									</span>
								</div>
							</div>
							<div className="overflow-y-auto max-h-55 sm:max-h-[50dvh] p-3 sm:p-4">
								{selectedLead.notes.length === 0 ? (
									<p className="text-(--color-text-tertiary) text-xs sm:text-sm text-center mt-6 sm:mt-10">
										No notes yet. Add the first note below.
									</p>
								) : (
									<div className="flex flex-col gap-3 sm:gap-4">
										{[...selectedLead.notes]
											.reverse()
											.map((note, idx) => (
												<div
													key={note._id}
													className="flex gap-2 sm:gap-3 relative"
												>
													{idx !==
														selectedLead.notes
															.length -
															1 && (
														<div className="absolute left-2.5 sm:left-3 top-7 sm:top-8 bottom-0 w-0.5 bg-(--color-border)" />
													)}
													<div className="flex items-center justify-center rounded-full w-6 h-6 sm:w-7 sm:h-7 bg-(--color-primary-light) text-(--color-primary) text-[0.55rem] sm:text-[0.65rem] font-semibold border-2 border-(--color-bg) z-10 shrink-0">
														{getInitials(
															note.createdBy
																?.name || "U",
														)}
													</div>
													<div className="flex-1 min-w-0">
														<div className="flex items-center gap-1.5 mb-0.5 sm:mb-1">
															<span className="text-(--color-text) font-semibold text-[0.7rem] sm:text-[0.78rem] truncate max-w-30 sm:max-w-none">
																{note.createdBy
																	?.name ||
																	"Unknown"}
															</span>
															<span className="text-(--color-text-tertiary) text-[0.55rem] sm:text-[0.62rem] shrink-0">
																{formatDateShort(
																	note.createdAt,
																)}
															</span>
														</div>
														<p className="text-(--color-text-secondary) text-[0.75rem] sm:text-[0.82rem] leading-5 sm:leading-6 m-0 whitespace-pre-wrap wrap-break-word">
															{note.text}
														</p>
													</div>
												</div>
											))}
									</div>
								)}
							</div>
							<div className="flex gap-2 p-2.5 sm:p-3 border-t border-(--color-border)">
								<textarea
									id="note-input"
									className="input flex-1 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[0.72rem] sm:text-[0.8rem] rounded-lg resize-none min-h-13 sm:min-h-15 max-h-25 sm:max-h-30"
									placeholder="Add a note..."
									rows={2}
									value={newNote}
									onChange={(e) => setNewNote(e.target.value)}
								/>
								<button
									className="btn btn-primary px-3 sm:px-4 rounded-lg font-semibold text-[0.75rem] sm:text-[0.82rem]"
									disabled={!newNote.trim()}
									onClick={handleAddNote}
								>
									Add
								</button>
							</div>
						</div>
}
					</div>
				</div>
			</div>
		</div>
	);
}
