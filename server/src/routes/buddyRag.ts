import express from "express";
import fetch from "node-fetch";
import { retrieveRelevantChunks } from "../services/ragService";

const router = express.Router();

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const GENERATION_MODEL = "qwen2.5:1.5b";

// Keep both models loaded in memory — avoids cold-start reload per request
async function warmModels(): Promise<void> {
  try {
    // Warm generation model
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: GENERATION_MODEL, prompt: "hi", stream: false, keep_alive: -1 }),
    });
    // Warm embedding model
    await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "all-minilm", prompt: "hi", keep_alive: -1 }),
    });
    console.log("🧠 Ollama models warmed and kept alive");
  } catch {
    // Ollama might not be running yet — that's fine
  }
}

// Warm on module load
warmModels();

function buildSystemPrompt(
  retrievedContext: string,
  path: string,
  context?: { title?: string; header?: string }
): string {
  return `You are FlowDesk Buddy, a built-in assistant ONLY for FlowDesk (project management platform).

STRICT RULES:
- ONLY answer questions related to FlowDesk (projects, tasks, clients, teams, calendar, reports, settings, navigation, account).
- If the user asks anything unrelated to FlowDesk (math, general knowledge, coding, politics, etc.), respond with: "I'm FlowDesk Buddy — I can only help with FlowDesk. Ask me about projects, tasks, clients, teams, or anything else in the app!"
- Be concise (under 150 words). Never say "I don't know". Never mention being AI. Use markdown. Give step-by-step instructions with exact button names.

RELEVANT KNOWLEDGE:
${retrievedContext}

USER IS ON: ${path} — ${context?.title || "Unknown page"}`;
}

// ─── Intent Detection ────────────────────────────────────────────────────────

function isGreeting(msg: string): boolean {
  const clean = msg.replace(/[^a-zA-Z]/g, "").toLowerCase();
  if (clean.length > 15) return false;
  return /^(hi+|hlo|hlw|hey+|hello+|yo+|sup|greetings|howdy|namaste|gm|gn|afternoon|evening|morning)$/.test(clean);
}

function isThanks(msg: string): boolean {
  const clean = msg.replace(/[^a-zA-Z]/g, "").toLowerCase();
  if (clean.length > 20) return false;
  return /^(thanks*|thankyou|thanku|thx|ty|thanx|thnq|welcm|welcome|np|noproblem|noprob|appreciate|cheers|kudos|awesome|great|perfect|excellent|good|nice)$/.test(clean);
}

function isHelpRequest(msg: string): boolean {
  const clean = msg.replace(/[^a-zA-Z]/g, "").toLowerCase();
  return /^(help|helpme|whatcanyoudo|whatcanido|whatareyou|features|commands|options|menu|capabilities)$/.test(clean);
}

function hasAny(msg: string, words: string[]): boolean {
  return words.some(w => msg.includes(w));
}

// ─── Fallback Responses ──────────────────────────────────────────────────────

const R = {
  GREETING: "Hey! 👋 I'm FlowDesk Buddy.\n\nI can help you with anything in FlowDesk — projects, tasks, clients, teams, you name it.\n\nWhat do you need?",

  THANKS: "You're welcome! 😊 Let me know if you need anything else.",

  HELP: `**Here's what I can help with:**\n\n- **Projects** — create, view, edit, delete, filter, status\n- **Tasks** — create, assign, change status, priorities, subtasks\n- **Clients** — add companies, import/export CSV, manage contacts\n- **Teams** — invite members, roles, remove users\n- **Calendar** — view events, deadlines, today's schedule\n- **Reports** — generate, export, view analytics\n- **Settings** — profile, password, notifications, theme\n- **Navigation** — find any page or feature\n\nJust ask naturally!`,

  ABOUT: "I'm **FlowDesk Buddy** — your built-in assistant for FlowDesk. I know everything about projects, tasks, clients, teams, and more. Ask me anything!",

  // ── Projects ───────────────────────────────────────────────────────────────

  PROJECT_CREATE: `**Creating a Project:**\n1. Go to **Projects** (sidebar)\n2. Click **Create Assignment** (top right)\n3. Fill in: Name, Description, Team, Deadline\n4. Click **Create**\n\nTip: Assign a team first so members can see it immediately.`,

  PROJECT_VIEW: `**Viewing Projects:**\n1. Go to **Projects** (sidebar)\n2. See all projects in **list** or **board** view\n3. Use **filters** to narrow by status, team, or date\n4. Click any project to open details`,

  PROJECT_EDIT: `**Editing a Project:**\n1. Open the project from **Projects**\n2. Click the **pencil icon** (edit)\n3. Update Name, Description, Team, or Deadline\n4. Click **Save**`,

  PROJECT_DELETE: `**Deleting a Project:**\n1. Open the project from **Projects**\n2. Click **⋮** (more options)\n3. Select **Delete Project**\n4. Confirm deletion\n\n⚠️ This cannot be undone.`,

  PROJECT_STATUS: `**Project Status Overview:**\n- **Planning** — not started yet\n- **In Progress** — actively being worked on\n- **On Hold** — paused temporarily\n- **Completed** — done and delivered\n\nCheck the project's detail page for status updates.`,

  PROJECT_FILTER: `**Filtering Projects:**\n1. Go to **Projects**\n2. Use the **filter bar** at the top\n3. Filter by: Status, Team, Date Range, Assigned To\n4. Combine filters for precise results\n\nTip: Use **Search** to find projects by name.`,

  // ── Tasks ──────────────────────────────────────────────────────────────────

  TASK_CREATE: `**Creating a Task:**\n1. Go to **Tasks** (sidebar)\n2. Click **Create Task** (top right)\n3. Fill in: Title, Description, Assignee, Due Date, Priority\n4. Optionally add **Subtasks** (checklist items)\n5. Click **Save**\n\nTip: You can also create tasks directly from a Project's task board.`,

  TASK_VIEW: `**Viewing Tasks:**\n1. Go to **Tasks** (sidebar)\n2. See all tasks in **list** or **board** view\n3. Use **filters** to narrow by status, assignee, priority\n4. Click any task to see full details + comments`,

  TASK_STATUS: `**Changing Task Status:**\nOpen the task and use the **Status** dropdown:\n- **To Do** → not started\n- **In Progress** → actively working\n- **Review** → needs approval\n- **Done** → completed\n\nOr drag the task card between columns on the board view.`,

  TASK_ASSIGN: `**Assigning a Task:**\n1. Open the task\n2. Click **Assignee** field\n3. Select a team member from the dropdown\n4. The task appears in their task list\n\nTip: Only team members can be assigned.`,

  TASK_PRIORITY: `**Task Priorities:**\n- **Low** — nice to have, no rush\n- **Medium** — standard importance\n- **High** — important, do soon\n- **Urgent** — critical, do now\n\nSet priority when creating or editing a task.`,

  TASK_SUBTASK: `**Adding Subtasks:**\n1. Open a task\n2. Scroll to **Subtasks** section\n3. Click **+ Add Subtask**\n4. Type the subtask name\n5. Press Enter to add more\n\nSubtasks help break big tasks into smaller steps.`,

  TASK_DELETE: `**Deleting a Task:**\n1. Open the task\n2. Click **⋮** (more options)\n3. Select **Delete Task**\n4. Confirm deletion\n\n⚠️ This cannot be undone. All subtasks are also deleted.`,

  // ── Clients ────────────────────────────────────────────────────────────────

  CLIENT_CREATE: `**Adding a Client:**\n1. Go to **Clients** (sidebar)\n2. Click **+** (top right)\n3. Fill in: Company Name, Industry, Email, Phone\n4. Click **Create Company**`,

  CLIENT_VIEW: `**Viewing Clients:**\n1. Go to **Clients** (sidebar)\n2. See all companies in a list\n3. Use **search** to find by name\n4. Click any client to see details + contacts`,

  CLIENT_EDIT: `**Editing a Client:**\n1. Open the client from **Clients**\n2. Click **Edit** or the pencil icon\n3. Update details\n4. Click **Save**`,

  CLIENT_DELETE: `**Deleting a Client:**\n1. Open the client\n2. Click **⋮** (more options)\n3. Select **Delete**\n4. Confirm\n\n⚠️ Associated contacts and projects remain but are unlinked.`,

  CLIENT_IMPORT: `**Importing Clients (CSV):**\n1. Go to **Clients** → click **Import** (top right)\n2. Upload a **.csv** file with columns: Name, Email, Company, Industry\n3. Map columns in the preview\n4. Click **Import**\n\nDownload a **template CSV** from the import dialog to get started.`,

  CLIENT_EXPORT: `**Exporting Clients:**\n1. Go to **Clients**\n2. Click **Export** (top right)\n3. Choose format: **CSV** or **Excel**\n4. File downloads instantly\n\nTip: Apply filters first to export a specific subset.`,

  // ── Teams ──────────────────────────────────────────────────────────────────

  TEAM_CREATE: `**Creating a Team:**\n1. Go to **Teams** (sidebar)\n2. Click **Create Team**\n3. Enter Team Name and Description\n4. Click **Create**\n\nThen invite members to join.`,

  TEAM_INVITE: `**Inviting Members:**\n1. Open the team from **Teams**\n2. Click **Invite Member**\n3. Enter their **email address**\n4. Select a **role** (Admin, Member, Viewer)\n5. Click **Send Invite**\n\nThey'll receive an email invitation.`,

  TEAM_ROLES: `**Team Roles:**\n- **Admin** — full control: manage members, settings, projects\n- **Member** — can create/edit projects and tasks\n- **Viewer** — read-only access to team content\n\nSet roles when inviting or from team settings.`,

  TEAM_REMOVE: `**Removing a Member:**\n1. Open the team from **Teams**\n2. Go to **Members** tab\n3. Find the member\n4. Click **⋮** → **Remove from Team**\n\nThey lose access to team projects and tasks.`,

  TEAM_VIEW: `**Viewing Teams:**\n1. Go to **Teams** (sidebar)\n2. See all teams you belong to\n3. Click a team to see members, projects, and settings\n4. Use **search** to find specific teams`,

  // ── Calendar ───────────────────────────────────────────────────────────────

  CALENDAR_VIEW: `**Using the Calendar:**\n1. Go to **Calendar** (sidebar)\n2. View tasks and deadlines by **Day**, **Week**, or **Month**\n3. Click any event to see task details\n4. Use arrows to navigate between periods`,

  CALENDAR_TODAY: `**Today's Events:**\n1. Go to **Calendar**\n2. Click **Today** button to jump to current date\n3. See all tasks and deadlines due today\n4. Click any event to open the task`,

  CALENDAR_UPCOMING: `**Upcoming Deadlines:**\n1. Go to **Calendar**\n2. Switch to **Week** or **Month** view\n3. Look for tasks with due dates\n4. Upcoming items are highlighted by priority`,

  CALENDAR_CREATE: `**Creating a Calendar Event:**\n1. Go to **Calendar**\n2. Click on a date or **+ Add Event**\n3. Enter event name, time, and link to a task\n4. Click **Save**\n\nEvents sync with task due dates automatically.`,

  // ── Reports ────────────────────────────────────────────────────────────────

  REPORT_CREATE: `**Generating a Report:**\n1. Go to **Reports** (sidebar)\n2. Click **Create Report**\n3. Select report type (Project, Task, Team, Time)\n4. Set filters (date range, team, project)\n5. Click **Generate**`,

  REPORT_VIEW: `**Viewing Reports:**\n1. Go to **Reports** (sidebar)\n2. See saved reports in the list\n3. Click any report to view charts and data\n4. Use **filters** to drill down`,

  REPORT_EXPORT: `**Exporting Reports:**\n1. Open a report\n2. Click **Export** (top right)\n3. Choose format: **PDF**, **CSV**, or **Excel**\n4. File downloads instantly`,

  // ── Settings ───────────────────────────────────────────────────────────────

  SETTINGS_PROFILE: `**Editing Your Profile:**\n1. Go to **Settings** (sidebar)\n2. Click **Profile** tab\n3. Update: Name, Email, Avatar, Bio\n4. Click **Save Changes**`,

  SETTINGS_PASSWORD: `**Changing Your Password:**\n1. Go to **Settings** → **Security**\n2. Enter your **current password**\n3. Enter **new password** twice\n4. Click **Update Password**\n\nTip: Use a strong password with 8+ characters.`,

  SETTINGS_NOTIFICATIONS: `**Managing Notifications:**\n1. Go to **Settings** → **Notifications**\n2. Toggle email notifications on/off\n3. Choose what to be notified about:\n   - Task assignments\n   - Due date reminders\n   - Team updates\n4. Click **Save**`,

  SETTINGS_THEME: `**Changing Theme:**\n1. Go to **Settings** → **Appearance**\n2. Choose: **Light**, **Dark**, or **System**\n3. Changes apply instantly`,

  // ── Dashboard ──────────────────────────────────────────────────────────────

  DASHBOARD: `**Dashboard Overview:**\nYour dashboard shows:\n- **My Tasks** — tasks assigned to you\n- **Upcoming Deadlines** — tasks due soon\n- **Recent Projects** — projects you're working on\n- **Team Activity** — latest updates from your team\n\nClick any card to jump to the full view.`,

  // ── Navigation ─────────────────────────────────────────────────────────────

  NAVIGATION: `**Quick Navigation:**\n- **Dashboard** → /dashboard\n- **Projects** → /assignments\n- **Tasks** → /tasks\n- **Clients** → /clients\n- **Teams** → /teams\n- **Calendar** → /calendar\n- **Reports** → /reports\n- **Settings** → /settings\n\nUse the **sidebar** on the left to switch between sections.`,

  // ── Auth ───────────────────────────────────────────────────────────────────

  AUTH_LOGIN: `**Logging In:**\n1. Go to the login page\n2. Enter your **email** and **password**\n3. Click **Login**\n\nForgot password? Click **"Forgot Password?"** to reset it.`,

  AUTH_REGISTER: `**Creating an Account:**\n1. Go to the register page\n2. Fill in: Name, Email, Password, Confirm Password\n3. Click **Sign Up**\n4. Check your email for a verification link`,

  AUTH_RESET: `**Resetting Your Password:**\n1. On the login page, click **"Forgot Password?"**\n2. Enter your **email address**\n3. Check your email for a reset link\n4. Click the link and set a new password\n5. Log in with your new password`,

  // ── Generic ────────────────────────────────────────────────────────────────

  GENERIC: `I'm not sure I understand that specific question, but I can help with:\n\n- **Projects** — create, manage, track\n- **Tasks** — status, assignments, subtasks\n- **Clients** — companies, contacts, import/export\n- **Teams** — members, roles, invites\n- **Calendar** — deadlines, events\n- **Reports** — analytics, exports\n- **Settings** — profile, notifications\n\nTry asking something like *"How do I create a task?"*`,
};

// ─── Domain Check ────────────────────────────────────────────────────────────

const FLOWDESK_KEYWORDS = [
  "project", "assignment", "task", "subtask", "client", "company", "contact",
  "team", "member", "invite", "role", "calendar", "event", "deadline",
  "report", "analytics", "setting", "profile", "password", "notification",
  "dashboard", "sidebar", "login", "register", "signup", "flowdesk", "buddy",
  "csv", "pdf", "export", "import", "assignee", "priority", "subtask",
];

function isFlowDeskRelated(msg: string): boolean {
  const lower = msg.toLowerCase();
  return FLOWDESK_KEYWORDS.some(k => lower.includes(k));
}

const DOMAIN_RESTRICT = "I'm FlowDesk Buddy — I can only help with FlowDesk. Ask me about projects, tasks, clients, teams, or anything else in the app!";

function getFallbackResponse(message: string, path: string = "/"): string {
  const msg = message.toLowerCase().trim();

  // ── Intent Detection ───────────────────────────────────────────────────────

  if (isGreeting(msg)) return R.GREETING;
  if (isThanks(msg)) return R.THANKS;
  if (isHelpRequest(msg)) return R.HELP;
  if (hasAny(msg, ["who are you", "what are you", "what is flowdesk", "about you", "about buddy"])) return R.ABOUT;

  // ── Projects ───────────────────────────────────────────────────────────────

  if (hasAny(msg, ["create", "add", "new"]) && hasAny(msg, ["project", "assignment"])) return R.PROJECT_CREATE;
  if (hasAny(msg, ["view", "see", "show", "list", "open", "all"]) && hasAny(msg, ["project", "assignment"])) return R.PROJECT_VIEW;
  if (hasAny(msg, ["edit", "update", "change", "modify"]) && hasAny(msg, ["project", "assignment"])) return R.PROJECT_EDIT;
  if (hasAny(msg, ["delete", "remove", "destroy"]) && hasAny(msg, ["project", "assignment"])) return R.PROJECT_DELETE;
  if (hasAny(msg, ["status", "progress", "stage"]) && hasAny(msg, ["project", "assignment"])) return R.PROJECT_STATUS;
  if (hasAny(msg, ["filter", "search", "find", "sort"]) && hasAny(msg, ["project", "assignment"])) return R.PROJECT_FILTER;

  // ── Tasks ──────────────────────────────────────────────────────────────────

  if (hasAny(msg, ["create", "add", "new"]) && hasAny(msg, ["task"])) return R.TASK_CREATE;
  if (hasAny(msg, ["view", "see", "show", "list", "all"]) && hasAny(msg, ["task"])) return R.TASK_VIEW;
  if (hasAny(msg, ["status", "change", "move", "update", "set"]) && hasAny(msg, ["task", "todo", "in progress", "review", "done"])) return R.TASK_STATUS;
  if (hasAny(msg, ["assign", "assignee", "who", "give"]) && hasAny(msg, ["task"])) return R.TASK_ASSIGN;
  if (hasAny(msg, ["priority", "urgent", "important", "high", "low"]) && hasAny(msg, ["task"])) return R.TASK_PRIORITY;
  if (hasAny(msg, ["subtask", "sub-task", "breakdown", "checklist", "step"]) && hasAny(msg, ["task"])) return R.TASK_SUBTASK;
  if (hasAny(msg, ["delete", "remove", "destroy"]) && hasAny(msg, ["task"])) return R.TASK_DELETE;

  // ── Clients ────────────────────────────────────────────────────────────────

  if (hasAny(msg, ["create", "add", "new"]) && hasAny(msg, ["client", "company"])) return R.CLIENT_CREATE;
  if (hasAny(msg, ["view", "see", "show", "list", "all"]) && hasAny(msg, ["client", "company"])) return R.CLIENT_VIEW;
  if (hasAny(msg, ["edit", "update", "change"]) && hasAny(msg, ["client", "company"])) return R.CLIENT_EDIT;
  if (hasAny(msg, ["delete", "remove"]) && hasAny(msg, ["client", "company"])) return R.CLIENT_DELETE;
  if (hasAny(msg, ["import", "upload", "csv"]) && hasAny(msg, ["client", "company"])) return R.CLIENT_IMPORT;
  if (hasAny(msg, ["export", "download", "csv"]) && hasAny(msg, ["client", "company"])) return R.CLIENT_EXPORT;

  // ── Teams ──────────────────────────────────────────────────────────────────

  if (hasAny(msg, ["create", "add", "new"]) && hasAny(msg, ["team"])) return R.TEAM_CREATE;
  if (hasAny(msg, ["invite", "add", "join"]) && hasAny(msg, ["member", "people", "user"])) return R.TEAM_INVITE;
  if (hasAny(msg, ["role", "admin", "member", "viewer", "permission"]) && hasAny(msg, ["team"])) return R.TEAM_ROLES;
  if (hasAny(msg, ["remove", "kick", "delete"]) && hasAny(msg, ["member", "user", "people"])) return R.TEAM_REMOVE;
  if (hasAny(msg, ["view", "see", "list", "show"]) && hasAny(msg, ["team", "member"])) return R.TEAM_VIEW;

  // ── Calendar ───────────────────────────────────────────────────────────────

  if (hasAny(msg, ["today", "now"]) && hasAny(msg, ["event", "task", "deadline", "schedule"])) return R.CALENDAR_TODAY;
  if (hasAny(msg, ["upcoming", "next", "soon", "coming"]) && hasAny(msg, ["event", "task", "deadline"])) return R.CALENDAR_UPCOMING;
  if (hasAny(msg, ["create", "add", "new"]) && hasAny(msg, ["event"])) return R.CALENDAR_CREATE;
  if (hasAny(msg, ["calendar", "schedule", "date"])) return R.CALENDAR_VIEW;

  // ── Reports ────────────────────────────────────────────────────────────────

  if (hasAny(msg, ["generate", "create", "new"]) && hasAny(msg, ["report"])) return R.REPORT_CREATE;
  if (hasAny(msg, ["export", "download", "pdf"]) && hasAny(msg, ["report"])) return R.REPORT_EXPORT;
  if (hasAny(msg, ["view", "see", "show", "open"]) && hasAny(msg, ["report", "analytics"])) return R.REPORT_VIEW;

  // ── Settings ───────────────────────────────────────────────────────────────

  if (hasAny(msg, ["profile", "avatar", "name", "bio", "account"])) return R.SETTINGS_PROFILE;
  if (hasAny(msg, ["password", "change password", "reset password", "security"])) return R.SETTINGS_PASSWORD;
  if (hasAny(msg, ["notification", "alert", "email"])) return R.SETTINGS_NOTIFICATIONS;
  if (hasAny(msg, ["theme", "dark", "light", "mode", "appearance"])) return R.SETTINGS_THEME;

  // ── Dashboard ──────────────────────────────────────────────────────────────

  if (hasAny(msg, ["dashboard", "overview", "home", "main"])) return R.DASHBOARD;

  // ── Navigation ─────────────────────────────────────────────────────────────

  if (hasAny(msg, ["where", "how", "go", "navigate", "page", "find"])) return R.NAVIGATION;

  // ── Auth ───────────────────────────────────────────────────────────────────

  if (hasAny(msg, ["login", "sign in", "log in", "signin"])) return R.AUTH_LOGIN;
  if (hasAny(msg, ["register", "sign up", "signup", "create account"])) return R.AUTH_REGISTER;
  if (hasAny(msg, ["forgot", "reset"]) && hasAny(msg, ["password"])) return R.AUTH_RESET;

  // ── Fallback ───────────────────────────────────────────────────────────────

  // If nothing matched but it looks FlowDesk-related, show help
  if (isFlowDeskRelated(msg)) return R.GENERIC;

  // If nothing matched and it's NOT FlowDesk-related, restrict
  return DOMAIN_RESTRICT;
}

// ─── POST / — Non-streaming RAG endpoint ────────────────────────────────────

router.post("/", async (req, res) => {
  try {
    const { message, path = "/", context, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Fast path: greetings, thanks, help skip RAG entirely
    if (isGreeting(message) || isThanks(message) || isHelpRequest(message)) {
      return res.json({ reply: getFallbackResponse(message, path) });
    }

    // Domain check: block non-FlowDesk questions BEFORE calling LLM
    if (!isFlowDeskRelated(message)) {
      return res.json({ reply: DOMAIN_RESTRICT });
    }

    // Step 1: Retrieve relevant chunks (top 3 only)
    const retrieved = await retrieveRelevantChunks(message, 3);
    const contextBlock = retrieved.map((r) => r.content).join("\n\n");

    // Step 2: Build compact system prompt
    const systemPrompt = buildSystemPrompt(contextBlock, path, context);

    // Step 3: Call Ollama with constrained context
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GENERATION_MODEL,
        stream: false,
        keep_alive: -1,
        options: {
          num_ctx: 2048,
          num_predict: 256,
          temperature: 0.3,
          top_k: 10,
          top_p: 0.9,
          repeat_penalty: 1.1,
          num_thread: 4,
        },
        messages: [
          { role: "system", content: systemPrompt },
          ...history.slice(-3),
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`Ollama returned ${response.status}`);
      return res.json({ reply: getFallbackResponse(message, path) });
    }

    const data = (await response.json()) as any;
    const aiResponse = data.message?.content || "";
    const finalReply =
      aiResponse && aiResponse.length > 10
        ? aiResponse
        : getFallbackResponse(message, path);

    res.json({ reply: finalReply });
  } catch (err) {
    console.error("Buddy RAG Error:", err);
    res.json({ reply: getFallbackResponse(req.body?.message || "", req.body?.path || "/") });
  }
});

// ─── POST /stream — Streaming RAG endpoint ──────────────────────────────────

router.post("/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const { message, path = "/", context, history = [] } = req.body;

    if (!message) {
      res.write(`data: ${JSON.stringify({ content: "Message is required" })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      return res.end();
    }

    // Fast path: greetings, thanks, help skip RAG entirely
    if (isGreeting(message) || isThanks(message) || isHelpRequest(message)) {
      res.write(`data: ${JSON.stringify({ content: getFallbackResponse(message, path) })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      return res.end();
    }

    // Domain check: block non-FlowDesk questions BEFORE calling LLM
    if (!isFlowDeskRelated(message)) {
      res.write(`data: ${JSON.stringify({ content: DOMAIN_RESTRICT })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      return res.end();
    }

    // Step 1: Retrieve relevant chunks (top 3 only)
    const retrieved = await retrieveRelevantChunks(message, 3);
    const contextBlock = retrieved.map((r) => r.content).join("\n\n");

    // Step 2: Build compact system prompt
    const systemPrompt = buildSystemPrompt(contextBlock, path, context);

    // Step 3: Call Ollama with streaming + constrained options
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GENERATION_MODEL,
        stream: true,
        keep_alive: -1,
        options: {
          num_ctx: 2048,
          num_predict: 256,
          temperature: 0.3,
          top_k: 10,
          top_p: 0.9,
          repeat_penalty: 1.1,
          num_thread: 4,
        },
        messages: [
          { role: "system", content: systemPrompt },
          ...history.slice(-3),
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok || !response.body) {
      const fallback = getFallbackResponse(message, path);
      res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      return res.end();
    }

    let buffer = "";

    response.body.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.message?.content) {
            res.write(`data: ${JSON.stringify({ content: parsed.message.content })}\n\n`);
          }
          if (parsed.done) {
            res.write(`data: [DONE]\n\n`);
          }
        } catch {
          // skip malformed chunks
        }
      }
    });

    response.body.on("end", () => {
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim());
          if (parsed.message?.content) {
            res.write(`data: ${JSON.stringify({ content: parsed.message.content })}\n\n`);
          }
        } catch {
          // skip
        }
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
    });

    response.body.on("error", () => {
      const fallback = getFallbackResponse(message, path);
      res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    });
  } catch (err) {
    console.error("Buddy RAG Stream Error:", err);
    const fallback = getFallbackResponse(req.body?.message || "", req.body?.path || "/");
    res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
  }
});

export default router;
