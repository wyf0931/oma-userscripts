// ==UserScript==
// @name         小红书 AI 对话 Markdown 复制器
// @name:en      Xiaohongshu AI Chat Markdown Copier
// @namespace    https://github.com/wyf0931/oma-userscripts
// @version      0.2.1
// @description  悬停小红书「点点」的消息复制 AI 回复的 Markdown 原文，也可以一键复制整个对话
// @description:en  Copy Xiaohongshu AI replies as original Markdown, or copy the whole conversation at once.
// @author       wyf0931
// @license      MIT
// @homepageURL  https://github.com/wyf0931/oma-userscripts
// @supportURL   https://github.com/wyf0931/oma-userscripts/issues
// @icon         https://www.xiaohongshu.com/favicon.ico
// @match        https://www.xiaohongshu.com/*
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    aiMessageSelector: '.ai-message',
    aiMarkdownSelector: '.xhs-ai-md-container',
    markdownBlockSelector: '.markdown-block',
    userMessageSelector: '.user-message',
    userTextSelector: '.user-message__text',
    // 输入框是浮在对话区底部的，按钮别压在它上面
    composerSelector: '.input-container',
    chatPageSelector: '.xhs-ai-chat-page',
    titleBarSelector: '.sticky-title-container, .sticky-title-wrapper',
    roundSelector: '.round-item',
    hideDelay: 240,
    toastDuration: 1600,
    followInterval: 250,
    observerDelay: 350,
  };

  const UI = {
    buttonId: 'xhs-md-copy-btn',
    allButtonId: 'xhs-md-copy-all-btn',
    toastId: 'xhs-md-copy-toast',
    styleId: 'xhs-md-copy-style',
    actionClass: 'xhs-md-copy-action',
    visibleClass: 'xhs-md-copy-visible',
    copiedClass: 'is-copied',
    toastVisibleClass: 'xhs-md-copy-toast-visible',
  };

  // 小红书 markdown 原文里夹着零宽字符（​**​标题​**​），不剥掉会污染复制结果
  const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const state = {
    button: null,
    conversationButton: null,
    toast: null,
    host: null,
    kind: '',
    hideTimer: 0,
    toastTimer: 0,
    copiedTimer: 0,
    copiedAllTimer: 0,
    followTimer: 0,
    observer: null,
    observerTimer: 0,
    pointerRaf: 0,
    pointerTarget: null,
  };

  const STYLE = `
    .${UI.actionClass} {
      position: fixed;
      z-index: 2147483000;
      box-sizing: border-box;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      margin: 0;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.94);
      color: rgba(0, 0, 0, 0.55);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
      cursor: pointer;
      opacity: 0;
      visibility: hidden;
      transform: translateY(3px) scale(0.96);
      transition: opacity 0.14s ease, transform 0.14s ease, visibility 0.14s, color 0.14s, border-color 0.14s, background-color 0.14s;
      pointer-events: none;
      -webkit-user-select: none;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      font: 400 12px/1 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .${UI.actionClass}.${UI.visibleClass} {
      opacity: 1;
      visibility: visible;
      transform: none;
      pointer-events: auto;
    }
    .${UI.actionClass}:hover,
    .${UI.actionClass}:focus-visible {
      color: #ff2442;
      border-color: rgba(255, 36, 66, 0.4);
      background: #fff;
      outline: none;
    }
    .${UI.actionClass}:focus-visible {
      box-shadow: 0 0 0 2px rgba(255, 36, 66, 0.35), 0 2px 10px rgba(0, 0, 0, 0.12);
    }
    .${UI.actionClass} svg {
      display: block;
      width: 16px;
      height: 16px;
      pointer-events: none;
    }
    .${UI.actionClass} .xhs-md-copy-check { display: none; }
    .${UI.actionClass}.${UI.copiedClass} {
      color: #16a34a;
      border-color: rgba(22, 163, 74, 0.35);
    }
    .${UI.actionClass}.${UI.copiedClass} .xhs-md-copy-copy { display: none; }
    .${UI.actionClass}.${UI.copiedClass} .xhs-md-copy-check { display: block; }

    #${UI.allButtonId} {
      z-index: 2147482990;
      width: 30px;
      height: 30px;
    }

    #${UI.toastId} {
      position: fixed;
      z-index: 2147483001;
      transform: translateX(-50%) translateY(4px);
      padding: 8px 14px;
      border-radius: 999px;
      background: rgba(24, 24, 28, 0.92);
      color: #fff;
      font: 500 13px/1.4 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.24);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.16s ease, transform 0.16s ease, visibility 0.16s;
      pointer-events: none;
      white-space: nowrap;
    }
    #${UI.toastId}.${UI.toastVisibleClass} {
      opacity: 1;
      visibility: visible;
      transform: translateX(-50%) translateY(0);
    }
  `;

  function injectStyle() {
    if (document.getElementById(UI.styleId)) return;
    const style = document.createElement('style');
    style.id = UI.styleId;
    style.textContent = STYLE;
    (document.head || document.documentElement).appendChild(style);
  }

  function svgIcon(kind) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    if (kind === 'copy') {
      const back = document.createElementNS(SVG_NS, 'rect');
      back.setAttribute('x', '9');
      back.setAttribute('y', '9');
      back.setAttribute('width', '12');
      back.setAttribute('height', '12');
      back.setAttribute('rx', '2.5');
      svg.appendChild(back);

      const front = document.createElementNS(SVG_NS, 'path');
      front.setAttribute('d', 'M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1');
      svg.appendChild(front);
    } else {
      const check = document.createElementNS(SVG_NS, 'path');
      check.setAttribute('d', 'M5 12.5l4.5 4.5L19 7.5');
      svg.appendChild(check);
    }
    return svg;
  }

  function ensureButton() {
    if (state.button && state.button.isConnected) return state.button;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = UI.buttonId;
    button.className = UI.actionClass;
    button.title = '复制 Markdown';
    button.setAttribute('aria-label', '复制这条消息的 Markdown');

    const copyIcon = svgIcon('copy');
    copyIcon.classList.add('xhs-md-copy-copy');
    const checkIcon = svgIcon('check');
    checkIcon.classList.add('xhs-md-copy-check');
    button.append(copyIcon, checkIcon);

    // 别让按下按钮时抢走页面里的文本选区 / 触发页面自己的外部点击逻辑
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', onCopyClick);
    button.addEventListener('pointerenter', cancelHide);
    button.addEventListener('pointerleave', scheduleHide);

    document.body.appendChild(button);
    state.button = button;
    return button;
  }

  function ensureToast() {
    if (state.toast && state.toast.isConnected) return state.toast;
    const toast = document.createElement('div');
    toast.id = UI.toastId;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
    state.toast = toast;
    return toast;
  }

  function showToast(message, anchor) {
    const toast = ensureToast();
    toast.textContent = message;

    // 提示贴在触发复制的按钮上方，避开页面底部的输入框
    const trigger = anchor || state.button;
    let centerX = window.innerWidth / 2;
    let top = window.innerHeight - 96;
    if (trigger && trigger.isConnected) {
      const buttonRect = trigger.getBoundingClientRect();
      const width = toast.offsetWidth || 120;
      const height = toast.offsetHeight || 32;
      centerX = Math.min(
        Math.max(buttonRect.left + buttonRect.width / 2, width / 2 + 8),
        window.innerWidth - width / 2 - 8,
      );
      top = buttonRect.top - height - 8;
      if (top < 8) top = buttonRect.bottom + 8;
    }
    toast.style.left = `${Math.round(centerX)}px`;
    toast.style.top = `${Math.round(top)}px`;

    toast.classList.add(UI.toastVisibleClass);
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      toast.classList.remove(UI.toastVisibleClass);
    }, CONFIG.toastDuration);
  }

  function cleanMarkdown(value) {
    // 只裁掉首尾空白，保留正文里的换行 / 缩进
    const text = String(value || '').replace(INVISIBLE, '');
    return text.replace(/^\s+/, '').replace(/\s+$/, '');
  }

  function readAiParts(messageEl) {
    const parts = [];
    messageEl.querySelectorAll(CONFIG.markdownBlockSelector).forEach((block) => {
      const raw = block.getAttribute('data-original-text');
      const text = cleanMarkdown(raw || block.innerText || '');
      if (text) parts.push(text);
    });
    return parts;
  }

  function readMarkdown(host, kind) {
    if (!host) return '';
    if (kind === 'user') {
      const textEl = host.querySelector(CONFIG.userTextSelector) || host;
      return cleanMarkdown(textEl.innerText || textEl.textContent || '');
    }

    // AI 回复：优先取 data-original-text（服务端下发的 Markdown 原文）
    const message = host.closest(CONFIG.aiMessageSelector) || host;
    const parts = readAiParts(message);
    if (parts.length) return parts.join('\n\n');

    // 兜底：没有原文属性时退回渲染后的纯文本
    const container = host.matches(CONFIG.aiMarkdownSelector)
      ? host
      : host.querySelector(CONFIG.aiMarkdownSelector);
    return cleanMarkdown((container || host).innerText || '');
  }

  // 整个对话固定输出成「user input / assistant」交替的纯 Markdown，不掺 UI 文案
  function readConversation() {
    const blocks = [];
    let turns = 0;
    const rounds = document.querySelectorAll(CONFIG.roundSelector);

    if (rounds.length) {
      rounds.forEach((round) => {
        const textEl = round.querySelector(CONFIG.userTextSelector);
        const userText = textEl ? cleanMarkdown(textEl.innerText || textEl.textContent || '') : '';
        const aiParts = [];
        round.querySelectorAll(CONFIG.aiMessageSelector).forEach((message) => {
          aiParts.push(...readAiParts(message));
        });
        if (!userText && !aiParts.length) return;
        turns += 1;
        if (userText) blocks.push(`user input: ${userText}`);
        if (aiParts.length) blocks.push(`assistant:\n\n${aiParts.join('\n\n')}`);
      });
    } else {
      // 兜底：找不到 .round-item 时按 DOM 顺序拼
      document.querySelectorAll(`${CONFIG.userMessageSelector}, ${CONFIG.aiMessageSelector}`).forEach((el) => {
        if (el.matches(CONFIG.userMessageSelector)) {
          const textEl = el.querySelector(CONFIG.userTextSelector) || el;
          const text = cleanMarkdown(textEl.innerText || textEl.textContent || '');
          if (text) {
            turns += 1;
            blocks.push(`user input: ${text}`);
          }
          return;
        }
        const parts = readAiParts(el);
        if (parts.length) blocks.push(`assistant:\n\n${parts.join('\n\n')}`);
      });
    }

    return { text: blocks.join('\n\n'), turns };
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // 继续走 execCommand 兜底
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
    document.body.appendChild(textarea);
    let ok = false;
    try {
      textarea.select();
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    } finally {
      textarea.remove();
    }
    return ok;
  }

  function markCopied() {
    const button = state.button;
    if (!button) return;
    button.classList.add(UI.copiedClass);
    button.title = '已复制';
    window.clearTimeout(state.copiedTimer);
    state.copiedTimer = window.setTimeout(() => {
      button.classList.remove(UI.copiedClass);
      button.title = state.kind === 'user' ? '复制这条消息' : '复制 Markdown';
    }, 1200);
  }

  function onCopyClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const host = state.host;
    if (!host || !host.isConnected) {
      hide();
      return;
    }

    const markdown = readMarkdown(host, state.kind);
    if (!markdown) {
      showToast('这条消息没有可复制的文本');
      return;
    }

    copyText(markdown).then((ok) => {
      if (!ok) {
        showToast('复制失败，请手动选中文本复制');
        return;
      }
      markCopied();
      showToast(state.kind === 'user' ? '已复制这条消息' : '已复制 Markdown');
    });
  }

  function findHost(node) {
    if (!(node instanceof Element)) return null;

    const userMessage = node.closest(CONFIG.userMessageSelector);
    if (userMessage) return { host: userMessage, kind: 'user' };

    const aiMarkdown = node.closest(CONFIG.aiMarkdownSelector);
    if (aiMarkdown && aiMarkdown.closest(CONFIG.aiMessageSelector)) {
      return { host: aiMarkdown, kind: 'ai' };
    }

    const aiMessage = node.closest(CONFIG.aiMessageSelector);
    if (aiMessage) {
      const containers = aiMessage.querySelectorAll(CONFIG.aiMarkdownSelector);
      const last = containers[containers.length - 1];
      if (last) return { host: last, kind: 'ai' };
    }

    return null;
  }

  function isButtonNode(node) {
    return Boolean(state.button && (node === state.button || state.button.contains(node)));
  }

  function activate(host, kind) {
    const button = ensureButton();
    state.host = host;
    state.kind = kind;

    window.clearTimeout(state.copiedTimer);
    button.classList.remove(UI.copiedClass);
    button.title = kind === 'user' ? '复制这条消息' : '复制 Markdown';
    button.setAttribute('aria-label', kind === 'user' ? '复制这条消息' : '复制这条 AI 回复的 Markdown');

    if (!position()) {
      hide();
      return;
    }
    button.classList.add(UI.visibleClass);
    startFollow();
  }

  function position() {
    const button = state.button;
    const host = state.host;
    if (!button || !host) return false;

    // 用户消息：
    //   .user-message 自带 20px padding-bottom（给页面自己的操作条留位），直接用它的
    //   rect 会把按钮放到气泡下方 20px 处；改用真正有气泡背景的 .user-message__text。
    const anchor = state.kind === 'user'
      ? (host.querySelector(CONFIG.userTextSelector) || host)
      : host;
    const rect = anchor.getBoundingClientRect();
    let bottom = rect.bottom;
    if (state.kind === 'user' && anchor === host) {
      bottom -= parseFloat(window.getComputedStyle(host).paddingBottom) || 0;
    }

    if (!anchor.isConnected || !rect.width || !rect.height || bottom <= 0 || rect.top >= window.innerHeight) {
      return false;
    }

    const size = button.offsetWidth || 28;
    const gap = 2;
    const maxLeft = Math.max(8, window.innerWidth - size - 8);
    const maxTop = Math.max(8, window.innerHeight - size - 8);
    // 贴着消息右下角往下放 2px：相接，而不是压在消息内容上
    const left = Math.min(Math.max(8, rect.right - size), maxLeft);
    let top = bottom + gap;
    if (top > maxTop) top = maxTop;

    // 长消息的右下角在视口外时会先被钳到视口底部；如果那里正好是输入框，再往上让开
    const composer = document.querySelector(CONFIG.composerSelector);
    if (composer) {
      const composerRect = composer.getBoundingClientRect();
      const overlaps = left + size > composerRect.left && left < composerRect.right
        && top + size > composerRect.top && top < composerRect.bottom;
      if (overlaps) top = Math.max(8, Math.min(top, composerRect.top - size - gap));
    }

    button.style.left = `${Math.round(left)}px`;
    button.style.top = `${Math.round(top)}px`;
    return true;
  }

  function reposition() {
    if (!state.host) return;
    if (!position()) hide();
  }

  function startFollow() {
    window.clearInterval(state.followTimer);
    state.followTimer = window.setInterval(reposition, CONFIG.followInterval);
  }

  function stopFollow() {
    window.clearInterval(state.followTimer);
    state.followTimer = 0;
  }

  function hide() {
    window.clearTimeout(state.hideTimer);
    state.hideTimer = 0;
    stopFollow();
    if (state.button) state.button.classList.remove(UI.visibleClass);
    state.host = null;
    state.kind = '';
  }

  function cancelHide() {
    window.clearTimeout(state.hideTimer);
    state.hideTimer = 0;
  }

  function scheduleHide() {
    cancelHide();
    state.hideTimer = window.setTimeout(hide, CONFIG.hideDelay);
  }

  function ensureConversationButton() {
    if (state.conversationButton && state.conversationButton.isConnected) return state.conversationButton;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = UI.allButtonId;
    button.className = UI.actionClass;
    button.title = '复制整个对话为 Markdown';
    button.setAttribute('aria-label', '复制整个对话为 Markdown');

    const copyIcon = svgIcon('copy');
    copyIcon.classList.add('xhs-md-copy-copy');
    const checkIcon = svgIcon('check');
    checkIcon.classList.add('xhs-md-copy-check');
    button.append(copyIcon, checkIcon);

    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', onConversationCopy);

    document.body.appendChild(button);
    state.conversationButton = button;
    return button;
  }

  function positionConversationButton() {
    const button = state.conversationButton;
    if (!button) return;

    const bar = document.querySelector(CONFIG.titleBarSelector);
    const size = button.offsetWidth || 30;
    let top = 16;
    let right = 24;
    if (bar) {
      const rect = bar.getBoundingClientRect();
      if (rect.width && rect.height) {
        top = rect.top + (rect.height - size) / 2;
        right = Math.max(12, window.innerWidth - rect.right + 16);
      }
    }
    button.style.top = `${Math.round(top)}px`;
    button.style.right = `${Math.round(right)}px`;
  }

  function updateConversationButton() {
    const button = ensureConversationButton();
    const chatPage = document.querySelector(CONFIG.chatPageSelector);
    const hasContent = Boolean(document.querySelector(`${CONFIG.roundSelector}, ${CONFIG.aiMessageSelector}`));
    const show = Boolean(chatPage && hasContent);

    button.classList.toggle(UI.visibleClass, show);
    if (!show) {
      window.clearTimeout(state.copiedAllTimer);
      button.classList.remove(UI.copiedClass);
      return;
    }
    positionConversationButton();
  }

  function markConversationCopied() {
    const button = state.conversationButton;
    if (!button) return;
    window.clearTimeout(state.copiedAllTimer);
    button.classList.add(UI.copiedClass);
    button.title = '已复制';
    state.copiedAllTimer = window.setTimeout(() => {
      button.classList.remove(UI.copiedClass);
      button.title = '复制整个对话为 Markdown';
    }, 1200);
  }

  function onConversationCopy(event) {
    event.preventDefault();
    event.stopPropagation();

    const { text, turns } = readConversation();
    if (!text) {
      showToast('这段对话还没有可复制的内容', state.conversationButton);
      return;
    }

    copyText(text).then((ok) => {
      if (!ok) {
        showToast('复制失败，请手动选中文本复制', state.conversationButton);
        return;
      }
      markConversationCopied();
      showToast(`已复制整个对话（${turns} 轮）`, state.conversationButton);
    });
  }

  function startPageObserver() {
    if (state.observer) return;
    const observer = new MutationObserver(() => {
      if (state.observerTimer) return;
      state.observerTimer = window.setTimeout(() => {
        state.observerTimer = 0;
        updateConversationButton();
      }, CONFIG.observerDelay);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    state.observer = observer;
  }

  function onViewportChange() {
    reposition();
    positionConversationButton();
  }

  function handlePointer(target) {
    if (!(target instanceof Element)) {
      scheduleHide();
      return;
    }

    if (isButtonNode(target)) {
      cancelHide();
      return;
    }

    const found = findHost(target);
    if (!found) {
      scheduleHide();
      return;
    }

    cancelHide();
    if (found.host === state.host) {
      reposition();
      return;
    }
    activate(found.host, found.kind);
  }

  function onPointerMove(event) {
    state.pointerTarget = event.target;
    if (state.pointerRaf) return;
    state.pointerRaf = window.requestAnimationFrame(() => {
      state.pointerRaf = 0;
      const target = state.pointerTarget;
      state.pointerTarget = null;
      if (target) handlePointer(target);
    });
  }

  function init() {
    injectStyle();
    ensureButton();
    updateConversationButton();
    startPageObserver();

    document.addEventListener('pointermove', onPointerMove, { passive: true });
    // 长消息里滚动、窗口缩放时按钮要跟住消息右下角 / 顶部按钮
    document.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hide();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
