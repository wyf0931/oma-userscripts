# 上架指南：Greasy Fork · OpenUserJS · Userscript.Zone

这份文档只讲**怎么把本仓库的脚本发布出去、别人怎么搜到**，以及每一步的准确要求（部分细节来自 Greasy Fork / OpenUserJS 的开源实现）。

---

## 0. 上架前的一次性准备

| 检查项 | 要求 | 原因 |
| --- | --- | --- |
| 仓库可见性 | Public | 脚本站只能从公开 URL 同步 |
| 文件命名 | `scripts/<名字>/<名字>.user.js` | 与 raw URL、脚本名一一对应 |
| metadata | `@name` `@namespace` `@version` `@description` `@match` `@license` | 脚本站靠 `@name` + `@namespace` 识别脚本、靠 `@version` 判断版本 |
| `@updateURL` / `@downloadURL` | **不要写** | Greasy Fork 会剥离并改写成指向它自己（[meta keys 文档](https://greasyfork.org/en/help/meta-keys)） |
| `@version` | 每次改动递增（semver） | 同步时用来生成新版本 |
| 代码规范 | 不混淆、不 eval、不动态加载远程 JS | 脚本站审核会拒 |

本地自检：

```bash
npm run check
```

---

## 1. Greasy Fork（首选）

用户量最大、脚本可被搜索引擎和 Userscript.Zone 抓到，且支持 GitHub 同步。

### 1.1 首次上架：用「从 URL 导入」，不用手抄代码

1. 注册 / 登录 <https://greasyfork.org/>
2. 打开 <https://greasyfork.org/zh-CN/import>（用户菜单里的 **Import scripts / 导入脚本**）
3. 一行一个 raw URL，例如：

   ```
   https://raw.githubusercontent.com/wyf0931/oma-userscripts/main/scripts/youtube-channel-videos/youtube-channel-videos.user.js
   ```

4. 提交后脚本会被创建，并标记为「从 URL 同步」（`sync`）。如果 metadata 缺 `@description`，页面会让你补一句。
5. 进入脚本编辑页补全：
   - **语言**：简体中文 + English（`@name` / `@name:en` 会被识别）
   - **分类**（Category）：如 *YouTube*、*X/Twitter*
   - **License**：MIT（来自 `@license MIT`）
   - **附加信息**（Additional info）：把脚本目录下 README 的内容贴进去，用户在脚本页就能看到用法
6. 提交后进入**审核队列**（moderation），通过后才能在站内搜索到。

发布后的脚本页形如：`https://greasyfork.org/zh-CN/scripts/<id>-<slug>`，这个链接才是给用户的首选安装入口（脚本站负责后续更新）。

Greasy Fork 支持的同步 URL 形式（官方列出的）：

```
https://raw.githubusercontent.com/<user>/<repo>/<branch>/<path>
https://raw.githubusercontent.com/<user>/<repo>/refs/heads/<branch>/<path>
https://github.com/<user>/<repo>/raw/<branch>/<path>
https://github.com/<user>/<repo>/raw/refs/heads/<branch>/<path>
https://github.com/<user>/<repo>/releases/latest/download/<file>   # 走 release 资产
```

### 1.2 日常更新

**手动**：改完代码 push，打开脚本页点同步按钮（Sync / 更新）即可拉取 raw URL。

**全自动（推荐）**：配置 webhook，push 后立刻同步。

1. 打开 <https://greasyfork.org/en/users/webhook-info>，点按钮生成 **secret**
2. 页面给出 **Payload URL**（`https://api.greasyfork.org/users/<你的用户 ID>/webhook`，含 secret 参数），复制它
3. GitHub → 你的 repo → **Settings → Webhooks → Add webhook**
   - Payload URL：上一步的地址
   - Content type：`application/json`
   - Secret：第 1 步生成的 secret（Greasy Fork 用 `X-Hub-Signature` 对 body 做 HMAC-SHA1 校验，secret 为空会直接拒绝）
   - Which events：**Just the push event**（想按 release 发版就选 *Let me select individual events* → 勾 Releases）
   - Active：勾上
4. 之后 `git push` 到默认分支就会自动同步

同步判定逻辑：Greasy Fork 会比对**代码内容**——内容没变不会产生新版本；内容变了才生成新版本，版本号取 metadata 里的 `@version`。

### 1.3 常见坑

- 写了 `@updateURL` / `@downloadURL` → 被剥离改写，等于白写；从 GitHub raw 安装的脚本管理器本来就把安装 URL 当更新源。
- `@require` 引用外部 JS/CSS 会被标注，用户侧会看到提示；能内联就内联。
- 新脚本要过审，别在审核期反复改后重复提交，容易排队更久。
- 一个脚本对应一个文件；**不要把几个脚本塞进一个 `.user.js`**。

---

## 2. OpenUserJS

老牌站点，GitHub 同步只能更新「站点上已存在的脚本」，所以顺序不能反。

1. 注册 / 登录 <https://openuserjs.org/>
2. 先**手动新建脚本**（把 `scripts/<名字>/<名字>.user.js` 全文粘进去）并发布
3. 在账号设置（Preferences）里关联 **GitHub** 认证
4. 打开 `https://openuserjs.org/users/<你的用户名>/syncs` 添加同步项（选择仓库 + 文件路径）
5. 之后 push 即同步

官方 FAQ 原文要点：*"The site will only attempt to synchronize to your existing script already on the site. Please ensure there is, at minimum, the same metadata block(s) present"* —— 即：**同步只更新已存在的脚本，且 GitHub 文件必须保留相同的 metadata block**。

---

## 3. Userscript.Zone

它是**搜索引擎**，不是托管站：没有上传入口，收录的是别处（主要是 Greasy Fork）的脚本，脚本页里的安装按钮指向原站。

因此：

1. 先在 Greasy Fork 发布并通过审核（这是它最常抓取的来源）；
2. 稍等一段时间让它抓取，然后在 <https://www.userscript.zone/> 用域名搜（如 `youtube.com`）验证；
3. 搜不到就用站内 **Give Feedback** 提交：脚本名 + Greasy Fork 链接 + 目标域名，请求收录。

它对「有审核流程、有评论区」的站点更友好，这也是优先把 Greasy Fork 做起来的原因。

---

## 4. 三个渠道的分工

| 渠道 | 需要账号/OAuth | 自动更新 | 谁来装 | 我们要做的事 |
| --- | --- | --- | --- | --- |
| GitHub（本仓库） | – | 脚本管理器按安装 URL 检查 | 开发者 / 喜欢直装的人 | `npm run check` + push |
| Greasy Fork | 注册 | URL 同步 + Webhook | 普通用户 | 首次 import，之后配置 webhook |
| OpenUserJS | 注册 + GitHub OAuth | Syncs 页面 | 老用户 | 先手动发布，再挂 sync |
| Userscript.Zone | 无 | 跟随上游 | 站内搜索流量 | 只等收录 / 反馈请求 |

---

## 5. 本次仓库的发布记录

| 脚本 | Greasy Fork | 上架时间 | 版本 |
| --- | --- | --- | --- |
| YouTube 频道视频列表采集器 | <https://greasyfork.org/zh-CN/scripts/602329> | 2026-10-26 | 0.9.3 |
| OpenUserJS / Userscript.Zone | 待上架 / 等抓取 | – | – |

导入时填的同步 URL：

```
https://raw.githubusercontent.com/wyf0931/oma-userscripts/main/scripts/youtube-channel-videos/youtube-channel-videos.user.js
```

### Webhook 状态

- GitHub repo webhook 已配置：`push` 事件 → `https://api.greasyfork.org/zh-CN/users/921270-wyf0931/webhook`（`application/json`）
- 密钥只存在两处：GitHub 仓库的 webhook Secret 字段，以及本地 `.env`（已被 `.gitignore` 忽略，仓库里的 `.env.example` 只有变量名）
- 验证方式：ping 送达返回 `{"message":"Webhook successfully configured."}`；push 后用 `npm run verify:live` 确认线上版本已跟上
- 定时巡检：`.github/workflows/verify-live.yml` 每周一核对一次线上版本（也可 `gh workflow run verify-live -f retries=8` 手动触发并轮询）

本地 `.env` 变量：

```bash
GREASYFORK_WEBHOOK_SECRET=...      # https://greasyfork.org/zh-CN/users/webhook-info 生成
GREASYFORK_WEBHOOK_URL=https://api.greasyfork.org/zh-CN/users/921270-wyf0931/webhook
GREASYFORK_WEBHOOK_ID=703453032
```

密钥轮换（Greasy Fork 重新生成后）：

```bash
gh api -X PATCH repos/wyf0931/oma-userscripts/hooks/$GREASYFORK_WEBHOOK_ID \
  -f config[secret]="$GREASYFORK_WEBHOOK_SECRET"
```

## 6. 每次发布 Checklist

```bash
# 1. 改代码 + 递增 @version
npm run check

# 2. 提交
git add -A && git commit -m "feat(youtube): ..." && git push

# 3. Greasy Fork
#    - 配了 webhook：等它自动同步（脚本页会多一个版本）
#    - 没配：脚本页点 Sync

# 4. 更新文档
#    - 根 README「脚本列表」安装链接 / 「上架状态」表
#    - 脚本目录 README 的「更新日志」
```

---

## 7. 参考资料

- Greasy Fork 元数据键说明：<https://greasyfork.org/en/help/meta-keys>
- Greasy Fork 脚本导入：<https://greasyfork.org/import>
- Greasy Fork Webhook 信息页：<https://greasyfork.org/en/users/webhook-info>
- Greasy Fork 源码（同步/Webhook 实现）：<https://github.com/greasyfork-org/greasyfork>
- OpenUserJS FAQ（脚本同步）：<https://openuserjs.org/about/FAQ>
- Userscript.Zone：<https://www.userscript.zone/>
- Tampermonkey 文档（`@grant`、更新机制）：<https://www.tampermonkey.net/documentation.php>
