# FlowDesk Client — React + Vite SPA (v4.2.0)

> Source: `client/package.json:4` `4.2.0` `React 19.2 + Vite 7.3 + TypeScript 5.9 + Tailwind 4.2 + Zustand 5 + TanStack Query 5`.

## Stack

- **Build:** `Vite 7.3` + `@vitejs/plugin-react 5.1` + `@tailwindcss/vite 4.2` (`client/package.json:44`). `tsc -b && vite build` (`package.json:8`).
- **Core:** `react 19.2`, `react-router-dom 7.13` (HashRouter `App.tsx:209`), `zustand 5` (`authStore`, `chatStore`, `calendarStore`, `themeStore`, `iconsAnimationStore`), `axios 1.13` (`lib/api.ts`), `socket.io-client 4.8` (`hooks/useSocket.ts:5`).
- **UI:** `lucide-react 0.576`, `recharts 3.7`, `react-hot-toast 2.6`, `react-easy-crop 6.2`, `react-markdown 10.1`, `gsap 3.15`, `@animateicons/react 0.4.3`, Tiptap `3.22` (`@tiptap/react` + extensions color/font-family/highlight/placeholder/task-item/task-list/text-align/underline).
- **Lint:** `eslint 9.39` + `typescript-eslint 8.48` + `eslint-plugin-react-hooks/refresh` (`eslint.config.js`).

## Project Structure

```
client/
├── public/
│   ├── icon.ico / logo.png / vite.svg
│   ├── dashboard.png / dashboardMobile.png
│   ├── AndroidIcon.svg / AppleIcon.svg / WindowsIcon.svg / LinuxIcon.svg
│   └── docs/images/            # flowdesk-*.png used by Documentation.tsx
├── src/
│   ├── pages/                  # 23 route targets
│   │   ├── LandingPageNew.tsx  # active landing (App.tsx:36 LandingOrDashboard)
│   │   ├── LandingPage.tsx     # legacy (530 lines, commented out in App.tsx)
│   │   ├── LoginPage.tsx       # OTP forgot flow, remember me
│   │   ├── RegisterPage.tsx    # company slug + OTP verify tenant creation
│   │   ├── DashboardPage.tsx   # stats cards + pie/line/bar + activity pagination
│   │   ├── AssignmentsPage.tsx / AssignmentDetailPage.tsx # list + detail+whiteboard
│   │   ├── TasksPage.tsx       # cross-project table, rank drag reorder
│   │   ├── BoardsPage.tsx      # Kanban + column/member workflows
│   │   ├── CalendarPage.tsx    # 5 views + Share + Google import
│   │   ├── ReportsPage.tsx     # 4 tabs + FilterBar + Drilldown + export
│   │   ├── ChatsPage.tsx       # E2EE DM + ticks + resizable
│   │   ├── CanvasPage.tsx      # personal infinite canvas
│   │   ├── CrmPage.tsx         # router for 7 CRM sections
│   │   ├── ClientsPage.tsx     # company tree + contacts tabs
│   │   ├── BulkEmailPage.tsx   # hierarchical selector + Tiptap editor
│   │   ├── TeamsPage.tsx / SettingsPage.tsx / BackupPage.tsx
│   │   ├── Releases.tsx / Documentation.tsx / NotFoundPage.tsx
│   │   └── FilesPage.tsx       # GridFS browser (route commented out App.tsx:311)
│   ├── components/
│   │   ├── layout/             # AppLayout, Sidebar (navItems + allowedTabs), Header (Ctrl+K search + bell)
│   │   ├── calendar/           # 13 files: CalendarSidebar/Toolbar, Month/Week/Day/Year/AgendaView, EventModal/Drawer/Chip, CalendarModal/ShareModal, ImportModal
│   │   ├── crm/                # CrmDashboard, Campaigns, DialQueue, LeadDetailModal, FieldVisits/* (List/Map/RoutePlanner/CheckIn/Out/Expenses/Remarks), Schedule, Summary, CrmLogs
│   │   ├── assignments/        # ProjectCanvas (assignment shared whiteboard)
│   │   ├── reports/            # FilterBar, EmployeeTracking/Workload/Activity/ProjectHealthReport, DrilldownModal, ReportStates
│   │   └── common/             # Buddy (SSE stream), Avatar, AvatarCropModal, CameraCapture, SignaturePad, RichTextEditor, Modal, FilePreviewModal, CanvasNavigator, NoteExportMenu, Navbar, Footer, WhatsNewModal
│   ├── store/                  # authStore (persist token + loadUser GET /auth/me), chatStore, calendarStore (view year|month|week|day|agenda), themeStore, iconsAnimationStore
│   ├── hooks/                  # useSocket (getSocket singleton auth.token), useTaskSocket (tenant room invalidate), useCrmSocket, useFieldVisitSocket, useLocationTracking (watchPosition 5s → POST /field-visits/:id/location), useReportQuery
│   ├── lib/                    # api.ts (axios base + JWT header), whatsnew.ts, crypto.ts (E2EE helpers), useDebounce.ts
│   ├── docs/content.ts         # Documentation slugs (skipped for features per instruction)
│   ├── App.tsx                 # HashRouter + QueryClient(retry 1, refetchOnWindowFocus false) + Toaster + RouteGuard + LandingOrDashboard
│   ├── main.tsx
│   └── index.css               # Tailwind 4 + CSS vars --color-bg/surface/border/text
├── vite.config.ts
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── nginx.conf / .htaccess / web.config
└── package.json
```

## Routes `client/src/App.tsx:290`

- **Public:** `/` → `LandingOrDashboard` (`user ? /dashboard : LandingPageNew`), `/release` (`Releases.tsx:28 fetchAll GitHub`), `/documentation/:slug?` (`Documentation.tsx:56`), `/login`, `/register`.
- **Protected** (`AppLayout` + `RouteGuard:224`): `/dashboard`, `/assignments`, `/assignments/:id`, `/tasks`, `/tasks/:id`, `/boards`, `/clients`, `/calendar`, `/reports/:reportType` → `ReportsPage`, `/teams`, `/canvas`, `/bulk-email`, `/settings`, `/backup` admin, `/chat`, `/crm/:section/:subsection` (7 sections `CrmPage:18`), `*` → `NotFoundPage`. Navbar only on `["/","/release","/404"]` (`App.tsx:258 showNavbar`). `FilesPage` route disabled (`App.tsx:311` commented) although backend `routes/files.ts` exists.

## Environment

Create `client/.env`:

```env
VITE_API_URL=http://localhost:5000
```

`lib/api.ts` attaches `Authorization: Bearer <token>` from `authStore` persist; `useSocket.ts:5 getSocket()` re-reads token on reconnect.

## Development

```bash
cd client
npm install
npm run dev      # Vite on http://localhost:5173
npm run build    # tsc -b && vite build → dist/
npm run preview  # vite preview
npm run lint     # eslint .
```

- **HMR:** `@vitejs/plugin-react` Babel/SWC Fast Refresh (template comment `README.md:7` retained).
- **Theme:** `themeStore.ts:3 isDark persist` toggles `document.documentElement.classList`, vars `--color-bg/surface/text` in `index.css`. Toggle via `SettingsPage.tsx:45` or sidebar icon.
- **State:** `authStore.ts:39` `login(email,pw) POST /auth/login`, `loadUser() GET /auth/me` refreshes `permissions.allowedTabs`; `calendarStore.ts:11` `currentDate/currentView/visibleCalendarIds` + `navigatePrev/Next/Today`; `chatStore.ts:4` `conversations/activeConversationId/totalUnreadCount fetchConversations GET /conversations L116`.

## Key Patterns

- **Socket:** `getSocket()` singleton `io(CLIENT_URL, { auth:{ token }})`; teardown `disconnectSocket()`. Subscriptions: `useTaskSocket` tenant `task_*/board_*` → invalidate `["tasks","boards"]`; `useCrmSocket` `lead_*/campaign_*`; `useFieldVisitSocket` `field_visit_*` → toast + refresh (`hooks/*`).
- **Location:** `useLocationTracking({ visitId, enabled })` `navigator.geolocation.watchPosition` every 5s → `POST /field-visits/:id/location {lat,lng,accuracy}` (`hooks/useLocationTracking.ts:11`).
- **Reports:** `useReportQuery<T> L11` wraps `useQuery` 5-min cache for `GET /reports/*` + `exportReport` blob helper.
- **Docs:** `Documentation.tsx:56` slug param renders `content.ts` markdown; `Releases.tsx:28` `categorizeAsset L56 / buildDownloads L98` OS buckets for `WhatsNewModal`.

## Expanding ESLint (from template)

Template recommends type-aware rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      tseslint.configs.recommendedTypeChecked,
      // or strictTypeChecked / stylisticTypeChecked
    ],
    languageOptions: {
      parserOptions: { project: ['./tsconfig.node.json','./tsconfig.app.json'], tsconfigRootDir: import.meta.dirname }
    }
  }
])
```

Add `eslint-plugin-react-x` + `eslint-plugin-react-dom` for React-specific rules (`reactX.configs['recommended-typescript']`).

See root `README.md` + `project_overview.md` for backend coupling and `desktop/IMPLEMENTATION_GUIDE.md` for Electron loading of this build.
