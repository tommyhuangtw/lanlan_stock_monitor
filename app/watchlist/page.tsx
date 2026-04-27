'use client';

import { useState, useEffect, useCallback } from 'react';

interface WatchlistStock {
  id: number;
  ticker: string;
  ticker_normalized: string;
  market: 'US' | 'TW';
  name: string | null;
  status: string;
  current_price: number | null;
  price_at_first_mention: number | null;
  last_price_update: string | null;
  mention_count: number;
  kol_sources: Array<{ kol: string; reason: string; date: string; confidence: string }>;
  consensus: string | null;
  sector_theme: string | null;
  added_by: string;
  first_mentioned_at: string;
  last_mentioned_at: string;
}

interface StockAlert {
  id: number;
  ticker: string;
  market: string;
  alert_type: string;
  trigger_price: number;
  trigger_reason: string;
  status: string;
  created_at: string;
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  'significant_drop_5pct': '回檔 5%+',
  'significant_drop_10pct': '回檔 10%+',
  'significant_drop_20pct': '回檔 20%+',
  'rsi_oversold': 'RSI 超賣',
  'consolidation': '盤整',
  'near_kol_support': '接近支撐位',
  'sma_support': '均線支撐',
  'ai_entry_signal': 'AI 入場訊號',
};

export default function WatchlistPage() {
  const [stocks, setStocks] = useState<WatchlistStock[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [filter, setFilter] = useState<'all' | 'US' | 'TW'>('all');

  const fetchData = useCallback(async () => {
    try {
      const [stocksRes, alertsRes] = await Promise.all([
        fetch('/api/watchlist/stocks'),
        fetch('/api/watchlist/alerts'),
      ]);

      if (stocksRes.ok) {
        const data = await stocksRes.json();
        setStocks(data.stocks || []);
      }
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error('Failed to fetch watchlist data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Simple session check
    const token = sessionStorage.getItem('watchlist_auth');
    if (token === 'authenticated') {
      setAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      fetchData();
    }
  }, [authenticated, fetchData]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/watchlist/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAuthenticated(true);
      sessionStorage.setItem('watchlist_auth', 'authenticated');
    } else {
      alert('密碼錯誤');
    }
  };

  const handleToggleStatus = async (stockId: number, newStatus: string) => {
    const res = await fetch('/api/watchlist/stocks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: stockId, status: newStatus }),
    });
    if (res.ok) {
      fetchData();
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <form onSubmit={handleAuth} className="bg-white p-8 rounded-lg shadow-md w-80">
          <h1 className="text-xl font-bold mb-4 text-center">📊 股票觀察清單</h1>
          <input
            type="password"
            placeholder="請輸入密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded mb-4"
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          >
            登入
          </button>
        </form>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">載入中...</p>
      </div>
    );
  }

  const filteredStocks = stocks.filter(s =>
    filter === 'all' || s.market === filter
  );

  const activeStocks = filteredStocks.filter(s => s.status === 'active');
  const pausedStocks = filteredStocks.filter(s => s.status === 'paused');

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">📊 股票觀察清單</h1>
          <div className="flex gap-2">
            {(['all', 'US', 'TW'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-sm ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 border hover:bg-gray-100'
                }`}
              >
                {f === 'all' ? '全部' : f === 'US' ? '🇺🇸 美股' : '🇹🇼 台股'}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="text-2xl font-bold">{activeStocks.length}</div>
            <div className="text-sm text-gray-500">監控中</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="text-2xl font-bold">{alerts.filter(a => a.status === 'sent').length}</div>
            <div className="text-sm text-gray-500">已發通知</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="text-2xl font-bold">{alerts.filter(a => a.status === 'pending').length}</div>
            <div className="text-sm text-gray-500">待處理</div>
          </div>
        </div>

        {/* Recent Alerts */}
        {alerts.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm mb-6 overflow-hidden">
            <div className="p-4 border-b bg-amber-50">
              <h2 className="font-semibold">🔔 最近通知</h2>
            </div>
            <div className="divide-y">
              {alerts.slice(0, 10).map(alert => (
                <div key={alert.id} className="p-4 flex items-start gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    alert.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {alert.status === 'sent' ? '已發送' : '待處理'}
                  </span>
                  <div className="flex-1">
                    <div className="font-medium">
                      {alert.market === 'US' ? '🇺🇸' : '🇹🇼'} {alert.ticker}
                      <span className="ml-2 text-xs text-gray-500">
                        {ALERT_TYPE_LABELS[alert.alert_type] || alert.alert_type}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">{alert.trigger_reason}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(alert.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Stocks */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-6">
          <div className="p-4 border-b">
            <h2 className="font-semibold">📈 監控中 ({activeStocks.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">股票</th>
                  <th className="text-right p-3">現價</th>
                  <th className="text-right p-3">首次提及價</th>
                  <th className="text-center p-3">KOL 提及</th>
                  <th className="text-center p-3">共識</th>
                  <th className="text-left p-3">來源</th>
                  <th className="text-center p-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeStocks.map(stock => {
                  const priceChange = stock.current_price && stock.price_at_first_mention
                    ? ((stock.current_price - stock.price_at_first_mention) / stock.price_at_first_mention * 100)
                    : null;
                  return (
                    <tr key={stock.id} className="hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-medium">
                          {stock.market === 'US' ? '🇺🇸' : '🇹🇼'} {stock.ticker}
                        </div>
                        {stock.sector_theme && (
                          <div className="text-xs text-purple-600 mt-0.5">🏷️ {stock.sector_theme}</div>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {stock.current_price?.toFixed(2) || '—'}
                        {priceChange !== null && (
                          <div className={`text-xs ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right text-gray-500">
                        {stock.price_at_first_mention?.toFixed(2) || '—'}
                      </td>
                      <td className="p-3 text-center">
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
                          {stock.mention_count}次
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          stock.consensus === '多方共識' ? 'bg-green-100 text-green-700' :
                          stock.consensus === '觀點分歧' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {stock.consensus || '—'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="text-xs text-gray-500 max-w-48 truncate">
                          {stock.kol_sources?.map(k => k.kol).join(', ') || stock.added_by}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleStatus(stock.id, 'paused')}
                          className="text-xs text-yellow-600 hover:underline"
                        >
                          暫停
                        </button>
                        <span className="mx-1 text-gray-300">|</span>
                        <button
                          onClick={() => handleToggleStatus(stock.id, 'archived')}
                          className="text-xs text-red-600 hover:underline"
                        >
                          移除
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {activeStocks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      尚無監控中的股票。Pipeline 運行後會自動加入 KOL 看好的標的。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Paused Stocks */}
        {pausedStocks.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-gray-500">⏸️ 已暫停 ({pausedStocks.length})</h2>
            </div>
            <div className="divide-y">
              {pausedStocks.map(stock => (
                <div key={stock.id} className="p-3 flex items-center justify-between text-gray-500">
                  <span>{stock.market === 'US' ? '🇺🇸' : '🇹🇼'} {stock.ticker}</span>
                  <button
                    onClick={() => handleToggleStatus(stock.id, 'active')}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    恢復監控
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="mt-8 text-center text-xs text-gray-400">
          <p>⚠️ 以上為技術指標與 KOL 公開觀點彙整，僅供教育參考，非投資建議。</p>
          <p className="mt-1">懶懶財經速報 — 股票觀察系統</p>
        </div>
      </div>
    </div>
  );
}
