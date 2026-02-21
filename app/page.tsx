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
            免費試用 3 天，無需信用卡
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
            step="01"
            title="自動追蹤"
            description="支援多個熱門台股、美股投資 Podcast 及 YouTube 頻道，自動抓取最新集數"
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            step="02"
            title="AI 分析"
            description="AI 自動轉錄並分析內容，提取關鍵觀點與投資洞見"
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            step="03"
            title="每日摘要"
            description="每天自動收到精華摘要，包含提到的股票與主持人看法"
          />
        </div>
      </div>

      {/* Pricing */}
      <div className="max-w-4xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-white mb-4">簡單透明的定價</h2>
          <p className="text-slate-400">選擇適合你的方案</p>
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
                前 3 天每日摘要
              </li>
              <li className="flex items-center gap-3">
                <svg className="w-5 h-5 text-emerald-400/50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-slate-400">之後每週一收到</span>
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
            <p className="text-4xl font-bold text-white mb-1">
              NT$199
            </p>
            <p className="text-slate-500 mb-6">每月</p>
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
            <p className="text-center text-amber-400/70 text-sm mt-4">
              前兩個月特價 NT$99/月
            </p>
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
              <a href="mailto:support@investsignal.app" className="hover:text-slate-300 transition-colors cursor-pointer">聯絡我們</a>
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

function FeatureCard({
  icon,
  step,
  title,
  description
}: {
  icon: React.ReactNode;
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group bg-slate-800/30 backdrop-blur-sm rounded-2xl p-8 border border-slate-700/50 hover:border-amber-500/30 transition-all cursor-pointer">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-400 group-hover:bg-amber-500/20 transition-colors">
          {icon}
        </div>
        <span className="text-amber-500/50 text-sm font-mono">{step}</span>
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}
