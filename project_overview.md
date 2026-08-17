# 🏢 FlowDesk Project Overview

FlowDesk is a sophisticated, full-stack internal management ecosystem. It centralizes complex business operations—from high-level project management to granular day-to-day tasks—into a single, high-performance platform.

## 🏗 Modular Architecture

The software is built on a modern **MERN-like** stack (using TypeScript for end-to-end type safety):
- **Frontend**: React + TypeScript with a custom CSS design system optimized for readability and performance.
- **Backend**: Node.js + Express + Mongoose, providing a robust RESTful API.
- **Real-time**: Integrated Socket.io for immediate updates on chats and notifications.
- **Storage**: MongoDB with GridFS integration for handling secure document attachments.

---

## 🚀 Core Features

### 1. Project Management (Assignments)
The heart of FlowDesk. Projects are categorized into:
- **Ongoing Work**: Active projects currently being handled by teams.
- **Completed**: A permanent archive of finished projects for history and auditing.
- **Recurring Blueprints**: A powerful automation system. Blueprints act as templates that automatically spawn new project instances (Daily, Weekly, Monthly, or Yearly) with pre-filled tasks and teams.

### 2. Task Ecosystem
Tasks are granular units of work within projects:
- **State Management**: Tasks progress from `Todo` to `In Progress`, `Review`, and finally `Completed`.
- **Checkpointing**: Every task supports subtask checklists for tracking multi-step processes.
- **Team Ownership**: Tasks can be assigned to specific individuals or entire teams.

### 3. AI Buddy Integration
A built-in AI assistant that assists team members with:
- Project analysis and deadline forecasting.
- Generating task descriptions.
- Providing technical guidance based on previous project history.

### 4. Collaborative Canvas
A digital whiteboard and note-taking space where teams can:
- Create post-it style notes for brainstorming.
- Organize visual workflows.
- Switch between **Personal** and **Collaborative** modes for private drafting vs. team sessions.

### 5. Communication & Notification
- **Real-time Chat**: Dedicated chat rooms for every project.
- **Activity Logs**: A comprehensive audit trail of every change made to a project or task.
- **Dynamic Notifications**: In-app alerts for assignments, mentions, and approaching deadlines.

---

## 🔒 Security & Permissions

FlowDesk implements a strict Role-Based Access Control (RBAC) system:
- **Admin**: Full system control, financial reports, and user management.
- **Manager**: Oversees specific teams, creates assignments, and approves completed work.
- **Member**: Focuses on task execution, updates, and collaboration within their assigned projects.

## 🛠 Advanced Features
- **Intelligent Spawning**: The recurring engine ensures no duplicates are created and "catches up" if the system was offline during a scheduled cycle.
- **"No Due Date" Handling**: Specialized logic to handle projects and tasks without finite deadlines, preventing the common "Unix Epoch (1970)" bug.
- **Glassmorphism UI**: A premium, semi-transparent design language that reduces eye strain and provides a modern look-and-feel.



<!-- question -->
what is happening under the hood, how the system is able to detect online and offline status of the user in realtime

<!-- answer starts -->
Here is exactly what is happening under the hood. It is a brilliant question, and understanding this flow makes it clear why this is the perfect solution.

### The Variables in Play (From your screenshot)
When this line of code executes:
```typescript
useChatStore.getState().handleUserStatusChange(userId, status, user?._id);
```
Here is exactly where each value comes from and what it represents:

1. **`userId`** *(from the Socket.io event)*:
   * **What it is**: The ID of the user whose status just changed (e.g. they focused their tab, went idle, or closed their app).
   * **Who it belongs to**: This could be **any user** in the system—including your colleague "Jane", or **you** ("Deepak").

2. **`status`** *(from the Socket.io event)*:
   * **What it is**: The value `"online"` or `"offline"`.

3. **`user?._id`** *(from `useAuthStore`)*:
   * **What it is**: **Your own logged-in user ID** (e.g., `ObjectId("69fdedf8...")` for Deepak Rai).
   * **Where it comes from**: This comes from **Zustand's Auth Store** (`useAuthStore()`) which manages your active session.

---

### Why is this happening? (The core problem)
In a direct messaging app like WhatsApp, every conversation on your sidebar is a **Direct Chat** between two participants:
1. **You** (the logged-in user)
2. **Your colleague** (the person you are talking to)

When you are active, your app sends a message to the server: *"Deepak is online!"*. The server then broadcasts this globally to everyone connected. 

**Because you are a client, your app also receives that broadcast.** 

Previously, without your own ID as a reference, the store logic was:
> *"Let's look at all conversations on my sidebar. If any of the participants in a chat has the ID that just went online, make that chat green."*

Since **you** are a participant in **every single chat** on your sidebar, the moment the app received the broadcast that *you* went online, it matched your ID in every chat, and **turned every single conversation green**, even though your colleagues were completely offline!

---

### How the fix works (Step-by-Step)
By passing **your own ID** (`user?._id`) to the Zustand chat store as the third parameter (`currentUserId`), we tell the store:
> *"Only update the green dot of a conversation if the status change belongs to the **other person** in the chat, not me."*

Inside [chatStore.ts](file:///c:\Users\ACEONE\Desktop\flowdesk\FlowDesk-Password-reset=problem-fixed\FlowDesk\client\src\store\chatStore.ts#L172-L184), the filtering is now performed as:
```typescript
// Find if the status update is for the OTHER participant in this direct chat
const otherParticipant = c.participants.find(p => p._id === userId && p._id !== currentUserId);
```

#### Scenario A: Your colleague "Jane" goes online
1. `userId` is **Jane's ID**.
2. `currentUserId` is **your ID** (Deepak).
3. The filter checks: *Is Jane's ID equal to `userId`?* **Yes.** *Is Jane's ID different from your ID?* **Yes.**
4. `otherParticipant` is found! The green dot next to **Jane's chat** lights up. 

#### Scenario B: You ("Deepak") go online
1. `userId` is **your ID** (Deepak).
2. `currentUserId` is **your ID** (Deepak).
3. The filter checks: *Is your ID equal to `userId`?* **Yes.** *Is your ID different from your ID?* **No (they are the same).**
4. `otherParticipant` is **not found** because the status update belongs to you. No chats turn green incorrectly!
<!-- answer ends -->