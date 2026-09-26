# Notifications System — System Design (Plan)

> Status: **Plan only** — no implementation. Scope: multi-channel notifications for FlowDesk.

---

## 0. Current state (what exists today)

| Layer | What's there | Gaps |
|---|---|---|
| **Model** | `Notification` (user, type, title, message, isRead, link, metadata) | No readAt, priority/channel state, category, expiry, delivery receipts |
| **Service** | `createNotification` / `createNotifications` → insert + emit `new_notification` to `user_${id}` room | Fire-and-forget; no preferences, dedupe, delivery status, or batching |
| **API** | `GET /notifications` (last 10), `PUT /:id/read`, `PUT /read-all` | No cursor pagination, no batch mark-read, no preferences API |
| **Realtime** | Socket auth (`io.use` → JWT → `socket.data.userId/tenantId/role`); `join_user` → `user_${id}` room | No ack, no redelivery on reconnect, no inbox sync |
| **Client** | `Header.tsx` bell dropdown; Electron native via `showNotification`; unread count | Local imperative state, no persisted inbox store, no preferences UI |
| **Producers** | assignments, tasks, comments, boards, chat, conversation, recurringTaskService (deadline) | Producer-specific logic; no central emit path |

**Goal:** a centralized, scalable, preference-aware, multi-channel notification platform — not just a bell dropdown.

---

## 1. Architecture overview

```
Producers ──► notify(intent) ──► [resolve audience → apply prefs → dedupe → persist → dispatch]
                                              │
                    ┌──────────────┬──────────┴──────────┬──────────────┬─────────────┐
                    ▼              ▼                     ▼              ▼             ▼
                 In-app         Native (Desktop)     Browser          Web-push     Email (Brevo)
              (socket inbox)   (Electron IPC)     (Notification API)   (future)     (worker queue)
```

**Key principle:** producers never touch sockets or channels. They call one `notify()` with a high-level intent; routing, delivery, and preferences are all centralized.

---

## 2. Data model

### 2a. `Notification` (revised)

```ts
user          ObjectId            // recipient (field KEPT as `user` for compatibility)
type          enum                // existing enum + extended categories
priority      'low'|'normal'|'high'|'urgent'
category      'tasks'|'assignments'|'chat'|'comments'|'calendar'|'boards'|'system'
title, message
link          // deep-link path (/tasks/:id, /assignments/:id, /chats/:convId ...)
metadata      Mixed               // actor, entityId, entityType, image, actorName, conversationId
actor         ObjectId            // who triggered it
isRead: bool
readAt: Date
isArchived, archivedAt
seenAt        // inbox-scroll "seen" — distinct from "read"
dedupeKey     // sparse, for coalescing
expiresAt     // TTL for volatile types (calendar reminders, transient system)
delivery      // per-channel state: { in_app:{status,at}, native:{...}, email:{status,txId} }
createdAt, updatedAt
```

Indexes:
- `{ user, createdAt: -1 }` (feed query)
- `{ user, isRead: 1, createdAt: -1 }` (unread badge)
- `{ user, category, isRead: 1 }` (per-category unread + prefs)
- `{ dedupeKey: 1 }` (sparse, for coalescing)
- `{ expiresAt: 1 }` (TTL index)

### 2b. `NotificationPreference` (new)

```ts
user        ObjectId (unique)
channels    { in_app, native, browser, web_push, email, sound }   // booleans
emailDigest 'realtime'|'daily'|'weekly'|'off'
perCategory { [category]: { enabled, channels? } }  // per-category override
quietHours  { enabled, start, end, tz }
urgency     'all'|'high_only'|'off'
```

### 2c. `NotificationDevice` (new — web-push / browser; also usable by native)

```ts
user, deviceId, platform ('browser'|'desktop'|'mobile'),
push?: { endpoint, keys:{ p256dh, auth }, expiration },
browserNotif: boolean, lastSeen
```

### 2d. `NotificationOutbox` (new — email queue)

```ts
user, to, subject, body, template, priority,
status 'queued'|'sending'|'sent'|'failed', attempts, lastError,
scheduledAt, sentAt, createdAt
```

---

## 3. Service layer (`notificationService.ts` rewritten)

**Entry: `notify(intent)`**

```ts
intent = {
  type, category, priority,
  audience,        // [userId] | tenant | role | "assignment members"
  actor, entityId,
  title, message, link,
  metadata, dedupeKey, windowMs
}
```

Flow:
1. **resolveAudience(intent)** → `[userId]` — explicit user, tenant, role, or assignment members (reuse existing membership helpers).
2. **applyPreferences(user, type/category)** → allowed channels per user (skip disabled; quiet-hours filters native/browser/email; digest → outbox).
3. **coalesce(dedupeKey, windowMs)** → if a same-dedupeKey notification exists within window, bump `updatedAt`/count instead of inserting (throttling).
4. **persist()** → single insert (or bulk for fan-out) → `_id`s.
5. **dispatch(notification, channels)** → route per channel.

**Per-channel dispatch:**

- **In-app:** `io.to(`user_${id}`).emit('notification:new', n)`
- **Native desktop:** same payload; client flag triggers Electron `showNotification`. Respect `native` pref + quiet hours.
- **Browser:** client-side `Notification` API (permission-gated). Server doesn't push this — the **client** decides after receiving the in-app payload based on `browser` pref.
- **Web-push (future):** `webpush.sendNotification(device.push, payload)` over active `NotificationDevice`s. Designed as a plug-in in `dispatch()` (stub now).
- **Email:** write to `NotificationOutbox` (queued). A worker drains the queue → Brevo. Never blocks `notify()`.
- **Sound:** client-side chime; disabled in quiet hours / pref.

**Supporting APIs:**

- Feed: `GET /notifications?cursor&limit&category&unreadOnly` (cursor-paginated, not limit-10)
- `PUT /notifications/read` (ids[]), `PUT /notifications/read-all`, `PUT /notifications/seen`
- `GET/PUT /notifications/preferences`
- `POST /notifications/devices` (register web-push/browser), `DELETE /notifications/devices/:id`
- `GET /notifications/unread-count`

**Robustness / realtime protocol:**

- **Ack:** client emits `notification:ack { id }` after applying; server tracks per-connection lastDelivered.
- **Redelivery:** on reconnect (`replaySince`), server re-emits missed `notification:new`; client also reconciles via cursor pull.
- **Room hygiene:** `join_user` explicit; presence via per-user socket count (multiple devices supported).

---

## 4. Channels detail

| Channel | Trigger | Client role | Server role | Pref gate | Quiet hrs |
|---|---|---|---|---|---|
| **In-app** | socket | store feed + badge | persist + emit | `in_app` | no |
| **Native desktop** | Electron IPC | `showNotification` + click → route | emit payload | `native` | yes |
| **Browser** | `Notification` API | request permission; show on payload if `browser` pref | — (client decides) | `browser` | yes |
| **Web-push (future)** | web-push lib | service worker | `webpush.sendNotification` on `NotificationDevice` | `web_push` | yes |
| **Email** | Brevo worker | — | outbox + worker | `email` + digest | digest only |
| **Sound** | client | chime | — | `sound` | yes |

---

## 5. Client architecture

**`notificationStore` (Zustand)** — mirrors `chatStore`:
- `feed`, `unreadCount`, `cursor`, `hasMore`, `isLoading`
- `fetchFeed(reset?)`, `markRead(ids)`, `markAllRead()`, `ack(id)`, `reconcile(reconnect)`
- socket handlers: `notification:new`, `user_status_change`

**Components:**
- **`NotificationBell`** — extracted from Header; badge + dropdown.
- **`NotificationsPage`** (`/notifications`) — full feed: category filter, unread toggle, cursor pagination, mark-read, archive, click-to-navigate deep links, "mark all seen" on scroll.
- **`NotificationSettingsPanel`** — master toggles, per-category toggles, quiet hours + timezone, email digest mode, browser-permission CTA, web-push register (future).
- **Desktop wiring** — reuse `electronAPI.showNotification`; click routes via existing `navigate_request`.
- **Browser** — `Notification.requestPermission()` helper + fallback to in-app only on deny.

---

## 6. Producer migration

Replace scattered `createNotification*` calls with centralized `notify()`:
- assignmentController (created, assigned, status)
- taskController (assigned, deadline, mention)
- commentController (comment, reply, mention)
- boardController (invite)
- chatController / conversationController (DM)
- recurringTaskService (deadline / reminder)
- new: calendar (shared, event invite, reminder)

Each producer passes `{ type, category, actor, entityId, link, metadata, priority }` — channels/prefs handled centrally.

---

## 7. Security, scaling, operations

- Reads scoped to `req.user._id` / `socket.data.userId` (IDOR-safe); audience resolvers verify tenant/role membership (reuse `isAssignmentMember` / `isConversationParticipant` patterns).
- Rate-limit email per recipient/day; TTL-prune volatile notifications; sanitize title/message.
- Worker pattern isolates slow email; swap socket adapter to Redis later for horizontal scale (confined to `dispatch`).
- Observability: `notificationService` logs intent → channels chosen; optional analytics event.

---

## 8. Implementation phases

1. **Foundation:** revised models (`Notification`, `Preference`, `Device`, `Outbox`) + rewritten `notify()` service + cursor/prefs/device/outbox APIs + socket ack/replay.
2. **Realtime + store:** `notificationStore`, bell refactor, ack + offline redelivery, unread cache.
3. **UI:** `/notifications` page, settings panel, browser-permission flow, native desktop proposal.
4. **Email:** Brevo outbox worker + digest scheduler *(deferred — decision pending)*.
5. **Producers + push hooks:** migrate all producers; stub web-push; observability + TTL job.

---

## Decisions recorded

- Keep the `user` field on `Notification` (no broad rename to `recipient`).
- Email (Brevo) channel deferred — architectural hooks included but implementation decided later.
- All channels targeted: in-app, native desktop, browser, web-push (future), email (deferred).
- Plan only — no code written yet.
