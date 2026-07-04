"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importAssignmentsExcel = exports.previewImportAssignments = exports.downloadSampleAssignmentsExcel = exports.updateAssignmentCanvas = exports.deleteAssignment = exports.updateAssignment = exports.getAssignment = exports.getAssignments = exports.createAssignment = void 0;
const Assignment_1 = __importDefault(require("../models/Assignment"));
const ActivityLog_1 = __importStar(require("../models/ActivityLog"));
const notificationService_1 = require("../services/notificationService");
const Notification_1 = require("../models/Notification");
const tenant_1 = require("../utils/tenant");
const xlsx_1 = __importDefault(require("xlsx"));
const createAssignment = async (req, res) => {
    try {
        const { teams: teamIds, team: memberIds = [], ...rest } = req.body;
        // Always include the project creator
        let allMemberIds = new Set([
            req.user._id.toString(),
            ...memberIds.map(String),
        ]);
        if (teamIds && Array.isArray(teamIds) && teamIds.length > 0) {
            const Team = (await Promise.resolve().then(() => __importStar(require("../models/Team")))).default;
            const teams = await Team.find({ _id: { $in: teamIds } });
            // Include all team members
            const teamInvites = teams.flatMap((t) => t.members.map((m) => m.toString()));
            teamInvites.forEach((id) => allMemberIds.add(id));
            // Collect managers and add them
            const managerIds = teams
                .map((t) => t.manager?.toString())
                .filter(Boolean);
            managerIds.forEach((id) => allMemberIds.add(id));
        }
        const assignment = await Assignment_1.default.create({
            ...rest,
            teams: teamIds,
            team: Array.from(allMemberIds),
            createdBy: req.user._id,
        });
        await ActivityLog_1.default.create({
            action: "Assignment created",
            user: req.user._id,
            entityType: ActivityLog_1.EntityType.ASSIGNMENT,
            entityId: assignment._id,
            metadata: { title: assignment.title },
        });
        const populated = await Assignment_1.default.findById(assignment._id)
            .populate("createdBy", "name email")
            .populate("team", "name email avatar")
            .populate("companyId", "name industry")
            .populate({
            path: "teams",
            populate: [
                { path: "manager", select: "name email avatar" },
                { path: "members", select: "name email avatar role" },
            ],
        });
        // Notify team members (except creator)
        const notificationPayloads = Array.from(allMemberIds)
            .filter((userId) => userId !== req.user._id.toString())
            .map((userId) => ({
            user: userId,
            type: Notification_1.NotificationType.PROJECT_CREATED,
            title: "New Project Assigned",
            message: `You have been assigned to a new project: ${assignment.title}`,
            link: `/assignments/${assignment._id}?tab=tasks`,
        }));
        if (notificationPayloads.length > 0) {
            console.log(`📡 Creating ${notificationPayloads.length} notifications for project: ${assignment.title}`);
            console.log(`👥 Target user IDs: ${notificationPayloads.map((p) => p.user).join(", ")}`);
            await (0, notificationService_1.createNotifications)(notificationPayloads);
        }
        else {
            console.log("⚠️ No other members to notify for this project.");
        }
        // if (assignment.isRecurring) {
        //   await processRecurringAssignments();
        // }
        res.status(201).json({ assignment: populated });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createAssignment = createAssignment;
const getAssignments = async (req, res) => {
    try {
        const { status, priority, search, companyId, isBlueprint } = req.query;
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        const filter = {};
        if (status)
            filter.status = status;
        if (priority)
            filter.priority = priority;
        if (companyId)
            filter.companyId = companyId;
        // Blueprint filtering
        if (isBlueprint === "true") {
            filter.isRecurring = true;
            filter.parentAssignmentId = null;
        }
        else if (isBlueprint === "false") {
            // Non-blueprint means: either not recurring OR has a parent assignment
            filter.$or = [
                { isRecurring: { $ne: true } },
                { parentAssignmentId: { $exists: true, $ne: null } },
            ];
        }
        let searchFilter = {};
        if (search) {
            searchFilter.$or = [
                { title: { $regex: search, $options: "i" } },
                { clientName: { $regex: search, $options: "i" } },
            ];
        }
        // Base tenant filter: assignments created by users in this tenant
        const tenantFilter = { createdBy: { $in: tenantUserIds } };
        let roleFilter = {};
        if (req.user.role === "member") {
            roleFilter.$or = [{ team: req.user._id }, { createdBy: req.user._id }];
        }
        else if (req.user.role === "manager") {
            const Team = (await Promise.resolve().then(() => __importStar(require("../models/Team")))).default;
            const managedTeams = await Team.find({ manager: req.user._id }).distinct("_id");
            roleFilter.$or = [
                { createdBy: req.user._id },
                { teams: { $in: managedTeams } },
                { team: req.user._id },
            ];
        }
        // Admin: no role filter, only tenant filter applies
        // Combine all filters using $and to avoid overwriting $or
        const finalFilter = { ...filter };
        const conditions = [tenantFilter];
        if (Object.keys(searchFilter).length > 0)
            conditions.push(searchFilter);
        if (Object.keys(roleFilter).length > 0)
            conditions.push(roleFilter);
        if (conditions.length > 0) {
            finalFilter.$and = conditions;
        }
        const assignments = await Assignment_1.default.find(finalFilter)
            .populate("createdBy", "name email")
            .populate("team", "name email avatar")
            .populate("companyId", "name industry")
            .populate({
            path: "teams",
            populate: [
                { path: "manager", select: "name email avatar" },
                { path: "members", select: "name email avatar role" },
            ],
        })
            .sort({ createdAt: -1 });
        res.json({ assignments });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAssignments = getAssignments;
const getAssignment = async (req, res) => {
    try {
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        const assignment = await Assignment_1.default.findById(req.params.id)
            .populate("createdBy", "name email")
            .populate("team", "name email avatar")
            .populate("companyId", "name industry")
            .populate({
            path: "teams",
            populate: [
                { path: "manager", select: "name email avatar" },
                { path: "members", select: "name email avatar role" },
            ],
        });
        if (!assignment) {
            res.status(404).json({ message: "Assignment not found" });
            return;
        }
        // Tenant check: only allow if creator or team members are in this tenant
        const creatorId = (assignment.createdBy?._id || assignment.createdBy).toString();
        const creatorInTenant = tenantUserIds.includes(creatorId);
        const teamInTenant = assignment.team?.some((id) => tenantUserIds.includes((id._id || id).toString()));
        if (!creatorInTenant && !teamInTenant) {
            res.status(403).json({ message: "Access denied" });
            return;
        }
        res.json({ assignment });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAssignment = getAssignment;
const updateAssignment = async (req, res) => {
    try {
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        const assignment = await Assignment_1.default.findById(req.params.id);
        if (!assignment) {
            res.status(404).json({ message: "Assignment not found" });
            return;
        }
        // Tenant check
        const creatorInTenant = tenantUserIds.includes(assignment.createdBy.toString());
        const teamInTenant = assignment.team?.some((id) => tenantUserIds.includes(id.toString()));
        if (!creatorInTenant && !teamInTenant) {
            res.status(403).json({ message: "Access denied" });
            return;
        }
        // Authorization check: Admin OR In Team OR Creator
        const isCreator = assignment.createdBy.toString() === req.user._id.toString();
        const isInTeam = assignment.team?.some((id) => id.toString() === req.user._id.toString());
        if (req.user.role !== "admin" && !isCreator && !isInTeam) {
            res.status(403).json({
                message: "Insufficient permissions: You are not included in this project.",
            });
            return;
        }
        // Capture changes for detailed logging
        const changes = {};
        Object.keys(req.body).forEach((key) => {
            const oldValue = assignment[key];
            const newValue = req.body[key];
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                changes[key] = { old: oldValue, new: newValue };
            }
        });
        // Sanitize ObjectId fields: convert empty strings to null
        const sanitizedBody = { ...req.body };
        if (sanitizedBody.companyId === "")
            sanitizedBody.companyId = null;
        Object.assign(assignment, sanitizedBody);
        // Auto-assign Team Members if teams were updated or manual team list changed
        if (req.body.teams || req.body.team) {
            const teamIds = req.body.teams || assignment.teams;
            // Get the list of individual member IDs provided in the request
            // If not provided, fall back to current list (handle populated vs unpopulated)
            let manualMemberIds = [];
            if (req.body.team) {
                manualMemberIds = req.body.team.map((id) => id.toString());
            }
            else {
                manualMemberIds = (assignment.team || []).map((m) => (m._id || m).toString());
            }
            let allMemberIds = [...manualMemberIds];
            if (teamIds && Array.isArray(teamIds) && teamIds.length > 0) {
                const Team = (await Promise.resolve().then(() => __importStar(require("../models/Team")))).default;
                const teams = await Team.find({ _id: { $in: teamIds } });
                // Include all team members
                const teamInvites = teams.flatMap((t) => t.members.map((m) => m.toString()));
                // Merge with manual IDs, but respect the fact that some might have been
                // explicitly removed from the manual list (optional behavior)
                // For now, keep the policy: Team members ALWAYS have access.
                allMemberIds = Array.from(new Set([...allMemberIds, ...teamInvites]));
            }
            assignment.team = allMemberIds;
            assignment.teams = teamIds;
        }
        await assignment.save();
        const updated = await Assignment_1.default.findById(assignment._id)
            .populate("createdBy", "name email")
            .populate("team", "name email avatar")
            .populate("companyId", "name industry")
            .populate({
            path: "teams",
            populate: [
                { path: "manager", select: "name email avatar" },
                { path: "members", select: "name email avatar role" },
            ],
        });
        await ActivityLog_1.default.create({
            action: "Assignment updated",
            user: req.user._id,
            entityType: ActivityLog_1.EntityType.ASSIGNMENT,
            entityId: updated._id,
            metadata: {
                title: updated.title,
                changes,
            },
        });
        // Notify team members if status changed
        if (changes.status) {
            const teamIds = updated.team.map((user) => user._id.toString());
            const notificationPayloads = teamIds
                .filter((userId) => userId !== req.user._id.toString())
                .map((userId) => ({
                user: userId,
                type: Notification_1.NotificationType.STATUS_CHANGED,
                title: "Project Status Updated",
                message: `Project "${updated.title}" status was changed to ${updated.status}`,
                link: `/assignments/${updated._id}`,
            }));
            if (notificationPayloads.length > 0) {
                await (0, notificationService_1.createNotifications)(notificationPayloads);
            }
        }
        // if (updated!.isRecurring) {
        //   await processRecurringAssignments();
        // }
        res.json({ assignment: updated });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateAssignment = updateAssignment;
const deleteAssignment = async (req, res) => {
    try {
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        console.log(`🗑️ Attempting to delete assignment: ${req.params.id} by user: ${req.user?._id}`);
        const assignment = await Assignment_1.default.findById(req.params.id);
        if (!assignment) {
            res.status(404).json({ message: "Assignment not found" });
            return;
        }
        // Tenant check
        const creatorInTenant = tenantUserIds.includes(assignment.createdBy.toString());
        const teamInTenant = assignment.team?.some((id) => tenantUserIds.includes(id.toString()));
        if (!creatorInTenant && !teamInTenant) {
            res.status(403).json({ message: "Access denied" });
            return;
        }
        // Authorization check: Admin OR In Team OR Creator
        const isCreator = assignment.createdBy.toString() === req.user._id.toString();
        const isInTeam = assignment.team?.some((id) => id.toString() === req.user._id.toString());
        if (req.user.role !== "admin" && !isCreator && !isInTeam) {
            res.status(403).json({
                message: "Insufficient permissions: You are not included in this project.",
            });
            return;
        }
        await assignment.deleteOne();
        await ActivityLog_1.default.create({
            action: "Assignment deleted",
            user: req.user._id,
            entityType: ActivityLog_1.EntityType.ASSIGNMENT,
            entityId: assignment._id,
            metadata: { title: assignment.title },
        });
        res.json({ message: "Assignment deleted successfully" });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteAssignment = deleteAssignment;
const updateAssignmentCanvas = async (req, res) => {
    try {
        const { id } = req.params;
        const { canvasData } = req.body;
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        const assignment = await Assignment_1.default.findById(id);
        if (!assignment) {
            res.status(404).json({ message: "Assignment not found" });
            return;
        }
        // Tenant check
        const creatorInTenant = tenantUserIds.includes(assignment.createdBy.toString());
        const teamInTenant = assignment.team?.some((id) => tenantUserIds.includes(id.toString()));
        if (!creatorInTenant && !teamInTenant) {
            res.status(403).json({ message: "Access denied" });
            return;
        }
        // Everyone authorized to update canvas
        // (Removed role/creator/team check)
        const oldCanvasData = assignment.canvasData || [];
        const newCanvasData = canvasData || [];
        let changeSummary = "Modified canvas";
        if (Array.isArray(oldCanvasData) && Array.isArray(newCanvasData)) {
            if (newCanvasData.length > oldCanvasData.length)
                changeSummary = "Added note(s) to canvas";
            else if (newCanvasData.length < oldCanvasData.length)
                changeSummary = "Removed note(s) from canvas";
            else
                changeSummary = "Rearranged/Edited notes on canvas";
        }
        assignment.canvasData = canvasData;
        assignment.markModified("canvasData");
        await assignment.save();
        await ActivityLog_1.default.create({
            action: "Canvas updated",
            user: req.user._id,
            entityType: ActivityLog_1.EntityType.ASSIGNMENT,
            entityId: assignment._id,
            metadata: {
                summary: changeSummary,
                noteCount: newCanvasData.length,
                previousCount: oldCanvasData.length,
            },
        });
        res.json({ success: true, message: "Canvas data updated" });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateAssignmentCanvas = updateAssignmentCanvas;
const ASSIGNMENT_IMPORT_COLUMNS = [
    "title", "clientName", "description", "priority",
    "status", "startDate", "dueDate", "isRecurring",
];
const TASK_IMPORT_COLUMNS = [
    "projectTitle", "title", "description", "assignedTo", "dueDate", "priority",
];
const normalizeRow = (row) => {
    return {
        title: row.title || row.Title || row.TITLE || "",
        clientName: row.clientName || row.client_name || row["Client Name"] || row.Client || row.companyName || "",
        description: row.description || row.Description || row.DESC || "",
        priority: (row.priority || row.Priority || "medium").toString().toLowerCase().replace(" ", "_"),
        status: (row.status || row.Status || "not_started").toString().toLowerCase().replace(" ", "_"),
        startDate: row.startDate || row.start_date || row["Start Date"] || row.StartDate || "",
        dueDate: row.dueDate || row.due_date || row["Due Date"] || row.DueDate || "",
        isRecurring: row.isRecurring || row["Is Recurring"] || row.is_recurring || false,
    };
};
const normalizeTaskRow = (row) => {
    return {
        projectTitle: row.projectTitle || row["Project Title"] || row.Project || row.project_title || "",
        title: row.title || row.Title || row.TITLE || "",
        description: row.description || row.Description || row.DESC || "",
        assignedTo: row.assignedTo || row["Assigned To"] || row.AssignedTo || "",
        dueDate: row.dueDate || row.due_date || row["Due Date"] || row.DueDate || "",
        priority: (row.priority || row.Priority || "medium").toString().toLowerCase().replace(" ", "_"),
    };
};
const validateAssignmentRow = (row, index) => {
    const errors = [];
    if (!row.title)
        errors.push("title is required");
    if (!row.clientName)
        errors.push("clientName is required");
    if (!row.startDate)
        errors.push("startDate is required");
    const validPriorities = ["low", "medium", "high", "urgent"];
    if (row.priority && !validPriorities.includes(row.priority)) {
        errors.push(`priority must be one of: ${validPriorities.join(", ")}`);
    }
    const validStatuses = ["not_started", "in_progress", "completed", "delayed"];
    if (row.status && !validStatuses.includes(row.status)) {
        errors.push(`status must be one of: ${validStatuses.join(", ")}`);
    }
    if (row.startDate && isNaN(Date.parse(row.startDate))) {
        errors.push("startDate is not a valid date");
    }
    if (row.dueDate && isNaN(Date.parse(row.dueDate))) {
        errors.push("dueDate is not a valid date");
    }
    return errors;
};
const validateTaskRow = (row) => {
    const errors = [];
    if (!row.projectTitle)
        errors.push("projectTitle is required (must match a project title in the Projects sheet)");
    if (!row.title)
        errors.push("title is required");
    if (!row.description)
        errors.push("description is required");
    const validPriorities = ["low", "medium", "high", "urgent"];
    if (row.priority && !validPriorities.includes(row.priority)) {
        errors.push(`priority must be one of: ${validPriorities.join(", ")}`);
    }
    if (row.dueDate && isNaN(Date.parse(row.dueDate))) {
        errors.push("dueDate is not a valid date");
    }
    return errors;
};
const INSTRUCTIONS_ROWS = [
    ["📋 PROJECT IMPORT INSTRUCTIONS"],
    [""],
    ["This Excel file has 3 sheets: Instructions, Projects, and Tasks."],
    [""],
    ["━━━ PROJECTS SHEET ━━━"],
    ["Each row = one project to create. Required columns are marked with *"],
    [""],
    ["Column         Required  Description"],
    ["title *        Yes       Project / assignment name"],
    ["clientName *   Yes       Client or company name for the project"],
    ["description    No        Brief description of the project scope"],
    ["priority       No        low | medium | high | urgent (default: medium)"],
    ["status         No        not_started | in_progress | completed | delayed (default: not_started)"],
    ["startDate *    Yes       Project start date (YYYY-MM-DD, e.g. 2025-01-15)"],
    ["dueDate        No        Project due date (YYYY-MM-DD). Leave blank for no due date"],
    ["isRecurring    No        TRUE or FALSE (default: FALSE). Marks as recurring blueprint"],
    [""],
    ["━━━ TASKS SHEET ━━━"],
    ["Each row = one task. Tasks are linked to projects using the projectTitle column."],
    ["The projectTitle must exactly match a title in the Projects sheet."],
    [""],
    ["Column         Required  Description"],
    ["projectTitle * Yes       Must match a title from the Projects sheet (case-insensitive)"],
    ["title *        Yes       Task name"],
    ["description *  Yes       Detailed task description"],
    ["assignedTo     No        Leave blank — tasks will be auto-assigned to the importing user"],
    ["dueDate        No        Task due date (YYYY-MM-DD). Leave blank for no due date"],
    ["priority       No        low | medium | high | urgent (default: medium)"],
    [""],
    ["━━━ TIPS ━━━"],
    ["- Do NOT change or remove the header row in any sheet"],
    ["- Both sheets are imported together — projects are created first, then tasks are linked"],
    ["- If a task references a project title that doesn't exist or has errors, it will be skipped"],
    ["- Rows with validation errors will be skipped during import"],
    ["- The preview screen shows all valid and invalid rows before you confirm"],
];
const downloadSampleAssignmentsExcel = async (_req, res) => {
    const wb = xlsx_1.default.utils.book_new();
    // Instructions sheet
    const instrWs = xlsx_1.default.utils.aoa_to_sheet(INSTRUCTIONS_ROWS);
    instrWs["!cols"] = [{ wch: 90 }];
    xlsx_1.default.utils.book_append_sheet(wb, instrWs, "Instructions");
    // Projects sheet
    const projectData = [
        { title: "Website Redesign", clientName: "TechCorp Pvt Ltd", description: "Complete overhaul of company website with modern UI", priority: "high", status: "not_started", startDate: "2025-01-15", dueDate: "2025-03-30", isRecurring: false },
        { title: "Monthly Social Media Posts", clientName: "Brandify Inc", description: "Create and schedule 20 social media posts for the month", priority: "medium", status: "in_progress", startDate: "2025-01-01", dueDate: "", isRecurring: true },
        { title: "SEO Audit", clientName: "GrowthWings Consulting", description: "Full SEO audit including backlinks, on-page, and technical", priority: "urgent", status: "not_started", startDate: "2025-02-01", dueDate: "2025-02-20", isRecurring: false },
    ];
    const ws = xlsx_1.default.utils.json_to_sheet(projectData, { header: ASSIGNMENT_IMPORT_COLUMNS });
    xlsx_1.default.utils.book_append_sheet(wb, ws, "Projects");
    ws["!cols"] = ASSIGNMENT_IMPORT_COLUMNS.map((h) => ({ wch: Math.max(h.length, 22) }));
    // Tasks sheet
    const taskData = [
        { projectTitle: "Website Redesign", title: "Design mockups", description: "Create home and about page mockups in Figma", assignedTo: "", dueDate: "2025-02-01", priority: "high" },
        { projectTitle: "Website Redesign", title: "Frontend development", description: "Convert mockups to React components", assignedTo: "", dueDate: "2025-03-15", priority: "high" },
        { projectTitle: "Monthly Social Media Posts", title: "Write post copy", description: "Write 20 social media post copies", assignedTo: "", dueDate: "2025-01-15", priority: "medium" },
    ];
    const taskWs = xlsx_1.default.utils.json_to_sheet(taskData, { header: TASK_IMPORT_COLUMNS });
    xlsx_1.default.utils.book_append_sheet(wb, taskWs, "Tasks");
    taskWs["!cols"] = TASK_IMPORT_COLUMNS.map((h) => ({ wch: Math.max(h.length, 24) }));
    const buffer = xlsx_1.default.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="project-import-template.xlsx"');
    res.send(buffer);
};
exports.downloadSampleAssignmentsExcel = downloadSampleAssignmentsExcel;
const previewImportAssignments = async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, message: "No file uploaded" });
            return;
        }
        const workbook = xlsx_1.default.read(req.file.buffer, { type: "buffer" });
        // Parse Projects sheet
        const projectSheetName = workbook.SheetNames.includes("Projects") ? "Projects" : workbook.SheetNames[0];
        const projectRows = xlsx_1.default.utils.sheet_to_json(workbook.Sheets[projectSheetName]);
        const parsedProjects = projectRows.map((row, i) => {
            const normalized = normalizeRow(row);
            const errors = validateAssignmentRow(normalized, i);
            return { row: i + 1, ...normalized, errors };
        });
        // Parse Tasks sheet if present
        let parsedTasks = [];
        if (workbook.SheetNames.includes("Tasks")) {
            const taskRows = xlsx_1.default.utils.sheet_to_json(workbook.Sheets["Tasks"]);
            parsedTasks = taskRows.map((row, i) => {
                const normalized = normalizeTaskRow(row);
                const errors = validateTaskRow(normalized);
                return { row: i + 1, ...normalized, errors };
            });
        }
        const validProjects = parsedProjects.filter((r) => r.errors.length === 0);
        const errorProjects = parsedProjects.filter((r) => r.errors.length > 0);
        const validTasks = parsedTasks.filter((r) => r.errors.length === 0);
        const errorTasks = parsedTasks.filter((r) => r.errors.length > 0);
        res.json({
            success: true,
            rows: parsedProjects,
            totalRows: parsedProjects.length,
            validRows: validProjects.length,
            errorRows: errorProjects.length,
            tasks: parsedTasks,
            totalTasks: parsedTasks.length,
            validTasks: validTasks.length,
            errorTasks: errorTasks.length,
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.previewImportAssignments = previewImportAssignments;
const importAssignmentsExcel = async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, message: "No file uploaded" });
            return;
        }
        const tenantId = (0, tenant_1.getTenantId)(req.user);
        const workbook = xlsx_1.default.read(req.file.buffer, { type: "buffer" });
        // --- Import Projects ---
        const projectSheetName = workbook.SheetNames.includes("Projects") ? "Projects" : workbook.SheetNames[0];
        const projectRows = xlsx_1.default.utils.sheet_to_json(workbook.Sheets[projectSheetName]);
        if (projectRows.length === 0) {
            res.status(400).json({ success: false, message: "Excel Projects sheet is empty" });
            return;
        }
        const createdAssignments = [];
        const errors = [];
        for (let i = 0; i < projectRows.length; i++) {
            try {
                const normalized = normalizeRow(projectRows[i]);
                const validationErrors = validateAssignmentRow(normalized, i);
                if (validationErrors.length > 0) {
                    errors.push({ row: i + 1, message: validationErrors.join("; ") });
                    continue;
                }
                const assignment = await Assignment_1.default.create({
                    title: normalized.title,
                    clientName: normalized.clientName,
                    description: normalized.description,
                    priority: ["low", "medium", "high", "urgent"].includes(normalized.priority) ? normalized.priority : "medium",
                    status: ["not_started", "in_progress", "completed", "delayed"].includes(normalized.status) ? normalized.status : "not_started",
                    startDate: new Date(normalized.startDate),
                    dueDate: normalized.dueDate ? new Date(normalized.dueDate) : null,
                    isRecurring: String(normalized.isRecurring).toLowerCase() === "true" || normalized.isRecurring === true,
                    createdBy: req.user._id,
                    team: [req.user._id],
                });
                createdAssignments.push(assignment);
            }
            catch (err) {
                errors.push({ row: i + 1, message: err.message });
            }
        }
        // --- Import Tasks ---
        let taskCount = 0;
        const taskErrors = [];
        if (workbook.SheetNames.includes("Tasks") && createdAssignments.length > 0) {
            const taskRows = xlsx_1.default.utils.sheet_to_json(workbook.Sheets["Tasks"]);
            // Build a map of project title -> project ID from successfully created projects
            const projectMap = new Map();
            for (const a of createdAssignments) {
                projectMap.set(a.title.toLowerCase().trim(), a._id.toString());
            }
            for (let i = 0; i < taskRows.length; i++) {
                try {
                    const normalized = normalizeTaskRow(taskRows[i]);
                    const validationErrors = validateTaskRow(normalized);
                    if (validationErrors.length > 0) {
                        taskErrors.push({ row: i + 1, message: validationErrors.join("; ") });
                        continue;
                    }
                    const projectId = projectMap.get(normalized.projectTitle.toLowerCase().trim());
                    if (!projectId) {
                        taskErrors.push({ row: i + 1, message: `No matching project found for title "${normalized.projectTitle}"` });
                        continue;
                    }
                    const Task = (await Promise.resolve().then(() => __importStar(require("../models/Task")))).default;
                    await Task.create({
                        title: normalized.title,
                        description: normalized.description,
                        assignment: projectId,
                        assignedTo: req.user._id,
                        createdBy: req.user._id,
                        dueDate: normalized.dueDate ? new Date(normalized.dueDate) : null,
                        priority: ["low", "medium", "high", "urgent"].includes(normalized.priority) ? normalized.priority : "medium",
                        status: "todo",
                    });
                    taskCount++;
                }
                catch (err) {
                    taskErrors.push({ row: i + 1, message: err.message });
                }
            }
        }
        if (createdAssignments.length > 0 || taskCount > 0) {
            await ActivityLog_1.default.create({
                action: `${createdAssignments.length} projects and ${taskCount} tasks imported via Excel`,
                user: req.user._id,
                entityType: ActivityLog_1.EntityType.ASSIGNMENT,
                entityId: createdAssignments[0]?._id || req.user._id,
                metadata: { projects: createdAssignments.length, tasks: taskCount, errors: errors.length + taskErrors.length },
            });
        }
        res.status(201).json({
            success: true,
            imported: createdAssignments.length,
            tasksImported: taskCount,
            errors: [...errors, ...taskErrors],
            assignments: createdAssignments,
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.importAssignmentsExcel = importAssignmentsExcel;
//# sourceMappingURL=assignmentController.js.map