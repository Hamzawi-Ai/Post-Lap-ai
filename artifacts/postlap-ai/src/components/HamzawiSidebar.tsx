import { useState, useRef, useEffect } from "react";
import { Plus, Pencil, Trash2, Check, X, MessageSquare, Menu } from "lucide-react";

export interface Conversation {
  id: number;
  title: string;
  last_message_at: string | null;
  created_at: string;
}

interface HamzawiSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  /** Whether the sidebar is shown (mobile toggle) */
  visible: boolean;
  onClose: () => void;
}

export default function HamzawiSidebar({
  conversations,
  activeConversationId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  visible,
  onClose,
}: HamzawiSidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  function startRename(id: string, currentTitle: string) {
    setRenamingId(id);
    setRenameValue(currentTitle);
    setDeleteConfirmId(null);
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  function confirmDelete(id: string) {
    setDeleteConfirmId(id);
    setRenamingId(null);
  }

  function commitDelete(id: string) {
    onDelete(id);
    setDeleteConfirmId(null);
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "أمس";
    if (diffDays < 7) return `${diffDays} أيام`;
    return d.toLocaleDateString("ar", { month: "short", day: "numeric" });
  }

  return (
    <>
      {/* Mobile overlay */}
      {visible && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed top-0 bottom-0 right-0 z-40 w-72 bg-card border-l border-border flex flex-col
          transition-transform duration-200
          lg:static lg:translate-x-0 lg:z-auto lg:shrink-0
          ${visible ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
        `}
        dir="rtl"
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-black text-primary">
              P
            </div>
            <span className="font-bold text-foreground text-sm">PostLab</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
            aria-label="إغلاق القائمة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New Chat button */}
        <div className="p-3 shrink-0">
          <button
            onClick={() => { onNew(); onClose(); }}
            className="w-full flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4 shrink-0" />
            محادثة جديدة
          </button>
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-40" />
              لا توجد محادثات بعد
            </div>
          ) : (
            <ul className="p-2 space-y-0.5">
              {conversations.map((conv) => {
                const id = String(conv.id);
                const isActive = id === activeConversationId;
                const isRenaming = renamingId === id;
                const isDeleteConfirm = deleteConfirmId === id;

                return (
                  <li key={id}>
                    <div
                      className={`group relative flex items-start gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                        isActive
                          ? "bg-primary/10 border border-primary/20"
                          : "hover:bg-muted/50 border border-transparent"
                      }`}
                      onClick={() => {
                        if (!isRenaming && !isDeleteConfirm) {
                          onSelect(id);
                          onClose();
                        }
                      }}
                      onDoubleClick={() => startRename(id, conv.title)}
                    >
                      {isRenaming ? (
                        <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") cancelRename();
                            }}
                            className="flex-1 text-xs bg-background border border-border rounded-lg px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 min-w-0"
                            maxLength={80}
                          />
                          <button onClick={commitRename} className="text-primary hover:text-primary/80 shrink-0">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={cancelRename} className="text-muted-foreground hover:text-foreground shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : isDeleteConfirm ? (
                        <div className="flex-1 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <p className="text-xs text-destructive font-semibold">حذف هذه المحادثة؟</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => commitDelete(id)}
                              className="flex-1 text-xs bg-destructive text-destructive-foreground rounded-lg py-1 font-semibold hover:opacity-90 transition-opacity"
                            >
                              حذف
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="flex-1 text-xs bg-muted border border-border text-foreground rounded-lg py-1 hover:bg-muted/80 transition-colors"
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium truncate ${isActive ? "text-primary" : "text-foreground"}`}>
                              {conv.title}
                            </p>
                            {(conv.last_message_at || conv.created_at) && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {formatDate(conv.last_message_at ?? conv.created_at)}
                              </p>
                            )}
                          </div>
                          {/* Action buttons — shown on hover or active */}
                          <div className={`flex items-center gap-0.5 shrink-0 transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                            <button
                              onClick={(e) => { e.stopPropagation(); startRename(id, conv.title); }}
                              title="إعادة التسمية"
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); confirmDelete(id); }}
                              title="حذف"
                              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border shrink-0">
          <a
            href="/"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← العودة للرئيسية
          </a>
        </div>
      </aside>
    </>
  );
}
