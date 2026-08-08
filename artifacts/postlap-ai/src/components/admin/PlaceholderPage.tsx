import { Rocket } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-4 min-h-[50vh]">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Rocket className="w-7 h-7 text-primary" />
      </div>
      <h2 className="text-xl font-black text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-md leading-relaxed">{description}</p>
      <span className="text-xs text-primary border border-primary/20 bg-primary/5 rounded-full px-3 py-1">
        قريباً في النسخة القادمة
      </span>
    </section>
  );
}
