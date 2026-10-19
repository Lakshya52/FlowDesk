import { useEffect, useState } from "react";
import {
	CalendarClock,
	CalendarDays,
	Link2,
	MapPin,
	Video,
	X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "../../lib/api";
import Modal from "../common/Modal";
import type { Lead } from "./DialQueue";

interface ScheduleModalProps {
	isOpen: boolean;
	lead: Lead | null;
	onClose: () => void;
	onScheduled: (lead: Lead) => void;
}

type ScheduleKind = "follow_up" | "meeting";
type MeetingMode = "virtual" | "physical";

const ScheduleModal = ({
	isOpen,
	lead,
	onClose,
	onScheduled,
}: ScheduleModalProps) => {
	const queryClient = useQueryClient();
	const [kind, setKind] = useState<ScheduleKind>("follow_up");
	const [date, setDate] = useState("");
	const [mode, setMode] = useState<MeetingMode>("virtual");
	const [link, setLink] = useState("");
	const [location, setLocation] = useState("");
	const [saving, setSaving] = useState(false);

	// Start fresh every time the modal opens — the current schedule is shown
	// in the lead modal, this form is always for a new entry.
	useEffect(() => {
		if (!isOpen) return;
		setKind(lead?.scheduleType || "follow_up");
		setDate("");
		setMode(lead?.meetingMode || "virtual");
		setLink("");
		setLocation("");
		setSaving(false);
	}, [isOpen, lead?._id]); // eslint-disable-line react-hooks/exhaustive-deps

	const submit = async () => {
		if (!lead || !date || saving) return;
		setSaving(true);
		try {
			const payload: Record<string, any> = { scheduleType: kind };
			if (kind === "meeting") {
				payload.meetingAt = date;
				payload.status = "meeting_scheduled";
				payload.meetingStatus = "scheduled";
				payload.meetingMode = mode;
				// A meeting replaces any pending follow-up date.
				payload.nextFollowupAt = null;
				if (mode === "virtual" && link.trim()) {
					payload.meetingLink = link.trim();
				}
				if (mode === "physical" && location.trim()) {
					payload.meetingLocation = location.trim();
				}
			} else {
				payload.nextFollowupAt = date;
				payload.status = "callback_scheduled";
				// A follow-up replaces any pending meeting.
				payload.meetingAt = null;
			}

			const { data } = await api.put(`/leads/${lead._id}`, payload);
			if (!data?.success || !data.lead) {
				toast.error("Could not create the schedule");
				return;
			}

			toast.success(
				kind === "meeting" ? "Meeting scheduled" : "Follow-up scheduled",
			);
			onScheduled(data.lead as Lead);
			queryClient.invalidateQueries({ queryKey: ["leads"] });
			queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
			queryClient.invalidateQueries({ queryKey: ["conversion-overview"] });
			onClose();
		} catch (err: any) {
			toast.error(
				err.response?.data?.message || "Could not create the schedule",
			);
		} finally {
			setSaving(false);
		}
	};

	if (!lead) return null;

	return (
		<Modal isOpen={isOpen} onClose={onClose} zIndex={4970}>
			<div
				className="w-[calc(100vw-2rem)] max-w-md max-h-[85dvh] overflow-y-auto card p-4 sm:p-5"
				style={{
					borderColor:
						"color-mix(in srgb, var(--color-primary) 30%, transparent)",
				}}
			>
				<div className="flex items-start justify-between gap-3 mb-4">
					<div className="flex items-center gap-2.5 min-w-0">
						<div className="w-9 h-9 rounded-xl bg-(--color-primary-light) text-(--color-primary) flex items-center justify-center shrink-0">
							<CalendarClock size={18} />
						</div>
						<div className="min-w-0">
							<h3 className="text-sm sm:text-base font-bold text-(--color-text) m-0 truncate">
								Create Schedule
							</h3>
							<p className="text-[0.7rem] sm:text-xs text-(--color-text-tertiary) m-0 truncate">
								{lead.name}
								{lead.companyName ? ` · ${lead.companyName}` : ""}
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="bg-(--color-primary-light) border-none cursor-pointer text-(--color-primary) w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80 shrink-0"
					>
						<X size={16} />
					</button>
				</div>

				{/* Schedule type */}
				<label className="text-[0.7rem] sm:text-xs font-semibold text-(--color-text-tertiary) uppercase tracking-wider">
					Schedule type
				</label>
				<div className="grid grid-cols-2 gap-2 mt-1.5 mb-4">
					{(
						[
							{
								key: "follow_up" as const,
								label: "Follow-up call",
								Icon: CalendarClock,
							},
							{
								key: "meeting" as const,
								label: "Meeting",
								Icon: CalendarDays,
							},
						] as const
					).map(({ key, label, Icon }) => (
						<button
							key={key}
							type="button"
							onClick={() => setKind(key)}
							className={`flex items-center justify-center gap-2 py-2.5 px-2 rounded-lg border text-[0.75rem] sm:text-sm font-semibold cursor-pointer transition-colors ${
								kind === key
									? "bg-(--color-primary) text-white border-(--color-primary)"
									: "bg-(--color-surface) text-(--color-text-secondary) border-(--color-border) hover:border-(--color-primary)/40"
							}`}
						>
							<Icon size={15} />
							{label}
						</button>
					))}
				</div>

				{/* Date & time */}
				<label className="text-[0.7rem] sm:text-xs font-semibold text-(--color-text-tertiary) uppercase tracking-wider">
					Date &amp; time
				</label>
				<input
					type="datetime-local"
					className="input w-full mt-1.5 mb-4 px-3 py-2 text-sm rounded-lg"
					value={date}
					onChange={(e) => setDate(e.target.value)}
				/>

				{/* Meeting mode */}
				{kind === "meeting" && (
					<div className="mb-4">
						<label className="text-[0.7rem] sm:text-xs font-semibold text-(--color-text-tertiary) uppercase tracking-wider">
							Meeting type
						</label>
						<div className="grid grid-cols-2 gap-2 mt-1.5">
							{(
								[
									{
										key: "virtual" as const,
										label: "Virtual",
										Icon: Video,
									},
									{
										key: "physical" as const,
										label: "Physical",
										Icon: MapPin,
									},
								] as const
							).map(({ key, label, Icon }) => (
								<button
									key={key}
									type="button"
									onClick={() => setMode(key)}
									className={`flex items-center justify-center gap-2 py-2.5 px-2 rounded-lg border text-[0.75rem] sm:text-sm font-semibold cursor-pointer transition-colors ${
										mode === key
											? "bg-(--color-primary-light) text-(--color-primary) border-(--color-primary)"
											: "bg-(--color-surface) text-(--color-text-secondary) border-(--color-border) hover:border-(--color-primary)/40"
									}`}
								>
									<Icon size={15} />
									{label}
								</button>
							))}
						</div>

						<div className="mt-2.5">
							{mode === "virtual" ? (
								<input
									type="url"
									className="input w-full px-3 py-2 text-sm rounded-lg"
									placeholder="Meeting link (optional)"
									value={link}
									onChange={(e) => setLink(e.target.value)}
								/>
							) : (
								<input
									type="text"
									className="input w-full px-3 py-2 text-sm rounded-lg"
									placeholder="Location / venue (optional)"
									value={location}
									onChange={(e) => setLocation(e.target.value)}
								/>
							)}
							<p className="m-0 mt-1.5 text-[0.68rem] text-(--color-text-tertiary) flex items-center gap-1">
								{mode === "virtual" ? (
									<>
										<Link2 size={11} /> Share a video-call
										link so the team knows where to join.
									</>
								) : (
									<>
										<MapPin size={11} /> Add the venue so the
										team knows where to meet.
									</>
								)}
							</p>
						</div>
					</div>
				)}

				<div className="flex gap-2 pt-1">
					<button
						type="button"
						className="btn btn-secondary flex-1 py-2 rounded-lg text-sm font-semibold"
						onClick={onClose}
						disabled={saving}
					>
						Cancel
					</button>
					<button
						type="button"
						className="btn btn-primary flex-1 py-2 rounded-lg text-sm font-semibold"
						onClick={submit}
						disabled={!date || saving}
					>
						{saving ? "Saving..." : "Create Schedule"}
					</button>
				</div>
				<p className="m-0 mt-2.5 text-[0.68rem] text-(--color-text-tertiary) text-center">
					This updates the lead status to{" "}
					{kind === "meeting"
						? "Meeting scheduled"
						: "Callback scheduled"}
					.
				</p>
			</div>
		</Modal>
	);
};

export default ScheduleModal;
