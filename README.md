# OMA Userscripts

日常网站的轻量增强脚本合集：**X / Threads / Instagram / YouTube** 等常用平台。
每个脚本都是单文件 `.user.js`，配合 Tampermonkey / Violentmonkey / Userscripts(Safari) 使用，**不采集任何数据、不联网上报、不依赖后端**。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![userscript](https://img.shields.io/badge/userscript-Tampermonkey%20%7C%20Violentmonkey-orange.svg)](docs/publishing.md)

> English: A small collection of MIT-licensed userscripts for everyday sites (X, Threads, Instagram, YouTube). Single-file, no tracking, no backend. Install from the links below or from Greasy Fork once published.

---

## 脚本列表

| 脚本 | 平台 | 功能 | 安装 |
| --- | --- | --- | --- |
| [YouTube 频道视频列表采集器](scripts/youtube-channel-videos/) | YouTube | 读取频道「视频」页签中属于该频道的普通视频（自动剔除合辑/播放列表/Shorts/直播/推荐），可复制或导出 Markdown / CSV | [安装][yt-install] |

[yt-install]: https://raw.githubusercontent.com/wyf0931/oma-userscripts/main/scripts/youtube-channel-videos/youtube-channel-videos.user.js

> 安装时脚本管理器会弹出确认页，点「安装」即可；首次使用请在 Tampermonkey 的「已安装脚本」里确认已启用。

## 上架状态

| 渠道 | 作用 | 状态 |
| --- | --- | --- |
| [Greasy Fork](https://greasyfork.org/) | 最大的脚本站，支持从 GitHub 同步、可被搜索引擎收录 | ⏳ 待上架 |
| [OpenUserJS](https://openuserjs.org/) | 老牌脚本站，支持 GitHub 同步 | ⏳ 待上架 |
| [Userscript.Zone](https://www.userscript.zone/) | 脚本搜索引擎（索引 GreasyFork 等站点，无上传入口） | ⏳ 随 GreasyFork 收录 |

具体步骤见 [docs/publishing.md](docs/publishing.md)。

## 目录结构

```
.
├── scripts/
│   ├── youtube-channel-videos/          # 一个脚本一个目录
│   │   ├── youtube-channel-videos.user.js
│   │   └── README.md                    # 功能 / 用法 / 已知限制
│   └── _template/                       # 新脚本模板（不会被安装）
│       └── template.user.js
├── docs/
│   └── publishing.md                    # Greasy Fork / OpenUserJS / Userscript.Zone 上架指南
├── tools/
│   └── check-userscripts.mjs            # metadata + 语法检查
└── .github/workflows/check.yml          # CI：每次 push 校验所有脚本
```

**为什么脚本要放在 `scripts/<名字>/<名字>.user.js`？**
Greasy Fork 的「从 URL 同步」按 raw 文件路径识别脚本，目录 + 同名文件可以让「仓库结构、raw URL、脚本名、安装链接」一一对应，新增脚本时不会互相影响。

## 安装方式

三种都行，按需选：

1. **Greasy Fork**（推荐给普通用户）：脚本站页面点「安装此脚本」，后续自动更新由脚本站维护。
2. **GitHub raw（直装）**：打开上表的「安装」链接，Tampermonkey 会把它作为更新源，之后 `git push` 新版本即可检测更新。
3. **本地开发**：Tampermonkey → 添加新脚本 → 粘贴 `scripts/<name>/<name>.user.js` 全部内容。

> 从 GitHub raw 安装的脚本，更新检查频率由脚本管理器决定（Tampermonkey 默认约 24 小时一次）；想立刻更新可在管理器里手动「检查更新」。

## 开发

要求 Node.js ≥ 18（仅用于本地校验，运行脚本本身不需要）。

```bash
npm run check   # 校验 metadata、文件命名、版本号、JS 语法
```

新增脚本：

```bash
cp -r scripts/_template scripts/my-new-script
mv scripts/my-new-script/template.user.js scripts/my-new-script/my-new-script.user.js
# 编辑 metadata 与代码，然后在根 README 的脚本列表里加一行
npm run check
```

### metadata 约定

```js
// ==UserScript==
// @name         中文名（脚本站默认显示）
// @name:en      English name
// @namespace    https://github.com/wyf0931/oma-userscripts
// @version      0.1.0            // semver，改动必须递增
// @description  一句话说明
// @description:en  One-line description
// @author       wyf0931
// @license      MIT
// @homepageURL  https://github.com/wyf0931/oma-userscripts
// @supportURL   https://github.com/wyf0931/oma-userscripts/issues
// @match        https://example.com/*
// @grant        GM_addStyle     // 不需要 GM API 就删掉
// @run-at       document-idle
// ==/UserScript==
```

刻意**不写** `@updateURL` / `@downloadURL`：

- Greasy Fork 会剥离并改写这两个字段指向它自己（[官方说明](https://greasyfork.org/en/help/meta-keys)），写了也不会生效；
- 从 GitHub raw 安装时，脚本管理器本来就把安装 URL 当更新源，不需要额外声明。

其他约定：

- 一个脚本一个目录，文件名必须 `<目录名>.user.js`；
- 只用标准 Web API 时优先不用 `GM_*`，方便直接 raw 安装；
- 不引入远程代码、不做代码混淆（脚本站审核会拒）；
- UI 文案默认中文，必要时用 `@name:en` / `@description:en` 提供英文。

## 更新日志

见各脚本目录下的 README（例如 [YouTube 频道视频列表采集器](scripts/youtube-channel-videos/#更新日志)）。

## License

[MIT](LICENSE) © 2026 Scott Wang (wyf0931)
