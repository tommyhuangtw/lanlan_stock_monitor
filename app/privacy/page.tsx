import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0F172A]">
      {/* Header */}
      <div className="border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 cursor-pointer">
            <img src="/icon.png" className="w-8 h-8 rounded-lg" alt="懶懶財經速報" />
            <span className="font-semibold text-white">懶懶財經速報</span>
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-white mb-8">隱私權政策</h1>
        <div className="prose prose-invert prose-slate max-w-none space-y-6 text-slate-300 leading-relaxed">
          <p className="text-sm text-slate-500">最後更新日期：2026 年 4 月</p>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">1. 我們收集的資料</h2>
            <p>當您使用「懶懶財經速報」服務時，我們會收集以下資料：</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-400">
              <li><strong className="text-slate-300">電子郵件地址</strong> — 用於註冊及寄送每日摘要報告。</li>
              <li><strong className="text-slate-300">訂閱狀態</strong> — 您的訂閱與退訂紀錄。</li>
              <li><strong className="text-slate-300">行銷同意紀錄</strong> — 您在註冊時是否同意接收電子報及行銷資訊。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">2. 資料使用方式</h2>
            <p>我們使用您的資料僅用於以下目的：</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-400">
              <li>寄送投資 Podcast 及 YouTube AI 摘要報告至您的電子郵件。</li>
              <li>維護您的訂閱狀態。</li>
              <li>改善服務品質。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">3. 第三方服務</h2>
            <p>我們使用以下第三方服務處理您的資料：</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-400">
              <li><strong className="text-slate-300">Supabase</strong> — 資料庫儲存。</li>
              <li><strong className="text-slate-300">Resend</strong> — 電子郵件寄送。</li>
              <li><strong className="text-slate-300">PostHog</strong> — 匿名使用分析，用於改善服務體驗。</li>
              <li><strong className="text-slate-300">Vercel</strong> — 網站託管。</li>
            </ul>
            <p>我們不會將您的個人資料出售給任何第三方。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">4. Cookie 使用</h2>
            <p>本服務不需要登入，因此不使用登入相關的 cookie。我們僅透過 PostHog 收集匿名的網站使用數據，以改善服務品質。我們不使用追蹤型 cookie 或廣告 cookie。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">5. 資料保留與刪除</h2>
            <p>您可以隨時透過 Email 中的退訂連結取消訂閱，停止接收報告。如需完全刪除帳戶及相關資料，請聯絡 <a href="mailto:contact@ailanbao.org" className="text-amber-400 hover:text-amber-300">contact@ailanbao.org</a>。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">6. 聯絡方式</h2>
            <p>如對隱私權政策有任何問題，請透過 <a href="mailto:contact@ailanbao.org" className="text-amber-400 hover:text-amber-300">contact@ailanbao.org</a> 聯絡我們。</p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-slate-800">
          <Link href="/" className="text-slate-400 hover:text-white transition-colors text-sm">
            ← 返回首頁
          </Link>
        </div>
      </div>
    </div>
  );
}
