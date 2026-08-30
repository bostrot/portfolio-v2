#!/usr/bin/env node
/**
 * Fetches profile + repository data from the GitHub API and writes it to
 * data/github.json. Runs in CI on a schedule; the result is committed so the
 * site can be built statically without any client-side API calls.
 *
 * Usage: node scripts/fetch-github.mjs
 * Env:   GITHUB_TOKEN (optional, raises the rate limit in CI)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const USER = 'bostrot';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'data', 'github.json');

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': `${USER}-portfolio-build`,
};
if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

async function gh(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${url}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchAllRepos() {
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await gh(
      `https://api.github.com/users/${USER}/repos?per_page=100&page=${page}&type=owner`
    );
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

const profile = await gh(`https://api.github.com/users/${USER}`);
const allRepos = await fetchAllRepos();

const ownRepos = allRepos.filter((r) => !r.fork);
const visibleRepos = ownRepos.filter((r) => !r.archived);

const repos = visibleRepos
  .map((r) => ({
    name: r.name,
    description: r.description,
    url: r.html_url,
    homepage: r.homepage || null,
    stars: r.stargazers_count,
    forks: r.forks_count,
    language: r.language,
    topics: r.topics ?? [],
    pushedAt: r.pushed_at,
  }))
  .sort((a, b) => b.stars - a.stars);

const data = {
  fetchedAt: new Date().toISOString(),
  profile: {
    name: profile.name,
    login: profile.login,
    avatarUrl: profile.avatar_url,
    url: profile.html_url,
    followers: profile.followers,
    publicRepos: profile.public_repos,
  },
  totals: {
    // Totals include archived repos: stars earned don't disappear.
    stars: ownRepos.reduce((sum, r) => sum + r.stargazers_count, 0),
    forks: ownRepos.reduce((sum, r) => sum + r.forks_count, 0),
    repos: ownRepos.length,
    // Earliest own repo — the honest anchor for "shipping code since ...".
    firstRepoCreatedAt: ownRepos
      .map((r) => r.created_at)
      .sort()[0],
  },
  repos,
};

// Skip the write when nothing but the timestamp changed, so the scheduled CI
// run doesn't create a commit every day regardless of activity.
let previous = null;
try {
  previous = JSON.parse(await readFile(OUT_FILE, 'utf8'));
} catch {
  // first run, no previous file
}

const strip = (d) => JSON.stringify({ ...d, fetchedAt: null });
if (previous && strip(previous) === strip(data)) {
  console.log('No changes in GitHub data, keeping existing file.');
  process.exit(0);
}

await mkdir(path.dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, JSON.stringify(data, null, 2) + '\n');
console.log(
  `Wrote ${OUT_FILE}: ${repos.length} repos, ${data.totals.stars} total stars.`
);
