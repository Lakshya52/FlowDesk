export interface Section {
  type: "h2" | "h3" | "p" | "list" | "ordered" | "code" | "callout" | "table" | "arch-cards" | "image"
  id?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any
  props?: Record<string, string>
}

export interface DocPage {
  title: string
  description: string
  breadcrumbs: { label: string; slug?: string }[]
  lastUpdated: string
  readingTime: string
  sections: Section[]
  prev?: { slug: string; title: string }
  next?: { slug: string; title: string }
}

export const linkSlugs: Record<string, string> = {
  "Welcome to FlowDesk": "introduction",
  "Getting Started": "quickstart",
  "Your Account": "account",
  "Creating Projects": "creating-projects",
  "Project Types": "project-types",
  "Working with Tasks": "working-with-tasks",
  "Deadlines & Notifications": "deadlines",
  "Your Team": "your-team",
  "Chat & Communication": "chat",
  "AI Buddy": "ai-buddy",
  "Collaborative Canvas": "canvas",
  "Understanding Roles": "roles",
  "What You Can Do": "role-permissions",
}

function h2(id: string, text: string): Section {
  return { type: "h2", id, content: text }
}

function h3(text: string): Section {
  return { type: "h3", content: text }
}

function p(text: string): Section {
  return { type: "p", content: text }
}

function list(items: [string, string][]): Section {
  return { type: "list", content: items }
}

function ordered(items: string[]): Section {
  return { type: "ordered", content: items }
}

function callout(text: string): Section {
  return { type: "callout", content: text }
}

function table(headers: string[], rows: string[][]): Section {
  return { type: "table", content: { headers, rows } }
}

function img(src: string, alt: string, caption?: string): Section {
  return { type: "image", content: { src, alt, caption: caption || "" } }
}

const pages: Record<string, DocPage> = {}

function define(
  slug: string,
  page: Omit<DocPage, "prev" | "next">,
  order?: { prev?: string; next?: string }
): void {
  pages[slug] = {
    ...page,
    prev: order?.prev ? { slug: order.prev, title: pageTitle(order.prev) } : undefined,
    next: order?.next ? { slug: order.next, title: pageTitle(order.next) } : undefined,
  }
}

function pageTitle(slug: string): string {
  const reverse = Object.fromEntries(Object.entries(linkSlugs).map(([k, v]) => [v, k]))
  return reverse[slug] || slug
}

// ── GETTING STARTED ──────────────────────────────────────────

define("introduction", {
  title: "Welcome to FlowDesk",
  description: "Your all-in-one workspace for managing projects, tasks, and team collaboration.",
  breadcrumbs: [
    { label: "Docs", slug: "introduction" },
    { label: "Getting Started" },
    { label: "Welcome" },
  ],
  lastUpdated: "June 15, 2026",
  readingTime: "5 min read",
  sections: [
    h2("what-is-flowdesk", "What is FlowDesk?"),
    p(
      "FlowDesk is your team's central hub for managing projects, tracking tasks, and collaborating in real time. It brings everything together — assignments, deadlines, team communication, and progress tracking — in one easy-to-use workspace."
    ),
    img("/docs/images/flowdesk-dashboard-overview.png", "FlowDesk dashboard overview showing projects, tasks, and activity feed", "Your FlowDesk dashboard — everything at a glance"),
    p(
      "Whether you're managing a small team or coordinating across departments, FlowDesk helps you stay organised and keep projects moving forward. No more jumping between spreadsheets, chat apps, and email threads. Everything you need is in one place."
    ),

    h2("key-features", "Key Features"),
    p("FlowDesk comes packed with everything your team needs to work efficiently:"),
    img("/docs/images/flowdesk-key-features.png", "Visual overview of FlowDesk key features including project management, task tracking, and collaboration", "Key features at a glance"),
    list([
      ["Project Management", "Create and track projects with full visibility into progress, deadlines, and team assignments. See everything at a glance on your dashboard."],
      ["Task Tracking", "Break work into tasks with clear states (Todo → In Progress → Review → Completed), checkpoints, and priorities. Know exactly what's in progress and what's done."],
      ["Team Collaboration", "Chat with your team, share files, use the collaborative canvas for brainstorming, and stay updated with automatic activity logs."],
      ["AI Assistant", "Get help from AI Buddy — it can generate task descriptions, analyse project velocity, suggest deadlines, and answer questions about your project history."],
      ["Role-Based Access", "Everyone sees exactly what they need. Admins have full control, Managers oversee teams and projects, and Members focus on task execution."],
      ["Real-time Updates", "See changes as they happen. When a teammate updates a task, sends a message, or marks something complete, you'll see it instantly."],
      ["Calendar Integration", "View all your tasks and deadlines on a calendar. Filter by project, team, or priority to focus on what matters most."],
      ["Desktop App", "FlowDesk is available as a desktop application for Windows, giving you quick access without opening a browser."],
    ]),

    h2("who-is-it-for", "Who is FlowDesk for?"),
    p(
      "FlowDesk is designed for teams of all sizes — from small startups to large enterprises. It's built for:"
    ),
    list([
      ["Project Managers", "Who need full visibility into project progress, team workload, and upcoming deadlines."],
      ["Team Leads", "Who need to assign work, approve completed tasks, and keep their team aligned."],
      ["Team Members", "Who need clear task ownership, easy collaboration, and a simple way to track their work."],
      ["Organisations", "That want everything in one place — no more juggling multiple tools for projects, tasks, and communication."],
    ]),

    h2("how-it-works", "How FlowDesk Works"),
    p(
      "FlowDesk is organised into a few core concepts:"
    ),
    img("/docs/images/flowdesk-core-concepts.png", "Diagram showing how Projects, Tasks, Teams, and Dashboard connect in FlowDesk", "How the core concepts work together"),
    ordered([
      "<strong>Projects</strong> are the top-level containers for work. Each project has a team, tasks, deadlines, and a chat.",
      "<strong>Tasks</strong> are the individual units of work within a project. Each task has an owner, a status, and optional checkpoints.",
      "<strong>Teams</strong> are groups of people who work together. Projects are assigned to teams, and tasks are assigned to individuals.",
      "<strong>The Dashboard</strong> gives you a bird's-eye view of everything — your projects, upcoming deadlines, recent activity, and more.",
    ]),

    h2("accessing-flowdesk", "Accessing FlowDesk"),
    p(
      "You can access FlowDesk in two ways:"
    ),
    list([
      ["Web Browser", "Open your organisation's FlowDesk URL (e.g., flowdesk.raksco.in) in Chrome, Firefox, Edge, or Safari. Log in with your work email and password."],
      ["Desktop App", "Download the FlowDesk desktop app for Windows from the download page. It provides quick access from your taskbar and supports native notifications."],
    ]),
    callout(
      "Your login credentials are the same for both the web and desktop app. Your session is saved, so you don't need to log in every time you open the app."
    ),

    h2("getting-help", "Getting Help"),
    p(
      "If you ever get stuck, there are a few ways to get help:"
    ),
    list([
      ["AI Buddy", "Click the AI Buddy icon in the bottom-right corner of your screen. Ask it anything about how to use FlowDesk."],
      ["This Documentation", "You're reading it right now! Use the sidebar to browse topics or the search bar to find specific information."],
      ["Your Admin", "For account-specific questions (like permissions, billing, or setup), reach out to your team's Admin."],
    ]),
  ],
}, { next: "quickstart" })

define("quickstart", {
  title: "Getting Started",
  description: "Log in and complete your first task in under 5 minutes.",
  breadcrumbs: [
    { label: "Docs", slug: "introduction" },
    { label: "Getting Started" },
    { label: "Getting Started" },
  ],
  lastUpdated: "June 14, 2026",
  readingTime: "5 min read",
  sections: [
    h2("step-0-register", "Step 0 — Create your account"),
    p(
      "Before you can log in, you need an account. There are two ways this happens:"
    ),
    list([
      ["Admin-Created Account", "Your Admin or team lead creates your account and sends you an email with your login credentials. Check your inbox for an invitation email with a temporary password."],
      ["Self Registration", "If your organisation allows it, you can register yourself. Go to the FlowDesk login page and click <strong>Register</strong>. Enter your work email, choose a password, and complete your profile."],
    ]),
    img("/docs/images/flowdesk-registration.png", "FlowDesk registration page with email, password, and confirm password fields", "The registration screen"),
    callout(
      "Use your official work email address. Accounts created with personal emails may not be approved by your Admin."
    ),

    h2("step-1-log-in", "Step 1 — Log in"),
    p(
      "Open FlowDesk in your browser or desktop app. You'll see the login page."
    ),
    img("/docs/images/flowdesk-login-page.png", "FlowDesk login page with email and password fields", "The FlowDesk login screen"),
    ordered([
      "Enter your <strong>work email address</strong> (the one your Admin set up or you registered with).",
      "Enter your <strong>password</strong>.",
      "Click <strong>Sign in</strong>.",
    ]),
    p(
      "If your organisation uses Google login, you can click <strong>Sign in with Google</strong> instead and use your Google account credentials."
    ),
    callout(
      "If you forgot your password, click \"Forgot Password\" on the login page. You'll receive a 6-digit code via email to reset it."
    ),

    h2("step-2-explore-dashboard", "Step 2 — Explore your Dashboard"),
    p(
      "After logging in, you'll land on your <strong>Dashboard</strong>. This is your home base. Here's what you'll see:"
    ),
    img("/docs/images/flowdesk-dashboard-annotated.png", "Annotated FlowDesk dashboard showing projects, deadlines, activity feed, and quick actions", "Your dashboard after logging in"),
    list([
      ["Your Projects", "A list of all projects you're assigned to, with their current status and progress."],
      ["Upcoming Deadlines", "Tasks and projects that are due soon, highlighted so nothing slips through the cracks."],
      ["Recent Activity", "A feed of what's happened recently — task updates, new comments, file uploads, and more."],
      ["Quick Actions", "Shortcuts to create new projects, add tasks, or jump to specific sections."],
    ]),
    p(
      "Take a moment to look around. The sidebar on the left gives you access to all major sections of FlowDesk."
    ),

    h2("step-3-navigate-sidebar", "Step 3 — Navigate the Sidebar"),
    p(
      "The sidebar is your main navigation. Here's what each section does:"
    ),
    img("/docs/images/flowdesk-sidebar-navigation.png", "FlowDesk sidebar showing Dashboard, Assignments, Tasks, Calendar, Chat, and Settings sections", "The sidebar navigation"),
    table(
      ["Section", "What it's for"],
      [
        ["Dashboard", "Your home page with an overview of everything."],
        ["Assignments", "All your projects — ongoing, completed, and recurring."],
        ["Tasks", "All tasks assigned to you across all projects."],
        ["Calendar", "A calendar view of your tasks and deadlines."],
        ["Chat", "Direct messages and team conversations."],
        ["Settings", "Your profile, preferences, and account settings."],
      ]
    ),

    h2("step-4-find-your-project", "Step 4 — Find your project"),
    p(
      "Click <strong>Assignments</strong> in the sidebar to see all your projects. Projects are grouped into categories:"
    ),
    img("/docs/images/flowdesk-assignments-page.png", "FlowDesk Assignments page showing Ongoing, Completed, and Recurring Blueprint project categories", "Your projects in the Assignments view"),
    list([
      ["Ongoing", "Active projects currently being worked on. This is where you'll spend most of your time."],
      ["Completed", "Finished projects preserved for reference. All data, files, and discussions are kept."],
      ["Recurring Blueprints", "Templates that automatically create new projects on a schedule (weekly sprints, monthly reports, etc.)."],
    ]),
    p(
      "Click on any project to open it and see its tasks, team members, chat, and activity logs."
    ),

    h2("step-5-create-a-task", "Step 5 — Create a task"),
    p(
      "Open any project and click <strong>Add Task</strong>. Here's how to create a good task:"
    ),
    img("/docs/images/flowdesk-create-task.png", "FlowDesk task creation form with title, description, assignee, due date, priority, and checkpoints fields", "Creating a new task"),
    ordered([
      "Give it a <strong>clear title</strong> that describes what needs to be done.",
      "Add a <strong>description</strong> with any relevant details, requirements, or links.",
      "Assign it to <strong>a team member</strong> (or leave it unassigned for someone to claim).",
      "Set a <strong>due date</strong> if there's a deadline.",
      "Add <strong>checkpoints</strong> if the task has multiple steps (see <a>Working with Tasks</a>).",
      "Click <strong>Create</strong> — the task appears in the project immediately.",
    ]),

    h2("step-6-track-progress", "Step 6 — Track progress"),
    p(
      "As work progresses, update the task status to keep everyone in the loop:"
    ),
    img("/docs/images/flowdesk-task-status-flow.png", "Visual diagram showing task status flow: Todo → In Progress → Review → Completed", "The task lifecycle workflow"),
    ordered([
      "<strong>Todo</strong> → <strong>In Progress</strong>: Start working on the task.",
      "<strong>In Progress</strong> → <strong>Review</strong>: Work is done, needs approval.",
      "<strong>Review</strong> → <strong>Completed</strong>: Work is approved and finished.",
    ]),
    p(
      "Each status change is logged in the activity feed, so your team always knows what's happening without needing to ask."
    ),

    h2("next-steps", "What's next?"),
    p(
      "Now that you know the basics, here are some things to explore next:"
    ),
    list([
      ["<a>Your Account</a>", "Personalise your profile, notification preferences, and appearance settings."],
      ["<a>Creating Projects</a>", "Set up your first project and learn about team management."],
      ["<a>Working with Tasks</a>", "Master the task lifecycle, checkpoints, and assignment options."],
      ["<a>AI Buddy</a>", "Discover how the AI assistant can help you work smarter."],
    ]),
  ],
}, { prev: "introduction", next: "account" })

define("account", {
  title: "Your Account",
  description: "Manage your profile, notification preferences, and personal settings.",
  breadcrumbs: [
    { label: "Docs", slug: "introduction" },
    { label: "Getting Started" },
    { label: "Your Account" },
  ],
  lastUpdated: "June 12, 2026",
  readingTime: "4 min read",
  sections: [
    h2("profile-settings", "Profile Settings"),
    p(
      "Click your avatar in the top-right corner and select <strong>Settings</strong> to manage your profile. You can update the following:"
    ),
    img("/docs/images/flowdesk-profile-settings.png", "FlowDesk profile settings page showing display name, email, profile picture, and employee ID fields", "Your profile settings"),
    list([
      ["Display Name", "Your name as it appears to other users across FlowDesk."],
      ["Email Address", "Your work email. Contact your Admin if you need to change this."],
      ["Profile Picture", "Upload a photo so teammates can easily recognise you."],
      ["Employee ID", "Your unique identifier within the organisation."],
    ]),
    p(
      "Changes are saved automatically. Your updated profile picture and name will be visible to all team members immediately."
    ),

    h2("notification-preferences", "Notification Preferences"),
    p(
      "FlowDesk keeps you informed about what matters. You can customise exactly what you're notified about and how:"
    ),
    img("/docs/images/flowdesk-notification-settings.png", "FlowDesk notification preferences page with toggles for in-app, email, and desktop notifications", "Configure your notification preferences"),

    h3("Notification Types"),
    list([
      ["In-app Notifications", "Real-time alerts that appear in the notification bell icon in the top-right corner. These are always on and include task assignments, mentions, deadline reminders, and chat messages."],
      ["Email Notifications", "Optional email summaries for important events. Useful if you're not always logged into FlowDesk. You can choose to receive emails for new assignments, approaching deadlines, and mentions."],
      ["Desktop Notifications", "Pop-up alerts from the desktop app when FlowDesk is in the background. Great for staying aware without constantly checking the app."],
    ]),

    h3("Managing Notifications"),
    p(
      "Go to <strong>Settings > Notifications</strong> to configure your preferences. You can toggle each notification type on or off independently. For example, you might want in-app notifications but not email notifications."
    ),
    callout(
      "Even with notifications turned off, you'll still see all activity when you open FlowDesk. Notifications are just about how you're alerted — the data is always there."
    ),

    h2("appearance", "Appearance"),
    p(
      "FlowDesk supports both <strong>light</strong> and <strong>dark</strong> themes. Toggle between them from the settings panel or the theme icon in the sidebar."
    ),
    img("/docs/images/flowdesk-appearance-toggle.png", "FlowDesk light and dark theme comparison side by side", "Switch between light and dark mode"),
    list([
      ["Light Mode", "Clean, bright interface. Best for well-lit environments and daytime use."],
      ["Dark Mode", "Reduced brightness with darker backgrounds. Easier on the eyes in low-light environments and during extended work sessions."],
    ]),
    p(
      "Your theme preference is saved automatically and persists across sessions. The theme applies to the entire platform — all pages, modals, and components."
    ),

    h2("changing-your-password", "Changing Your Password"),
    p(
      "It's a good practice to change your password periodically. Here's how:"
    ),
    ordered([
      "Go to <strong>Settings > Security</strong>.",
      "Click <strong>Change Password</strong>.",
      "Enter your <strong>current password</strong>.",
      "Enter your <strong>new password</strong> (at least 6 characters).",
      "Enter the new password again to <strong>confirm</strong>.",
      "Click <strong>Update Password</strong>.",
    ]),
    callout(
      "If you forget your password, use the \"Forgot Password\" link on the login page. You'll receive a 6-digit code via email to reset it."
    ),

    h2("logging-out", "Logging Out"),
    p(
      "To log out, click your avatar in the top-right corner and select <strong>Log out</strong>. This signs you out of the current device. If you're using the desktop app, closing the window will minimise it to the system tray — you'll stay logged in until you explicitly quit the app."
    ),
  ],
}, { prev: "quickstart", next: "creating-projects" })

// ── WORKING WITH PROJECTS ──────────────────────────────────────

define("creating-projects", {
  title: "Creating Projects",
  description: "Set up new projects, assign teams, and get work started.",
  breadcrumbs: [
    { label: "Docs", slug: "introduction" },
    { label: "Working with Projects" },
    { label: "Creating Projects" },
  ],
  lastUpdated: "June 13, 2026",
  readingTime: "5 min read",
  sections: [
    h2("creating-a-new-project", "Creating a New Project"),
    p(
      "Creating a project in FlowDesk is straightforward. Click <strong>+ New Project</strong> from the sidebar or dashboard to get started."
    ),
    img("/docs/images/flowdesk-create-project.png", "FlowDesk new project form with name, description, category, deadline, and team member fields", "Creating a new project"),
    ordered([
      "Enter a <strong>project name</strong> — something descriptive that tells your team what the project is about.",
      "Add a <strong>description</strong> (optional) — provide context about the project's goals, scope, or key deliverables.",
      "Choose a <strong>category</strong>:",
    ]),
    list([
      ["Ongoing", "For active projects that your team is currently working on. These appear in your main project list."],
      ["Completed", "For projects that are already finished. Useful for archiving work that's done but needs to be preserved."],
      ["Recurring Blueprint", "For projects that repeat on a schedule. Create the template once, and FlowDesk will automatically spawn new instances."],
    ]),
    ordered([
      "Set a <strong>deadline</strong> (optional) — the target completion date. Leave blank for open-ended work.",
      "Add <strong>team members</strong> — search by name or email and assign roles (see below).",
      "Click <strong>Create</strong> — your project is live immediately and visible to all added members.",
    ]),

    h2("adding-team-members", "Adding Team Members"),
    p(
      "Every project needs a team. After creating a project, go to the <strong>Members</strong> tab to add people:"
    ),
    img("/docs/images/flowdesk-project-members.png", "FlowDesk project members tab showing team members with their roles and options to add or remove", "Managing team members"),
    ordered([
      "Click <strong>Add Member</strong>.",
      "Search for a colleague by <strong>name</strong> or <strong>email address</strong>.",
      "Select their <strong>role</strong> within this project:",
    ]),
    list([
      ["Admin", "Full control over the project. Can edit settings, manage members, and delete the project."],
      ["Manager", "Can create tasks, approve work, manage team members, and view reports."],
      ["Member", "Can work on assigned tasks, chat, and upload files."],
    ]),
    p(
      "Team members you add can immediately see and interact with the project's tasks, chat, and files."
    ),

    h2("project-status", "Project Status"),
    p(
      "Each project has a status indicator that updates automatically based on task completion and deadline proximity:"
    ),
    table(
      ["Status", "Meaning", "When it appears"],
      [
        ["Active", "Work is in progress", "Default status for ongoing projects"],
        ["At Risk", "Deadline approaching or tasks blocked", "When a deadline is within 3 days or tasks are overdue"],
        ["Completed", "All tasks are finished", "When all tasks reach the Completed state"],
        ["Archived", "Project moved to archive", "When manually archived by a Manager or Admin"],
      ]
    ),

    h2("project-dashboard", "The Project Dashboard"),
    p(
      "When you open a project, you'll see its dashboard. This gives you a complete overview:"
    ),
    img("/docs/images/flowdesk-project-dashboard.png", "FlowDesk project dashboard showing progress bar, task summary, team members, and recent activity", "Inside a project dashboard"),
    list([
      ["Progress Bar", "Shows the percentage of tasks completed. Calculated automatically from task status."],
      ["Task Summary", "Counts of tasks in each state (Todo, In Progress, Review, Completed)."],
      ["Team Members", "Who's assigned to this project and their roles."],
      ["Recent Activity", "Latest changes — task updates, comments, file uploads, and status changes."],
      ["Upcoming Deadlines", "Tasks and milestones that are due soon."],
    ]),

    h2("project-templates", "Saving as Template"),
    p(
      "If you create similar projects frequently, you can save a project as a <strong>template</strong>. This copies the project structure — tasks, team assignments, settings — so you don't have to start from scratch."
    ),
    p(
      "To save a project as a template, open the project settings and select <strong>Save as Template</strong>. When creating a new project, you'll see your templates as an option."
    ),

    h2("deleting-projects", "Deleting Projects"),
    p(
      "Only Admins and Managers can delete projects. Deleted projects are moved to the archive first — they're not permanently removed immediately. This gives you a chance to restore them if needed."
    ),
    callout(
      "If you're unsure whether to delete a project, archive it instead. Archived projects preserve all data and can be restored at any time."
    ),
  ],
}, { prev: "account", next: "project-types" })

define("project-types", {
  title: "Project Types",
  description: "Understand the three types of projects and how recurring blueprints work.",
  breadcrumbs: [
    { label: "Docs", slug: "introduction" },
    { label: "Working with Projects" },
    { label: "Project Types" },
  ],
  lastUpdated: "June 14, 2026",
  readingTime: "5 min read",
  sections: [
    h2("ongoing-projects", "Ongoing Projects"),
    p(
      "These are your active projects — work currently being handled by your teams. The <strong>Ongoing Work</strong> section is your command centre for active work."
    ),
    img("/docs/images/flowdesk-ongoing-projects.png", "FlowDesk ongoing projects list showing project cards with progress bars, team avatars, and deadlines", "Your ongoing projects"),
    p(
      "Each project card shows:"
    ),
    list([
      ["Project Name", "The title of the project."],
      ["Progress Bar", "Visual indicator of how many tasks are completed."],
      ["Assigned Team", "Avatars of team members working on this project."],
      ["Deadline", "The target completion date (if set)."],
      ["Latest Activity", "The most recent change — a task update, comment, or file upload."],
    ]),
    p(
      "Use the filters at the top of the page to narrow down by team, priority, or date range. This is especially useful when you have many projects and need to focus on specific ones."
    ),

    h2("completed-projects", "Completed Projects"),
    p(
      "When all tasks in a project are done, it moves to <strong>Completed Projects</strong>. This serves as a permanent archive of finished work."
    ),
    p("All data is preserved:"),
    list([
      ["Tasks", "All tasks and their complete history — status changes, comments, and assignments."],
      ["Files", "All uploaded documents, images, and attachments remain accessible."],
      ["Discussions", "Chat messages and task comments are kept for future reference."],
      ["Activity Logs", "A complete audit trail of everything that happened during the project."],
    ]),
    p(
      "You can <strong>restore</strong> a completed project back to Ongoing if it needs to be reopened. Restoring preserves all data and puts the project back into active status."
    ),

    h2("recurring-blueprints", "Recurring Blueprints"),
    p(
      "Blueprints are project templates that automatically create new project instances on a schedule. They're perfect for repetitive workflows like:"
    ),
    img("/docs/images/flowdesk-recurring-blueprint.png", "FlowDesk recurring blueprint configuration showing schedule, start date, template tasks, and auto-assignment", "Setting up a recurring blueprint"),
    list([
      ["Weekly Sprints", "Automatically create a new sprint project every Monday with pre-defined tasks."],
      ["Monthly Reports", "Spawn a new reporting project on the 1st of each month."],
      ["Quarterly Reviews", "Create review projects every 3 months with standard checklists."],
      ["Daily Standups", "Generate daily standup projects with consistent task structures."],
    ]),

    h3("Setting up a Blueprint"),
    p("To create a recurring project, select <strong>Recurring Blueprint</strong> when creating a new project and configure:"),
    list([
      ["Schedule", "Choose how often new projects are created: Daily, Weekly, Monthly, or Yearly."],
      ["Start Date", "When the first instance should be created."],
      ["End Date", "Optional — when to stop creating new instances. Leave blank for ongoing recurrence."],
      ["Template Tasks", "Set up the initial task list that will be copied to each new project."],
      ["Auto-assignment", "Choose which team members are automatically added to each new instance."],
    ]),

    h3("How Blueprints Work"),
    p(
      "FlowDesk automatically creates new project instances based on your schedule. The system is designed to be reliable:"
    ),
    list([
      ["Duplicate Prevention", "The system checks if an instance for the current cycle already exists before creating a new one."],
      ["Automatic Catch-up", "If the system was offline during a scheduled creation, it catches up automatically when it comes back online — no cycles are ever missed."],
      ["Notifications", "Team members assigned to the blueprint are notified when a new instance is created."],
    ]),
    p(
      "You can pause, edit, or delete a blueprint at any time. Pausing prevents new instances without deleting the template. Editing a blueprint applies changes to all future instances."
    ),

    h2("switching-types", "Switching Project Types"),
    p(
      "You can change a project's type after creation. For example, if an ongoing project is finished, you can mark it as completed. Go to <strong>Project Settings > Category</strong> to change the type."
    ),
  ],
}, { prev: "creating-projects", next: "working-with-tasks" })

define("working-with-tasks", {
  title: "Working with Tasks",
  description: "Create tasks, track progress, and manage work with checkpoints.",
  breadcrumbs: [
    { label: "Docs", slug: "introduction" },
    { label: "Working with Projects" },
    { label: "Working with Tasks" },
  ],
  lastUpdated: "June 13, 2026",
  readingTime: "6 min read",
  sections: [
    h2("task-lifecycle", "Task Lifecycle"),
    p(
      "Every task in FlowDesk moves through a simple workflow. Understanding this flow helps you and your team stay aligned:"
    ),
    img("/docs/images/flowdesk-task-lifecycle.png", "FlowDesk task lifecycle diagram showing Todo, In Progress, Review, and Completed stages with transitions", "The task lifecycle"),
    table(
      ["Stage", "What it means", "What you can do"],
      [
        ["Todo", "Task is created but work hasn't started yet", "Assign someone, edit details, set priority, start working"],
        ["In Progress", "Work is actively being done on the task", "Add checkpoints, update status when ready for review, comment"],
        ["Review", "Work is complete and awaiting approval", "Approve it to mark complete, or send back for changes"],
        ["Completed", "Task has been approved and finished", "Reopen if needed later, view history"],
      ]
    ),
    p(
      "Tasks normally move forward through these stages. However, if rework is needed, a Manager can send a task back to a previous stage. For example, a task in Review can be sent back to In Progress if changes are required."
    ),

    h2("creating-tasks", "Creating Tasks"),
    p(
      "Open any project and click <strong>Add Task</strong>. Here's how to create effective tasks:"
    ),
    img("/docs/images/flowdesk-task-form.png", "FlowDesk task creation form with title, description, assignee dropdown, due date picker, and priority selector", "Filling out the task form"),
    ordered([
      "Write a <strong>clear, action-oriented title</strong>. Instead of \"Website\", use \"Redesign the landing page hero section\".",
      "Add a <strong>description</strong> with relevant details — requirements, links to designs, acceptance criteria, or context.",
      "Choose an <strong>assignee</strong> — pick a team member or leave it unassigned for someone to claim.",
      "Set a <strong>due date</strong> if there's a deadline. Leave blank for open-ended tasks.",
      "Set a <strong>priority</strong> — Low, Medium, High, or Urgent. This helps with filtering and visibility.",
      "Add <strong>checkpoints</strong> if the task has multiple steps (see below).",
      "Attach <strong>files</strong> — drag and drop or click the attachment icon.",
    ]),

    h2("checkpoints", "Checkpoints (Subtasks)"),
    p(
      "Checkpoints let you break a task into smaller, verifiable steps. They're perfect for complex tasks that need to be done in stages."
    ),
    img("/docs/images/flowdesk-checkpoints.png", "FlowDesk task with checkpoints showing subtasks, completion status, and progress bar", "Checkpoints within a task"),
    p("To add checkpoints:"),
    ordered([
      "Open any task.",
      "Scroll to the <strong>Checkpoints</strong> section.",
      "Click <strong>+ Add Checkpoint</strong>.",
      "Enter a description for the subtask.",
      "Optionally assign it to a specific team member.",
      "Optionally set a time estimate.",
    ]),
    list([
      ["Track Granular Progress", "See how far along a task is based on completed checkpoints. The parent task shows a progress bar."],
      ["Assign Owners", "Each checkpoint can be assigned to a different team member, so different people can work on different parts."],
      ["Set Estimates", "Optionally add time estimates to each checkpoint to track effort and plan work."],
      ["Reorder Steps", "Drag checkpoints to reorder them. The order reflects the sequence work should be done."],
    ]),
    callout(
      "A task can only be marked Completed when all its checkpoints are done. This ensures nothing is forgotten before a task is considered finished."
    ),

    h2("task-priority", "Task Priority"),
    p(
      "Every task can be assigned a priority level. Priority affects how tasks appear in filters and dashboards:"
    ),
    table(
      ["Priority", "When to use", "Visibility"],
      [
        ["Urgent", "Critical tasks that need immediate attention", "Highlighted in red across the dashboard"],
        ["High", "Important tasks that should be done soon", "Highlighted in orange"],
        ["Medium", "Standard tasks with normal importance", "Default priority, neutral styling"],
        ["Low", "Tasks that can wait or are nice-to-have", "Subtle styling, lower in lists"],
      ]
    ),

    h2("assigning-work", "Assigning Work"),
    p(
      "Tasks can be assigned in different ways depending on your needs:"
    ),
    list([
      ["Individual Assignment", "Assign a task to a specific person. They're responsible for completing it and updating its status. They receive all notifications for this task."],
      ["Team Assignment", "Assign a task to an entire team. Any member of that team can pick up the work. Useful for shared responsibilities where the first available person should handle it."],
      ["Unassigned", "Leave a task without an assignee. It appears in the <strong>Unassigned</strong> view where team members can claim it. Managers can also bulk-assign unassigned tasks."],
    ]),
    p(
      "Task ownership can be transferred at any time. Edit the task and select a new assignee. All checkpoint assignments, comments, and activity logs remain intact."
    ),

    h2("viewing-tasks", "Viewing Tasks"),
    p(
      "FlowDesk provides multiple ways to view your tasks:"
    ),
    img("/docs/images/flowdesk-task-views.png", "FlowDesk task views showing My Tasks, Project Tasks, Calendar View, and Unassigned options", "Different ways to view your tasks"),
    list([
      ["My Tasks", "A personal view showing all tasks assigned to you across all projects. Great for daily planning."],
      ["Project Tasks", "Tasks within a specific project. Filter by status, assignee, or priority."],
      ["Calendar View", "See your tasks laid out on a calendar based on due dates. Helps with time management."],
      ["Unassigned", "Tasks without an assignee, waiting for someone to claim them."],
    ]),

    h2("bulk-actions", "Bulk Actions"),
    p(
      "Save time by performing actions on multiple tasks at once. Select tasks using the checkboxes, then choose from:"
    ),
    list([
      ["Change Priority", "Update the priority level of several tasks at once."],
      ["Extend Deadlines", "Push back deadlines by a specified number of days."],
      ["Reassign", "Move multiple tasks to a different team member."],
      ["Change Status", "Move several tasks to a different state simultaneously."],
      ["Archive", "Move completed or cancelled tasks to the archive."],
    ]),
  ],
}, { prev: "project-types", next: "deadlines" })

define("deadlines", {
  title: "Deadlines & Notifications",
  description: "Set deadlines and stay informed with automatic notifications.",
  breadcrumbs: [
    { label: "Docs", slug: "introduction" },
    { label: "Working with Projects" },
    { label: "Deadlines" },
  ],
  lastUpdated: "June 10, 2026",
  readingTime: "5 min read",
  sections: [
    h2("setting-deadlines", "Setting Deadlines"),
    p(
      "Deadlines can be set at both the <strong>project</strong> and <strong>task</strong> level. They help your team stay on track and ensure work is completed on time."
    ),
    img("/docs/images/flowdesk-deadlines.png", "FlowDesk deadline configuration showing project and task deadline date pickers", "Setting deadlines for projects and tasks"),
    list([
      ["Project Deadlines", "The overall target completion date for the entire project. Displayed prominently on the project dashboard and in project lists."],
      ["Task Deadlines", "Intermediate milestones within a project. Each task can have its own due date, which appears on the calendar and in task lists."],
    ]),
    p(
      "Tasks and projects without deadlines are handled gracefully. They appear in dedicated <strong>Unscheduled</strong> views and never trigger false alerts or overdue notifications."
    ),

    h2("deadline-notifications", "How Notifications Work"),
    p(
      "FlowDesk keeps you informed as deadlines approach. You'll receive notifications at key milestones:"
    ),
    table(
      ["Timing", "Type", "What you receive"],
      [
        ["7 days before", "Heads-up", "A warning that the deadline is coming up. Time to start wrapping up or adjust plans."],
        ["48 hours before", "Reminder", "A reminder to start finalising work. Good time to check in with the team."],
        ["On the due date", "Alert", "An alert that the deadline is today. Priority notifications for urgent tasks."],
        ["After due date", "Overdue", "Daily reminders until the task is completed or the deadline is extended."],
      ]
    ),
    p(
      "Managers also receive a <strong>daily digest</strong> — a summary email of all upcoming and overdue deadlines across their projects. This gives managers a quick overview without having to check each project individually."
    ),

    h2("viewing-deadlines", "Viewing Deadlines"),
    p(
      "There are several ways to see your deadlines:"
    ),
    img("/docs/images/flowdesk-calendar-view.png", "FlowDesk calendar view showing tasks and deadlines laid out across the month", "Calendar view of your deadlines"),
    list([
      ["Dashboard", "Your home page shows upcoming deadlines at a glance, highlighted by urgency."],
      ["Calendar View", "See all tasks and projects laid out on a calendar. Filter by project, team, or priority. Drag tasks to reschedule."],
      ["Project Dashboard", "Each project shows its deadline and the deadlines of its tasks."],
      ["My Tasks", "Your personal task list shows due dates for all your assigned tasks."],
    ]),

    h2("changing-deadlines", "Changing Deadlines"),
    p(
      "Deadlines can be updated at any time by Managers and Admins. Click on a task or project deadline to edit it. All changes are logged in the activity feed, so the team can see when and why a deadline was adjusted."
    ),
    p(
      "If a deadline needs to be pushed back significantly, it's a good practice to leave a comment explaining why. This helps the team understand context and make better estimates in the future."
    ),
  ],
}, { prev: "working-with-tasks", next: "your-team" })

// ── COLLABORATION ────────────────────────────────────────────

define("your-team", {
  title: "Your Team",
  description: "Collaborate with your team, track activity, and manage ownership.",
  breadcrumbs: [
    { label: "Docs", slug: "introduction" },
    { label: "Collaboration" },
    { label: "Your Team" },
  ],
  lastUpdated: "June 12, 2026",
  readingTime: "5 min read",
  sections: [
    h2("team-collaboration", "Working Together"),
    p(
      "FlowDesk is built for teamwork. Every project, task, and conversation is shared with the relevant team members. You can see who's online, who's working on what, and what's changed — all in real time."
    ),
    img("/docs/images/flowdesk-team-collaboration.png", "FlowDesk team collaboration view showing online members, shared projects, and real-time activity", "Working together in FlowDesk"),
    p(
      "The key to effective collaboration in FlowDesk is visibility. When everyone can see the full picture — what's being worked on, what's done, and what's coming next — the team stays aligned without constant meetings or status updates."
    ),

    h2("online-status", "Online Status"),
    p(
      "FlowDesk shows when your teammates are online, idle, or offline. This helps you know who's available for a quick question or review."
    ),
    list([
      ["Online (Green)", "The user is actively using FlowDesk right now. Great time to reach out."],
      ["Idle (Yellow)", "The user hasn't interacted for a few minutes. They might be away from their desk."],
      ["Offline (Gray)", "The user is not currently connected. Messages will be waiting when they return."],
    ]),
    p(
      "Status updates happen automatically based on user activity. You don't need to manually set your status."
    ),

    h2("activity-logs", "Activity Logs"),
    p(
      "Every change in FlowDesk is recorded in the activity log. This provides a complete audit trail of everything that happened in a project — who did what, and when."
    ),
    img("/docs/images/flowdesk-activity-logs.png", "FlowDesk activity log showing task events, project events, file uploads, and chat messages with timestamps", "Activity logs in a project"),
    p("What gets logged:"),
    list([
      ["Task Events", "Creation, status changes, checkpoint completion, assignment changes, priority updates, and deletions."],
      ["Project Events", "Creation, category changes, deadline updates, team membership changes, and settings modifications."],
      ["File Events", "Uploads, downloads, and deletions of attachments and documents."],
      ["Chat Events", "Messages sent, files shared, and mentions made in project chat."],
      ["System Events", "User logins, role changes, and blueprint spawns."],
    ]),
    p(
      "Activity logs are accessible from the <strong>Activity</strong> tab in any project. Each entry shows who performed the action, what changed, and exactly when it happened."
    ),
    p(
      "Managers and Admins can filter logs by event type, user, and date range. They can also export logs as CSV for external reporting and compliance purposes."
    ),

    h2("file-sharing", "File Sharing"),
    p(
      "FlowDesk supports file sharing within projects and tasks. You can attach files to tasks, share them in chat, and store project-related documents."
    ),
    list([
      ["Task Attachments", "Attach files directly to tasks. Useful for designs, documents, or reference materials."],
      ["Chat Files", "Share files in project chat. Drag and drop or click the attachment icon."],
      ["Project Files", "Store project-level documents that the whole team can access."],
    ]),
    p(
      "All files are stored securely and can be downloaded at any time. There's no limit on file sizes, and all common file types are supported."
    ),
  ],
}, { prev: "deadlines", next: "chat" })

define("chat", {
  title: "Chat & Communication",
  description: "Send messages, share files, and stay connected with your team.",
  breadcrumbs: [
    { label: "Docs", slug: "introduction" },
    { label: "Collaboration" },
    { label: "Chat" },
  ],
  lastUpdated: "June 12, 2026",
  readingTime: "4 min read",
  sections: [
    h2("project-chat", "Project Chat"),
    p(
      "Every project in FlowDesk has a built-in <strong>Chat</strong> tab. This is your team's dedicated space for discussing project-related topics, sharing updates, and coordinating work — all without leaving FlowDesk."
    ),
    img("/docs/images/flowdesk-project-chat.png", "FlowDesk project chat showing messages, file attachments, and team member avatars", "The project chat interface"),
    p(
      "Project chat keeps conversations in context. Instead of digging through email threads or Slack channels, everything related to a project is in one place."
    ),

    h2("real-time-messaging", "Real-time Messaging"),
    p(
      "Messages appear instantly for everyone in the project. You'll see:"
    ),
    list([
      ["Typing Indicators", "When someone is composing a message, you'll see a typing indicator so you know they're about to respond."],
      ["Read Receipts", "See who has read your messages. This helps confirm that important updates have been seen."],
      ["Message History", "All messages are persisted and searchable. You can scroll back through the entire conversation history."],
    ]),

    h2("sending-messages", "Sending Messages"),
    p(
      "Type your message in the chat input at the bottom of the chat panel and press Enter to send. Here's what you can do:"
    ),
    img("/docs/images/flowdesk-chat-input.png", "FlowDesk chat input with file attachment, emoji picker, and mention autocomplete", "Composing a message"),
    list([
      ["Share Files", "Drag and drop files directly into the chat, or click the attachment icon to upload documents, images, or any file type."],
      ["Mention Teammates", "Use @username to mention a specific person. They'll receive a notification even if they're not actively watching the chat."],
      ["Use Emoji", "Add emoji to make conversations more expressive and fun. Click the emoji icon or type emoji directly."],
      ["Format Text", "Use basic formatting like bold, italic, and code blocks to make your messages clearer."],
    ]),

    h2("mentions-and-notifications", "Mentions & Notifications"),
    p(
      "When you mention someone with @username, they receive an in-app notification and, if configured, an email alert. This ensures important messages don't get lost."
    ),
    p(
      "Mentions are clickable — clicking a mention takes you directly to that user's profile. This makes it easy to see their role, other projects they're working on, and how to contact them."
    ),

    h2("searching-messages", "Finding Old Messages"),
    p(
      "Use the search bar at the top of the chat panel to find messages. You can search by:"
    ),
    list([
      ["Keyword", "Find messages containing specific words or phrases."],
      ["Sender", "Find all messages from a specific team member."],
      ["Date Range", "Narrow down to messages from a specific time period."],
    ]),
    p(
      "Search results include surrounding messages for context, so you can understand the conversation flow around the match."
    ),
  ],
}, { prev: "your-team", next: "ai-buddy" })

define("ai-buddy", {
  title: "AI Buddy",
  description: "Your intelligent assistant for project analysis, task creation, and guidance.",
  breadcrumbs: [
    { label: "Docs", slug: "introduction" },
    { label: "Collaboration" },
    { label: "AI Buddy" },
  ],
  lastUpdated: "June 15, 2026",
  readingTime: "4 min read",
  sections: [
    h2("what-is-ai-buddy", "What is AI Buddy?"),
    p(
      "AI Buddy is a built-in intelligent assistant that helps you work smarter and faster. It understands your project context, team history, and work patterns to provide relevant, actionable assistance."
    ),
    img("/docs/images/flowdesk-ai-buddy.png", "FlowDesk AI Buddy panel in the bottom-right corner showing a conversation with analysis results", "AI Buddy in action"),
    p(
      "Think of AI Buddy as a knowledgeable teammate who's always available. It can analyse your projects, generate content, answer questions, and help you make better decisions — all based on your actual project data."
    ),

    h2("what-ai-buddy-can-do", "What AI Buddy Can Do"),
    p("AI Buddy has several key capabilities:"),
    list([
      ["Analyse Projects", "Get insights on project velocity, estimated completion dates, and potential bottlenecks. AI Buddy looks at how fast your team is completing tasks and predicts when the project will be done."],
      ["Generate Task Descriptions", "Turn a quick one-line summary into a detailed, structured task description with acceptance criteria, subtask suggestions, and relevant context."],
      ["Answer Questions", "Ask about project history, past decisions, or how things were done before. AI Buddy searches through your project data to find relevant answers."],
      ["Suggest Deadlines", "Get recommended deadlines based on team workload, past performance, and task complexity. Helps you set realistic expectations."],
      ["Summarise Activity", "Get a quick summary of what's happened in a project — who did what, what's changed, and what needs attention."],
      ["Provide Guidance", "Ask how to use FlowDesk features, and AI Buddy will guide you through the process step by step."],
    ]),

    h2("how-to-use", "How to Use AI Buddy"),
    p("Getting started with AI Buddy is easy:"),
    img("/docs/images/flowdesk-ai-buddy-shortcut.png", "FlowDesk showing the AI Buddy icon and Ctrl+B keyboard shortcut", "Open AI Buddy with a click or keyboard shortcut"),
    ordered([
      "Click the <strong>AI Buddy icon</strong> in the bottom-right corner of your screen.",
      "Or press <strong>Cmd + B</strong> (Mac) / <strong>Ctrl + B</strong> (Windows) as a keyboard shortcut.",
      "Type your question or request in <strong>natural language</strong>. You don't need to use special commands.",
      "AI Buddy will respond with a helpful answer, analysis, or generated content.",
    ]),
    p("Here are some example prompts:"),
    list([
      ["\"How is the Q3 Marketing project progressing?\"", "AI Buddy will analyse task completion rates and give you a progress summary."],
      ["\"Write a task description for redesigning the user dashboard\"", "AI Buddy will generate a detailed task with acceptance criteria."],
      ["\"What deadlines are coming up this week?\"", "AI Buddy will list all tasks and projects due in the next 7 days."],
      ["\"Who hasn't updated their tasks in the last 3 days?\"", "AI Buddy will identify overdue tasks and their assignees."],
    ]),

    h2("privacy", "Your Data is Safe"),
    callout(
      "AI Buddy processes data within your organisation's workspace only. Your project data is never shared externally, used for model training, or accessible to other organisations. You can disable AI Buddy in your account settings at any time."
    ),
  ],
}, { prev: "chat", next: "canvas" })

define("canvas", {
  title: "Collaborative Canvas",
  description: "A digital whiteboard for brainstorming, visual workflows, and real-time collaboration.",
  breadcrumbs: [
    { label: "Docs", slug: "introduction" },
    { label: "Collaboration" },
    { label: "Canvas" },
  ],
  lastUpdated: "June 13, 2026",
  readingTime: "4 min read",
  sections: [
    h2("what-is-the-canvas", "What is the Canvas?"),
    p(
      "The Collaborative Canvas is a digital whiteboard where you can brainstorm ideas, create visual workflows, and collaborate with your team in real time. Think of it as a shared space for notes, diagrams, and planning."
    ),
    img("/docs/images/flowdesk-canvas-overview.png", "FlowDesk collaborative canvas showing colour-coded notes, arrows connecting ideas, and team cursors", "The collaborative canvas"),
    p(
      "It's perfect for sprint planning, brainstorming sessions, process mapping, or any time your team needs to visualise ideas together."
    ),

    h2("creating-notes", "Creating Notes"),
    p(
      "Click anywhere on the canvas to create a new note. Each note is like a digital sticky note with powerful features:"
    ),
    img("/docs/images/flowdesk-canvas-notes.png", "FlowDesk canvas notes showing rich text formatting, colour options, and drag handles", "Creating and editing notes on the canvas"),
    list([
      ["Rich Text", "Format your text with bold, italic, lists, and more to make notes clear and structured."],
      ["Colour Coding", "Choose from different colours to categorise notes — e.g., blue for ideas, green for actions, red for blockers."],
      ["Attachments", "Add files, links, or images directly to notes for reference."],
      ["Drag & Drop", "Move notes around freely. The canvas auto-saves all changes instantly."],
      ["Resize", "Drag the edges of a note to make it larger or smaller depending on content."],
    ]),

    h2("connecting-ideas", "Connecting Ideas"),
    p(
      "Draw arrows between notes to show relationships and create visual workflows:"
    ),
    img("/docs/images/flowdesk-canvas-connections.png", "FlowDesk canvas showing notes connected with arrows forming a flowchart", "Connecting notes with arrows"),
    ordered([
      "Select a note by clicking on it.",
      "Drag from the <strong>connection handle</strong> (the small circle on the edge of the note).",
      "Drop it on another note to create a link.",
      "The arrow stays connected when you move either note.",
    ]),
    p(
      "This is great for creating flowcharts, mind maps, process diagrams, or showing how different ideas relate to each other."
    ),

    h2("personal-vs-team", "Personal vs Team Mode"),
    p("The canvas supports two modes:"),
    list([
      ["Personal Mode", "Your private canvas for drafting and brainstorming. Only you can see your notes. Perfect for organising your thoughts before sharing with the team."],
      ["Team Mode", "Collaborate in real time with your teammates. See everyone's cursors and edits as they happen. Changes sync instantly across all connected devices."],
    ]),
    p(
      "You can switch between modes at any time. When you're ready to share your personal canvas with the team, switch to Team mode and your notes become visible to everyone."
    ),

    h2("canvas-tips", "Tips for Effective Canvas Use"),
    list([
      ["Use Colour Wisely", "Assign colours to categories (e.g., red = blockers, green = completed, blue = ideas) for visual clarity."],
      ["Keep Notes Concise", "Write brief, actionable points. You can always add detail in the note body."],
      ["Group Related Ideas", "Place related notes close together and connect them with arrows."],
      ["Use it for Standups", "Start each standup with a canvas overview of what's in progress, what's done, and what's blocked."],
    ]),
  ],
}, { prev: "ai-buddy", next: "roles" })

// ── ROLES & PERMISSIONS ──────────────────────────────────────

define("roles", {
  title: "Understanding Roles",
  description: "Learn about the three user roles and what each one can access.",
  breadcrumbs: [
    { label: "Docs", slug: "introduction" },
    { label: "Roles & Permissions" },
    { label: "Understanding Roles" },
  ],
  lastUpdated: "June 14, 2026",
  readingTime: "4 min read",
  sections: [
    h2("why-roles-matter", "Why Roles Matter"),
    p(
      "FlowDesk uses roles to make sure everyone sees exactly what they need — no more, no less. Your role determines what you can view, create, and manage across the platform."
    ),
    p(
      "This isn't about restricting access — it's about keeping things focused. A team member working on tasks doesn't need to see billing information, and a project manager doesn't need to configure system settings. Roles help everyone focus on their work."
    ),

    h2("the-three-roles", "The Three Roles"),
    img("/docs/images/flowdesk-role-hierarchy.png", "Visual hierarchy diagram showing Admin, Manager, and Member roles with their key abilities", "The three roles in FlowDesk"),
    table(
      ["Role", "Who it's for", "Key abilities"],
      [
        ["Admin", "System administrators and IT leads", "Full platform access, user management, system settings, billing, audit logs"],
        ["Manager", "Project leads and team supervisors", "Create projects, approve work, manage team members, view reports, set deadlines"],
        ["Member", "Individual contributors and team members", "Work on assigned tasks, collaborate, chat, upload files, view own activity"],
      ]
    ),

    h2("role-hierarchy", "How Roles Work"),
    p(
      "Roles are hierarchical. This means higher roles include all the capabilities of lower roles:"
    ),
    img("/docs/images/flowdesk-role-inheritance.png", "Diagram showing role inheritance: Admin includes Manager includes Member capabilities", "Roles inherit from lower levels"),
    ordered([
      "<strong>Admins</strong> can do everything a Manager can, plus system-level tasks.",
      "<strong>Managers</strong> can do everything a Member can, plus project and team management.",
      "<strong>Members</strong> can work on assigned tasks and collaborate within their scope.",
    ]),
    p(
      "This hierarchy ensures smooth escalation while keeping access appropriately scoped. A Manager doesn't need Admin access to do their job, but an Admin can step in to handle Manager-level tasks when needed."
    ),

    h2("how-permissions-are-assigned", "How Permissions Are Assigned"),
    p(
      "Your Admin assigns roles when setting up the platform or when onboarding new team members. The process is:"
    ),
    ordered([
      "An Admin creates a new user account or accepts a registration request.",
      "The Admin assigns a role — Admin, Manager, or Member.",
      "The user receives their login credentials and can start using FlowDesk immediately.",
    ]),
    p(
      "If you need a different role, contact your team lead or Admin. For example, if you're a Member who's been promoted to a team lead, you can request a role change to Manager."
    ),
    callout(
      "Only existing Admins can grant the Admin role. This is a security measure to prevent unauthorised access to system-level settings."
    ),

    h2("default-role", "Default Role"),
    p(
      "New users are typically assigned the <strong>Member</strong> role by default. This gives them enough access to start working on tasks and collaborating, without the ability to create projects or manage teams."
    ),
    p(
      "A Manager or Admin can promote a Member to Manager at any time if their responsibilities expand."
    ),
  ],
}, { prev: "canvas", next: "role-permissions" })

define("role-permissions", {
  title: "What You Can Do",
  description: "A quick reference for what each role allows you to do.",
  breadcrumbs: [
    { label: "Docs", slug: "introduction" },
    { label: "Roles & Permissions" },
    { label: "What You Can Do" },
  ],
  lastUpdated: "June 12, 2026",
  readingTime: "5 min read",
  sections: [
    h2("admin-permissions", "Admin Permissions"),
    p("As an Admin, you have full control over the platform. This includes:"),
    img("/docs/images/flowdesk-admin-panel.png", "FlowDesk admin panel showing user management, system settings, and audit logs", "The admin control panel"),
    list([
      ["User Management", "Create, suspend, or delete user accounts. Assign and change roles. Reset passwords. Manage invitations."],
      ["System Settings", "Configure global platform settings, integrations, email templates, and security policies."],
      ["Financial Access", "View billing information, usage statistics, and financial dashboards. Manage subscriptions and payment methods."],
      ["Audit Logs", "View and export all activity logs across every project and team. Essential for compliance and security reviews."],
      ["Platform Configuration", "Set up single sign-on (SSO), configure email providers, manage API keys, and customise the platform."],
      ["Data Management", "Export all platform data, manage backups, and handle data retention policies."],
    ]),
    p(
      "We recommend limiting the number of Admin accounts to essential personnel only. Most day-to-day operations can be handled by Managers."
    ),

    h2("manager-permissions", "Manager Permissions"),
    p("Managers are responsible for driving projects and overseeing teams. Their capabilities include:"),
    img("/docs/images/flowdesk-manager-view.png", "FlowDesk manager dashboard showing project creation, team management, and approval workflows", "A manager's view of FlowDesk"),
    list([
      ["Create Projects", "Start new projects, set deadlines, choose categories, and configure project settings."],
      ["Approve Work", "Review completed tasks, approve them, or send them back for rework if needed."],
      ["Manage Teams", "Add or remove members from projects. Assign roles within projects. View team workload and availability."],
      ["Reports & Analytics", "Generate custom reports for their projects, including burndown charts, velocity trends, and individual contributor summaries."],
      ["Set Priorities", "Assign priority levels to tasks and projects. Adjust priorities as work progresses."],
      ["Manage Deadlines", "Set and modify deadlines for projects and tasks. Extend deadlines when necessary."],
      ["Export Data", "Export project data, reports, and activity logs as CSV or PDF for external use."],
    ]),
    p(
      "Managers have full access to projects they own or are assigned to. They cannot access projects belonging to other teams unless explicitly granted cross-team permissions by an Admin."
    ),

    h2("member-permissions", "Member Permissions"),
    p("Members are the core contributors who execute work within projects:"),
    list([
      ["Task Execution", "View and work on assigned tasks. Update task status, add checkpoints, and mark tasks complete."],
      ["Collaboration", "Participate in project chats, comment on tasks, use the Collaborative Canvas, and mention teammates."],
      ["File Management", "Upload, download, and manage files within assigned projects. Attach files to tasks and share in chat."],
      ["Notifications", "Receive alerts for assignments, mentions, approaching deadlines, and task updates."],
      ["Personal Settings", "Manage their own profile, notification preferences, and appearance settings."],
      ["View Activity", "See activity logs for projects they're assigned to. Understand what changed and when."],
    ]),

    h2("member-scope", "What Members Can't Do"),
    p(
      "Members have a focused scope to keep things simple. They cannot:"
    ),
    list([
      ["Create Projects", "Only Managers and Admins can create new projects."],
      ["Manage Teams", "Members can't add or remove people from projects."],
      ["Access Other Projects", "Members can only see projects they're assigned to."],
      ["Delete Content", "Members can't delete tasks, projects, or files (they can archive instead)."],
      ["Modify Settings", "Project-level and system-level settings are off-limits."],
      ["View Reports", "Analytics and reports are available to Managers and Admins only."],
    ]),
    p(
      "If you need any of these capabilities, talk to your Manager or Admin. They can adjust your role or grant specific permissions as needed."
    ),

    h2("permissions-summary", "Quick Permissions Reference"),
    table(
      ["Action", "Admin", "Manager", "Member"],
      [
        ["Create projects", "Yes", "Yes", "No"],
        ["Delete projects", "Yes", "Yes (own)", "No"],
        ["Manage team members", "Yes", "Yes (own projects)", "No"],
        ["Create tasks", "Yes", "Yes", "Yes (own projects)"],
        ["Assign tasks", "Yes", "Yes", "No"],
        ["Approve tasks", "Yes", "Yes", "No"],
        ["Chat & collaborate", "Yes", "Yes", "Yes"],
        ["Upload files", "Yes", "Yes", "Yes"],
        ["View reports", "Yes", "Yes (own projects)", "No"],
        ["Manage users", "Yes", "No", "No"],
        ["System settings", "Yes", "No", "No"],
        ["Export data", "Yes", "Yes (own projects)", "No"],
      ]
    ),
  ],
}, { prev: "roles" })

export default pages
