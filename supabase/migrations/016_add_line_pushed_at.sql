-- Marks an episode as already pushed to LINE, so the Gooaye watcher can run
-- every hour without re-sending the same episode.
ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS line_pushed_at TIMESTAMPTZ;

COMMENT ON COLUMN episodes.line_pushed_at IS
  'When this episode was pushed to LINE. NULL means never pushed.';
