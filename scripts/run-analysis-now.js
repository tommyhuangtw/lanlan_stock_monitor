require('dotenv').config();
var YahooFinance = require('yahoo-finance2').default;
var { createClient } = require('@supabase/supabase-js');
var { RSI, SMA, BollingerBands } = require('technicalindicators');

var yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
var supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function computeRSI(closes) {
  if (closes.length < 15) return null;
  var result = RSI.calculate({ values: closes, period: 14 });
  return result.length > 0 ? result[result.length - 1] : null;
}

function computeSMA(closes, period) {
  if (closes.length < period) return null;
  var result = SMA.calculate({ values: closes, period: period });
  return result.length > 0 ? result[result.length - 1] : null;
}

function computeBB(closes) {
  if (closes.length < 20) return null;
  var result = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
  return result.length > 0 ? result[result.length - 1] : null;
}

async function run() {
  var { data: stocks } = await supabase
    .from('watchlist_stocks')
    .select('*')
    .eq('status', 'active');

  console.log('Processing ' + stocks.length + ' stocks...\n');

  var alerts = [];

  for (var s of stocks) {
    try {
      // Fetch 90 days history
      var endDate = new Date();
      var startDate = new Date();
      startDate.setDate(startDate.getDate() - 120);

      var history = await yf.historical(s.ticker_normalized, {
        period1: startDate,
        period2: endDate,
        interval: '1d'
      });

      if (history.length < 20) {
        console.log(s.ticker_normalized + ': insufficient data (' + history.length + ' days)');
        continue;
      }

      // Store prices
      for (var bar of history) {
        await supabase.from('stock_prices').upsert({
          ticker_normalized: s.ticker_normalized,
          price_date: bar.date.toISOString().split('T')[0],
          open_price: bar.open || bar.close,
          high_price: bar.high || bar.close,
          low_price: bar.low || bar.close,
          close_price: bar.close,
          volume: bar.volume || 0
        }, { onConflict: 'ticker_normalized,price_date' });
      }

      var closes = history.map(function(b) { return b.close; });
      var currentPrice = closes[closes.length - 1];

      // Update current price
      await supabase.from('watchlist_stocks').update({
        current_price: currentPrice,
        price_at_first_mention: currentPrice,
        last_price_update: new Date().toISOString()
      }).eq('id', s.id);

      // Technical analysis
      var rsi14 = computeRSI(closes);
      var sma20 = computeSMA(closes, 20);
      var sma50 = computeSMA(closes, 50);
      var sma200 = computeSMA(closes, 200);
      var bb = computeBB(closes);

      // 20-day high
      var recent20 = closes.slice(-20);
      var high20 = Math.max.apply(null, recent20);
      var dropFrom20High = ((currentPrice - high20) / high20) * 100;

      // 52-week high (use available data)
      var allHighs = history.map(function(b) { return b.high || b.close; });
      var high52w = Math.max.apply(null, allHighs);
      var dropFrom52wHigh = ((currentPrice - high52w) / high52w) * 100;

      // 20-day price range
      var low20 = Math.min.apply(null, recent20);
      var range20pct = ((high20 - low20) / low20) * 100;

      var line = s.market + ' ' + s.ticker_normalized + ': $' + currentPrice.toFixed(2);
      line += ' | RSI:' + (rsi14 !== null ? rsi14.toFixed(1) : 'N/A');
      line += ' | 20d drop:' + dropFrom20High.toFixed(1) + '%';
      line += ' | Range:' + range20pct.toFixed(1) + '%';
      if (sma50) line += ' | SMA50:' + sma50.toFixed(2);
      console.log(line);

      // === DETECT ENTRY POINTS ===
      var stockAlerts = [];

      var cur = s.market === 'TW' ? 'NT$' : '$';

      // Rule 1: Significant drop from 20-day high
      if (dropFrom20High <= -5) {
        stockAlerts.push({
          type: dropFrom20High <= -20 ? 'significant_drop_20pct' :
                dropFrom20High <= -10 ? 'significant_drop_10pct' : 'significant_drop_5pct',
          reason: '股價從近 20 天最高點 ' + cur + high20.toFixed(2) + ' 回跌了 ' + Math.abs(dropFrom20High).toFixed(1) + '%，可能是逢低佈局的機會',
          price: currentPrice
        });
      }

      // Rule 2: RSI oversold
      if (rsi14 !== null && rsi14 < 30) {
        stockAlerts.push({
          type: 'rsi_oversold',
          reason: '市場熱度偏冷（' + rsi14.toFixed(0) + ' 分），賣壓已釋放大半，歷史上此時反彈機率較高',
          price: currentPrice
        });
      }

      // Rule 3: Consolidation (tight range + low BB width)
      if (range20pct < 8 && bb) {
        var bbWidth = (bb.upper - bb.lower) / bb.middle * 100;
        if (bbWidth < 10) {
          stockAlerts.push({
            type: 'consolidation',
            reason: '股價已連續盤整，近 20 天波動很小（僅 ' + range20pct.toFixed(1) + '%），通常盤整結束後會有一波較大的行情',
            price: currentPrice
          });
        }
      }

      // Rule 5: SMA support
      if (sma200 && currentPrice > sma200 * 0.97 && currentPrice < sma200 * 1.03) {
        stockAlerts.push({
          type: 'sma_support',
          reason: '股價接近 200 天均價 ' + cur + sma200.toFixed(2) + '（長線支撐），若能守住通常是中長線的好買點',
          price: currentPrice
        });
      }
      if (sma50 && currentPrice > sma50 * 0.97 && currentPrice < sma50 * 1.02 && sma50 > (sma200 || 0)) {
        stockAlerts.push({
          type: 'sma_support',
          reason: '股價回到 50 天均價 ' + cur + sma50.toFixed(2) + ' 附近，整體趨勢仍向上，拉回可能是買入機會',
          price: currentPrice
        });
      }

      if (stockAlerts.length > 0) {
        console.log('  ⚠️  ' + stockAlerts.length + ' alert(s): ' + stockAlerts.map(function(a) { return a.type; }).join(', '));
        for (var alert of stockAlerts) {
          alerts.push({
            ticker: s.ticker,
            ticker_normalized: s.ticker_normalized,
            market: s.market,
            type: alert.type,
            reason: alert.reason,
            price: alert.price,
            rsi: rsi14,
            sma50: sma50,
            sma200: sma200,
            bbLower: bb ? bb.lower : null,
            kol_sources: s.kol_sources
          });
        }
      }

      await new Promise(function(r) { setTimeout(r, 300); });
    } catch(e) {
      console.log(s.ticker_normalized + ': ERROR - ' + e.message);
    }
  }

  console.log('\n========================================');
  console.log('ALERTS SUMMARY: ' + alerts.length + ' total alerts');
  console.log('========================================\n');

  if (alerts.length === 0) {
    console.log('No entry point signals detected.');
    return;
  }

  for (var a of alerts) {
    console.log(a.market + ' ' + a.ticker + ' (' + a.ticker_normalized + ')');
    console.log('  Type: ' + a.type);
    console.log('  Price: $' + a.price.toFixed(2));
    console.log('  Reason: ' + a.reason);
    if (a.rsi) console.log('  RSI(14): ' + a.rsi.toFixed(1));
    if (a.sma50) console.log('  SMA(50): $' + a.sma50.toFixed(2));
    if (a.sma200) console.log('  SMA(200): $' + a.sma200.toFixed(2));
    console.log('');

    // Save alert to DB
    await supabase.from('stock_alerts').insert({
      ticker: a.ticker,
      market: a.market,
      alert_type: a.type,
      trigger_price: a.price,
      trigger_reason: a.reason,
      technical_snapshot: { rsi14: a.rsi, sma50: a.sma50, sma200: a.sma200, bbLower: a.bbLower },
      kol_context: a.kol_sources || [],
      status: 'pending'
    });
  }

  // Send LINE notification
  var token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  var groupId = process.env.LINE_GROUP_ID;

  if (token && groupId) {
    var msgLines = ['📊 懶懶財經觀察 - 入場時機提醒\n'];

    for (var a of alerts) {
      var emoji = a.market === 'US' ? '🇺🇸' : '🇹🇼';
      var currency = a.market === 'TW' ? 'NT$' : '$';
      // Use ticker (which has Chinese name for TW stocks) instead of ticker_normalized
      var displayName = a.ticker;
      msgLines.push(emoji + ' ' + displayName + ' ' + currency + a.price.toFixed(2));
      msgLines.push('📌 ' + a.reason);
      if (a.rsi) {
        var heatDesc = a.rsi < 30 ? '偏冷，賣壓釋放大半' :
                       a.rsi < 40 ? '偏弱，買氣不足' :
                       a.rsi < 60 ? '中性' :
                       a.rsi < 70 ? '偏熱' : '過熱，追高風險大';
        msgLines.push('市場熱度：' + a.rsi.toFixed(0) + ' 分（' + heatDesc + '）');
      }
      msgLines.push('');
    }

    msgLines.push('💡 市場熱度說明：0-30 偏冷（可能接近低點）、30-70 中性、70-100 過熱（追高風險大）');
    msgLines.push('');
    msgLines.push('⚠️ 以上為技術指標與 KOL 公開觀點彙整，僅供教育參考，非投資建議。');

    var res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        to: groupId,
        messages: [{ type: 'text', text: msgLines.join('\n') }]
      })
    });

    console.log('LINE notification sent: ' + res.status);
  }
}

run().catch(function(e) { console.error(e); });
