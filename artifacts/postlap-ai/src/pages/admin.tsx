import { useState, type ReactNode } from "react";
import { useParams } from "wouter";
import { Loader2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_TOKEN_KEY } from "@/lib/admin-shared";
import AdminLayout from "@/components/admin/AdminLayout";
import PlaceholderPage from "@/components/admin/PlaceholderPage";
import Dashboard from "./admin/dashboard";
import Users from "./admin/users";
import Subscriptions from "./admin/subscriptions";
import Hamzawi from "./admin/hamzawi";
import Platform from "./admin/platform";

const PLACEHOLDER_SECTIONS: Record<string, { title: string; description: string }> = {
  companies: {
    title: "الشركات",
    description: "قائمة الشركات المسجلة، بيانات كل شركة، وعدد المستخدمين المرتبطين بها.",
  },
  conversations: {
    title: "المحادثات",
    description: "استعراض محادثات المستخدمين مع مساعد المنصة، الأرشفة، والبحث فيها.",
  },
  images: {
    title: "الصور",
    description: "استعراض الأصول الوسائطية والصور المولّدة عبر المنصة وإدارتها.",
  },
  ai: {
    title: "الذكاء الاصطناعي",
    description: "متابعة استهلاك النماذج، التكاليف، والاستدلالات عبر مساعد المنصة.",
  },
  analytics: {
    title: "التحليلات",
    description: "مخططات ولوحات تحليلية متقدمة لنمو المستخدمين واستخدام الفحوصات.",
  },
  activity: {
    title: "النشاط",
    description: "سجل شامل لأحداث المنصة: تسجيلات دخول، فحوصات، وتعديلات الاشتراكات.",
  },
  settings: {
    title: "الإعدادات",
    description: "إدارة إعدادات المنصة العامة، الخطط، والأمان.",
  },
};

const SECTION_COMPONENTS: Record<string, () => ReactNode> = {
  dashboard: () => <Dashboard />,
  users: () => <Users />,
  subscriptions: () => <Subscriptions />,
  hamzawi: () => <Hamzawi />,
  platform: () => <Platform />,
};

export default function Admin() {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(ADMIN_TOKEN_KEY));
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const params = useParams();
  const rawSection = (params.section ?? "dashboard").toLowerCase();
  const section = Object.keys(SECTION_COMPONENTS).includes(rawSection) || Object.keys(PLACEHOLDER_SECTIONS).includes(rawSection)
    ? rawSection
    : "dashboard";

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: "خطأ", description: data.error, variant: "destructive" }); return; }
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setToken(data.token);
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setLoginLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken(null);
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
        <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ShieldAlert className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-xl font-black text-foreground">لوحة تحكم المالك</h1>
            <p className="text-sm text-muted-foreground text-center">أدخل كلمة السر للوصول</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة السر"
              className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-right"
              data-testid="input-admin-password"
            />
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              data-testid="button-admin-login"
            >
              {loginLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              دخول
            </button>
          </form>
          <a href="/" className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
            العودة للرئيسية
          </a>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout active={section} onLogout={logout}>
      {SECTION_COMPONENTS[section]
        ? SECTION_COMPONENTS[section]()
        : <PlaceholderPage title={PLACEHOLDER_SECTIONS[section].title} description={PLACEHOLDER_SECTIONS[section].description} />}
    </AdminLayout>
  );
}
