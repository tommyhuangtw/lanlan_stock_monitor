'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

function SignupForm({ id }: { id?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('請輸入 Email'); return; }
    if (!agreed) { setError('請先同意接收電子報及行銷資訊'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, marketingConsent: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '註冊失敗');
      sessionStorage.setItem('signup_email', email);
      router.push('/thank-you');
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id={id} onSubmit={handleSubmit} className="max-w-lg mx-auto">
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <input
          type="email"
          placeholder="輸入你的 Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1 w-full sm:w-auto h-12 px-4 rounded-xl bg-slate-800/50 border border-slate-700 text-white placeholder:text-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 outline-none"
        />
        <Button
          type="submit"
          size="lg"
          disabled={loading}
          className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold h-12 px-8 cursor-pointer transition-all hover:scale-105 whitespace-nowrap"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              處理中...
            </span>
          ) : '免費訂閱'}
        </Button>
      </div>
      <label className="flex items-center gap-2 mt-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/20 cursor-pointer flex-shrink-0"
        />
        <span className="text-xs text-slate-400">
          我同意接收懶懶財經速報的電子報及行銷資訊，並同意<a href="/terms" target="_blank" className="text-amber-400 hover:underline">服務條款</a>
        </span>
      </label>
      {error && <p className="mt-2 text-red-400 text-sm text-center sm:text-left">{error}</p>}
    </form>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0F172A]">
      {/* Floating Navbar */}
      <nav className="fixed top-4 left-4 right-4 z-50">
        <div className="max-w-6xl mx-auto bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/icon.png" className="w-8 h-8 rounded-lg" alt="懶懶財經速報" />
            <span className="font-semibold text-white">懶懶財經速報</span>
          </div>
          <a href="#signup">
            <Button className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold cursor-pointer">
              免費訂閱
            </Button>
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-5xl mx-auto px-4 pt-32 pb-20 text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
          台股、美股投資節目
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200">
            每天 AI 幫你整理重點
          </span>
        </h1>

        <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          涵蓋多個熱門投資 Podcast 及 YouTube 頻道，
          <br />
          輸入 Email 就能每天收到 AI 摘要
        </p>

        <SignupForm id="signup" />

        {/* Trust Indicators */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-slate-500 text-sm">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>AI 智慧分析</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>每日自動更新</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>節目重點比對</span>
          </div>
        </div>
      </div>

      {/* Email Preview Section */}
      <div className="max-w-5xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">註冊後，你會收到這樣的電子報</h2>
          <p className="text-slate-400">每天早上自動送到你的信箱，打開就能掌握市場動態</p>
        </div>

        <div className="grid md:grid-cols-2 gap-10 items-center">
          {/* Left: Key benefits */}
          <div className="space-y-6">
            <div className="bg-slate-800/40 rounded-2xl p-6 border border-slate-700/50">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-semibold text-lg mb-1">註冊立即收到</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">一註冊就會收到當天最新的投資摘要電子報，不用等到隔天</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/40 rounded-2xl p-6 border border-slate-700/50">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-semibold text-lg mb-1">每日 AI 摘要</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">自動整理你追蹤的投資節目，每天送到信箱</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/40 rounded-2xl p-6 border border-slate-700/50">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-semibold text-lg mb-1">完全免費</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">只需輸入 Email，無需信用卡，無任何費用</p>
                </div>
              </div>
            </div>

            <div className="mt-2">
              <SignupForm />
            </div>
          </div>

          {/* Right: Email mockup with two pages */}
          <EmailMockup />
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-white mb-4">如何運作</h2>
          <p className="text-slate-400">三個步驟，讓你不再錯過任何投資洞見</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            }
            title="輸入 Email 訂閱"
            description="只需輸入 Email 就能開始，涵蓋多個熱門台股、美股投資 Podcast 及 YouTube 頻道"
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            title="節目觀點整理"
            description="AI 自動彙整節目中提到的股票觀點與看法，方便快速比對不同來源"
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            title="每日重點摘要"
            description="每天收到節目重點彙整，包含提到的股票與情緒分布，節省研究時間"
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-12">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src="/icon.png" className="w-6 h-6 rounded-md" alt="懶懶財經速報" />
              <span className="text-slate-400 text-sm">懶懶財經速報 © 2026</span>
            </div>
            <div className="flex items-center gap-6 text-slate-500 text-sm">
              <Link href="/privacy" className="hover:text-slate-300 transition-colors cursor-pointer">隱私權政策</Link>
              <Link href="/terms" className="hover:text-slate-300 transition-colors cursor-pointer">服務條款</Link>
              <a href="mailto:contact@ailanbao.org" className="hover:text-slate-300 transition-colors cursor-pointer">聯絡我們</a>
            </div>
          </div>
          {/* Disclaimer */}
          <div className="mt-8 pt-6 border-t border-slate-800/50">
            <div className="bg-slate-800/30 rounded-xl px-6 py-4">
              <p className="text-slate-400 text-sm text-center leading-relaxed">
                <span className="font-medium text-slate-300">免責聲明：</span>
                本服務為獨立第三方工具，與任何 Podcast 或 YouTube 創作者及節目無任何關聯、合作或背書關係。
                所有分析內容僅供參考，不構成投資建議。投資有風險，請自行判斷。
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function EmailMockup() {
  const [page, setPage] = useState(0);
  const PAGE_COUNT = 2;
  const AUTO_ROTATE_MS = 5000;

  const [pauseUntil, setPauseUntil] = useState(0);

  const goToPage = useCallback((i: number) => {
    setPage(i);
    setPauseUntil(Date.now() + AUTO_ROTATE_MS * 2);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (Date.now() >= pauseUntil) {
        setPage((p) => (p + 1) % PAGE_COUNT);
      }
    }, AUTO_ROTATE_MS);
    return () => clearInterval(timer);
  }, [pauseUntil]);

  return (
    <div className="relative">
      <div className="bg-white rounded-xl shadow-2xl shadow-black/30 overflow-hidden transform md:rotate-1 md:hover:rotate-0 transition-transform duration-300">
        {/* Email header */}
        <div className="bg-gradient-to-r from-[#1e3a5f] via-[#234e78] to-[#2a6298] px-6 py-5 text-center">
          <p className="text-white font-bold text-lg">📊 懶懶財經速報</p>
          <p className="text-blue-200 text-xs mt-1">2026-02-27 ｜ 分析 5 個來源</p>
        </div>

        {/* Page content - horizontal slider */}
        <div className="overflow-hidden min-h-[420px]">
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{ width: `${PAGE_COUNT * 100}%`, transform: `translateX(-${page * (100 / PAGE_COUNT)}%)` }}
          >
            {/* Page 1 */}
            <div className="px-5 py-4 space-y-4" style={{ width: `${100 / PAGE_COUNT}%` }}>
              {/* Market overview */}
              <div className="border border-slate-200 rounded-lg p-4">
                <p className="font-bold text-slate-800 text-sm mb-3">📊 今日總覽</p>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-emerald-600">看漲 4</span>
                  <div className="flex-1 h-2.5 rounded-full overflow-hidden flex">
                    <div className="bg-emerald-500 w-[57%]" />
                    <div className="bg-red-500 w-[43%]" />
                  </div>
                  <span className="text-xs font-semibold text-red-500">看空 3</span>
                </div>
                <p className="text-center text-slate-500 text-xs italic">&ldquo;多空看法分歧，建議審慎評估&rdquo;</p>
              </div>

              {/* Quick digest */}
              <div className="space-y-2">
                <p className="font-bold text-slate-800 text-sm">⚡ 快速重點</p>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5 text-xs">●</span>
                    <p className="text-xs text-slate-600 leading-relaxed">輝達財報引發市場錯殺，AI 基礎建設與電力需求仍是長線佈局的絕佳良機。</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5 text-xs">●</span>
                    <p className="text-xs text-slate-600 leading-relaxed">拒絕短期投機誘惑，專注投資自己與長期價值投資以發揮時間複利的最大效益。</p>
                  </div>
                </div>
              </div>

              {/* Bullish signals */}
              <div className="space-y-2">
                <p className="font-bold text-slate-800 text-sm">📊 KOL 看多觀點</p>
                <div className="border-l-4 border-emerald-500 bg-emerald-50/50 rounded-r-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-emerald-700 font-bold text-sm">TSMC</span>
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">🤝 共識</span>
                    <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">長線</span>
                  </div>
                  <p className="text-xs text-slate-500">AI 資本支出持續擴大，台積電受惠明確</p>
                </div>
                <div className="border-l-4 border-emerald-500 bg-emerald-50/50 rounded-r-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-emerald-700 font-bold text-sm">NVDA</span>
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">🤝 共識</span>
                    <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">中線</span>
                  </div>
                  <p className="text-xs text-slate-500">資料中心需求強勁，GPU 算力仍供不應求</p>
                </div>
              </div>

              {/* Fade out */}
              <div className="relative h-12 mt-2">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white" />
                <div className="absolute bottom-0 left-0 right-0 text-center">
                  <p className="text-slate-400 text-xs">還有更多觀點與來源⋯⋯</p>
                </div>
              </div>
            </div>

            {/* Page 2 */}
            <div className="px-5 py-4 space-y-4" style={{ width: `${100 / PAGE_COUNT}%` }}>
              {/* Bearish signals */}
              <div className="space-y-2">
                <p className="font-bold text-slate-800 text-sm">📊 KOL 看空觀點</p>
                <div className="border-l-4 border-red-500 bg-red-50/50 rounded-r-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-red-700 font-bold text-sm">某檔個股</span>
                    <span className="bg-yellow-100 text-yellow-800 text-[10px] px-1.5 py-0.5 rounded-full font-medium">⚡ 分歧</span>
                    <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">短線</span>
                  </div>
                  <p className="text-xs text-slate-500">短線漲幅過大，部分觀點認為有回檔風險</p>
                </div>
              </div>

              {/* Risk alerts */}
              <div className="space-y-2">
                <p className="font-bold text-slate-800 text-sm">⚠️ 風險提醒</p>
                <div className="border-l-4 border-red-400 bg-red-50/30 rounded-r-lg p-3 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-red-400 mt-0.5 text-xs">●</span>
                    <p className="text-xs text-slate-600">美國科技股估值偏高，留意財報不如預期的修正風險</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-red-400 mt-0.5 text-xs">●</span>
                    <p className="text-xs text-slate-600">台幣匯率波動加劇，出口類股需留意匯損影響</p>
                  </div>
                </div>
              </div>

              {/* Catalysts */}
              <div className="space-y-2">
                <p className="font-bold text-slate-800 text-sm">📅 近期催化劑</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="bg-blue-600 text-white text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">03/15</span>
                    <p className="text-xs text-slate-600">FOMC 利率決策會議</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="bg-blue-600 text-white text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">03/20</span>
                    <p className="text-xs text-slate-600">台積電法說會</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="bg-blue-600 text-white text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">04/02</span>
                    <p className="text-xs text-slate-600">美國非農就業數據公布</p>
                  </div>
                </div>
              </div>

              {/* Global market brief */}
              <div className="space-y-2">
                <p className="font-bold text-slate-800 text-sm">🌐 全球市場快訊</p>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5 text-xs">●</span>
                    <p className="text-xs text-slate-600 leading-relaxed">美股三大指數收紅，費半漲幅領先大盤</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5 text-xs">●</span>
                    <p className="text-xs text-slate-600 leading-relaxed">日本央行維持利率不變，日圓走弱推升出口股</p>
                  </div>
                </div>
              </div>

              {/* Fade out */}
              <div className="relative h-12 mt-2">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white" />
                <div className="absolute bottom-0 left-0 right-0 text-center">
                  <p className="text-slate-400 text-xs">還有獨特觀點、節目摘要⋯⋯</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-2 mt-4">
        {Array.from({ length: PAGE_COUNT }, (_, i) => (
          <button
            key={i}
            onClick={() => goToPage(i)}
            className={`w-2.5 h-2.5 rounded-full transition-colors cursor-pointer ${page === i ? 'bg-amber-400' : 'bg-slate-600 hover:bg-slate-500'}`}
            aria-label={`Page ${i + 1}`}
          />
        ))}
      </div>

      {/* Decorative glow */}
      <div className="absolute -inset-4 bg-amber-500/5 rounded-3xl -z-10 blur-2xl" />
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group bg-slate-800/30 backdrop-blur-sm rounded-2xl p-8 border border-slate-700/50 hover:border-amber-500/30 transition-all cursor-pointer">
      <div className="mb-4">
        <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-400 group-hover:bg-amber-500/20 transition-colors">
          {icon}
        </div>
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}
