// Parses 08RUTNTB.SFM (Tibetan) + RUT_bsb.usfm (English) into per-chapter
// JSON content files at src/content/chapters/chapter-N.json.
//
// Run with: node scripts/gen-chapters.mjs
//
// Source files stay in source-assets/ — this script is the only thing that
// reads them; re-run it any time the source text changes instead of hand-editing
// the generated JSON.
//
// Ported from ntb-jonah's own gen-chapters.mjs (same app, different book —
// see CLAUDE.md's "What this project is"). Differences from the Jonah
// version, and why, are called out inline below; the overall shape
// (parse each language source into {label, section, verses}, merge into
// per-chapter blocks, attach audio/duration/timing) is unchanged.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const SFM_PATH = path.join(ROOT, 'source-assets/08RUTNTB.SFM');
// Unlike Jonah's English source (an RTF export), Ruth's arrived as a plain
// USFM file (bsb2usfm-generated Berean Standard Bible) — actually simpler
// to parse than RTF, see parseBsbUsfm below.
const BSB_USFM_PATH = path.join(ROOT, 'source-assets/RUT_bsb.usfm');
const CMN_USFM_PATH = path.join(ROOT, 'source-assets/09-RUTcmn-cu89s.usfm');
const HI_USFM_PATH = path.join(ROOT, 'source-assets/09-RUThin2017.usfm');
const NE_USFM_PATH = path.join(ROOT, 'source-assets/09-RUTnpiulb.usfm');
const TIMING_DIR = path.join(ROOT, 'source-assets/timing');
const OUT_DIR = path.join(ROOT, 'src/content/chapters');
const INTRO_OUT_DIR = path.join(ROOT, 'src/content/intro');

// Paths below are relative to src/content/chapters/, resolved by content.config.ts's
// image() schema helper — they point at the pre-optimized webp copies in src/assets/,
// not the original JPGs in source-assets/.
const INLINE_DIR = '../../assets/chapters/inline';
const COVER_DIR = '../../assets/chapters/covers';

// Inline illustration placement. Unlike Jonah's page-sequence filenames
// (p1_Jon_01_02_RG.jpg), Ruth's illustrations are named directly by book/
// chapter/verse (08_Ru_01_02_RG.jpg = book 08, chapter 1, verse 2), so the
// mapping below is read straight off each filename — "after" is the cited
// verse, "before" is always the very next one. Not yet hand-verified
// against the printed PDF page-by-page the way Jonah's placements were
// (see "NTB Ruth_final copy.pdf" in source-assets/) — flag for Brett/John
// to confirm before treating this as final, same discipline as Jonah's.
const INLINE_IMAGES = {
  1: [
    { after: 2, before: 3, file: `${INLINE_DIR}/08_Ru_01_02_RG.webp` },
    { after: 8, before: 9, file: `${INLINE_DIR}/08_Ru_01_08_RG.webp` },
    { after: 13, before: 14, file: `${INLINE_DIR}/08_Ru_01_13_RG.webp` },
    { after: 20, before: 21, file: `${INLINE_DIR}/08_Ru_01_20_RG.webp` },
  ],
  2: [
    { after: 2, before: 3, file: `${INLINE_DIR}/08_Ru_02_02_RG.webp` },
    { after: 8, before: 9, file: `${INLINE_DIR}/08_Ru_02_08_RG.webp` },
    { after: 13, before: 14, file: `${INLINE_DIR}/08_Ru_02_13_RG.webp` },
    { after: 19, before: 20, file: `${INLINE_DIR}/08_Ru_02_19_RG.webp` },
    { after: 22, before: 23, file: `${INLINE_DIR}/08_Ru_02_22_RG.webp` },
  ],
  3: [
    { after: 2, before: 3, file: `${INLINE_DIR}/08_Ru_03_02_RG.webp` },
    { after: 8, before: 9, file: `${INLINE_DIR}/08_Ru_03_08_RG.webp` },
    { after: 13, before: 14, file: `${INLINE_DIR}/08_Ru_03_13_RG.webp` },
  ],
  4: [
    { after: 2, before: 3, file: `${INLINE_DIR}/08_Ru_04_02_RG.webp` },
    { after: 5, before: 6, file: `${INLINE_DIR}/08_Ru_04_05_RG.webp` },
    { after: 14, before: 15, file: `${INLINE_DIR}/08_Ru_04_14_RG.webp` },
  ],
};

// Homepage / chapter-card cover images — first inline image tagged for
// that chapter, same default Jonah used for 3 of its 4 chapters (only
// overridden there because the client asked for a specific one on chapter
// 2). No such request yet for Ruth — revisit if Brett/John want a
// different cover per chapter.
const COVER_IMAGES = {
  1: `${COVER_DIR}/chapter-1.webp`,
  2: `${COVER_DIR}/chapter-2.webp`,
  3: `${COVER_DIR}/chapter-3.webp`,
  4: `${COVER_DIR}/chapter-4.webp`,
};

// English chapter label — Ruth's BSB source (unlike Jonah's RTF) DOES carry
// real \s1 section headings, so sectionTitleEn comes straight from
// parseBsbUsfm's own section field below, no editorial titles needed. Only
// the "Chapter N" label itself needs one, same "no \cl-equivalent marker"
// gap as Chinese/Hindi/Nepali.
const ENGLISH_LABELS = { 1: 'Chapter 1', 2: 'Chapter 2', 3: 'Chapter 3', 4: 'Chapter 4' };

const CHINESE_LABELS = { 1: '第一章', 2: '第二章', 3: '第三章', 4: '第四章' };

const INDIC_CHAPTER_LABELS = { 1: 'अध्याय 1', 2: 'अध्याय 2', 3: 'अध्याय 3', 4: 'अध्याय 4' };

// Nepali's source has no \s1 section titles at all (same gap as Jonah's
// Nepali source) — editorial titles, provisionally translated by Claude to
// match the same theme as the Hindi/English titles for each chapter; flag
// for John/Brett to confirm wording, same caveat as every other provisional
// translation in this project.
const NEPALI_TITLES = {
  1: 'एलीमेलेकको परिवार मोआबमा जानु',
  2: 'रूतले बोअजलाई भेट्नु',
  3: 'रूतको उद्धारको आश्वासन',
  4: 'बोअजले रूतलाई उद्धार गर्नु',
};

// Dialect audio durations in seconds, read with ffprobe from the source
// MP3s (adx/bod/khg = Amdo/Central/Kham). eng was split from a single
// whole-book file John supplied (BSB_08_Rut_H.mp3) via a local Whisper-
// transcription + text-alignment pass — see CLAUDE.md's "Audio & timing"
// notes for how, and how to redo it if the source audio ever changes.
// cmn is a placeholder (0) — Brett hasn't generated the Chinese audio yet
// (ElevenLabs, same as Jonah's). Update this and re-run once cmn/chapter-
// N.mp3 files exist in source-assets/audio/cmn/.
const DURATIONS = {
  1: { adx: 404.1, bod: 263.6, khg: 238.6, eng: 235.7, cmn: 239.6 },
  2: { adx: 455.4, bod: 295.8, khg: 277.2, eng: 271.3, cmn: 239.2 },
  3: { adx: 315.5, bod: 210.5, khg: 197.4, eng: 191.4, cmn: 189.9 },
  4: { adx: 396.1, bod: 273.0, khg: 250.5, eng: 256.1, cmn: 219.2 },
};

// Real bug, caught while adding Chinese chapter 1's duration (239.6s):
// rounding the leftover seconds independently of the minutes can carry a
// value of 60 (e.g. 239.6 -> 3m, round(59.6)=60 -> "3:60"). Round the total
// to the nearest second FIRST, then split into minutes/seconds, so the
// carry lands in the right place.
function fmtDuration(secs) {
  const total = Math.round(secs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// 1. Parse the Tibetan SFM
// ---------------------------------------------------------------------------
//
// Same shape as Jonah's own Tibetan source, with one real difference: Ruth's
// chapters each carry MULTIPLE \s sub-headings (scene breaks within the
// chapter), not just one — Jonah's SFM only ever had one \s per chapter, so
// its parser could get away with letting each \s simply overwrite the last.
// Here that would leave sectionTitleBo as the chapter's LAST scene instead
// of its overall theme, so this version keeps only the FIRST \s per chapter
// (matching the same "first heading wins" choice made below for English/
// Chinese/Hindi, which have the identical multi-heading-per-chapter shape).

function parseSfm(raw) {
  const lines = raw.split('\n').map((l) => l.replace(/\r$/, ''));
  const chapters = {}; // { [n]: { label, section, verses: { [v]: string[] }, paragraphStarts: Set<v> } }
  let chapterNum = null;
  let verseNum = null;
  let pendingParagraph = false; // saw \p or \m, not yet attached to the next verse
  let sawSection = {};

  const ensureChapter = (n) => {
    if (!chapters[n]) chapters[n] = { label: '', section: '', verses: {}, paragraphStarts: new Set() };
    return chapters[n];
  };

  const stripFootnotes = (s) => s.replace(/\\f \+ \\ft.*?\\f\*/gs, '').trim();

  for (const rawLine of lines) {
    const line = rawLine;
    if (line.startsWith('\\c ')) {
      chapterNum = parseInt(line.slice(3).trim(), 10);
      ensureChapter(chapterNum);
      verseNum = null;
      pendingParagraph = false;
      continue;
    }
    if (chapterNum === null) continue; // skip \id, \h, \mt, \imt, \is1, \ipi front matter (see parseIntroFromSfm)

    if (line.startsWith('\\cl ')) {
      chapters[chapterNum].label = line.slice(4).trim();
      continue;
    }
    if (line.startsWith('\\s ')) {
      if (!sawSection[chapterNum]) {
        chapters[chapterNum].section = line.slice(3).trim();
        sawSection[chapterNum] = true;
      }
      continue;
    }
    if (line.startsWith('\\p') || line.startsWith('\\m')) {
      pendingParagraph = true; // attach to whichever verse comes next
      continue;
    }
    if (line.startsWith('\\v ')) {
      const m = line.match(/^\\v (\d+) (.*)$/s);
      if (!m) continue;
      verseNum = parseInt(m[1], 10);
      const text = stripFootnotes(m[2]);
      chapters[chapterNum].verses[verseNum] = [text];
      if (pendingParagraph) {
        chapters[chapterNum].paragraphStarts.add(verseNum);
        pendingParagraph = false;
      }
      continue;
    }
    if (line.startsWith('\\q1')) {
      const text = stripFootnotes(line.replace(/^\\q1\s?/, ''));
      if (text && verseNum !== null) {
        chapters[chapterNum].verses[verseNum].push(text);
      }
      continue;
    }
    // ignore blank lines / anything else
  }

  return chapters;
}

// ---------------------------------------------------------------------------
// 1b. Extract the book introduction straight out of the Tibetan SFM's own
//    front matter (before the first \c marker). Unlike Jonah — where the
//    introduction arrived as a separate RTF file requiring a whole Cocoa-
//    RTF Unicode decoder — Ruth's \mt/\imt/\is1/\ipi introduction is typed
//    directly into 08RUTNTB.SFM as plain UTF-8 text, so no decoding step is
//    needed at all; this is a much simpler version of the same idea. The
//    output shape ({mainTitle, introTitle, sections}) is identical to
//    Jonah's intro.json, so content.config.ts's `intro` collection schema
//    and index.astro's openIntro() rendering carry over completely
//    unchanged — only how the data gets extracted differs.
// ---------------------------------------------------------------------------

function parseIntroFromSfm(raw) {
  const lines = raw.split('\n').map((l) => l.replace(/\r$/, '').trim());
  let mainTitle = '';
  let introTitle = '';
  const sections = [];

  for (const line of lines) {
    if (line.startsWith('\\c ')) break; // front matter ends at the first chapter marker
    let m;
    if ((m = line.match(/^\\mt\s+(.*)$/))) { mainTitle = m[1]; continue; }
    if ((m = line.match(/^\\imt\s+(.*)$/))) { introTitle = m[1]; continue; }
    if ((m = line.match(/^\\is1\s+(.*)$/))) { sections.push({ heading: m[1], paragraphs: [] }); continue; }
    if ((m = line.match(/^\\ipi\s+(.*)$/))) {
      if (sections.length) sections[sections.length - 1].paragraphs.push(m[1]);
      continue;
    }
  }

  return { mainTitle, introTitle, sections };
}

// ---------------------------------------------------------------------------
// 2. Parse the English BSB USFM (bsb2usfm-generated) — plain USFM, not RTF
//    like Jonah's English source. Multiple \v markers can share one line
//    (unlike the Tibetan SFM's one-verse-per-line convention), so verses are
//    split out of the line with a lookahead regex; text with no leading \v
//    (e.g. \li1 genealogy lines in ch. 4) is a continuation of whichever
//    verse came before it. Footnotes (\f + ...\f*) are stripped whole;
//    \r (...) cross-reference lines and \b blank/poetry-break markers carry
//    no verse text and are skipped outright. Ruth's chapters each have
//    multiple \s1 sub-headings (same shape as the Tibetan \s headings
//    above) — only the first is kept per chapter, as this book's overall
//    section title.
// ---------------------------------------------------------------------------

function parseBsbUsfm(raw) {
  const chapters = {}; // { [n]: { section: string, verses: { [v]: string } } }
  let chapterNum = null;
  let verseNum = null;
  let sawSection = {};

  const ensureChapter = (n) => {
    if (!chapters[n]) chapters[n] = { section: '', verses: {} };
    return chapters[n];
  };

  const stripInline = (s) =>
    s
      .replace(/\\f \+.*?\\f\*/gs, '') // footnotes — whole note dropped
      .replace(/\\ref\s.*?\\ref\*/gs, '') // stray cross-refs (shouldn't survive outside \r lines, but just in case)
      .trim();

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/\r$/, '').trim();
    if (!line) continue;

    let m = line.match(/^\\c\s+(\d+)/);
    if (m) {
      chapterNum = parseInt(m[1], 10);
      ensureChapter(chapterNum);
      verseNum = null;
      continue;
    }
    if (chapterNum === null) continue; // skip \id/\usfm/\h/\toc/\mt front matter

    if (line.startsWith('\\r ')) continue; // standalone cross-reference line, not verse text
    if (line.startsWith('\\b')) continue; // blank poetry-break line

    m = line.match(/^\\s1\s+(.*)$/);
    if (m) {
      if (!sawSection[chapterNum]) {
        chapters[chapterNum].section = m[1].trim();
        sawSection[chapterNum] = true;
      }
      continue;
    }

    // \p, \li1 (genealogy list lines), \q1/\q2 (poetry) may all be followed
    // by verse markers or plain continuation text on the same line.
    let rest = line;
    let m2;
    if ((m2 = rest.match(/^\\(p|li1)\b\s*(.*)$/))) {
      rest = m2[2];
    } else if ((m2 = rest.match(/^\\(q1|q2)\b\s*(.*)$/))) {
      rest = m2[2];
    }
    if (!rest) continue; // marker-only line (e.g. bare "\p")

    // rest may contain one or more "\v N text" segments, and/or leading
    // continuation text (belongs to the PREVIOUS verse) before the first \v.
    const parts = rest.split(/(?=\\v\s+\d+)/);
    for (const part of parts) {
      const vm = part.match(/^\\v\s+(\d+)\s*(.*)$/s);
      if (vm) {
        verseNum = parseInt(vm[1], 10);
        const text = stripInline(vm[2]);
        chapters[chapterNum].verses[verseNum] =
          (chapters[chapterNum].verses[verseNum] ? chapters[chapterNum].verses[verseNum] + ' ' : '') + text;
      } else {
        const text = stripInline(part);
        if (text && verseNum !== null) {
          chapters[chapterNum].verses[verseNum] += ' ' + text;
        }
      }
    }
  }

  for (const c of Object.values(chapters)) {
    for (const v of Object.keys(c.verses)) {
      c.verses[v] = c.verses[v].replace(/\s+/g, ' ').trim();
    }
  }

  return chapters;
}

// ---------------------------------------------------------------------------
// 2b. Parse the Chinese CUV USFM. Same \c/\v/\p/\s1 marker shape as Jonah's
//    Chinese source, plus inline \pn...\pn* proper-name tags and \add...
//    \add* translator-supplied-word tags (both stripped, keeping the
//    enclosed text) — but UNLIKE Jonah's Chinese source, this one has real
//    footnotes (\f - \fr...\f*, note the "-" instead of Jonah's/BSB's "+").
//    Jonah's version never needed to strip footnote CONTENT (only got away
//    with generically stripping bare tags) because its source had none —
//    reused as-is here, that generic tag-stripping would have left footnote
//    explanatory text merged into the verse, so footnotes are now stripped
//    whole, first. No poetry line breaks in this source, so cmn stays a
//    plain string per verse, same as Jonah's. Multiple \s1 per chapter, same
//    "keep only the first" treatment as Tibetan/English above.
// ---------------------------------------------------------------------------

function parseCmnUsfm(raw) {
  const chapters = {}; // { [n]: { section, verses: { [v]: string } } }
  let chapterNum = null;
  let verseNum = null;
  let buf = [];
  let sawSection = {};

  const flush = () => {
    if (chapterNum !== null && verseNum !== null && buf.length) {
      chapters[chapterNum].verses[verseNum] = buf.join('').trim();
    }
    buf = [];
  };

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    let m = line.match(/^\\c\s+(\d+)/);
    if (m) {
      flush();
      chapterNum = parseInt(m[1], 10);
      chapters[chapterNum] = { section: '', verses: {} };
      verseNum = null;
      continue;
    }
    if (chapterNum === null) continue; // skip \id/\h/\toc/\mt front matter

    m = line.match(/^\\s1\s+(.*)$/);
    if (m) {
      if (!sawSection[chapterNum]) {
        chapters[chapterNum].section = m[1].trim();
        sawSection[chapterNum] = true;
      }
      continue;
    }
    m = line.match(/^\\v\s+(\d+)\s*(.*)$/);
    if (m) {
      flush();
      verseNum = parseInt(m[1], 10);
      buf = [m[2]];
      continue;
    }
    if (line.startsWith('\\p') || line.startsWith('\\m')) continue;
    if (verseNum !== null) buf.push(line);
  }
  flush();

  // Strip whole footnotes first (\f followed by "+" or "-", both seen in
  // this source, through the matching \f*) — before the generic per-tag
  // stripping below, which only removes bare markers and would otherwise
  // leave a footnote's own explanatory text merged into the verse.
  // \pn/\pn*/\add/\add* (kept text, tags dropped) fall out of the same
  // generic pass. Whitespace is collapsed to nothing after, same as Jonah's
  // Chinese — meaningless in Chinese, unlike English/Tibetan word-spacing.
  for (const c of Object.values(chapters)) {
    for (const v of Object.keys(c.verses)) {
      c.verses[v] = c.verses[v]
        .replace(/\\f [+-].*?\\f\*/gs, '')
        .replace(/\\[a-zA-Z0-9]+\*?/g, '')
        .replace(/\s+/g, '');
    }
  }
  return chapters;
}

// ---------------------------------------------------------------------------
// 2c. Parse Hindi/Nepali USFM — identical to Jonah's own parseIndicUsfm.
//    Hindi's chapters carry multiple \s1 sub-headings too, so this gets the
//    same "first wins" fix as the other three languages above; Nepali's
//    source has no \s1 at all, same gap as Jonah's Nepali source (see
//    NEPALI_TITLES).
// ---------------------------------------------------------------------------

function stripIndicMarkup(s) {
  return s
    .replace(/\\f \+.*?\\f\*/gs, '') // footnotes — whole note dropped, incl. \fr/\ft/\fq content
    .replace(/\\(bdit|it)\*?/g, '') // inline emphasis tags — text kept, tags stripped
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIndicUsfm(raw) {
  const chapters = {}; // { [n]: { section: string, verses: { [v]: string } } }
  let chapterNum = null;
  let verseNum = null;
  let buf = [];
  let sawSection = {};

  const flush = () => {
    if (chapterNum !== null && verseNum !== null && buf.length) {
      chapters[chapterNum].verses[verseNum] = stripIndicMarkup(buf.join(' '));
    }
    buf = [];
  };

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/\r$/, '').trim();
    if (!line) continue;

    let m = line.match(/^\\c\s+(\d+)/);
    if (m) {
      flush();
      chapterNum = parseInt(m[1], 10);
      chapters[chapterNum] = { section: '', verses: {} };
      verseNum = null;
      continue;
    }
    if (chapterNum === null) continue; // skip \id/\h/\toc/\mt/\is1/\ip front matter

    m = line.match(/^\\s1\s*(.*)$/);
    if (m) {
      if (!sawSection[chapterNum]) {
        chapters[chapterNum].section = m[1].trim();
        sawSection[chapterNum] = true;
      }
      continue;
    }
    m = line.match(/^\\v\s+(\d+)\s*(.*)$/);
    if (m) {
      flush();
      verseNum = parseInt(m[1], 10);
      buf = [m[2]];
      continue;
    }
    m = line.match(/^\\q1\s?(.*)$/);
    if (m) {
      if (m[1] && verseNum !== null) buf.push(m[1]);
      continue;
    }
    if (line.startsWith('\\p') || line.startsWith('\\m')) continue;
    if (verseNum !== null) buf.push(line);
  }
  flush();
  return chapters;
}

// ---------------------------------------------------------------------------
// 3. Parse per-dialect verse-timing files — identical format/approach to
//    Jonah's own (see CLAUDE.md's "Verse-timing / read-along highlight").
//    adx/bod/khg came from John's forced-aligner exports, same three
//    filename conventions as Jonah (book code updated to 08_RUT/08-RUT).
//    eng was generated locally the same way Jonah's was: mlx-whisper
//    transcription of the single whole-book source file, difflib-aligned
//    against this same script's own parsed verse text, per-chapter
//    timestamps rebased to each split file's own start — see CLAUDE.md.
//    cmn has no timing file yet (no Chinese audio yet either) — returns
//    null, same "no timing = no-op" behavior as any not-yet-arrived track.
// ---------------------------------------------------------------------------

function findTimingFile(dialect, n) {
  const nn = String(n).padStart(2, '0');
  const candidates = [
    `${dialect}_08_RUT_${n}.txt`,
    `${dialect}_08_RUT_${nn}.txt`,
    `${dialect}-08-RUT-${n}-timing.txt`,
    `${dialect}-08-RUT-${nn}-timing.txt`,
  ];
  for (const name of candidates) {
    const p = path.join(TIMING_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function parseTiming(dialect, n) {
  const filePath = findTimingFile(dialect, n);
  if (!filePath) return null;

  const raw = fs.readFileSync(filePath, 'utf8');
  const verses = [];
  for (const line of raw.split('\n')) {
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const verse = parseInt(cols[2].trim(), 10);
    if (Number.isNaN(verse)) continue; // unnumbered sub-verse marker — skip
    verses.push({ verse, time: parseFloat(cols[0]) });
  }
  return verses.length ? verses : null;
}

// ---------------------------------------------------------------------------
// 4. Merge into per-chapter block lists and write JSON
// ---------------------------------------------------------------------------

function buildChapter(n, sfmChapter, bsbChapter, cmnChapter, hiChapter, neChapter) {
  const verseNums = Object.keys(sfmChapter.verses)
    .map(Number)
    .sort((a, b) => a - b);

  const images = INLINE_IMAGES[n] ?? [];
  const imageAfter = new Map(images.map((img) => [img.after, img.file]));

  const blocks = [];
  for (const v of verseNums) {
    blocks.push({
      type: 'verse',
      number: v,
      bo: sfmChapter.verses[v],
      en: bsbChapter?.verses[v] ?? '',
      cmn: cmnChapter?.verses[v] ?? '',
      hi: hiChapter?.verses[v] ?? '',
      ne: neChapter?.verses[v] ?? '',
      paragraphStart: sfmChapter.paragraphStarts.has(v),
    });
    if (imageAfter.has(v)) {
      blocks.push({ type: 'image', file: imageAfter.get(v) });
    }
  }

  return {
    chapterNumber: n,
    order: n,
    labelBo: sfmChapter.label,
    sectionTitleBo: sfmChapter.section,
    labelEn: ENGLISH_LABELS[n],
    sectionTitleEn: bsbChapter?.section ?? '',
    labelCmn: CHINESE_LABELS[n],
    sectionTitleCmn: cmnChapter?.section ?? '',
    labelHi: INDIC_CHAPTER_LABELS[n],
    sectionTitleHi: hiChapter?.section ?? '',
    labelNe: INDIC_CHAPTER_LABELS[n],
    sectionTitleNe: NEPALI_TITLES[n],
    cover: COVER_IMAGES[n],
    verseCount: verseNums.length,
    audio: {
      adx: `/audio/adx/chapter-${n}.mp3`,
      bod: `/audio/bod/chapter-${n}.mp3`,
      khg: `/audio/khg/chapter-${n}.mp3`,
      eng: `/audio/eng/chapter-${n}.mp3`,
      cmn: `/audio/cmn/chapter-${n}.mp3`,
    },
    duration: {
      adx: fmtDuration(DURATIONS[n].adx),
      bod: fmtDuration(DURATIONS[n].bod),
      khg: fmtDuration(DURATIONS[n].khg),
      eng: fmtDuration(DURATIONS[n].eng),
      cmn: fmtDuration(DURATIONS[n].cmn),
    },
    timing: {
      adx: parseTiming('adx', n),
      bod: parseTiming('bod', n),
      khg: parseTiming('khg', n),
      eng: parseTiming('eng', n),
      cmn: parseTiming('cmn', n),
    },
    blocks,
  };
}

function main() {
  const sfmRaw = fs.readFileSync(SFM_PATH, 'utf8');
  const bsbRaw = fs.readFileSync(BSB_USFM_PATH, 'utf8');
  const cmnRaw = fs.readFileSync(CMN_USFM_PATH, 'utf8');
  const hiRaw = fs.readFileSync(HI_USFM_PATH, 'utf8');
  const neRaw = fs.readFileSync(NE_USFM_PATH, 'utf8');

  const sfmChapters = parseSfm(sfmRaw);
  const bsbChapters = parseBsbUsfm(bsbRaw);
  const cmnChapters = parseCmnUsfm(cmnRaw);
  const hiChapters = parseIndicUsfm(hiRaw);
  const neChapters = parseIndicUsfm(neRaw);
  const intro = parseIntroFromSfm(sfmRaw);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(INTRO_OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(INTRO_OUT_DIR, 'ruth.json'), JSON.stringify(intro, null, 2) + '\n');
  console.log(`intro: ${intro.sections.length} sections -> ${path.relative(ROOT, path.join(INTRO_OUT_DIR, 'ruth.json'))}`);

  for (const n of Object.keys(sfmChapters).map(Number).sort((a, b) => a - b)) {
    const chapter = buildChapter(n, sfmChapters[n], bsbChapters[n], cmnChapters[n], hiChapters[n], neChapters[n]);
    const outPath = path.join(OUT_DIR, `chapter-${n}.json`);
    fs.writeFileSync(outPath, JSON.stringify(chapter, null, 2) + '\n');
    const timingDialects = Object.entries(chapter.timing)
      .filter(([, v]) => v)
      .map(([k]) => k);
    console.log(
      `chapter ${n}: ${chapter.verseCount} verses, ${chapter.blocks.filter((b) => b.type === 'image').length} inline images, timing: [${timingDialects.join(', ') || 'none'}] -> ${path.relative(ROOT, outPath)}`,
    );
  }
}

main();
