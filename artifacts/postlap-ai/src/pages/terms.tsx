import { Link } from "wouter";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <header className="border-b border-border bg-black/80 backdrop-blur px-6 py-4">
        <Link href="/" className="text-primary font-bold text-lg">PostLapAI</Link>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <h1 className="text-3xl font-black">الشروط والأحكام</h1>
        <p className="text-muted-foreground">آخر تحديث: يوليو 2026</p>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">القبول بالشروط</h2>
          <p className="leading-relaxed text-muted-foreground">
            باستخدام منصة PostLapAI، فإنك توافق على هذه الشروط والأحكام. إذا كنت لا توافق على أي جزء من هذه الشروط، يجب عليك التوقف عن استخدام المنصة.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">الخدمات المقدمة</h2>
          <p className="leading-relaxed text-muted-foreground">
            PostLapAI هي منصة ذكاء اصطناعي لفحص الإعلانات ومطابقتها مع سياسات Meta. تشمل خدماتنا فحص الصور والفيديو، توليد النصوص الإعلانية باللهجة الليبية، توليد الصور عبر الذكاء الاصطناعي، والمساعد الذكي حمزاوي.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">حسابات المستخدمين</h2>
          <p className="leading-relaxed text-muted-foreground">
            أنت مسؤول عن الحفاظ على سرية معلومات حسابك. يجب ألا تشارك حسابك مع الآخرين. نخلي مسؤوليتنا عن أي استخدام غير مصرح به لحسابك.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">خطط الاشتراك</h2>
          <p className="leading-relaxed text-muted-foreground">
            تتوفر عدة خطط اشتراك (Smart Fix، إدارة المحتوى، وكالة). يتم الدفع عبر التحويل المصرفي. يحق لنا تغيير الأسعار مع إشعار مسبق.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">المحتوى المرفوع</h2>
          <p className="leading-relaxed text-muted-foreground">
            أنت تملك حقوق الصور والمحتوى الذي ترفعه للمنصة. نستخدم المحتوى المرفوع فقط لتقديم الخدمة (فحص الإعلانات، توليد المحتوى). لا نشارك المحتوى المرفوع مع أطراف ثالثة.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            يجب ألا ترفع محتوى ينتهك حقوق الملكية الفكرية للغير أو محتوى غير قانوني.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">إخلاء المسؤولية</h2>
          <p className="leading-relaxed text-muted-foreground">
            دقة فحص الإعلانات حوالي 90% بسبب التحديث المستمر لسياسات Meta وTikTok. ننصح بمراجعة الإعلانات يدوياً قبل النشر. لا نضمن قبول الإعلان بعد الفحص.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">تعديل الشروط</h2>
          <p className="leading-relaxed text-muted-foreground">
            يحق لنا تعديل هذه الشروط في أي وقت. سنقوم بإشعارك بالتغييرات الجوهرية عبر البريد الإلكتروني أو عبر المنصة.
          </p>
        </section>

        <div className="pt-6">
          <Link href="/" className="text-primary hover:underline">← العودة للرئيسية</Link>
        </div>
      </main>
    </div>
  );
}
