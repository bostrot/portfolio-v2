# erictrenkel.com — portfolio v2

Personal portfolio, rebuilt around one idea: **all processing happens in the
backend (CI), none in the browser.** The site is plain HTML + CSS with a tiny
progressive-enhancement script — no framework, no client-side API calls.

## How it works

```
┌─────────────────────┐   cron (daily)   ┌──────────────────────┐
│ GitHub API          │ ───────────────► │ update-data.yml      │
│ (profile + repos)   │                  │ fetch-github.mjs     │
└─────────────────────┘                  │ commits data/*.json  │
                                         └──────────┬───────────┘
                                                    │ workflow_call
┌─────────────────────┐   on push        ┌──────────▼───────────┐
│ templates/ + data/  │ ───────────────► │ deploy.yml           │
│ + static/           │                  │ build.mjs → dist/    │
└─────────────────────┘                  │ → GitHub Pages       │
                                         └──────────────────────┘
```

- [`scripts/fetch-github.mjs`](scripts/fetch-github.mjs) pulls profile stats and
  repositories from the GitHub API into [`data/github.json`](data/github.json).
  It skips the write when nothing but the timestamp changed, so the scheduled
  run only commits on real activity.
- [`scripts/build.mjs`](scripts/build.mjs) is a dependency-free static site
  generator: it merges `templates/` with `data/` and copies `static/` into
  `dist/`.
- [`data/featured.json`](data/featured.json) holds the hand-written blurbs for
  the featured project cards; live stars/forks/language are merged in at build
  time.
- [`.github/workflows/update-data.yml`](.github/workflows/update-data.yml) runs
  daily, commits refreshed data as **Eric Trenkel**, and triggers a deploy.
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and
  publishes to GitHub Pages on every push to `main`.

## Local development

```sh
node scripts/fetch-github.mjs   # refresh data/github.json (optional)
node scripts/build.mjs          # build into dist/
npx serve dist                  # or any static file server
```

Requires Node ≥ 20. No `npm install` needed.

## One-time repo setup

1. **Settings → Pages → Source: GitHub Actions.**
2. **Settings → Pages → Custom domain: `erictrenkel.com`** (the CNAME file is
   not used with Actions-based deploys).
3. DNS for `erictrenkel.com` must point at GitHub Pages (A records
   185.199.108–111.153 / AAAA, or keep whatever the old repo used).
4. Disable Pages on the old `portfolio` repo so the domain doesn't conflict.

## Editing content

- Experience / about / education: [`templates/index.html`](templates/index.html)
- Featured project blurbs: [`data/featured.json`](data/featured.json)
- Design: [`static/style.css`](static/style.css)
- Imprint & privacy: [`templates/pages/`](templates/pages/)
