import { Link } from "wouter";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <header className="border-b border-border bg-black/80 backdrop-blur px-6 py-4">
        <Link href="/" className="text-primary font-bold text-lg">PostLapAI</Link>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <h1 className="text-3xl font-black">سياسة الخصوصية</h1>
        <p className="text-muted-foreground">آخر تحديث: يوليو 2026</p>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">المقدمة</h2>
          <p className="leading-relaxed text-muted-foreground">
            نحن في PostLapAI نلتزم بحماية خصوصية مستخدمينا. توضح هذه السياسة كيفية جمع واستخدام وحماية معلوماتك الشخصية عند استخدام منصتنا.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">المعلومات التي نجمعها</h2>
          <p className="leading-relaxed text-muted-foreground">
            نجمع المعلومات التالية عند استخدامك للمنصة:
          </p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>معلومات الحساب: الاسم والبريد الإلكتروني عند تسجيل الدخول عبر Google</li>
            <li>الجنس: يتم جمعه باختيارك عند أول تسجيل دخول</li>
            <li>الصور والفيديوهات: التي ترفعها لفحص الإعلانات</li>
            <li>بيانات الاستخدام: عدد الفحوصات ونوع الخطة</li>
            <li>رسائل المحادثة مع PostLab (المساعد الذكي)</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">كيف نستخدم معلوماتك</h2>
          <p className="leading-relaxed text-muted-foreground">
            نستخدم معلوماتك لتقديم وتحسين خدماتنا، بما في ذلك فحص الإعلانات، توليد المحتوى، وتخصيص تجربة المستخدم. لا نشارك معلوماتك مع أطراف ثالثة لأغراض تسويقية.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">تخزين البيانات وأمانها</h2>
          <p className="leading-relaxed text-muted-foreground">
            يتم تخزين بياناتك على خوادم آمنة. نتخذ إجراءات أمنية مناسبة لحماية معلوماتك من الوصول غير المصرح به أو التعديل أو الكشف.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">حقوقك</h2>
          <p className="leading-relaxed text-muted-foreground">
            لك الحق في طلب الوصول إلى بياناتك الشخصية أو تصحيحها أو حذفها في أي وقت. يمكنك التواصل معنا عبر الواتساب لطلب ذلك.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">التواصل</h2>
          <p className="leading-relaxed text-muted-foreground">
            للاستفسارات حول سياسة الخصوصية، يرجى التواصل عبر واتساب: 218915811115+
          </p>
        </section>

        <div className="pt-6">
          <Link href="/" className="text-primary hover:underline">← العودة للرئيسية</Link>
        </div>
      </main>
    </div>
  );
}
