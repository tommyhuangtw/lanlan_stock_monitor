import Link from 'next/link';

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold text-white mb-8">服務條款</h1>
        <div className="prose prose-invert prose-slate max-w-none space-y-6 text-slate-300 leading-relaxed">
          <p className="text-sm text-slate-500">最後更新日期：2026 年 2 月</p>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">1. 服務描述</h2>
            <p>「懶懶財經速報」是一項自動化服務，透過 AI 技術追蹤並摘要台灣及美股相關投資 Podcast 內容，並以電子郵件方式寄送報告給訂閱用戶。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">2. 免責聲明</h2>
            <p className="text-amber-400/80">本服務為獨立第三方工具，與任何 Podcast 創作者或節目無任何關聯、合作或背書關係。所有分析內容由 AI 自動生成，僅供參考，不構成投資建議。投資有風險，請自行判斷。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">3. 訂閱方案</h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-400">
              <li><strong className="text-slate-300">免費版</strong> — 前 3 天每日摘要，之後每週一收到摘要報告。</li>
              <li><strong className="text-slate-300">專業版（NT$199/月）</strong> — 每日收到最新摘要報告，可隨時取消。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">4. 付款與退款</h2>
            <p>專業版採月繳制，透過 Stripe 安全處理付款。取消訂閱後，服務將持續至當期結束。我們不提供已使用期間的退款。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">5. 帳號終止</h2>
            <p>我們保留在以下情況終止或暫停您帳號的權利：違反服務條款、濫用服務、或其他影響服務正常運作的行為。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">6. 服務變更</h2>
            <p>我們保留隨時修改、暫停或終止服務的權利。重大變更將透過電子郵件通知用戶。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">7. 責任限制</h2>
            <p>本服務按「現狀」提供。我們不對因使用本服務所產生的任何投資損失負責。AI 分析結果可能存在誤差，用戶應自行驗證資訊的準確性。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">8. 適用法律</h2>
            <p>本服務條款受中華民國法律管轄。</p>
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
