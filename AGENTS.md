# AGENTS.md

给 coding agent（Claude Code / Codex / Cursor / pi 等）的项目说明。
**改代码前先读完这份文件**，它记录了本仓库的硬性约定、必要的领域知识，以及几条踩过的坑。

人类读者请先看 [README.md](README.md)。

---

## 1. 这个仓库是什么

`wyf0931/oma-userscripts` 是个人常用网站的**油猴脚本（userscript）合集**，MIT 许可，单文件、无后端、不采集数据。

- 主要目标平台：X（Twitter）、Threads、Instagram、YouTube
- 运行环境：Tampermonkey / Violentmonkey / Userscripts(Safari)
- 分发渠道：GitHub raw 直装 + [Greasy Fork](https://greasyfork.org/zh-CN/scripts/602329)（已配置 webhook，push 即自动发版）

**当前脚本**

| 目录 | 作用 | 版本 |
| --- | --- | --- |
| `scripts/youtube-channel-videos/` | 采集频道「视频」页签的普通视频，导出 Markdown / CSV | 0.9.3 |

---

## 2. 目录结构

```
scripts/<script-name>/
├── <script-name>.user.js     # 唯一入口，文件名必须 = 目录名
├── README.md                 # 功能 / 用法 / 已知限制 / 更新日志
└── screenshot.png            # 可选，README 与 Greasy Fork 展示图
scripts/_template/            # 新脚本模板，check 时跳过命名检查
docs/publishing.md            # 上架与发版手册（Greasy Fork / OpenUserJS / Userscript.Zone）
tools/check-userscripts.mjs   # metadata + 命名 + semver + 语法校验
.github/workflows/check.yml   # CI：push / PR 跑 npm run check
.env                          # 本地密钥（gitignored，勿提交）
.env.example                  # 变量名清单（已提交）
```

---

## 3. 硬性约定（不要违反）

| 规则 | 原因 |
| --- | --- |
| 一个脚本一个目录，文件名 = `<目录名>.user.js` | Greasy Fork 的 raw URL 同步、安装链接、脚本名三者一一对应 |
| `@version` 用 semver，**每次发版必须递增** | 同步时 Greasy Fork 靠它生成新版本 |
| **不要写** `@updateURL` / `@downloadURL` | Greasy Fork 会剥离并改写指向自己；raw 直装时脚本管理器本来就用安装 URL 当更新源 |
| 必须保留 `@name` `@namespace` `@version` `@description` `@match` `@license MIT` | `npm run check` 强制校验 |
| 不写 `eval` / `new Function` / 远程加载代码，不用 `@require` 引第三方 JS | 脚本站审核会拒；也违背"无后门"承诺 |
| UI 文案中文；metadata 用 `@name` + `@name:en`，描述用 `@description` + `@description:en` | 中文用户为主，同时便于英文用户搜索 |
| 只在目标站点加 UI/增强，不改用户数据、不发网络请求 | 脚本卖点是"轻量、可审计" |
| 新脚本必须同步更新根 README 的「脚本列表」表 | 那是唯一的入口索引 |

新增脚本：

```bash
cp -r scripts/_template scripts/<new-script>
mv scripts/<new-script>/template.user.js scripts/<new-script>/<new-script>.user.js
# 改 metadata + 写实现 + 写 README + 根 README 加一行
```

---

## 4. 验证要求（提交前必做）

```bash
npm run check          # metadata / 文件名 / semver / @name 重复 / JS 语法
node --check scripts/<name>/<name>.user.js   # 单独语法检查（可选，check 已覆盖）
```

CI 会在 push 后跑同一份检查（`.github/workflows/check.yml`），红叉等于不可发布。

### 在真实页面里验证（强烈建议，尤其是改选择器时）

不支持 sourcePath 直读仓库外文件时，可以按下面这套注入测试，**不必真的装脚本**：

```bash
# 1) 生成带调试钩子的临时文件（把 IIFE 末尾替换成暴露内部函数）
node -e '
const fs = require("fs");
const p = "scripts/youtube-channel-videos/youtube-channel-videos.user.js";
const src = fs.readFileSync(p, "utf8");
const idx = src.lastIndexOf("})();");
const hook = "window.__ytcvDebug = { collectAll, state, onChannelVideosPage, saveAsFile };\n})();";
fs.writeFileSync(".tmp-test.js", "() => {\n" + src.slice(0, idx) + hook + src.slice(idx + 5) + "\n}\n");
'
```

```
# 2) 用 chrome-devtools MCP 注入并断言
navigate_page        https://www.youtube.com/@EnglishWithEvie/videos
evaluate_script      sourcePath=.tmp-test.js, format=function
evaluate_script      () => { const d = window.__ytcvDebug; d.state.videos.clear(); d.state.order = 0;
                             d.collectAll(); return { size: d.state.videos.size, skipped: d.state.skipped }; }
```

```bash
rm -f .tmp-test.js     # 一定要删，别提交
```

回归基线（2026-10 实测，仅作参考值，视频会增长）：`@EnglishWithEvie/videos` 首屏 30 条、滚动后 38 条，`skipped = 0`，且每条都有 duration / views / published。

**验收标准**：`onChannelVideosPage()` 为真、无垃圾条目、`duration/views/published` 无空值、搜索页/播放列表页签下不出按钮且收集 0 条。

---

## 5. 发版流程

```bash
# 1. 改代码 + 递增 @version + 更新脚本 README 的更新日志
# 2. 自检
npm run check
# 3. 提交推送 —— 推送到 main 后 webhook 会让 Greasy Fork 秒级出新版本
git add -A && git commit -m "feat(youtube): ..." && git push
# 4. 验证线上版本
curl -sSL https://greasyfork.org/scripts/602329.json | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['version'], d['code_updated_at'])"
```

- 线上脚本 id：`602329`（JSON API 需要 `-L` 跟随 308 跳转）
- GitHub webhook：id `703453032`，事件仅 `push`，Payload URL `https://api.greasyfork.org/zh-CN/users/921270-wyf0931/webhook`
- 同步判定：Greasy Fork **比对代码内容**，内容没变不会产生新版本；版本号取 `@version`
- 密钥：本地 `.env`（`GREASYFORK_WEBHOOK_SECRET` 等）+ GitHub webhook Secret 字段。**任何情况下不要把 secret 写进仓库、commit、README 或 issue**
- 轮换：

  ```bash
  set -a; source .env; set +a
  gh api -X PATCH repos/wyf0931/oma-userscripts/hooks/$GREASYFORK_WEBHOOK_ID \
    -f config[secret]="$GREASYFORK_WEBHOOK_SECRET"
  ```

- 若在 Greasy Fork 上新增脚本条目：仓库 README 的「上架状态」表与 `docs/publishing.md` 的「发布记录」表要同步加一行

---

## 6. 领域知识：YouTube 频道视频采集器

改这个脚本前必须知道的结构（YouTube 2026-10 现状，随时可能改版）：

**范围判定**

- 只认 `document.querySelector('ytd-browse[page-subtype="channels"]')`；搜索页 / 首页 / 推荐页没有这个元素 —— 这是"不是频道页"的最可靠信号
- 页签数据在 `browse.data`（response 形状，部分版本在 `data.response`）；兜底的 `window.ytInitialData` 必须用 `vanityChannelUrl` 与当前路径核对，否则 SPA 跳转后会是**别的频道**的数据
- 「是否视频页签」：URL 匹配 `^(/@handle|/channel/UC…|/c/…|/user/…)/videos$`，或频道根路径 + 选中页签标题为 `视频|Videos`

**数据结构**

- 新 UI 卡片是 `ytd-rich-item-renderer > yt-lockup-view-model`，视频判定靠 `lockupViewModel.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO'`
- 旧 UI 用 `videoRenderer` / `gridVideoRenderer`（`legacyVideoRendererToVideo` 兜底）
- videoId 一律 `/^[\w-]{11}$/` 校验

**垃圾条目（必须过滤，这是本项目存在的原因）**

- 合辑 / Mix / 播放列表：`yt-collection-thumbnail-view-model`、`yt-collections-stack`、`[class*="CollectionStack"]`、徽章文本 `合辑|Mix|播放列表|专辑|Playlist`、链接里 `list=RD…|UL|LL|WL` 或 `start_radio=1`
- Shorts：链接含 `/shorts/`
- 直播 / 首播 / 预约 / 会员专享：徽章或 aria-label 命中 `LIVE|直播|首映|Premiere|即将|upcoming|会员专享`
- 横向 shelf 里的卡片：`card.closest('ytd-rich-section-renderer, ytd-shelf-renderer, ytd-reel-shelf-renderer')`
- 带其它频道链接的卡片（`a[href^="/@"]`、`a[href^="/channel/"]` 且不属于当前频道）

**字段提取**

- 标题：`h3[title]` 属性优先，其次标题链接文本。**绝不能用 `aria-label`** —— 它是 `标题 + 时长`，会把 "27分钟" 拼进标题
- 时长：`badge-shape .ytBadgeShapeText`（形如 `27:28`），旧 UI 用 `ytd-thumbnail-overlay-time-status-renderer`
- 播放量 / 发布时间：`.ytContentMetadataViewModelMetadataText` 的 **`aria-label`**（`6.9万次观看`、`3天前`）。可见文本里没有"观看"二字，用 `textContent` 匹配会全部拿空 —— 这是历史 bug
- 归一化：`6.9万次观看 → 69000`、`1.2M views → 1200000`；`3天前 → YYYY-MM`、`2024年5月3日 → 2024-05`。绝对日期要在相对日期之前解析，否则 `10月` 会被当成"10 个月前"
- 排序：发布时间倒序，日期未知的排最后并保持页面顺序（`order` 字段兜底）

**UI 行为**

- 右下角浮动按钮 → 面板（复制 Markdown / 复制 CSV / 保存 Markdown / 保存 CSV / 重新读取当前列表）
- 保存：优先 `window.showSaveFilePicker()`（同一任务内调用，别在它之前 `await`，否则丢失用户激活），失败或 `AbortError` 分别降级 / 静默
- CSV 文件带 UTF-8 BOM（Excel 中文不乱码），`复制 CSV` 不带 BOM
- 只读"当前已加载"的卡片，**不自动滚动、不调 YouTube 内部接口** —— 这是产品决策，不要"优化"成自动翻页

---

## 7. 踩过的坑

| 坑 | 表现 | 处理 |
| --- | --- | --- |
| `youtube.com` 启用 Trusted Types | `el.innerHTML = '...'` 抛 `requires 'TrustedHTML' assignment` | 用 `createElement` / `textContent` 构造 DOM |
| chrome-devtools MCP 截图可能是冻结帧 | 截图里看不到刚插入的 UI，但 DOM 里明明有 | 相信 DOM/状态断言（`getBoundingClientRect`、`querySelector`），别只看截图 |
| YouTube 是 SPA | 换页后脚本状态、按钮、面板残留 | 监听 `yt-navigate-finish` + `popstate`，MutationObserver 节流 400ms；路由变化时清空 `state.videos` 并关面板 |
| `ytd-browse.data` 缺省 | 拿不到页签数据 | 先 `data.contents`，再 `data.response`，最后才用校验过的 `window.ytInitialData` |
| 面板"重新读取"在别的页面被点 | 采到搜索页的内容（历史 bug 的成因） | 所有采集入口都要过 `onChannelVideosPage()` 守卫 |
| 改了本地目录名 | pi/codemode 的 `getcwd()` 报 `ENOENT: uv_cwd` | 别在运行中 rename 会话 cwd；换路径后重开会话 |

---

## 8. 提交与协作

- 分支：直接推 `main`（个人项目）；大改动可以开分支 + PR，CI 会跑 `check`
- Commit message：`<type>(<scope>): <summary>`，type ∈ `feat|fix|docs|chore|refactor|test`，scope 用脚本短名（如 `youtube`）
- 一次提交一件事；改脚本 + 改文档可以合并（同一逻辑单元），但**不要**把不相关脚本的改动混在一起
- 发版提交里必须包含：`@version` 递增 + 脚本 README 的「更新日志」新增一行

---

## 9. 待办与方向

- 计划新增：X（时间线净化 / 去推荐）、Threads、Instagram（去登录墙 / 批量保存）—— 新脚本走 `_template` 目录，先写清"要解决的具体痛点"再动手
- `amazon-review-collector` 目前是独立仓库，未来可能迁入本合集统一维护
- OpenUserJS 尚未上架（流程见 `docs/publishing.md`：先在站点手动发布，再挂 GitHub 同步）
