import express from "express";
import fetch from "node-fetch";

const router = express.Router();

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
  - **Project Whiteboard / Notes** (NEW):
    - **Collaborative** visual playground for brainstorming
    - **Shared Visibility**: Everyone assigned to the project can see and edit the notes
    - Sticky notes can be moved and edited by any team member
    - Tracks who created each note and who edited it (avatar history)
    - Full-screen mode for intensive brainstorming sessions
    - Auto-saves changes across the team
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
- **Company Management**: Full CRM-style client/company management
- Left sidebar shows company tree with parent-child hierarchy
- "+" button to create new companies
- Import/Export capabilities:
  - Import from Excel (.xlsx, .xls) with column mapping
  - Export to Excel spreadsheet
  - Export to PDF document
- **Creating a Company**:
  1. Click "+" button in top-left of company list
  2. Fill in: Company Name (required), Parent Company (optional), Industry, Phone, Website, Description
  3. Enter Address: Street, City, State, Postal Code, Country
  4. Click "Create Company"
- **Company Hierarchy**:
  - Companies can have parent-child relationships
  - Selecting a parent company reveals its subsidiary companies in the sidebar with visual branching lines
  - Click any child company to view its details
  - The tree structure supports unlimited nesting levels
- **Company Details** (right panel):
  - Company name with status badge (active/inactive)
  - Industry classification
  - Description
  - Website link and phone number
  - Three tabs: Info, Contacts, Projects
  - Info tab: Description, subsidiary count, contact count statistics
  - Contacts tab: Full contact person management
  - Projects tab: Associated projects (coming soon)
- **Contact Management**:
  - Add contacts to any company
  - Contact fields: Name, Email, Phone, Position, Department, Notes
  - Mark contacts as "Primary" (highlighted with badge)
  - Edit and delete contacts
  - Contact cards show all details at a glance
- **Bulk Messaging** (/bulk-email): 
  - Dedicated page to send emails to multiple companies simultaneously
  - Select companies from a hierarchical tree list
  - Supports recursive selection of child companies
  - Compose rich text messages and send to all primary contacts
  - Independent scrolling for large datasets (supports 10,000+ companies)

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
  - /reports/employee — Tracking reports
  - /reports/workload — Workload distribution
  - /reports/activity — User Activity reports
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
  - Choose notification types (tasks, mentions, deadlines)
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
- Whiteboard / Notes (inside Project Details - **Collaborative**)
- Companies & Clients
- Bulk Messaging (NEW)
- Personal Canvas (Private Playground - **Limited to Self**)
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

const INTENT_INSTRUCTIONS = `
## INTENT CLASSIFICATION SYSTEM

Before responding, classify the user's intent into one of these categories:

1. **NAVIGATION** — "Where is X?", "How do I get to Y?", "Take me to Z"
   → Provide exact navigation path with sidebar location and URL

2. **HOW_TO** — "How do I create/edit/delete/export X?"
   → Provide numbered step-by-step instructions with exact button names

3. **FEATURE_INFO** — "What is X?", "What does Y do?", "Tell me about Z"
   → Explain the feature, its purpose, and key capabilities

4. **TROUBLESHOOTING** — "X is not working", "I can't Y", "Error with Z"
   → Provide multiple solutions in order of likelihood

5. **COMPARISON** — "What's the difference between X and Y?"
   → Compare features side by side

6. **GREETING** — "Hi", "Hello", "Thanks"
   → Respond warmly and offer help

7. **CURRENT_PAGE** — "What can I do here?", "What is this page?"
   → Use the CURRENT USER LOCATION to describe the page they're on

8. **DATA_MANAGEMENT** — "How to import/export?", "How to organize my data?"
   → Provide specific data management instructions

## RESPONSE FORMAT RULES

- Use **markdown formatting** for all responses
- Use **bold** for important terms, button names, and page names
- Use numbered lists (1. 2. 3.) for step-by-step instructions
- Use bullet points (- ) for feature lists
- Use headers (### ) to organize long responses
- Keep responses concise but complete — aim for 100-250 words
- End responses with a brief follow-up suggestion or question when appropriate
- Use 1-2 relevant emojis maximum per response (not excessive)
- When mentioning navigation, include the URL path in parentheses like (/dashboard)
`;

router.post("/", async (req, res) => {
  try {
    const { message, path, context, history = [] } = req.body;

    const systemPrompt = `
You are **FlowDesk Buddy** — the intelligent, friendly assistant built into FlowDesk.
You have complete knowledge of every feature, page, and workflow in the application.

${FLOWDESK_KNOWLEDGE}

${INTENT_INSTRUCTIONS}

## CRITICAL BEHAVIOR RULES

1. **NEVER** say "I don't know" or "I'm not sure" — you have complete knowledge of FlowDesk
2. **NEVER** mention being an AI, LLM, or chatbot — you are FlowDesk Buddy, a built-in assistant
3. **ALWAYS** provide actionable, specific guidance with exact button names and locations
4. If a question seems unrelated to FlowDesk, politely redirect: "That's outside my area, but I can help you with anything in FlowDesk!"
5. Be conversational, warm, and concise — like a knowledgeable teammate
6. For ambiguous questions, ask a clarifying question
7. Reference the user's current page location when relevant

CURRENT USER LOCATION:
- Path: ${path}
- Page Title: ${context?.title || 'Unknown'}
- Main Header: ${context?.header || 'None'}

Use this to provide contextually relevant help. If they ask about "this page", "here", or specific items they can see, use the Main Header and Path to identify exactly what they are looking at.
`.trim();

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.7,
        max_tokens: 800,
        messages: [
          { role: "system", content: systemPrompt },
          ...history.slice(-10),
          { role: "user", content: message },
        ],
      }),
    });

    const data = (await response.json()) as any;
    if (!response.ok) {
      console.error("OpenAI API Error:", data);
      return res.json({ reply: getFallbackResponse(message, path) });
    }

    const aiResponse = data.choices?.[0]?.message?.content || "";
    const finalReply =
      aiResponse && aiResponse.length > 10
        ? aiResponse
        : getFallbackResponse(message, path);

    res.json({ reply: finalReply });
  } catch (err) {
    console.error("Buddy API Error:", err);
    res.json({ reply: getFallbackResponse(req.body.message, req.body.path) });
  }
});

// Streaming endpoint for ChatGPT-like experience
router.post("/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const { message, path, context, history = [] } = req.body;

    const systemPrompt = `
You are **FlowDesk Buddy** — the intelligent, friendly assistant built into FlowDesk.
You have complete knowledge of every feature, page, and workflow in the application.

${FLOWDESK_KNOWLEDGE}

${INTENT_INSTRUCTIONS}

## CRITICAL BEHAVIOR RULES

1. **NEVER** say "I don't know" or "I'm not sure" — you have complete knowledge of FlowDesk
2. **NEVER** mention being an AI, LLM, or chatbot — you are FlowDesk Buddy, a built-in assistant
3. **ALWAYS** provide actionable, specific guidance with exact button names and locations
4. If a question seems unrelated to FlowDesk, politely redirect: "That's outside my area, but I can help you with anything in FlowDesk!"
5. Be conversational, warm, and concise — like a knowledgeable teammate
6. For ambiguous questions, ask a clarifying question
7. Reference the user's current page location when relevant

CURRENT USER LOCATION:
- Path: ${path}
- Page Title: ${context?.title || 'Unknown'}
- Main Header: ${context?.header || 'None'}

Use this to provide contextually relevant help. If they ask about "this page", "here", or specific items they can see, use the Main Header and Path to identify exactly what they are looking at.
`.trim();

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.7,
        max_tokens: 800,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...history.slice(-10),
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok || !response.body) {
      const fallback = getFallbackResponse(message, path);
      res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
      return;
    }

    let buffer = "";

    response.body.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");

      // Process complete SSE lines from buffer
      const lines = buffer.split("\n");
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          res.write(`data: [DONE]\n\n`);
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || "";
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch {
          // Skip unparseable chunks
        }
      }
    });

    response.body.on("end", () => {
      // Process any remaining buffer
      if (buffer.trim().startsWith("data: ")) {
        const data = buffer.trim().slice(6);
        if (data === "[DONE]") {
          res.write(`data: [DONE]\n\n`);
        }
      }
      res.end();
    });

    response.body.on("error", () => {
      const fallback = getFallbackResponse(message, path);
      res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    });
  } catch (err) {
    console.error("Buddy Stream Error:", err);
    const fallback = getFallbackResponse(req.body?.message || "", req.body?.path || "/");
    res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
  }
});

function getFallbackResponse(message: string, path: string = "/"): string {
  const lowerMsg = message.toLowerCase();

  // Page-specific fallbacks
  const pageMap: Record<string, string> = {
    "/dashboard": "You're on the **Dashboard** — your central hub!\n\nHere you can see:\n- 📊 Task status breakdown (pie chart)\n- 📈 Weekly activity trends\n- 🗂️ Recent assignments\n- 👥 Team overview\n- ⚡ Quick stats cards\n\nWhat would you like to do?",
    "/assignments": "You're on the **Projects** page!\n\nHere you can:\n1. Click **Create Assignment** (top right) to start a new project\n2. Filter and search existing projects\n3. Click any project to view details, tasks, and chat\n\nWhat do you need help with?",
    "/tasks": "You're on the **Tasks** page!\n\nHere you can:\n1. Click **Create Task** (top right) to add a new task\n2. Filter by status, priority, or assignee\n3. Drag-and-drop to change task status\n4. Click any task for full details\n\nWhat are you trying to do?",
    "/clients": "You're on **Companies & Clients**!\n\nHere you can:\n1. Click **+** to create a new company\n2. Click any company to view its details and contacts\n3. Use import/export buttons for bulk operations\n4. View parent-child company hierarchies\n\nNeed help with something specific?",
    "/teams": "You're on the **Teams** page!\n\nHere you can:\n1. Create new teams\n2. **Invite Members** via email\n3. Manage roles (Admin/Member/Viewer)\n4. View team activity\n\nWhat do you need?",
    "/calendar": "You're on the **Calendar** page!\n\nHere you can:\n- View task deadlines by month\n- See color-coded events (red=overdue, blue=upcoming, green=completed)\n- Click any date for details\n\nWhat are you looking for?",
    "/reports": "You're on the **Reports** page!\n\nAvailable report types:\n1. **Tracking** — Employee performance\n2. **Workload** — Team capacity\n3. **User Activity** — Engagement logs\n\nFilter by date, team, or project, then export as PDF or Excel.\n\nWhich report do you need?",
    "/settings": "You're on **Settings**!\n\nYou can configure:\n- 👤 Profile (name, email, avatar)\n- 🔒 Security (password, 2FA)\n- 🔔 Notifications (email, in-app)\n- 🎨 Appearance (Light/Dark mode)\n\nWhat would you like to change?",
    "/bulk-email": "You're on the **Bulk Messaging** page!\n\nHere you can:\n1. Select multiple companies or entire groups from the list\n2. Compose an email message in the editor\n3. Send the message to all primary contacts of the selected companies at once\n\nNeed help selecting companies?",
    "/canvas": "You're on your **Personal Canvas**!\n\nThis is a private playground where you can create sticky notes and organize your own ideas. Notes here are **limited to you** and not visible to others.\n\nFor team-wide brainstorming, visit an **Assignment Detail** page and click the **Whiteboard** tab.",
  };

  // Check if asking about current page
  if (lowerMsg.includes("this page") || lowerMsg.includes("current page") || lowerMsg.includes("here") || lowerMsg.includes("what can i do")) {
    return pageMap[path] || "You can navigate to any page using the **sidebar** on the left. Key sections include Dashboard, Projects, Tasks, Clients, Teams, Calendar, Reports, and Settings.\n\nWhat are you looking for?";
  }

  // Action-based fallbacks
  if (lowerMsg.includes("create") || lowerMsg.includes("add") || lowerMsg.includes("new")) {
    if (lowerMsg.includes("task")) return "### Creating a Task ✏️\n\n1. Go to **Tasks** page (/tasks)\n2. Click **Create Task** button (top right)\n3. Fill in: Title, Description, Assignee, Due date, Priority\n4. Click **Save**\n\nYou can also assign it to a specific project!";
    if (lowerMsg.includes("project") || lowerMsg.includes("assignment")) return "### Creating a Project 📁\n\n1. Go to **Projects** page (/assignments)\n2. Click **Create Assignment** (top right)\n3. Enter: Name, Description, Team members, Deadline\n4. Click **Create**\n\nYou can then add tasks and files to it!";
    if (lowerMsg.includes("company") || lowerMsg.includes("client")) return "### Creating a Company 🏢\n\n1. Go to **Companies & Clients** (/clients)\n2. Click the **+** button\n3. Fill in: Company Name, Industry, Parent Company (optional)\n4. Add address details\n5. Click **Create Company**\n\nYou can then add contacts to it!";
    if (lowerMsg.includes("team")) return "### Creating a Team 👥\n\n1. Go to **Teams** page (/teams)\n2. Click **Create Team**\n3. Enter team name and description\n4. Click **Create**\n5. Then invite members via email!\n\nEach member can be Admin, Member, or Viewer.";
    if (lowerMsg.includes("contact")) return "### Adding a Contact 📇\n\n1. Go to **Companies & Clients** (/clients)\n2. Select a company\n3. Click the **Contacts** tab\n4. Click **Add Contact**\n5. Fill in: Name, Email, Phone, Position, Department\n6. Toggle **Primary Contact** if applicable\n7. Click **Add**";
  }

  if (lowerMsg.includes("import") || lowerMsg.includes("export")) {
    return "### Import & Export 📊\n\n**Importing Companies:**\n1. Go to **Companies & Clients** (/clients)\n2. Click the **Upload** icon\n3. Select your Excel file (.xlsx/.xls)\n4. Map columns to fields\n5. Review and confirm\n\n**Exporting:**\n- Click the **Excel** icon to export as spreadsheet\n- Click the **PDF** icon to export as document\n\n**Reports Export:**\n- Go to **Reports** (/reports)\n- Generate a report and click **Export**";
  }

  if (lowerMsg.includes("report") || lowerMsg.includes("analytics")) {
    return "### Reports & Analytics 📈\n\n1. Go to **Reports** (/reports)\n2. Choose a report type:\n   - **Tracking**: Employee performance\n   - **Workload**: Team capacity\n   - **Activity**: User engagement\n3. Apply filters (date, team, project)\n4. Click **Generate**\n5. Export as PDF or Excel\n\nYou can also schedule automatic reports!";
  }

  if (lowerMsg.includes("whiteboard") || lowerMsg.includes("notes") || lowerMsg.includes("canvas")) {
    return "### Collaborative vs Personal Whiteboards 🎨\n\n**1. Project Whiteboard (Collaborative):**\n- Found inside any **Assignment** (/assignments) under the **Whiteboard** tab.\n- **Everyone** assigned to the project can see and edit these notes in real-time.\n\n**2. Personal Canvas (Private):**\n- Accessible from the **Personal Canvas** (/canvas) sidebar link.\n- These notes are **private and limited to you**. No one else can see your personal canvas.";
  }

  if (lowerMsg.includes("email") || lowerMsg.includes("message") || lowerMsg.includes("bulk")) {
    return "### Bulk Messaging 📧\n\n1. Go to **Bulk Messaging** (/bulk-email) from the sidebar\n2. Select companies from the scrollable list on the left\n3. To include child companies, simply select the parent\n4. Compose your message in the editor\n5. Click **Send Email** to reach all selected primary contacts";
  }

  // Default helpful response
  return "I'm here to help! 👋\n\nHere's a quick overview of what you can do in FlowDesk:\n\n- 📊 **Dashboard** — Overview and stats\n- 📁 **Projects** — Manage assignments\n- ✏️ **Tasks** — Track individual work items\n- 🏢 **Clients** — Company & contact management\n- 👥 **Teams** — Collaboration\n- 📅 **Calendar** — Deadlines and events\n- 📈 **Reports** — Analytics and exports\n- ⚙️ **Settings** — Configuration\n\nWhat would you like to know more about?";
}

export default router;
