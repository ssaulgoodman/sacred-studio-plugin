#!/usr/bin/env node
// Builds a catalogue lyric video as a HyperFrames composition: one clip looped under the song,
// line subtitles in the house look. The numbers mirror the Echo renderer
// (echo-live-wallpapers cloud/render_style.py) so a catalogue video looks the same whichever
// engine renders it. STYLE.md says why each number is what it is.
//
// node build.mjs --srt song_kan.srt --lang kan --clip loop.mp4 --audio song.wav --out ./comp
//   [--start 27 --duration 33] [--position right-third] [--size 100] [--color #FFD4A3]
//   [--offset-x 0] [--offset-y 0] [--tar]
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRAME = { w: 1920, h: 1080 };
const POSITIONS = {
  'left-third': { alignment: 5, l: 80, r: 1000, v: 50 },
  'right-third': { alignment: 5, l: 920, r: 150, v: 50 },
  'bottom-third': { alignment: 2, l: 100, r: 100, v: 100 },
  'bottom-center': { alignment: 2, l: 100, r: 100, v: 80 },
};
const FONTS = {
  san: { family: 'Rozha One', file: 'RozhaOne-Regular.ttf', weight: '400' },
  kan: { family: 'Noto Serif Kannada', file: 'NotoSerifKannada.ttf', weight: '100 900' },
  tam: { family: 'Noto Serif Tamil', file: 'NotoSerifTamil.ttf', weight: '100 900' },
  tel: { family: 'Noto Serif Telugu', file: 'NotoSerifTelugu.ttf', weight: '100 900' },
  mal: { family: 'Noto Serif Malayalam', file: 'NotoSerifMalayalam.ttf', weight: '100 900' },
};
const DEFAULT_SIZE = { san: 120, kan: 100, tam: 120, tel: 120, mal: 120 };
const SIZE_MULTIPLIER = { san: 1, kan: 1, tam: 0.6, tel: 1, mal: 0.75 };
const EM_PER_SIZE = { san: 0.7042, kan: 0.5921, tam: 0.6406, tel: 0.684, mal: 0.8019 };
const OUTLINE_PX = 3, SHADOW_PX = 5, REVEAL_S = 0.8, FADE_OUT_S = 0.3, PAD_PX = 24, MAX_LINE_CHARS = 20;

const { values: args } = parseArgs({ options: Object.fromEntries(
  ['srt', 'lang', 'clip', 'audio', 'out', 'start', 'duration', 'position', 'size', 'color', 'offset-x', 'offset-y']
    .map((k) => [k, { type: 'string' }]).concat([['tar', { type: 'boolean' }]])) });
for (const k of ['srt', 'lang', 'clip', 'audio', 'out']) if (!args[k]) throw new Error(`--${k} is required`);
const lang = args.lang;
if (!FONTS[lang]) throw new Error(`Unknown language ${lang}; one of ${Object.keys(FONTS).join(', ')}`);
const pos = POSITIONS[args.position || 'right-third'];
if (!pos) throw new Error(`Unknown position ${args.position}`);
const size = Number(args.size || DEFAULT_SIZE[lang]);
const color = /^#[0-9a-f]{6}$/i.test(args.color || '') ? args.color : '#FFD4A3';
const offX = Number(args['offset-x'] || 0), offY = Number(args['offset-y'] || 0);

// SRT parsing, garbled-text refusal and line wrapping: render_style.py, ported.
const parseSrt = (text) => text.replace(/^﻿/, '').replace(/\r\n/g, '\n').trim().split(/\n\s*\n/).flatMap((block) => {
  const lines = block.trim().split('\n');
  const i = lines.findIndex((l) => /\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(l));
  if (i < 0) return [];
  const t = lines[i].match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (!t) return [];
  const sec = (h, m, s, ms) => +h * 3600 + +m * 60 + +s + +ms.padEnd(3, '0') / 1000;
  const start = sec(t[1], t[2], t[3], t[4]), end = sec(t[5], t[6], t[7], t[8]);
  const body = lines.slice(i + 1).join('\n').trim();
  return body && end > start ? [{ start, end, text: body }] : [];
});
const looksGarbled = (s) => (s.match(/à¤|à¥|à²|à³|à®|à¯|à°|à±|à´|àµ|Ã[\x80-\xbf]|Â[\xa0-\xbf]/g) || []).length > 3;
const wrapLines = (text) => {
  const full = text.split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
  if (!full) return [];
  let lines = [];
  const appendToLast = (s) => { if (lines.length) lines[lines.length - 1] += s; };
  for (const raw of full.split(/(॥)/)) {
    const part = raw.trim();
    if (!part) continue;
    if (part === '॥') { appendToLast('॥'); continue; }
    for (const rawSub of part.split(/(।)/)) {
      const sub = rawSub.trim();
      if (!sub) continue;
      if (sub === '।') { appendToLast('।'); continue; }
      const commas = sub.split(',').map((p) => p.trim()).filter(Boolean);
      commas.forEach((c, i) => lines.push(i < commas.length - 1 ? `${c},` : c));
    }
  }
  if (lines.length <= 1) lines = [full];
  const wrapped = [];
  for (const line of lines) {
    let current = '';
    for (const word of line.split(' ').filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && [...candidate].length > MAX_LINE_CHARS) { wrapped.push(current); current = word; } else current = candidate;
    }
    if (current) wrapped.push(current);
  }
  return wrapped;
};
const screenLines = (lines) => (lines.length >= 4 ? [...lines.slice(0, 2), '', ...lines.slice(2)] : lines);
const outlineColor = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? '#000000' : '#303030';
};
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).toString().trim());

const srt = readFileSync(args.srt, 'utf8');
if (looksGarbled(srt)) throw new Error('These lyrics are garbled (encoding damage); fix the SRT before rendering.');
const songDur = probe(args.audio);
const t0 = Number(args.start || 0);
const dur = Math.min(Number(args.duration || songDur - t0), songDur - t0);
const cues = parseSrt(srt).filter((c) => c.end > t0 && c.start < t0 + dur)
  .map((c) => ({ ...c, start: Math.max(0, c.start - t0), end: Math.min(dur, c.end - t0) }));
if (!cues.length) throw new Error('No subtitle lines fall inside this range.');

const out = resolve(args.out);
mkdirSync(join(out, 'assets'), { recursive: true });
copyFileSync(join(HERE, 'fonts', FONTS[lang].file), join(out, 'assets', FONTS[lang].file));
copyFileSync(join(HERE, 'vendor', 'gsap.min.js'), join(out, 'assets', 'gsap.min.js'));
copyFileSync(args.clip, join(out, 'assets', 'clip' + (basename(args.clip).match(/\.\w+$/)?.[0] || '.mp4')));
const clipFile = 'assets/clip' + (basename(args.clip).match(/\.\w+$/)?.[0] || '.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t0), '-t', String(dur), '-i', args.audio,
  '-vn', '-c:a', 'aac', '-b:a', '192k', join(out, 'assets', 'song.m4a')]);
const clipDur = probe(args.clip);

const assSize = Math.floor(size * SIZE_MULTIPLIER[lang]);
const box = { l: Math.max(0, pos.l + offX), r: Math.max(0, pos.r - offX), v: Math.max(0, pos.v + offY) };
const middle = pos.alignment === 5;
const loops = [];
for (let s = 0, i = 0; s < dur - 0.001; s += clipDur, i++) {
  loops.push(`<video id="clip-${i}" class="clip bg" src="${clipFile}" muted playsinline data-start="${s.toFixed(3)}" data-duration="${Math.min(clipDur, dur - s).toFixed(3)}" data-track-index="0"></video>`);
}
const cueHtml = cues.map((c, i) => `<div class="cue" id="cue-${i}"><div class="text">${screenLines(wrapLines(c.text)).map((l) => `<div>${l ? esc(l) : '&nbsp;'}</div>`).join('')}</div></div>`).join('\n');
const tweens = cues.map((c, i) => {
  const fade = Math.max(c.start, c.end - FADE_OUT_S);
  return [
    `tl.set("#cue-${i}", { opacity: 1 }, ${c.start.toFixed(3)});`,
    `tl.fromTo("#cue-${i} .text", { "--p": 0 }, { "--p": 1, duration: ${REVEAL_S}, ease: "none" }, ${c.start.toFixed(3)});`,
    `tl.to("#cue-${i}", { opacity: 0, duration: ${(c.end - fade).toFixed(3)}, ease: "none" }, ${fade.toFixed(3)});`,
  ].join('\n');
}).join('\n');

const html = `<!doctype html>
<html lang="${{ san: 'sa', kan: 'kn', tam: 'ta', tel: 'te', mal: 'ml' }[lang]}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${FRAME.w}, height=${FRAME.h}" />
<title>Catalogue lyric video</title>
<script src="assets/gsap.min.js"></script>
<style>
@font-face { font-family: "${FONTS[lang].family}"; src: url("assets/${FONTS[lang].file}") format("truetype"); font-weight: ${FONTS[lang].weight}; }
html, body { margin: 0; width: ${FRAME.w}px; height: ${FRAME.h}px; overflow: hidden; }
#root { position: relative; width: ${FRAME.w}px; height: ${FRAME.h}px; overflow: hidden; }
.fill { position: absolute; inset: 0; background: #000; }
.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cue { position: absolute; left: ${box.l}px; right: ${box.r}px; ${middle ? 'top: 0; bottom: 0; align-items: center;' : `bottom: ${box.v}px; align-items: flex-end;`} display: flex; justify-content: center; opacity: 0; }
.text { --p: 1; font-family: "${FONTS[lang].family}"; font-size: ${(assSize * EM_PER_SIZE[lang]).toFixed(2)}px; line-height: ${assSize}px; font-weight: 700; font-synthesis: weight; color: ${color}; text-align: center; white-space: pre; ${middle && offY ? `transform: translateY(${-offY}px);` : ''} -webkit-text-stroke: ${OUTLINE_PX * 2}px ${outlineColor(color)}; paint-order: stroke fill; filter: drop-shadow(${SHADOW_PX}px ${SHADOW_PX}px 0 rgba(0, 0, 0, 0.5)); clip-path: inset(-400px calc((1 - var(--p)) * (100% + ${PAD_PX * 2}px) - ${PAD_PX}px) -400px -${PAD_PX}px); }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="${FRAME.w}" data-height="${FRAME.h}" data-duration="${dur.toFixed(3)}">
<div class="fill"></div>
${loops.join('\n')}
<audio id="song" src="assets/song.m4a" data-start="0" data-duration="${dur.toFixed(3)}" data-track-index="1"></audio>
${cueHtml}
</div>
<script>
const tl = gsap.timeline({ paused: true });
${tweens}
// The player sizes playback from the timeline; the renderer from data-duration. Keep them equal.
tl.set({}, {}, ${dur.toFixed(3)});
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
</script>
</body>
</html>
`;
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, 'composition.json'), JSON.stringify({
  style: 'catalogue', language: lang, position: args.position || 'right-third', size, color, offsetX: offX, offsetY: offY,
  range: { start: t0, duration: dur }, cues: cues.length, sources: { srt: basename(args.srt), clip: basename(args.clip), audio: basename(args.audio) },
}, null, 2) + '\n');
if (args.tar) execFileSync('tar', ['-czf', `${out}.tar.gz`, '-C', out, '.']);
console.log(`${cues.length} lines, ${dur.toFixed(1)} s, ${FONTS[lang].family} ${assSize}, ${args.position || 'right-third'} -> ${out}`);
