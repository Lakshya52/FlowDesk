import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Sparkles,
  Paperclip,
  Mic,
  ArrowUp,
  FolderKanban,
  Layers,
  Kanban,
  LayoutGrid,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";

interface AiDashboardWrapperProps {
  children: React.ReactNode;
}

/**
 * AiDashboardWrapper — AI-connected hero placed ABOUT (above) the dashboard.
 *
 * Usage (App.tsx only, DashboardPage + Sidebar stay untouched):
 *   <AiDashboardWrapper><DashboardPage /></AiDashboardWrapper>
 *
 * - Bleeds over AppLayout's main padding so the black orb hero is edge-to-edge.
 * - Hero is always dark (#060609) so /orbWithGlow.png glows, in any theme.
 * - Content sheet below respects the app theme vars, so existing cards,
 *   Recent Activity, Task Breakdown, My Teams render unchanged.
 */
const AiDashboardWrapper: React.FC<AiDashboardWrapperProps> = ({ children }) => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [command, setCommand] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const firstName = useMemo(() => {
    const full = user?.name?.trim() || "";
    return full ? full.split(" ")[0] : "there";
  }, [user?.name]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    return "Good Evening";
  }, []);

  const openBuddyWith = (prompt: string) => {
    window.dispatchEvent(
      new CustomEvent("flowdesk:open-buddy", { detail: { prompt } })
    );
  };

  const routeForCommand = (raw: string): string | null => {
    const q = raw.toLowerCase();
    if (/(project|assign)/.test(q)) return "/assignments";
    if (/(sprint|board)/.test(q)) return "/boards";
    if (/(kanban|task)/.test(q)) return "/tasks";
    if (/(canvas|note|idea|brainstorm)/.test(q)) return "/canvas";
    if (/(team|member)/.test(q)) return "/teams";
    if (/(report|workload|performance|health)/.test(q)) return "/reports/employee";
    if (/(calendar|schedule|event|meeting)/.test(q)) return "/calendar";
    if (/(client|compan)/.test(q)) return "/clients";
    if (/(chat|message)/.test(q)) return "/chat";
    if (/(crm|lead|campaign|deal)/.test(q)) return "/crm/dashboard";
    return null;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = command.trim();
    if (!text) return;
    const dest = routeForCommand(text);
    if (dest) {
      navigate(dest);
      toast.success(`Taking you to ${text}`, { duration: 1800 });
      setCommand("");
      return;
    }
    // Anything else → FlowDesk Buddy (AI). Buddy listens for this event.
    openBuddyWith(text);
    toast.success("Asking FlowDesk Buddy…", { duration: 1800 });
    setCommand("");
  };

  const handleMic = () => {
    const SR: any =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice input is not supported in this browser");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop?.();
      setListening(false);
      return;
    }
    try {
      const rec = new SR();
      recognitionRef.current = rec;
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.onresult = (ev: any) => {
        const transcript = ev.results?.[0]?.[0]?.transcript || "";
        if (transcript) setCommand(transcript);
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      rec.start();
      setListening(true);
    } catch {
      toast.error("Could not start voice input");
    }
  };

  const quickActions = [
    { label: "Projects", to: "/assignments", Icon: FolderKanban },
    { label: "Sprints", to: "/boards", Icon: Layers },
    { label: "Kanbans", to: "/tasks", Icon: Kanban },
    { label: "Canvas", to: "/canvas", Icon: LayoutGrid },
  ];

  return (
    <div className="ai-dash-root">
      <style>{`
        .ai-dash-root {
          margin: -24px -32px -32px;
        }
        @media (max-width: 768px) {
          .ai-dash-root { margin: -16px -16px -16px; }
        }
        @keyframes aiOrbFloat {
          0%, 100% { transform: translateX(-50%) translateY(0) scale(1); }
          50% { transform: translateX(-50%) translateY(-12px) scale(1.015); }
        }
        @keyframes aiOrbGlow {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; }
        }
        @keyframes aiOrbSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes aiHeroIn {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ai-hero-enter { animation: aiHeroIn 0.55s cubic-bezier(0.22,1,0.36,1) both; }
        .ai-hero-enter-d1 { animation-delay: 0.06s; }
        .ai-hero-enter-d2 { animation-delay: 0.14s; }
        .ai-hero-enter-d3 { animation-delay: 0.22s; }
        .ai-pill { transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease; }
        .ai-pill:hover { background: rgba(255,255,255,0.10) !important; border-color: rgba(255,255,255,0.22) !important; transform: translateY(-1px); }
        .ai-cmd:focus-within { border-color: rgba(167,139,250,0.55) !important; box-shadow: 0 0 0 3px rgba(139,92,246,0.22), 0 8px 32px rgba(0,0,0,0.5) !important; }
        .ai-mic-live { background: rgba(239,68,68,0.22) !important; border-color: rgba(239,68,68,0.5) !important; color: #fca5a5 !important; }
      `}</style>

      {/* ── AI HERO (always black so the orb glows) ─────────────────── */}
      <section
        style={{
          position: "relative",
          background: "#060609",
          overflow: "hidden",
          padding: "56px 20px 170px",
          textAlign: "center",
        }}
      >
        {/* soft top vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(60% 45% at 50% 0%, rgba(139,92,246,0.14), transparent 70%)",
          }}
        />

        {/* Orb */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: 72,
            width: "min(820px, 130vw)",
            transform: "translateX(-50%)",
            animation: "aiOrbFloat 7s ease-in-out infinite, aiOrbGlow 5s ease-in-out infinite",
            pointerEvents: "none",
          }}
        >
          <div style={{ animation: "aiOrbSpin 40s linear infinite" }}>
            <img
              src="/orbWithGlow.png"
              alt=""
              draggable={false}
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                userSelect: "none",
                borderRadius: "50%",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black 62%, transparent 98%)",
                maskImage:
                  "linear-gradient(to bottom, black 62%, transparent 98%)",
              }}
            />
          </div>
        </div>

        {/* Copy */}
        <div style={{ position: "relative", zIndex: 2 }}>
          <h1
            className="ai-hero-enter"
            style={{
              color: "#fff",
              fontSize: "clamp(1.5rem, 3.4vw, 2rem)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            {greeting}, {firstName}
          </h1>
          <p
            className="ai-hero-enter ai-hero-enter-d1"
            style={{
              color: "rgba(255,255,255,0.72)",
              fontSize: "0.875rem",
              margin: "6px 0 0",
              fontWeight: 500,
            }}
          >
            FlowDesk Buddy is here to help
          </p>

          {/* Command bar */}
          <form
            onSubmit={handleSubmit}
            className="ai-hero-enter ai-hero-enter-d2 ai-cmd"
            style={{
              margin: "26px auto 0",
              maxWidth: 640,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(16,16,22,0.92)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: "6px 8px 6px 14px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              backdropFilter: "blur(10px)",
            }}
          >
            <Sparkles size={17} color="rgba(255,255,255,0.55)" style={{ flexShrink: 0 }} />
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Command what to do"
              aria-label="Ask FlowDesk Buddy or type a command"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#fff",
                fontSize: "0.875rem",
                minWidth: 0,
              }}
            />
            {command.trim() && (
              <button
                type="submit"
                title="Run command"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                <ArrowUp size={15} />
              </button>
            )}
            <button
              type="button"
              title="Attach (coming soon)"
              onClick={() => toast("Attachments are coming soon to Buddy", { duration: 1800 })}
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                color: "rgba(255,255,255,0.6)",
                flexShrink: 0,
              }}
            >
              <Paperclip size={16} />
            </button>
            <button
              type="button"
              title={listening ? "Stop listening" : "Voice command"}
              onClick={handleMic}
              className={listening ? "ai-mic-live" : ""}
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                border: "1px solid transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                color: "rgba(255,255,255,0.6)",
                flexShrink: 0,
              }}
            >
              <Mic size={16} />
            </button>
          </form>

          {/* Quick pills */}
          <div
            className="ai-hero-enter ai-hero-enter-d3"
            style={{
              margin: "14px auto 0",
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 10,
              maxWidth: 640,
            }}
          >
            {quickActions.map(({ label, to, Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => navigate(to)}
                className="ai-pill"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 20px",
                  borderRadius: 999,
                  background: "rgba(16,16,22,0.92)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.82)",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* bottom fade into sheet */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 70,
            background: "linear-gradient(to bottom, transparent, rgba(6,6,9,0.9))",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      </section>

      {/* ── CONTENT SHEET (theme-aware, DashboardPage renders untouched) ── */}
      <section
        style={{
          position: "relative",
          zIndex: 2,
          marginTop: -44,
          background: "var(--color-bg)",
          borderTop: "1px solid rgba(139,92,246,0.28)",
          borderRadius: "24px 24px 0 0",
          boxShadow: "0 -12px 48px rgba(139,92,246,0.25)",
          padding: "20px 20px 8px",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>{children}</div>
      </section>
    </div>
  );
};

export default AiDashboardWrapper;
