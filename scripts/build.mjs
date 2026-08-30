#!/usr/bin/env node
/**
 * Static site generator: merges templates/ + data/ + static/ into dist/.
 * No dependencies — plain Node (>= 20).
 *
 * Usage: node scripts/build.mjs
 */

import { readFile, writeFile, mkdir, cp, readdir, rm, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DIST_BOSTROT = path.join(ROOT, 'dist-bostrot');

const github = JSON.parse(
  await readFile(path.join(ROOT, 'data', 'github.json'), 'utf8')
);
const featured = JSON.parse(
  await readFile(path.join(ROOT, 'data', 'featured.json'), 'utf8')
);

// GitHub's linguist colors for the languages that actually appear in the data.
const LANG_COLORS = {
  Dart: '#00B4AB',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  'C#': '#178600',
  'C++': '#f34b7d',
  C: '#555555',
  Rust: '#dea584',
  Java: '#b07219',
  Kotlin: '#A97BFF',
  Python: '#3572A5',
  HTML: '#e34c26',
  CSS: '#663399',
  Shell: '#89e051',
  Dockerfile: '#384d54',
  PHP: '#4F5D95',
  Go: '#00ADD8',
};

const esc = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const fmt = (n) => n.toLocaleString('en-US');

const starIcon =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z"/></svg>';
const forkIcon =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0zM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0z"/></svg>';

const langDot = (language) => {
  if (!language) return '';
  const color = LANG_COLORS[language] ?? '#8a94ab';
  return `<span class="lang"><i style="background:${color}"></i>${esc(language)}</span>`;
};

const repoByName = new Map(github.repos.map((r) => [r.name, r]));

/* ---------- featured cards ---------- */

const featuredHtml = featured.projects
  .map((p) => {
    const live = repoByName.get(p.repo);
    const links = [
      ...p.links,
      { label: 'GitHub', url: live?.url ?? `https://github.com/bostrot/${p.repo}` },
    ]
      .map(
        (l) =>
          `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`
      )
      .join('');
    const tags = p.tags
      .map((t) => `<span>${esc(t)}</span>`)
      .join('');
    const stats = live
      ? `<div class="repo-stats">
          <span class="stars">${starIcon}${fmt(live.stars)}</span>
          <span>${forkIcon}${fmt(live.forks)}</span>
        </div>
        ${langDot(live.language)}`
      : '';
    return `<article class="feat-card reveal">
      <div>
        <h3><a href="${esc(live?.url ?? `https://github.com/bostrot/${p.repo}`)}" target="_blank" rel="noopener">${esc(p.title)}</a></h3>
        <p class="feat-blurb">${esc(p.blurb)}</p>
        <div class="tags mono">${tags}</div>
        <div class="feat-links mono">${links}</div>
      </div>
      <div class="feat-side">${stats}</div>
    </article>`;
  })
  .join('\n');

/* ---------- repo grid (everything not featured, min 2 stars) ---------- */

const featuredNames = new Set(featured.projects.map((p) => p.repo));
const gridRepos = github.repos
  .filter((r) => !featuredNames.has(r.name) && r.stars >= 2 && r.name !== 'portfolio-v2' && r.name !== 'portfolio' && r.name !== 'bostrot')
  .slice(0, 9);

const reposHtml = gridRepos
  .map(
    (r) => `<a class="repo-card reveal" href="${esc(r.url)}" target="_blank" rel="noopener">
      <h4>${esc(r.name)}</h4>
      <p>${esc(r.description ?? '')}</p>
      <div class="repo-foot">
        ${langDot(r.language)}
        <div class="repo-stats">
          <span class="stars">${starIcon}${fmt(r.stars)}</span>
          <span>${forkIcon}${fmt(r.forks)}</span>
        </div>
      </div>
    </a>`
  )
  .join('\n');

/* ---------- stats ---------- */

const statsHtml = `
  <div class="stat"><b>${fmt(github.totals.stars)}</b><span>Stars</span></div>
  <div class="stat"><b>${fmt(github.totals.repos)}</b><span>Repos</span></div>
  <div class="stat"><b>${fmt(github.profile.followers)}</b><span>Followers</span></div>`;

/* ---------- SEO: JSON-LD structured data ---------- */

const SITE_URL = 'https://erictrenkel.com/';

const jsonld = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Person',
      '@id': `${SITE_URL}#person`,
      name: 'Eric Trenkel',
      jobTitle: 'Senior Software Engineer & IT Consultant',
      description:
        'Senior Software Engineer & IT Consultant focused on software architecture, system integration and technical leadership. Open source maintainer.',
      url: SITE_URL,
      image: github.profile.avatarUrl,
      email: 'mailto:eric@bostrot.com',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Cologne',
        addressCountry: 'DE',
      },
      alumniOf: {
        '@type': 'CollegeOrUniversity',
        name: 'FH Aachen University of Applied Sciences',
      },
      worksFor: { '@type': 'Organization', name: 'NEOZO' },
      knowsAbout: [
        'Software Architecture',
        'System Integration',
        'Java',
        'Kotlin',
        'Spring Boot',
        'Apache Kafka',
        'Dart',
        'Flutter',
        'TypeScript',
        'Rust',
        'CI/CD',
      ],
      sameAs: [
        'https://github.com/bostrot',
        'https://linkedin.com/in/erictrenkel',
        'https://stackoverflow.com/users/5237072/bostrot',
        'https://senpai.club',
        'https://wslmanager.com',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}#website`,
      url: SITE_URL,
      name: 'Eric Trenkel — Portfolio',
      author: { '@id': `${SITE_URL}#person` },
      inLanguage: 'en',
    },
    ...featured.projects.map((p) => {
      const live = repoByName.get(p.repo);
      return {
        '@type': 'SoftwareSourceCode',
        name: p.title,
        description: p.blurb,
        codeRepository: live?.url ?? `https://github.com/bostrot/${p.repo}`,
        programmingLanguage: live?.language ?? undefined,
        author: { '@id': `${SITE_URL}#person` },
        ...(p.links[0] ? { url: p.links[0].url } : {}),
      };
    }),
  ],
};

const jsonldTag = `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`;

/* ---------- assemble ---------- */

const updated = new Date(github.fetchedAt).toISOString().slice(0, 10);
const totalStarsRounded = `${Math.floor(github.totals.stars / 100) * 100}`;

// Full years since the first own public repo (2016) — rendered as "10+ years".
const firstRepoYear = new Date(github.totals.firstRepoCreatedAt).getFullYear();
const yearsCoding = Math.floor(
  (Date.now() - new Date(github.totals.firstRepoCreatedAt)) /
    (365.25 * 24 * 3600 * 1000)
);

let html = await readFile(path.join(ROOT, 'templates', 'index.html'), 'utf8');
html = html
  .replaceAll('{{STATS}}', statsHtml)
  .replaceAll('{{FEATURED}}', featuredHtml)
  .replaceAll('{{REPOS}}', reposHtml)
  .replaceAll('{{AVATAR_URL}}', esc(github.profile.avatarUrl))
  .replaceAll('{{TOTAL_STARS}}', fmt(Number(totalStarsRounded)))
  .replaceAll('{{JSONLD}}', jsonldTag)
  .replaceAll('{{UPDATED}}', updated)
  .replaceAll('{{YEARS_CODING}}', String(yearsCoding))
  .replaceAll('{{FIRST_REPO_YEAR}}', String(firstRepoYear))
  .replaceAll('{{YEAR}}', String(new Date().getFullYear()));

if (html.includes('{{')) {
  const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
  throw new Error(`Unreplaced template placeholders: ${leftover?.join(', ')}`);
}

await mkdir(DIST, { recursive: true });
await cp(path.join(ROOT, 'static'), DIST, { recursive: true });
await writeFile(path.join(DIST, 'index.html'), html);

// Secondary pages (imprint, privacy) share the site shell.
const pageShell = await readFile(path.join(ROOT, 'templates', 'page.html'), 'utf8');
for (const file of await readdir(path.join(ROOT, 'templates', 'pages'))) {
  const content = await readFile(path.join(ROOT, 'templates', 'pages', file), 'utf8');
  const titleMatch = content.match(/<h1[^>]*>(.*?)<\/h1>/s);
  const page = pageShell
    .replaceAll('{{CONTENT}}', content)
    .replaceAll('{{TITLE}}', titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '') : 'Eric Trenkel')
    .replaceAll('{{YEAR}}', String(new Date().getFullYear()));
  await writeFile(path.join(DIST, file), page);
}

// SEO plumbing: sitemap (index only — legal pages are noindex) and robots.txt.
const writeSeoFiles = async (dist, siteUrl) => {
  await writeFile(
    path.join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}</loc>
    <lastmod>${updated}</lastmod>
  </url>
</urlset>
`
  );
  await writeFile(
    path.join(dist, 'robots.txt'),
    `User-agent: *
Allow: /

Sitemap: ${siteUrl}sitemap.xml
`
  );
};
await writeSeoFiles(DIST, SITE_URL);

/* ================================================================
   Second site: bostrot.com — the company page. Same styles, fonts,
   data and legal pages; own template, favicon and structured data.
   Deployed by the bostrot.com repo's workflow from dist-bostrot/.
   ================================================================ */

const BOSTROT_URL = 'https://bostrot.com/';

const bostrotJsonld = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${BOSTROT_URL}#org`,
      name: 'Bostrot Inh. Eric Trenkel',
      alternateName: 'Bostrot',
      url: BOSTROT_URL,
      email: 'mailto:eric@bostrot.com',
      vatID: 'DE353552581',
      foundingDate: '2021',
      founder: {
        '@type': 'Person',
        name: 'Eric Trenkel',
        url: SITE_URL,
      },
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Pulheim',
        addressCountry: 'DE',
      },
      sameAs: ['https://github.com/bostrot', 'https://wslmanager.com'],
    },
    ...featured.projects.map((p) => {
      const live = repoByName.get(p.repo);
      return {
        '@type': 'SoftwareApplication',
        name: p.title,
        description: p.blurb,
        url: p.links[0]?.url ?? live?.url ?? `https://github.com/bostrot/${p.repo}`,
        applicationCategory: 'DeveloperApplication',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        author: { '@id': `${BOSTROT_URL}#org` },
      };
    }),
  ],
};

let bostrotHtml = await readFile(
  path.join(ROOT, 'templates', 'bostrot.html'),
  'utf8'
);
bostrotHtml = bostrotHtml
  .replaceAll('{{JSONLD}}', `<script type="application/ld+json">${JSON.stringify(bostrotJsonld)}</script>`)
  .replaceAll('{{STATS}}', statsHtml)
  .replaceAll('{{FEATURED}}', featuredHtml)
  .replaceAll('{{TOTAL_STARS}}', fmt(Number(totalStarsRounded)))
  .replaceAll('{{UPDATED}}', updated)
  .replaceAll('{{YEAR}}', String(new Date().getFullYear()));

if (bostrotHtml.includes('{{')) {
  const leftover = bostrotHtml.match(/\{\{[A-Z_]+\}\}/g);
  throw new Error(`Unreplaced bostrot placeholders: ${leftover?.join(', ')}`);
}

await rm(DIST_BOSTROT, { recursive: true, force: true });
await mkdir(DIST_BOSTROT, { recursive: true });
await cp(path.join(ROOT, 'static'), DIST_BOSTROT, { recursive: true });
await rename(
  path.join(DIST_BOSTROT, 'favicon-bostrot.svg'),
  path.join(DIST_BOSTROT, 'favicon.svg')
);
await rm(path.join(DIST, 'favicon-bostrot.svg'), { force: true });
await writeFile(path.join(DIST_BOSTROT, 'index.html'), bostrotHtml);

// The legal pages apply to both domains (same operator).
for (const file of await readdir(path.join(ROOT, 'templates', 'pages'))) {
  await cp(path.join(DIST, file), path.join(DIST_BOSTROT, file));
}
await writeSeoFiles(DIST_BOSTROT, BOSTROT_URL);

console.log(
  `Built dist/: ${featured.projects.length} featured, ${gridRepos.length} grid repos, data from ${updated}.`
);
console.log(`Built dist-bostrot/: company page with ${featured.projects.length} products.`);
