// ==UserScript==
// @name         鱼排消息云·关键词监听（新版）
// @namespace    https://fishpi.cn
// @license      MIT
// @version      2.0.0
// @description  新版聊天室关键词/指定用户/@我监听：消息云提醒、聚合记录、上下文追溯（由 message_listening v1.1.0 重构）
// @author       muli 定制
// @match        https://new.fishpi.cn/cr
// @icon         https://file.fishpi.cn/2025/11/blob-4d0e46ad.png?imageView2/1/w/48/h/48/interlace/0/q/100
// @grant        GM_notification
// @grant        GM_addStyle
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/mu-xiao-li/yupai-extend-js/main/fishpi_message_listening_plus.user.js
// @updateURL    https://raw.githubusercontent.com/mu-xiao-li/yupai-extend-js/main/fishpi_message_listening_plus.user.js
// ==/UserScript==
// 旧版（fishpi.cn/cr 旧聊天室）演进史见 message_listening.user.js（v1.0.0 ~ v1.1.0），旧文件冻结不动
// 2026-11-20 v2.0.0 首轮真机反馈：详情/上下文气泡复刻系统消息观感（--fp-hover 底+描边+非对称圆角+底部内阴影，
//   自己消息 --fp-self 绿底靠右、头像改系统圆角方框、meta 改「昵称 · 时间」）；
//   引用/跳转原消息后自动关闭弹层（让位给输入框/聊天区）；文件更名为 fishpi_message_listening_plus.user.js
// 2026-11-20 v2.0.0 重构适配新版聊天室（new.fishpi.cn/cr）：
//   消息捕获改走 fpcp 跨脚本消息总线（与聊天室增强共用监听，单装自动降级自开监听，15s 静默回退，id 去重）
//   上下文追溯改官方 API（GET /api/v3/chat/messages/{id}/context?radius=5），不再依赖 DOM 存活，
//   脚本自渲染气泡（淡入+错落进场动画），支持加载更早/更新、跳转原消息（闪烁定位）、一键引用
//   新增启动补录：游标 API 拉最近 N 条错过消息（默认 50，0=关），静默建组、toast 汇报、仍计未读
//   新增 @我 监听（自动识别自己用户名/昵称，设置可手填兜底）；新增忽略卡片消息开关（红包/音乐/天气）
//   新增数据自动清理（默认勾选 7 天，设置可调）；快照瘦身（text≤500/html≤3000）+ 写入节流 2s
//   指定用户改「括号内用户名精确匹配」（填 昵称(用户名)/(用户名)/用户名 均可）
//   UI 重构：接入新 UI 主题变量（--fp-* 随深浅色切换）、CSS 脉冲替代 JS 闪烁定时器、三层弹层动效
//   砍掉桌面弹幕（WS→本地 Java 服务，实验性功能）及其全部配置；修复初始扫描误弹通知（改为静默建组）

(function () {
    'use strict';

    // ================== 常量 ==================
    const VERSION_US = 'v2.0.0';
    const API_BASE = 'https://fishpi.cn';
    const NS = 'mlp_';                  // 样式/节点命名空间
    const HUB_MSG_EVENT = 'fpcp:chat-msg';
    const HUB_HELLO_EVENT = 'fpcp:hub-hello';
    const HUB_BEAT_EVENT = 'fpcp:hub-beat';
    const STORAGE_KEY = 'MsgCloudConfig';
    const GROUPS_KEY = 'MsgCloudGroups';
    const GROUPS_V = 2;                 // 分组数据版本（v1 旧数据不迁移，直接丢弃）
    const DEDUPE_CAP = 2000;            // 已处理消息 id 有界上限
    const SAVE_DELAY = 2000;            // 写入节流（ms）
    const RENDER_DELAY = 300;           // 渲染节流（ms）
    const HUB_SILENCE = 15000;          // hub 静默回退阈值（ms）

    // ================== 纯逻辑（mock 自测区，勿依赖 DOM） ==================
    // PURE-BEGIN
    // HTML 转义（动态串进 innerHTML 前必过）
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // 限长快照（超出截断加省略号）
    function capStr(s, n) {
        s = String(s == null ? '' : s);
        return s.length > n ? s.slice(0, n - 1) + '…' : s;
    }

    // 毫秒时间戳 → 'MM-DD HH:mm'（本地时区）
    function formatTime(ts) {
        const d = new Date(ts);
        const p = (x) => String(x).padStart(2, '0');
        return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    // 配置列表归一化（数组或逗号/中文逗号分隔串 → 去空 trim 数组）
    function normalizeList(v) {
        if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
        if (typeof v === 'string') return v.split(/[,，]/).map(s => s.trim()).filter(Boolean);
        return [];
    }

    // 指定用户条目 → 用户名：取括号内内容（半/全角均可），无括号取整串
    function parseUserEntry(entry) {
        const s = String(entry == null ? '' : entry).trim();
        const m = s.match(/[（(]([^）)]+)[）)]/);
        return (m ? m[1] : s).trim();
    }

    // 卡片消息识别（红包/音乐/天气卡片不参与关键词匹配，避免「红包」被红包卡片刷屏）
    function isCardHtml(html) {
        const h = String(html == null ? '' : html);
        return h.includes('hongbao__') || h.includes('card music') || h.includes('card weather');
    }

    // 匹配规则（优先级：指定用户 → @我 → 关键词），返回 {type,key} 或 null
    //   msg:  {text,userName,nickname,isSelf}   cfg: {users,keywords,enableAtMonitor}
    //   me:   {userName,nickname}（@我匹配用，任一为空则跳过 at 档）
    function matchMessageCore(msg, cfg, me) {
        const userName = String(msg.userName == null ? '' : msg.userName).trim();
        // 1. 指定用户：括号内用户名精确匹配
        for (const entry of (cfg.users || [])) {
            const u = parseUserEntry(entry);
            if (u && u === userName) return { type: 'user', key: u };
        }
        // 2. @我：@用户名/@昵称 边界匹配，自己发言不算
        if (cfg.enableAtMonitor && !msg.isSelf && (me.userName || me.nickname)) {
            const text = String(msg.text == null ? '' : msg.text);
            const names = [me.userName, me.nickname].filter(Boolean)
                .map(n => String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            if (names.length && new RegExp('@(?:' + names.join('|') + ')(?![A-Za-z0-9_-])').test(text)) {
                return { type: 'at', key: '@我' };
            }
        }
        // 3. 关键词：包含匹配
        const text = String(msg.text == null ? '' : msg.text);
        for (const kw of (cfg.keywords || [])) {
            if (kw && text.includes(kw)) return { type: 'keyword', key: kw };
        }
        return null;
    }

    // 查可合并组（同类型同 key、ts 落在 [firstTs, firstTs+windowMs] 窗口内），返回下标或 -1
    function findMergeGroupIndex(groups, key, type, ts, windowMs) {
        for (let i = 0; i < groups.length; i++) {
            const g = groups[i];
            if (g.type === type && g.key === key) {
                const diff = ts - g.firstTs;
                if (diff >= 0 && diff <= windowMs) return i;
            }
        }
        return -1;
    }

    // TTL 清理：移除 latestTs 早于 now-days 天的组，返回过滤后的数组
    function cleanExpiredGroups(groups, now, days) {
        if (!days || days <= 0) return groups.slice();
        const cutoff = now - days * 86400000;
        return groups.filter(g => (g.latestTs || 0) >= cutoff);
    }
    // PURE-END

    // ================== 工具 ==================
    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // Safari 无 GM_addStyle 兼容 shim（同聊天室增强）
    function addStyle(css) {
        if (typeof GM_addStyle !== 'undefined') { GM_addStyle(css); return; }
        const s = document.createElement('style');
        s.textContent = css;
        document.head.appendChild(s);
    }

    // ================== 轻提示 ==================
    let toastTimer = null;
    function toast(msg, duration = 1800) {
        let box = document.getElementById(NS + 'toast');
        if (!box) {
            box = document.createElement('div');
            box.id = NS + 'toast';
            document.body.appendChild(box);
        }
        box.textContent = String(msg == null ? '' : msg);
        box.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => box.classList.remove('show'), duration);
    }

    // ================== 存储中心（云端优先，读写统一 string） ==================
    const muliSpecialStorage = {
        setItem: function (key, data) {
            if (typeof data === 'object') data = JSON.stringify(data);
            if (typeof cloudStorage !== 'undefined') cloudStorage.setItem(key, data);
            localStorage.setItem(key, data);
        },
        getItem: function (key, defaultData) {
            if (typeof defaultData === 'object') defaultData = JSON.stringify(defaultData);
            let data = null;
            if (typeof cloudStorage !== 'undefined') {
                data = cloudStorage.getItem(key, defaultData);
                if (data && typeof data === 'object') data = JSON.stringify(data);
            }
            if (!data || data == null || data == '' || data == 'undefined') {
                data = localStorage.getItem(key);
                if (data && data != null && data != '' && typeof cloudStorage !== 'undefined') {
                    cloudStorage.setItem(key, data);
                }
            } else if (typeof data === 'object') {
                data = JSON.stringify(data);
            }
            if (defaultData && (!data || data == null || data == '' || data == 'undefined')) return defaultData;
            return data;
        },
        removeItem: function (key) {
            if (typeof cloudStorage !== 'undefined') cloudStorage.removeItem(key);
            localStorage.removeItem(key);
        }
    };

    // ================== 令牌（同红包脚本三级兜底，页面共享优先） ==================
    //   ① fetch/XHR 钩子捕获页面 accessToken 复用（零副作用）
    //   ② 复用聊天室增强共享的 token（fpcp:token / __fpcp_token）
    //   ③ /auth/refresh 只是最后兜底——会轮换登录 Cookie，启动保护期后且仅用户主动操作才放行
    const PAGE_START = Date.now();
    const TokenStore = {
        _token: null,
        install() {
            const origFetch = window.fetch;
            window.fetch = function (input, init) {
                try {
                    let auth = null;
                    if (init && init.headers) auth = new Headers(init.headers).get('Authorization');
                    else if (input && typeof input.headers !== 'undefined') {
                        try { auth = new Headers(input.headers).get('Authorization'); } catch (e) { }
                    }
                    if (auth && auth.startsWith('Bearer ')) TokenStore._token = auth.slice(7);
                } catch (e) { }
                return origFetch.call(this, input, init);
            };
            try {
                const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
                XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
                    try {
                        if (String(name).toLowerCase() === 'authorization' && String(value).startsWith('Bearer ')) {
                            TokenStore._token = String(value).slice(7);
                        }
                    } catch (e) { }
                    return origSetHeader.apply(this, arguments);
                };
            } catch (e) { }
            window.addEventListener('fpcp:token', (e) => {
                try {
                    const t = e && e.detail && e.detail.token;
                    if (t) TokenStore._token = t;
                } catch (err) { }
            });
        },
        invalidate(used) { if (this._token === used) this._token = null; },
        // 只读已捕获/共享的 token，绝不动网络（启动期一律用这个）
        peek() {
            if (this._token) return this._token;
            try {
                const shared = window.__fpcp_token;
                if (typeof shared === 'string' && shared) {
                    this._token = shared;
                    return this._token;
                }
            } catch (e) { }
            return null;
        },
        bootSafe() {
            return document.readyState === 'complete' && Date.now() - PAGE_START > 10000;
        },
        // 取 token：捕获/共享优先；refresh 兜底仅在过了启动保护期后放行（防预热踢下线）
        async ensure() {
            for (let i = 0; i < 30; i++) {
                const peeked = this.peek();
                if (peeked) return peeked;
                if (this.bootSafe()) break;
                await sleep(1000);
            }
            const late = this.peek();
            if (late) return late;
            const rsp = await fetch(API_BASE + '/api/v3/auth/refresh', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            });
            const j = await rsp.json().catch(() => null);
            if (j && j.code === 0 && j.data && typeof j.data.accessToken === 'string') {
                this._token = j.data.accessToken;
                return this._token;
            }
            throw new Error('登录凭证获取失败(HTTP ' + rsp.status + ')，请刷新页面后重试');
        }
    };

    // v3 请求：带 Bearer；401 时作废旧 token 自动重试一次
    async function apiReq(path, opt = {}) {
        let lastTok = null;
        const doFetch = async () => {
            const token = await TokenStore.ensure();
            lastTok = token;
            const headers = Object.assign({}, opt.headers || {}, {
                'Authorization': 'Bearer ' + token
            });
            return fetch(API_BASE + path, Object.assign({}, opt, { headers, credentials: 'include' }));
        };
        let rsp = await doFetch();
        if (rsp.status === 401) {
            TokenStore.invalidate(lastTok);
            rsp = await doFetch();
        }
        return rsp;
    }

    // ================== 配置（旧 schema 全键保留，弹幕键不再读写） ==================
    const DEFAULT_CONFIG = {
        keywords: ['沐里', '红包', '公告'],   // 监听的关键词列表
        users: [],                           // 监听指定用户（填 昵称(用户名)/(用户名)/用户名，取括号内用户名精确匹配）
        enableMonitor: true,                 // 是否启用监听
        enableNotification: true,            // 是否开启浏览器通知
        mergeMinutes: 10,                    // 合并窗口（分钟）
        maxGroups: 100,                      // 最多保留组数
        maxMessagesPerGroup: 20,             // 每组最多保存的消息条数
        // ==== v2.0.0 新增 ====
        enableAtMonitor: true,               // @我 监听
        ignoreCardMessages: true,            // 忽略红包/音乐/天气卡片消息
        enableAutoClean: true,               // 数据自动清理（默认勾选）
        autoCleanDays: 7,                    // 保留天数
        historyBackfill: 50,                 // 启动补录条数（0=关闭）
        myUserName: ''                       // 自己的用户名（@我匹配用，留空自动识别）
    };
    const CONFIG = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    function loadConfig() {
        const saved = muliSpecialStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const cfg = JSON.parse(saved);
                for (const k in DEFAULT_CONFIG) {
                    if (!(k in cfg)) continue;
                    if (Array.isArray(DEFAULT_CONFIG[k])) CONFIG[k] = normalizeList(cfg[k]);
                    else if (typeof DEFAULT_CONFIG[k] === 'number') CONFIG[k] = Number(cfg[k]) || DEFAULT_CONFIG[k];
                    else if (typeof DEFAULT_CONFIG[k] === 'boolean') CONFIG[k] = !!cfg[k];
                    else CONFIG[k] = String(cfg[k]);
                }
                // 旧配置里的 danmaku* 等键不迁移、不再写回
            } catch (e) { console.error('[消息云] 加载配置失败', e); }
        }
    }

    // 写入节流：2s 内多次触发合并一次落盘（配置/分组各自独立节流，互不吞写）
    let _saveCfgTimer = null;
    function saveConfig() {
        if (_saveCfgTimer) return;
        _saveCfgTimer = setTimeout(() => {
            _saveCfgTimer = null;
            muliSpecialStorage.setItem(STORAGE_KEY, JSON.stringify(CONFIG));
        }, SAVE_DELAY);
    }
    function saveConfigNow() {
        clearTimeout(_saveCfgTimer);
        _saveCfgTimer = null;
        muliSpecialStorage.setItem(STORAGE_KEY, JSON.stringify(CONFIG));
    }

    // ================== 分组数据（v2：快照瘦身，旧 v1 不迁移） ==================
    // groups[]: {id,key,type('keyword'|'user'|'at'),firstTime,latestTime,firstTs,latestTs,
    //            count,unread,firstSender,messages:[{id,ts,time,userName,nickname,avatar,text,html}]}
    let groups = [];

    function loadGroups() {
        const saved = muliSpecialStorage.getItem(GROUPS_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed && parsed.v === GROUPS_V && Array.isArray(parsed.groups)) {
                    groups = parsed.groups;
                } else {
                    groups = [];   // v1 旧数据（或脏数据）不迁移
                }
            } catch (e) { console.error('[消息云] 加载历史数据失败', e); groups = []; }
        }
    }

    let _saveGrpTimer = null;
    function saveGroups() {
        if (_saveGrpTimer) return;
        _saveGrpTimer = setTimeout(() => {
            _saveGrpTimer = null;
            muliSpecialStorage.setItem(GROUPS_KEY, JSON.stringify({ v: GROUPS_V, groups }));
        }, SAVE_DELAY);
    }
    function saveGroupsNow() {
        clearTimeout(_saveGrpTimer);
        _saveGrpTimer = null;
        muliSpecialStorage.setItem(GROUPS_KEY, JSON.stringify({ v: GROUPS_V, groups }));
    }

    // TTL 自动清理
    function applyAutoClean() {
        if (!CONFIG.enableAutoClean) return;
        const before = groups.length;
        groups = cleanExpiredGroups(groups, Date.now(), CONFIG.autoCleanDays);
        if (groups.length !== before) {
            recalcUnread();
            saveGroups();
        }
    }

    // ================== 运行时状态 ==================
    let processedIds = new Set();          // 已处理消息 id（有界）
    let processedQueue = [];               // FIFO 队列，配合 Set 淘汰最旧
    let myInfo = { userName: '', nickname: '' };   // 自己（@我匹配 + isSelf 判定）
    let unreadTotal = 0;
    let isPanelOpen = false;
    let alertPulse = false;                // 仅实时新消息触发图标脉冲（补录/初始扫描不闪）
    let floatingIcon = null;
    let mainPanel = null;
    let currentDetailGroup = null;         // 当前展开详情的组（通知点击联动用）

    function addProcessed(id) {
        if (processedIds.has(id)) return false;
        processedIds.add(id);
        processedQueue.push(id);
        while (processedQueue.length > DEDUPE_CAP) {
            processedIds.delete(processedQueue.shift());
        }
        return true;
    }

    function genId() {
        return Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }

    function recalcUnread() {
        unreadTotal = groups.reduce((sum, g) => sum + (g.unread || 0), 0);
        updateUnreadBadge();
    }

    // ================== 消息管线 ==================
    // 统一消息形状（hub/DOM/补录三源归一）：
    //   {id,userName,nickname,isSelf,time,avatar,html,text,ts,type?}
    //   type 仅 API 源有（text/music/weather/redPacket/unavailable），DOM/hub 源靠 isCardHtml 识别

    function snapshotOf(msg) {
        return {
            id: msg.id,
            ts: msg.ts,
            time: msg.time,
            userName: msg.userName,
            nickname: msg.nickname,
            avatar: msg.avatar,
            text: capStr(msg.text, 500),
            html: capStr(msg.html, 3000)
        };
    }

    /**
     * 处理单条消息：去重 → 卡片过滤 → 匹配 → 合并/建组 → 提醒
     * opts.silent = true：静默建组（补录/初始扫描），不弹通知、不闪图标，仍计未读
     */
    function processMsg(msg, opts) {
        opts = opts || {};
        if (!msg || !msg.id || !addProcessed(msg.id)) return false;
        // 学习自己身份（isSelf 消息的作者就是自己）
        if (msg.isSelf && msg.userName && !myInfo.userName) {
            myInfo.userName = msg.userName;
            myInfo.nickname = msg.nickname || '';
            if (!CONFIG.myUserName) {
                CONFIG.myUserName = msg.userName;
                saveConfig();
            }
        }
        if (!CONFIG.enableMonitor) return false;
        if (CONFIG.ignoreCardMessages && (msg.type ? msg.type !== 'text' : isCardHtml(msg.html))) return false;

        const match = matchMessageCore(msg, CONFIG, myInfo.userName ? myInfo : { userName: CONFIG.myUserName, nickname: '' });
        if (!match) return false;

        const windowMs = CONFIG.mergeMinutes * 60000;
        const idx = findMergeGroupIndex(groups, match.key, match.type, msg.ts, windowMs);
        const snap = snapshotOf(msg);

        if (idx >= 0) {
            const g = groups[idx];
            g.count++;
            g.latestTime = snap.time;
            g.latestTs = snap.ts;
            g.messages.push(snap);
            if (g.messages.length > CONFIG.maxMessagesPerGroup) g.messages.shift();
            if (!isPanelOpen) {
                g.unread++;
                unreadTotal++;
            }
            saveGroups();
            scheduleRender();
        } else {
            const g = {
                id: genId(),
                key: match.key,
                type: match.type,
                firstTime: snap.time,
                latestTime: snap.time,
                firstTs: snap.ts,
                latestTs: snap.ts,
                count: 1,
                unread: isPanelOpen ? 0 : 1,
                firstSender: snap.nickname || snap.userName || '匿名',
                messages: [snap]
            };
            groups.unshift(g);
            if (!isPanelOpen) unreadTotal++;
            while (groups.length > CONFIG.maxGroups) {
                const removed = groups.pop();
                if (removed && removed.unread) unreadTotal = Math.max(0, unreadTotal - removed.unread);
            }
            saveGroups();
            scheduleRender();

            // 浏览器通知：仅新建组触发一次；静默模式（补录/初始扫描）不弹
            if (!opts.silent && CONFIG.enableNotification && !isPanelOpen) {
                notifyGroup(g, snap);
            }
        }

        if (!opts.silent && !isPanelOpen) {
            alertPulse = true;
            updateUnreadBadge();
        }
        return true;
    }

    // ================== 浏览器通知（点击展开面板+对应组详情） ==================
    function notifyGroup(group, snap) {
        if (typeof GM_notification === 'undefined') return;
        try {
            const title = group.type === 'user' ? `👤 关注人: ${group.key}`
                : group.type === 'at' ? `📣 有人 @我`
                    : `🔑 关键词: ${group.key}`;
            const body = `${snap.nickname || snap.userName}: ${String(snap.text || '').slice(0, 80)}`;
            GM_notification({
                title, text: body, timeout: 5000,
                onclick: () => {
                    try { window.focus(); } catch (e) { }
                    openPanel();
                    const g = groups.find(x => x.id === group.id);
                    if (g) showGroupDetail(g);
                }
            });
        } catch (e) { }
    }

    // ================== 消息监听（hub 总线优先 + 自开兜底） ==================
    const Watcher = (() => {
        let mode = 'self';              // 'self' | 'hub'
        let observer = null;
        let pending = new Set();
        let scheduled = false;
        let lastHubTs = 0;

        // 新版消息 DOM：article.fp-msg#chatroom<id>，气泡 .fp-bubble
        function extractPayload(article) {
            const rawId = article.id || '';
            const id = rawId.startsWith('chatroom') ? rawId.slice(8) : '';
            const avatarLink = article.querySelector('a.fp-avatar-frame');
            let userName = '';
            if (avatarLink) {
                userName = avatarLink.getAttribute('data-user-card') || '';
                if (!userName) {
                    const href = avatarLink.getAttribute('href') || '';
                    const mm = href.match(/\/member\/([^/?#]+)/);
                    if (mm) userName = decodeURIComponent(mm[1]);
                }
            }
            const nameEl = article.querySelector('.chat-author-name');
            const img = article.querySelector('img.fp-avatar');
            const t = article.querySelector('.foot time');
            const bubble = article.querySelector('.fp-bubble');
            return {
                id, userName,
                nickname: nameEl ? nameEl.textContent.trim() : '',
                isSelf: article.classList.contains('is-self'),
                time: t ? t.textContent.trim() : '',
                avatar: img ? img.src : '',
                html: bubble ? bubble.innerHTML : '',
                text: bubble ? bubble.textContent : '',
                ts: Date.now()
            };
        }

        function collectFromNodes(nodes) {
            const msgs = [];
            const seen = new Set();
            for (const node of nodes) {
                if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
                const arts = [];
                if (node.matches && node.matches('article.fp-msg')) arts.push(node);
                if (node.querySelectorAll) arts.push(...node.querySelectorAll('article.fp-msg'));
                for (const a of arts) {
                    if (seen.has(a)) continue;
                    seen.add(a);
                    const p = extractPayload(a);
                    if (p.id) msgs.push(p);
                }
            }
            return msgs;
        }

        function flush() {
            scheduled = false;
            const nodes = Array.from(pending);
            pending.clear();
            if (nodes.length === 0) return;
            const msgs = collectFromNodes(nodes);
            if (msgs.length) handleMsgBatch(msgs);
        }
        function schedule(node) {
            pending.add(node);
            if (!scheduled) {
                scheduled = true;
                requestAnimationFrame(flush);
            }
        }
        function startSelf() {
            if (observer) return;
            observer = new MutationObserver(mutations => {
                for (const m of mutations) {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) schedule(node);
                    });
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
        function stopSelf() {
            if (observer) { observer.disconnect(); observer = null; }
        }

        // hub 事件（detail 为纯 JSON 字段，跨沙箱安全）
        window.addEventListener(HUB_HELLO_EVENT, () => {
            lastHubTs = Date.now();
            if (mode !== 'hub') { mode = 'hub'; stopSelf(); updateModeBadge(); }
        });
        window.addEventListener(HUB_BEAT_EVENT, () => { lastHubTs = Date.now(); });
        window.addEventListener(HUB_MSG_EVENT, (e) => {
            lastHubTs = Date.now();
            if (mode !== 'hub') { mode = 'hub'; stopSelf(); updateModeBadge(); }
            try {
                const msgs = (e && e.detail) || [];
                if (Array.isArray(msgs) && msgs.length) {
                    handleMsgBatch(msgs.map(m => Object.assign({}, m, { ts: m.ts || Date.now() })));
                }
            } catch (err) { console.warn('[消息云] hub 消息处理异常:', err); }
        });

        // hub 掉线看护：15s 静默（含心跳）回退自开
        setInterval(() => {
            if (mode === 'hub' && Date.now() - lastHubTs > HUB_SILENCE) {
                mode = 'self';
                startSelf();
                updateModeBadge();
            }
        }, 5000);

        return {
            boot() { startSelf(); },    // 默认自开：单装即用，不等任何 hub
            currentMode() { return mode; },
            // 初始补扫现存 DOM（静默：不弹通知、不闪图标，修复旧版初始扫描误弹通知）
            scanNow(silent) {
                const arts = document.querySelectorAll('article.fp-msg');
                const msgs = collectFromNodes(Array.from(arts));
                if (msgs.length) handleMsgBatch(msgs, { silent: silent !== false });
            }
        };
    })();

    function handleMsgBatch(msgs, opts) {
        for (const m of msgs) {
            processMsg(m, opts);
        }
        updateUnreadBadge();
    }

    // ================== 启动补录（游标 API 拉最近 N 条错过消息） ==================
    // 只用 peek 的 token（零网络等 token，拿不到就跳过），绝不为补录触发 refresh
    let backfillDone = false;
    async function backfill() {
        const n = CONFIG.historyBackfill;
        if (!n || n <= 0 || backfillDone) return;
        backfillDone = true;
        let token = TokenStore.peek();
        for (let i = 0; !token && i < 30; i++) {
            await sleep(1000);
            token = TokenStore.peek();
        }
        if (!token) return;   // 无 token 静默放弃（补录是锦上添花）
        try {
            let remain = Math.min(n, 200);
            let before = '';
            let captured = 0;
            while (remain > 0) {
                const size = Math.min(remain, 50);
                const qs = `size=${size}` + (before ? `&before=${encodeURIComponent(before)}` : '');
                const rsp = await fetch(API_BASE + `/api/v3/chat/messages?${qs}`, {
                    headers: { 'Authorization': 'Bearer ' + token }, credentials: 'include'
                });
                const j = await rsp.json().catch(() => null);
                if (!j || j.code !== 0 || !j.data || !Array.isArray(j.data.list) || !j.data.list.length) break;
                const list = j.data.list.map(mapApiMsg).filter(Boolean);
                // 游标列表按 id 升序，逐页往前翻；id 去重防补录/实时交叉重复
                for (const m of list) {
                    if (processMsg(m, { silent: true })) captured++;
                }
                remain -= size;
                before = j.data.nextBefore || '';
                if (!j.data.hasMore || !before) break;
            }
            if (captured > 0) toast(`☁️ 补录到 ${captured} 条匹配消息`);
            if (captured >= 0) { recalcUnread(); scheduleRender(true); }
        } catch (e) {
            console.warn('[消息云] 启动补录失败:', e);
        }
    }

    // API 消息对象 → 统一消息形状（content=原始 md / contentHtml=渲染 HTML，卡片类型另给 card）
    function mapApiMsg(raw) {
        if (!raw || !raw.id) return null;
        const a = raw.author || {};
        const isText = raw.type === 'text';
        const html = isText ? String(raw.contentHtml || '') : '';
        let text = '';
        if (isText) {
            text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || String(raw.content || '');
        } else if (raw.card) {
            // 卡片消息合成可匹配文本（ignoreCardMessages 开启时整条会被过滤，仅兑底）
            const c = raw.card;
            if (raw.type === 'redPacket') text = `红包 ${c.type || ''} ${c.message || ''}`;
            else if (raw.type === 'music') text = `音乐 ${c.title || ''}`;
            else if (raw.type === 'weather') text = '天气';
        }
        return {
            id: String(raw.id),
            userName: String(a.userName || ''),
            nickname: String(a.userNickname || ''),
            isSelf: !!(myInfo.userName && a.userName === myInfo.userName),
            time: formatTime(raw.createdAt || Date.now()),
            avatar: String(a.userAvatarURL || ''),
            html: html || (isText ? '' : `[${raw.type === 'music' ? '音乐分享' : raw.type === 'weather' ? '天气信息' : raw.type === 'redPacket' ? '红包卡片' : '卡片消息'}]`),
            text,
            ts: Number(raw.createdAt) || Date.now(),
            type: String(raw.type || 'text')
        };
    }

    // ================== 上下文 API（前后 5 条 + 游标续拉） ==================
    async function fetchContext(msgId) {
        const rsp = await apiReq(`/api/v3/chat/messages/${encodeURIComponent(msgId)}/context?radius=5`);
        const j = await rsp.json().catch(() => null);
        if (!j || j.code !== 0 || !j.data || !Array.isArray(j.data.list)) throw new Error('上下文获取失败');
        return {
            anchorId: String(j.data.anchorId || msgId),
            list: j.data.list.map(mapApiMsg).filter(Boolean),
            hasMoreBefore: !!j.data.hasMoreBefore,
            hasMoreAfter: !!j.data.hasMoreAfter,
            nextBefore: j.data.nextBefore ? String(j.data.nextBefore) : '',
            nextAfter: j.data.nextAfter ? String(j.data.nextAfter) : ''
        };
    }

    async function fetchAround(msgId, direction) {
        // direction: 'before' 加载更早 | 'after' 加载更新
        const qs = `size=20&${direction}=${encodeURIComponent(msgId)}`;
        const rsp = await apiReq(`/api/v3/chat/messages?${qs}`);
        const j = await rsp.json().catch(() => null);
        if (!j || j.code !== 0 || !j.data || !Array.isArray(j.data.list)) throw new Error('加载失败');
        return {
            list: j.data.list.map(mapApiMsg).filter(Boolean),
            hasMore: !!j.data.hasMore,
            nextBefore: j.data.nextBefore ? String(j.data.nextBefore) : '',
            nextAfter: j.data.nextAfter ? String(j.data.nextAfter) : ''
        };
    }

    // ================== 编辑器工具（引用兜底用，同聊天室增强） ==================
    function getEditorEl() {
        return document.querySelector('.vditor-ir .vditor-reset[contenteditable="true"]')
            || document.querySelector('.vditor-wysiwyg .vditor-reset[contenteditable="true"]')
            || document.querySelector('.vditor-sv .vditor-reset[contenteditable="true"]');
    }

    function insertToEditor(text) {
        const ed = getEditorEl();
        if (!ed) return false;
        ed.focus();
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && ed.contains(sel.anchorNode)) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            const node = document.createTextNode(text);
            range.insertNode(node);
            range.setStartAfter(node);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        } else {
            ed.textContent = (ed.textContent || '') + text;
        }
        ed.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    // ================== 原消息定位 / 引用 ==================
    function findLiveMsgEl(msgId) {
        return document.getElementById('chatroom' + msgId);
    }

    // N4 跳转原消息：在 DOM 就滚动定位+闪烁动画，不在则温和提示
    function jumpToMessage(msgId) {
        const el = findLiveMsgEl(msgId);
        if (!el) { toast('原消息已不在聊天区域'); return; }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove(NS + 'flash');
        void el.offsetWidth;   // 重启动画
        el.classList.add(NS + 'flash');
        setTimeout(() => el.classList.remove(NS + 'flash'), 2400);
    }

    // N5 一键引用：DOM 存活触发原生引用按钮（格式最准），否则 md 引用块置入输入框
    function quoteMessage(msg) {
        const el = findLiveMsgEl(msg.id);
        if (el) {
            const btn = el.querySelector('button[title="引用消息"]');
            if (btn) { btn.click(); toast('已引用'); return; }
        }
        const name = msg.nickname || msg.userName || '匿名';
        const text = String(msg.text || '').slice(0, 200);
        const quote = `> **${name}**：${text}\n\n`;
        if (insertToEditor(quote)) toast('已引用');
        else toast('未找到输入框');
    }

    // ================== UI：样式（主题变量随深浅色切换） ==================
    function injectStyles() {
        addStyle(`
/* ---- 主题变量映射（跟随新 UI data-theme 深浅色自动切换） ---- */
:root {
  --${NS}card: var(--fp-card, #fff);
  --${NS}elevated: var(--fp-elevated, #fff);
  --${NS}text: var(--fp-text, #333);
  --${NS}text2: var(--fp-title, #868e96);
  --${NS}border: var(--fp-border, #e4e6eb);
  --${NS}subtle: var(--fp-surface-subtle, rgba(128, 128, 140, 0.08));
  --${NS}accent: #3498db;
  --${NS}danger: #ff4757;
}

/* ---------- 轻提示 ---------- */
#${NS}toast {
  position: fixed; left: 50%; top: 64px; transform: translateX(-50%) translateY(-8px);
  background: rgba(30, 32, 40, 0.92); color: #fff; padding: 8px 18px; border-radius: 8px;
  font-size: 13px; z-index: 10050; opacity: 0; pointer-events: none;
  transition: opacity .25s ease, transform .25s ease; max-width: 70vw;
}
#${NS}toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* ---------- 浮动图标 ---------- */
#${NS}icon {
  position: fixed; bottom: 120px; right: 30px; width: 58px; height: 58px;
  background: #3498db; border-radius: 50%; cursor: move;
  z-index: 10000; display: flex; align-items: center; justify-content: center;
  font-size: 32px; color: #fff; user-select: none; border: 2px solid var(--${NS}card, #fff);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3); transition: transform .15s ease, box-shadow .15s ease;
}
#${NS}icon:hover { transform: scale(1.06); }
#${NS}icon.${NS}pulse {
  animation: ${NS}iconPulse 1.2s ease-in-out infinite;
}
@keyframes ${NS}iconPulse {
  0%, 100% { box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3), 0 0 0 0 rgba(255, 71, 87, 0.55); }
  50% { box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3), 0 0 0 14px rgba(255, 71, 87, 0); }
}
#${NS}badge {
  position: absolute; top: -5px; right: -5px; background: #ff4757;
  color: #fff; border-radius: 20px; padding: 2px 6px; font-size: 12px; font-weight: bold;
  min-width: 18px; text-align: center; line-height: 1.4;
}

/* ---------- 主面板 ---------- */
#${NS}panel {
  position: fixed; top: 80px; right: 20px; width: 420px; max-height: 70vh;
  background: var(--${NS}card); border: 1px solid var(--${NS}border);
  border-radius: 16px; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
  z-index: 10001; display: flex; flex-direction: column; overflow: hidden;
  font-family: system-ui, -apple-system, sans-serif; color: var(--${NS}text);
  animation: ${NS}pop .16s ease-out;
}
@keyframes ${NS}pop {
  from { opacity: 0; transform: scale(.96) translateY(8px); }
  to { opacity: 1; transform: none; }
}
#${NS}panel-header {
  background: var(--${NS}subtle); color: var(--${NS}text); padding: 10px 15px;
  display: flex; justify-content: space-between; align-items: center; cursor: move;
  border-bottom: 1px solid var(--${NS}border); font-weight: 600;
}
#${NS}panel-header .${NS}hbtns { display: flex; gap: 8px; }
#${NS}panel-header button {
  background: none; border: none; font-size: 16px; cursor: pointer; color: var(--${NS}text2);
  padding: 2px 4px; border-radius: 6px; transition: background .15s ease, transform .15s ease;
}
#${NS}panel-header button:hover { background: var(--${NS}subtle); transform: scale(1.12); }
#${NS}list { flex: 1; overflow-y: auto; padding: 10px; background: var(--${NS}subtle); }
#${NS}panel-foot {
  padding: 6px 12px; background: var(--${NS}card); font-size: 12px; color: var(--${NS}text2);
  display: flex; justify-content: space-between; border-top: 1px solid var(--${NS}border);
}

/* ---------- 组卡片 ---------- */
.${NS}group {
  background: var(--${NS}card); margin-bottom: 10px; border-radius: 12px; overflow: hidden;
  border: 1px solid var(--${NS}border); cursor: pointer; position: relative;
  transition: transform .15s ease, box-shadow .15s ease;
}
.${NS}group:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12); }
.${NS}group.${NS}unread { background: var(--${NS}elevated); }
.${NS}group.${NS}unread::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  background: #f39c12;
}
.${NS}group-head {
  padding: 10px 12px 4px 12px; display: flex; justify-content: space-between; align-items: center;
}
.${NS}group-meta { font-size: 12px; color: var(--${NS}text2); }
.${NS}group-title { font-weight: 500; margin-top: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.${NS}count {
  background: var(--${NS}subtle); border-radius: 30px; padding: 0 8px; font-size: 12px; color: var(--${NS}text2);
}
.${NS}del {
  background: none; border: none; font-size: 16px; cursor: pointer; color: var(--${NS}text2);
  padding: 0 6px; border-radius: 6px; transition: background .15s ease, color .15s ease;
}
.${NS}del:hover { background: rgba(255, 71, 87, 0.12); color: #ff4757; }

/* ---------- 三层弹层（详情/上下文/配置共用底） ---------- */
.${NS}modal {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.6); z-index: 20000;
  display: flex; align-items: center; justify-content: center;
  animation: ${NS}fade .16s ease-out;
  backdrop-filter: blur(2px);
}
@keyframes ${NS}fade { from { opacity: 0; } to { opacity: 1; } }
.${NS}card-box {
  background: var(--${NS}card); color: var(--${NS}text); width: 700px; max-width: 92vw;
  max-height: 82vh; border-radius: 20px; overflow: auto; padding: 20px;
  animation: ${NS}pop .18s ease-out; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
}
.${NS}modal h3 { margin-top: 0; display: flex; align-items: center; gap: 8px; }

/* ---------- 消息气泡（复刻系统消息观感：--fp-hover 底/描边/非对称圆角/底部内阴影，自消息 --fp-self 绿底） ---------- */
.${NS}msg-row {
  display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px;
  border-radius: 12px; margin-bottom: 8px;
  transition: background .15s ease, transform .15s ease;
  animation: ${NS}itemIn .28s ease-out backwards;
  animation-delay: calc(var(--i, 0) * 20ms);
}
.${NS}msg-row:hover { background: var(--${NS}subtle); transform: translateY(-1px); }
.${NS}msg-row.${NS}self { flex-direction: row-reverse; }
@keyframes ${NS}itemIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
/* 头像框（系统 fp-avatar-frame 观感：圆角方框） */
.${NS}avatar-frame {
  flex: none; padding: 2px; border-radius: 11px;
  border: 1px solid var(--${NS}border); background: var(--${NS}subtle);
}
.${NS}msg-avatar {
  display: block; width: 34px; height: 34px; border-radius: 8px; object-fit: cover;
  background: var(--${NS}subtle);
}
.${NS}msg-main { flex: 1; min-width: 0; }
.${NS}msg-row.${NS}self .${NS}msg-main { display: flex; flex-direction: column; align-items: flex-end; }
.${NS}msg-meta { font-size: 12px; color: var(--fp-muted, var(--${NS}text2)); margin-bottom: 4px; }
/* 系统气泡：--fp-hover 底 + 描边 + 非对称圆角（发送侧 5px）+ 底部内阴影 */
.${NS}bubble {
  max-width: 100%; background: var(--fp-hover, rgba(128, 128, 140, 0.10));
  border: 1px solid color-mix(in srgb, var(--fp-muted, #868e96) 35%, transparent);
  border-radius: 5px 14px 14px; padding: 8px 12px;
  font-size: 13px; line-height: 1.7; overflow-wrap: anywhere;
  box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--fp-muted, #868e96) 20%, transparent);
}
.${NS}msg-row.${NS}self .${NS}bubble {
  background: var(--fp-self, #2f5d55);
  border-radius: 14px 5px 14px 14px;
}
.${NS}bubble img { max-width: 200px; border-radius: 8px; vertical-align: middle; }
.${NS}bubble .${NS}card-msg { color: var(--${NS}text2); font-style: italic; }
.${NS}msg-actions { margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap; }
.${NS}msg-row.${NS}self .${NS}msg-actions { justify-content: flex-end; }

/* 上下文锚点高亮 */
.${NS}msg-row.${NS}anchor {
  background: rgba(52, 152, 219, 0.1);
  box-shadow: 0 0 0 2px #3498db inset;
}
.${NS}msg-row.${NS}anchor .${NS}bubble {
  animation: ${NS}ring 2s ease-in-out infinite;
}
@keyframes ${NS}ring {
  0%, 100% { box-shadow: 0 0 0 0 rgba(52, 152, 219, 0.35); }
  50% { box-shadow: 0 0 0 6px rgba(52, 152, 219, 0); }
}

/* 按钮（药丸型） */
.${NS}btn {
  background: var(--${NS}subtle); border: none; border-radius: 30px; padding: 4px 14px;
  cursor: pointer; font-size: 12px; color: var(--${NS}text); transition: background .15s ease, transform .15s ease;
}
.${NS}btn:hover { background: rgba(52, 152, 219, 0.18); transform: scale(1.05); }
.${NS}btn.${NS}primary { background: #3498db; color: #fff; }
.${NS}btn.${NS}primary:hover { background: #2980b9; }
.${NS}btn:disabled { opacity: .5; cursor: default; transform: none; }

/* 跳转闪烁定位 */
#${NS}flash, .${NS}flash {
  animation: ${NS}flashAni 0.8s ease-in-out 3;
}
@keyframes ${NS}flashAni {
  0%, 100% { background: transparent; }
  50% { background: rgba(241, 196, 15, 0.45); }
}

/* ---------- 配置表单 ---------- */
.${NS}form label { display: block; margin: 10px 0 4px; font-size: 13px; color: var(--${NS}text2); }
.${NS}form input[type=text], .${NS}form input[type=number], .${NS}form textarea {
  width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--${NS}border);
  border-radius: 8px; background: var(--${NS}card); color: var(--${NS}text); font-size: 13px;
}
.${NS}form .${NS}check-line { display: flex; align-items: center; gap: 6px; margin: 8px 0; font-size: 13px; }
.${NS}form .${NS}inline { display: flex; align-items: center; gap: 8px; }
.${NS}form .${NS}inline input[type=number] { width: 70px; }
.${NS}form-foot { margin-top: 20px; text-align: right; display: flex; gap: 10px; justify-content: flex-end; }

@media (prefers-reduced-motion: reduce) {
  .${NS}group, .${NS}msg-row, .${NS}modal, .${NS}card-box, #${NS}panel, #${NS}icon,
  .${NS}bubble, #${NS}flash, .${NS}flash { animation: none !important; transition: none !important; }
}
`);
    }

    // ================== UI：浮动图标 ==================
    function createFloatingIcon() {
        const icon = document.createElement('div');
        icon.id = NS + 'icon';
        icon.innerHTML = '☁️';
        const badge = document.createElement('span');
        badge.id = NS + 'badge';
        badge.textContent = '0';
        icon.appendChild(badge);
        document.body.appendChild(icon);
        makeDraggable(icon);
        icon.addEventListener('click', () => {
            if (isDragging) return;
            toggleMainPanel();
        });
        return icon;
    }

    // 图标拖拽（拖拽后防误触点击，同旧版）
    let isDragging = false;
    function makeDraggable(el) {
        let dragStartX = 0, dragStartY = 0;
        let dragStarted = false;
        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = false;
            dragStarted = false;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            const onMouseMove = (moveEvent) => {
                const dx = Math.abs(moveEvent.clientX - dragStartX);
                const dy = Math.abs(moveEvent.clientY - dragStartY);
                if (dx > 5 || dy > 5) {
                    dragStarted = true;
                    isDragging = true;
                }
                if (dragStarted) {
                    let left = moveEvent.clientX - el.offsetWidth / 2;
                    let top = moveEvent.clientY - el.offsetHeight / 2;
                    left = Math.min(window.innerWidth - el.offsetWidth, Math.max(0, left));
                    top = Math.min(window.innerHeight - el.offsetHeight, Math.max(0, top));
                    el.style.left = left + 'px';
                    el.style.top = top + 'px';
                    el.style.right = 'auto';
                    el.style.bottom = 'auto';
                }
            };
            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                setTimeout(() => { isDragging = false; }, 50);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });
    }

    // ================== UI：未读角标 ==================
    function updateUnreadBadge() {
        const badge = document.getElementById(NS + 'badge');
        if (badge) badge.textContent = unreadTotal > 0 ? String(unreadTotal) : '';
        const icon = document.getElementById(NS + 'icon');
        if (icon) {
            if (unreadTotal > 0 && !isPanelOpen && alertPulse) icon.classList.add(NS + 'pulse');
            else icon.classList.remove(NS + 'pulse');
        }
    }

    function updateModeBadge() {
        const el = document.getElementById(NS + 'mode');
        if (!el) return;
        const mode = Watcher.currentMode();
        el.textContent = mode === 'hub' ? '总线共用' : '独立监听';
        el.title = mode === 'hub' ? '与聊天室增强共用消息监听' : '未检测到消息总线，独立监听中';
    }

    // ================== UI：主面板 ==================
    // 渲染节流：消息驱动的重绘 300ms 合并一次；面板打开/用户操作即时渲染
    let _renderTimer = null;
    function scheduleRender(immediate) {
        if (!mainPanel) return;
        if (immediate) { clearTimeout(_renderTimer); _renderTimer = null; renderGroupList(); return; }
        if (_renderTimer) return;
        _renderTimer = setTimeout(() => {
            _renderTimer = null;
            renderGroupList();
        }, RENDER_DELAY);
    }

    function groupTitleHtml(g) {
        if (g.type === 'user') return `👤 关注人 <b>${escapeHtml(g.key)}</b> 发言`;
        if (g.type === 'at') return `📣 有人 <b>@我</b>`;
        return `🔑 提到「<b>${escapeHtml(g.key)}</b>」`;
    }

    function renderGroupList(animate) {
        const container = document.getElementById(NS + 'list');
        if (!container) return;
        const footCount = document.getElementById(NS + 'count');
        if (footCount) footCount.textContent = `共 ${groups.length} 组`;
        if (groups.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:var(--${NS}text2); padding:40px;">暂无匹配消息<br>设置关键词或指定用户后自动捕获</div>`;
            return;
        }
        container.innerHTML = '';
        groups.forEach((group, i) => {
            const div = document.createElement('div');
            div.className = NS + 'group' + (group.unread > 0 ? ' ' + NS + 'unread' : '');
            if (animate) {
                div.style.animation = `${NS}itemIn .28s ease-out backwards`;
                div.style.animationDelay = (i * 20) + 'ms';
            }
            const displayTime = (group.firstTime || '').slice(0, 16);
            div.innerHTML = `
                <div class="${NS}group-head">
                    <div>
                        <div class="${NS}group-meta">${escapeHtml(displayTime)} · ${escapeHtml(group.firstSender || '')}</div>
                        <div class="${NS}group-title">
                            ${groupTitleHtml(group)}
                            ${group.count > 1 ? `<span class="${NS}count">${group.count}次</span>` : ''}
                        </div>
                    </div>
                    <button class="${NS}del" title="删除该组">✕</button>
                </div>`;
            const delBtn = div.querySelector('.' + NS + 'del');
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = groups.findIndex(g => g.id === group.id);
                if (idx !== -1) {
                    if (groups[idx].unread) unreadTotal = Math.max(0, unreadTotal - groups[idx].unread);
                    groups.splice(idx, 1);
                    saveGroups();
                    renderGroupList();
                    updateUnreadBadge();
                }
            });
            div.addEventListener('click', () => {
                // 清除该组未读
                group.unread = 0;
                recalcUnread();
                saveGroups();
                renderGroupList();
                showGroupDetail(group);
            });
            container.appendChild(div);
        });
    }

    function openPanel() {
        if (!mainPanel) buildMainPanel();
    }

    function buildMainPanel() {
        if (mainPanel) mainPanel.remove();
        const panel = document.createElement('div');
        panel.id = NS + 'panel';
        panel.innerHTML = `
            <div id="${NS}panel-header">
                <span>☁️ 消息云 · 监听面板</span>
                <div class="${NS}hbtns">
                    <button id="${NS}pause-btn" title="暂停/恢复">⏸️</button>
                    <button id="${NS}config-btn" title="设置">⚙️</button>
                    <button id="${NS}clear-btn" title="一键清空">🗑️</button>
                    <button id="${NS}close-btn" title="关闭">✕</button>
                </div>
            </div>
            <div id="${NS}list"></div>
            <div id="${NS}panel-foot">
                <span id="${NS}status">监听中</span>
                <span><span id="${NS}mode">独立监听</span> · <span id="${NS}count">共 0 组</span></span>
            </div>`;
        document.body.appendChild(panel);
        mainPanel = panel;
        isPanelOpen = true;
        alertPulse = false;

        makePanelDraggable(panel, panel.querySelector('#' + NS + 'panel-header'));
        panel.querySelector('#' + NS + 'close-btn').addEventListener('click', () => toggleMainPanel());
        panel.querySelector('#' + NS + 'config-btn').addEventListener('click', () => showConfigDialog());
        panel.querySelector('#' + NS + 'clear-btn').addEventListener('click', () => {
            groups = [];
            unreadTotal = 0;
            saveGroups();
            renderGroupList();
            updateUnreadBadge();
            toast('已清空全部记录');
        });
        const pauseBtn = panel.querySelector('#' + NS + 'pause-btn');
        const statusEl = panel.querySelector('#' + NS + 'status');
        const syncPauseUi = () => {
            pauseBtn.textContent = CONFIG.enableMonitor ? '⏸️' : '▶️';
            statusEl.textContent = CONFIG.enableMonitor ? '监听中' : '已暂停';
        };
        pauseBtn.addEventListener('click', () => {
            CONFIG.enableMonitor = !CONFIG.enableMonitor;
            saveConfig();
            syncPauseUi();
        });
        syncPauseUi();
        updateModeBadge();
        renderGroupList(true);
        updateUnreadBadge();
    }

    // 面板拖拽（头部移动整个面板，同旧版）
    function makePanelDraggable(panel, handle) {
        let dragging = false;
        let dragStartX = 0, dragStartY = 0;
        let panelStartLeft = 0, panelStartTop = 0;
        handle.style.cursor = 'move';
        handle.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            dragging = false;
            const rect = panel.getBoundingClientRect();
            panelStartLeft = rect.left;
            panelStartTop = rect.top;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            const onMouseMove = (moveEvent) => {
                const dx = moveEvent.clientX - dragStartX;
                const dy = moveEvent.clientY - dragStartY;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragging = true;
                if (dragging) {
                    let newLeft = panelStartLeft + dx;
                    let newTop = panelStartTop + dy;
                    newLeft = Math.min(window.innerWidth - panel.offsetWidth, Math.max(0, newLeft));
                    newTop = Math.min(window.innerHeight - panel.offsetHeight, Math.max(0, newTop));
                    panel.style.left = newLeft + 'px';
                    panel.style.top = newTop + 'px';
                    panel.style.right = 'auto';
                }
            };
            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });
    }

    function toggleMainPanel() {
        if (!mainPanel) {
            buildMainPanel();
        } else {
            mainPanel.remove();
            mainPanel = null;
            isPanelOpen = false;
            // 关闭面板 = 全部已读（沿用旧版语义）
            if (unreadTotal > 0) {
                groups.forEach(g => g.unread = 0);
                recalcUnread();
                saveGroups();
            }
            alertPulse = false;
            updateUnreadBadge();
        }
    }

    // ================== UI：组详情（二级，脚本自渲染气泡） ==================
    function modalShell(zIndex) {
        const modal = document.createElement('div');
        modal.className = NS + 'modal';
        if (zIndex) modal.style.zIndex = zIndex;
        const card = document.createElement('div');
        card.className = NS + 'card-box';
        modal.appendChild(card);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
        return { modal, card };
    }

    // 消息行渲染（详情/上下文共用）；opts: {index, anchor, onJump, onQuote, onContext}
    // 自己的消息靠右 + --fp-self 绿底气泡（复刻聊天室 is-self 观感）
    function renderMsgRow(msg, opts) {
        opts = opts || {};
        const row = document.createElement('div');
        const isSelf = !!msg.isSelf || !!(myInfo.userName && msg.userName === myInfo.userName);
        row.className = NS + 'msg-row'
            + (isSelf ? ' ' + NS + 'self' : '')
            + (opts.anchor ? ' ' + NS + 'anchor' : '');
        row.style.setProperty('--i', String(opts.index || 0));
        const avatar = `<div class="${NS}avatar-frame">` + (msg.avatar
            ? `<img class="${NS}msg-avatar" src="${escapeHtml(msg.avatar)}" alt="">`
            : `<div class="${NS}msg-avatar"></div>`) + `</div>`;
        const body = msg.html
            ? `<div class="${NS}bubble">${msg.html}</div>`
            : `<div class="${NS}bubble"><span class="${NS}card-msg">${escapeHtml(msg.text || '（无文本内容）')}</span></div>`;
        const actions = [];
        if (opts.onContext) actions.push(`<button class="${NS}btn ${NS}ctx">📖 查看上下文</button>`);
        if (opts.onJump) actions.push(`<button class="${NS}btn ${NS}jump">📍 跳转原消息</button>`);
        if (opts.onQuote) actions.push(`<button class="${NS}btn ${NS}quote">💬 引用</button>`);
        row.innerHTML = `
            ${avatar}
            <div class="${NS}msg-main">
                <div class="${NS}msg-meta">${escapeHtml(msg.nickname || msg.userName || '匿名')} · ${escapeHtml(msg.time || '')}</div>
                ${body}
                ${actions.length ? `<div class="${NS}msg-actions">${actions.join('')}</div>` : ''}
            </div>`;
        const ctxBtn = row.querySelector('.' + NS + 'ctx');
        if (ctxBtn) ctxBtn.addEventListener('click', (e) => { e.stopPropagation(); opts.onContext(); });
        const jumpBtn = row.querySelector('.' + NS + 'jump');
        if (jumpBtn) jumpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllModals();          // 引用/跳转后关闭弹层，让位给聊天区/输入框
            opts.onJump();
        });
        const quoteBtn = row.querySelector('.' + NS + 'quote');
        if (quoteBtn) quoteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllModals();
            opts.onQuote();
        });
        return row;
    }

    // 关闭所有消息云弹层（详情/上下文/配置）
    function closeAllModals() {
        document.querySelectorAll('.' + NS + 'modal').forEach(m => m.remove());
    }

    function showGroupDetail(group) {
        currentDetailGroup = group;
        const { modal, card } = modalShell(20000);
        const typeLabel = group.type === 'user' ? '关注人' : group.type === 'at' ? '@我' : '关键词';
        card.innerHTML = `
            <h3>📋 ${typeLabel}：「${escapeHtml(group.key)}」 共${group.messages.length}条记录（累计${group.count}次）</h3>
            <div id="${NS}detail-list"></div>`;
        const list = card.querySelector('#' + NS + 'detail-list');
        // 按时间倒序（最新在前），错落进场动画
        [...group.messages].reverse().forEach((msg, i) => {
            list.appendChild(renderMsgRow(msg, {
                index: i,
                onContext: () => showContextModal(msg.id),
                onJump: () => jumpToMessage(msg.id),
                onQuote: () => quoteMessage(msg)
            }));
        });
    }

    // ================== UI：上下文（API 前后 5 条 + 加载更早/更新） ==================
    async function showContextModal(msgId) {
        const { modal, card } = modalShell(30000);
        card.innerHTML = `
            <h3>📜 上下文消息（前后 5 条）</h3>
            <div id="${NS}ctx-toolbar" style="text-align:center; margin-bottom:8px;"></div>
            <div id="${NS}ctx-list"><div style="text-align:center; color:var(--${NS}text2); padding:24px;">加载中…</div></div>`;
        const toolbar = card.querySelector('#' + NS + 'ctx-toolbar');
        const listEl = card.querySelector('#' + NS + 'ctx-list');

        let ctx;
        try {
            ctx = await fetchContext(msgId);
        } catch (e) {
            listEl.innerHTML = `<div style="text-align:center; color:var(--${NS}text2); padding:24px;">上下文获取失败：${escapeHtml(e.message || '')}</div>`;
            return;
        }
        let cursorBefore = ctx.nextBefore;
        let cursorAfter = ctx.nextAfter;
        let hasBefore = ctx.hasMoreBefore && !!cursorBefore;
        let hasAfter = ctx.hasMoreAfter && !!cursorAfter;

        function renderRows(list, opts) {
            opts = opts || {};
            const frag = document.createDocumentFragment();
            list.forEach((msg, i) => {
                frag.appendChild(renderMsgRow(msg, {
                    index: opts.animate ? i : 0,
                    anchor: msg.id === ctx.anchorId,
                    onJump: () => jumpToMessage(msg.id),
                    onQuote: () => quoteMessage(msg)
                }));
            });
            return frag;
        }

        function syncToolbar() {
            toolbar.innerHTML = '';
            if (hasBefore) {
                const btn = document.createElement('button');
                btn.className = NS + 'btn';
                btn.textContent = '⬆️ 加载更早';
                btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    btn.textContent = '加载中…';
                    try {
                        const r = await fetchAround(cursorBefore, 'before');
                        listEl.insertBefore(renderRows(r.list), listEl.firstChild);
                        hasBefore = r.hasMore && !!r.nextBefore;
                        cursorBefore = r.nextBefore;
                    } catch (e) { toast('加载失败'); }
                    syncToolbar();
                });
                toolbar.appendChild(btn);
            }
            if (hasAfter) {
                const btn = document.createElement('button');
                btn.className = NS + 'btn';
                btn.textContent = '⬇️ 加载更新';
                btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    btn.textContent = '加载中…';
                    try {
                        const r = await fetchAround(cursorAfter, 'after');
                        listEl.appendChild(renderRows(r.list));
                        hasAfter = r.hasMore && !!r.nextAfter;
                        cursorAfter = r.nextAfter;
                    } catch (e) { toast('加载失败'); }
                    syncToolbar();
                });
                toolbar.appendChild(btn);
            }
        }

        listEl.innerHTML = '';
        listEl.appendChild(renderRows(ctx.list, { animate: true }));
        syncToolbar();
    }

    // ================== UI：配置对话框 ==================
    function showConfigDialog() {
        const { modal, card } = modalShell(20000);
        card.style.width = '480px';
        card.innerHTML = `
            <h3>⚙️ 消息云配置</h3>
            <div class="${NS}form">
                <label>监听的关键词（逗号分隔）</label>
                <input type="text" id="${NS}cfg-keywords" value="${escapeHtml(CONFIG.keywords.join(','))}">
                <label>监听指定用户（填 昵称(用户名)/(用户名)/用户名，逗号分隔；取括号内用户名精确匹配）</label>
                <input type="text" id="${NS}cfg-users" value="${escapeHtml(CONFIG.users.join(','))}">
                <label>我的用户名（@我监听用，留空自动识别）</label>
                <input type="text" id="${NS}cfg-myname" value="${escapeHtml(CONFIG.myUserName)}" placeholder="留空自动识别">
                <div class="${NS}check-line"><input type="checkbox" id="${NS}cfg-monitor" ${CONFIG.enableMonitor ? 'checked' : ''}><label for="${NS}cfg-monitor" style="margin:0;">启用监听</label></div>
                <div class="${NS}check-line"><input type="checkbox" id="${NS}cfg-notify" ${CONFIG.enableNotification ? 'checked' : ''}><label for="${NS}cfg-notify" style="margin:0;">浏览器通知（新建组时提醒一次）</label></div>
                <div class="${NS}check-line"><input type="checkbox" id="${NS}cfg-at" ${CONFIG.enableAtMonitor ? 'checked' : ''}><label for="${NS}cfg-at" style="margin:0;">@我 监听</label></div>
                <div class="${NS}check-line"><input type="checkbox" id="${NS}cfg-ignore-cards" ${CONFIG.ignoreCardMessages ? 'checked' : ''}><label for="${NS}cfg-ignore-cards" style="margin:0;">忽略红包/音乐/天气卡片消息</label></div>
                <div class="${NS}check-line"><input type="checkbox" id="${NS}cfg-autoclean" ${CONFIG.enableAutoClean ? 'checked' : ''}><label for="${NS}cfg-autoclean" style="margin:0;">自动清理</label>
                    <span class="${NS}inline"><input type="number" id="${NS}cfg-autoclean-days" min="1" value="${CONFIG.autoCleanDays}"> 天前的记录</span></div>
                <label>合并窗口（分钟，同一关键词/用户此时间内多次触发合并为一组）</label>
                <div class="${NS}inline"><input type="number" id="${NS}cfg-merge" min="1" value="${CONFIG.mergeMinutes}"> 分钟</div>
                <label>启动补录条数（打开页面时补抓错过消息，0=关闭）</label>
                <div class="${NS}inline"><input type="number" id="${NS}cfg-backfill" min="0" value="${CONFIG.historyBackfill}"> 条</div>
                <div class="${NS}form-foot">
                    <button class="${NS}btn" id="${NS}cfg-cancel">取消</button>
                    <button class="${NS}btn ${NS}primary" id="${NS}cfg-save">保存</button>
                </div>
            </div>`;
        card.querySelector('#' + NS + 'cfg-cancel').addEventListener('click', () => modal.remove());
        card.querySelector('#' + NS + 'cfg-save').addEventListener('click', () => {
            CONFIG.keywords = normalizeList(card.querySelector('#' + NS + 'cfg-keywords').value);
            CONFIG.users = normalizeList(card.querySelector('#' + NS + 'cfg-users').value);
            CONFIG.myUserName = card.querySelector('#' + NS + 'cfg-myname').value.trim();
            if (CONFIG.myUserName) { myInfo.userName = CONFIG.myUserName; }
            CONFIG.enableMonitor = card.querySelector('#' + NS + 'cfg-monitor').checked;
            CONFIG.enableNotification = card.querySelector('#' + NS + 'cfg-notify').checked;
            CONFIG.enableAtMonitor = card.querySelector('#' + NS + 'cfg-at').checked;
            CONFIG.ignoreCardMessages = card.querySelector('#' + NS + 'cfg-ignore-cards').checked;
            CONFIG.enableAutoClean = card.querySelector('#' + NS + 'cfg-autoclean').checked;
            CONFIG.autoCleanDays = Math.max(1, parseInt(card.querySelector('#' + NS + 'cfg-autoclean-days').value, 10) || 7);
            CONFIG.mergeMinutes = Math.max(1, parseInt(card.querySelector('#' + NS + 'cfg-merge').value, 10) || 10);
            CONFIG.historyBackfill = Math.max(0, parseInt(card.querySelector('#' + NS + 'cfg-backfill').value, 10) || 0);
            saveConfigNow();
            applyAutoClean();
            if (mainPanel) {
                const pauseBtn = mainPanel.querySelector('#' + NS + 'pause-btn');
                const statusEl = mainPanel.querySelector('#' + NS + 'status');
                if (pauseBtn) pauseBtn.textContent = CONFIG.enableMonitor ? '⏸️' : '▶️';
                if (statusEl) statusEl.textContent = CONFIG.enableMonitor ? '监听中' : '已暂停';
            }
            scheduleRender(true);
            modal.remove();
            toast('配置已保存');
        });
    }

    // ================== 自己身份识别（DOM 兜底，is-self 消息也会学） ==================
    function learnMyUserFromDom() {
        if (myInfo.userName) return true;
        const selfArticle = document.querySelector('article.fp-msg.is-self');
        if (selfArticle) {
            const link = selfArticle.querySelector('a.fp-avatar-frame');
            if (link) {
                const u = link.getAttribute('data-user-card') || '';
                if (!u) {
                    const href = link.getAttribute('href') || '';
                    const mm = href.match(/\/member\/([^/?#]+)/);
                    if (mm) myInfo.userName = decodeURIComponent(mm[1]);
                } else myInfo.userName = u;
                const nameEl = selfArticle.querySelector('.chat-author-name');
                if (nameEl) myInfo.nickname = nameEl.textContent.trim();
                if (myInfo.userName && !CONFIG.myUserName) {
                    CONFIG.myUserName = myInfo.userName;
                    saveConfig();
                }
                return true;
            }
        }
        return false;
    }

    // ================== 初始化 ==================
    function init() {
        loadConfig();
        loadGroups();
        applyAutoClean();
        if (CONFIG.myUserName) myInfo.userName = CONFIG.myUserName;
        TokenStore.install();
        injectStyles();
        floatingIcon = createFloatingIcon();
        updateUnreadBadge();

        // DOM 就绪后启动监听 + 静默补扫
        const waitDom = setInterval(() => {
            if (document.body && document.querySelector('.fp-bubble, article.fp-msg, .vditor-reset')) {
                clearInterval(waitDom);
                Watcher.boot();
                Watcher.scanNow(true);          // 静默：不弹通知、不闪图标（修复旧版初始扫描误弹通知）
                updateModeBadge();
                learnMyUserFromDom();
                // 启动补录（peek token，零 refresh；错过消息静默建组 + toast 汇报）
                backfill();
            }
        }, 500);
        // 自己身份识别多试几次（首屏可能还没有 is-self 消息）
        let learnTries = 0;
        const learnTimer = setInterval(() => {
            if (learnMyUserFromDom() || ++learnTries > 20) clearInterval(learnTimer);
        }, 2000);

        window.addEventListener('beforeunload', () => {
            try { saveConfigNow(); saveGroupsNow(); } catch (e) { }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
