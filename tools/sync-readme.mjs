#!/usr/bin/env node
/**
 * 由 scripts/ 下的 metadata + scripts/registry.json 生成根 README 的「脚本列表」表。
 *
 *   npm run readme:sync    # 重写 <!-- scripts:start --> 与 <!-- scripts:end --> 之间的内容
 *   npm run readme:check   # 只校验（CI 用），不一致则退出码 1
 *
 * 新增脚本后不用再手改 README 表格：跑一次 readme:sync 即可。
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS_DIR = join(ROOT, 'scripts');
const REGISTRY_FILE = join(SCRIPTS_DIR, 'registry.json');
const README = join(ROOT, 'README.md');
const TEMPLATE_DIR = '_template';
const REPO_SLUG = 'wyf0931/oma-userscripts';
const START = '<!-- scripts:start -->';
const END = '<!-- scripts:end -->';

function parseMetadata(source) {
  const meta = new Map();
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === '// ==UserScript==');
  if (start < 0) return meta;
  const end = lines.findIndex((line, index) => index > start && line.trim() === '// ==/UserScript==');
  if (end < 0) return meta;
  for (const line of lines.slice(start + 1, end)) {
    const match = line.match(/^\s*\/\/\s*@(\S+)\s*(.*)$/);
    if (match && !meta.has(match[1])) meta.set(match[1], match[2].trim());
  }
  return meta;
}

const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

async function loadScripts() {
  const registry = JSON.parse(await readFile(REGISTRY_FILE, 'utf8'));
  const dirs = (await readdir(SCRIPTS_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== TEMPLATE_DIR)
    .map((entry) => entry.name)
    .sort();

  const scripts = [];
  for (const dir of dirs) {
    const file = join(SCRIPTS_DIR, dir, `${dir}.user.js`);
    const meta = parseMetadata(await readFile(file, 'utf8'));
    const entry = registry[dir] || {};
    const gfId = entry.greasyfork?.id;
    scripts.push({
      dir,
      name: meta.get('name') || dir,
      platform: entry.platform || '—',
      description: meta.get('description') || '',
      rawUrl: `https://raw.githubusercontent.com/${REPO_SLUG}/main/scripts/${dir}/${dir}.user.js`,
      greasyforkUrl: gfId ? `https://greasyfork.org/zh-CN/scripts/${gfId}` : '',
    });
  }
  return scripts;
}

function renderTable(scripts) {
  const lines = [
    '| 脚本 | 平台 | 功能 | 安装 |',
    '| --- | --- | --- | --- |',
  ];
  for (const script of scripts) {
    const install = [
      script.greasyforkUrl ? `[Greasy Fork](${script.greasyforkUrl})` : 'Greasy Fork（待上架）',
      `[GitHub](${script.rawUrl})`,
    ].join(' · ');
    lines.push(`| [${cell(script.name)}](scripts/${script.dir}/) | ${cell(script.platform)} | ${cell(script.description)} | ${install} |`);
  }
  return lines.join('\n');
}

async function main() {
  const check = process.argv.includes('--check');
  const scripts = await loadScripts();
  const readme = await readFile(README, 'utf8');

  const startIndex = readme.indexOf(START);
  const endIndex = readme.indexOf(END);
  if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
    console.error(`README.md 缺少 ${START} / ${END} 标记`);
    process.exitCode = 1;
    return;
  }

  const next = `${readme.slice(0, startIndex + START.length)}\n${renderTable(scripts)}\n${readme.slice(endIndex)}`;

  if (check) {
    if (next !== readme) {
      console.error('README.md 的脚本列表不是最新的，本地执行 `npm run readme:sync` 后提交。');
      process.exitCode = 1;
      return;
    }
    console.log(`README 脚本列表已是最新（${scripts.length} 个脚本）✓`);
    return;
  }

  if (next === readme) {
    console.log(`README 脚本列表无变化（${scripts.length} 个脚本）`);
    return;
  }
  await writeFile(README, next, 'utf8');
  console.log(`README 脚本列表已更新（${scripts.length} 个脚本）`);
}

await main();
