'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Suspense } from 'react';
import posthog from 'posthog-js';

interface User {
  id: string;
  email: string;
  is_paid: boolean;
  created_at: string;
  subscription_cancel_at_period_end?: boolean;
}

interface Source {
  id: string;
  name: string;
  type: string;
  description: string | null;
}

const sourceImages: Record<string, string> = {
  'gooaye': '/sources/股涯.webp',
  'sailing-king': '/sources/美股航海王.webp',
  'us-stock-academy': '/sources/Jenny美股投資學.webp',
  'finance-horn': '/sources/游庭皓的財經皓角.webp',
  'leek-graduate': '/sources/韭菜畢業班.webp',
  'nick-us-stock': '/sources/Nick美股咖啡館.jpg',
  'nana-us-stock': '/sources/nana說美股.jpg',
  'sunny-finance': '/sources/陽光財經.jpg',
};

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (searchParams.get('upgraded') === 'true') {
      setUpgraded(true);
    }
    // Clean up query params from URL
    if (window.location.search) {
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [searchParams]);

  const fetchData = async () => {
    setError(null);
    try {
      const [userRes, sourcesRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/sources'),
      ]);
      const userData = await userRes.json();

      if (!userData.user) {
        router.push('/login');
        return;
      }

      setUser(userData.user);
      posthog.identify(userData.user.id, {
        email: userData.user.email,
        is_paid: userData.user.is_paid,
      });

      const sourcesData = await sourcesRes.json();
      setSources(sourcesData.sources || []);
    } catch {
      setError('載入資料失敗，請重新整理頁面');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Still redirect even if logout API fails
    }
    router.push('/');
  };

  const handleCancelSubscription = async () => {
    if (!confirm('確定要取消訂閱嗎？取消後本期結束時將降為免費版。')) return;
    setCancelling(true);
    setMessage('');
    try {
      const res = await fetch('/api/cancel-subscription', { method: 'POST' });
      if (res.ok) {
        setUser(prev => prev ? { ...prev, subscription_cancel_at_period_end: true } : prev);
        setMessage('訂閱已取消，本期結束後將降為免費版');
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error || '取消失敗，請稍後再試');
      }
    } catch {
      setMessage('取消失敗，請稍後再試');
    } finally {
      setCancelling(false);
    }
  };

  const handleResumeSubscription = async () => {
    setResuming(true);
    setMessage('');
    try {
      const res = await fetch('/api/resume-subscription', { method: 'POST' });
      if (res.ok) {
        setUser(prev => prev ? { ...prev, subscription_cancel_at_period_end: false } : prev);
        setMessage('已恢復訂閱');
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error || '恢復失敗，請稍後再試');
      }
    } catch {
      setMessage('恢復失敗，請稍後再試');
    } finally {
      setResuming(false);
    }
  };

  if (loading && !error) {
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

  if (error) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Button
            onClick={() => { setLoading(true); fetchData(); }}
            className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold cursor-pointer"
          >
            重新載入
          </Button>
        </div>
      </div>
    );
  }

  const daysAsMember = user ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;

  const getStatusText = () => {
    if (user?.is_paid) {
      return user.subscription_cancel_at_period_end
        ? '已排定取消，本期結束後降為免費版'
        : '每日摘要';
    }
    return daysAsMember < 7 ? '每日摘要（試用中）' : '每週摘要';
  };

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
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400 hidden sm:inline">{user?.email}</span>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              登出
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Upgrade Success Banner */}
        {upgraded && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center justify-between">
            <span>升級成功！您現在是專業版用戶，將每天收到最新摘要。</span>
            <button onClick={() => setUpgraded(false)} className="text-emerald-400/60 hover:text-emerald-400 cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Subscription Status Bar */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-5 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                user?.is_paid
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-700/50 text-slate-400 border border-slate-600'
              }`}>
                {user?.is_paid ? '專業版' : '免費版'}
              </span>
              <span className="text-sm text-slate-400">
                {getStatusText()}
              </span>
            </div>

            <div>
              {user?.is_paid && user?.subscription_cancel_at_period_end ? (
                <Button
                  onClick={handleResumeSubscription}
                  disabled={resuming}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold text-sm cursor-pointer"
                  size="sm"
                >
                  {resuming ? '處理中...' : '恢復訂閱'}
                </Button>
              ) : user?.is_paid ? (
                <Button
                  variant="ghost"
                  onClick={handleCancelSubscription}
                  disabled={cancelling}
                  className="text-slate-500 hover:text-red-400 text-sm cursor-pointer"
                  size="sm"
                >
                  {cancelling ? '處理中...' : '取消訂閱'}
                </Button>
              ) : (
                <Link href="/upgrade">
                  <Button className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold text-sm cursor-pointer" size="sm">
                    升級專業版
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {message && (
            <div className={`text-sm mt-3 p-3 rounded-lg ${
              message.includes('已')
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
            }`}>
              {message}
            </div>
          )}
        </div>

        {/* Trial Promo Banner */}
        {!user?.is_paid && daysAsMember < 7 && (
          <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/5 rounded-2xl border border-amber-500/30 p-5 mb-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-amber-400 font-semibold text-sm mb-1">
                  限時優惠（還剩 {7 - daysAsMember} 天）
                </p>
                <p className="text-white text-lg font-bold">
                  <span className="text-slate-500 line-through text-sm font-normal mr-2">NT$199/月</span>
                  前兩個月 NT$99/月
                </p>
                <p className="text-slate-400 text-xs mt-1">試用結束後升級為原價 NT$199/月</p>
              </div>
              <Link href="/upgrade">
                <Button className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold cursor-pointer" size="sm">
                  立即升級 →
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Sources List (display only) */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">追蹤來源</h2>

          <div className="grid grid-cols-2 gap-3">
            {sources.map(source => (
              <div
                key={source.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-slate-700/50 bg-slate-800/30"
              >
                <img
                  src={sourceImages[source.id] || ''}
                  alt={source.name}
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="font-medium text-white text-sm leading-tight truncate">{source.name}</h3>
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full mt-1 ${
                    source.type === 'podcast'
                      ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {source.type === 'podcast' ? 'Podcast' : 'YouTube'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
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
      <DashboardContent />
    </Suspense>
  );
}
