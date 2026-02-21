'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function ThankYouContent() {
  const [email, setEmail] = useState('');

  useEffect(() => {
    const stored = sessionStorage.getItem('signup_email');
    if (stored) {
      setEmail(stored);
      sessionStorage.removeItem('signup_email');
    }
  }, []);

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

      <div className="max-w-xl mx-auto px-4 py-16">
        {/* Success Icon */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
            <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">註冊成功！</h1>
          <p className="text-slate-400">
            歡迎郵件已發送到 <span className="text-amber-400 font-medium">{email}</span>
          </p>
        </div>

        {/* Timeline Card */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 mb-8">
          <h3 className="font-semibold text-white mb-6">接下來會發生什麼？</h3>

          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-white">現在</p>
                <p className="text-sm text-slate-400">歡迎郵件已發送到你的信箱</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-slate-900 font-bold">
                1
              </div>
              <div>
                <p className="font-medium text-white">明天</p>
                <p className="text-sm text-slate-400">收到第一封每日摘要</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-slate-900 font-bold">
                2
              </div>
              <div>
                <p className="font-medium text-white">前 3 天</p>
                <p className="text-sm text-slate-400">每天收到最新 Podcast 精華摘要</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 font-bold">
                3
              </div>
              <div>
                <p className="font-medium text-slate-400">第 4 天起</p>
                <p className="text-sm text-slate-500">免費版改為每週一封（週一發送）</p>
              </div>
            </div>
          </div>
        </div>

        {/* Upgrade CTA */}
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 rounded-2xl border border-amber-500/30 p-8 text-center mb-8">
          <h3 className="text-xl font-bold text-white mb-2">想要每天收到摘要？</h3>
          <p className="text-slate-400 mb-6">升級專業版，每天比別人早一步掌握投資訊號</p>
          <Link href="/upgrade">
            <Button className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold cursor-pointer" size="lg">
              升級專業版 - NT$199/月
            </Button>
          </Link>
          <p className="text-amber-400/70 text-sm mt-4">前兩個月特價 NT$99/月</p>
        </div>

        {/* Tips */}
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-4 mb-8">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-slate-400">
              記得檢查垃圾郵件資料夾，並將我們加入聯絡人以確保收到郵件
            </p>
          </div>
        </div>

        {/* Back Button */}
        <div className="text-center">
          <Link href="/">
            <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer">
              返回首頁
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ThankYouPage() {
  return <ThankYouContent />;
}
