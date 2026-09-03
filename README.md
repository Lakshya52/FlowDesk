# 🚀 FlowDesk — Internal Operations Platform

> Multi-tenant, real-time workspace for projects, tasks, CRM, field operations, and team collaboration. TypeScript end-to-end.

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-100%25-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Version](https://img.shields.io/badge/Version-4.2.0-blue?style=flat-square)
![License](https://img.shields.io/badge/License-Private-red?style=flat-square)
![Status](https://img.shields.io/badge/Status-Active-brightgreen?style=flat-square)

</div>

## 📋 Table of Contents
- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Core Features](#core-features)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Architecture Notes](#architecture-notes)
- [Contributing](#contributing)

---

## 📌 Overview

**FlowDesk** is Aceone's internal management ecosystem. It replaces spreadsheets, chat apps, and disjointed CRMs with a single platform covering the full work lifecycle: assignments → tasks → boards → calendar → CRM → field visits → reports → backups.

Key properties:
- **Multi-tenant** — every `User`, `Assignment`, `Task`, `Company`, `Lead` is scoped by `tenantId` (`server/src/models/Tenant.ts`, `server/src/utils/tenant.ts`). Tenant auto-created on registration via `RegistrationOtp` flow.
- **RBAC** — `admin | manager | member` + per-route `allowedTabs` (`client/src/App.tsx:RouteGuard`, `server/src/middlewares/auth.ts:authorize`).
- **Real-time** — Socket.io rooms `tenant_*`, `assignment_*`, `conversation_*`, `user_*` (`server/src/index.ts:290`).
- **E2EE Direct Messages** — per-device `encryptedKeyWraps` (`server/src/models/Conversation.ts:66`, `server/src/routes/conversations.ts:24`, `server/src/index.ts:525 request_key_heal`).

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript 5.9 + Vite 7 + Tailwind 4 + Zustand + TanStack Query 5 + Socket.io-client + Recharts + Tiptap + GSAP |
| Backend | Node 18+ + Express 4 + TypeScript 5.8 + Mongoose 8 + Socket.io 4 + Helmet + Multer (memory) + Sharp + ExcelJS/xlsx + PDFKit + googleapis |
| Storage | MongoDB + GridFS (`uploads` bucket `server/src/utils/gridfs.ts`) + `GET /uploads/:filename/resize` Sharp pipeline (`server/src/index.ts:180`) |
| Email | Brevo (`@getbrevo/brevo`) + Resend (`server/src/services/emailService.ts:12` `sendOtpEmail`/`sendBackupEmail`) |
| Desktop | Electron 34 + electron-builder 25 + electron-updater 6 (`desktop/package.json`) |

---

## 📁 Project Structure

```
FlowDesk/
├── client/                 # React + Vite SPA (HashRouter)
│   ├── src/
│   │   ├── pages/          # Dashboard, Assignments, Tasks, Boards, Calendar, Reports, Chat, Canvas, CRM, Clients, Teams, Settings, Backup, etc.
│   │   ├── components/     # layout, calendar (Month/Week/Day/Year/Agenda), crm, reports, common (Buddy, AvatarCrop, CameraCapture)
│   │   ├── store/          # authStore, chatStore, calendarStore, themeStore
│   │   ├── hooks/          # useSocket, useTaskSocket, useCrmSocket, useFieldVisitSocket, useLocationTracking
│   │   ├── lib/api.ts      # axios instance
│   │   └── docs/content.ts # in-app Documentation slugs
│   └── package.json        # 4.2.0
├── server/
│   ├── src/
│   │   ├── routes/         # 27 route files (auth, assignments, tasks, boards, chat, conversations, calendar*, leads, companies, campaigns, fieldVisits, dashboard, reports, etc.)
│   │   ├── controllers/    # 24 controllers
│   │   ├── models/         # 26 models (User, Tenant, Assignment, Task, Board, Team, Company, Contact, Lead, Campaign, FieldVisit, LocationTrack, Calendar, CalendarEvent, Conversation, Message, CanvasNote, etc.)
│   │   ├── services/       # recurringTaskService, backupScheduleService, emailService, notificationService, *SocketService, fieldVisitHeartbeatService
│   │   ├── middlewares/    # authenticate, authorize, upload (multer memory 10MB), errorHandler
│   │   └── index.ts        # Express + Socket.io + GridFS + cron bootstrap (628 lines)
│   └── package.json        # 4.2.0
├── desktop/                # Electron wrapper (main.ts, preload.ts, assets/)
├── docker-compose.yml
├── playwright.config.js    # E2E tests
└── README.md
```

---

## ✨ Core Features

| Domain | What it does | Code refs |
|--------|--------------|-----------|
| **Assignments / Projects** | Ongoing/Completed/Recurring blueprints (`isRecurring`, `recurringPattern daily/weekly/monthly/yearly`, `recurringWeekdays`, `recurringDayOfMonth`, `recurringMaxInstances`). Intelligent spawning with duplicate guard + 5-min catch-up + exact `setTimeout` scheduler. Import via Excel preview + bulk create. Collaborative whiteboard `PATCH /assignments/:id/canvas` | `Assignment.ts:50`, `routes/assignments.ts:9`, `services/recurringTaskService.ts:116` |
| **Tasks & Kanban Boards** | Task `todo→in_progress→review→completed`, `priority`, `rank` drag (`PUT /tasks/reorder`), `timeEstimate`, `subtasks`, link to `assignment+board`. Boards with custom `columns[key/label/color/order]`, join requests/invitations workflow | `Task.ts:48`, `Board.ts:38`, `routes/boards.ts:28`, `routes/tasks.ts:9` |
| **Dashboard & Reports** | Cards (active/due/overdue/weekly), pie/line/bar charts, paginated activity, team strip. 4 reports: Employee Tracking / Workload / Activity / Project Health + filters + drilldown + export PDF/Excel | `DashboardPage.tsx:71`, `ReportsPage.tsx:58`, `routes/reports.ts:15`, `controllers/reportController.ts:192` |
| **Real-time Presence & Chat** | Socket auth JWT, `activeUsers` Set, `user_status_change` broadcast, typing indicators, `mark_messages_read/delivered` ticks. Assignment chat + E2EE DM (`deliveredTo/readBy/reactions/forward/edit`, `encryptedKeyWraps`, key-heal) | `index.ts:290`, `ChatMessage.ts:16`, `Conversation.ts:32`, `Message.ts:39` |
| **Canvas** | Personal infinite canvas (`CanvasNote x/y/width/height/color/connections`) + per-assignment `canvasData Mixed` shared whiteboard | `CanvasNote.ts:20`, `routes/canvas.ts:9`, `CanvasPage.tsx:554` |
| **Calendar** | 5 views (Year/Month/Week/Day/Agenda), visibility, share `pending/accepted/rejected`, archive, `reminders`, `recurrenceRule`, Google OAuth sync (`/import/google-calendar/auth-url`, `sync-one`, `sync` 2500 events) | `Calendar.ts:26`, `CalendarEvent.ts:55`, `routes/googleCalendarImport.ts:20` |
| **CRM** | Campaigns + Leads 11-stage funnel (`new→closed_won/lost`), dial queue `recordCall`, notes timeline, `meetingStatus`, Excel import, counts/stats (`/leads/counts|stats|upcoming`), summary export | `Lead.ts:58`, `Campaign.ts:16`, `routes/leads.ts:14`, `LeadDetailModal.tsx` |
| **Companies & Contacts** | Unlimited hierarchy `parentCompanyId`, `industry/phone/address`, Contacts `isPrimary`, import/export Excel/PDF, bulk email to primary contacts | `Company.ts:32`, `Contact.ts:20`, `routes/companies.ts:27`, `BulkEmailPage.tsx:19` |
| **Field Visits** | Geo check-in/out selfie+`Point[lng,lat]`, live `LocationTrack path[]`, heartbeat `STALE_AFTER 5m / 60s` lost/restored toasts, route TSP optimizer, expenses receipts, approve/reject, admin live map | `FieldVisit.ts:70`, `LocationTrack.ts:33`, `routes/fieldVisits.ts:29`, `services/fieldVisitHeartbeatService.ts:9` |
| **Teams** | Create (admin), `members[]` + `manager`, join requests approve/reject | `Team.ts:17`, `routes/teams.ts:12` |
| **Files & Comments** | GridFS `uploads` bucket, download/delete, resize sharp, comments with `@mentions` | `Attachment.ts:23`, `routes/files.ts:10`, `routes/comments.ts:9` |
| **AI Buddy** | `POST /buddy` + `POST /buddy/stream` SSE (OpenAI `gpt-4o` + `FLOWDESK_KNOWLEDGE` + 8 intents) + local Ollama proxy `POST /api/buddy/ollama → 127.0.0.1:11434` | `routes/buddy.ts:310`, `index.ts:230`, `components/common/Buddy.tsx` |
| **Notifications & Logs** | In-app persisted + `io.to(tenant_) emit new_notification`, global search (`/dashboard/search` regex), `ActivityLog` audit | `Notification.ts:33`, `ActivityLog.ts:27`, `controllers/dashboardController.ts:332` |
| **Backup** | Zip stream of all collections + scheduler `daily/weekly/monthly hour/minute/email` + `email-now` | `BackupSchedule.ts:21`, `routes/backup.ts:10`, `services/backupScheduleService.ts:106` |
| **Desktop** | Electron tray, `safeStorage` encrypt, `autoUpdater` GitHub `Lakshya52/FlowDesk`, deep link `flowdesk://google-auth-success` | `desktop/src/main.ts:30`, `desktop/src/preload.ts` |

---

## ⚡ Getting Started

### Prerequisites
- Node.js 18+ · npm · MongoDB 6+ · Git

### Installation

```bash
git clone https://github.com/Lakshya52/FlowDesk.git
cd FlowDesk

# server
cd server && npm install

# client
cd ../client && npm install

# desktop (optional)
cd ../desktop && npm install
```

### Running the App

```bash
# backend (ts-node-dev, port 5000 by default)
cd server
npm run dev

# frontend (Vite, http://localhost:5173)
cd ../client
npm run dev

# desktop (loads CLIENT_URL or local build)
cd ../desktop
npm run dev
```

- Seeding: `cd server && npm run seed` (`server/src/seed.ts`, `seed-leads.ts`, `seedTestUsers.ts`)
- E2E: `npm test` / `npm run test:headed` (Playwright `playwright.config.js`)

---

## 🔐 Environment Variables

**Server `server/.env`:**
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/flowdesk
JWT_SECRET=your_jwt_secret
CLIENT_URL=http://localhost:5173
BREVO_API_KEY=your_brevo_key
OPENAI_API_KEY=your_openai_key # for Buddy gpt-4o
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=...
NODE_ENV=development
```

**Client `client/.env`:**
```env
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=...
```

**Desktop `desktop/.env`:**
```env
FRONTEND_URL=https://your-production-url
```

Image/Calendar/Socket CSP allowlist is set in `server/src/index.ts:93` Helmet (`brevo.com`, `openai`, `cloudflare`).

---

## 🏗 Architecture Notes

- **Socket rooms:** `server/src/index.ts:318` guards `isConversationParticipant` / `isAssignmentMember`; `activeUsers` Set tracks `user_*` room size to infer offline; `markDeliveredForUser` auto-delivers pending on `join_user`.
- **Recurring cron:** `services/recurringTaskService.ts:439` immediate spawn + `scheduleNextTick` exact timer + `setInterval 5m` fallback; `stopRecurringJob` on SIGTERM (`index.ts:582`).
- **Field visit heartbeat:** `services/fieldVisitHeartbeatService.ts:9` `60s` check, `STALE_AFTER 5m` → `trackingLost` + tenant emits.
- **Multer:** `middlewares/upload.ts:69` `memoryStorage` `10MB`, fileFilter images/docs/excel → GridFS buffer directly.

---

## 🤝 Contributing

1. `git checkout -b feature/your-feature-name`
2. Commit `feat: ...` / `fix: ...`
3. `git push origin feature/your-feature-name`
4. Open PR vs `main` — include route/model references in description.
