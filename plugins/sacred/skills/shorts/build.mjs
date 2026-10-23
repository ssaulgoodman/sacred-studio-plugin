#!/usr/bin/env node
// Builds a 9:16 Short from a template as a HyperFrames composition bundle.
// One song section, its finished footage, its lyric lines with meanings, and the master audio.
//
// node build.mjs --template kinetic-hook --lines lines.json --lang kan --clip video.mp4 --audio song.wav \
//   --start 27 --duration 30 --title "Shukravaara Bandaaga" --out ./short [--tar]
//   [--greeting "ಶುಭ ದೀಪಾವಳಿ" --greeting-en "Happy Diwali"]   festival-sting only
//   [--clip-offset 0]  video time minus song time, when the footage is not song-aligned
//   [--focus-x 0.5]    horizontal focus of the 16:9 footage in the 9:16 frame, 0 left to 1 right
//   festival-montage: --clip is the song's whole finished video; it cuts between its shots on the beat.
//   [--moments 212,48,200]  video times to cut to first (from find with the song's finalVideo), best first
//   [--shots shots.json]    [{ "src": "file or signed URL", "at": 212, "end": 220 }] moments from any finished video, best first
//
// lines.json: [{ "start": 29.76, "end": 32.11, "text": "ಶುಕ್ರವಾರ ಬಂದಾಗ", "meaning": "When Friday comes" }]
// Times are song times. TEMPLATE.md in each templates/<name> folder says what the template is for.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const W = 1080, H = 1920;
const TEMPLATES = ['kinetic-hook', 'festival-sting', 'meaning-card', 'festival-montage'];
const SCRIPT_FONTS = {
  kan: ['Tiro Kannada', 'TiroKannada-Regular.ttf', 'kn'],
  tel: ['Tiro Telugu', 'TiroTelugu-Regular.ttf', 'te'],
  tam: ['Tiro Tamil', 'TiroTamil-Regular.ttf', 'ta'],
  san: ['Tiro Devanagari Hindi', 'TiroDevanagariHindi-Regular.ttf', 'sa'],
  hin: ['Tiro Devanagari Hindi', 'TiroDevanagariHindi-Regular.ttf', 'hi'],
  mal: ['Noto Serif Malayalam', 'NotoSerifMalayalam.ttf', 'ml'],
};

const { values: a } = parseArgs({ options: Object.fromEntries(
  ['template', 'lines', 'lang', 'clip', 'audio', 'start', 'duration', 'title', 'out', 'greeting', 'greeting-en', 'clip-offset', 'focus-x', 'base', 'moments', 'shots']
    .map((k) => [k, { type: 'string' }]).concat([['tar', { type: 'boolean' }]])) });
for (const k of ['template', 'lines', 'lang', 'audio', 'start', 'duration', 'out']) if (!a[k]) throw new Error(`--${k} is required`);
if (!a.clip && !(a.template === 'festival-montage' && a.shots)) throw new Error('--clip is required (festival-montage also accepts --shots)');
if (!TEMPLATES.includes(a.template)) throw new Error(`Unknown template ${a.template}; one of ${TEMPLATES.join(', ')}`);
const font = SCRIPT_FONTS[a.lang];
if (!font) throw new Error(`Unknown language ${a.lang}; one of ${Object.keys(SCRIPT_FONTS).join(', ')}`);
const t0 = Number(a.start), D = Number(a.duration), clipOffset = Number(a['clip-offset'] || 0);
const focusX = Math.min(1, Math.max(0, Number(a['focus-x'] ?? 0.5)));
// The base is what sits under the type. "icon" holds a deity loop full frame (the look the
// channel's audience rewards); "footage" plays the song's finished video, song-aligned.
const base = a.template === 'festival-montage' ? 'footage' : a.base || 'icon';
if (!['icon', 'footage'].includes(base)) throw new Error('--base must be icon or footage');
const icon = base === 'icon';
if (!(D >= 6 && D <= 90)) throw new Error('--duration must be 6 to 90 seconds');

// Indic to Roman, readable rather than scholarly: every supported script is laid out like
// Devanagari in Unicode, so map by offset into the Devanagari block, then romanise.
const BLOCKS = [0x0900, 0x0980, 0x0a00, 0x0a80, 0x0b00, 0x0b80, 0x0c00, 0x0c80, 0x0d00];
const V = { 0x05: 'a', 0x06: 'aa', 0x07: 'i', 0x08: 'ee', 0x09: 'u', 0x0a: 'oo', 0x0b: 'ru', 0x0c: 'lu', 0x0e: 'e', 0x0f: 'e', 0x10: 'ai', 0x12: 'o', 0x13: 'o', 0x14: 'au' };
const C = { 0x15: 'k', 0x16: 'kh', 0x17: 'g', 0x18: 'gh', 0x19: 'ng', 0x1a: 'ch', 0x1b: 'chh', 0x1c: 'j', 0x1d: 'jh', 0x1e: 'ny',
  0x1f: 't', 0x20: 'th', 0x21: 'd', 0x22: 'dh', 0x23: 'n', 0x24: 't', 0x25: 'th', 0x26: 'd', 0x27: 'dh', 0x28: 'n', 0x29: 'n',
  0x2a: 'p', 0x2b: 'ph', 0x2c: 'b', 0x2d: 'bh', 0x2e: 'm', 0x2f: 'y', 0x30: 'r', 0x31: 'r', 0x32: 'l', 0x33: 'l', 0x34: 'zh',
  0x35: 'v', 0x36: 'sh', 0x37: 'sh', 0x38: 's', 0x39: 'h' };
const M = { 0x3e: 'aa', 0x3f: 'i', 0x40: 'ee', 0x41: 'u', 0x42: 'oo', 0x43: 'ru', 0x44: 'roo', 0x46: 'e', 0x47: 'e', 0x48: 'ai', 0x4a: 'o', 0x4b: 'o', 0x4c: 'au' };
const rel = (ch) => { const c = ch.codePointAt(0); const b = BLOCKS.find((x) => c >= x && c < x + 0x80); return b === undefined ? null : c - b; };
const romanise = (text, dropFinalA) => text.split(/\s+/).filter(Boolean).map((word) => {
  const cs = [...word]; let out = '';
  for (let i = 0; i < cs.length; i++) {
    const r = rel(cs[i]), next = i + 1 < cs.length ? rel(cs[i + 1]) : null;
    if (r === null) { if (/[A-Za-z0-9]/.test(cs[i])) out += cs[i]; continue; }
    if (C[r]) { out += C[r]; if (next === 0x4d) i++; else if (!(next in M)) out += (dropFinalA && i === cs.length - 1) ? '' : 'a'; }
    else if (V[r]) out += V[r];
    else if (M[r]) out += M[r];
    else if (r === 0x02) out += next !== null && [0x2a, 0x2b, 0x2c, 0x2d, 0x2e].includes(next) || next === null ? 'm' : 'n';
    else if (r === 0x01) out += 'n';
    else if (r === 0x03) out += 'h';
    else if (r >= 0x66 && r <= 0x6f) out += String(r - 0x66);
  }
  return out;
}).join(' ');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const n = (x) => Number(x).toFixed(3);
const dropFinalA = a.lang === 'hin';

const raw = JSON.parse(readFileSync(a.lines, 'utf8'));
const lines = raw.filter((l) => l.end > t0 && l.start < t0 + D && l.text)
  .map((l) => ({ start: Math.max(0, l.start - t0), end: Math.min(D, l.end - t0), text: l.text.trim(), meaning: (l.meaning || '').trim() }))
  .sort((x, y) => x.start - y.start);
if (!lines.length) throw new Error('No lyric lines fall inside this section.');
// Each line holds the screen until the next begins (or 1.2 s, whichever is shorter), so text never blinks out mid-phrase.
lines.forEach((l, i) => { const next = lines[i + 1]?.start ?? D; l.hold = Math.max(l.end, Math.min(next - 0.05, l.end + 1.2)); });

// Beats time the sting's word hits and flash cuts. Without librosa the template still renders, on a steady grid.
let beats = [];
try {
  beats = JSON.parse(execFileSync('python3', [join(HERE, 'beats.py'), a.audio, '--start', String(t0), '--duration', String(D)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).beats;
} catch { for (let t = 0.5; t < D; t += 0.5) beats.push({ t, s: 0.5 }); }

const tpl = a.template;
const montage = tpl === 'festival-montage';
const sting = tpl === 'festival-sting' || montage;
const calm = tpl === 'meaning-card';
const stingEnd = sting ? Math.min(Math.max(1.8, lines[0].start - 0.1), 3.2) : 0;

const out = resolve(a.out);
mkdirSync(join(out, 'assets'), { recursive: true });
for (const f of [font[1], 'InstrumentSerif-Italic.ttf', 'InstrumentSans.ttf']) copyFileSync(join(HERE, 'fonts', f), join(out, 'assets', f));
copyFileSync(join(HERE, 'vendor', 'gsap.min.js'), join(out, 'assets', 'gsap.min.js'));
const ff = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
// Footage: the section, cropped toward the focus point at 1080x1920 so the bundle stays small and the renderer never scales 4K.
const cropX = `(iw-ih*9/16)*${focusX.toFixed(3)}`;
const cuts = [];
if (montage) {
  // Montage: the opener holds one shot, then a new shot every bar (four beats). Shots come
  // from --shots (catalogue-wide moments found by meaning: any finished video, local file or
  // signed URL) and then from --clip's own scenes. Every shot fills the 9:16 frame, its crop
  // aimed at the sharpest part of the picture (usually the face or the idol). Each shot keeps
  // its own motion; nothing is zoomed.
  const pool = [];
  if (a.shots) for (const x of JSON.parse(readFileSync(a.shots, 'utf8'))) pool.push({ src: x.src, s: Number(x.at) + 0.4, e: Number(x.end ?? Number(x.at) + 8) - 0.2 });
  if (a.clip) {
    const scenes = spawnSync('ffmpeg', ['-hide_banner', '-i', a.clip, '-vf', "scale=320:-1,select='gt(scene,0.25)',showinfo", '-an', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }).stderr;
    const total = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', a.clip], { encoding: 'utf8' }));
    const bounds = [0, ...[...scenes.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1])), total];
    const scenesList = bounds.slice(0, -1).map((x, i) => ({ src: a.clip, s: x + 0.15, e: bounds[i + 1] - 0.1 })).filter((x) => x.e - x.s >= 1.2);
    const wanted = (a.moments || '').split(',').map(Number).filter((t) => Number.isFinite(t));
    pool.push(...new Set([...wanted.map((t) => scenesList.find((x) => t >= x.s - 0.3 && t < x.e)).filter(Boolean), ...scenesList]));
  }
  if (!pool.length) throw new Error('festival-montage needs --shots or --clip');
  // Never two cuts in a row from the same video when another is available.
  const queue = [];
  const left = [...pool];
  while (left.length) { const k = left.findIndex((x) => x.src !== queue.at(-1)?.src); queue.push(...left.splice(k < 0 ? 0 : k, 1)); }
  const grid = beats.map((b) => b.t).filter((t) => t > stingEnd + 0.4 && t < D - 0.6);
  const marks = [0, stingEnd];
  for (let i = 0; i < grid.length; i += 4) if (grid[i] - marks.at(-1) >= 0.9) marks.push(grid[i]);
  if (marks.length < 4) for (let t = stingEnd + 2; t < D - 0.8; t += 2) marks.push(t);
  marks.push(D);
  let q = 0;
  for (let i = 0; i < marks.length - 1; i++) {
    const len = marks[i + 1] - marks[i];
    let shot = null;
    for (let k = 0; k < queue.length && !shot; k++) { const c = queue[(q + k) % queue.length]; if (c.e - c.s >= Math.min(len, 1.2)) { shot = c; q = (q + k + 1) % queue.length; } }
    shot ||= queue[q++ % queue.length];
    cuts.push({ at: marks[i], len, from: shot.s, src: shot.src });
  }
  // Aim each 9:16 crop: slide a window across a small grey frame and keep the one with the
  // most edge detail, gently preferring the centre. Sharp detail is where the subject is.
  const aim = (src, t) => {
    const fw = 160, fh = 90, cw = Math.round(fh * 9 / 16);
    let px;
    try { px = execFileSync('ffmpeg', ['-v', 'error', '-ss', n(t), '-i', src, '-frames:v', '1', '-vf', `scale=${fw}:${fh}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 20 }); }
    catch { return 0.5; }
    if (px.length < fw * fh) return 0.5;
    const col = new Float64Array(fw);
    for (let y = 1; y < fh - 1; y++) for (let x = 1; x < fw - 1; x++) {
      const i = y * fw + x;
      col[x] += Math.abs(px[i + 1] - px[i - 1]) + Math.abs(px[i + fw] - px[i - fw]);
    }
    let best = 0, bestScore = -1, sum = 0;
    for (let x = 0; x < cw; x++) sum += col[x];
    for (let x = 0; x + cw <= fw; x++) {
      if (x) sum += col[x + cw - 1] - col[x - 1];
      const centre = (x + cw / 2) / fw, score = sum * (1 - 0.35 * Math.abs(centre - 0.5) * 2);
      if (score > bestScore) { bestScore = score; best = x; }
    }
    return best / (fw - cw);
  };
  const segs = [];
  cuts.forEach((c, i) => {
    c.focus = Number(aim(c.src, c.from + Math.min(c.len, 2) / 2).toFixed(3));
    const seg = join(out, `seg-${i}.mp4`);
    ff('-ss', n(c.from), '-t', n(c.len), '-i', c.src, '-an', '-vf',
      `crop=ih*9/16:ih:(iw-ih*9/16)*${c.focus}:0,scale=${W}:${H},fps=30,setsar=1,tpad=stop_mode=clone:stop_duration=${n(c.len)},trim=duration=${n(c.len)}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', seg);
    segs.push(seg);
  });
  writeFileSync(join(out, 'segs.txt'), segs.map((x) => `file '${x}'`).join('\n'));
  ff('-f', 'concat', '-safe', '0', '-i', join(out, 'segs.txt'), '-c', 'copy', join(out, 'assets', 'footage.mp4'));
  for (const x of [...segs, join(out, 'segs.txt')]) rmSync(x, { force: true });
} else {
  ff(...(icon ? ['-stream_loop', '-1', '-t', n(D), '-i', a.clip] : ['-ss', n(t0 + clipOffset), '-t', n(D), '-i', a.clip]), '-an', '-vf', `crop=ih*9/16:ih:${cropX}:0,scale=${W}:${H},fps=30`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', join(out, 'assets', 'footage.mp4'));
}
ff('-ss', n(t0), '-t', n(D), '-i', a.audio, '-vn', '-af', `afade=t=in:d=0.25,afade=t=out:st=${n(D - 1)}:d=1`, '-c:a', 'aac', '-b:a', '192k', join(out, 'assets', 'song.m4a'));

const html = [], tl = [];

// Flash frames for the sting: three moments from later in the section, shown for a few frames each.
const flashes = [];
if (sting) {
  const picks = [0.35, 0.6, 0.85].map((p) => stingEnd + (D - stingEnd) * p);
  picks.forEach((t, i) => { ff('-ss', n(t), '-i', join(out, 'assets', 'footage.mp4'), '-frames:v', '1', '-q:v', '3', join(out, 'assets', `flash-${i}.jpg`)); });
  const slots = beats.filter((b) => b.t > stingEnd - 1.1 && b.t < stingEnd - 0.12).slice(-3).map((b) => b.t);
  while (slots.length < 3) slots.unshift((slots[0] ?? stingEnd - 0.12) - 0.3);
  slots.forEach((t, i) => flashes.push({ t: Math.max(0.2, t), file: `assets/flash-${i}.jpg` }));
}

// Camera: none. The finished footage already has its own camera moves; added zooms and
// beat punch-ins fight it (Saul rejected both). Motion comes from the type.
if (sting) {
  tl.push(`tl.fromTo("#push", { filter: "blur(16px) brightness(0.5)" }, { filter: "blur(0px) brightness(1)", duration: 0.7, ease: "power2.out" }, ${n(stingEnd - 0.45)});`);
  const words = a.greeting ? a.greeting.trim().split(/\s+/) : [];
  const hits = beats.filter((b) => b.t > 0.15 && b.t < stingEnd - 1.2).map((b) => b.t);
  const at = words.map((_, i) => hits[Math.round((i * Math.max(0, hits.length - 1)) / Math.max(1, words.length - 1))] ?? 0.25 + i * 0.45);
  html.push(`<div id="greet"><div class="greet-script">${words.map((w, i) => `<span class="gw" id="gw-${i}">${esc(w)}</span>`).join(' ')}</div>${a['greeting-en'] ? `<div class="greet-en">${esc(a['greeting-en'])}</div>` : ''}</div>`);
  words.forEach((_, i) => tl.push(`tl.fromTo("#gw-${i}", { opacity: 0, scale: 1.35 }, { opacity: 1, scale: 1, duration: 0.42, ease: "expo.out" }, ${n(at[i])});`));
  tl.push(`tl.fromTo("#greet .greet-en", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, ${n((at.at(-1) ?? 0.4) + 0.2)});`);
  tl.push(`tl.to("#greet", { opacity: 0, scale: 1.06, duration: 0.3, ease: "power2.in" }, ${n(stingEnd - 0.3)});`);
  flashes.forEach((f, i) => html.push(`<img id="flash-${i}" class="clip flash" src="${f.file}" alt="" data-start="${n(f.t)}" data-duration="0.12" data-track-index="${3 + i}" />`));
}

// Montage motion graphics: a gold flash on every cut, a gold rule under the title, embers
// rising like diya sparks, warm light drifting across, and a closing greeting card.
// All seek-safe: fixed values from a seeded generator, finite tweens on the one timeline.
// The closing card all but covers the band, so its greeting never sits over a deity in the last shot.
if (montage) {
  html.push('<div id="leak-a" class="leak"></div><div id="leak-b" class="leak"></div>');
  tl.push(`tl.fromTo("#leak-a", { x: -260, opacity: 0.28 }, { x: 220, opacity: 0.42, duration: ${n(D)}, ease: "none" }, 0);`);
  tl.push(`tl.fromTo("#leak-b", { x: 240, opacity: 0.22 }, { x: -200, opacity: 0.36, duration: ${n(D)}, ease: "none" }, 0);`);
  html.push('<div id="rule" class="rule"></div>');
  tl.push(`tl.fromTo("#rule", { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: "expo.out" }, ${n(stingEnd + 0.2)});`);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Solid dots with a glow: gradients and blur on many layers make the capture drop frames.
  for (let i = 0; i < 24; i++) {
    const at = (i / 24) * D - 3 + rnd() * 2, x = 40 + rnd() * (W - 80), size = 3 + rnd() * 6, rise = 7 + rnd() * 5;
    html.push(`<div class="ember" id="em-${i}" style="left:${x.toFixed(0)}px;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px"></div>`);
    tl.push(`tl.fromTo("#em-${i}", { y: ${H + 40}, opacity: 0 }, { y: ${(H * 0.18 - rnd() * 300).toFixed(0)}, duration: ${n(rise)}, ease: "none" }, ${n(Math.max(0, at))});`);
    tl.push(`tl.to("#em-${i}", { opacity: ${(0.5 + rnd() * 0.5).toFixed(2)}, duration: ${n(rise * 0.3)}, ease: "power1.out" }, ${n(Math.max(0, at))});`);
    tl.push(`tl.to("#em-${i}", { opacity: 0, duration: ${n(rise * 0.35)}, ease: "power1.in" }, ${n(Math.max(0, at) + rise * 0.65)});`);
  }
  html.push('<div id="cutflash"></div>');
  cuts.slice(1).forEach((c) => tl.push(`tl.fromTo("#cutflash", { opacity: ${c.at === stingEnd ? 0.75 : 0.42} }, { opacity: 0, duration: ${c.at === stingEnd ? 0.45 : 0.22}, ease: "power2.out", immediateRender: false }, ${n(c.at)});`));
  if (a.greeting) {
    const endAt = D - 2.3;
    html.push(`<div id="endcard"><div class="end-script">${esc(a.greeting)}</div>${a['greeting-en'] ? `<div class="end-en">${esc(a['greeting-en'])}</div>` : ''}</div>`);
    tl.push(`tl.fromTo("#endcard", { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.out" }, ${n(endAt)});`);
    tl.push(`tl.fromTo("#endcard .end-script", { scale: 1.12 }, { scale: 1, duration: 1.2, ease: "expo.out" }, ${n(endAt)});`);
  }
}

// Title: small and quiet, the song is the hero.
if (a.title) {
  html.push(`<div id="title">${esc(a.title)}</div>`);
  tl.push(`tl.fromTo("#title", { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, ${n(sting ? stingEnd : 0.3)});`);
}

// Lyric lines: the original script rises word by word as it is sung, the reading and the meaning follow.
lines.forEach((l, i) => {
  const words = l.text.split(/\s+/);
  const weights = words.map((w) => [...w].length);
  const total = weights.reduce((x, y) => x + y, 0);
  const span = Math.max(0.3, (l.end - l.start) * 0.7);
  let acc = 0;
  const wordAt = weights.map((w) => { const t = l.start + (acc / total) * span; acc += w; return t; });
  const roman = romanise(l.text, dropFinalA);
  html.push(`<div class="cue" id="cue-${i}">
  <div class="script">${words.map((w, k) => `<span class="w" data-layout-allow-overflow><span class="wi" id="w-${i}-${k}">${esc(w)}</span></span>`).join(' ')}</div>
  <div class="tr">${esc(roman)}</div>
  ${l.meaning ? `<div class="en">${l.meaning.split(/\s+/).map((w) => `<span class="ew">${esc(w)}</span>`).join(' ')}</div>` : ''}
</div>`);
  const start = Math.max(l.start, sting ? stingEnd : 0);
  tl.push(`tl.set("#cue-${i}", { opacity: 1, y: 0 }, ${n(start)});`);
  if (calm) {
    tl.push(`tl.fromTo("#cue-${i} .script", { opacity: 0, y: 18 }, { opacity: 0.92, y: 0, duration: 0.6, ease: "power2.out" }, ${n(start)});`);
  } else {
    words.forEach((_, k) => tl.push(`tl.fromTo("#w-${i}-${k}", { yPercent: 115, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.55, ease: "expo.out" }, ${n(Math.max(start, wordAt[k]))});`));
  }
  tl.push(`tl.fromTo("#cue-${i} .tr", { opacity: 0, y: 10 }, { opacity: 0.72, y: 0, duration: 0.5, ease: "power2.out" }, ${n(start + 0.25)});`);
  if (l.meaning) tl.push(`tl.fromTo("#cue-${i} .en .ew", { opacity: 0, y: ${calm ? 14 : 8} }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: ${calm ? 0.08 : 0.045} }, ${n(start + (calm ? 0.45 : 0.4))});`);
  const exit = Math.min(l.hold, D) - 0.28;
  if (exit > start + 0.4) tl.push(`tl.to("#cue-${i}", { opacity: 0, y: -14, duration: 0.28, ease: "power2.in" }, ${n(exit)});`);
});

const css = `
@font-face { font-family: "${font[0]}"; src: url("assets/${font[1]}") format("truetype"); }
@font-face { font-family: "Instrument Serif"; font-style: italic; src: url("assets/InstrumentSerif-Italic.ttf") format("truetype"); }
@font-face { font-family: "Instrument Sans"; font-weight: 100 900; src: url("assets/InstrumentSans.ttf") format("truetype"); }
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
#root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
.fill { position: absolute; inset: 0; background: #0b0907; }
#push, #punch { position: absolute; inset: 0; transform-origin: 50% 46%; }
#punch video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.shade { position: absolute; inset: 0; pointer-events: none; background:
  linear-gradient(to bottom, rgba(8,6,4,0.55) 0%, rgba(8,6,4,0) 16%, rgba(8,6,4,0) ${calm ? 30 : 44}%, rgba(8,6,4,${calm ? 0.72 : 0.82}) 100%)${calm ? ', rgba(10,8,6,0.28)' : ''}; }
.flash { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
#title { position: absolute; top: 132px; left: 72px; right: 72px; ${icon ? 'text-align: center; font: italic 46px/1.1 "Instrument Serif"; letter-spacing: 0.02em; color: #f3dca8;' : 'font: 600 25px/1 "Instrument Sans"; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(251,247,239,0.86);'} opacity: 0; }
.cue { position: absolute; left: 72px; right: ${calm || icon ? 72 : 150}px; ${calm ? 'bottom: 470px; align-items: center; text-align: center;' : icon ? 'bottom: 380px; align-items: center; text-align: center;' : 'bottom: 440px; align-items: flex-start;'} display: flex; flex-direction: column; opacity: 0; }
.script { font-family: "${font[0]}"; font-size: ${calm ? 64 : icon ? 80 : 108}px; line-height: 1.3; padding-bottom: 0.1em; color: #fbf7ef; ${calm ? 'opacity: 0;' : ''} text-wrap: balance; }
.w { display: inline-block; overflow: hidden; vertical-align: bottom; padding: 0.06em 0 0.14em; margin-bottom: -0.14em; }
.wi { display: inline-block; }
.tr, .en, #title { text-shadow: 0 2px 14px rgba(0,0,0,0.5); }
.tr { margin-top: ${calm ? 14 : 20}px; font: 500 ${calm ? 26 : 29}px/1.3 "Instrument Sans"; letter-spacing: 0.08em; color: rgba(251,247,239,0.72); opacity: 0; }
.en { margin-top: ${calm ? 34 : 14}px; font: italic ${calm ? 84 : icon ? 42 : 48}px/${calm ? 1.08 : 1.15} "Instrument Serif"; color: #f1dfbd; ${calm ? 'max-width: 900px;' : 'max-width: 820px;'} }
.ew { display: inline-block; opacity: 0; }
${montage ? `#title { top: 170px; text-align: center; font: italic 54px/1.1 "Instrument Serif"; letter-spacing: 0.02em; color: #f3dca8; text-transform: none; }
.cue { bottom: 330px; left: 60px; right: 60px; align-items: center; text-align: center; }
.script { font-size: 96px; text-shadow: 0 4px 30px rgba(0,0,0,0.55); }
.shade { background: linear-gradient(to bottom, rgba(8,6,4,0.55) 0%, rgba(8,6,4,0) 18%, rgba(8,6,4,0) 52%, rgba(8,6,4,0.78) 100%); }
.leak { position: absolute; width: 1300px; height: 1300px; border-radius: 50%; mix-blend-mode: screen; pointer-events: none; }
#leak-a { top: -380px; left: -300px; background: radial-gradient(circle, rgba(255,176,72,0.55) 0%, rgba(255,140,40,0) 62%); }
#leak-b { bottom: -460px; right: -360px; background: radial-gradient(circle, rgba(255,120,60,0.45) 0%, rgba(255,90,40,0) 60%); }
.rule { position: absolute; top: 250px; left: 390px; right: 390px; height: 3px; transform-origin: 50% 50%; background: linear-gradient(90deg, rgba(240,196,110,0), #f0c46e 18%, #ffe3a3 50%, #f0c46e 82%, rgba(240,196,110,0)); box-shadow: 0 0 18px rgba(255,200,110,0.55); }
.ember { position: absolute; top: 0; border-radius: 50%; background: #ffd98a; box-shadow: 0 0 10px 3px rgba(255,170,70,0.6); opacity: 0; }
#cutflash { position: absolute; inset: 0; background: radial-gradient(circle at 50% 45%, rgba(255,246,222,0.95), rgba(255,206,130,0.7) 60%, rgba(255,170,90,0.5)); mix-blend-mode: screen; opacity: 0; pointer-events: none; }
#endcard { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(12,8,4,0.9); opacity: 0; }
.end-script { font-family: "${font[0]}"; font-size: 150px; line-height: 1.15; color: #ffe8b8; text-shadow: 0 0 40px rgba(255,180,80,0.6); }
.end-en { margin-top: 18px; font: italic 60px/1 "Instrument Serif"; color: #f3dca8; }
` : ''}#greet { position: absolute; left: 60px; right: 60px; top: 0; bottom: ${icon ? 330 : 120}px; display: flex; flex-direction: column; justify-content: ${icon ? 'flex-end' : 'center'}; align-items: center; text-align: center; }
.greet-script { font-family: "${font[0]}"; font-size: ${icon ? 132 : 168}px; line-height: 1.15; color: #fbf7ef; }
.gw { display: inline-block; opacity: 0; }
.greet-en { margin-top: 26px; font: italic 64px/1 "Instrument Serif"; color: #f1dfbd; opacity: 0; }
`;

const doc = `<!doctype html>
<html lang="${font[2]}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<title>${esc(a.title || 'Short')}</title>
<script src="assets/gsap.min.js"></script>
<style>${css}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="${W}" data-height="${H}" data-duration="${n(D)}">
<div class="fill"></div>
<div id="push"><div id="punch"><video id="footage" class="clip" src="assets/footage.mp4" muted playsinline data-start="0" data-duration="${n(D)}" data-track-index="0"></video></div></div>
<div class="shade"></div>
${html.join('\n')}
<audio id="song" src="assets/song.m4a" data-start="0" data-duration="${n(D)}" data-track-index="1"></audio>
</div>
<script>
const tl = gsap.timeline({ paused: true });
${tl.join('\n')}
tl.set({}, {}, ${n(D)});
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
</script>
</body>
</html>
`;
writeFileSync(join(out, 'index.html'), doc);
writeFileSync(join(out, 'composition.json'), JSON.stringify({
  template: { name: tpl, version: icon || montage ? 2 : 1 }, base, ...(montage ? { cuts: cuts.map((c) => ({ at: Number(c.at.toFixed(3)), from: Number(c.from.toFixed(3)) })) } : {}), language: a.lang, title: a.title || null,
  range: { start: t0, duration: D }, lines: lines.length, beats: beats.length, focusX,
  greeting: sting ? { text: a.greeting || null, english: a['greeting-en'] || null, until: stingEnd } : null,
}, null, 2) + '\n');
if (a.tar) execFileSync('tar', ['-czf', `${out}.tar.gz`, '-C', out, '.']);
console.log(`${tpl}: ${lines.length} lines, ${D.toFixed(1)} s, ${beats.length} beats -> ${out}`);
