# 👋 Welcome to FlowDesk — User Guide (v4.2.0)

FlowDesk is Aceone's digital office — one place for assignments, tasks, boards, chats, calendar, CRM, field visits, and reports. This guide reflects the **current codebase** (`client/src/pages/*`, `server/src/routes/*`).

---

## 🧐 What is FlowDesk?

A multi-tenant workspace (`server/src/models/Tenant.ts`) where every project, task, lead, and message is scoped to your organization. Roles gate what you see (`client/src/App.tsx:224 RouteGuard`, `User.permissions.allowedTabs`).

- **Admin** — full control, user/tenant settings, backup scheduler, all reports/exports.
- **Manager** — team-scoped creates/approves, report exports, field-visit approves.
- **Member** — task execution, chats, canvas, own field visits.

---

## 🏁 Getting Started

### 1. Create your account

- **Invite:** Admin creates you via `POST /users/create` (`server/src/routes/auth.ts:17`, `controllers/authController.ts:744`) — you receive credentials.
- **Self-register:** `RegisterPage.tsx:21` → `POST /auth/register` → company `name → slug` + `website/phone/industry` → `RegistrationOtp` pending → OTP verify modal → tenant created. Google login also supported if configured.

### 2. Log in `LoginPage.tsx:15`

`POST /auth/login` (rate-limited `20/15m` `routes/auth.ts:9`) → JWT `userId+tenantId` stored (`authStore.ts:39 persist`), `GET /auth/me` hydrates `loadUser()` permissions. "Remember Me" persists token. Forgot flow: `POST /forgot-password` → email OTP → `POST /verify-forgot-password-otp` → new password.

### 3. Navigate `client/src/components/layout/Sidebar.tsx`
Sidebar `navItems` top-level + `subItems` (e.g., Productivity → Tasks/Boards). Collapse, product search `Ctrl+K` (`Header.tsx`), theme toggle (`themeStore.ts:3`), notification bell (`routes/notifications.ts:9`).

### 4. Dashboard `DashboardPage.tsx:71`
`GET /dashboard/stats?page=` cards: **Active Projects / Due Today / Overdue / Completed This Week** + spark. Charts: pie `Task Breakdown` (`todo/in_progress/review/completed` `STATUS_COLORS L35`), bar `Team Workload`, line `Weekly Performance Trend` (Recharts). Right rail `My Teams` (admin sees all). Bottom `Recent Activity` paginated (`recentActivity/currentPage/totalPages` `activityQueryFn L62`) with Prev/Next slide animation. Prefetch next page (`queryClient.prefetchQuery L107`). Actions: `Tasks` / `Projects` / `Reports`.

---

## 📂 Assignments (Projects) `AssignmentsPage.tsx:60` `AssignmentDetailPage.tsx:25`

List filters `status/team/search`, localStorage `projects_items_per_page L75`, create modal: title, `clientName/companyId`, priority `low/medium/high/urgent`, `startDate/dueDate` (or leave blank — no epoch bug), `team[]`. Three views:

- **Ongoing** — active.
- **Completed** — archived, full history retained (tasks, files, chats, logs).
- **Recurring Blueprints** — template with `recurringPattern` `daily/weekly/monthly/yearly` + `recurringTime/recurringWeekdays/recurringDayOfMonth/recurringMaxInstances/recurringDueDays/notifyOnSpawn` (`Assignment.ts:50`). Engine (`services/recurringTaskService.ts:116`) auto-spawns fresh clones; duplicate guard + 5-min safety scan; editing blueprint affects *next* instances only.

**Detail page:** tabs → tasks, files (GridFS download), activity timeline, team chat (`ChatMessage` + typing `index.ts:422`), **Project Whiteboard** (`components/assignments/ProjectCanvas.tsx`) — sticky notes `PATCH /assignments/:id/canvas` collaborative, fullscreen, auto-save, who-edited avatars.

**Excel:** Download sample `GET /assignments/import/sample`, `POST /assignments/import/preview` (multer) dry-run, `POST /assignments/import/excel` bulk (`routes/assignments.ts:9`).

---

## ✅ Tasks `TasksPage.tsx:19` `Task.ts:48`

Cross-project table or within assignment. Create modal: `title` required, `description`, `assignment`, `assignedTo` (user/team/unassigned), `dueDate`, `priority`, `status`, `timeEstimate`. Features:

- **Lifecycle** `todo → in_progress → review → completed` + send-back by manager.
- **Subtasks/Checkpoints** `subtasks[title,completed]` (`Task.ts:41`) — progress bar; must finish to complete parent (tip in docs).
- **Priority** colors urgent red/high orange/medium neutral/low subtle.
- **Ownership:** individual / team / unassigned claim; transfer retains history.
- **Rank drag** `PUT /tasks/reorder` + column position on board.
- **Bulk:** select → change priority/status/reassign/extend deadlines.
- **Comments** thread + `@mentions` (`routes/comments.ts:9`, `searchUsers`).

---

## 📋 Boards (Kanban) `BoardsPage.tsx:16` `Board.ts:38`

`GET /boards` tenant + membership filter. Create `POST /boards` → `navigate /tasks/:boardId`. Manage modal: add/rename/delete/reorder columns `PUT /:id/columns`, `DELETE /:id/columns/:key` (nulls task column). Join flow `POST /:id/request` → `PUT /:id/requests/:id` approve/reject; `POST /:id/invite` → invitee `PUT /:id/invitations/:id` accept/reject (`routes/boards.ts:28`). Pending lists `GET /requests/pending|/invitations/pending L58`. Socket `useTaskSocket.ts:6` live invalidate.

---

## 📊 Reports `ReportsPage.tsx:58` `routes/reports.ts:15`

Four tabs (via `useReportQuery.ts:11`):

- **Tracking** (`/reports/employee-tracking L192`) — per-person completion/overdue/pace `EmployeeTrackingReport.tsx`.
- **Workload** (`/reports/workload L391`) — estimated hours/capacity/stale `WorkloadReport.tsx`.
- **Activity** (`/reports/activity L472`) — time series, contributors, inactivity `ActivityReport.tsx`.
- **Projects** (`/reports/project-health L632`) — red/yellow/green health `ProjectHealthReport.tsx`.

`FilterBar.tsx` `startDate/endDate/teamId/employeeId/projectId/status`, `DrilldownModal` rows, Export `GET /reports/export?type=csv|pdf|excel&reportType=` (`handleExport L124`) — admin/manager only (exceljs/pdfkit).

---

## 💬 Chat

### Project Chat `chatController.ts:11` `routes/chat.ts:10`
Every assignment has chat: `POST /chat` `upload.single` file GridFS, `GET /chat?assignmentId=`, `DELETE /:id` owner/admin. Typing `index.ts:422`, read tracking.

### Direct / Group DM `ChatsPage.tsx:122` `Conversation.ts:32` `Message.ts:39` `routes/conversations.ts:24`
E2EE per-device `encryptedKeyWraps` → `POST /conversations` (direct/group + `name/avatar`), `POST /:id/messages` multer file, `POST /:id/read` mark, `POST /messages/:id/react` toggle emoji, `POST /messages/:id/forward`, `PUT /messages/:id` edit, `DELETE /messages/:id` own only. Ticks: `✓ sent → ✓✓ delivered → ✓✓ blue read` (`RELEASE_NOTES.md:3`) — `mark_messages_read L449` + `markDeliveredForUser L348`. Sidebar resizable remembered (`RELEASE_NOTES.md:4`). New device heals keys via `request_key_heal L525`.

**Tips:** Drag-drop files, `@username` mention → `isDelivered/readBy` + notification, use forward to share across conversations.

---

## 🎨 Canvas `CanvasPage.tsx:554` `CanvasNote.ts:20`

- **Personal:** your infinite canvas `GET /canvas?userId` `createNote POST /canvas x/y required` (`canvasController.ts:6`) — post-its drag/resize (200×140 default `#fef9c3`), rich text Tiptap, `connections[]` graph, navigator `CanvasNavigator.tsx`, export `NoteExportMenu`. Only you see it.
- **Collaborative:** switch via assignment whiteboard (shared `canvasData`).

---

## 📅 Calendar `CalendarPage.tsx:18` `Calendar.ts:26` `CalendarEvent.ts:55`

`useCalendarStore` view `year|month|week|day|agenda L11`, `currentDate`, `visibleCalendarIds` toggle. Toolbar today/prev/next, key `n` new event `L38`.

- **Calendars:** create `POST /calendars`, share `POST /:id/share` pending invite `view/edit` permission → recipient `PUT /:id/share/accept|reject` (`routes/calendars.ts:19`), archive, color/icon. Sidebar list + Google import entry.
- **Events:** `GET /calendar-events?calendarIds=&dateRange&search`, `POST /calendar-events`, `PUT /:id`, `DELETE /:id`, `PUT /:id/move` drag (`routes/calendarEvents.ts:17`). Fields `eventType task/meeting/holiday/reminder`, `allDay`, `priority`, `reminders[in_app/email/push minutesBefore]`, `attendees`, `isRecurring + recurrenceRule{frequency/interval/endDate/count}`.
- **Google Import:** `GoogleCalendarImport.ts:20` `GET /auth-url` OAuth `offline+consent`, `GET /callback` saves `googleRefreshToken`, `GET /list`, `POST /sync-one` progress, `POST /sync` batch -180/+365d max 2500 — desktop deep link `flowdesk://google-auth-success` (`desktop/src/main.ts:370`).

---

## 👥 CRM `CrmPage.tsx:80` (`SECTIONS L18`: dashboard/campaigns/dial/schedule/summary/logs/field-visits)

### Campaigns `campaigns.ts:8`
`POST/GET/PUT/DELETE /campaigns`, Excel import `POST /import/excel` + `GET /import/sample`.

### Leads `leads.ts:14` `Lead.ts:58`
Table filters `campaign/status/priority/source/city/nextFollowup/search` pagination `getLeads L18`. Detail modal: notes timeline `POST /:id/notes`, call dial `POST /:id/call` increments `callCount/duration`, `PATCH /:id/meeting-status L1106`. Status 11-stage funnel, endpoints `GET /counts|upcoming|stats|filter-options`. Excel bulk import `importExcel L438`.

### Companies & Contacts `companies.ts:27` `Company.ts:32` `Contact.ts:20`
Hierarchy tree unlimited `parentCompanyId`, industry/website/phone/+countryCode/address, contacts `isPrimary`. Excel import `POST /import L351`, export Excel `L495` / PDF `L608` (pdfkit), **Bulk Email** `POST /bulk-email L726` → primary contacts via Brevo `sendGenericEmail`. Client tree `ClientsPage.tsx:37` + hierarchical selector `BulkEmailPage.tsx:19` Tiptap editor + virtual scroll.

### Logs & Summary
`GET /activity-logs?entityType&action&date` (`activityLogController.ts:6`), `GET /crm-summary` + `GET /crm-summary/export` Excel aggregates (`crmSummaryController.ts:59`).

---

## 🚗 Field Visits `FieldVisit.ts:70` `LocationTrack.ts:33` `fieldVisits.ts:29`

Create `POST /field-visits` scheduled date/time → **Check-in** `POST /:id/check-in` selfie (`CameraCapture.tsx`) + `navigator.geolocation` Point + reverse address → emits `field_visit_checked_in` tenant socket (`fieldVisitSocketService.ts:3`) → heartbeat `fieldVisitHeartbeatService.ts:9` 60-s check `STALE_AFTER 5m` → `trackingLost` toast + restore. **Live tracking** `useLocationTracking.ts:11` `watchPosition 5s` → `POST /:id/location` push to `LocationTrack path[lat/lng/accuracy/timestamp]`. **Check-out** similar + distance `totalDistance`. **Expenses** `POST /:id/expenses` receipt multer, **Remarks** timeline, **Route Planner** `POST /optimize-route` TSP nearest-neighbor polyline (`FieldVisitRoutePlanner.tsx`, `FieldVisitMap.tsx` Leaflet), **Approve/Reject** `PUT /:id/approve` admin/manager, reports `GET /reports` per-employee aggregation, admin live `GET /active/locations`.

---

## 🏢 Teams `TeamsPage.tsx:13` `routes/teams.ts:12`

`POST /teams` admin, `GET /teams?all=true` (`DashboardPage.tsx:118`), `PUT /:id` admin/manager, `DELETE /:id` admin, `PUT /:id/members`, `PUT /:id/manager L24` (role must be manager/admin), `POST /:id/request-join` → approve/reject (`teamController.ts:188`). Avatar fallback `components/common/Avatar.tsx`.

---

## 📁 Files `FilePreviewModal.tsx` `routes/files.ts:10`

GridFS `uploads` bucket `uploadFile L9`, list `GET /files`, preview modal img/pdf, `GET /:id/download` stream (`fileController.ts:81`), delete (`fileController.ts:127`), resize query `GET /uploads/:filename/resize?w=&q=` Sharp (`index.ts:180`).

---

## 🤖 AI Buddy `components/common/Buddy.tsx` `routes/buddy.ts:310`

Float bottom-right, `POST /buddy` or `POST /buddy/stream` SSE `text/event-stream`. Understands project velocity, deadlines, history; generates task descriptions, suggests deadlines, summarizes activity. Shortcut `Cmd/Ctrl+B`. Falls back per-page hints `getFallbackResponse L498` if OpenAI fails; local Ollama proxy `POST /api/buddy/ollama`.

---

## 🔔 Notifications & Global Search

- In-app `Notification isRead/link/metadata` (`Notification.ts:33`), bell real-time `io.emit new_notification`, `GET /notifications`, `PUT /:id/read`, `PUT /read-all` (`routes/notifications.ts:9`).
- Global search `GET /dashboard/search` regex across assignments/tasks/companies/leads (`dashboardController.ts:332`).
- Tenant `geoFenceRadius 10–10000m default 100` `PUT /settings` admin/manager (`settingsController.ts:6`, `Tenant.ts:41`).

---

## 💾 Backup `BackupPage.tsx:15` `routes/backup.ts:10`

Admin only. `POST /backup/export` zip dump (`backupController.ts:38` stream collections), `GET /backup/schedule`, `POST /backup/schedule` `frequency daily/weekly/monthly hour/minute email` (`nextRunAt` calc), `DELETE /backup/schedule/:id`, `POST /backup/email-now` instant via `sendBackupEmail` (`services/emailService.ts:95 Brevo`). Scheduler auto re-arms (`backupScheduleService.ts:106`).

---

## 💡 Pro-Tips

- Leave `dueDate` blank for open-ended work — appears `Unscheduled`, no epoch bug.
- Blueprint edits propagate to *next* spawns only; pause to stop without deleting.
- Update status promptly — `Review` awaits manager, then `Completed` triggers dashboard counts.
- For long CRM lists use filter-options `GET /leads/filter-options` distinct values.
- Chat ticks: your sent messages show status in list right-aligned; `WhatsNewModal` appears once per version (`RELEASE_NOTES.md:6`).
