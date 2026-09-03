# 🏢 FlowDesk Project Overview

FlowDesk is Aceone's full-stack internal management ecosystem. It centralizes project execution, task tracking, CRM, field operations, and real-time collaboration in a single multi-tenant platform.

## 🏗 Modular Architecture

**Stack:** TypeScript end-to-end (React 19 + Vite 7 + Tailwind 4 + Zustand + TanStack Query 5 on client; Node + Express 4 + Mongoose 8 + Socket.io 4 + Helmet on server; MongoDB + GridFS; Electron 34 for desktop).

- **Frontend** `client/src` — HashRouter + `AppLayout` + `RouteGuard` (`client/src/App.tsx:224` checks `user.permissions.allowedTabs` vs `navItems`), 23 pages, 13 calendar views, 11 CRM components, Zustand stores (`authStore`, `chatStore`, `calendarStore`, `themeStore`).
- **Backend** `server/src/index.ts:58` — Express + Socket.io + Helmet CSP + CORS allowlist, GridFS inline + `GET /uploads/:filename/resize` Sharp (`server/src/index.ts:180`), Ollama proxy `POST /api/buddy/ollama → 127.0.0.1:11434` (`index.ts:230`), health `GET /api/health` (`index.ts:563`), 27 route mounts (`index.ts:261`).
- **Real-time** `server/src/index.ts:290` — `io.use` JWT `auth.token` only, guarded rooms `isConversationParticipant` / `isAssignmentMember` (`index.ts:318`), `activeUsers` Set (`index.ts:90`), events `join_assignment|join_conversation|join_tenant|join_user`, `user_active_status` broadcast, `typing`, `mark_messages_read/delivered`, `request_key_heal` E2EE (`index.ts:403`).
- **Storage** `server/src/utils/gridfs.ts` — Multer memory 10MB (`middlewares/upload.ts:69`) → GridFS bucket `uploads`, `Attachment.encIv/encKey` encrypted storage, streaming download.
- **Crons** — `services/recurringTaskService.ts:439 startRecurringJob` exact timer + 5-min scan, `services/fieldVisitHeartbeatService.ts:9` 60-s stale check, `services/backupScheduleService.ts:106` one-shot per tenant frequency (`index.ts:617` start, `582` stop on SIGTERM).

---

## 🚀 Core Features (implemented)

### 1. Project Management (Assignments) `server/src/models/Assignment.ts:50` `routes/assignments.ts:9` `controllers/assignmentController.ts:98`
- **Ongoing / Completed / Recurring Blueprints** — `isRecurring + recurringPattern(daily/weekly/monthly/yearly) + recurringWeekdays + recurringDayOfMonth + recurringMaxInstances + recurringDueDays + recurringNotifyOnSpawn + recurringPaused + recurringLastSpawnedAt/SpawnedCount`.
- **Excel workflow** — `GET /import/sample` template, `POST /import/preview` parse-only, `POST /import/excel` bulk create (`assignmentController.ts:737`).
- **Per-project collaborative whiteboard** — `canvasData Mixed` field, `PATCH /:id/canvas` (`routes/assignments.ts:9`), rendered by `components/assignments/ProjectCanvas.tsx` (fullscreen, auto-save debounce, who-edited avatars).
- **Activity, comments, files** — cascaded on delete, paginated reads.

### 2. Task Ecosystem + Kanban Boards `Task.ts:48` `Board.ts:38` `routes/tasks.ts:9` `routes/boards.ts:28`
- **Task lifecycle** `TODO=in_progress→review→completed` `Task.ts:10`, `priority low/medium/high/urgent L48`, `rank` drag order `PUT /tasks/reorder`, `timeEstimate/timeSpent`, `subtasks[title,completed]`, `dependencies[]`, `board` ref, `tenantId`.
- **Board columns** `Board.ts:38 columns[key/label/color/order]`, join workflow `joinRequests[status pending/accepted/rejected]` + `invitations[user/invitedBy/status]` + `members[]` (`Board.ts:47`), endpoints `POST /:id/columns`, `PUT /:id/columns/:key/rename`, `DELETE /:id/columns/:key`, `PUT /:id/columns/reorder`, `POST /:id/request`, `PUT /:id/requests/:id` (`routes/boards.ts:28`). Client `BoardsPage.tsx:16` + `TasksPage.tsx:19` (cross-project table, filters, comment thread, socket `useTaskSocket.ts:6`).

### 3. AI Buddy `routes/buddy.ts:310` `services/*` `components/common/Buddy.tsx`
- `POST /buddy` (non-stream `gpt-4o temp 0.7 max_tokens 800` + `FLOWDESK_KNOWLEDGE L6` + `INTENT_INSTRUCTIONS L268` 8 intents) + `POST /buddy/stream` SSE `text/event-stream L378` + `getFallbackResponse() L498` per-route hints.
- Local alternative `POST /api/buddy/ollama` proxies to `127.0.0.1:11434/api/chat` chunked octet-stream 120s timeout (`index.ts:230`).
- Floating widget history 10, path context, `Ctrl/Cmd+B` shortcut.

### 4. Communication & Presence `Message.ts:39` `Conversation.ts:32` `ChatMessage.ts:16` `Notification.ts:33` `ActivityLog.ts:27`
- **Dual chat:** Assignment legacy (`ChatMessage assignment/file/parentMessage`, `routes/chat.ts:10` `sendMessage GET/DELETE`, `chatController.ts:11` multer GridFS) + DM E2EE (`Conversation type direct/group + encryptedKeyWraps[userId/deviceId/epk/ct]`, `Message content{encrypted/iv}/file/reactions/readBy/deliveredTo/isDeleted/isEdited/tenantId`).
- **Ticks:** `✓ single → ✓✓ double → ✓✓ blue` (`RELEASE_NOTES.md:3`) via `index.ts:449 mark_messages_read` (validates owner+participant, updates `readBy+deliveredTo`, emits `messages_read/delivered`) + auto `markDeliveredForUser L348` on `join_user`.
- **Resizability:** chat sidebar resizable remembered (`RELEASE_NOTES.md:4`, `ChatsPage.tsx:122`, `components/layout/AppLayout.tsx`).
- **E2EE healing:** `request_key_heal L525` fan-out to `user_*` + `conversation_*` on new device, `WhatsNewModal` after each update (`RELEASE_NOTES.md:6`).
- **Notifications:** `notificationService.ts:16 createNotification(s)` → `io.to(tenant_) emit new_notification`, persisted `Notification` with `type/title/message/link/metadata`, `GET /notifications PUT /:id/read PUT /read-all` (`routes/notifications.ts:9`). In-app bell + Electron native (subscribe removed).

### 5. Collaborative Canvas `CanvasNote.ts:20` `routes/canvas.ts:9` `CanvasPage.tsx:554`
- Personal infinite canvas `POST /canvas` `x/y` required, `width 200 height 140 color #fef9c3`, `connections[]` graph edges (`CanvasNote.ts:20`). Client drag/resize/rich-text (Tiptap 3.22), navigator `CanvasNavigator.tsx`, export `NoteExportMenu.tsx` PNG/PDF. Private to `userId`. Distinct from assignment's shared `canvasData`.

### 6. Calendar `Calendar.ts:26` `CalendarEvent.ts:55` `routes/calendars.ts:19` `routes/calendarEvents.ts:17`
- **Calendars:** `name/color/icon/visibility private/public/isArchived/isDefault/isSystem/sharedWith[user/permission view/edit/status pending/accepted/rejected]/teamId/googleCalendarId` (`Calendar.ts:26`). Endpoints `POST/GET/PUT/DELETE /calendars`, `PUT /:id/archive`, `POST /:id/share`, `DELETE /:id/share/:userId`, `PUT /:id/share/accept|reject` (`routes/calendars.ts:19`).
- **Events:** `title/description/calendar/eventType task/meeting/holiday/reminder/startDate/endDate/allDay/priority/status/isImportant/isPinned/isRecurring/recurrenceRule{frequency/interval/endDate/count}/recurringParentId/reminders[type/in_app/email/push minutesBefore]/attendees/googleEventId` (`CalendarEvent.ts:55`). `PUT /:id/move` drag-n-drop, `GET /search` (`routes/calendarEvents.ts:17`). Client 5 views `Month/Week/Day/Year/Agenda` (`components/calendar/*` 13 files), store `calendarStore.ts:11 view year|month|week|day|agenda` (`CalendarPage.tsx:18`).

### 7. CRM Suite `Lead.ts:58` `Campaign.ts:16` `Company.ts:32` `Contact.ts:20` `routes/leads.ts:14` `routes/campaigns.ts:8` `routes/companies.ts:27` `CrmPage.tsx:80`
- **Campaigns** `name/purpose/description` + `POST /import/excel` (`campaignController.ts:10`).
- **Leads** 11-stage `new→contacted→qualified→proposal→negotiation→follow_up→meeting_scheduled→meeting_done→closed_won/closed_lost` (`Lead.ts:83`), fields `designation/phone/alternatePhone/companyName/addressLine/city/state/pincode/companyPan/Gst/industry/email/website/priority/source/notes timeline/meeting{date/type/status}/callCount/lastCallAt/callDuration/nextFollowupAt` (`Lead.ts:58`), endpoints `POST /:id/notes`, `POST /:id/call`, `PATCH /:id/meeting-status`, `GET /counts|stats|upcoming|filter-options` (`routes/leads.ts:14`). Bulk Excel import `importExcel L438`, `GET /import/sample` public.
- **Companies** unlimited hierarchy `parentCompanyId` (`Company.ts:32`), `slug unique per tenant`, `phoneCountryCode +91`, `address{street city state country postalCode}`, `status plan` SaaS fields. `POST /import` multer, `GET /export/excel|pdf` (pdfkit), `POST /bulk-email` Brevo to primary contacts (`companyController.ts:726`). Client tree sidebar `ClientsPage.tsx:37`, bulk `BulkEmailPage.tsx:19` Tiptap + virtual scroll.
- **Summary/Logs** `GET /crm-summary + /export` aggregates (`crmSummaryController.ts:59`), `GET /activity-logs` (`activityLogController.ts:6`).

### 8. Field Visits `FieldVisit.ts:70` `LocationTrack.ts:33` `routes/fieldVisits.ts:29` `controllers/fieldVisitController.ts:26`
- `clientId/clientType(company/lead)/scheduledDate/Time/checkInSelfie/Point[lng,lat]/checkOut/status scheduled|checked_in|checked_out|cancelled/outcome/expenses[type/amount/receiptImage]/remarks[]/locationTrack/trackingStartedAt/lastLocationUpdateAt/trackingLost/totalDistance` (`FieldVisit.ts:70`).
- Endpoints: `POST /:id/check-in|check-out` selfie multer + reverse geocode, `POST /:id/location` live ping → `LocationTrack path[lat/lng/accuracy/timestamp] startedAt/endedAt/isActive` (`LocationTrack.ts:33`), `GET /active + /active/locations` admin live map, `POST /optimize-route` TSP nearest-neighbor (`fieldVisitController.ts:691`), `POST /:id/expenses` receipt, `PUT /:id/approve|reject` manager. Heartbeat `fieldVisitHeartbeatService.ts:9` `STALE_AFTER 5m / 60s` emits `tracking_lost/restored`, socket `fieldVisitSocketService.ts:3` 9 tenant emits, client `useLocationTracking.ts:11` `watchPosition 5s` + `useFieldVisitSocket.ts:11`.

### 9. Dashboard & Analytics `controllers/dashboardController.ts:12` `controllers/reportController.ts:192` `routes/dashboard.ts:9` `routes/reports.ts:15`
- `GET /dashboard/stats?page=` (`DashboardPage.tsx:71` cards + pie/line/bar Recharts), `GET /dashboard/calendar`, `GET /dashboard/report-filters` dropdowns, `GET /dashboard/search` global regex, `ActivityLog` audit. Reports 4 types (`employee-tracking`, `workload`, `activity`, `project-health` L192) + `FilterBar` + `DrilldownModal` + `GET /reports/export` `admin/manager` exceljs (`ReportsPage.tsx:58`).

### 10. Teams & Security `Team.ts:17` `User.ts:51` `Tenant.ts:26` `middlewares/auth.ts:5`
- **Teams** `name/members/manager/joinRequests[]/tenantId` (`Team.ts:17`), `POST /teams` admin, `PUT /:id/manager L24` (role must be manager/admin), `POST /:id/request-join`, approve/reject (`routes/teams.ts:12`).
- **RBAC** `User role admin/manager/member`, `permissions.allowedTabs[]` (`User.ts:51`), `App.tsx:224 RouteGuard` maps `navItems` top-level/subItems, redirects to `getFirstAllowedRoute`. Tenant `plan free/starter/pro/enterprise`, `maxUsers`, `settings.geoFenceRadius 10-10000 default 100` (`Tenant.ts:26`).

## 🛠 Advanced Behaviors
- **Recurring catch-up:** `processRecurringAssignments L307` scans non-paused, `nextSpawnDate L116` handles daily/weekly(with `recurringWeekdays`)/monthly(`dayOfMonth`)/yearly, clones assignment+tasks, increments `SpawnedCount`, emits notifications; `scheduleNextTick L397` exact `setTimeout` + `SCHEDULE_BUFFER 1s`.
- **No-due-date guard:** nullable `dueDate` in `Assignment/Task` — calendar/report filters treat `null` as `Unscheduled`, no epoch 1970 (`user_guide.md` pro-tip preserved).
- **Z-index layering:** fixed overlapping modals/toasts/mobile sidebar (`RELEASE_NOTES.md:12`, `components/common/Modal.tsx` `role=dialog`, `Toaster` `App.tsx:190` `zIndex 5000`).
- **File resize:** `GET /uploads/:filename/resize?w=&q=` cached 604800 (`index.ts:180`) Sharp `resize(w,w).jpeg(q)` w≤200 q≤80.

## 🎨 UI System
- Tailwind 4 + custom CSS vars `--color-bg/surface/border/text` via `themeStore.ts:3` light/dark toggle (`SettingsPage.tsx:45`).
- Glassmorphism cards, `floating` hero animation (`LandingPage.tsx:29`), skeletons `ReportStates.tsx` / `DashboardPage.tsx:142`.
