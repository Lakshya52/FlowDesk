# 📦 FlowDesk Release Notes — v4.2.0

> Source: codebase `server/package.json:3`, `client/package.json:4`, `desktop/package.json:3` all `4.2.0`. History aggregated from current implementation + git-tracked `RELEASE_NOTES.md`.

---

## v4.2.0 — Current

### New Features
- **Delivered & Read ticks** — WhatsApp-style `✓` single / `✓✓` double / `✓✓` blue read on every `Message` and in chat list preview. Server `mark_messages_read L449` validates owner+participant, updates `readBy+deliveredTo`, emits `messages_read|messages_delivered`; auto `markDeliveredForUser L348` on `join_user` (`server/src/index.ts:290`). Client `ChatsPage.tsx:122` + `chatStore.ts:83`.
- **Resizable chat sidebar** — drag divider, width persisted between sessions (`server/src/index.ts:317 layout`, `ChatsPage.tsx:122`, `components/layout/AppLayout.tsx`).
- **E2EE device recovery** — new device `request_key_heal L525` fan-out to `user_*` + `conversation_*`, per-device `encryptedKeyWraps` (`Conversation.ts:66`) restored so history stays readable after re-login.
- **"What's New" on update** — once-per-version modal auto-pulled from GitHub Releases `Lakshya52/FlowDesk` (`controllers/releaseController.ts:30`, `components/common/WhatsNewModal.tsx`, `RELEASE_NOTES.md:6`).

### Bug Fixes
- Delivered/read ticks not updating live in conversation list when recipient comes online or reads — now real-time via `messages_read/delivered` emits (`index.ts:449`).
- Last-message preview showing encrypted placeholder instead of decrypted content + tick (`Conversation.ts` decrypt path).
- Overlapping z-index across popups/toasts/modals/mobile sidebar backdrop (`components/common/Modal.tsx role=dialog`, `App.tsx:190 Toaster zIndex 5000`, `RELEASE_NOTES.md:12`).
- Sidebar resize handle cursor drift due to page padding (`RELEASE_NOTES.md:13`).

### Improvements
- Chat list shows online presence (green/yellow/gray via `user_active_status L403`), latest preview, right-aligned ticks.
- Smoother cursor-tracked dragging in `AppLayout` + `ChatsPage`.
- Kanban columns always-present `"New Task"` hover slot — no layout jump (`BoardsPage.tsx:16`, `RELEASE_NOTES.md:19`).
- Cleaner loading skeletons + simplified `keepPreviousData` for dashboard activity (`DashboardPage.tsx:100`).

---

## v4.1.x — Platform Hardening (codebase baseline)

- **Multi-tenant + RBAC** — `Tenant.ts:26 plan free/starter/pro/enterprise`, `User.permissions.allowedTabs[]` + `App.tsx:224 RouteGuard` + `middlewares/auth.ts:49 authorize`.
- **Recurring engine** — exact `setTimeout` scheduler + 5-min safety scan, duplicate guard, weekdays/dayOfMonth, pause (`services/recurringTaskService.ts:116`).
- **Field visit live** — heartbeat `60s / STALE_AFTER 5m` `fieldVisitHeartbeatService.ts:9`, 9 tenant socket emits, `useLocationTracking.ts:11` `watchPosition 5s`.
- **Calendar** — 5 views, share pending/accepted/rejected, Google OAuth sync 2500 events `-180/+365d` (`routes/googleCalendarImport.ts:20`).
- **CRM** — Leads 11-stage funnel + call timeline + meeting status (`Lead.ts:58`), Companies hierarchy + bulk email Brevo (`routes/companies.ts:27`), Field visits selfie/geo + TSP route.
- **AI Buddy** — `POST /buddy` + SSE stream `gpt-4o` + local Ollama proxy `POST /api/buddy/ollama` (`routes/buddy.ts:310`, `index.ts:230`).
- **Backup scheduler** — per-tenant `daily/weekly/monthly` + `email-now` zip dump (`services/backupScheduleService.ts:106`).
- **GridFS + Sharp resize** — `GET /uploads/:filename/resize?w=&q=` cached 604800 (`index.ts:180`).

---

## How to read a release

- Client `WhatsNewModal` opens once after each version bump (reads `GET /releases` GitHub). Assets categorized OS via `Releases.tsx:51 categorizeAsset / buildDownloads L98`.
- Desktop `autoUpdater` (`desktop/src/main.ts:290` `checking-for-update|update-available|update-downloaded`) handles `flowdesk-desktop 4.2.0` via `electron-updater 6.3.9` published `provider github Lakshya52/FlowDesk` (`desktop/package.json:78`).

## Upgrade

```bash
# client/server
git pull
cd server && npm install && npm run build
cd ../client && npm install && npm run build

# desktop
cd ../desktop
npm run dist:win   # release/FlowDesk-Setup-4.2.0.exe (nsis + portable)
npm run dist:mac   # release/*.dmg
npm run dist:linux # release/*.AppImage
```
