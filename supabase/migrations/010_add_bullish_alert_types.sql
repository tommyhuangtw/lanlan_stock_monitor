-- Add bullish alert types: significant_surge_5pct, breakout_new_high
-- Also adds volume_surge which was missing from the original constraint

ALTER TABLE stock_alerts DROP CONSTRAINT IF EXISTS stock_alerts_alert_type_check;
ALTER TABLE stock_alerts ADD CONSTRAINT stock_alerts_alert_type_check
  CHECK (alert_type IN (
    'significant_drop_5pct',
    'significant_drop_10pct',
    'significant_drop_20pct',
    'rsi_oversold',
    'consolidation',
    'near_kol_support',
    'sma_support',
    'ai_entry_signal',
    'volume_surge',
    'significant_surge_5pct',
    'breakout_new_high'
  ));
