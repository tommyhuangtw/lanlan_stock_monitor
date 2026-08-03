/**
 * OpenAI Speech-to-Text
 *
 * Unlike AssemblyAI (submit a URL, poll an async job), OpenAI's transcription
 * endpoint takes a multipart file upload capped at 25 MB and returns
 * synchronously. Podcast episodes here run 27–55 MB, so every one of them has
 * to be fetched and re-encoded before it can be sent.
 *
 * Re-encoding to 16 kHz mono 32 kbps costs nothing in transcription accuracy
 * (speech recognition downsamples to 16 kHz anyway) and lands a 60-minute
 * episode at roughly 14 MB — one upload, no splitting, so no sentences get cut
 * at a chunk boundary. Only episodes past ~1.7 h need segmenting.
 */
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import OpenAI from 'openai';
import { log } from './logger';

/**
 * Two separate limits apply, so audio is always segmented rather than sized:
 *   - 25 MB per upload (all models)
 *   - a context-window cap on gpt-4o-*-transcribe, which rejects long audio
 *     with `input_too_large` well before 25 MB is reached
 * 15 minutes at 32 kbps mono is ~3.6 MB, comfortably inside both. A 60-minute
 * episode becomes 4 requests with 3 cut points — a few clipped words that don't
 * matter for pulling stock mentions out of the transcript.
 */
const SEGMENT_SECONDS = 900; // 15 min

const BITRATE = '32k';

export const OPENAI_TRANSCRIBE_MODEL =
  process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', d => { stderr += d; });
    p.on('error', reject);
    p.on('close', code =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-500)}`)),
    );
  });
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${url}`);
  // Buffer to disk — ffmpeg needs a seekable input for reliable MP3 handling.
  await writeFile(dest, Readable.fromWeb(res.body as never));
}

/** Re-encode to a small mono MP3 that OpenAI will accept. */
async function compress(src: string, dest: string): Promise<void> {
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', src,
    '-vn',              // podcasts occasionally ship cover art as a video stream
    '-ac', '1',         // mono
    '-ar', '16000',     // 16 kHz — what ASR uses internally
    '-b:a', BITRATE,
    '-y', dest,
  ]);
}

/** Split an already-compressed file into fixed-length segments. */
async function segment(src: string, dir: string): Promise<string[]> {
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', src,
    '-f', 'segment',
    '-segment_time', String(SEGMENT_SECONDS),
    '-c', 'copy',
    path.join(dir, 'part%03d.mp3'),
  ]);
  const parts = (await readdir(dir)).filter(f => f.startsWith('part')).sort();
  return parts.map(f => path.join(dir, f));
}

/**
 * `language: 'zh'` alone yields Simplified Chinese with no punctuation, which
 * breaks downstream matching — analyze.ts pulls out company names and
 * matchesStock compares them against Traditional tickers like 台積電.
 * The prompt steers script and punctuation, and seeding it with common tickers
 * measurably improves how often they come back spelled correctly.
 */
const STYLE_PROMPT =
  '以下是台灣財經 Podcast 的內容，請以繁體中文輸出，並加上標點符號。' +
  '內容常提到台積電、聯發科、鴻海、輝達、特斯拉、蘋果、美光、博通等公司。';

async function transcribeFile(file: string): Promise<string> {
  const res = await openai.audio.transcriptions.create({
    file: createReadStream(file),
    model: OPENAI_TRANSCRIBE_MODEL,
    language: 'zh',
    prompt: STYLE_PROMPT,
    response_format: 'text',
  });
  // response_format 'text' resolves to a plain string.
  return typeof res === 'string' ? res : (res as { text: string }).text;
}

/**
 * Fetch an audio URL and return its transcript.
 * Throws on failure so the caller can record the reason on the job.
 */
export async function transcribeAudioUrl(audioUrl: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'stt-'));
  try {
    const src = path.join(dir, 'source');
    await download(audioUrl, src);

    const compressed = path.join(dir, 'audio.mp3');
    await compress(src, compressed);

    const size = (await stat(compressed)).size;
    const parts = await segment(compressed, dir);

    log('info', `[OpenAI STT] ${(size / 1048576).toFixed(1)} MB → ${parts.length} part(s)`);

    const texts: string[] = [];
    for (const part of parts) {
      texts.push((await transcribeFile(part)).trim());
    }

    const transcript = texts.join(' ').trim();
    if (!transcript) throw new Error('OpenAI returned an empty transcript');
    return transcript;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
