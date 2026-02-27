'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0F172A]">
      {/* Floating Navbar */}
      <nav className="fixed top-4 left-4 right-4 z-50">
        <div className="max-w-6xl mx-auto bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="font-semibold text-white">懶懶財經速報</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-slate-300 hover:text-white transition-colors cursor-pointer">
              登入
            </Link>
            <Link href="/signup">
              <Button className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold cursor-pointer">
                免費試用
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-5xl mx-auto px-4 pt-32 pb-20 text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
          投資節目太多聽不完？
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200">
            讓 AI 幫你摘要重點
          </span>
        </h1>

        <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          自動追蹤熱門台股、美股投資 Podcast 及 YouTube 節目，
          <br />
          每天自動收到 AI 摘要及重點股票趨勢分析
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/signup">
            <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold text-lg px-8 py-6 cursor-pointer transition-all hover:scale-105">
              開始免費試用
              <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Button>
          </Link>
          <p className="text-slate-500 text-sm">
            免費試用 7 天，無需信用卡
          </p>
        </div>

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
            <span>股票情緒分析</span>
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
                  <h3 className="text-white font-semibold text-lg mb-1">7 天免費體驗</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">連續 7 天每天收到完整電子報，體驗結束後改為每週三一封</p>
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
                  <h3 className="text-white font-semibold text-lg mb-1">無需信用卡</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">填入 Email 即可開始，不需要綁定任何付款資訊</p>
                </div>
              </div>
            </div>

            <Link href="/signup">
              <Button size="lg" className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold text-lg py-6 cursor-pointer transition-all hover:scale-[1.02] mt-2">
                開始免費試用
                <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Button>
            </Link>
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            }
            title="自動追蹤"
            description="支援多個熱門台股、美股投資 Podcast 及 YouTube 頻道，自動抓取最新集數"
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            title="AI 分析"
            description="AI 自動轉錄並分析內容，提取關鍵觀點與投資洞見"
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            title="每日摘要"
            description="每天自動收到精華摘要，包含提到的股票與主持人看法"
          />
        </div>
      </div>

      {/* Pricing */}
      <div className="max-w-4xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-white mb-4">選擇你的方案</h2>
          <p className="text-slate-400">免費開始，隨時升級</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Free Plan */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700/50 hover:border-slate-600 transition-colors cursor-pointer">
            <h3 className="text-xl font-semibold text-white mb-2">免費版</h3>
            <p className="text-4xl font-bold text-white mb-1">
              $0
            </p>
            <p className="text-slate-500 mb-6">永久免費</p>
            <ul className="space-y-4 text-slate-300 mb-8">
              <li className="flex items-center gap-3">
                <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                全部來源整合摘要
              </li>
              <li className="flex items-center gap-3">
                <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                前 7 天每日摘要
              </li>
              <li className="flex items-center gap-3">
                <svg className="w-5 h-5 text-emerald-400/50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-slate-400">之後每週三收到</span>
              </li>
            </ul>
            <Link href="/signup" className="block">
              <Button className="w-full bg-slate-700 hover:bg-slate-600 text-white border border-slate-500 font-semibold cursor-pointer" size="lg">
                免費開始
              </Button>
            </Link>
          </div>

          {/* Paid Plan */}
          <div className="relative bg-gradient-to-br from-amber-500/10 to-amber-600/5 rounded-2xl p-8 border border-amber-500/30 hover:border-amber-500/50 transition-colors cursor-pointer">
            <div className="absolute -top-3 right-6 bg-amber-500 text-slate-900 text-sm font-bold px-3 py-1 rounded-full">
              推薦
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">專業版</h3>
            <div className="flex items-baseline gap-3 mb-1">
              <p className="text-4xl font-bold text-white">NT$99</p>
              <p className="text-xl text-slate-500 line-through">NT$199</p>
            </div>
            <p className="text-slate-500 mb-6">每月・前兩個月特價</p>
            <ul className="space-y-4 text-slate-300 mb-8">
              <li className="flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                全部來源整合摘要
              </li>
              <li className="flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                每天收到最新摘要
              </li>
              <li className="flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                優先支援
              </li>
            </ul>
            <Link href="/upgrade" className="block">
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold cursor-pointer" size="lg">
                升級專業版
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-12">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gradient-to-br from-amber-400 to-amber-600 rounded-md flex items-center justify-center">
                <svg className="w-4 h-4 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
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
                <p className="font-bold text-slate-800 text-sm">📈 看漲訊號</p>
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
                  <p className="text-slate-400 text-xs">還有更多訊號與深度分析⋯⋯</p>
                </div>
              </div>
            </div>

            {/* Page 2 */}
            <div className="px-5 py-4 space-y-4" style={{ width: `${100 / PAGE_COUNT}%` }}>
              {/* Bearish signals */}
              <div className="space-y-2">
                <p className="font-bold text-slate-800 text-sm">📉 看空訊號</p>
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
