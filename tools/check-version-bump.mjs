#!/usr/bin/env node
/**
 * 版本递增守卫：脚本代码变了就必须递增 @version。
 * 忘记递增不会报错，但 Greasy Fork 会认为「代码未变」而不发新版本 —— 这是最容易踩的静默失败。
 *
 *   npm run check:versions            # 默认对比 origin/main
 *   npm run check:versions -- --base <git-ref>
 *
 * 无法解析的 base（新分支 / 首次 push / 本地还没有该引用）会被跳过而不是报错。
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_GLOB = 'scripts/**/*.user.js';

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFail) return null;
    throw error;
  }
}

function parseVersion(source) {
  const match = String(source).match(/^\s*\/\/\s*@version\s+(\S+)/m);
  return match ? match[1] : '';
}

function compareVersions(a, b) {
  const left = a.split(/[.+-]/).map((part) => (Number.isFinite(Number(part)) ? Number(part) : 0));
  const right = b.split(/[.+-]/).map((part) => (Number.isFinite(Number(part)) ? Number(part) : 0));
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function resolveBase() {
  const argIndex = process.argv.indexOf('--base');
  const cliBase = argIndex > -1 ? process.argv[argIndex + 1] : '';
  const candidates = [cliBase, process.env.BASE, 'origin/main'].filter(Boolean);
  for (const candidate of candidates) {
    if (/^0+$/.test(candidate)) continue;
    if (git(['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], { allowFail: true })) return candidate;
  }
  return '';
}

async function main() {
  const base = resolveBase();
  if (!base) {
    console.log('跳过版本守卫：找不到可比较的 base（新分支或本地未拉取 origin/main）');
    return;
  }

  const changed = (git(['diff', '--name-only', base, '--', SCRIPT_GLOB], { allowFail: true }) || '')
    .split('\n')
    .filter(Boolean);

  if (!changed.length) {
    console.log(`版本守卫通过：${base} 以来没有脚本代码变更 ✓`);
    return;
  }

  const problems = [];
  const rows = [];

  for (const file of changed) {
    let current;
    try {
      current = await readFile(join(ROOT, file), 'utf8');
    } catch {
      rows.push(`${file}: 已删除，跳过`);
      continue; // 文件被删除
    }
    const currentVersion = parseVersion(current);
    const previous = git(['show', `${base}:${file}`], { allowFail: true });

    if (previous === null) {
      rows.push(`${file}: 新增 (v${currentVersion})`);
      continue;
    }

    const previousVersion = parseVersion(previous);
    if (previous === current) {
      rows.push(`${file}: 内容未变 (v${currentVersion})`);
      continue;
    }
    if (!currentVersion) {
      problems.push(`${file}: 缺少 @version`);
      continue;
    }
    if (currentVersion === previousVersion) {
      problems.push(`${file}: 代码有改动但 @version 仍是 ${currentVersion}（必须递增，否则 Greasy Fork 不会发新版本）`);
      continue;
    }
    if (compareVersions(currentVersion, previousVersion) <= 0) {
      problems.push(`${file}: @version 回退或非法（${previousVersion} -> ${currentVersion}）`);
      continue;
    }
    rows.push(`${file}: v${previousVersion} -> v${currentVersion}`);
  }

  rows.forEach((row) => console.log(`  · ${row}`));

  if (problems.length) {
    console.log('\n错误：');
    problems.forEach((problem) => console.log(`  ✗ ${problem}`));
    console.log('\n版本守卫失败\n');
    process.exitCode = 1;
    return;
  }

  console.log(`\n版本守卫通过（base: ${base}）✓\n`);
}

await main();
