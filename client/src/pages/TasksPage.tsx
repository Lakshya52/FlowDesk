import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import Avatar from "../components/common/Avatar";
import Modal from "../components/common/Modal";
import { useAuthStore } from "../store/authStore";
import { Search, Edit3, Trash2, X, Check, Plus, Loader2, CircleCheckBig, CircleX } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { useNavigate } from "react-router-dom";

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};
const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  completed: "Completed",
};

const TasksPage: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [currentTab, setCurrentTab] = useState<"all" | "my" | "review">("my");
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const navigate = useNavigate();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    assignedTo: user?._id || "",
    dueDate: "",
    noDueDate: false,
    priority: "medium",
    assignment: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);
  const [createColumnStatus, setCreateColumnStatus] = useState<string>("");

  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager";
  const isEmployee = user?.role === "member";
  const canEdit = true;

  // Cache companies and users (rarely change)
  const { data: companiesData } = useQuery({
    queryKey: ["companies-flat"],
    queryFn: async () => {
      const { data } = await api.get("/companies", {
        params: { flat: "true" },
      });
      return data.companies || [];
    },
  });
  const companies = companiesData || [];

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data } = await api.get("/auth/users");
      return data.users || [];
    },
  });
  const users = usersData || [];

  const { data: assignmentsData } = useQuery({
    queryKey: ["assignments"],
    queryFn: async () => {
      const { data } = await api.get("/assignments");
      return data.assignments || [];
    },
  });
  const assignments = assignmentsData || [];

  const { data: tasksData, isLoading: loading } = useQuery({
    queryKey: ["tasks", search, selectedCompany, currentTab, user?._id],
    queryFn: async () => {
      const params: any = {};
      if (search) params.search = search;
      if (selectedCompany) params.companyId = selectedCompany;
      if (currentTab === "my") params.assignedTo = user?._id;
      if (currentTab === "review") params.status = "review";
      const { data } = await api.get("/tasks", { params });
      return data.tasks || [];
    },
  });
  const tasks = tasksData || [];

  const { data: reviewTasksData } = useQuery({
    queryKey: ["tasks-review-count", selectedCompany],
    queryFn: async () => {
      const params: any = { status: "review" };
      if (selectedCompany) params.companyId = selectedCompany;
      const { data } = await api.get("/tasks", { params });
      return data.tasks || [];
    },
  });
  const reviewCount = reviewTasksData?.length || 0;

  const updateStatus = async (taskId: string, status: string) => {
    try {
      let targetStatus = status;
      if (isEmployee && status === "completed") {
        targetStatus = "review";
      }

      const { data } = await api.put(`/tasks/${taskId}`, {
        status: targetStatus,
      });
      // Update cache directly to avoid a full refetch
      queryClient.setQueryData(
        ["tasks", search, selectedCompany, currentTab, user?._id],
        (old: any[]) =>
          old ? old.map((t) => (t._id === taskId ? data.task : t)) : old,
      );
    } catch {}
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData("taskId", taskId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) {
      const task = tasks.find((t: any) => t._id === taskId);
      // Permissions check for drag and drop
      if (task && (canEdit || task.assignedTo?._id === user?._id)) {
        updateStatus(taskId, status);
      }
    }
    setDraggedTaskId(null);
  };

  const saveEdit = async (taskId: string) => {
    try {
      const { data } = await api.put(`/tasks/${taskId}`, editForm);
      queryClient.setQueryData(
        ["tasks", search, selectedCompany, currentTab, user?._id],
        (old: any[]) =>
          old ? old.map((t) => (t._id === taskId ? data.task : t)) : old,
      );
      setEditingTask(null);
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed");
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      queryClient.setQueryData(
        ["tasks", search, selectedCompany, currentTab, user?._id],
        (old: any[]) => (old ? old.filter((t) => t._id !== taskId) : old),
      );
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed");
    }
  };

  const handleCreateTask = async () => {
    if (!createForm.title.trim() || !createForm.assignedTo) return;
    setSubmitting(true);
    try {
      const payload: any = {
        title: createForm.title,
        description: createForm.description,
        assignedTo: createForm.assignedTo,
        priority: createForm.priority,
      };
      if (createForm.dueDate) payload.dueDate = createForm.dueDate;
      if (createForm.assignment) payload.assignment = createForm.assignment;
      if (createColumnStatus) payload.status = createColumnStatus;

      await api.post("/tasks", payload);
      setShowCreateModal(false);
      setCreateColumnStatus("");
      setCreateForm({
        title: "",
        description: "",
        assignedTo: user?._id || "",
        dueDate: "",
        noDueDate: false,
        priority: "medium",
        assignment: "",
      });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  const getDeadlineStyle = (dueDate: string, status: string) => {
    if (!dueDate || new Date(dueDate).getFullYear() <= 1970)
      return { color: "var(--color-text-tertiary)" };
    if (status === "completed") return { color: "#22c55e" };
    const days = differenceInDays(new Date(dueDate), new Date());
    if (days < 0) return { color: "#ef4444", fontWeight: 600 };
    if (days === 0) return { color: "#d97706", fontWeight: 600 };
    if (days <= 2) return { color: "#f59e0b" };
    return { color: "var(--color-text-tertiary)" };
  };

  const getDeadlineLabel = (dueDate: string, status: string) => {
    if (!dueDate || new Date(dueDate).getFullYear() <= 1970)
      return "No due date";
    if (status === "completed") return format(new Date(dueDate), "MMM d");
    const days = differenceInDays(new Date(dueDate), new Date());
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return "Due today";
    if (days <= 2) return `${days}d left`;
    return format(new Date(dueDate), "MMM d");
  };

  // Group tasks by status for board view
  const grouped = {
    todo: tasks.filter((t: any) => t.status === "todo"),
    in_progress: tasks.filter((t: any) => t.status === "in_progress"),
    review: tasks.filter((t: any) => t.status === "review"),
    completed: tasks.filter((t: any) => t.status === "completed"),
  };

  const columns = [
    { key: "todo", label: "To Do", color: "#94a3b8" },
    { key: "in_progress", label: "In Progress", color: "#3b82f6" },
    { key: "review", label: "Review", color: "#f59e0b" },
    { key: "completed", label: "Completed", color: "#22c55e" },
  ];

  return (
		<div className="flex flex-col justify-between items-start gap-3 mb-6 ">
			{/* Header */}
			<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full gap-2">
				<div>
					<h1
						style={{
							fontSize: "1.5rem",
							fontWeight: 700,
							letterSpacing: "-0.02em",
						}}
					>
						Tasks
					</h1>
					<p
						style={{
							fontSize: "0.875rem",
							color: "var(--color-text-secondary)",
							marginTop: 2,
						}}
					>
						{tasks.length} total tasks
					</p>
				</div>
				<button
					className="btn btn-primary w-full sm:w-auto"
					onClick={() => setShowCreateModal(true)}
					style={{ display: "flex", alignItems: "center", gap: 6 }}
				>
					<Plus size={16} /> Create Task
				</button>
			</div>

			{/* Tabs */}
			<div
				className="w-full flex overflow-x-scroll"
				style={{
					display: "flex",
					gap: 32,
					borderBottom: "1px solid var(--color-border)",
				}}
			>
				<button
					onClick={() => setCurrentTab("my")}
					style={{
						padding: "12px 4px",
						fontSize: "0.875rem",
						fontWeight: 500,
						color:
							currentTab === "my"
								? "var(--color-primary)"
								: "var(--color-text-secondary)",
						borderBottom: `2px solid ${currentTab === "my" ? "var(--color-primary)" : "transparent"}`,
						background: "none",
						borderTop: "none",
						borderLeft: "none",
						borderRight: "none",
						cursor: "pointer",
					}}
				>
					My&nbsp;Tasks
				</button>
				<button
					onClick={() => setCurrentTab("all")}
					style={{
						padding: "12px 4px",
						fontSize: "0.875rem",
						fontWeight: 500,
						color:
							currentTab === "all"
								? "var(--color-primary)"
								: "var(--color-text-secondary)",
						borderBottom: `2px solid ${currentTab === "all" ? "var(--color-primary)" : "transparent"}`,
						background: "none",
						borderTop: "none",
						borderLeft: "none",
						borderRight: "none",
						cursor: "pointer",
					}}
				>
					All&nbsp;Tasks
				</button>
				{(isAdmin || isManager) && (
					<button
						onClick={() => setCurrentTab("review")}
						style={{
							padding: "12px 4px",
							fontSize: "0.875rem",
							fontWeight: 500,
							color:
								currentTab === "review"
									? "var(--color-primary)"
									: "var(--color-text-secondary)",
							borderBottom: `2px solid ${currentTab === "review" ? "var(--color-primary)" : "transparent"}`,
							background: "none",
							borderTop: "none",
							borderLeft: "none",
							borderRight: "none",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: 6,
						}}
					>
						Under&nbsp;Review
						{reviewCount > 0 && (
							<span
								style={{
									backgroundColor: "#ef4444",
									color: "white",
									fontSize: "0.7rem",
									padding: "2px 6px",
									borderRadius: 10,
									minWidth: 18,
									textAlign: "center",
								}}
							>
								{reviewCount}
							</span>
						)}
					</button>
				)}
			</div>

			{/* Filters */}
			<div className="flex flex-col sm:flex-row gap-3 mb-6 w-full">
				<div className="w-full sm:max-w-[400px] relative">
					<Search
						size={16}
						style={{
							position: "absolute",
							left: 12,
							top: "50%",
							transform: "translateY(-50%)",
							color: "var(--color-text-tertiary)",
						}}
					/>
					<input
						className="input"
						style={{ paddingLeft: 36 }}
						placeholder="Search tasks..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>
				<div className="w-full sm:w-[250px]">
					<select
						className="select"
						value={selectedCompany}
						onChange={(e) => setSelectedCompany(e.target.value)}
						style={{ width: "100%" }}
					>
						<option value="">All Companies</option>
						{companies.map((c: any) => (
							<option key={c._id} value={c._id}>
								{c.name}
							</option>
						))}
					</select>
				</div>
			</div>

			{/* Kanban Board */}
			{loading ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
					{[1, 2, 3, 4].map((i) => (
						<div
							key={i}
							className="skeleton"
							style={{ height: 300, borderRadius: 12 }}
						/>
					))}
				</div>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 min-h-[400px] w-full">
					{columns.map((col) => (
						<div
							key={col.key}
							style={{
								background: "var(--color-surface-hover)",
								borderRadius: 12,
								padding: 8,
								border: draggedTaskId
									? `2px dashed ${col.color}40`
									: "2px solid transparent",
								transition: "all 0.2s ease",
							}}
							className="w-full min-h-[60dvh]"
							onDragOver={handleDragOver}
							onDrop={(e) => handleDrop(e, col.key)}
							onMouseEnter={() => setHoveredColumn(col.key)}
							onMouseLeave={() => setHoveredColumn(null)}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									marginBottom: 12,
									padding: "0 4px",
								}}
							>
								<div
									style={{
										width: 8,
										height: 8,
										borderRadius: "50%",
										background: col.color,
									}}
								/>
								<span
									style={{
										fontSize: "0.8125rem",
										fontWeight: 600,
									}}
								>
									{col.label}
								</span>
								<span
									style={{
										fontSize: "0.75rem",
										color: "var(--color-text-tertiary)",
										marginLeft: "auto",
									}}
								>
									{(grouped as any)[col.key]?.length || 0}
								</span>
							</div>
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: 8,
								}}
							>
								{(grouped as any)[col.key]?.length === 0 ? (
									<div
										style={{
											padding: 24,
											textAlign: "center",
											color: "var(--color-text-tertiary)",
											fontSize: "0.75rem",
											display: hoveredColumn === col.key ? "none" : "block",
										}}
									>
										No tasks
									</div>
								) : (
									<>
										{(grouped as any)[col.key].map(
											(t: any) => (
												<div key={t._id} className="card" style={{
														padding: "12px",
														borderRadius: "4px",
														cursor:
															canEdit ||
															t.assignedTo
																?._id ===
																user?._id
																? "grab"
																: "default",
														opacity:
															draggedTaskId ===
															t._id
																? 0.5
																: 1,
														border:
															draggedTaskId ===
															t._id
																? `1px solid ${col.color}`
																: "1px solid var(--color-border)",
													}}
													draggable={
														canEdit ||
														t.assignedTo?._id ===
															user?._id
													}
													onDragStart={(e) =>
														handleDragStart(
															e,
															t._id,
														)
													}
												>
													{editingTask === t._id ? (
														<div
															style={{
																display: "flex",
																flexDirection:
																	"column",
																gap: 8,
															}}
														>
															<input
																className="input"
																style={{
																	fontSize:
																		"0.8125rem",
																}}
																value={
																	editForm.title
																}
																onChange={(e) =>
																	setEditForm(
																		{
																			...editForm,
																			title: e
																				.target
																				.value,
																		},
																	)
																}
															/>
															<select
																className="select"
																style={{
																	fontSize:
																		"0.75rem",
																}}
																value={
																	editForm.assignedTo
																}
																onChange={(e) =>
																	setEditForm(
																		{
																			...editForm,
																			assignedTo:
																				e
																					.target
																					.value,
																		},
																	)
																}
															>
																{users.map(
																	(
																		u: any,
																	) => (
																		<option
																			key={
																				u._id
																			}
																			value={
																				u._id
																			}
																		>
																			{
																				u.name
																			}
																		</option>
																	),
																)}
															</select>
															<input
																className="input"
																type="date"
																style={{
																	fontSize:
																		"0.75rem",
																}}
																value={
																	editForm.dueDate?.split(
																		"T",
																	)[0] || ""
																}
																onChange={(e) =>
																	setEditForm(
																		{
																			...editForm,
																			dueDate:
																				e
																					.target
																					.value,
																		},
																	)
																}
															/>
															<label
																style={{
																	display:
																		"flex",
																	alignItems:
																		"center",
																	gap: 4,
																	cursor: "pointer",
																	fontSize:
																		"0.7rem",
																	color: "var(--color-text-tertiary)",
																}}
															>
																<input
																	type="checkbox"
																	checked={
																		!editForm.dueDate
																	}
																	onChange={(
																		e,
																	) => {
																		if (
																			e
																				.target
																				.checked
																		) {
																			setEditForm(
																				{
																					...editForm,
																					dueDate:
																						"",
																				},
																			);
																		} else {
																			// Re-set to a default date if unchecked
																			const today =
																				new Date()
																					.toISOString()
																					.split(
																						"T",
																					)[0];
																			setEditForm(
																				{
																					...editForm,
																					dueDate:
																						today,
																				},
																			);
																		}
																	}}
																/>
																No Due Date
															</label>
															<select
																className="select"
																style={{
																	fontSize:
																		"0.75rem",
																}}
																value={
																	editForm.priority
																}
																onChange={(e) =>
																	setEditForm(
																		{
																			...editForm,
																			priority:
																				e
																					.target
																					.value,
																		},
																	)
																}
															>
																{Object.entries(
																	PRIORITY_LABELS,
																).map(
																	([k,v,]) => (
																		<option key={k} value={k} >
																			{v}
																		</option>
																	),
																)}
															</select>
															<div
                                                                style={{
																	display:"flex",
																	gap: 4,
																	justifyContent:"flex-end",
																}}
															>
																<button	className="btn btn-ghost btn-xs"	onClick={() =>setEditingTask(null,)} >
																	<X size={12} />
																</button>
																<button
																	className="btn btn-primary btn-xs"
																	onClick={() =>
																		saveEdit(
																			t._id,
																		)
																	}
																>
																	<Check
																		size={
																			12
																		}
																	/>{" "}
																	Save
																</button>
															</div>
														</div>
													) : (
														<>
															<div
																style={{
																	display:
																		"flex",
																	justifyContent:
																		"space-between",
																	alignItems:
																		"flex-start",
																	marginBottom: 4,
																	borderBottom:
																		"1px solid var(--color-border)",
																}}
															>
																<div
																	style={{
																		fontSize:
																			"0.6875rem",
																		textTransform:
																			"uppercase",
																		color: "var(--color-primary)",
																		fontWeight: 600,
																		cursor: t.assignment
																			? "pointer"
																			: "default",
																		textDecoration:
																			t.assignment
																				? "underline"
																				: "none",
																		textUnderlineOffset: 2,
																	}}
																	onClick={() => {
																		if (
																			t
																				.assignment
																				?._id
																		) {
																			navigate(
																				`/assignments/${t.assignment._id}`,
																			);
																		} else {
																			alert(
																				"This is a standalone task and not linked to any specific project",
																			);
																		}
																	}}
																>
																	{t
																		.assignment
																		?.title ||
																		"General"}
																</div>
																<span
																	className={`badge badge-${t.priority}`}
																	style={{
																		fontSize:
																			"0.625rem",
																	}}
																>
																	{
																		PRIORITY_LABELS[
																			t
																				.priority
																		]
																	}
																</span>
															</div>
															<div
																className="font-bold"
																style={{
																	fontSize:
																		"0.8125rem",
																	lineHeight: 1.4,
																}}
															>
																{t.title}
															</div>
															<div
																style={{
																	fontSize:
																		"0.8125rem",
																	marginBottom: 8,
																	lineHeight: 1.4,
																}}
															>
																{t.description}
															</div>
															<div
																style={{
																	display:
																		"flex",
																	justifyContent:
																		"space-between",
																	alignItems:
																		"center",
																}}
															>
																<div
																	style={{
																		display:
																			"flex",
																		alignItems:
																			"center",
																		gap: 4,
																	}}
																>
																	<Avatar
																		src={
																			t
																				.assignedTo
																				?.avatar
																		}
																		name={
																			t
																				.assignedTo
																				?.name
																		}
																		size={
																			20
																		}
																	/>
																	<span
																		style={{
																			fontSize:
																				"0.6875rem",
																			color: "var(--color-text-secondary)",
																		}}
																	>
																		{
																			t.assignedTo?.name?.split(
																				" ",
																			)[0]
																		}
																	</span>
																</div>
																<span
																	style={{
																		fontSize:
																			"0.6875rem",
																		...getDeadlineStyle(
																			t.dueDate,
																			t.status,
																		),
																	}}
																>
																	{getDeadlineLabel(
																		t.dueDate,
																		t.status,
																	)}
																</span>
															</div>

															{/* Actions row */}
															<div
																style={{
																	marginTop: 8,
																	borderTop:
																		"1px solid var(--color-border)",
																	paddingTop: 8,
																}}
															>
																{t.status ===
																	"review" &&
																(isAdmin ||
																	isManager) ? (
																	<div
																		style={{
																			display:
																				"flex",
																			gap: 6,
																		}}
																	>
																		<button
																			className="btn btn-xs"
																			style={{
                                                                        flex: 1,
																				backgroundColor:
																					"#ef4444",
                                                                          color: "white",
                                                                          border: "none",
                                                                        }}
																			onClick={() =>
																				updateStatus(
																					t._id,
																					"in_progress",
																				)
																			}
																		>
																			Reject
																		</button>
                                                                        <button
                                                                          className="btn btn-xs"
                                                                          style={{
                                                                            flex: 1,
                                                                            backgroundColor:
                                                                              "#22c55e",
                                                                            color: "white",
                                                                            border: "none",
                                                                          }}
                                                                          onClick={() =>
                                                                            updateStatus(
                                                                              t._id,
                                                                              "completed",
                                                                            )
                                                                          }
                                                                        >
                                                                          <CircleCheckBig size={15}/> Approve
                                                                        </button>
																	</div>
																) : (
																	<div
																		style={{
																			display:
																				"flex",
																			justifyContent:
																				"space-between",
																			alignItems:
																				"center",
																		}}
																	>
																		{(canEdit ||
																			t
																				.assignedTo
																				?._id ===
																				user?._id) &&
																		t.status !==
																			"completed" ? (
																			<>
																				<select
																					className="select"
																					style={{
																						fontSize:
																							"0.75rem",
																						padding:
																							"4px 24px 4px 8px",
																						flex: 1,
																					}}
																					value={
																						t.status
																					}
																					onChange={(
																						e,
																					) =>
																						updateStatus(
																							t._id,
																							e
																								.target
																								.value,
																						)
																					}
																				>
																					{Object.entries(
																						STATUS_LABELS,
																					).map(
																						([
																							k,
																							v,
																						]) => {
																							if (
																								isEmployee &&
																								k ===
																									"completed"
																							)
																								return (
																									<option
																										key={
																											k
																										}
																										value="review"
																									>
																										Mark
																										for
																										Review
																									</option>
																								);
																							return (
																								<option
																									key={
																										k
																									}
																									value={
																										k
																									}
																								>
																									{
																										v
																									}
																								</option>
																							);
																						},
																					)}
																				</select>
																				<div>
																					{canEdit && (
																						<div
																							style={{
																								display:
																									"flex",
																								gap: 2,
																								marginLeft: 4,
																							}}
																						>
																							<button
																								className="btn btn-ghost btn-xs"
																								onClick={() => {
																									setEditingTask(
																										t._id,
																									);
																									setEditForm(
																										{
																											title: t.title,
																											assignedTo:
																												t
																													.assignedTo
																													?._id,
																											dueDate:
																												t.dueDate,
																											priority:
																												t.priority,
																										},
																									);
																								}}
																							>
																								<Edit3 size={12}
																							/>
																							</button>
																							<button className="btn text-(--color-error) btn-ghost btn-xs" onClick={() => deleteTask(t._id,)}>
																								<Trash2 size={12} />
																							</button>
																						</div>
																					)}
																				</div>
																			</>
																		) : (
																			<div />
																		)}
																	</div>
																)}
															</div>
														</>
													)}
												</div>
											),
										)}
									</>
								)}
								{hoveredColumn === col.key && (
									<div
										className="card"
										style={{
											padding: "12px",
											borderRadius: "4px",
											cursor: "pointer",
											border: "1px dashed var(--color-border)",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											gap: 6,
											color: "var(--color-text-tertiary)",
											fontSize: "0.8125rem",
											transition: "all 0.2s ease",
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.borderColor = col.color;
											e.currentTarget.style.color = col.color;
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.borderColor = "var(--color-border)";
											e.currentTarget.style.color = "var(--color-text-tertiary)";
										}}
										onClick={() => {
											setCreateColumnStatus(col.key);
											setShowCreateModal(true);
										}}
									>
										<Plus size={14} /> New Task
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			)}

			{/* Create Task Modal */}
			<Modal
				isOpen={showCreateModal}
				onClose={() => {
					setShowCreateModal(false);
					setCreateColumnStatus("");
				}}
			>
				<div
					className="card animate-fade-in"
					style={{
						maxWidth: 500,
						width: "100%",
						padding: 0,
						overflow: "hidden",
						borderRadius: 16,
					}}
				>
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
							<div
								style={{
									width: 36,
									height: 36,
									borderRadius: 10,
									background: "var(--color-primary-light)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
								}}
							>
								<Plus size={18} style={{ color: "var(--color-primary)" }} />
							</div>
							<div>
								<h3
									style={{
										fontSize: "1rem",
										fontWeight: 700,
										margin: 0,
									}}
								>
									Create Task
								</h3>
								<p
									style={{
										fontSize: "0.72rem",
										color: "var(--color-text-tertiary)",
										margin: "2px 0 0",
									}}
								>
									Add a new task to the board
								</p>
							</div>
						</div>
						<button
							style={{
								background: "var(--color-surface-hover)",
								border: "none",
								cursor: "pointer",
								color: "var(--color-text-tertiary)",
								width: 32,
								height: 32,
								borderRadius: 8,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
							onClick={() => setShowCreateModal(false)}
						>
							<X size={16} />
						</button>
					</div>

					<div
						style={{
							padding: 24,
							display: "flex",
							flexDirection: "column",
							gap: 18,
						}}
					>
						<div>
							<label
								style={{
									display: "block",
									fontSize: "0.75rem",
									color: "var(--color-text-secondary)",
									marginBottom: 6,
								}}
							>
								Title{" "}
								<span style={{ color: "var(--color-danger)" }}>
									*
								</span>
							</label>
							<input
								type="text"
								className="input"
								placeholder="e.g. Design landing page"
								value={createForm.title}
								onChange={(e) =>
									setCreateForm({
										...createForm,
										title: e.target.value,
									})
								}
							/>
						</div>

						<div>
							<label
								style={{
									display: "block",
									fontSize: "0.75rem",
									color: "var(--color-text-secondary)",
									marginBottom: 6,
								}}
							>
								Description{" "}
								<span style={{ color: "var(--color-danger)" }}>
									*
								</span>
							</label>
							<textarea
								className="input"
								style={{ minHeight: 70, resize: "vertical" }}
								placeholder="Task details..."
								value={createForm.description}
								onChange={(e) =>
									setCreateForm({
										...createForm,
										description: e.target.value,
									})
								}
							/>
						</div>

						<div>
							<label
								style={{
									display: "block",
									fontSize: "0.75rem",
									color: "var(--color-text-secondary)",
									marginBottom: 6,
								}}
							>
								Project{" "}
								<span
									style={{
										fontSize: "0.7rem",
										color: "var(--color-text-tertiary)",
									}}
								>
									(optional)
								</span>
							</label>
							<select
								className="select"
								value={createForm.assignment}
								onChange={(e) =>
									setCreateForm({
										...createForm,
										assignment: e.target.value,
									})
								}
								style={{ width: "100%" }}
							>
								<option value="">
									Standalone task (no project)
								</option>
								{assignments.map((a: any) => (
									<option key={a._id} value={a._id}>
										{a.title}
									</option>
								))}
							</select>
						</div>

						{/* {createForm == null && ( */}
						<div
							className={` ${createForm.assignment == "" ? "hidden" : null} `}
						>
							<label
								style={{
									display: "block",
									fontSize: "0.75rem",
									color: "var(--color-text-secondary)",
									marginBottom: 6,
								}}
							>
								Assign To{" "}
								<span style={{ color: "var(--color-danger)" }}>
									*
								</span>
							</label>
							<select
								className="select"
								value={createForm.assignedTo}
								onChange={(e) =>
									setCreateForm({
										...createForm,
										assignedTo: e.target.value,
									})
								}
								style={{ width: "100%" }}
							>
								{createForm.assignment == "" ? (
									<>
										<option value="">Select a user</option>
										{users.map((u: any) => (
											<option key={u._id} value={u._id}>
												{u.name}
											</option>
										))}
									</>
								) : (
									<option key={user?._id} value={user?._id}>
										{user?.name}
									</option>
								)}
							</select>
						</div>
						{/* )} */}

						<div
							style={{
								display: "grid",
								gridTemplateColumns: "1fr 1fr",
								gap: 12,
							}}
						>
							<div>
								<label
									style={{
										display: "block",
										fontSize: "0.75rem",
										color: "var(--color-text-secondary)",
										marginBottom: 6,
									}}
								>
									Due Date
								</label>
								<input
									type="date"
									className="input"
									value={createForm.dueDate}
									onChange={(e) =>
										setCreateForm({
											...createForm,
											dueDate: e.target.value,
											noDueDate: false,
										})
									}
									disabled={createForm.noDueDate}
									style={{ width: "100%", marginBottom: 4 }}
								/>
								<label
									style={{
										display: "flex",
										alignItems: "center",
										gap: 4,
										cursor: "pointer",
										fontSize: "0.7rem",
										color: "var(--color-text-tertiary)",
									}}
								>
									<input
										type="checkbox"
										checked={createForm.noDueDate}
										onChange={(e) =>
											setCreateForm({
												...createForm,
												dueDate: e.target.checked
													? ""
													: createForm.dueDate,
												noDueDate: e.target.checked,
											})
										}
									/>
									No Due Date
								</label>
							</div>
							<div>
								<label
									style={{
										display: "block",
										fontSize: "0.75rem",
										color: "var(--color-text-secondary)",
										marginBottom: 6,
									}}
								>
									Priority
								</label>
								<select
									className="select"
									value={createForm.priority}
									onChange={(e) =>
										setCreateForm({
											...createForm,
											priority: e.target.value,
										})
									}
									style={{ width: "100%" }}
								>
									{Object.entries(PRIORITY_LABELS).map(
										([k, v]) => (
											<option key={k} value={k}>
												{v}
											</option>
										),
									)}
								</select>
							</div>
						</div>

						<button
							className="btn btn-primary"
							style={{
								width: "100%",
								marginTop: 4,
								padding: "10px",
							}}
							disabled={
								!createForm.title.trim() ||
								!createForm.assignedTo ||
								submitting
							}
							onClick={handleCreateTask}
						>
							{submitting ? (
								<Loader2 size={16} className="animate-spin" />
							) : null}
							{submitting ? "Creating..." : "Create Task"}
						</button>
					</div>
				</div>
			</Modal>
		</div>
  );
};

export default TasksPage;
