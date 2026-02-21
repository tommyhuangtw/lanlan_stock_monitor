import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0F172A]">
      {/* Header */}
      <div className="border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="font-semibold text-white">懶懶財經速報</span>
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-white mb-8">隱私權政策</h1>
        <div className="prose prose-invert prose-slate max-w-none space-y-6 text-slate-300 leading-relaxed">
          <p className="text-sm text-slate-500">最後更新日期：2026 年 2 月</p>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">1. 我們收集的資料</h2>
            <p>當您使用「懶懶財經速報」服務時，我們會收集以下資料：</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-400">
              <li><strong className="text-slate-300">電子郵件地址</strong> — 用於帳戶註冊、登入驗證及寄送摘要報告。</li>
              <li><strong className="text-slate-300">來源偏好設定</strong> — 您選擇追蹤的 Podcast 及 YouTube 來源。</li>
              <li><strong className="text-slate-300">訂閱狀態</strong> — 免費版或專業版的訂閱紀錄。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">2. 資料使用方式</h2>
            <p>我們使用您的資料僅用於以下目的：</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-400">
              <li>寄送投資 Podcast 及 YouTube AI 摘要報告至您的電子郵件。</li>
              <li>維護您的帳戶及訂閱狀態。</li>
              <li>改善服務品質。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">3. 第三方服務</h2>
            <p>我們使用以下第三方服務處理您的資料：</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-400">
              <li><strong className="text-slate-300">Supabase</strong> — 資料庫儲存。</li>
              <li><strong className="text-slate-300">Resend</strong> — 電子郵件寄送。</li>
              <li><strong className="text-slate-300">Stripe</strong> — 付款處理（僅適用專業版用戶）。</li>
              <li><strong className="text-slate-300">Vercel</strong> — 網站託管。</li>
            </ul>
            <p>我們不會將您的個人資料出售給任何第三方。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">4. Cookie 使用</h2>
            <p>我們僅使用必要的 session cookie（<code className="text-amber-400">session_token</code>）來維持您的登入狀態。此 cookie 為 HttpOnly，有效期 30 天。我們不使用追蹤型 cookie 或廣告 cookie。</p>
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
