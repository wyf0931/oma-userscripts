// ==UserScript==
// @name         YouTube 频道视频列表采集器
// @name:en      YouTube Channel Video Collector
// @namespace    https://github.com/wyf0931/oma-userscripts
// @version      0.9.3
// @description  只读取 YouTube 频道「视频」页签里属于该频道的普通视频，可复制或导出为 Markdown / CSV 文件
// @description:en  Read the ordinary videos of the current channel's Videos tab and copy or export them as Markdown / CSV.
// @author       wyf0931
// @license      MIT
// @homepageURL  https://github.com/wyf0931/oma-userscripts
// @supportURL   https://github.com/wyf0931/oma-userscripts/issues
// @icon         https://www.youtube.com/favicon.ico
// @match        https://www.youtube.com/*
// @match        https://www.youtube-nocookie.com/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    observerDelay: 400,
    pageReadyDelay: 700,
  };

  const state = {
    button: null,
    modal: null,
    running: false,
    videos: new Map(),
    order: 0,
    skipped: 0,
    routeKey: location.href,
    observerTimer: null,
  };

  // 频道页两种形态：/@handle/videos 或 /channel/UCxxx/videos
  const CHANNEL_ROOT_PATH = /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/?$/;
  const CHANNEL_VIDEOS_PATH = /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/videos\/?$/;

  const SELECTORS = {
    // 只有「频道页」的浏览数据才有 channels 子类型；搜索页/首页/推荐页都拿不到它
    channelBrowse: 'ytd-browse[page-subtype="channels"]',
    card: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model',
    titleLink: 'a.ytLockupMetadataViewModelTitle, h3 a[href*="/watch"], a#video-title, a#video-title-link',
    // 合集/合辑/Mix/播放列表 卡片特征
    collection: 'yt-collection-thumbnail-view-model, yt-collections-stack, [class*="CollectionStack"], [class*="collectionThumbnail"]',
    nonVideoRenderer: 'ytd-playlist-renderer, ytd-grid-playlist-renderer, ytd-radio-renderer, ytd-compact-radio-renderer, ytd-compact-playlist-renderer, ytd-playlist-panel-video-renderer, ytd-channel-renderer',
    // 横向 shelf（合辑、Shorts、推荐）里的卡片一律不算频道视频
    shelf: 'ytd-rich-section-renderer, ytd-shelf-renderer, ytd-reel-shelf-renderer',
    metaText: '.ytContentMetadataViewModelMetadataText, #metadata-line span, yt-content-metadata-view-model span[role="text"]',
    badge: 'badge-shape, yt-thumbnail-badge-view-model, .ytThumbnailBadgeViewModelHost, ytd-thumbnail-overlay-time-status-renderer, ytd-thumbnail-overlay-badge-view-model, .badge-style-type-live-now, .badge-style-type-upcoming',
    thumbnail: 'yt-thumbnail-view-model img, img.ytCoreImageHost, img',
  };

  const JUNK_BADGE = /^(合辑|混剪|播放列表|专辑|歌单|mix|mix\s*[-–].*|playlist|album|collaboration)$/i;
  const LIVE_BADGE = /(^|\b)(live|直播|首映|premiere|即将|upcoming|预约|waiting|members?\s*only|会员专享)(\b|$)/i;
  const TIME_BADGE = /^\d{1,2}:\d{2}(?::\d{2})?$/;
  const VIEW_TEXT = /观看|次播放|播放次数|播放量|views?\b|plays?\b/i;
  const DATE_TEXT = /前|ago|昨天|yesterday|今天|today|刚刚|just\s*now|小时|hour|分钟|minute/i;
  const VIDEO_ID = /^[\w-]{11}$/;

  const addStyle = typeof GM_addStyle === 'function'
    ? GM_addStyle
    : (css) => { const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style); };

  addStyle(`
    #ytcv-launcher { position: fixed; z-index: 2147483640; right: 22px; bottom: 22px; border: 0; border-radius: 999px; padding: 12px 18px; background: #ff0033; color: #fff; font: 600 14px/1.2 Arial, sans-serif; cursor: pointer; box-shadow: 0 6px 22px rgba(0,0,0,.28); }
    #ytcv-launcher:hover { background: #d9002b; transform: translateY(-1px); }
    #ytcv-backdrop { position: fixed; inset: 0; z-index: 2147483641; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0,0,0,.58); font-family: Arial, sans-serif; }
    #ytcv-dialog { width: min(1180px, 96vw); height: min(82vh, 780px); display: flex; flex-direction: column; overflow: hidden; border-radius: 14px; background: #fff; color: #171717; box-shadow: 0 20px 70px rgba(0,0,0,.42); }
    #ytcv-dialog.ytcv-dark { background: #212121; color: #f1f1f1; }
    #ytcv-head { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 18px 22px 14px; border-bottom: 1px solid rgba(127,127,127,.25); }
    #ytcv-title { margin: 0; font-size: 18px; }
    #ytcv-status { margin: 5px 0 0; color: #666; font-size: 13px; }
    .ytcv-dark #ytcv-status { color: #aaa; }
    #ytcv-close { border: 0; background: transparent; color: inherit; font-size: 26px; line-height: 1; cursor: pointer; }
    #ytcv-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 12px 22px; border-bottom: 1px solid rgba(127,127,127,.18); }
    .ytcv-action { border: 1px solid rgba(127,127,127,.5); border-radius: 7px; padding: 8px 12px; background: transparent; color: inherit; cursor: pointer; font-size: 13px; }
    .ytcv-action.primary { border-color: #065fd4; background: #065fd4; color: #fff; }
    #ytcv-table-wrap { flex: 1; overflow: auto; padding: 0 22px 22px; }
    #ytcv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    #ytcv-table th, #ytcv-table td { padding: 10px 9px; border-bottom: 1px solid rgba(127,127,127,.2); text-align: left; vertical-align: top; }
    #ytcv-table th { position: sticky; top: 0; z-index: 1; background: inherit; white-space: nowrap; }
    #ytcv-table td:nth-child(1) { width: 42px; color: #777; }
    #ytcv-table td:nth-child(2) { min-width: 230px; font-weight: 600; }
    #ytcv-table td:nth-child(3), #ytcv-table td:nth-child(4) { min-width: 90px; white-space: nowrap; }
    #ytcv-table td:nth-child(5) { min-width: 100px; }
    #ytcv-table td:nth-child(6) { min-width: 220px; word-break: break-all; }
    #ytcv-table td:nth-child(7) { min-width: 220px; word-break: break-all; }
    #ytcv-table td:nth-child(8) { min-width: 280px; max-width: 440px; white-space: pre-wrap; color: #555; font-weight: 400; }
    .ytcv-dark #ytcv-table td:nth-child(8) { color: #bbb; }
    #ytcv-fallback { margin: 14px 22px 0; width: calc(100% - 44px); min-height: 100px; display: none; box-sizing: border-box; font: 12px/1.5 monospace; }
    .ytcv-toast { position: fixed; left: 50%; bottom: 30px; z-index: 2147483647; transform: translateX(-50%); padding: 10px 15px; border-radius: 8px; background: rgba(20,20,20,.92); color: #fff; font: 13px Arial, sans-serif; }
  `);

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function deepText(value) {
    if (!value) return '';
    if (typeof value === 'string') return cleanText(value);
    if (typeof value.content === 'string') return cleanText(value.content);
    if (typeof value.simpleText === 'string') return cleanText(value.simpleText);
    if (Array.isArray(value.runs)) return cleanText(value.runs.map((run) => run.text || '').join(''));
    return '';
  }

  function normalizeViews(value) {
    const raw = cleanText(value).replace(/次观看|观看|播放次数|播放量|views?|plays?/gi, '').trim();
    const match = raw.match(/([\d,.]+)\s*(万|亿|k|m|b)?/i);
    if (!match) return '';
    const number = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(number)) return '';
    const unit = (match[2] || '').toLowerCase();
    const multiplier = unit === '万' ? 10000 : unit === '亿' ? 100000000 : unit === 'k' ? 1000 : unit === 'm' ? 1000000 : unit === 'b' ? 1000000000 : 1;
    return String(Math.round(number * multiplier));
  }

  function formatYearMonth(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function normalizePublishedDate(value) {
    const raw = cleanText(value);
    if (!raw) return '';
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // 绝对日期（2024年5月3日 / 2024-05 / May 3, 2024）先处理，避免被「N个月」误判
    let match = raw.match(/(\d{4})\s*[年\-/.]\s*(\d{1,2})/);
    if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
    match = raw.match(/(\d+)\s*(?:个)?\s*(月|months?|month)\s*(?:前|ago)?/i);
    if (match) { date.setDate(1); date.setMonth(date.getMonth() - Number(match[1])); return formatYearMonth(date); }
    match = raw.match(/(\d+)\s*(?:个)?\s*(周|星期|weeks?|week)\s*(?:前|ago)?/i);
    if (match) { date.setDate(date.getDate() - Number(match[1]) * 7); return formatYearMonth(date); }
    match = raw.match(/(\d+)\s*(?:天|days?|day)\s*(?:前|ago)?/i);
    if (match) { date.setDate(date.getDate() - Number(match[1])); return formatYearMonth(date); }
    match = raw.match(/(\d+)\s*(?:年|years?|year)\s*(?:前|ago)?/i);
    if (match) { date.setFullYear(date.getFullYear() - Number(match[1])); return formatYearMonth(date); }
    if (/昨天|yesterday/i.test(raw)) { date.setDate(date.getDate() - 1); return formatYearMonth(date); }
    if (/小时前|分钟前|刚刚|今天|hour|minute|just\s*now/i.test(raw)) return formatYearMonth(date);
    if (/[a-z]{3}/i.test(raw)) {
      const parsed = new Date(raw.replace(/\b(streamed|premiered|published)\b/gi, '').trim());
      if (!Number.isNaN(parsed.getTime())) return formatYearMonth(parsed);
    }
    return '';
  }

  /* ------------------------------------------------------------------ *
   * 页面识别：只认「频道页 + 视频页签」
   * ------------------------------------------------------------------ */

  function channelBrowse() {
    const browse = document.querySelector(SELECTORS.channelBrowse);
    if (!browse) return null;
    const raw = browse.data;
    if (raw) {
      // 有的版本把响应放在 data.response 里
      if (raw.contents) return raw;
      if (raw.response?.contents) return raw.response;
    }
    // 兜底：首屏加载时残留的 ytInitialData，仅当它的频道与当前 URL 一致才用
    const fallback = window.ytInitialData;
    const vanity = fallback?.metadata?.channelMetadataRenderer?.vanityChannelUrl || '';
    const fallbackHandle = (vanity.match(/\/(@[^/?#]+)/) || [])[1] || '';
    const pathHandle = (location.pathname.match(/^\/(@[^/]+)/) || [])[1] || '';
    if (fallbackHandle && pathHandle && decodeURIComponent(pathHandle).toLowerCase() === decodeURIComponent(fallbackHandle).toLowerCase()) return fallback;
    return null;
  }

  function selectedTabTitle() {
    const data = channelBrowse();
    const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    for (const tab of tabs) {
      const renderer = tab.tabRenderer || tab.expandableTabRenderer;
      if (renderer?.selected) return deepText(renderer.title);
    }
    return '';
  }

  function onChannelVideosPage() {
    const path = location.pathname;
    if (CHANNEL_VIDEOS_PATH.test(path)) return true;
    // 频道根路径（默认落在「视频」页签）也允许，但必须是视频页签处于选中状态
    if (!CHANNEL_ROOT_PATH.test(path)) return false;
    return /^(videos|视频)$/i.test(selectedTabTitle());
  }

  function channelIdentity() {
    const data = channelBrowse();
    const meta = data?.metadata?.channelMetadataRenderer;
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
    const canonicalId = (canonical.match(/\/channel\/(UC[\w-]+)/) || [])[1] || '';
    const canonicalHandle = (canonical.match(/youtube\.[a-z.]+\/(@[^/?#]+)/i) || [])[1] || '';
    const vanityHandle = String(meta?.vanityChannelUrl || '').match(/\/(@[^/?#]+)/)?.[1] || '';
    const pathHandle = (location.pathname.match(/^\/(@[^/]+)/) || [])[1] || '';
    return {
      id: meta?.externalId || canonicalId || '',
      handle: decodeURIComponent(canonicalHandle || vanityHandle || pathHandle || ''),
    };
  }

  function videosScope() {
    if (!onChannelVideosPage()) return null;
    const browse = document.querySelector(SELECTORS.channelBrowse);
    if (!browse) return null;
    return browse.querySelector('#primary') || browse;
  }

  /* ------------------------------------------------------------------ *
   * 频道视频数据（ytd-browse.data）：权威来源，只取「视频」页签的普通视频
   * ------------------------------------------------------------------ */

  function selectedTabContents() {
    const data = channelBrowse();
    const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    const renderer = tabs.map((tab) => tab.tabRenderer || tab.expandableTabRenderer).find((tab) => tab?.selected);
    const contents = renderer?.content?.richGridRenderer?.contents;
    return Array.isArray(contents) ? contents : [];
  }

  function lockupViewModelToVideo(lockup) {
    if (!lockup || lockup.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;
    const id = String(lockup.contentId || '');
    if (!VIDEO_ID.test(id)) return null;
    const metadata = lockup.metadata?.lockupMetadataViewModel;
    const parts = [];
    (metadata?.metadata?.contentMetadataViewModel?.metadataRows || []).forEach((row) => {
      (row.metadataParts || []).forEach((part) => parts.push({
        text: deepText(part.text),
        aria: cleanText(part.accessibilityLabel),
      }));
    });
    const viewPart = parts.find((part) => VIEW_TEXT.test(part.aria || part.text));
    const datePart = parts.find((part) => DATE_TEXT.test(part.aria || part.text));
    let duration = '';
    (lockup.contentImage?.thumbnailViewModel?.overlays || []).forEach((overlay) => {
      (overlay.thumbnailBottomOverlayViewModel?.badges || []).forEach((badge) => {
        const view = badge.thumbnailBadgeViewModel;
        if (!view || duration) return;
        if (TIME_BADGE.test(cleanText(view.text))) duration = cleanText(view.text);
      });
    });
    const sources = lockup.contentImage?.thumbnailViewModel?.image?.sources || [];
    const thumbnail = sources.length ? (sources[sources.length - 1].url || '') : '';
    return {
      id,
      title: deepText(metadata?.title) || '(无标题)',
      duration,
      views: normalizeViews(viewPart ? (viewPart.aria || viewPart.text) : ''),
      published: normalizePublishedDate(datePart ? (datePart.aria || datePart.text) : ''),
      description: '',
      thumbnail,
      url: `https://www.youtube.com/watch?v=${id}`,
      live: false,
    };
  }

  function legacyVideoRendererToVideo(renderer) {
    if (!renderer?.videoId || !VIDEO_ID.test(renderer.videoId)) return null;
    const watchUrl = renderer.navigationEndpoint?.watchEndpoint;
    const playlistId = watchUrl?.playlistId || '';
    if (/^(RD|UL|LL|WL)/.test(playlistId)) return null;
    const views = deepText(renderer.viewCountText);
    const published = deepText(renderer.publishedTimeText);
    const thumbnail = (renderer.thumbnail?.thumbnails || []).slice(-1)[0]?.url || '';
    return {
      id: renderer.videoId,
      title: deepText(renderer.title) || '(无标题)',
      duration: deepText(renderer.lengthText),
      views: normalizeViews(views),
      published: normalizePublishedDate(published),
      description: deepText(renderer.descriptionSnippet),
      thumbnail,
      url: `https://www.youtube.com/watch?v=${renderer.videoId}`,
      live: Boolean(renderer.isLiveNow || renderer.isUpcoming || renderer.videoType === 'LIVE'),
    };
  }

  function collectFromChannelData() {
    let added = 0;
    selectedTabContents().forEach((item) => {
      const content = item.richItemRenderer?.content;
      if (!content) return;
      const video = content.lockupViewModel
        ? lockupViewModelToVideo(content.lockupViewModel)
        : content.videoRenderer
          ? legacyVideoRendererToVideo(content.videoRenderer)
          : null;
      if (video && addVideo(video)) added += 1;
    });
    return added;
  }

  /* ------------------------------------------------------------------ *
   * DOM 采集：限定在频道页的 #primary 网格内，并逐个卡片做校验
   * ------------------------------------------------------------------ */

  function topLevelCards(root) {
    return [...root.querySelectorAll(SELECTORS.card)].filter((card) => !card.parentElement?.closest(SELECTORS.card));
  }

  function titleLinkOf(card) {
    return card.querySelector(SELECTORS.titleLink) || card.querySelector('a[href*="/watch"]');
  }

  function cardBadgeTexts(card) {
    return [...card.querySelectorAll(SELECTORS.badge)]
      .map((badge) => cleanText(badge.textContent) || cleanText(badge.getAttribute('aria-label')))
      .filter(Boolean);
  }

  function hasForeignChannel(card, identity) {
    const links = [...card.querySelectorAll('a[href^="/@"], a[href^="/channel/"]')];
    if (!links.length) return false;
    return !links.some((link) => {
      const href = link.getAttribute('href') || '';
      const handle = decodeURIComponent((href.match(/^\/@([^/?#]+)/) || [])[1] || '');
      const channelId = (href.match(/^\/channel\/(UC[\w-]+)/) || [])[1] || '';
      if (handle && identity.handle) return handle.toLowerCase() === identity.handle.toLowerCase();
      if (channelId && identity.id) return channelId === identity.id;
      return false;
    });
  }

  function isJunkCard(card, identity) {
    // 混在网格里的 shelf / 播放列表 / 合辑 / 直播 一律丢弃
    if (card.closest(SELECTORS.nonVideoRenderer)) return true;
    if (card.closest(SELECTORS.shelf)) return true;
    if (card.querySelector(SELECTORS.collection)) return true;
    const badges = cardBadgeTexts(card);
    if (badges.some((text) => JUNK_BADGE.test(text) || LIVE_BADGE.test(text))) return true;
    if (hasForeignChannel(card, identity)) return true;

    const link = titleLinkOf(card);
    const href = link?.getAttribute('href') || '';
    if (/\/shorts\//.test(href)) return true;
    let url;
    try { url = new URL(href, location.origin); } catch { return true; }
    if (!VIDEO_ID.test(url.searchParams.get('v') || '')) return true;
    // 电台 / 混剪 / 播放列表链接（list=RD...、start_radio=1）都不是单个视频
    const list = url.searchParams.get('list') || '';
    if (/^(RD|UL|LL|WL)/.test(list) || url.searchParams.get('start_radio') === '1') return true;
    return false;
  }

  function cardMetadata(card) {
    let duration = '';
    const badges = cardBadgeTexts(card);
    const timeBadge = badges.find((text) => TIME_BADGE.test(text));
    if (timeBadge) duration = timeBadge;

    const entries = [...card.querySelectorAll(SELECTORS.metaText)]
      .map((el) => ({ text: cleanText(el.textContent), aria: cleanText(el.getAttribute('aria-label')) }))
      .filter((entry) => entry.text || entry.aria);
    const viewEntry = entries.find((entry) => VIEW_TEXT.test(entry.aria || entry.text));
    const dateEntry = entries.find((entry) => DATE_TEXT.test(entry.aria || entry.text));
    return {
      duration,
      views: normalizeViews(viewEntry ? (viewEntry.aria || viewEntry.text) : ''),
      published: normalizePublishedDate(dateEntry ? (dateEntry.aria || dateEntry.text) : ''),
    };
  }

  function videoFromCard(card) {
    const link = titleLinkOf(card);
    if (!link) return null;
    let url;
    try { url = new URL(link.getAttribute('href') || '', location.origin); } catch { return null; }
    const id = url.searchParams.get('v') || '';
    if (!VIDEO_ID.test(id)) return null;
    // 标题只用文本/属性，绝不拼接 aria-label（里面带时长）
    const title = cleanText(card.querySelector('h3[title]')?.getAttribute('title'))
      || cleanText(card.querySelector('a.ytLockupMetadataViewModelTitle')?.textContent)
      || cleanText(link.getAttribute('title'))
      || cleanText(link.textContent);
    const meta = cardMetadata(card);
    const img = card.querySelector(SELECTORS.thumbnail);
    return {
      id,
      title: title || '(无标题)',
      duration: meta.duration,
      views: meta.views,
      published: meta.published,
      description: cleanText(card.querySelector('#description, .metadata-snippet-container')?.textContent),
      thumbnail: img?.currentSrc || img?.getAttribute('src') || '',
      url: `https://www.youtube.com/watch?v=${id}`,
      live: false,
    };
  }

  function collectFromDom() {
    const scope = videosScope();
    if (!scope) return 0;
    const identity = channelIdentity();
    let added = 0;
    topLevelCards(scope).forEach((card) => {
      if (isJunkCard(card, identity)) { state.skipped += 1; return; }
      const video = videoFromCard(card);
      if (!video) { state.skipped += 1; return; }
      if (addVideo(video)) added += 1;
    });
    return added;
  }

  function addVideo(video) {
    if (!video?.id) return false;
    const existing = state.videos.get(video.id);
    if (existing) {
      ['title', 'duration', 'views', 'published', 'description', 'thumbnail'].forEach((key) => {
        if (!existing[key] && video[key]) existing[key] = video[key];
      });
      return false;
    }
    state.videos.set(video.id, { ...video, order: state.order++ });
    return true;
  }

  /* ------------------------------------------------------------------ *
   * 采集入口
   * ------------------------------------------------------------------ */

  function collectAll() {
    state.skipped = 0;
    const dataAdded = collectFromChannelData();
    const domAdded = collectFromDom();
    return dataAdded + domAdded;
  }

  function sortedVideos() {
    return [...state.videos.values()].sort((a, b) => {
      const pa = a.published || '';
      const pb = b.published || '';
      if (pa && pb && pa !== pb) return pb.localeCompare(pa);
      if (pa && !pb) return -1;
      if (!pa && pb) return 1;
      return (a.order || 0) - (b.order || 0);
    });
  }

  // 已采集视频的发布时间跨度（YYYY-MM ~ YYYY-MM），用于状态栏概览
  function publishedRange() {
    const dates = [...state.videos.values()].map((video) => video.published).filter(Boolean).sort();
    if (!dates.length) return null;
    return [dates[0], dates[dates.length - 1]];
  }

  function escapeMarkdown(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  }

  function markdown() {
    const lines = ['| # | 标题 | 时长 | 播放量 | 发布时间 | 视频链接 | 封面图 | 描述 |', '| ---: | --- | ---: | ---: | --- | --- | --- | --- |'];
    sortedVideos().forEach((video, index) => {
      const link = `[${escapeMarkdown(video.title)}](${video.url})`;
      lines.push(`| ${index + 1} | ${link} | ${escapeMarkdown(video.duration)} | ${escapeMarkdown(video.views)} | ${escapeMarkdown(video.published)} | ${video.url} | ${video.thumbnail} | ${escapeMarkdown(video.description)} |`);
    });
    return lines.join('\n');
  }

  function csvCell(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function csv() {
    const lines = [['#', '标题', '时长', '播放量', '发布时间', '视频链接', '封面图', '描述']];
    sortedVideos().forEach((video, index) => {
      lines.push([index + 1, video.title, video.duration, video.views, video.published, video.url, video.thumbnail, video.description]);
    });
    return lines.map((row) => row.map(csvCell).join(',')).join('\r\n');
  }

  /* ------------------------------------------------------------------ *
   * 导出为文件：优先弹出系统保存对话框让用户选路径，不支持时退回下载
   * ------------------------------------------------------------------ */

  function exportBaseName() {
    const identity = channelIdentity();
    const handle = (identity.handle || '').replace(/^@/, '')
      || (location.pathname.match(/^\/channel\/(UC[\w-]+)/) || [])[1]
      || 'youtube-channel';
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return `${handle.replace(/[\\/:*?"<>|\s]+/g, '_')}-videos-${stamp}`;
  }

  function downloadBlob(text, filename, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function saveAsFile(kind) {
    if (!state.videos.size) {
      showToast('还没有采集到视频，请先点「采集当前列表」');
      return;
    }
    const isCsv = kind === 'csv';
    const filename = `${exportBaseName()}.${isCsv ? 'csv' : 'md'}`;
    // CSV 带 BOM，Excel / Numbers 打开中文不乱码
    const text = isCsv ? `\ufeff${csv()}\r\n` : `${markdown()}\n`;
    const mime = isCsv ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8';
    const types = isCsv
      ? [{ description: 'CSV 表格', accept: { 'text/csv': ['.csv'] } }]
      : [{ description: 'Markdown 文档', accept: { 'text/markdown': ['.md'] } }];

    if (typeof window.showSaveFilePicker === 'function') {
      try {
        // 必须在点击事件的同一任务里调用，否则会丢失用户激活
        const handle = await window.showSaveFilePicker({ suggestedName: filename, types });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        showToast(`已保存 ${handle.name || filename}（${state.videos.size} 个视频）`);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.warn('[YouTube 频道采集器] 保存对话框不可用，改用浏览器下载', error);
      }
    }
    downloadBlob(text, filename, mime);
    showToast(`已导出 ${filename}（${state.videos.size} 个视频）`);
  }

  /* ------------------------------------------------------------------ *
   * 界面
   * ------------------------------------------------------------------ */

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'ytcv-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`已复制 ${state.videos.size} 个视频的 ${label}`);
    } catch {
      const fallback = document.querySelector('#ytcv-fallback');
      fallback.value = text;
      fallback.style.display = 'block';
      fallback.focus();
      fallback.select();
      showToast(`自动复制失败，${label} 已选中，请按 Ctrl/Cmd+C`);
    }
  }

  function renderTable() {
    const tbody = state.modal.querySelector('tbody');
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    sortedVideos().forEach((video, index) => {
      const row = document.createElement('tr');
      [index + 1, video.title, video.duration, video.views, video.published, video.url, video.thumbnail, video.description].forEach((value, column) => {
        const cell = document.createElement('td');
        if ((column === 5 || column === 6) && value) {
          const link = document.createElement('a');
          link.href = value;
          link.target = '_blank';
          link.rel = 'noreferrer';
          link.textContent = value;
          cell.appendChild(link);
        } else {
          cell.textContent = value || '—';
        }
        row.appendChild(cell);
      });
      tbody.appendChild(row);
    });
  }

  function createModal() {
    const backdrop = document.createElement('div');
    backdrop.id = 'ytcv-backdrop';
    const dark = document.documentElement.hasAttribute('dark') || document.querySelector('ytd-app[dark]');
    const make = (tag, props = {}, text = '') => {
      const element = document.createElement(tag);
      Object.entries(props).forEach(([key, value]) => {
        if (key === 'className') element.className = value;
        else if (key === 'textContent') element.textContent = value;
        else element.setAttribute(key, value);
      });
      if (text) element.textContent = text;
      return element;
    };
    const dialog = make('section', { id: 'ytcv-dialog', className: dark ? 'ytcv-dark' : '', role: 'dialog', 'aria-modal': 'true' });
    const head = make('header', { id: 'ytcv-head' });
    const heading = make('div');
    heading.append(make('h2', { id: 'ytcv-title' }, 'YouTube 视频采集结果'));
    heading.append(make('p', { id: 'ytcv-status' }, '准备中…'));
    head.append(heading, make('button', { id: 'ytcv-close', title: '关闭' }, '×'));
    const actions = make('div', { id: 'ytcv-actions' });
    actions.append(
      make('button', { className: 'ytcv-action primary', id: 'ytcv-copy' }, '复制 Markdown'),
      make('button', { className: 'ytcv-action', id: 'ytcv-copy-csv' }, '复制 CSV'),
      make('button', { className: 'ytcv-action', id: 'ytcv-save-md' }, '保存 Markdown'),
      make('button', { className: 'ytcv-action', id: 'ytcv-save-csv' }, '保存 CSV'),
      make('button', { className: 'ytcv-action', id: 'ytcv-refresh' }, '重新读取当前列表'),
    );
    const fallback = make('textarea', { id: 'ytcv-fallback', spellcheck: 'false' });
    const tableWrap = make('div', { id: 'ytcv-table-wrap' });
    const table = make('table', { id: 'ytcv-table' });
    const thead = make('thead');
    const headerRow = make('tr');
    ['#', '标题', '时长', '播放量', '发布时间', '视频链接', '封面图', '描述'].forEach((label) => headerRow.append(make('th', {}, label)));
    thead.append(headerRow);
    table.append(thead, make('tbody'));
    tableWrap.append(table);
    dialog.append(head, actions, fallback, tableWrap);
    backdrop.append(dialog);
    document.body.appendChild(backdrop);
    state.modal = backdrop;
    backdrop.querySelector('#ytcv-close').onclick = closeModal;
    backdrop.querySelector('#ytcv-copy').onclick = () => copyText(markdown(), 'Markdown 表格');
    backdrop.querySelector('#ytcv-copy-csv').onclick = () => copyText(csv(), 'CSV');
    backdrop.querySelector('#ytcv-save-md').onclick = () => saveAsFile('md');
    backdrop.querySelector('#ytcv-save-csv').onclick = () => saveAsFile('csv');
    backdrop.querySelector('#ytcv-refresh').onclick = () => runCollection();
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(); });
    return backdrop;
  }

  function closeModal() { state.modal?.remove(); state.modal = null; }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.modal) closeModal();
  });

  function setStatus(message) { if (state.modal) state.modal.querySelector('#ytcv-status').textContent = message; }

  async function runCollection() {
    if (state.running) return;
    if (!onChannelVideosPage()) {
      showToast('请先打开目标频道的「视频」页签（/@handle/videos）');
      return;
    }
    try {
      if (!state.modal) createModal();
    } catch (error) {
      console.error('[YouTube 频道采集器] 无法创建结果面板', error);
      showToast(`采集器启动失败：${error.message || '无法创建面板'}`);
      return;
    }
    state.running = true;
    state.videos.clear();
    state.order = 0;
    try {
      setStatus('正在读取当前已加载的视频…');
      collectAll();
      renderTable();
      const range = publishedRange();
      const rangeText = range ? `（发布时间 ${range[0]} ~ ${range[1]}）` : '';
      const skipped = state.skipped ? `，已跳过 ${state.skipped} 个非视频条目（合辑/播放列表/Shorts/直播/推荐）` : '';
      setStatus(`完成：读取到 ${state.videos.size} 个普通视频${rangeText}${skipped}`);
    } catch (error) {
      renderTable();
      setStatus(`采集遇到问题：${error.message || '未知错误'}；已保留已发现的 ${state.videos.size} 个视频`);
      console.error('[YouTube 频道采集器] 采集失败', error);
    } finally {
      state.running = false;
    }
  }

  function ensureButton() {
    if (!onChannelVideosPage()) {
      state.button?.remove();
      state.button = null;
      return;
    }
    if (state.button?.isConnected) return;
    const button = document.createElement('button');
    button.id = 'ytcv-launcher';
    button.textContent = '采集当前列表';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.textContent = '正在采集…';
      runCollection().finally(() => { if (button.isConnected) button.textContent = '采集当前列表'; });
    }, true);
    document.body.appendChild(button);
    state.button = button;
  }

  function routeChanged() {
    if (state.routeKey === location.href) return;
    state.routeKey = location.href;
    state.videos.clear();
    state.order = 0;
    closeModal();
    setTimeout(ensureButton, CONFIG.pageReadyDelay);
  }

  function scheduleEnsure() {
    if (state.observerTimer) return;
    state.observerTimer = setTimeout(() => {
      state.observerTimer = null;
      ensureButton();
      routeChanged();
    }, CONFIG.observerDelay);
  }

  ensureButton();
  setTimeout(ensureButton, CONFIG.pageReadyDelay);
  new MutationObserver(scheduleEnsure).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', () => setTimeout(() => { routeChanged(); ensureButton(); }, 300));
  window.addEventListener('yt-navigate-finish', () => setTimeout(() => { routeChanged(); ensureButton(); }, 300));
})();

// guard self-test (no version bump)
