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

      {/* Sources Showcase */}
      <div className="max-w-5xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-white mb-4">我們追蹤的來源</h2>
          <p className="text-slate-400">站在巨人的肩膀上 — 我們鼓勵你訂閱這些優質創作者</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Gooaye 股癌 */}
          <SourceCard
            name="Gooaye 股癌"
            host="謝孟恭"
            type="podcast"
            image="/sources/股涯.webp"
            rating="4.8"
            reviews="3.5萬+"
            links={[
              { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/tw/podcast/gooaye-%E8%82%A1%E7%99%8C/id1500839292' },
              { label: 'Spotify', url: 'https://open.spotify.com/show/1zWxx5pKk0XBEzMupVC7UZ' },
              { label: 'KKBOX', url: 'https://podcast.kkbox.com/sg/channel/0ogFO_N3A9IEgjUEhY' },
            ]}
          />
          {/* 美股航海王｜指數流 */}
          <SourceCard
            name="美股航海王｜指數流"
            host="傑克·史派羅"
            type="podcast"
            image="/sources/美股航海王.webp"
            rating="4.9"
            reviews="2,300+"
            links={[
              { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/tw/podcast/%E7%BE%8E%E8%82%A1%E8%88%AA%E6%B5%B7%E7%8E%8B-%E6%8C%87%E6%95%B8%E6%B5%81/id1689219140' },
              { label: 'Spotify', url: 'https://open.spotify.com/show/16unn8TIxj7OQ2exSd0NPk' },
              { label: 'KKBOX', url: 'https://podcast.kkbox.com/sg/channel/P_WUCQ1b7808qRJRVC' },
            ]}
          />
          {/* 美股投資學-財女珍妮 */}
          <SourceCard
            name="美股投資學-財女珍妮"
            host="財女 Jenny"
            type="podcast"
            image="/sources/Jenny美股投資學.webp"
            rating="4.8"
            reviews="2,120+"
            links={[
              { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/us/podcast/%E7%BE%8E%E8%82%A1%E6%8A%95%E8%B3%87%E5%AD%B8-%E8%B2%A1%E5%A5%B3%E7%8F%8D%E5%A6%AE/id1546879892' },
              { label: 'Spotify', url: 'https://open.spotify.com/show/3dTKJkvceKNHaYoh7Przbg' },
              { label: 'KKBOX', url: 'https://podcast.kkbox.com/tw/channel/0rQ3Nqkt3BhkWsKc3Y' },
            ]}
          />
          {/* 游庭皓的財經皓角 */}
          <SourceCard
            name="游庭皓的財經皓角"
            host="游庭皓"
            type="podcast"
            image="/sources/游庭皓的財經皓角.webp"
            rating="4.6"
            reviews="1,873+"
            links={[
              { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/tw/podcast/%E6%B8%B8%E5%BA%AD%E7%9A%93%E7%9A%84%E8%B2%A1%E7%B6%93%E7%9A%93%E8%A7%92/id1488295306' },
              { label: 'Spotify', url: 'https://open.spotify.com/show/1HOGxT9M7a6kpcDi4q27Q7' },
              { label: 'KKBOX', url: 'https://podcast.kkbox.com/sg/channel/P_QhqQ1b7808pZTCQ0' },
            ]}
          />
          {/* 韭菜畢業班 */}
          <SourceCard
            name="韭菜畢業班"
            host="叔叔"
            type="podcast"
            image="/sources/韭菜畢業班.webp"
            rating="5.0"
            reviews="5,137+"
            links={[
              { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/tw/podcast/%E9%9F%AD%E8%8F%9C%E7%95%A2%E6%A5%AD%E7%8F%AD/id1711618619' },
              { label: 'Spotify', url: 'https://open.spotify.com/show/66ENh5UtNA3pPNOT0IZjO1' },
              { label: 'KKBOX', url: 'https://podcast.kkbox.com/sg/channel/_Xr8gNm40P-sxy2TQw' },
            ]}
          />
          {/* Nick 美股咖啡館 */}
          <SourceCard
            name="Nick 美股咖啡館"
            type="youtube"
            image="/sources/Nick美股咖啡館.jpg"
            subscribers="15.3萬"
            links={[
              { label: 'YouTube', url: 'https://www.youtube.com/@nick_valueinvesting' },
            ]}
          />
          {/* NaNa說美股 */}
          <SourceCard
            name="NaNa說美股"
            type="youtube"
            image="/sources/nana說美股.jpg"
            subscribers="30.4萬"
            links={[
              { label: 'YouTube', url: 'https://www.youtube.com/channel/UCFhJ8ZFg9W4kLwFTBBNIjOw' },
            ]}
          />
          {/* 陽光財經 */}
          <SourceCard
            name="陽光財經"
            type="youtube"
            image="/sources/陽光財經.jpg"
            subscribers="29.6萬"
            links={[
              { label: 'YouTube', url: 'https://www.youtube.com/channel/UC2I5em6UyBpQiO-8ZW0nV3w' },
            ]}
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

function SourceCard({
  name,
  host,
  type,
  image,
  rating,
  reviews,
  subscribers,
  links,
}: {
  name: string;
  host?: string;
  type: 'podcast' | 'youtube';
  image: string;
  rating?: string;
  reviews?: string;
  subscribers?: string;
  links: { label: string; url: string }[];
}) {
  return (
    <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 hover:border-amber-500/30 transition-all">
      <div className="flex items-start gap-4 mb-4">
        <img
          src={image}
          alt={name}
          className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
        />
        <div className="min-w-0">
          <h3 className="font-semibold text-white text-sm leading-tight mb-1">{name}</h3>
          {host && <p className="text-slate-500 text-xs mb-1.5">{host}</p>}
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${
            type === 'podcast'
              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {type === 'podcast' ? 'Podcast' : 'YouTube'}
          </span>
        </div>
      </div>

      {(rating || subscribers) && (
        <div className="mb-4">
          {rating && (
            <div className="flex items-center gap-1.5 text-sm">
              <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-white font-medium">{rating}</span>
              <span className="text-slate-500 text-xs">({reviews} 則評分)</span>
            </div>
          )}
          {subscribers && (
            <div className="flex items-center gap-1.5 text-sm">
              <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
              <span className="text-white font-medium">{subscribers}</span>
              <span className="text-slate-500 text-xs">訂閱者</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 hover:text-white transition-colors"
          >
            {link.label === 'YouTube' && (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
                <path fill="#0F172A" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            )}
            {link.label === 'Apple Podcasts' && (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5.34 0A5.328 5.328 0 000 5.34v13.32A5.328 5.328 0 005.34 24h13.32A5.328 5.328 0 0024 18.66V5.34A5.328 5.328 0 0018.66 0zm6.525 2.568c4.988 0 7.455 3.582 7.455 6.774 0 2.085-1.146 3.573-2.64 3.573-1.254 0-2.022-.852-2.022-2.1 0-1.29.81-2.076 2.022-2.076.192 0 .396.024.588.072-.168-1.908-1.71-3.894-4.29-3.894-2.976 0-5.22 2.502-5.22 6.126 0 3.39 1.974 6.264 5.1 6.264 1.002 0 1.974-.228 2.76-.636l.456.81c-.888.468-2.028.756-3.216.756-4.242 0-7.32-3.378-7.32-7.47 0-4.326 3.24-8.199 8.327-8.199zm-.198 8.616c.9 0 1.596.744 1.596 1.68 0 .516-.192.96-.504 1.296l.648 3.336h-3.48l.648-3.336a1.716 1.716 0 01-.504-1.296c0-.936.696-1.68 1.596-1.68z" />
              </svg>
            )}
            {link.label === 'Spotify' && (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
            )}
            {link.label === 'KKBOX' && (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.5 16.5h-3v-9h3v3.75L14.25 7.5h3.375L13.5 12l4.125 4.5H14.25L10.5 12.75V16.5z" />
              </svg>
            )}
            {link.label}
          </a>
        ))}
      </div>
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
