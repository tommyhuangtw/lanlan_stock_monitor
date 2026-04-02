import Link from 'next/link';

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold text-white mb-8">服務條款</h1>
        <div className="prose prose-invert prose-slate max-w-none space-y-6 text-slate-300 leading-relaxed">
          <p className="text-sm text-slate-500">最後更新日期：2026 年 2 月</p>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">1. 服務描述</h2>
            <p>「懶懶財經速報」是一項<strong className="text-white">資訊彙整工具</strong>，提供公開 Podcast 及 YouTube 節目的檢索功能。用戶自行決定追蹤哪些來源，AI 自動彙整 KOL 在節目中的公開發言，並以電子郵件方式寄送觀點摘要給訂閱用戶。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">2. 服務定位與免責聲明</h2>

            <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-5 mb-6">
              <p className="text-amber-400 font-semibold mb-2 text-base">⚠️ 本服務的性質</p>
              <p className="text-amber-400/90 leading-relaxed">
                懶懶財經速報是一個<strong className="text-amber-300">資訊彙整工具</strong>，不是投資顧問服務。
                我們的功能是協助用戶追蹤並整理 KOL 在公開節目中的發言內容，讓用戶可以快速比對不同 KOL 的觀點。
              </p>
            </div>

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">關於內容來源</h3>
            <ul className="list-disc pl-6 space-y-2.5 text-slate-400 leading-relaxed">
              <li>本服務為獨立第三方工具，與任何 Podcast 或 YouTube 創作者及節目<strong className="text-amber-400">無任何關聯、合作或背書關係</strong></li>
              <li>所有內容來自<strong className="text-white">用戶自行選擇追蹤</strong>的公開可得節目</li>
              <li>我們不主動選擇內容來源，而是由用戶決定追蹤哪些節目</li>
              <li>所有版權歸原節目創作者所有，我們僅提供簡短摘要與原始連結</li>
            </ul>

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">關於 AI 分析</h3>
            <ul className="list-disc pl-6 space-y-2.5 text-slate-400 leading-relaxed">
              <li>所有分析內容由 AI 自動生成，<strong className="text-amber-400">僅供參考</strong></li>
              <li>AI 可能存在理解偏差、遺漏重點或技術錯誤</li>
              <li>我們記錄的是「<strong className="text-white">KOL 說了什麼</strong>」，不是「你該怎麼做」</li>
              <li>任何股票操作記錄均為 KOL 個人觀點或操作，<strong className="text-amber-400">不構成本服務的投資建議</strong></li>
            </ul>

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">關於投資風險</h3>
            <div className="bg-red-900/10 border border-red-500/20 rounded-lg p-4 mb-3">
              <p className="text-red-400 font-semibold mb-2">投資有風險，過去績效不代表未來表現</p>
              <ul className="list-disc pl-5 space-y-2 text-red-300/80 text-sm">
                <li>本服務不提供個人化投資建議，也不具備投資顧問執照</li>
                <li>所有投資決策應基於您自己的研究、風險承受能力與財務狀況</li>
                <li>我們不對因使用本服務所產生的任何投資損失負責</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">3. 用戶責任</h2>
            <ul className="list-disc pl-6 space-y-2.5 text-slate-400 leading-relaxed">
              <li>用戶應自行選擇追蹤的節目來源</li>
              <li>用戶應自行驗證所有資訊的準確性</li>
              <li>用戶應理解本服務為資訊工具，不是投資決策依據</li>
              <li>用戶的投資決策完全由其個人負責，與本服務無關</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">4. 訂閱方案</h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-400">
              <li><strong className="text-slate-300">免費版</strong> — 前 7 天完整體驗（所有來源、每日摘要），之後可追蹤最多 3 個節目，每週三收到摘要。</li>
              <li><strong className="text-slate-300">專業版（NT$199/月）</strong> — 自選追蹤節目、每日收到最新摘要，可隨時取消。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">5. 付款與退款</h2>
            <p>專業版採月繳制，透過 Stripe 安全處理付款。取消訂閱後，服務將持續至當期結束。我們不提供已使用期間的退款。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">6. 帳號終止</h2>
            <p>我們保留在以下情況終止或暫停您帳號的權利：違反服務條款、濫用服務、或其他影響服務正常運作的行為。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">7. 服務變更</h2>
            <p>我們保留隨時修改、暫停或終止服務的權利。重大變更將透過電子郵件通知用戶。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">8. 責任限制</h2>
            <p>本服務按「現狀」提供。我們不對因使用本服務所產生的任何投資損失負責。AI 分析結果可能存在誤差，用戶應自行驗證資訊的準確性。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">9. 適用法律</h2>
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
