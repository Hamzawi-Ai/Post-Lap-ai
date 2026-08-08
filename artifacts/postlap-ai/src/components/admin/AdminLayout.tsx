import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  LayoutDashboard, Users, Building2, MessageSquare, Image as ImageIcon,
  Sparkles, CreditCard, BarChart3, Server, Activity, Bot, Settings,
  Menu, X, LogOut, ShieldAlert,
} from "lucide-react";

export const NAV_ITEMS = [
  { key: "dashboard", label: "لوحة المعلومات", icon: LayoutDashboard },
  { key: "users", label: "المستخدمون", icon: Users },
  { key: "companies", label: "الشركات", icon: Building2 },
  { key: "conversations", label: "المحادثات", icon: MessageSquare },
  { key: "images", label: "الصور", icon: ImageIcon },
  { key: "ai", label: "الذكاء الاصطناعي", icon: Sparkles },
  { key: "subscriptions", label: "الاشتراكات", icon: CreditCard },
  { key: "analytics", label: "التحليلات", icon: BarChart3 },
  { key: "platform", label: "المنصة", icon: Server },
  { key: "activity", label: "النشاط", icon: Activity },
  { key: "hamzawi", label: "حمزاوي", icon: Bot },
  { key: "settings", label: "الإعدادات", icon: Settings },
];

interface AdminLayoutProps {
  active: string;
  onLogout: () => void;
  children: ReactNode;
}

export default function AdminLayout({ active, onLogout, children }: AdminLayoutProps) {
  const [open, setOpen] = useState(false);
  const current = NAV_ITEMS.find((n) => n.key === active);
  const title = current?.label ?? "لوحة التحكم";

  return (
    <div className="min-h-screen bg-background text-foreground flex" dir="rtl">
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 bottom-0 right-0 z-40 w-64 bg-card border-l border-border flex flex-col
          transition-transform duration-200
          lg:static lg:translate-x-0 lg:z-auto lg:shrink-0 lg:h-screen
          ${open ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            <span className="font-black text-foreground">PostLapAI</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
            aria-label="إغلاق القائمة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={`/khtfa-secure-portal/${item.key}`}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors border ${
                active === item.key
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border-transparent"
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border shrink-0">
          <a href="/" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← العودة للرئيسية
          </a>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top navigation */}
        <header className="sticky top-0 z-20 bg-black/90 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
            aria-label="فتح القائمة"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-black text-foreground">{title}</h1>
          <div className="mr-auto flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-primary hover:underline"
              data-testid="button-refresh-users"
            >
              تحديث
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-admin-logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              خروج
            </button>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 p-4 lg:p-6 w-full max-w-6xl mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}
