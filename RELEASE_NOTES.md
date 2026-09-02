## New Features

- Delivered and read status (✓ single tick, ✓✓ double tick, ✓✓ blue tick) on every message and in the chat list — WhatsApp-style awareness of whether your recipient has received or read your message.
- The chat list sidebar is now resizable — drag the divider to a width you like and it is remembered between sessions.
- New device recovery for end-to-end encryption: when you sign in on another device, your device safely requests and recovers the keys for past conversations, so your chat history stays readable.
- A "What's new" screen now greets users once after each app update, showing the latest release notes automatically (pulled from GitHub Releases).

## Bug Fixes

- Fixed the delivered/read ticks not updating live in the conversation list when a recipient comes online or reads the message — the sidebar tick now flips in real time.
- Fixed the chat last-message preview showing the encrypted placeholder instead of the decrypted content and status tick.
- Fixed overlapping z-index across popups, toasts, modals, and the mobile sidebar backdrop in Boards, Tasks, Chat, and the rest of the app.
- Fixed the chat sidebar resize handle tracking the cursor incorrectly (it no longer drifts due to page padding).

## Improvements

- Chat list now shows who's online, the latest message preview, and right-aligned status ticks next to your sent messages.
- Smoother, cursor-tracked sidebar dragging in both the main app layout and the chat page.
- Kanban board columns show an always-present "New Task" slot that lights up on hover — no more layout jumping.
- Cleaner loading skeletons and simplified loading logic for the Tasks boards.
