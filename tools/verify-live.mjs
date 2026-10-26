#!/usr/bin/env node
/**
 * 线上版本核对：GitHub 里的 @version 是否已经同步到 Greasy Fork。
 * 用来发现「webhook 挂了 / secret 换了 / 同步一直失败」这类静默问题。
 *
 *   npm run verify:live                       # 查一次
 *   npm run verify:live -- --retries 8        # push 后轮询最多 8 次（间隔 15s）
 *   node tools/verify-live.mjs --script youtube-channel-videos
 *
 * 退出码：0 全部一致；1 有脚本落后（同步链路有问题）
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS_DIR = join(ROOT, 'scripts');
const REGISTRY_FILE = join(SCRIPTS_DIR, 'registry.json');

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : 'true';
}

function parseVersion(source) {
  const match = String(source).match(/^\s*\/\/\s*@version\s+(\S+)/m);
  return match ? match[1] : '';
}

function compareVersions(a, b) {
  const left = a.split(/[.+-]/).map((part) => (Number.isFinite(Number(part)) ? Number(part) : 0));
  const right = b.split(/[.+-]/).map((part) => (Number.isFinite(Number(part)) ? Number(part) : 0));
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

async function fetchLive(id) {
  const url = `https://greasyfork.org/scripts/${id}.json`;
  return fetchJson(url);
}

/**
 * Node 自带的 fetch 默认不读 http(s)_proxy 环境变量，在公司/本机有代理时会直接 ECONNRESET。
 * 有代理就改用 curl；没有代理则用 fetch，失败再退回 curl。
 */
async function fetchJson(url) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy;
  if (!proxy) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'oma-userscripts-verify-live' },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.log(`  （fetch 失败：${error.message}，改用 curl）`);
    }
  }
  try {
    const { stdout } = await execFileAsync('curl', ['-sSL', '--fail', '--max-time', '25', '-H', 'accept: application/json', url]);
    return JSON.parse(stdout);
  } catch (error) {
    const detail = String(error.stderr || '').trim().split('\n').filter(Boolean).pop() || error.message;
    throw new Error(detail);
  }
}

async function collectTargets() {
  const registry = JSON.parse(await readFile(REGISTRY_FILE, 'utf8'));
  const only = arg('script');
  const targets = [];
  for (const [dir, entry] of Object.entries(registry)) {
    if (only && only !== 'true' && only !== dir) continue;
    const id = entry.greasyfork?.id;
    if (!id) continue;
    const source = await readFile(join(SCRIPTS_DIR, dir, `${dir}.user.js`), 'utf8');
    targets.push({ dir, id, local: parseVersion(source) });
  }
  return targets;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const retries = Math.max(1, Number(arg('retries', '1')) || 1);
  const interval = Math.max(1, Number(arg('interval', '15')) || 15) * 1000;
  const targets = await collectTargets();

  if (!targets.length) {
    console.log('没有已上架（registry 里有 greasyfork.id）的脚本，跳过');
    return;
  }

  let pending = targets;
  let results = [];

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    results = [];
    for (const target of pending) {
      try {
        const live = await fetchLive(target.id);
        results.push({ ...target, live: live.version, updatedAt: live.code_updated_at, installs: live.total_installs });
      } catch (error) {
        results.push({ ...target, live: '', error: error.message });
      }
    }
    const behind = results.filter((row) => row.error || row.live !== row.local);
    if (!behind.length) break;
    if (attempt < retries) {
      console.log(`第 ${attempt}/${retries} 次：仍有 ${behind.length} 个脚本未同步，${interval / 1000}s 后重试…`);
      await sleep(interval);
      pending = behind.map(({ dir, id, local }) => ({ dir, id, local }));
    }
  }

  console.log('\n线上版本核对：\n');
  for (const row of results) {
    if (row.error) {
      console.log(`  ✗ ${row.dir}: 查询失败 (${row.error})  本地 v${row.local}`);
      continue;
    }
    const same = row.live === row.local;
    const note = same ? '一致' : compareVersions(row.live, row.local) < 0 ? '线上落后' : '线上领先（可能有人直接改了脚本站）';
    console.log(`  ${same ? '✓' : '✗'} ${row.dir}: 本地 v${row.local} / 线上 v${row.live} · ${note} · 安装量 ${row.installs} · ${row.updatedAt}`);
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const lines = ['## 线上版本核对', '', '| 脚本 | 本地 | 线上 | 安装量 | 最后同步 |', '| --- | --- | --- | --- | --- |'];
    for (const row of results) {
      lines.push(`| ${row.dir} | v${row.local} | ${row.error ? '查询失败' : `v${row.live}`} | ${row.installs ?? '—'} | ${row.updatedAt ?? '—'} |`);
    }
    const { appendFile } = await import('node:fs/promises');
    await appendFile(summaryPath, `${lines.join('\n')}\n`);
  }

  const behind = results.filter((row) => row.error || row.live !== row.local);
  if (behind.length) {
    console.log(`\n有 ${behind.length} 个脚本未与仓库一致：检查 GitHub webhook 与 Greasy Fork 同步状态\n`);
    process.exitCode = 1;
    return;
  }
  console.log('\n全部一致 ✓\n');
}

await main();
