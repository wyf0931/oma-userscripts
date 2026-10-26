// ==UserScript==
// @name         脚本名称（中文，脚本站默认显示）
// @name:en      Script Name
// @namespace    https://github.com/wyf0931/oma-userscripts
// @version      0.1.0
// @description  一句话说明这个脚本做了什么
// @description:en  One-line description of what this script does.
// @author       wyf0931
// @license      MIT
// @homepageURL  https://github.com/wyf0931/oma-userscripts
// @supportURL   https://github.com/wyf0931/oma-userscripts/issues
// @match        https://example.com/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

/*
 * 使用说明（复制本目录后请删除这段注释）：
 *
 * 1. 目录与文件同名：scripts/my-script/my-script.user.js
 * 2. @version 用 semver，每次改动都要递增（Greasy Fork 同步时靠它生成新版本）
 * 3. 不要写 @updateURL / @downloadURL
 * 4. 不需要 GM_* API 时删掉 @grant，方便用户直接从 GitHub raw 安装
 * 5. 不要 eval、不要动态加载远程代码（脚本站审核会拒）
 * 6. 跑 `npm run check` 确认 metadata 与语法都没问题
 */

(function () {
  'use strict';

  const CONFIG = {
    // 便于以后调整的常量集中放这里
  };

  function init() {
    // 你的增强逻辑
    console.info('[oma-userscripts] example script loaded');
  }

  init();
})();
