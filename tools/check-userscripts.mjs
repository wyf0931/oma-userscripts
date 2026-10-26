#!/usr/bin/env node
/**
 * 校验 scripts/ 下所有 *.user.js：
 *   - metadata block 是否存在、必填字段是否齐全
 *   - 是否误写了 @updateURL / @downloadURL
 *   - 文件名是否符合 <目录名>.user.js
 *   - @version 是否 semver
 *   - @name 是否重复
 *   - JS 语法是否合法
 *
 * 用法：npm run check
 */
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS_DIR = join(ROOT, 'scripts');
const TEMPLATE_DIR = '_template';

const REQUIRED_KEYS = ['name', 'namespace', 'version', 'description', 'license'];
const FORBIDDEN_KEYS = ['updateURL', 'downloadURL'];
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith('.user.js')) yield full;
  }
}

function parseMetadata(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === '// ==UserScript==');
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && line.trim() === '// ==/UserScript==');
  if (end < 0) return null;

  const meta = new Map();
  for (const line of lines.slice(start + 1, end)) {
    const match = line.match(/^\s*\/\/\s*@(\S+)\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim();
    if (!meta.has(key)) meta.set(key, []);
    meta.get(key).push(value);
  }
  return meta;
}

const baseKey = (key) => key.split(':')[0];
const firstValue = (meta, key) => (meta.get(key) || [])[0] || '';

async function main() {
  const files = [];
  for await (const file of walk(SCRIPTS_DIR)) files.push(file);
  files.sort();

  const errors = [];
  const warnings = [];
  const rows = [];
  const names = new Map();

  for (const file of files) {
    const rel = relative(ROOT, file).replaceAll('\\', '/');
    const parts = rel.split('/');
    const isTemplate = parts.includes(TEMPLATE_DIR);

    let source;
    try {
      source = await readFile(file, 'utf8');
    } catch (error) {
      errors.push(`${rel}: 读取失败 - ${error.message}`);
      continue;
    }

    const meta = parseMetadata(source);
    if (!meta) {
      errors.push(`${rel}: 缺少 ==UserScript== / ==/UserScript== 元数据块`);
      continue;
    }

    const fail = (message) => errors.push(`${rel}: ${message}`);

    for (const key of REQUIRED_KEYS) {
      const value = firstValue(meta, key);
      if (!value) fail(`缺少 @${key}`);
    }

    const version = firstValue(meta, 'version');
    if (version && !SEMVER.test(version)) fail(`@version "${version}" 不是 semver（示例 0.1.0）`);

    const hasTarget = [...meta.keys()].some((key) => ['match', 'include'].includes(baseKey(key)));
    if (!hasTarget) fail('缺少 @match / @include');

    for (const key of FORBIDDEN_KEYS) {
      if (meta.has(key)) fail(`不要写 @${key}（脚本站会剥离/改写，直装时也不需要）`);
    }

    if (meta.has('license') && !/^MIT\b/i.test(firstValue(meta, 'license'))) {
      fail(`@license 应为 MIT（当前 "${firstValue(meta, 'license')}"）`);
    }

    // 文件名约定：scripts/<dir>/<dir>.user.js
    if (!isTemplate) {
      const dir = parts.at(-2);
      const name = basename(file);
      if (dir !== 'scripts' && dir && name !== `${dir}.user.js`) {
        fail(`文件名应为 ${dir}.user.js（当前 ${name}）`);
      }
    }

    const scriptName = firstValue(meta, 'name');
    if (scriptName) {
      const seen = names.get(scriptName);
      if (seen) fail(`@name "${scriptName}" 与 ${seen} 重复`);
      else names.set(scriptName, rel);
    }

    try {
      new vm.Script(source, { filename: rel });
    } catch (error) {
      fail(`JS 语法错误 - ${error.message}`);
    }

    if (isTemplate) warnings.push(`${rel}: 模板，跳过命名/重名检查`);

    const description = firstValue(meta, 'description');
    if (description.length > 160) warnings.push(`${rel}: @description 偏长（${description.length} 字符），脚本站列表里会被截断`);

    rows.push({ rel, name: scriptName || '(未命名)', version: version || '-' });
  }

  console.log(`\n发现 ${rows.length} 个脚本：\n`);
  const nameWidth = Math.max(4, ...rows.map((row) => row.name.length));
  for (const row of rows) {
    console.log(`  ${row.name.padEnd(nameWidth)}  v${row.version.padEnd(8)}  ${row.rel}`);
  }

  if (warnings.length) {
    console.log('\n提示：');
    warnings.forEach((message) => console.log(`  ~ ${message}`));
  }

  if (errors.length) {
    console.log('\n错误：');
    errors.forEach((message) => console.log(`  ✗ ${message}`));
    console.log(`\n检查失败：${errors.length} 个问题\n`);
    process.exitCode = 1;
    return;
  }

  console.log('\n检查通过 ✓\n');
}

await main();
