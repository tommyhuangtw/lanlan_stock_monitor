'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('請輸入 Email');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '發送失敗');
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
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
          <Link href="/signup" className="text-slate-400 hover:text-white transition-colors text-sm cursor-pointer">
            免費註冊
          </Link>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-16">
        {sent ? (
          // Success state
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">檢查你的信箱</h1>
            <p className="text-slate-400 mb-6">
              我們已將登入連結發送到<br />
              <span className="text-amber-400 font-medium">{email}</span>
            </p>
            <p className="text-sm text-slate-500 mb-8">
              連結將在 15 分鐘後失效
            </p>
            <Button
              variant="outline"
              onClick={() => { setSent(false); setEmail(''); }}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              使用其他 Email
            </Button>
          </div>
        ) : (
          // Login form
          <>
            <div className="text-center mb-10">
              <h1 className="text-3xl font-bold text-white mb-3">
                登入帳戶
              </h1>
              <p className="text-slate-400">
                輸入你的 Email，我們會發送登入連結
              </p>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 h-12 focus:border-amber-500 focus:ring-amber-500/20"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold h-12 cursor-pointer transition-all"
                  size="lg"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      發送中...
                    </span>
                  ) : '發送登入連結'}
                </Button>

                <div className="text-center">
                  <p className="text-sm text-slate-500">
                    還沒有帳戶？{' '}
                    <Link href="/signup" className="text-amber-400 hover:text-amber-300 cursor-pointer transition-colors">
                      免費註冊
                    </Link>
                  </p>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
