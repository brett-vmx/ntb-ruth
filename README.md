# Ruth

A mobile-first PWA for reading and listening to the Book of Ruth — Tibetan
(Amdo, Kham, and Central dialects), English, and Chinese, with Hindi and
Nepali also available as text-only reading languages. Built for New
Tibetan Bible (new-tibetan-bible.com), as a sibling app to `ntb-jonah`
(same architecture, different book — see CLAUDE.md for the full port
history and every architectural decision this app makes).

Works fully offline once installed: all text and audio (all five dialects —
adx/bod/khg/eng/cmn) are cached at install time.

## Tech stack

- **Astro 5**, static output (no SSR adapter)
- **Tailwind CSS v4** via the Vite plugin
- **Astro Content Collections** using the Astro 5 loader API (`src/content.config.ts`)
- **@vite-pwa/astro** for offline support
- Vanilla JS only — no React/Vue/framework islands
- **Lucide** icons

## Project layout

```
source-assets/          Original files from the client — SFM/USFM text (5
                         languages), PDF layout reference, raw JPGs/MP3s/
                         fonts, per-dialect verse-timing exports (timing/).
                         Not used directly by the app; kept as the source
                         of truth for regeneration.
scripts/
  gen-chapters.mjs       Parses all 5 language sources + source-assets/
                         timing/*.txt into src/content/chapters/*.json,
                         plus the book introduction (from 08RUTNTB.SFM's
                         own front matter) into src/content/intro/ruth.json.
                         Re-run this (`npm run gen-chapters`) any time a
                         source text or timing file changes — don't
                         hand-edit the generated JSON.
src/
  content.config.ts      Content collection schemas (chapters, intro)
  content/chapters/      Generated per-chapter data (verses in all 5
                         languages, inline image placement, audio paths,
                         durations, verse timing)
  content/intro/         Generated book-introduction data (Tibetan only)
  assets/chapters/       Optimized cover + inline illustration images (webp)
  assets/branding/       Logo/banner images
  components/            ChapterCard.astro
  layouts/                Layout.astro
  pages/                  index.astro (home + reading modal), chapter/[n].astro
                         (static fallback page for direct links / crawlers)
public/
  audio/{adx,bod,khg,eng,cmn}/  Per-chapter audio, all five dialects present.
                         cmn (Chinese, CUV, read by Jason Chen) arrived
                         pre-split by chapter — unlike eng, no splitting
                         was needed, just re-encoding to 64kbps to match
                         the rest.
  fonts/                  Self-hosted Tibetan Unicode fonts + subsetted
                         Chinese (Noto Sans SC)
  icons/                  PWA icons — currently a Claude-built placeholder
                         (gold tile + Tibetan wordmark), pending a real
                         design from John (see CLAUDE.md)
```

## Fonts

Three Tibetan fonts are bundled in full (`public/fonts/`, declared in
`src/styles/global.css`) — same three as `ntb-jonah`, not subsetted:

- **Monlam Uni OuChan2** — default reading face, block/u-chen script.
- **Monlam Uni ChoukMatik** and **Monlam Uni Dutsa2** — u-med ("headless")
  cursive calligraphy styles, offered as alternates in the text settings
  sheet.

Chinese (Noto Sans SC) is self-hosted and subsetted to the ~520 characters
actually used in Ruth's own CUV text plus the About page's Chinese copy —
see CLAUDE.md's "Fonts" section for why (mainland China's firewall blocks
Google Fonts) and how to re-subset if the text ever changes.

## Content pipeline

Unlike Jonah, Ruth's English source arrived as plain USFM (not RTF), and
its Tibetan SFM carries the book's introduction directly in its own front
matter (no separate intro document needed). Chinese/Hindi/English/Tibetan
all have multiple sub-headings per chapter in their sources — the
generator keeps only the first per chapter as that chapter's overall
section title. See CLAUDE.md's "Content is generated, not hand-authored"
and "Book introduction" sections for the full detail.

English audio (`public/audio/eng/`) was split from a single whole-book
file John supplied, using a local Whisper-transcription + text-alignment
pass — see CLAUDE.md for exactly how, and how to redo it if the source
audio changes. Chinese audio (`public/audio/cmn/`) arrived already split
by chapter; its timing was generated with the same Whisper + alignment
approach, minus the splitting step.

## Development

```bash
npm install
npm run dev       # http://localhost:4416
npm run build     # -> dist/
npm run preview
```

## Deployment

Static build, intended for Netlify (same as `ntb-jonah` — Cloudflare Pages
doesn't support HTTP Range requests, which this app's audio seeking
depends on). Not yet actually created on Netlify — `astro.config.mjs`'s
`site:` is a placeholder until that's set up.
