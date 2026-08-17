import {
  useState,
  useRef,
  useEffect,
  FC,
  KeyboardEvent,
  ChangeEvent,
} from "react";
import { useLocation } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "user" | "assistant" | "system";

interface ChatMessage {
  role: Role;
  content: string;
}

// interface OllamaResponseChunk {
//   message?: {
//     content?: string;
//   };
//   done?: boolean;
// }

// ─── Constants ────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// FLOWDESK KNOWLEDGE BASE — embedded directly into the system prompt so the
// model has full context without requiring conversation history.
// Update this section whenever a new feature, bug-fix, or module is added.
// ═══════════════════════════════════════════════════════════════════════════════
const FLOWDESK_SYSTEM_PROMPT = `
You are FlowDesk Buddy — the intelligent embedded AI assistant inside FlowDesk,
the internal management platform developed exclusively for Aceone Futuristic (OPC) Private Limited.

You are NOT a general AI chatbot. You are a highly specialized in-app assistant.
Every question the user asks should be assumed to be about FlowDesk unless they explicitly say otherwise.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — PLATFORM OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FlowDesk is a full-stack internal management ecosystem.
It centralises project management, task tracking, real-time communication,
AI assistance, and collaborative tooling into one platform.

Tech stack:
- Frontend: React + TypeScript, Zustand state management, custom Glassmorphism CSS design system
- Backend: Node.js + Express + Mongoose (MongoDB)
- Realtime: Socket.io (chat, notifications, online presence)
- Storage: MongoDB GridFS for secure document/file attachments

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — MODULES IN DETAIL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─── 2A. ASSIGNMENTS (Project Management) ───────────────────────────────────────

Projects are divided into three buckets:

1. Ongoing Work — Active projects currently assigned to teams.
2. Completed — A permanent, immutable archive for history and auditing.
3. Recurring Blueprints — Template-based automation engine.

RECURRING BLUEPRINTS — how they work under the hood:
- A Blueprint is a reusable template (pre-filled tasks, assigned teams, metadata).
- Supported recurrence intervals: Daily, Weekly, Monthly, Yearly.
- When the recurrence window is due, the engine spawns a brand-new project instance
  from the blueprint, automatically pre-populating all tasks and assignments.
- Duplicate prevention: before spawning, the engine checks whether a project for
  the current recurrence window already exists. If yes, it skips spawning.
- Catch-up logic: if the FlowDesk server was offline during a scheduled spawn,
  the engine detects the missed window on next boot and spawns the missed instance.
- This prevents both duplicates and silent skips.

─── 2B. TASK ECOSYSTEM ─────────────────────────────────────────────────────────

Tasks are the granular units of work inside a project.

Task lifecycle states (in order):
  Todo → In Progress → Review → Completed

Task features:
- Subtask checklists: each task supports multi-step sub-items.
- Team ownership: tasks can be assigned to an individual or an entire team.
- No-due-date handling: special logic prevents the Unix Epoch (Jan 1 1970) bug
  that occurs when null dates are passed directly to date constructors.
  FlowDesk instead stores and displays a "No Due Date" state explicitly.

─── 2C. AI BUDDY (this assistant) ──────────────────────────────────────────────

- Embedded AI assistant powered by a local Ollama LLM.
- Assists with: project analysis, deadline forecasting, task description generation,
  technical architecture questions, FlowDesk navigation help.
- Operates in single-turn mode: each message is answered independently using
  the knowledge embedded in this system prompt — no chat history is sent.
- This keeps the payload small and responses fast.

─── 2D. COLLABORATIVE CANVAS ───────────────────────────────────────────────────

A digital whiteboard and note-taking space:
- Post-it style sticky notes for brainstorming.
- Visual workflow organisation.
- Two modes:
  - Personal mode: private drafting, only visible to you.
  - Collaborative mode: shared team session, visible to all team members.

─── 2E. COMMUNICATION & NOTIFICATIONS ──────────────────────────────────────────

- Real-time project chat rooms: every project gets a dedicated Socket.io chat room.
- Activity logs: a comprehensive audit trail of every change to a project or task.
- Dynamic notifications: in-app alerts for new assignments, @mentions, and
  approaching deadlines.
- Online/offline presence: a green dot system showing which colleagues are active
  (detailed explanation in Section 4).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — ROLE-BASED ACCESS CONTROL (RBAC)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Three roles exist:

Admin:
- Full system control
- Access to financial reports
- User management (create, edit, deactivate accounts)
- Global system settings

Manager:
- Oversees specific teams
- Creates and manages assignments
- Approves completed work

Member:
- Task execution and status updates
- Collaboration within assigned projects
- Cannot create projects or manage users

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — ONLINE/OFFLINE PRESENCE SYSTEM (deep dive)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is one of the most commonly asked-about technical systems. Here is the complete
explanation of how it works under the hood.

HOW PRESENCE IS DETECTED:
1. When a user opens FlowDesk or focuses their browser tab, the frontend emits a
   Socket.io event to the server: { userId, status: "online" }.
2. When a user closes the tab, navigates away, or goes idle, the frontend emits:
   { userId, status: "offline" }.
3. The backend receives the event, updates the user's status in memory/DB,
   and broadcasts it to ALL connected clients.

THE SELF-BROADCAST PROBLEM (and the bug it caused):
- Every client receives every status broadcast — including broadcasts about themselves.
- Before the fix: when Deepak (the logged-in user) came online, the app received
  a broadcast saying "userId: Deepak's ID is now online".
- The store logic naively searched all sidebar conversations for a participant
  matching that ID. Since Deepak is a participant in EVERY chat on his sidebar,
  every single conversation turned green — even though all colleagues were offline.

THE FIX — currentUserId exclusion filter:
The status change handler receives three arguments:
  handleUserStatusChange(userId, status, currentUserId)

  - userId: the ID of whoever just changed status (could be anyone)
  - status: "online" or "offline"
  - currentUserId: YOUR own logged-in user ID (from Zustand AuthStore)

Inside chatStore.ts, the filtering logic is:
  const otherParticipant = c.participants.find(
    p => p._id === userId && p._id !== currentUserId
  );

This means: only update a chat's green dot if the status change belongs to
the OTHER person in that chat, not yourself.

Scenario A — colleague Jane goes online:
  userId = Jane's ID, currentUserId = Deepak's ID
  → p._id === userId: true (Jane matches)
  → p._id !== currentUserId: true (Jane ≠ Deepak)
  → otherParticipant found → Jane's chat turns green ✅

Scenario B — Deepak himself goes online:
  userId = Deepak's ID, currentUserId = Deepak's ID
  → p._id === userId: true (Deepak matches)
  → p._id !== currentUserId: false (Deepak === Deepak)
  → otherParticipant NOT found → no chats change ✅

The fix relies on Zustand's AuthStore always having the current session's user ID
available as a stable, synchronously readable reference — no async, no prop-drilling.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — HOW TO ANSWER QUESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STYLE RULES:
1. Be concise first. Expand only if the user asks for more detail.
2. Speak like a premium SaaS assistant — helpful, clear, professional but warm.
3. Use bullet points for workflows or step-by-step explanations.
4. When asked "how does X work" or "what is happening under the hood", always explain:
   - frontend flow
   - backend/server flow
   - Socket.io events (if realtime is involved)
   - Zustand state updates (if state management is involved)
   - database involvement (if persistence is involved)
   - why the logic exists (the problem it solves)
   - any important edge cases
5. Use concrete examples with realistic names (e.g. "Deepak", "Jane") when explaining
   multi-user flows.
6. Never invent FlowDesk features, APIs, schemas, or permissions that are not described
   in this system prompt.
7. If a feature is not covered in this prompt, say:
   "That functionality does not currently appear to exist in FlowDesk, or I may not
    have information about it yet."
8. If the user asks something entirely unrelated to FlowDesk:
   "I'm specialised in FlowDesk and its internal systems. For broader topics, a
    general-purpose AI assistant would serve you better."

NEVER:
- Hallucinate APIs or endpoints
- Invent database schemas
- Fabricate module names or permission levels
- Pretend a feature exists if it is not documented above

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6 — SINGLE-TURN OPERATION NOTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You operate in single-turn mode. Each user message is answered independently.
You do NOT have memory of previous messages in this chat session.
If the user refers to something said earlier ("as I mentioned", "the thing we discussed"),
politely clarify:
  "I work in single-turn mode and don't retain previous messages. Could you briefly
   restate the context? I'm happy to help."
`;

// const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const OLLAMA_URL =
  "https://punk-nottingham-floating-trailer.trycloudflare.com/api/buddy/ollama";
// const DEFAULT_MODEL = "qwen2.5-coder:1.5b-base";
const DEFAULT_MODEL = "qwen2.5-coder:1.5b-instruct";

const SUGGESTIONS: string[] = [
  "How do Recurring Blueprints work?",
  "What's the difference between roles?",
  "How does real-time presence detection work?",
  "How do I track task progress?",
  "What is the Collaborative Canvas?",
];

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Hey! I'm FlowDesk Buddy 👋\n\nI'm here to help you navigate FlowDesk.\n\nI answer each question using built-in FlowDesk knowledge — no need to repeat context from earlier messages.",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const TypingIndicator: FC = () => (
  <div
    style={{
      display: "flex",
      gap: 4,
      alignItems: "center",
      padding: "12px 16px",
    }}
  >
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#94a3b8",
          animation: "bounce 1.2s infinite",
          animationDelay: `${i * 0.2}s`,
        }}
      />
    ))}
  </div>
);

interface MessageProps {
  msg: ChatMessage;
}

const Message: FC<MessageProps> = ({ msg }) => {
  const isUser = msg.role === "user";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 12,
        gap: 8,
        alignItems: "flex-start",
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: 13,
            color: "#fff",
            fontWeight: 600,
            marginTop: 2,
          }}
        >
          F
        </div>
      )}

      <div
        style={{
          maxWidth: "75%",
          padding: "10px 14px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isUser
            ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
            : "rgba(255,255,255,0.06)",
          color: isUser ? "#fff" : "#e2e8f0",
          fontSize: 14,
          lineHeight: 1.6,
          border: isUser ? "none" : "1px solid rgba(255,255,255,0.08)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {msg.content}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const FlowDeskBuddy: FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [model] = useState<string>(DEFAULT_MODEL);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  // const [showSettings] = useState<boolean>(false);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isMinimized] = useState<boolean>(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, isLoading]);

  const sendMessage = async (text?: string): Promise<void> => {
    const userText = (text ?? input).trim();
    if (!userText || isLoading) return;

    setInput("");
    setOllamaError(null);

    // ─── SINGLE-TURN: append to display list but only send current message to LLM ───
    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    setIsLoading(true);
    setStreamingContent("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: false,
          // ── Only system prompt + current user message. No history. ──────────
          messages: [
            {
              role: "system",
              content: FLOWDESK_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: userText,
            },
          ],
        }),
      });

      if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
      if (!response.body) throw new Error("No response body from Ollama");

      const data = (await response.json()) as any;
      const fullContent = data.message?.content || "";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: fullContent },
      ]);
      setStreamingContent("");

      // const reader = response.body.getReader();
      // const decoder = new TextDecoder();
      // let fullContent = "";

      // while (true) {
      //   const { done, value } = await reader.read();
      //   if (done) break;

      //   const chunk = decoder.decode(value, { stream: true });
      //   const lines = chunk.split("\n").filter(Boolean);

      //   for (const line of lines) {
      //     try {
      //       const parsed: OllamaResponseChunk = JSON.parse(line);
      //       if (parsed.message?.content) {
      //         fullContent += parsed.message.content;
      //         setStreamingContent(fullContent);
      //       }
      //     } catch {
      //       // malformed chunk — skip
      //     }
      //   }
      // }

      // setMessages((prev) => [
      //   ...prev,
      //   { role: "assistant", content: fullContent },
      // ]);
      // setStreamingContent("");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;

      const message =
        err instanceof Error ? err.message : "Unknown error occurred";

      setOllamaError(
        message.includes("fetch") || message.includes("Failed")
          ? "Cannot reach FlowDesk Buddy service" // ← change this
          : `Ollama error: ${message}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const stopGeneration = (): void => {
    abortRef.current?.abort();
    setIsLoading(false);
    if (streamingContent) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: streamingContent },
      ]);
      setStreamingContent("");
    }
  };

  const clearChat = (): void => {
    setMessages([
      { role: "assistant", content: "Chat cleared! I'm still here to help." },
    ]);
    setOllamaError(null);
  };

  const handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // if route is /chat or /chat/user then return null
  const location = useLocation();
  if (location.pathname === "/chat" || location.pathname === "/canvas") {
    return null;
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; }

        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .msg-enter { animation: fadeIn 0.2s ease; }

        .buddy-floating-btn {
          position: fixed; bottom: 24px; right: 24px;
          width: 62px; height: 62px; border-radius: 50%; border: none;
          cursor: pointer; z-index: 9999;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white; font-size: 26px;
          box-shadow: 0 10px 30px rgba(99,102,241,0.35), 0 0 0 1px rgba(255,255,255,0.08);
          transition: all 0.2s ease;
        }
        .buddy-floating-btn:hover { transform: translateY(-2px) scale(1.03); }

        .buddy-window {
          position: fixed; bottom: 24px; right: 24px;
          width: 400px; height: 720px; max-height: calc(100vh - 48px);
          border-radius: 24px; overflow: hidden; z-index: 9999;
          box-shadow: 0 25px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06);
          animation: fadeUp 0.25s ease;
        }
        .buddy-window.minimized { height: 72px; }
        .buddy-window.minimized .messages-area,
        .buddy-window.minimized .input-area,
        .buddy-window.minimized .suggestions,
        .buddy-window.minimized .settings-panel,
        .buddy-window.minimized .error-banner { display: none; }

        .buddy-root {
          width: 100%; height: 100%; display: flex; flex-direction: column;
          background: #0f1117; color: #e2e8f0; position: relative; overflow: hidden;
        }

        .header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          background: rgba(15,17,23,0.95); backdrop-filter: blur(10px);
          flex-shrink: 0; z-index: 10;
        }
        .header-left { display: flex; align-items: center; gap: 10px; }
        .avatar {
          width: 34px; height: 34px; border-radius: 10px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 15px; color: #fff;
        }
        .header-title { font-size: 15px; font-weight: 600; color: #f1f5f9; }
        .header-sub { font-size: 12px; color: #64748b; margin-top: 1px; }
        .header-actions { display: flex; gap: 6px; }
        .icon-btn {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: #94a3b8; border-radius: 8px;
          width: 32px; height: 32px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; font-size: 15px;
        }

        .single-turn-badge {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 14px;
          background: rgba(99,102,241,0.08);
          border-bottom: 1px solid rgba(99,102,241,0.15);
          font-size: 11px; color: #818cf8; flex-shrink: 0;
        }
        .badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #6366f1; }

        .messages-area { flex: 1; overflow-y: auto; padding: 20px 20px 8px; }

        .suggestions { display: flex; flex-wrap: wrap; gap: 7px; padding: 0 20px 14px; }
        .suggestion-chip {
          background: rgba(99,102,241,0.1);
          border: 1px solid rgba(99,102,241,0.25);
          color: #a5b4fc; padding: 5px 11px; border-radius: 20px;
          font-size: 12px; cursor: pointer;
        }

        .input-area {
          display: flex; align-items: flex-end; gap: 10px;
          padding: 12px 20px 18px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .input-wrap {
          flex: 1; background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 14px;
          display: flex; align-items: flex-end; padding: 2px 4px 2px 14px;
        }
        .input-wrap textarea {
          flex: 1; background: transparent; border: none; outline: none;
          color: #e2e8f0; font-size: 14px; resize: none;
          line-height: 1.5; padding: 9px 0; max-height: 120px;
        }
        .send-btn {
          width: 34px; height: 34px; border-radius: 10px; border: none;
          cursor: pointer; display: flex; align-items: center;
          justify-content: center; margin-bottom: 3px;
        }
        .send-btn.active { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; }
        .send-btn.stop { background: rgba(239,68,68,0.15); color: #f87171; }

        .error-banner {
          margin: 0 16px 8px; padding: 10px 14px; border-radius: 10px;
          background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.25);
          color: #fca5a5; font-size: 12px;
        }

        @media (max-width: 640px) {
          .buddy-window {
            width: calc(100vw - 24px); height: calc(100vh - 24px);
            bottom: 12px; right: 12px; border-radius: 20px;
          }
          .buddy-floating-btn { bottom: 18px; right: 18px; }
        }
      `}</style>

      {/* Floating Open Button */}
      {!isOpen && (
        <button className="buddy-floating-btn" onClick={() => setIsOpen(true)}>
          💬
        </button>
      )}

      {/* Floating Chat Window */}
      {isOpen && (
        <div className={`buddy-window ${isMinimized ? "minimized" : ""}`}>
          <div className="buddy-root">
            {/* Header */}
            <div className="header">
              <div className="header-left">
                {/* <div className="avatar">F</div> */}
                <div>
                  <div
                    className={`header-title ${isMinimized ? "hidden" : ""}`}
                  >
                    FlowDesk Buddy
                  </div>
                  {/* <div className="header-sub">Powered by Ollama <br /> {model}</div> */}
                </div>
              </div>
              <div className="header-actions">
                {/* <button className="icon-btn" onClick={() => setIsMinimized((m) => !m)}>
                  {isMinimized ? "▢" : "—"}
                  </button> */}
                <button className="icon-btn" onClick={clearChat}>
                  ⟳
                </button>
                <button className="icon-btn" onClick={() => setIsOpen(false)}>
                  ✕
                </button>
                {/* <button className="icon-btn" onClick={() => setShowSettings((s) => !s)}>⚙</button> */}
              </div>
            </div>

            {/* Single-turn mode badge */}
            {/* <div className="single-turn-badge">
              <div className="badge-dot" />
              Single-turn mode — each message answered from built-in FlowDesk knowledge
            </div> */}

            {/* Settings */}
            {/* {showSettings && (
              <div className="settings-panel" style={{ padding: 20, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Ollama model</div>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={{
                    width: "100%", padding: 10, borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.05)", color: "#fff",
                    fontSize: 13,
                  }}
                />
              </div>
            )} */}

            {/* Error banner */}
            {ollamaError && <div className="error-banner">⚠ {ollamaError}</div>}

            {/* Messages */}
            <div className="messages-area">
              {messages.map((msg, i) => (
                <div key={i} className="msg-enter">
                  <Message msg={msg} />
                </div>
              ))}
              {isLoading && !streamingContent && <TypingIndicator />}
              {streamingContent && (
                <div className="msg-enter">
                  <Message
                    msg={{ role: "assistant", content: streamingContent }}
                  />
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick suggestions (show only at start) */}
            {messages.length <= 1 && (
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="suggestion-chip"
                    onClick={() => sendMessage(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="input-area">
              <div className="input-wrap">
                <textarea
                  ref={inputRef}
                  rows={1}
                  placeholder="Ask me anything about FlowDesk..."
                  value={input}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                />
              </div>
              {isLoading ? (
                <button className="send-btn stop" onClick={stopGeneration}>
                  ■
                </button>
              ) : (
                <button
                  className={`send-btn ${input.trim() ? "active" : ""}`}
                  onClick={() => sendMessage()}
                  disabled={!input.trim()}
                >
                  ↑
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FlowDeskBuddy;
