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
  subscription_amount?: number | null;
  is_unsubscribed?: boolean;
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const [message, setMessage] = useState('');
  const [togglingEmails, setTogglingEmails] = useState(false);
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

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
      const userRes = await fetch('/api/auth/me');
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
    if (!confirm('確定要降為免費方案嗎？本期結束後將不再享有每日摘要。')) return;
    setCancelling(true);
    setMessage('');
    try {
      const res = await fetch('/api/cancel-subscription', { method: 'POST' });
      if (res.ok) {
        setUser(prev => prev ? { ...prev, subscription_cancel_at_period_end: true } : prev);
        setMessageType('success');
        setMessage('已排定降級，本期結束後將轉為免費方案');
      } else {
        const data = await res.json().catch(() => ({}));
        setMessageType('error');
        setMessage(data.error || '取消失敗，請稍後再試');
      }
    } catch {
      setMessageType('error');
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
        setMessageType('success');
        setMessage('已恢復專業版');
      } else {
        const data = await res.json().catch(() => ({}));
        setMessageType('error');
        setMessage(data.error || '恢復失敗，請稍後再試');
      }
    } catch {
      setMessageType('error');
      setMessage('恢復失敗，請稍後再試');
    } finally {
      setResuming(false);
    }
  };

  const handleToggleEmails = async () => {
    const isCurrentlyUnsubscribed = user?.is_unsubscribed;
    if (!isCurrentlyUnsubscribed && !confirm('確定要取消訂閱 Email 嗎？你將不再收到任何郵件。')) return;
    setTogglingEmails(true);
    setMessage('');
    try {
      const res = await fetch('/api/toggle-subscription-emails', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setUser(prev => prev ? { ...prev, is_unsubscribed: data.is_unsubscribed } : prev);
        setMessageType('success');
        setMessage(data.is_unsubscribed ? '已取消訂閱，將不再收到 Email' : '已重新訂閱，將繼續收到 Email');
      } else {
        const data = await res.json().catch(() => ({}));
        setMessageType('error');
        setMessage(data.error || '操作失敗，請稍後再試');
      }
    } catch {
      setMessageType('error');
      setMessage('操作失敗，請稍後再試');
    } finally {
      setTogglingEmails(false);
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

  const daysAsMember = user ? Math.ceil((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;

  const getStatusText = () => {
    if (user?.is_paid) {
      return user.subscription_cancel_at_period_end
        ? '已排定降級，本期結束後轉為免費方案'
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
            <img src="/icon.png" className="w-8 h-8 rounded-lg" alt="懶懶財經速報" />
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

      <div className="max-w-xl mx-auto px-4 py-10 space-y-4">
        {/* Upgrade Success Banner */}
        {upgraded && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center justify-between">
            <span>升級成功！您現在是專業版用戶，將每天收到最新摘要。</span>
            <button onClick={() => setUpgraded(false)} className="text-emerald-400/60 hover:text-emerald-400 cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Message feedback */}
        {message && (
          <div className={`text-sm p-4 rounded-xl ${
            messageType === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
          }`}>
            {message}
          </div>
        )}

        {/* Plan Status Card */}
        <div className={`rounded-xl border p-5 ${
          user?.is_paid
            ? 'bg-slate-800/50 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.04)]'
            : 'bg-slate-800/50 border-slate-700/50'
        }`}>
          <div className="flex items-start gap-4">
            {/* Plan Icon */}
            <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${
              user?.is_paid
                ? 'bg-gradient-to-br from-amber-500/20 to-amber-600/10'
                : 'bg-slate-700/50'
            }`}>
              {user?.is_paid ? (
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              )}
            </div>

            {/* Plan Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-base font-semibold ${user?.is_paid ? 'text-white' : 'text-slate-300'}`}>
                  {user?.is_paid ? '專業版' : '免費版'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  user?.is_paid
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-slate-700/50 text-slate-500'
                }`}>
                  {user?.is_paid ? '每日摘要' : (daysAsMember < 7 ? '試用中' : '每週摘要')}
                </span>
              </div>
              <p className="text-sm text-slate-500">
                {user?.email}
              </p>
              {user?.is_paid && user?.subscription_cancel_at_period_end && (
                <p className="text-xs text-amber-400/80 mt-1.5">已排定降級，本期結束後轉為免費方案</p>
              )}
              {!user?.is_paid && daysAsMember < 7 && (
                <p className="text-xs text-amber-400/80 mt-1.5">
                  試用期間可享每日日報（還剩 {7 - daysAsMember} 天），結束後將改為每週三發送
                </p>
              )}
            </div>

            {/* Upgrade button for free users past trial */}
            {!user?.is_paid && daysAsMember >= 7 && (
              <Link href="/upgrade">
                <Button className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold text-sm cursor-pointer" size="sm">
                  升級
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Upgrade Promo for free users past trial */}
        {!user?.is_paid && daysAsMember >= 7 && (
          <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/5 rounded-xl border border-amber-500/30 p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="font-semibold text-sm text-amber-400 mb-1">升級專業版，每天掌握市場動態</p>
                <p className="text-xs text-slate-400">
                  目前為每週三發送一次 → 升級後<span className="text-white font-medium">每天</span>收到投資日報
                </p>
                <p className="text-white text-lg font-bold mt-2">NT$199/月</p>
              </div>
              <Link href="/upgrade">
                <Button className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold cursor-pointer" size="sm">
                  立即升級 →
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Trial Promo Banner */}
        {!user?.is_paid && daysAsMember < 7 && (() => {
          const daysLeft = 7 - daysAsMember;
          const isUrgent = daysLeft <= 2;
          return (
          <div className={`bg-gradient-to-r rounded-xl p-5 ${
            isUrgent
              ? 'from-red-500/15 to-red-600/5 border border-red-500/40'
              : 'from-amber-500/10 to-amber-600/5 border border-amber-500/30'
          }`}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className={`font-semibold text-sm mb-1 ${isUrgent ? 'text-red-400' : 'text-amber-400'}`}>
                  {isUrgent ? `限時優惠即將結束（還剩 ${daysLeft} 天）` : `限時優惠（還剩 ${daysLeft} 天）`}
                </p>
                <p className="text-white text-lg font-bold">
                  <span className="text-slate-500 line-through text-sm font-normal mr-2">NT$199/月</span>
                  前兩個月 NT$99/月
                </p>
                <p className="text-slate-400 text-xs mt-1">試用結束後如需升級，原價 NT$199/月</p>
              </div>
              <Link href="/upgrade">
                <Button className={`font-semibold cursor-pointer ${
                  isUrgent
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-amber-500 hover:bg-amber-600 text-slate-900'
                }`} size="sm">
                  立即升級 →
                </Button>
              </Link>
            </div>
          </div>
          );
        })()}

        {/* Email Notification Card */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                <svg className="w-4.5 h-4.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300">Email 通知</p>
                <p className="text-xs text-slate-500">
                  {user?.is_unsubscribed
                    ? '已暫停，不會收到任何郵件'
                    : user?.is_paid
                      ? '每天發送最新投資摘要'
                      : daysAsMember < 7
                        ? '試用期間每天發送'
                        : '每週三發送投資摘要'
                  }
                </p>
              </div>
            </div>
            {!user?.is_paid && (
              <Button
                variant="ghost"
                onClick={handleToggleEmails}
                disabled={togglingEmails}
                className={`text-sm cursor-pointer ${
                  user?.is_unsubscribed
                    ? 'text-amber-400 hover:text-amber-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                size="sm"
              >
                {togglingEmails ? '處理中...' : (user?.is_unsubscribed ? '重新訂閱' : '暫停通知')}
              </Button>
            )}
          </div>
        </div>

        {/* Subscription Management Card */}
        {user?.is_paid && (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4.5 h-4.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300">訂閱管理</p>
                  <p className="text-xs text-slate-500">
                    {user.subscription_cancel_at_period_end
                      ? '將於帳期結束後降為免費方案'
                      : `NT$${user.subscription_amount ?? 199}/月，可隨時取消`
                    }
                  </p>
                </div>
              </div>
              {user.subscription_cancel_at_period_end ? (
                <Button
                  onClick={handleResumeSubscription}
                  disabled={resuming}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold text-sm cursor-pointer"
                  size="sm"
                >
                  {resuming ? '處理中...' : '恢復訂閱'}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={handleCancelSubscription}
                  disabled={cancelling}
                  className="text-slate-500 hover:text-red-400 text-sm cursor-pointer"
                  size="sm"
                >
                  {cancelling ? '處理中...' : '取消訂閱'}
                </Button>
              )}
            </div>
          </div>
        )}
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
