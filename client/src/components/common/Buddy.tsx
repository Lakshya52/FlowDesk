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

// ─── Constants ────────────────────────────────────────────────────────────────

const BUDDY_API_URL = "/api/buddy/rag/stream";

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
  const [ollamaError, setOllamaError] = useState<string | null>(null);
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

    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    setIsLoading(true);
    setStreamingContent("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = localStorage.getItem("flowdesk_token");
      const response = await fetch(BUDDY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          message: userText,
          path: location.pathname,
          context: {
            title: document.title,
            header: document.querySelector("h1")?.textContent || "",
          },
        }),
      });

      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullContent += parsed.content;
              setStreamingContent(fullContent);
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: fullContent },
      ]);
      setStreamingContent("");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;

      const message =
        err instanceof Error ? err.message : "Unknown error occurred";

      setOllamaError(
        message.includes("fetch") || message.includes("Failed")
          ? "Cannot reach FlowDesk Buddy service"
          : `Buddy error: ${message}`,
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
        .buddy-root, .buddy-window, .buddy-floating-btn { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }

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
