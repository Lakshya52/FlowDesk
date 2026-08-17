import fetch from "node-fetch";
import KnowledgeChunk from "../models/KnowledgeChunk";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const EMBEDDING_MODEL = "all-minilm";
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 80;

// ─── Embedding ──────────────────────────────────────────────────────────────

export async function generateEmbedding(text: string): Promise<number[]> {
  // Truncate to first 512 chars — all-minilm max context is 256 tokens (~512 chars)
  const truncated = text.slice(0, 1024);

  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: truncated,
      keep_alive: -1,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama embedding failed: ${response.status}`);
  }

  const data = (await response.json()) as { embedding: number[] };
  return data.embedding;
}

// ─── Chunking ───────────────────────────────────────────────────────────────

export function chunkText(
  text: string,
  chunkSize: number = CHUNK_SIZE,
  overlap: number = CHUNK_OVERLAP
): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (cleaned.length <= chunkSize) return [cleaned];

  const chunks: string[] = [];
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  let currentChunk = "";

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.ceil(overlap / 6));
      currentChunk = overlapWords.join(" ") + " " + sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// ─── Cosine Similarity ──────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Knowledge Source Definitions ───────────────────────────────────────────

interface KnowledgeSource {
  name: string;
  content: string;
  page?: string;
  tags: string[];
}

function getKnowledgeSources(): KnowledgeSource[] {
  const FLOWDESK_KNOWLEDGE = `
FLOWDESK — COMPLETE APPLICATION KNOWLEDGE BASE
=================================================

FlowDesk is a comprehensive internal team & project management platform built for organizations.
It provides end-to-end project tracking, task management, team collaboration, client/company management,
file sharing, reporting, and more.

## APPLICATION PAGES & FEATURES

### 1. LANDING PAGE (/)
- Public-facing welcome page for FlowDesk
- Hero section with app overview
- Feature highlights and benefits
- Call-to-action buttons for login/signup
- Quick navigation to key sections

### 2. AUTHENTICATION (/login)
- Email & password login with validation
- "Remember Me" persistent sessions
- Forgot Password flow:
  1. Click "Forgot Password?" on login page
  2. Enter registered email address
  3. Receive a One-Time Password (OTP) via email
  4. Enter OTP to verify identity
  5. Set a new password
  6. Login with new credentials
- Change password from Settings after login
- Secure JWT-based authentication

### 3. DASHBOARD (/dashboard)
- Central overview hub for all activity
- Real-time statistics cards:
  - Total assignments/projects
  - Tasks in progress
  - Completed tasks
  - Overdue tasks
- Task status pie chart (To Do, In Progress, Review, Completed)
- Weekly activity trends line chart
- Recent assignments with quick access
- Team overview panel
- Activity feed with real-time updates
- Navigation shortcuts to frequent features

### 4. PROJECTS / ASSIGNMENTS (/assignments)
- Full project lifecycle management
- "Create Assignment" button in top right
- Assignment list with advanced filtering:
  - Filter by status (todo, in_progress, review, completed)
  - Filter by team member
  - Search by project name
- Each assignment card shows:
  - Title and description
  - Team members (avatars)
  - Due date
  - Progress indicator
  - Status badge (color-coded)
- Click to open Assignment Detail Page:
  - Full project description and metadata
  - Task list tied to the project
  - Team chat / real-time messaging (Socket.io powered)
  - Collaborative whiteboard / notes
  - File attachments
  - Activity timeline with all changes
  - Edit assignment settings
  - Delete with confirmation dialog

### 5. TASKS (/tasks)
- Individual task management across all projects
- "Create Task" button in top right corner
- Task creation form:
  - Title (required)
  - Description
  - Assign to project/assignment
  - Assignee (team member)
  - Due date picker
  - Priority (low, medium, high, urgent)
  - Status (todo, in_progress, review, completed)
  - Tags/labels for categorization
- Task list with powerful filters:
  - By status
  - By priority
  - By assignee
  - By due date range
  - Full-text search
- Drag-and-drop to update task status
- Bulk actions (select multiple, batch update status/priority)
- Task detail view:
  - Full description
  - Comments & discussion thread
  - Activity history audit trail
  - Subtask support
  - File attachments
- Mark tasks complete
- Tasks appear as sub-items under Projects in sidebar navigation

### 6. Companies & Clients (/clients)
- Company Management: Full CRM-style client/company management
- Left sidebar shows company tree with parent-child hierarchy
- "+" button to create new companies
- Import/Export capabilities:
  - Import from Excel (.xlsx, .xls) with column mapping
  - Export to Excel spreadsheet
  - Export to PDF document
- Creating a Company:
  1. Click "+" button in top-left of company list
  2. Fill in: Company Name (required), Parent Company (optional), Industry, Phone, Website, Description
  3. Enter Address: Street, City, State, Postal Code, Country
  4. Click "Create Company"
- Company Hierarchy:
  - Companies can have parent-child relationships
  - Selecting a parent company reveals its subsidiary companies in the sidebar with visual branching lines
  - Click any child company to view its details
  - The tree structure supports unlimited nesting levels
- Company Details (right panel):
  - Company name with status badge (active/inactive)
  - Industry classification
  - Description
  - Website link and phone number
  - Three tabs: Info, Contacts, Projects
- Contact Management:
  - Add contacts to any company
  - Contact fields: Name, Email, Phone, Position, Department, Notes
  - Mark contacts as "Primary" (highlighted with badge)
  - Edit and delete contacts
- Bulk Messaging (/bulk-email):
  - Dedicated page to send emails to multiple companies simultaneously
  - Select companies from a hierarchical tree list
  - Supports recursive selection of child companies
  - Compose rich text messages and send to all primary contacts

### 7. TEAMS (/teams)
- Team creation and management
- View all teams the user belongs to
- Create new teams with name and description
- Invite members:
  1. Click "Invite Member" button
  2. Enter email address(es)
  3. Select role: Admin, Member, or Viewer
  4. Optionally add a personal message
  5. Send invitation (they receive an email)
- Role-based access:
  - Admin: Full control over team and projects
  - Member: Can create/edit tasks and assignments
  - Viewer: Read-only access
- Pending invitations list
- Team activity feed
- Team-specific communication channels

### 8. CALENDAR (/calendar)
- Monthly calendar view with visual event markers
- Color-coded events:
  - Red: Overdue tasks
  - Blue: Upcoming deadlines
  - Green: Completed tasks
  - Yellow: Holidays
- Click any date to see all tasks/events for that day
- Filter by team member or project
- Holiday management and display
- Export calendar to external calendar apps

### 9. REPORTS (/reports)
- Comprehensive analytical reporting
- Report types available:
  - Employee Tracking: Individual performance metrics
  - Workload Distribution: Team capacity analysis
  - User Activity: Activity logs and engagement
- Sub-pages accessible from sidebar:
  - /reports/employee
  - /reports/workload
  - /reports/activity
- Filtering options:
  - Date range selector
  - Team/department filter
  - Project filter
  - Individual member filter
- Export formats:
  - PDF download
  - Excel/CSV export
  - Print-friendly version
- Visual charts and graphs
- Scheduled auto-reports via email

### 10. SETTINGS (/settings)
- Personal profile management:
  - Update name, email, avatar
  - Change password
  - Two-factor authentication (2FA)
- Notification preferences:
  - Email notifications toggle
  - In-app notification settings
  - Frequency: Instant, Daily digest, Weekly digest
- Appearance:
  - Light mode
  - Dark mode
  - Auto (follows system preference)
- Privacy and security settings
- Session management (logout from all devices)

### 11. FILES (/files)
- Central document repository
- Upload via button or drag-and-drop
- Folder-based organization
- File features:
  - Search by filename
  - Filter by type (PDF, images, documents)
  - Sort by date, size, name
  - Inline file preview
  - Download files
  - Share with team members
  - Version history
- Maximum 10MB per file
- Recent files section
- Starred/favorite files

## NAVIGATION STRUCTURE
The application uses a collapsible sidebar with the following structure:
- Dashboard
- Projects (with sub-item: Tasks)
- Whiteboard / Notes (inside Project Details - Collaborative)
- Companies & Clients
- Bulk Messaging
- Personal Canvas (Private Playground)
- Teams
- Calendar
- Reports (with sub-items: Tracking, Workload, User Activity)
- Settings

## REAL-TIME FEATURES
- Socket.io powered real-time messaging in assignments
- Live typing indicators
- Instant notification delivery
- Real-time activity feed updates

## KEYBOARD SHORTCUTS
- Ctrl+K: Quick search
- Ctrl+N: Create new (context-aware based on current page)
- Esc: Close modals and dialogs
- Enter: Save/confirm in forms

## COMMON TROUBLESHOOTING
- Can't login: Verify email/password, use "Forgot Password" to reset
- Missing data: Refresh page (F5), check active filters
- Upload failing: Ensure file is under 10MB, check file type support
- Slow performance: Clear browser cache, check internet connection
- Notifications missing: Check Settings > Notifications, browser notification permissions
- Company not showing children: Click the parent company to load and view subsidiaries
- Contact not saving: Ensure Name field is filled (required)
`;

  const BUDDY_DETAILED_PROMPT = `
FLOWDESK BUDDY — DETAILED MODULE DOCUMENTATION

ASSIGNMENTS (Project Management):
Projects are divided into three buckets:
1. Ongoing Work — Active projects currently assigned to teams.
2. Completed — A permanent, immutable archive for history and auditing.
3. Recurring Blueprints — Template-based automation engine.

RECURRING BLUEPRINTS — how they work under the hood:
- A Blueprint is a reusable template (pre-filled tasks, assigned teams, metadata).
- Supported recurrence intervals: Daily, Weekly, Monthly, Yearly.
- When the recurrence window is due, the engine spawns a brand-new project instance from the blueprint, automatically pre-populating all tasks and assignments.
- Duplicate prevention: before spawning, the engine checks whether a project for the current recurrence window already exists. If yes, it skips spawning.
- Catch-up logic: if the FlowDesk server was offline during a scheduled spawn, the engine detects the missed window on next boot and spawns the missed instance.

TASK ECOSYSTEM:
Tasks are the granular units of work inside a project.
Task lifecycle states (in order): Todo -> In Progress -> Review -> Completed
Task features:
- Subtask checklists: each task supports multi-step sub-items.
- Team ownership: tasks can be assigned to an individual or an entire team.
- No-due-date handling: special logic prevents the Unix Epoch (Jan 1 1970) bug.

AI BUDDY:
- Embedded AI assistant powered by a local Ollama LLM.
- Assists with: project analysis, deadline forecasting, task description generation, technical architecture questions, FlowDesk navigation help.

COLLABORATIVE CANVAS:
A digital whiteboard and note-taking space:
- Post-it style sticky notes for brainstorming.
- Two modes: Personal mode (private drafting) and Collaborative mode (shared team session).

COMMUNICATION & NOTIFICATIONS:
- Real-time project chat rooms: every project gets a dedicated Socket.io chat room.
- Activity logs: a comprehensive audit trail of every change to a project or task.
- Dynamic notifications: in-app alerts for new assignments, @mentions, and approaching deadlines.
- Online/offline presence: a green dot system showing which colleagues are active.

ROLE-BASED ACCESS CONTROL (RBAC):
Three roles exist:
- Admin: Full system control, access to financial reports, user management, global system settings
- Manager: Oversees specific teams, creates and manages assignments, approves completed work
- Member: Task execution and status updates, collaboration within assigned projects

ONLINE/OFFLINE PRESENCE SYSTEM:
HOW PRESENCE IS DETECTED:
1. When a user opens FlowDesk or focuses their browser tab, the frontend emits a Socket.io event to the server.
2. When a user closes the tab or goes idle, the frontend emits offline status.
3. The backend receives the event, updates the user's status in memory/DB, and broadcasts it to ALL connected clients.

THE SELF-BROADCAST PROBLEM:
Every client receives every status broadcast including broadcasts about themselves. The fix uses currentUserId exclusion filter so only status changes for OTHER participants update the green dot, not your own.
`;

  const PROJECT_OVERVIEW = `
FlowDesk Project Overview:
FlowDesk is a sophisticated, full-stack internal management ecosystem built on a MERN-like stack.
Frontend: React + TypeScript with custom CSS design system.
Backend: Node.js + Express + Mongoose.
Real-time: Socket.io for chats and notifications.
Storage: MongoDB with GridFS for secure document attachments.

Core Features:
1. Project Management (Assignments) - Ongoing, Completed, Recurring Blueprints
2. Task Ecosystem - State Management, Checkpointing, Team Ownership
3. AI Buddy Integration - Project analysis, deadline forecasting, task description generation
4. Collaborative Canvas - Digital whiteboard with Personal and Collaborative modes
5. Communication & Notification - Real-time Chat, Activity Logs, Dynamic Notifications

Security & Permissions:
- Admin: Full system control, financial reports, user management
- Manager: Oversees teams, creates assignments, approves work
- Member: Task execution, status updates, collaboration

Advanced Features:
- Intelligent Spawning: recurring engine ensures no duplicates, catches up if system was offline
- No Due Date Handling: specialized logic preventing Unix Epoch bug
- Glassmorphism UI: premium semi-transparent design language
`;

  const USER_GUIDE = `
FlowDesk User Guide:

What is FlowDesk?
Think of FlowDesk as your "Digital Office." Instead of using dozens of spreadsheets, sticky notes, and separate chat apps, FlowDesk brings everything together.

Getting Started:
When you first log in, you'll see the Dashboard - your command center showing Active Projects, My Tasks, and Recent Activity.

Working with Projects:
Projects page has three tabs: Ongoing, Completed, and Recurring Blueprints.
How to Create a New Project:
1. Click the "New Project" button
2. Enter the Title and select the Client/Company
3. Choose the Priority (Low, Medium, High, or Urgent)
4. Set a Start Date and a Due Date
5. Add the Team Members
6. Click "Create Project"

Recurring Projects (Blueprint System):
Use Blueprints for projects that repeat. Go to Recurring Blueprints tab, create a project set to "Recurring", choose frequency. FlowDesk automatically creates copies on schedule.

Handling Tasks:
Tasks inside every project support Checklists, Status Stages (Todo to In Progress to Review), and Review before completion.

Collaboration Tools:
- Chat: Every project has its own chat
- Canvas: Digital whiteboard for brainstorming with notes
- AI Buddy: Ask the assistant for help

Pro-Tips:
- Use "No due date" checkbox for projects without deadlines
- Blueprint task updates apply to next spawned instance
- Keep task status current for visibility
`;

  return [
    {
      name: "buddy_knowledge",
      content: FLOWDESK_KNOWLEDGE,
      page: "/",
      tags: ["overview", "navigation", "features", "pages"],
    },
    {
      name: "buddy_detailed",
      content: BUDDY_DETAILED_PROMPT,
      page: "/",
      tags: ["modules", "assignments", "tasks", "canvas", "rbac", "presence"],
    },
    {
      name: "project_overview",
      content: PROJECT_OVERVIEW,
      page: "/dashboard",
      tags: ["architecture", "tech-stack", "features", "security"],
    },
    {
      name: "user_guide",
      content: USER_GUIDE,
      page: "/",
      tags: ["getting-started", "tutorial", "how-to", "projects", "tasks"],
    },
  ];
}

// ─── Seed Knowledge Base ────────────────────────────────────────────────────

export async function seedKnowledgeBase(): Promise<{ chunks: number; sources: number }> {
  const existingCount = await KnowledgeChunk.countDocuments();
  if (existingCount > 0) {
    return { chunks: existingCount, sources: 0 };
  }

  console.log("🧠 Seeding RAG knowledge base...");
  const sources = getKnowledgeSources();
  let totalChunks = 0;

  for (const source of sources) {
    const chunks = chunkText(source.content);
    for (const chunk of chunks) {
      if (chunk.trim().length < 20) continue;

      const embedding = await generateEmbedding(chunk);
      await KnowledgeChunk.create({
        source: source.name,
        sectionTitle: chunk.slice(0, 80).replace(/[#\n]/g, " ").trim(),
        content: chunk,
        embedding,
        metadata: {
          page: source.page,
          tags: source.tags,
        },
      });
      totalChunks++;
    }
    console.log(`  ✅ ${source.name}: ${chunks.length} chunks`);
  }

  console.log(`🧠 Knowledge base seeded: ${totalChunks} chunks from ${sources.length} sources`);

  // Load cache immediately after seeding
  cacheLoaded = false;
  await loadCache();

  return { chunks: totalChunks, sources: sources.length };
}

// ─── In-Memory Cache ────────────────────────────────────────────────────────

interface CachedChunk {
  content: string;
  source: string;
  embedding: number[];
}

let cachedChunks: CachedChunk[] = [];
let cacheLoaded = false;

async function loadCache(): Promise<void> {
  if (cacheLoaded && cachedChunks.length > 0) return;
  const allChunks = await KnowledgeChunk.find({}, { content: 1, source: 1, embedding: 1 }).lean();
  cachedChunks = allChunks.map((c) => ({
    content: c.content,
    source: c.source,
    embedding: c.embedding,
  }));
  cacheLoaded = true;
  console.log(`🧠 RAG cache loaded: ${cachedChunks.length} chunks`);
}

export function invalidateCache(): void {
  cachedChunks = [];
  cacheLoaded = false;
}

// ─── Retrieve Relevant Chunks ───────────────────────────────────────────────

export async function retrieveRelevantChunks(
  query: string,
  topK: number = 5
): Promise<{ content: string; score: number; source: string }[]> {
  await loadCache();

  const queryEmbedding = await generateEmbedding(query);

  const scored = cachedChunks.map((chunk) => ({
    content: chunk.content,
    source: chunk.source,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
