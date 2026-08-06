import { useState, useEffect, useCallback } from "react";
import { Menu } from "lucide-react";
import { useGetConfig, getGetConfigQueryKey } from "@workspace/api-client-react";
import HamzawiChat from "@/components/HamzawiChat";
import HamzawiSidebar, { type Conversation } from "@/components/HamzawiSidebar";

const TOKEN_KEY = "postlap_token";
const USER_KEY = "postlap_user";
const GENDER_KEY = "postlap_gender";

interface LocalUser {
  id: number;
  email: string;
  name: string;
  plan: string;
  gender: string | null;
  is_active: boolean;
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function getStoredUser(): LocalUser | null {
  try { return JSON.parse(localStorage.getItem(USER_KEY) ?? "null"); } catch { return null; }
}

export default function HamzawiWorkspace() {
  const { data: config } = useGetConfig({ query: { queryKey: getGetConfigQueryKey() } });

  const [user] = useState<LocalUser | null>(getStoredUser);
  const isAuthenticated = !!user && !!getToken();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);

  const whatsapp = config?.whatsapp ?? "218915811115";
  const gender = (user?.gender ?? localStorage.getItem(GENDER_KEY) ?? null) as "male" | "female" | null;

  // Fetch conversation list — only when authenticated, no polling.
  const fetchConversations = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoadingConversations(true);
    try {
      const res = await fetch("/api/hamzawi/conversations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch {
      console.error("Failed to fetch conversations");
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  // Load conversations on mount (authenticated only).
  useEffect(() => {
    if (isAuthenticated) {
      fetchConversations();
    }
  }, [isAuthenticated, fetchConversations]);

  // --- Conversation mutation handlers ---

  function handleSelect(id: string) {
    setActiveConversationId(id);
  }

  function handleNew() {
    setActiveConversationId(null);
  }

  async function handleRename(id: string, title: string) {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/hamzawi/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        await fetchConversations();
      }
    } catch {
      console.error("Failed to rename conversation");
    }
  }

  async function handleDelete(id: string) {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/hamzawi/conversations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        // If the deleted conversation was active, reset to new chat.
        if (activeConversationId === id) {
          setActiveConversationId(null);
        }
        await fetchConversations();
      }
    } catch {
      console.error("Failed to delete conversation");
    }
  }

  function handleConversationCreated(id: string) {
    setActiveConversationId(id);
    // Refresh sidebar so the new conversation appears.
    fetchConversations();
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden" dir="rtl">

      {/* Sidebar — hidden for unauthenticated users */}
      {isAuthenticated && (
        <HamzawiSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={handleSelect}
          onNew={handleNew}
          onRename={handleRename}
          onDelete={handleDelete}
          visible={sidebarVisible}
          onClose={() => setSidebarVisible(false)}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Workspace header */}
        <header className="shrink-0 border-b border-border bg-black/90 backdrop-blur-md px-4 py-3 flex items-center gap-3">
          {isAuthenticated && (
            <button
              onClick={() => setSidebarVisible(true)}
              className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
              aria-label="فتح القائمة"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <a
            href="/"
            className="text-2xl font-black text-primary tracking-tight hover:opacity-80 transition-opacity"
          >
            PostLap<span className="text-foreground">AI</span>
          </a>
          <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5 hidden sm:inline">
            حمزاوي — مساعدك التسويقي
          </span>
          {!isAuthenticated && (
            <a
              href="/"
              className="mr-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← سجّل الدخول للوصول إلى محادثاتك
            </a>
          )}
        </header>

        {/* Chat fills remaining height */}
        <div className="flex-1 overflow-hidden">
          <HamzawiChat
            embedded
            gender={gender}
            checkResult={null}
            whatsapp={whatsapp}
            userPlan={user?.plan}
            conversationId={activeConversationId}
            onConversationCreated={handleConversationCreated}
          />
        </div>
      </div>
    </div>
  );
}
