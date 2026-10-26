# YouTube 频道视频列表采集器

读取某个 YouTube 频道「视频」页签下**已经加载到页面里**的普通视频，汇总成表格，可复制或导出为 Markdown / CSV。

- 脚本文件：[youtube-channel-videos.user.js](youtube-channel-videos.user.js)
- 直装地址：<https://raw.githubusercontent.com/wyf0931/oma-userscripts/main/scripts/youtube-channel-videos/youtube-channel-videos.user.js>

## 为什么写它

想批量整理某个博主的视频（学习清单、选题参考、内容盘点）时，手动一条条复制标题/播放量/链接太慢；而现成的采集脚本通常会把「合辑」「播放列表」「相关推荐」这些非频道内容一起抓进来。

这个脚本只做一件事：**认准频道「视频」页签里属于该频道的普通视频**。

## 用法

1. 打开频道视频页，例如 `https://www.youtube.com/@EnglishWithEvie/videos`
2. 右下角点「采集当前列表」（只读当前已加载的卡片，**不会自动滚动、不会打开视频页**）
3. 需要更多视频就先手动往下滚，再点「重新读取当前列表」
4. 面板里可以：
   - 复制 Markdown 表格 / 复制 CSV
   - 保存 Markdown / 保存 CSV（弹出系统「另存为」对话框，自己选路径；浏览器不支持时走下载）
5. 文件名形如 `EnglishWithEvie-videos-20261026.md`；CSV 带 UTF-8 BOM，Excel 打开中文不乱码

## 会采什么、丢掉什么

| 采集 | 丢弃 |
| --- | --- |
| 频道「视频」页签里的普通视频 | 合辑 / Mix / 播放列表卡片（`yt-collection-thumbnail-view-model`、`start_radio=1`、徽章「合辑」） |
| 已随滚动加载的视频 | Shorts（`/shorts/`） |
| 时长、播放量、发布时间、封面、链接 | 直播 / 首播 / 预约 / 会员专享 |
| | 横向 shelf（推荐、Shorts 货架）、含其它频道链接的卡片 |
| | 搜索页 / 首页 / 频道其它页签上的任何东西 |

数据来源有两路，互相补全：

1. `ytd-browse[page-subtype="channels"]` 的页面数据（只取选中页签里 `contentType === LOCKUP_CONTENT_TYPE_VIDEO` 的条目）；
2. 页面 DOM（限定在 `#primary` 网格内，逐卡片校验）。

## 输出字段

`# | 标题 | 时长 | 播放量 | 发布时间 | 视频链接 | 封面图 | 描述`

- 播放量统一换算成数字：`6.9万次观看` → `69000`，`1.2M views` → `1200000`
- 发布时间统一成 `YYYY-MM`：`3天前` → `2026-10`，`2024年5月3日` → `2024-05`
- 按发布时间倒序；日期未知的排在后面并保持页面顺序

## 已知限制

- 只读「已经加载」的列表，不做滚动加载、不调 YouTube 内部 API，所以一次能拿到的条数取决于你滚了多少。
- 依赖 YouTube 当前的 DOM/数据结构（`yt-lockup-view-model`、`yt-content-metadata-view-model`），YouTube 改版后可能需要更新选择器。
- 覆盖层 UI 文案为中文。

## 更新日志

- **0.9.2** — 移交到本仓库；补全 metadata（`@name:en`、`@license`、`@homepageURL`、`@supportURL`、`@icon`）
- **0.9.1** — 新增「保存 Markdown / 保存 CSV」（`showSaveFilePicker` 选路径，降级为下载）；CSV 加 BOM
- **0.9.0** — 修复垃圾内容混入：采集范围收敛到频道「视频」页签、按卡片特征剔除合辑/播放列表/Shorts/直播/推荐；播放量与发布时间改从 aria-label 解析；标题不再被 aria-label 里的时长污染
- **0.8.0** — 初版：读取当前列表并复制为 Markdown 表格
