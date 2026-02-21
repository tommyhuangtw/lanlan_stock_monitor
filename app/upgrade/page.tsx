'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Suspense } from 'react';

function UpgradeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  const cancelled = searchParams.get('cancelled') === 'true';

  useEffect(() => {
    const checkUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!data.user) {
          router.push('/login');
          return;
        }
        if (data.user.is_paid) {
          router.push('/dashboard');
          return;
        }
        // Calculate promo eligibility
        const daysSinceSignup = Math.floor(
          (Date.now() - new Date(data.user.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        setDaysLeft(daysSinceSignup < 7 ? 7 - daysSinceSignup : 0);
      } catch {
        router.push('/login');
        return;
      }
      setChecking(false);
    };
    checkUser();
  }, [router]);

  const handleUpgrade = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/create-checkout-session', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || '發生錯誤，請稍後再試');
        setLoading(false);
      }
    } catch {
      setError('連線失敗，請稍後再試');
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          載入中...
        </div>
      </div>
    );
  }

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
          <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors">
            返回控制台
          </Link>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-16">
        {cancelled && (
          <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
            付款已取消。如需協助，請聯絡 <a href="mailto:contact@ailanbao.org" className="underline">contact@ailanbao.org</a>。
          </div>
        )}

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-3">升級專業版</h1>
          <p className="text-slate-400">解鎖完整功能，掌握每日投資動態</p>
        </div>

        <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 rounded-2xl p-8 border border-amber-500/30">
          <div className="text-center mb-8">
            {daysLeft && daysLeft > 0 ? (
              <>
                <p className="text-5xl font-bold text-white mb-1">
                  <span className="text-2xl text-slate-500 line-through mr-2">NT$199</span>
                  NT$99
                  <span className="text-lg text-slate-400 font-normal"> /月</span>
                </p>
                <p className="text-amber-400 text-sm mt-2">
                  限時優惠：前兩個月 NT$99/月（還剩 {daysLeft} 天）
                </p>
              </>
            ) : (
              <>
                <p className="text-5xl font-bold text-white mb-1">
                  NT$199
                  <span className="text-lg text-slate-400 font-normal"> /月</span>
                </p>
              </>
            )}
          </div>

          <ul className="space-y-4 mb-8">
            <li className="flex items-center gap-3 text-slate-300">
              <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              全部來源整合摘要
            </li>
            <li className="flex items-center gap-3 text-slate-300">
              <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              每天收到最新摘要
            </li>
            <li className="flex items-center gap-3 text-slate-300">
              <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              優先支援
            </li>
          </ul>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <Button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold text-lg py-6 cursor-pointer"
            size="lg"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                處理中...
              </span>
            ) : '前往付款'}
          </Button>

          <p className="text-center text-slate-500 text-xs mt-4">
            付款由 Stripe 安全處理，可隨時取消
          </p>
        </div>

        <div className="text-center mt-8">
          <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors text-sm">
            先繼續使用免費版
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          載入中...
        </div>
      </div>
    }>
      <UpgradeContent />
    </Suspense>
  );
}
