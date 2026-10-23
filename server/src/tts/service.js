// 自然な 声（GET /api/tts?t=…&lang=en|ja → audio/mpeg）。
//
// ブラウザの 声（speechSynthesis）は 端末で ちがい、iPad の 一部では「ロボットみたい」と 言われる。
// ここで OpenAI の TTS（OPENAI_API_KEY・OPENAI_TTS_MODEL、既定 gpt-4o-mini-tts）で 作り、
// DATA_DIR/tts/<hash>.mp3 に のこす。同じ 文は 2 回目から ファイルを 返すだけ（お金も 時間も かからない）。
// 鍵が なければ 503 を 返し、ブラウザは いつもの 声に もどる（オフラインでも 同じ）。
// 守り：文は 300 字まで・1 つの IP から 1 分 60 回まで・新しく 作るのは 1 日 TTS_DAILY_NEW 回まで。
// 動画の ナレーションなどで 声を えらぶ ときは &voice=（下の 一覧だけ）と &style=narr（大人むけの 落ちついた 語り）。
// ゲームは どちらも つけないので、いつもの 声と キャッシュの ままで かわらない。
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { rateLimit } from '../privacy.js';

export const MAX_CHARS = 300;
const JA = /[぀-ゟ゠-ヿ㐀-鿿]/;
// 英語は 子どもが まねる 音なので ゆっくり・はっきり。日本語は ふつうの 説明の 声。
const STYLE = {
  en: 'Speak in clear, warm American English for a young child learning English. Speak slowly and pronounce every word clearly.',
  ja: '小学生に 話しかける、やさしく 自然な 日本語で 読んで ください。',
};

export const VOICES = ['alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'fable', 'marin', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];
const NARR = {
  en: 'Speak as a calm, friendly professional narrator for a product video. Natural pace, warm and clear.',
  ja: '製品紹介動画の ナレーターとして、大人に むけて 落ちついた 自然な 日本語で、はっきり 聞きやすく 読んで ください。',
};

export function ttsKey({ model, voice, lang, text }) {
  return createHash('sha256').update(`${model}\n${voice}\n${lang}\n${text}`).digest('hex').slice(0, 40);
}

export function cleanText(t) {
  return String(t ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/[　\s]+/g, ' ').trim();
}

// generate(text, { lang, model, voice, instructions }) → Buffer（テストでは にせものを わたす）
export function createTts({ dir, apiKey = '', model = 'gpt-4o-mini-tts', voice = 'coral', dailyNew = 3000, timeoutMs = 15000, generate = null, log = console, now = Date.now } = {}) {
  let clientPromise = null;
  const openai = async (text, opts) => {
    if (!clientPromise) clientPromise = import('openai').then(({ default: OpenAI }) => new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 1 }));
    const client = await clientPromise;
    const res = await client.audio.speech.create({ model: opts.model, voice: opts.voice, input: text, instructions: opts.instructions, response_format: 'mp3' });
    return Buffer.from(await res.arrayBuffer());
  };
  const make = generate || (apiKey ? openai : null);
  const pending = new Map(); // 同じ 文を 同時に たのまれても 1 回だけ 作る
  let day = ''; let made = 0;

  async function get(rawText, rawLang, { voice: rawVoice = '', style: rawStyle = '' } = {}) {
    const text = cleanText(rawText);
    if (!text) return { status: 400 };
    if (text.length > MAX_CHARS) return { status: 413 };
    const lang = rawLang === 'ja' || rawLang === 'en' ? rawLang : (JA.test(text) ? 'ja' : 'en');
    const v = VOICES.includes(rawVoice) ? rawVoice : voice;
    const narr = rawStyle === 'narr';
    const key = ttsKey({ model, voice: v, lang: narr ? `${lang}:narr` : lang, text });
    const file = dir ? path.join(dir, `${key}.mp3`) : '';
    if (file) { try { return { status: 200, audio: await fs.readFile(file), cached: true }; } catch { /* まだ ない */ } }
    if (!make) return { status: 503 };
    if (pending.has(key)) return pending.get(key);
    const today = new Date(now()).toISOString().slice(0, 10);
    if (today !== day) { day = today; made = 0; }
    if (made >= dailyNew) return { status: 503 };
    made += 1;
    const job = (async () => {
      try {
        const audio = await make(text, { lang, model, voice: v, instructions: (narr ? NARR : STYLE)[lang] });
        if (!audio?.length) return { status: 502 };
        if (file) {
          try { await fs.mkdir(dir, { recursive: true }); await fs.writeFile(`${file}.tmp`, audio); await fs.rename(`${file}.tmp`, file); }
          catch (err) { log.warn?.('[tts] could not cache:', err.message); }
        }
        return { status: 200, audio, cached: false };
      } catch (err) {
        log.warn?.('[tts] failed:', err.message);
        return { status: 502 };
      } finally { pending.delete(key); }
    })();
    pending.set(key, job);
    return job;
  }

  function mount(app) {
    app.get('/api/tts', rateLimit({ windowMs: 60_000, max: 60 }), async (req, res) => {
      const out = await get(req.query.t, req.query.lang, { voice: String(req.query.voice || ''), style: String(req.query.style || '') });
      if (out.status !== 200) { res.status(out.status).set('Cache-Control', 'no-store').end(); return; }
      res.set('Cache-Control', 'public, max-age=31536000, immutable').type('audio/mpeg').send(out.audio);
    });
  }

  return { get, mount, get enabled() { return !!make; } };
}
