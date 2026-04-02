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
          <p className="text-sm text-slate-500">最後更新日期：2026 年 4 月</p>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">1. 服務描述</h2>
            <p>「懶懶財經速報」是一項<strong className="text-white">免費的資訊彙整工具</strong>，自動追蹤多個熱門投資 Podcast 及 YouTube 頻道，由 AI 彙整 KOL 在節目中的公開發言，並以每日電子郵件方式寄送觀點摘要給訂閱用戶。</p>
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
              <li>所有內容來自<strong className="text-white">公開可得</strong>的 Podcast 及 YouTube 節目</li>
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
              <li>用戶應自行驗證所有資訊的準確性</li>
              <li>用戶應理解本服務為資訊工具，不是投資決策依據</li>
              <li>用戶的投資決策完全由其個人負責，與本服務無關</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">4. 訂閱與取消</h2>
            <p>本服務為免費訂閱制。用戶可隨時透過 Email 中的退訂連結取消訂閱，取消後將不再收到每日摘要 Email。如需重新訂閱，可回首頁重新註冊。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">5. 服務變更</h2>
            <p>我們保留隨時修改、暫停或終止服務的權利。重大變更將透過電子郵件通知用戶。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">6. 責任限制</h2>
            <p>本服務按「現狀」提供。我們不對因使用本服務所產生的任何投資損失負責。AI 分析結果可能存在誤差，用戶應自行驗證資訊的準確性。</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">7. 適用法律</h2>
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
