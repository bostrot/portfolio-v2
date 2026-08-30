#!/usr/bin/env node
/**
 * Fetches supplementary public stats — Docker Hub pulls, Stack Overflow
 * reputation, pub.dev package scores, and the latest blog posts — into
 * data/extras.json. Runs in CI next to fetch-github.mjs; every source is
 * best-effort so one flaky API never breaks the pipeline.
 *
 * Usage: node scripts/fetch-extras.mjs
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'data', 'extras.json');

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'bostrot-portfolio-build' } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

async function tryFetch(name, fn) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`WARN ${name} failed: ${err.message} — keeping previous value if any.`);
    return undefined;
  }
}

/* ---------- Docker Hub ---------- */
const docker = await tryFetch('dockerhub', async () => {
  const repos = [];
  for (let page = 1; page <= 3; page++) {
    const d = await getJson(`https://hub.docker.com/v2/repositories/bostrot/?page=${page}&page_size=100`);
    repos.push(...d.results);
    if (!d.next) break;
  }
  return {
    totalPulls: repos.reduce((s, r) => s + r.pull_count, 0),
    repos: Object.fromEntries(repos.map((r) => [r.name, r.pull_count])),
  };
});

/* ---------- Stack Overflow ---------- */
const stackoverflow = await tryFetch('stackoverflow', async () => {
  const d = await getJson('https://api.stackexchange.com/2.3/users/5237072?site=stackoverflow');
  const u = d.items[0];
  return { reputation: u.reputation, badges: u.badge_counts };
});

/* ---------- pub.dev (all packages of publisher bostrot.com) ---------- */
const pubdev = await tryFetch('pubdev', async () => {
  const search = await getJson('https://pub.dev/api/search?q=publisher%3Abostrot.com');
  const packages = {};
  for (const p of search.packages ?? []) {
    const score = await getJson(`https://pub.dev/api/packages/${p.package}/score`);
    packages[p.package] = {
      likes: score.likeCount,
      downloads30d: score.downloadCount30Days ?? null,
    };
  }
  return { packages };
});

/* ---------- Blog (Ghost RSS at senpai.club/feed) ---------- */
const blog = await tryFetch('blog', async () => {
  const res = await fetch('https://senpai.club/feed', {
    headers: { 'User-Agent': 'bostrot-portfolio-build' },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const xml = await res.text();
  // Atom feed (Jekyll): <entry> with <link href="..."/> and <published>.
  const items = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 4).map((m) => {
    const block = m[1];
    const pick = (tag) => {
      const raw = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? '';
      return raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
    };
    const date = pick('published') || pick('updated');
    return {
      title: pick('title'),
      url: block.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? '',
      date: date ? new Date(date).toISOString().slice(0, 10) : null,
    };
  });
  return { posts: items };
});

/* ---------- merge with previous so a failed source keeps its last value ---------- */
let previous = {};
try {
  previous = JSON.parse(await readFile(OUT_FILE, 'utf8'));
} catch { /* first run */ }

const data = {
  fetchedAt: new Date().toISOString(),
  docker: docker ?? previous.docker ?? null,
  stackoverflow: stackoverflow ?? previous.stackoverflow ?? null,
  pubdev: pubdev ?? previous.pubdev ?? null,
  blog: blog ?? previous.blog ?? null,
};

const strip = (d) => JSON.stringify({ ...d, fetchedAt: null });
if (previous.fetchedAt && strip(previous) === strip(data)) {
  console.log('No changes in extras data, keeping existing file.');
  process.exit(0);
}

await mkdir(path.dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, JSON.stringify(data, null, 2) + '\n');
console.log(
  `Wrote extras.json: ${data.docker?.totalPulls ?? '?'} docker pulls, SO rep ${data.stackoverflow?.reputation ?? '?'}, ${data.blog?.posts?.length ?? 0} blog posts.`
);
