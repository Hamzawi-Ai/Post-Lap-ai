import { useEffect, useState } from "react";
import type { OwnerInsights } from "@/lib/admin-shared";

export function useOwnerInsights(token: string | null) {
  const [insights, setInsights] = useState<OwnerInsights | null>(null);
  const [loading, setLoading] = useState(false);

  async function reload(t: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/owner/assistant/overview", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok) setInsights(data);
    } catch {
      console.error("Failed to load owner insights");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) reload(token);
  }, [token]);

  return { insights, loading, reload };
}
