// ==UserScript==
// @name         鱼排红包板块（新版）
// @namespace    https://fishpi.cn
// @license      MIT
// @version      2.0.1
// @description  新版聊天室红包板块：捕获/过滤/自动抢/提醒/浮窗，与聊天室增强共用消息监听（由 hongbao_module v1.4.4 重构）
// @author       muli
// @match        https://new.fishpi.cn/cr
// @icon         https://file.fishpi.cn/2025/11/blob-4d0e46ad.png?imageView2/1/w/48/h/48/interlace/0/q/100
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/mu-xiao-li/yupai-extend-js/main/fishpi_hongbao.user.js
// @updateURL    https://raw.githubusercontent.com/mu-xiao-li/yupai-extend-js/main/fishpi_hongbao.user.js
// ==/UserScript==
// 旧版（fishpi.cn/cr 旧聊天室）演进史见 hongbao_module.user.js（v1.0.0 ~ v1.4.4），旧文件冻结不动
// 2026-11-20 v2.0.1 UI 微调（消息云会话跨会话同步，仅样式层不动逻辑）：
//   配置面板弹层化：毛玻璃遮罩+点遮罩关闭、scale 入场动画、圆角 20px 对齐消息云弹层；按钮加按压反馈；prefers-reduced-motion 降级
// 2026-11-20 v2.0.1 二轮显示修复（UI 优化后回归问题）：
//   状态更新闪烁根治：updateCard 改就地修补（patchCard，只动角标/chip/克隆，绝不替换节点——
//   替换会重放进场动画引发闪烁）；卡片时间显示改 MM-DD HH:mm（悬浮看完整时间，便于找回红包）；
//   新增 API 消息定位弹窗（仿 fishpi_message_listening_plus 上下文追溯）：原消息不在聊天区时
//   调 GET /api/v3/chat/messages/{id}/context?radius=5 找回并展示前后文，附手动领取入口（猜拳自选出拳）
// 2026-11-20 v2.0.0 卡片显示优化：红包克隆恢复完整原样式（去掉缩放与高度裁剪，金额显示/底边框回归）；
//   状态/进度更新改单卡定点替换（updateCard），消除整列表重建闪烁；增删红包才走全量渲染
// 2026-11-20 v2.0.0 修复启动即被踢下线（"预热"事故复发，同 quick_functions-重构2 踩坑11）：
//   上一版 init 换 realtime-ticket 时 ensure() 抢跑 /auth/refresh，等价启动预热 → 轮换登录 Cookie → 踢下线。
//   改回"页面共享授权优先"（作者原话"页面的授权是共用的，不需要重新申请"）：钩子捕获/聊天室增强共享 token 复用，
//   refresh 兜底加 10s 启动保护期（页面完全就绪前绝不触发）；实时通道连接推迟到 token 可复用或保护期结束
// 2026-11-20 v2.0.0 首轮真机反馈修复（7 项）+ 全面 UI 重构：
//   修复红包状态永远不更新（严重）：应用的领取事件只作提示、不更新卡片 got/who，DOM 扫描读不到状态真值；
//   改为自订实时通道（POST /api/v3/chat/realtime-ticket → wss /api/v3/realtime，无侵入），
//   以 chat.red_packet.claimed 的 {packetId,got,count} 为状态真值，DOM 扫描降为兜底；
//   修正状态语义：opened 类=抢光（got≥count），不是"我打开过"（对齐线上 HongbaoCard 组件源码）
//   修复最小化小红包新红包不闪烁：提醒类名与 CSS 选择器不一致（hb2_alerting vs alerting），并改回可靠的 JS 翻转闪烁
//   修复板块初始化无"还没有红包消息"空态提示
//   新增板块最大高度配置（panelMaxHeight），展开/浮窗高度不再无限伸到屏幕高度
//   新增消息监听来源提示（hub 共用 / self 独立，面板头部徽章）
//   UI 重构：对齐聊天室增强视觉（主题变量 --fp-* 中性色随深浅色切换）、配置面板加宽 + 保存栏吸底
// 2026-11-20 v2.0.0 修复自动抢报 no-token：令牌改三级兜底——fetch+XHR 双钩子捕获 →
//   复用聊天室增强共享 token（fpcp:token 广播）→ 懒 refresh（仅在发请求前触发，不违反启动禁令）
// 2026-11-20 v2.0.0 重构适配新版聊天室（new.fishpi.cn/cr）：
//   消息捕获改走 fpcp 跨脚本消息总线（与聊天室增强共用监听，单装时自动降级自开监听）
//   红包解析改新版 DOM（.hongbao__item / aria-label 类型 / __money 数额），状态改类名+desc 文本识别
//   自动抢改 v3 领取接口 POST /api/v3/chat/red-packets/{id}/claims，抢前零查询（抢优先）
//   新增风险同意配置：勾选后心跳/猜拳自动抢不再弹确认（API 要求客户端不能替用户自动确认风险）
//   过滤改纯 CSS（aria-label 前缀匹配），抗 Vue 重渲染；砍掉每红包独立 MutationObserver
//   感谢文案旧关键字全保留，新增 {result}（胜负平）{gesture}（出拳）；小尾巴保留旧 md 引用格式
//   修复旧版遗留：applyConfig 变量引用错误、浮窗位置存 DOM 节点丢失；保存配置不再强制刷新页面

(function () {
    'use strict';

    // ================== 常量 ==================
    const VERSION_US = 'v2.0.1';
    const DOWNLOAD_URL = 'https://github.com/mu-xiao-li/yupai-extend-js/blob/main/fishpi_hongbao.user.js';
    const API_BASE = 'https://fishpi.cn';
    // client 签名沿用聊天室增强（用户实测可用；发消息仍带 Idempotency-Key）
    const CLIENT_US = 'Web/沐里爱红包';
    const CLIENT_TAG = CLIENT_US + VERSION_US;
    const NS = 'hb2_';                 // 样式/节点命名空间
    const HUB_MSG_EVENT = 'fpcp:chat-msg';
    const HUB_HELLO_EVENT = 'fpcp:hub-hello';
    const HUB_BEAT_EVENT = 'fpcp:hub-beat';

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

    // ================== 配置（旧 schema 全键保留，存量配置无缝沿用） ==================
    const DEFAULT_CONFIG = {
        maxDisplayCount: 20,            // 最多显示红包数量
        visibleCount: 5,                // 默认可见红包数量
        panelMaxHeight: 640,            // 板块最大高度（px，展开/浮窗都受此限制）
        position: 'above',              // 保留旧键（新版固定装订在清风明月上方，此项暂不生效）
        autoScrollNew: false,           // 保留旧键
        monitorNewMessages: true,       // 监听新消息总开关
        newMessageThreshold: 5,         // 保留旧键
        autoDelRedPackets: false,       // 自动删除已抢光的红包
        enableRedPacketFilter: true,    // 启用红包类型过滤（聊天室隐藏）
        enableRedPacketModuleFilter: false, // 过滤的红包不进板块
        filterRedPacketTypes: ['石头剪刀布红包'],
        backgroundColor: '',            // 空 = 跟随主题（--fp-card）
        autoUnpackRedPacket: false,     // 自动抢总开关
        autoUnpackRedPacketTypes: [],   // 自动抢的类型
        autoUnpackRedPacketTime: 5000,  // 延迟 ms（3000~10000，强制最低 3000 = 社区规则）
        autoUnpackRedPacketAmount: 2000,// 猜拳超过该数额不自动抢
        autoUnpackRiskConsent: false,   // 勾选=知晓心跳/猜拳可能扣积分，自动抢不再弹确认
        enableAutoUnpackRedPacketText: false, // 感谢文案开关
        autoUnpackRedPacketTextMoney: 200,    // 触发感谢的金额下限（强制最低 200）
        autoUnpackRedPacketText: '🙏感谢**{user}**老板的**{count}**个**{type}**红包🧧\n💰我在第【{num}】位抢到了【{money}】💰\n### 🎉祝老板永远不死！天天开心！🎉',
        autoUnpackRedPacketLoseText: "😱天杀的**{user}**！我不要你的**{type}**红包了！😱\n💰还我的**{money}**血汗积分💰\n## 🧎‍♀️🧎‍🧎‍我再也不赌了😭😭😭！！！",
        autoUnpackRedPacketMoraZeroText: "🤪搞笑的**{user}**！😄\n### 👎交税！！！你滴积分免费咯 ~~~🤪",
        autoUnpackRedPacketMoraText: "🙏感谢**{user}**老板的公益慈善！😄\n💰你的**{money}**积分，咱就笑纳啦~\n### 😎不要在被窝里哭鼻子哦~🤪",
        autoUnpackRedPacketExclusiveText: "🙏感谢**{user}**宝宝的**{type}**红包！🧧\n🤩🤩🤩居然有**{money}**积分！！！\n### 💗爱你哦😘~",
        exclusiveUsers: ["18", "ZDream03", "muli"],
        exclusiveUserTexes: ["最帅最酷最美的月月", "全世界第二帅的小梦", "暗影小姐"]
    };
    const CONFIG = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    // ================== 运行状态 ==================
    const redPackets = new Map();       // 红包ID -> 红包数据（含 got/count 状态真值）
    const processedIds = new Set();     // 已捕获消息 id（防 Vue 重渲染重复捕获）
    const grabbedIds = new Set();       // 已触发自动抢的红包 id
    let isMinimized = false;
    let minimizedIcon = null;
    let alertRedPacketIds = new Set();
    let alertAnimationTimer = null;
    let isFloatingWindow = false;
    let floatingWindowData = null;      // {top,left} 纯数字，不再存 DOM 节点
    let panelEl = null;                 // 红包面板
    let filterStyleEl = null;
    let dockGuardTimer = null;
    let panelExpanded = false;          // 展开/收起状态

    // ================== 工具 ==================
    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    function clamp(n, min, max) {
        n = Number(n);
        if (isNaN(n)) n = min;
        return Math.min(Math.max(n, min), max);
    }
    function isNumeric(value) {
        if (value == null) return false;
        return !isNaN(value) && !isNaN(parseFloat(value));
    }
    function parseTimeString(timeStr) {
        if (!timeStr) return new Date(0);
        const match = String(timeStr).match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
        return match ? new Date(match[0].replace(/-/g, '/')) : new Date(0);
    }
    function muliShowToast(message, duration = 2000, type = 'info') {
        const oldToast = document.getElementById(NS + 'toast');
        if (oldToast) oldToast.remove();
        const toast = document.createElement('div');
        toast.id = NS + 'toast';
        toast.textContent = message;
        Object.assign(toast.style, {
            position: 'fixed', top: '64px', left: '50%', transform: 'translate(-50%, -8px)',
            backgroundColor: 'rgba(30,32,40,0.92)', color: 'white', padding: '8px 18px',
            borderRadius: '8px', fontSize: '13px', zIndex: '2147483646', textAlign: 'center',
            maxWidth: '70vw', boxShadow: '0 6px 20px rgba(0,0,0,0.2)', pointerEvents: 'none',
            opacity: '0', transition: 'opacity .25s ease, transform .25s ease'
        });
        const typeColors = { success: '#51cf66', info: '#339af0', warning: '#ff922b', error: '#ff6b6b' };
        toast.style.borderLeft = '4px solid ' + (typeColors[type] || typeColors.info);
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translate(-50%, 0)'; }, 10);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
        }, duration);
    }

    // ================== 令牌 ==================
    // 页面共享授权优先（作者原话"页面的授权是共用的，不需要重新申请"）：
    //   ① fetch/XHR 钩子捕获页面 accessToken 复用（零副作用）
    //   ② 复用聊天室增强共享的 token（fpcp:token / __fpcp_token）
    //   ③ /auth/refresh 换取只是最后兜底——会轮换登录 Cookie，启动保护期内严禁触发，
    //      否则 Vue 拿到的 Cookie 与轮换后的不一致、直接被踢下线（预热事故已发生两次，勿再犯）
    const PAGE_START = Date.now();
    const TokenStore = {
        _token: null,
        install() {
            // fetch 钩子
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
            // XHR 钩子：应用若走 axios/XHR 发请求，fetch 钩子看不见，在这里补捕
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
            // 聊天室增强（hub）拿到 token 会广播共享，直接复用
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
        // 启动保护期：Vue 会话建立前 refresh=踢下线（真实事故），必须等页面完全就绪再放行
        bootSafe() {
            return document.readyState === 'complete' && Date.now() - PAGE_START > 10000;
        },
        // 取可用 token：捕获/共享优先；接口换取只是最后兜底，且必须过了启动保护期
        async ensure() {
            // 启动保护期内：等页面 token 可复用，绝不抢跑 refresh
            for (let i = 0; i < 30; i++) {
                const peeked = this.peek();
                if (peeked) return peeked;
                if (this.bootSafe()) break;
                await new Promise(r => setTimeout(r, 1000));
            }
            const late = this.peek();
            if (late) return late;
            // 过了启动保护期仍一无所有 → 懒 refresh 兜底（此时 Vue 会话已建立，轮换 Cookie 安全）
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

    // 幂等键：/^[A-Za-z0-9._:-]{1,128}$/
    function idemKey(prefix) {
        const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
        return `hbb:${prefix}:${hex}`;
    }

    // v3 请求：带 Bearer；401 时作废旧 token 自动重试一次
    async function apiReq(path, opt = {}) {
        let lastTok = null;
        const doFetch = async () => {
            const token = await TokenStore.ensure();
            lastTok = token;
            const headers = Object.assign({ 'Content-Type': 'application/json' }, opt.headers || {}, {
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

    // ================== 红包解析（本地 DOM/HTML，不发 API） ==================
    const KNOWN_TYPES = ['拼手气红包', '普通红包', '专属红包', '心跳红包', '石头剪刀布红包'];
    const TYPE_ALIAS = { '猜拳红包': '石头剪刀布红包', '石头剪刀布': '石头剪刀布红包' };

    function normalizeType(text) {
        let t = String(text || '').replace(/[（(][^）)]*[)）]/g, '').trim(); // 去掉 (慎抢) 等后缀
        if (TYPE_ALIAS[t]) return TYPE_ALIAS[t];
        for (const known of KNOWN_TYPES) {
            if (t.includes(known)) return known;
        }
        for (const alias in TYPE_ALIAS) {
            if (t.includes(alias)) return TYPE_ALIAS[alias];
        }
        return t || '未知红包';
    }

    function parseMoneyText(text) {
        const m = String(text || '').match(/-?\d+(\.\d+)?/);
        return m ? parseFloat(m[0]) : 0;
    }

    // 状态语义（对齐线上 HongbaoCard 源码）：
    //   opened 类 / "已经被抢光啦" 都 = got≥count 的抢光态，不是"我打开过"；
    //   got/count 已知时以数值为准，DOM 文本/类名为兜底。
    function parseStatus(itemEl, descText, got, count) {
        if (count != null && got != null && Number(count) > 0 && Number(got) >= Number(count)) return 'empty';
        if (/抢光|抢完|已领完|已经被抢|已过期|已开盘/.test(descText || '')) return 'empty';
        if (itemEl && itemEl.classList && itemEl.classList.contains('opened')) return 'empty';
        return 'available';
    }

    // 从一条消息载荷里解析红包（载荷由监听层统一构造）
    function parsePacketFromMsg(m) {
        if (!m || !m.id || !m.html || m.html.indexOf('hongbao__item') === -1) return null;
        const doc = new DOMParser().parseFromString('<div>' + m.html + '</div>', 'text/html');
        const item = doc.body.querySelector('.hongbao__item');
        if (!item) return null;
        const openBtn = item.querySelector('button.hongbao__open');
        const aria = openBtn ? (openBtn.getAttribute('aria-label') || '') : '';
        const typeText = aria.split('：')[0]
            || (item.querySelector('.hongbao__type') ? item.querySelector('.hongbao__type').textContent : '');
        const descEl = item.querySelector('.hongbao__desc');
        const desc = descEl ? descEl.textContent.trim() : '';
        const moneyEl = item.querySelector('.hongbao__money');
        return {
            id: m.id,
            type: normalizeType(typeText),
            msg: item.querySelector('.hongbao__msg') ? item.querySelector('.hongbao__msg').textContent.trim() : '',
            money: moneyEl ? parseMoneyText(moneyEl.textContent) : 0,
            desc: desc,
            status: parseStatus(item, desc, null, null),
            got: null,              // 状态真值由实时通道填充
            count: null,
            userName: m.userName || '',
            nickname: m.nickname || '',
            userIsSelf: !!m.isSelf,
            avatar: m.avatar || '',
            time: m.time || '',
            html: m.html
        };
    }

    // 找聊天室里对应红包卡片的实时 DOM（兜底状态源）
    function liveItemEl(id) {
        const article = document.getElementById('chatroom' + id);
        return article ? article.querySelector('.hongbao__item') : null;
    }

    // ================== 实时通道（状态真值来源，无侵入） ==================
    // 应用把 chat.red_packet.claimed 只当"提示"渲染，不回写消息卡片的 got/who，
    // 因此面板状态不能依赖 DOM；这里自订一条 /api/v3/realtime 订阅拿领取事件。
    const HbRealtime = (() => {
        let ws = null;
        let pingTimer = null;
        let reconnectTimer = null;
        let retryDelay = 5000;

        function scheduleReconnect() {
            clearInterval(pingTimer);
            if (reconnectTimer) return;
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connect();
            }, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 60000);
        }

        function handleFrame(raw) {
            try {
                const t = JSON.parse(raw);
                if (!t || typeof t.type !== 'string') return;
                if (t.type === 'chat.red_packet.claimed') {
                    const d = t.data || {};
                    if (d.packetId != null) updatePacketClaim(String(d.packetId), d.got, d.count);
                } else if (t.type === 'chat.message.updated' || t.type === 'chat.message.deleted') {
                    const id = String((t.data && t.data.id) || '');
                    if (!id) return;
                    if (t.type === 'chat.message.deleted') {
                        if (redPackets.has(id)) {
                            redPackets.delete(id);
                            updateCard(id);
                        }
                        return;
                    }
                    // 消息更新：快照可能带 redPacket 摘要（got/count）
                    const m = t.data && t.data.message;
                    if (m && m.redPacket && redPackets.has(id)) {
                        updatePacketClaim(id, m.redPacket.got, m.redPacket.count);
                    }
                }
            } catch (e) { }
        }

        async function connect() {
            try {
                const rsp = await apiReq('/api/v3/chat/realtime-ticket', { method: 'POST', body: '{}' });
                const j = await rsp.json().catch(() => null);
                const g = j && (j.data || j);
                if (!g || typeof g.ticket !== 'string') throw new Error('ticket 格式异常');
                const url = new URL('/api/v3/realtime', API_BASE);
                url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
                ws = new WebSocket(url.toString());
                ws.onopen = () => {
                    retryDelay = 5000;
                    try { ws.send(JSON.stringify({ type: 'authenticate', ticket: g.ticket })); } catch (e) { }
                    clearInterval(pingTimer);
                    pingTimer = setInterval(() => {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            try { ws.send('{"type":"ping"}'); } catch (e) { }
                        }
                    }, 25000);   // 协议要求 25s 心跳，60s 无发送断开
                };
                ws.onmessage = (e) => handleFrame(e.data);
                ws.onclose = () => scheduleReconnect();
                ws.onerror = () => { try { ws && ws.close(); } catch (e) { } };
            } catch (e) {
                scheduleReconnect();
            }
        }

        return {
            start() {
                // 优先等页面 accessToken 可复用（钩子捕获/聊天室增强共享）就绪后再连，
                // 启动保护期结束仍没有才允许接口换取——严禁在 Vue 会话建立前触发 refresh（踩坑 11 复发教训：
                // 上一版在 init 直接换 realtime-ticket，ensure() 抢跑 refresh，又是启动预热踢下线）
                const timer = setInterval(() => {
                    if (TokenStore.peek() || TokenStore.bootSafe()) {
                        clearInterval(timer);
                        connect();
                    }
                }, 2000);
            }
        };
    })();

    // 由实时事件驱动的状态更新（状态真值：got/count）
    function updatePacketClaim(id, got, count) {
        const p = redPackets.get(id);
        if (!p) return;
        if (got != null) p.got = Number(got);
        if (count != null) p.count = Number(count);
        const next = parseStatus(null, p.desc, p.got, p.count);
        p.status = next;
        p.lastUpdated = Date.now();
        if (next === 'empty') {
            if (isMinimized) delRedPacketAlert(id);
            if (CONFIG.autoDelRedPackets) {
                redPackets.delete(id);
            }
        }
        updateCard(id);   // 定点刷新单卡（状态/got 进度），不重建整列表
    }

    // ================== 监听层：fpcp 消息总线（方案 C）+ 自开降级 ==================
    // 单装本脚本时没有任何 hub，自开监听是主路径；收到 hub hello 才切订阅省资源；
    // 订阅模式 15s 无心跳自动回退自开；消息 id 去重保证切换期不重复处理。
    const Watcher = (() => {
        let mode = 'self';              // 'self' | 'hub'
        let observer = null;
        let pending = new Set();
        let scheduled = false;
        let lastHubTs = 0;

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
                text: bubble ? bubble.textContent : ''
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
                if (Array.isArray(msgs) && msgs.length) handleMsgBatch(msgs);
            } catch (err) { console.warn('[fishpi_hongbao] hub 消息处理异常:', err); }
        });

        // hub 掉线看护：15s 静默（含心跳）回退自开
        setInterval(() => {
            if (mode === 'hub' && Date.now() - lastHubTs > 15000) {
                mode = 'self';
                startSelf();
                updateModeBadge();
            }
        }, 5000);

        return {
            boot() { startSelf(); },    // 默认自开：单装即用，不等任何 hub
            currentMode() { return mode; },
            // 初始化补扫现存 DOM
            scanNow() {
                const arts = document.querySelectorAll('article.fp-msg');
                const msgs = [];
                arts.forEach(a => { const p = extractPayload(a); if (p.id) msgs.push(p); });
                if (msgs.length) handleMsgBatch(msgs);
            }
        };
    })();

    // ================== 红包数据流 ==================
    function handleMsgBatch(msgs) {
        if (!CONFIG.monitorNewMessages) return;
        let changed = false;
        for (const m of msgs) {
            if (!m || !m.id || processedIds.has(m.id)) continue;
            const p = parsePacketFromMsg(m);
            if (!p) continue;
            processedIds.add(m.id);
            if (CONFIG.autoDelRedPackets && p.status === 'empty') continue;
            if (CONFIG.enableRedPacketModuleFilter && isFilteredType(p.type)) continue;
            p.isNew = true;
            p.lastUpdated = Date.now();
            redPackets.set(p.id, p);
            changed = true;
            setTimeout(() => {
                const pp = redPackets.get(p.id);
                if (pp) { pp.isNew = false; updateCard(p.id); }
            }, 5000);
            // 最小化时的提醒
            if (isMinimized && p.status !== 'empty') addRedPacketAlert(p.id);
            maybeAutoGrab(p);
        }
        if (changed) renderList();
    }

    function isFilteredType(type) {
        return CONFIG.filterRedPacketTypes.map(normalizeType).includes(type);
    }

    // 状态兜底扫描（主状态源是实时通道，这里兜底 DOM 本地变化 + 刷新监听模式徽章）
    function startStatusSweep() {
        setInterval(() => {
            redPackets.forEach((p, id) => {
                const item = liveItemEl(id);
                if (!item) return;
                const descEl = item.querySelector('.hongbao__desc');
                const next = parseStatus(item, descEl ? descEl.textContent : '', p.got, p.count);
                if (next !== p.status) {
                    p.status = next;
                    p.lastUpdated = Date.now();
                    if (next === 'empty') {
                        if (isMinimized) delRedPacketAlert(id);
                        if (CONFIG.autoDelRedPackets) {
                            redPackets.delete(id);
                            updateCard(id);
                            return;
                        }
                    } else if (isMinimized) {
                        addRedPacketAlert(id);
                    }
                    updateCard(id);   // 定点刷新单卡
                }
            });
            updateModeBadge();
        }, 3000);
    }

    // ================== 自动抢 ==================
    function maybeAutoGrab(p) {
        if (!CONFIG.autoUnpackRedPacket) return;
        if (!grabbedIds.has(p.id) && CONFIG.autoUnpackRedPacketTypes.map(normalizeType).includes(p.type)) {
            if (p.status === 'empty') return;
            if (p.type === '石头剪刀布红包' && p.userIsSelf) return; // 猜拳发送者不能领取
            // 猜拳数额保护：赌注达到上限不抢
            if (p.type === '石头剪刀布红包' && p.money && CONFIG.autoUnpackRedPacketAmount
                && CONFIG.autoUnpackRedPacketAmount <= p.money) {
                grabbedIds.add(p.id);
                return;
            }
            grabbedIds.add(p.id);
            const delay = clamp(CONFIG.autoUnpackRedPacketTime, 3000, 10000); // 社区规则：最低 3s
            setTimeout(() => { fireClaim(p); }, delay);
        }
    }

    async function fireClaim(p) {
        // 抢前最后一次本地空检查（不发 API，抢优先）
        const item = liveItemEl(p.id);
        if (item) {
            const descEl = item.querySelector('.hongbao__desc');
            if (parseStatus(item, descEl ? descEl.textContent : '', p.got, p.count) === 'empty') {
                p.status = 'empty';
                updateCard(p.id);
                return;
            }
        }
        // 风险确认：勾选 autoUnpackRiskConsent 即视为用户已明确知晓并同意
        const risky = (p.type === '心跳红包' || p.type === '石头剪刀布红包');
        if (risky && !CONFIG.autoUnpackRiskConsent) {
            const ok = window.confirm('【' + p.type + '】领取可能扣除积分，确定要抢吗？\n（可在红包配置中勾选“同意风险”后不再弹出）');
            if (!ok) return;
        }
        const body = {};
        if (risky) body.riskAccepted = true;
        if (p.type === '石头剪刀布红包') body.gesture = getRandomInt(0, 2);
        doClaim(p, body);
    }

    // 领取请求本体（自动抢/手动领取共用）
    async function doClaim(p, body) {
        try {
            const rsp = await apiReq('/api/v3/chat/red-packets/' + p.id + '/claims', {
                method: 'POST',
                headers: { 'Idempotency-Key': idemKey('claim') },
                body: JSON.stringify(body)
            });
            const j = await rsp.json().catch(() => null);
            if (j && j.code === 0 && j.data) {
                updateCard(p.id);
                sendThanks(p, j.data);
                return j.data;
            }
            const msg = (j && (j.msg || j.message)) || ('HTTP ' + rsp.status);
            if (rsp.status === 409) {
                // 领完/已领：只更新状态，不打扰
                p.status = 'empty';
                updateCard(p.id);
            } else {
                muliShowToast('领取失败：' + msg, 3000, 'error');
            }
            return null;
        } catch (e) {
            muliShowToast('领取异常：' + (e && e.message ? e.message : e), 3000, 'error');
            return null;
        }
    }

    // 手动领取（定位弹窗按钮）：按钮文案已标注风险，用户明确点击即同意，不再弹二次确认
    function manualClaim(p, gesture) {
        const body = {};
        const risky = (p.type === '心跳红包' || p.type === '石头剪刀布红包');
        if (risky) body.riskAccepted = true;
        if (p.type === '石头剪刀布红包') body.gesture = gesture != null ? gesture : getRandomInt(0, 2);
        doClaim(p, body).then((data) => {
            if (data) muliShowToast('领取成功' + (data.amount != null ? '：' + data.amount + ' 积分' : ''), 2500, 'success');
        });
    }

    // ================== 感谢语 + 小尾巴 ==================
    const GESTURE_TEXT = { 0: '石头', 1: '剪刀', 2: '布' };
    const OUTCOME_TEXT = { win: '胜利', lose: '失败', tie: '平局' };

    function renderTemplate(tpl, vars) {
        return String(tpl || '')
            .replace(/\{user\}/g, vars.user || '')
            .replace(/\{count\}/g, vars.count != null ? vars.count : '')
            .replace(/\{num\}/g, vars.num != null ? vars.num : '')
            .replace(/\{money\}/g, vars.money != null ? vars.money : '')
            .replace(/\{type\}/g, vars.type || '')
            .replace(/\{result\}/g, vars.result || '')
            .replace(/\{gesture\}/g, vars.gesture || '');
    }

    function honorName(userName) {
        // 专属用户称呼替换（旧配置语义：按索引对应）
        if (CONFIG.exclusiveUsers && CONFIG.exclusiveUserTexes
            && CONFIG.exclusiveUsers.length <= CONFIG.exclusiveUserTexes.length) {
            const idx = CONFIG.exclusiveUsers.indexOf(userName);
            if (idx > -1) return CONFIG.exclusiveUserTexes[idx];
        }
        return userName;
    }

    async function sendThanks(p, claimData) {
        if (!CONFIG.enableAutoUnpackRedPacketText) return;
        const amount = Number(claimData.amount) || 0;
        let msg;
        if (p.type === '石头剪刀布红包') {
            if (amount < 0) {
                if (p.userIsSelf) return; // 输给自己的红包不发求饶
                msg = CONFIG.autoUnpackRedPacketLoseText;
            } else if (amount === 0) {
                msg = CONFIG.autoUnpackRedPacketMoraZeroText;
            } else {
                msg = CONFIG.autoUnpackRedPacketMoraText;
            }
        } else if (p.type === '专属红包' && amount > 0) {
            msg = CONFIG.autoUnpackRedPacketExclusiveText;
        } else {
            const threshold = clamp(CONFIG.autoUnpackRedPacketTextMoney, 200, 1000000); // 强制最低 200
            if (!amount || amount < threshold) return;
            msg = CONFIG.autoUnpackRedPacketText;
        }
        if (!msg) msg = CONFIG.autoUnpackRedPacketText;

        // 懒查详情补 {count}/{num}：抢已完成，这里的 API 延迟不影响抢速；失败就留空
        let count = '', num = '';
        try {
            const rsp = await apiReq('/api/v3/chat/red-packets/' + p.id, { method: 'GET' });
            const j = await rsp.json().catch(() => null);
            const d = j && (j.data || j);
            if (d && d.count != null) {
                count = d.count;
                num = d.got != null ? d.got : '';
            }
        } catch (e) { }

        const vars = {
            user: honorName(p.userName || p.nickname),
            count: count,
            num: num,
            money: amount < 0 ? (0 - amount) : amount,
            type: String(p.type || '').replace(/红包/g, ''),
            result: OUTCOME_TEXT[claimData.outcome] || '',
            gesture: GESTURE_TEXT[claimData.gesture] != null ? GESTURE_TEXT[claimData.gesture] : ''
        };
        const content = renderTemplate(msg, vars)
            + '\n> 来自红包板块---[【' + VERSION_US + '】](' + DOWNLOAD_URL + ')-' + getRandomInt(10, 99);
        sendMsg(content);
    }

    // 发消息（v3；client 沿用聊天室增强签名，Idempotency-Key 必带）
    async function sendMsg(content) {
        try {
            const rsp = await apiReq('/api/v3/chat/messages', {
                method: 'POST',
                headers: { 'Idempotency-Key': idemKey('msg') },
                body: JSON.stringify({ content: String(content ?? ''), client: CLIENT_TAG })
            });
            const j = await rsp.json().catch(() => null);
            if (!j || j.code !== 0) {
                muliShowToast('感谢语发送失败' + (j && j.msg ? '：' + j.msg : ''), 3000, 'error');
            }
            return j;
        } catch (e) {
            muliShowToast('感谢语发送异常', 3000, 'error');
            return null;
        }
    }

    // ================== 样式（主题变量中性色，随深浅色切换） ==================
    function addStyles() {
        const css = `
            :root {
                --${NS}card: var(--fp-card, #fff);
                --${NS}elevated: var(--fp-elevated, #fff);
                --${NS}text: var(--fp-text, #333);
                --${NS}text2: var(--fp-title, #868e96);
                --${NS}border: var(--fp-border, #e4e6eb);
                --${NS}subtle: var(--fp-surface-subtle, rgba(128,128,140,0.08));
                --${NS}input-bg: var(--fp-control-bg, #fff);
            }
            .${NS}module { margin-bottom: 15px; border: 1px solid var(--${NS}border); border-radius: 12px;
                overflow: hidden; background: var(--${NS}card); box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
            .${NS}body { scrollbar-width: thin; scrollbar-color: #ff6b6b transparent; }
            .${NS}body::-webkit-scrollbar { width: 6px; }
            .${NS}body::-webkit-scrollbar-track { background: transparent; }
            .${NS}body::-webkit-scrollbar-thumb { background: #ff6b6b; border-radius: 3px; }
            .${NS}list { display: flex; flex-direction: column; gap: 12px; }
            .${NS}card { position: relative; border: 1px solid var(--${NS}border); border-radius: 10px; padding: 12px;
                background: var(--${NS}card); transition: box-shadow .2s ease, transform .2s ease, border-color .2s ease; overflow: hidden; cursor: pointer; }
            .${NS}card:hover { border-color: #ff6b6b; box-shadow: 0 6px 16px rgba(255,107,107,0.15); transform: translateY(-2px); }
            .${NS}card.is-new { border-color: #ff4757; box-shadow: 0 0 0 1px #ff4757; animation: ${NS}newIn 0.45s ease-out; }
            .${NS}badge { position: absolute; top: -1px; right: -1px; background: #ff4757; color: white; font-size: 10px;
                padding: 2px 8px; border-radius: 0 10px 0 10px; z-index: 2; font-weight: bold; letter-spacing: 1px; }
            .${NS}status { position: absolute; top: 0; right: 0; width: 28px; height: 28px; clip-path: polygon(100% 0, 100% 100%, 0 0); z-index: 1; }
            .${NS}userrow { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
            .${NS}avatar { width: 26px; height: 26px; border-radius: 50%; background-size: cover; background-position: center; background-color: var(--${NS}subtle); flex: none; }
            .${NS}username { font-weight: 600; color: var(--${NS}text); font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .${NS}time { font-size: 11px; color: var(--${NS}text2); flex: none; }
            .${NS}chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
            .${NS}chip { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--${NS}border);
                color: var(--${NS}text2); background: var(--${NS}subtle); line-height: 1.6; }
            .${NS}chip.chip-ok { color: #2b8a3e; border-color: rgba(43,138,62,0.35); background: rgba(43,138,62,0.08); }
            .${NS}chip.chip-empty { color: #e67700; border-color: rgba(230,119,0,0.35); background: rgba(230,119,0,0.08); }
            .${NS}bubble { margin: 0; padding: 0; }
            @keyframes ${NS}newIn { 0% { transform: translateY(-16px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
            .${NS}highlight { animation: ${NS}pulse 1s ease-in-out 3; border: 2px solid #ff6b6b !important; }
            @keyframes ${NS}pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,107,107,0.4); } 50% { box-shadow: 0 0 0 10px rgba(255,107,107,0); } }
            .${NS}icon { position: fixed; bottom: 100px; right: 30px; width: 60px; height: 60px;
                background: linear-gradient(135deg, #ff6b6b, #ff8e53); border-radius: 50%; cursor: move; z-index: 10001;
                box-shadow: 0 6px 20px rgba(255,107,107,0.5); display: flex; align-items: center; justify-content: center;
                font-size: 28px; color: white; user-select: none; border: 3px solid white; }
            .${NS}icon:hover { transform: scale(1.1); box-shadow: 0 8px 25px rgba(255,107,107,0.6) !important; }
            .${NS}icon:active { transform: scale(0.95); }
            .${NS}menu { position: fixed; background: var(--${NS}elevated); border: 1px solid var(--${NS}border); border-radius: 10px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.18); z-index: 10002; min-width: 160px; padding: 8px 0; }
            .${NS}menu-item { padding: 8px 16px; font-size: 13px; cursor: pointer; transition: background 0.2s; color: var(--${NS}text); }
            .${NS}menu-item:hover { background: var(--${NS}subtle); }
            .${NS}config { animation: ${NS}popIn 0.18s ease-out; font-family: inherit; }
            @keyframes ${NS}popIn { from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
            .${NS}config-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
                -webkit-backdrop-filter: blur(2px); z-index: 10001; animation: ${NS}fadeIn 0.16s ease-out; }
            @keyframes ${NS}fadeIn { from { opacity: 0; } to { opacity: 1; } }
            .${NS}config .${NS}section { padding: 16px; background: var(--${NS}subtle); border-radius: 10px; border-left: 3px solid #ff6b6b; margin-bottom: 16px; }
            .${NS}config .${NS}item { margin-bottom: 12px; padding: 4px 6px; border-radius: 6px; transition: background 0.2s ease; }
            .${NS}config .${NS}item:hover { background: rgba(255,107,107,0.06); }
            .${NS}config input[type="number"], .${NS}config input[type="text"], .${NS}config select, .${NS}config textarea {
                padding: 6px 10px; border: 1px solid var(--${NS}border); border-radius: 8px; background: var(--${NS}input-bg);
                color: var(--${NS}text); font-size: 13px; outline: none; transition: border-color .2s, box-shadow .2s; }
            .${NS}config input:focus, .${NS}config select:focus, .${NS}config textarea:focus {
                border-color: #ff6b6b !important; box-shadow: 0 0 0 2px rgba(255,107,107,0.18); }
            .${NS}config .${NS}footer { position: sticky; bottom: -20px; margin: 0 -20px -20px; padding: 14px 20px 18px;
                background: var(--${NS}elevated); border-top: 1px solid var(--${NS}border);
                display: flex; gap: 12px; box-shadow: 0 -6px 18px rgba(0,0,0,0.08); z-index: 5; }
            .${NS}config .${NS}btn { flex: 1; padding: 11px 10px; border: none; border-radius: 10px; cursor: pointer;
                font-weight: 600; font-size: 14px; transition: transform .15s, box-shadow .15s; }
            .${NS}config .${NS}btn:hover { transform: translateY(-1px) scale(1.02); }
            .${NS}config .${NS}btn:active { transform: scale(0.98); }
            .${NS}config .${NS}btn-primary { background: linear-gradient(135deg, #ff6b6b, #ff8e53); color: white;
                box-shadow: 0 4px 14px rgba(255,107,107,0.35); }
            .${NS}config .${NS}btn-ghost { background: var(--${NS}subtle); color: var(--${NS}text2); }
            .${NS}dragging { opacity: 0.92; box-shadow: 0 15px 40px rgba(0,0,0,0.3) !important; }
            .${NS}mode { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(255,255,255,0.18);
                color: white; border: 1px solid rgba(255,255,255,0.35); cursor: default; }
            .${NS}locate { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 460px; max-width: 92vw;
                max-height: 76vh; overflow-y: auto; background: var(--${NS}elevated); color: var(--${NS}text);
                border: 1px solid var(--${NS}border); border-radius: 16px; padding: 18px; z-index: 10002;
                box-shadow: 0 16px 48px rgba(0,0,0,0.28); animation: ${NS}popIn 0.18s ease-out; }
            .${NS}locate-row { padding: 6px 10px; border-radius: 8px; font-size: 12px; color: var(--${NS}text2); line-height: 1.7; }
            .${NS}locate-row b { color: var(--${NS}text); }
            .${NS}locate-row.is-anchor { background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.35); }
            .${NS}locate .${NS}btn { flex: none; padding: 8px 18px; border: none; border-radius: 10px; cursor: pointer;
                font-weight: 600; font-size: 13px; transition: transform .15s; }
            .${NS}locate .${NS}btn:hover { transform: translateY(-1px); }
            .${NS}locate .${NS}btn-primary { background: linear-gradient(135deg, #ff6b6b, #ff8e53); color: white; }
            .${NS}locate .${NS}btn-ghost { background: var(--${NS}subtle); color: var(--${NS}text2); }
            @media (prefers-reduced-motion: reduce) {
                .${NS}config, .${NS}config-backdrop, .${NS}card, .${NS}icon { animation: none !important; transition: none !important; }
            }
        `;
        const style = document.createElement('style');
        style.id = NS + 'style';
        style.textContent = css;
        document.head.appendChild(style);
        // 过滤样式单独一份，便于开关
        filterStyleEl = document.createElement('style');
        filterStyleEl.id = NS + 'filter-style';
        document.head.appendChild(filterStyleEl);
        applyFilter();
    }

    // 过滤：纯 CSS（aria-label 前缀匹配类型），抗 Vue 重渲染
    function applyFilter() {
        if (!filterStyleEl) return;
        if (!CONFIG.enableRedPacketFilter) {
            filterStyleEl.textContent = '';
            return;
        }
        const rules = CONFIG.filterRedPacketTypes.map(normalizeType).map(t =>
            `.chat-message-entry:has(button.hongbao__open[aria-label^="${t}"]) { display: none !important; }`
        );
        filterStyleEl.textContent = rules.join('\n');
    }

    // ================== 面板 ==================
    function collapsedHeight() {
        return Math.min(CONFIG.visibleCount * 200, CONFIG.panelMaxHeight);
    }

    function createPanel() {
        const panel = document.createElement('div');
        panel.className = NS + 'module';
        panel.id = NS + 'panel';

        const header = document.createElement('div');
        header.style.cssText = 'background: linear-gradient(135deg, #ff6b6b, #ff8e53); color: white; border-bottom: 2px solid rgba(0,0,0,0.08); display: flex; justify-content: space-between; align-items: center; padding: 12px 14px;';
        const title = document.createElement('div');
        title.style.cssText = 'font-size: 15px; font-weight: bold; display: flex; align-items: center; gap: 8px;';
        title.textContent = '🧧 红包板块';

        // 监听来源徽章（hub 共用 / self 独立）
        const modeBadge = document.createElement('span');
        modeBadge.className = NS + 'mode';
        modeBadge.id = NS + 'mode-badge';
        modeBadge.textContent = '📡 独立';
        modeBadge.title = '消息监听来源：本脚本独立监听';
        title.appendChild(modeBadge);

        const controls = document.createElement('div');
        controls.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const countBadge = document.createElement('span');
        countBadge.className = NS + 'count';
        countBadge.style.cssText = 'background: rgba(255,255,255,0.2); padding: 2px 10px; border-radius: 999px; font-size: 12px;';
        countBadge.textContent = '0';

        const mkBtn = (text, title2, bg, onClick) => {
            const b = document.createElement('button');
            b.textContent = text;
            b.title = title2;
            b.style.cssText = 'width: 26px; height: 26px; border-radius: 50% !important; border: 2px solid rgba(255,255,255,0.7) !important; color: white !important; font-weight: bold !important; cursor: pointer !important; display: flex; align-items: center; justify-content: center; padding: 0; line-height: 1; background: ' + bg + ' !important; transition: transform .15s;';
            b.addEventListener('mouseenter', () => { b.style.transform = 'scale(1.1)'; });
            b.addEventListener('mouseleave', () => { b.style.transform = ''; });
            b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
            return b;
        };

        const expandBtn = mkBtn('▼', '展开/收起', 'rgba(255,255,255,0.2)', () => {
            panelExpanded = !panelExpanded;
            const body = panel.querySelector('.' + NS + 'body');
            body.style.maxHeight = (panelExpanded ? CONFIG.panelMaxHeight : collapsedHeight()) + 'px';
            expandBtn.textContent = panelExpanded ? '▲' : '▼';
        });
        const minimizeBtn = mkBtn('−', '最小化', 'rgba(106,17,203,0.85)', () => toggleMinimizeMode());
        const floatingBtn = mkBtn('⇄', '切换浮窗模式', 'rgba(43,138,62,0.85)', () => toggleFloatingWindow());
        const configBtn = mkBtn('⚙', '配置面板', 'rgba(108,92,231,0.85)', () => openConfig());

        controls.appendChild(countBadge);
        controls.appendChild(expandBtn);
        controls.appendChild(minimizeBtn);
        controls.appendChild(floatingBtn);
        controls.appendChild(configBtn);
        header.appendChild(title);
        header.appendChild(controls);

        const body = document.createElement('div');
        body.className = NS + 'body';
        body.style.cssText = 'max-height: ' + collapsedHeight() + 'px; overflow-y: auto; transition: max-height 0.3s ease; padding: 12px;';
        const list = document.createElement('div');
        list.className = NS + 'list';
        body.appendChild(list);

        panel.appendChild(header);
        panel.appendChild(body);

        // 事件委托：点卡片红包区 → 触发聊天室原生“打开红包”按钮；点其他区域 → 高亮定位原消息
        list.addEventListener('click', (e) => {
            const card = e.target.closest('.' + NS + 'card');
            if (!card) return;
            const id = card.dataset.packetId;
            const article = document.getElementById('chatroom' + id);
            const openBtn = article ? article.querySelector('button.hongbao__open') : null;
            if (e.target.closest('.hongbao__item')) {
                if (openBtn) openBtn.click();
                else showLocateDialog(id);   // 原消息不在 → API 定位弹窗（含手动领取）
            } else {
                highlightOriginal(id);
            }
        });

        return panel;
    }

    // 监听来源徽章（hub 共用 / self 独立）
    function updateModeBadge() {
        const badge = document.getElementById(NS + 'mode-badge');
        if (!badge) return;
        const mode = Watcher.currentMode();
        const isHub = mode === 'hub';
        const text = isHub ? '🔗 共用' : '📡 独立';
        if (badge.textContent !== text) {
            badge.textContent = text;
            badge.title = isHub
                ? '消息监听来源：与聊天室增强共用（fpcp 消息总线）'
                : '消息监听来源：本脚本独立监听（未检测到消息总线）';
            console.log('[fishpi_hongbao] 监听模式: ' + mode);
        }
    }

    // 装订：侧栏内、聊天室增强装订块（.fpcp-docked）下方、清风明月（section.sidebar-tabs）上方
    function dockPanel() {
        if (!panelEl) return false;
        const sidebar = document.querySelector('aside.sidebar-layout.chat-sidebar') || document.querySelector('.chat-sidebar');
        if (!sidebar) return false;
        const plusDock = sidebar.querySelector('.fpcp-docked');
        const tabs = sidebar.querySelector('section.sidebar-tabs');
        if (plusDock) {
            // 必须在聊天室增强装订块的下面（其后紧邻）
            if (!(plusDock.nextElementSibling === panelEl)) {
                sidebar.insertBefore(panelEl, plusDock.nextSibling);
            }
        } else if (tabs) {
            if (!(tabs.previousElementSibling === panelEl)) {
                sidebar.insertBefore(panelEl, tabs);
            }
        } else {
            sidebar.appendChild(panelEl);
        }
        return true;
    }

    // 装订存活看护：Vue 重渲染清节点/聊天室增强后装订 → 自动校正
    function startDockGuard() {
        if (dockGuardTimer) return;
        dockGuardTimer = setInterval(() => {
            if (!panelEl) return;
            const sidebar = document.querySelector('aside.sidebar-layout.chat-sidebar') || document.querySelector('.chat-sidebar');
            if (!sidebar || !sidebar.contains(panelEl) || !panelEl.isConnected) {
                dockPanel();
            } else {
                const plusDock = sidebar.querySelector('.fpcp-docked');
                if (plusDock && plusDock.nextElementSibling !== panelEl) {
                    // 聊天室增强在我们下面装订了（或顺序被重排），校正到其下方
                    sidebar.insertBefore(panelEl, plusDock.nextSibling);
                }
            }
        }, 3000);
    }

    function highlightOriginal(id) {
        const article = document.getElementById('chatroom' + id);
        if (!article) {
            showLocateDialog(id);   // 不在当前聊天区 → 走上下文 API 查找回
            return;
        }
        document.querySelectorAll('.' + NS + 'highlight').forEach(el => el.classList.remove(NS + 'highlight'));
        article.classList.add(NS + 'highlight');
        article.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => article.classList.remove(NS + 'highlight'), 3000);
    }

    // ================== API 消息定位（仿 fishpi_message_listening_plus 上下文追溯） ==================
    // 原消息被历史窗口淘汰出 DOM 时，调官方上下文 API 找回并展示，附手动领取入口
    function fmtShortTime(ts) {
        const d = new Date(Number(ts) || 0);
        const pad = (n) => String(n).padStart(2, '0');
        return (pad(d.getMonth() + 1)) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function ctxRow(m) {
        const a = m.author || {};
        const name = a.userNickname || a.userName || '匿名';
        let text = '';
        const type = String(m.type || 'text');
        if (type === 'text') {
            text = String(m.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
        } else if (type === 'redPacket') text = '[红包卡片]';
        else if (type === 'music') text = '[音乐分享]';
        else if (type === 'weather') text = '[天气信息]';
        else text = '[' + type + ']';
        return { id: String(m.id || ''), name, time: fmtShortTime(m.createdAt), text };
    }

    async function showLocateDialog(id) {
        const p = redPackets.get(id);
        muliShowToast('原消息不在当前聊天区域，正在通过 API 查找…', 1600, 'info');
        let list = [];
        try {
            const rsp = await apiReq('/api/v3/chat/messages/' + encodeURIComponent(id) + '/context?radius=5');
            const j = await rsp.json().catch(() => null);
            if (j && j.code === 0 && j.data && Array.isArray(j.data.list)) list = j.data.list;
        } catch (e) { }
        if (!list.length) {
            muliShowToast('API 未找到该消息（可能已撤回）', 2500, 'warning');
            return;
        }
        const old = document.querySelector('.' + NS + 'locate-backdrop');
        if (old) old.remove();

        const backdrop = document.createElement('div');
        backdrop.className = NS + 'config-backdrop ' + NS + 'locate-backdrop';
        const box = document.createElement('div');
        box.className = NS + 'locate';

        const head = document.createElement('div');
        head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--hb2_border);';
        head.innerHTML = '<b style="color:#ff6b6b;font-size:15px;">📍 消息定位（API）</b>';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = 'background:none;border:none;font-size:22px;cursor:pointer;color:var(--hb2_text2);line-height:1;padding:0;';
        head.appendChild(closeBtn);
        box.appendChild(head);

        // 红包摘要（来自板块缓存）
        if (p) {
            const summary = document.createElement('div');
            summary.className = NS + 'locate-row is-anchor';
            summary.textContent = '🧧 ' + (p.nickname || p.userName || '') + ' 的「' + p.type + '」' + (p.msg || '')
                + (p.money ? '（¥ ' + p.money + '）' : '')
                + ' · ' + (p.status === 'empty' ? STATUS_CHIP_TEXT.empty : STATUS_CHIP_TEXT.ok)
                + (p.count ? ' · ' + (p.got != null ? p.got : 0) + '/' + p.count : '');
            box.appendChild(summary);
        }

        // 上下文消息（前后各 5 条，锚点高亮）
        const ctxWrap = document.createElement('div');
        ctxWrap.style.cssText = 'max-height: 40vh; overflow-y: auto; margin: 10px 0;';
        list.forEach((m) => {
            const r = ctxRow(m);
            const row = document.createElement('div');
            row.className = NS + 'locate-row' + (r.id === String(id) ? ' is-anchor' : '');
            row.innerHTML = '<span style="opacity:.7">' + r.time + '</span> <b></b> <span></span>';
            row.querySelector('b').textContent = r.name;
            row.querySelectorAll('span')[1].textContent = r.text;
            ctxWrap.appendChild(row);
        });
        box.appendChild(ctxWrap);

        // 底部操作
        const foot = document.createElement('div');
        foot.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;';
        const mkBtn = (text, primary, fn) => {
            const b = document.createElement('button');
            b.className = NS + 'btn ' + (primary ? 'hb2_btn-primary' : 'hb2_btn-ghost');
            b.style.cssText = 'flex:none;padding:8px 18px;';
            b.textContent = text;
            b.addEventListener('click', fn);
            foot.appendChild(b);
            return b;
        };
        // 手动领取入口（按钮文案已标注风险 = 用户明确点击同意；rps 出拳自选）
        if (p && p.status !== 'empty') {
            if (p.type === '石头剪刀布红包' && !p.userIsSelf) {
                mkBtn('✊ 石头', true, () => { manualClaim(p, 0); close(); });
                mkBtn('✌️ 剪刀', true, () => { manualClaim(p, 1); close(); });
                mkBtn('🖐 布', true, () => { manualClaim(p, 2); close(); });
            } else if (!(p.type === '石头剪刀布红包' && p.userIsSelf)) {
                mkBtn(p.type === '心跳红包' ? '领取（可能扣积分）' : '领取', true, () => { manualClaim(p); close(); });
            }
        }
        mkBtn('关闭', false, close);
        box.appendChild(foot);

        function close() { backdrop.remove(); }
        closeBtn.addEventListener('click', close);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

        backdrop.appendChild(box);
        document.body.appendChild(backdrop);
    }

    function renderList() {
        if (!panelEl) return;
        const list = panelEl.querySelector('.' + NS + 'list');
        const countBadge = panelEl.querySelector('.' + NS + 'count');
        if (!list || !countBadge) return;

        const order = Array.from(redPackets.keys()).sort((a, b) =>
            parseTimeString(redPackets.get(b).time) - parseTimeString(redPackets.get(a).time));
        countBadge.textContent = order.length;

        if (order.length === 0) {
            list.innerHTML = '<div style="text-align:center;color:var(--hb2_text2);padding:32px 12px;font-size:13px;line-height:2;">🎈 还没有红包消息<br><small>聊天室发红包后会在这里显示</small></div>';
            return;
        }
        list.innerHTML = '';
        order.slice(0, CONFIG.maxDisplayCount).forEach(id => {
            list.appendChild(renderCard(redPackets.get(id)));
        });
    }

    const STATUS_COLORS = { available: '#4CAF50', opened: '#2196F3', empty: '#FF9800', expired: '#9E9E9E', unknown: '#607D8B' };
    const STATUS_CHIP_TEXT = { ok: '可抢', empty: '已抢光' };   // 状态文案微调只改这里（renderCard/patchCard 共用）

    // 单卡片定点更新：状态/进度变化就地修补这一张卡，绝不替换节点
    // （替换节点会重放卡片进场动画、引发重排，就是"状态一更新列表就闪"的根源）；
    // 增删（新红包/删除）才走 renderList 全量。
    function updateCard(id) {
        if (!panelEl) return;
        const list = panelEl.querySelector('.' + NS + 'list');
        const countBadge = panelEl.querySelector('.' + NS + 'count');
        if (!list) return;
        const p = redPackets.get(id);
        const old = list.querySelector('[data-packet-id="' + id + '"]');
        if (!p) {
            if (old) old.remove();
            if (redPackets.size === 0) renderList();   // 清空后补空态提示
            else if (countBadge) countBadge.textContent = redPackets.size;
            return;
        }
        if (old) patchCard(p, old);   // 就地修补，零闪烁
        if (countBadge) countBadge.textContent = redPackets.size;
    }

    // 就地修补卡片的可变部分（NEW 标记/状态角标/状态与进度 chip/红包克隆本体）
    function patchCard(p, card) {
        const badge = card.querySelector('.' + NS + 'badge');
        if (p.isNew && !badge) {
            const b = document.createElement('div');
            b.className = NS + 'badge';
            b.textContent = 'NEW';
            card.appendChild(b);
        } else if (!p.isNew && badge) {
            badge.remove();
        }
        if (card.classList.contains('is-new') !== !!p.isNew) {
            card.classList.toggle('is-new', !!p.isNew);
        }
        const statusEl = card.querySelector('.' + NS + 'status');
        if (statusEl) statusEl.style.background = STATUS_COLORS[p.status] || '#607D8B';
        const chips = card.querySelector('.' + NS + 'chips');
        if (chips) {
            const statusChip = chips.querySelector('.chip-ok, .chip-empty');
            if (statusChip) {
                statusChip.className = NS + 'chip ' + (p.status === 'empty' ? 'chip-empty' : 'chip-ok');
                statusChip.textContent = p.status === 'empty' ? STATUS_CHIP_TEXT.empty : STATUS_CHIP_TEXT.ok;
            }
            let progressChip = chips.querySelector('[data-role="progress"]');
            if (p.count != null && p.count > 0) {
                if (!progressChip) {
                    progressChip = document.createElement('span');
                    progressChip.className = NS + 'chip';
                    progressChip.setAttribute('data-role', 'progress');
                    chips.appendChild(progressChip);
                }
                progressChip.textContent = (p.got != null ? p.got : 0) + '/' + p.count;
            } else if (progressChip) {
                progressChip.remove();
            }
        }
        // 红包克隆本体（desc/样式随状态变）
        const bubble = card.querySelector('.' + NS + 'bubble');
        const live = liveItemEl(p.id);
        if (bubble && live) {
            bubble.innerHTML = '';
            bubble.appendChild(live.cloneNode(true));
        }
    }

    function renderCard(p) {
        const card = document.createElement('div');
        card.className = NS + 'card' + (p.isNew ? ' is-new' : '');
        card.dataset.packetId = p.id;

        if (p.isNew) {
            const badge = document.createElement('div');
            badge.className = NS + 'badge';
            badge.textContent = 'NEW';
            card.appendChild(badge);
        }
        const status = document.createElement('div');
        status.className = NS + 'status';
        status.style.background = STATUS_COLORS[p.status] || '#607D8B';
        card.appendChild(status);

        // 用户行
        const userRow = document.createElement('div');
        userRow.className = NS + 'userrow';
        const avatar = document.createElement('div');
        avatar.className = NS + 'avatar';
        if (p.avatar) avatar.style.backgroundImage = 'url(' + p.avatar + ')';
        const name = document.createElement('span');
        name.className = NS + 'username';
        name.textContent = p.nickname || p.userName || '匿名';
        const time = document.createElement('span');
        time.className = NS + 'time';
        const tStr = String(p.time || '');
        time.textContent = tStr.length >= 16 ? tStr.slice(5, 16) : tStr;   // MM-DD HH:mm，便于按时间找回红包
        time.title = tStr;   // 悬浮看完整时间
        userRow.appendChild(avatar);
        userRow.appendChild(name);
        userRow.appendChild(time);
        card.appendChild(userRow);

        // 信息角标行：类型 / 状态 / 进度
        const chips = document.createElement('div');
        chips.className = NS + 'chips';
        const typeChip = document.createElement('span');
        typeChip.className = NS + 'chip';
        typeChip.textContent = p.type;
        chips.appendChild(typeChip);
        const statusChip = document.createElement('span');
        statusChip.className = NS + 'chip ' + (p.status === 'empty' ? 'chip-empty' : 'chip-ok');
        statusChip.textContent = p.status === 'empty' ? STATUS_CHIP_TEXT.empty : STATUS_CHIP_TEXT.ok;
        chips.appendChild(statusChip);
        if (p.count != null && p.count > 0) {
            const progressChip = document.createElement('span');
            progressChip.className = NS + 'chip';
            progressChip.setAttribute('data-role', 'progress');
            progressChip.textContent = (p.got != null ? p.got : 0) + '/' + p.count;
            chips.appendChild(progressChip);
        }
        if (p.money) {
            const moneyChip = document.createElement('span');
            moneyChip.className = NS + 'chip';
            moneyChip.textContent = '¥ ' + p.money;
            chips.appendChild(moneyChip);
        }
        card.appendChild(chips);

        // 红包本体：克隆聊天室原样式（优先实时 DOM，退回捕获时的 HTML）
        const bubble = document.createElement('div');
        bubble.className = NS + 'bubble';
        const live = liveItemEl(p.id);
        const clone = live ? live.cloneNode(true) : (() => {
            const doc = new DOMParser().parseFromString('<div>' + p.html + '</div>', 'text/html');
            return doc.body.querySelector('.hongbao__item');
        })();
        if (clone) bubble.appendChild(clone);
        card.appendChild(bubble);

        return card;
    }

    // ================== 最小化 + 提醒 ==================
    function toggleMinimizeMode() {
        if (!panelEl) return;
        const minimizeBtn = panelEl.querySelector('button[title="最小化"], button[title="恢复面板"]');
        if (isMinimized) {
            panelEl.style.display = '';
            if (minimizedIcon) minimizedIcon.style.display = 'none';
            if (minimizeBtn) { minimizeBtn.textContent = '−'; minimizeBtn.title = '最小化'; }
            if (alertRedPacketIds.size > 0) {
                highlightOriginal(Array.from(alertRedPacketIds)[0]);
                clearAlertAnimation();
                alertRedPacketIds.clear();
            }
        } else {
            panelEl.style.display = 'none';
            const icon = createMinimizedIcon();
            icon.style.display = 'flex';
            loadMinimizedIconPosition();
            if (minimizeBtn) { minimizeBtn.textContent = '＋'; minimizeBtn.title = '恢复面板'; }
        }
        isMinimized = !isMinimized;
        muliSpecialStorage.setItem('redPacketMinimizedState', isMinimized.toString());
    }

    function createMinimizedIcon() {
        if (minimizedIcon) return minimizedIcon;
        const icon = document.createElement('div');
        icon.className = NS + 'icon';
        icon.textContent = '🧧';
        icon.title = '点击展开红包面板';
        makeIconDraggable(icon);

        let downTime = 0, downX = 0, downY = 0;
        icon.addEventListener('mousedown', (e) => {
            downTime = Date.now(); downX = e.clientX; downY = e.clientY;
        });
        icon.addEventListener('click', (e) => {
            const dur = Date.now() - downTime;
            const dist = Math.sqrt(Math.pow(e.clientX - downX, 2) + Math.pow(e.clientY - downY, 2));
            if (dur > 300 || dist > 10) { e.preventDefault(); e.stopPropagation(); return; }
            toggleMinimizeMode();
        });
        icon.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showIconContextMenu(e);
        });
        document.body.appendChild(icon);
        minimizedIcon = icon;
        return icon;
    }

    // 拖动：rAF 节流 + 过渡关闭（拖动跟手）
    function makeIconDraggable(icon) {
        let dragging = false, offX = 0, offY = 0, rafId = 0, lastEvt = null;
        icon.addEventListener('mousedown', (e) => {
            dragging = true;
            const rect = icon.getBoundingClientRect();
            offX = e.clientX - rect.left;
            offY = e.clientY - rect.top;
            icon.style.cursor = 'grabbing';
            icon.style.opacity = '0.9';
            icon.style.transition = 'none';
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            e.preventDefault();
            e.stopPropagation();
        });
        function onMove(e) {
            if (!dragging) return;
            lastEvt = e;
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = 0;
                if (!dragging || !lastEvt) return;
                const maxX = window.innerWidth - icon.offsetWidth;
                const maxY = window.innerHeight - icon.offsetHeight;
                icon.style.left = Math.max(10, Math.min(lastEvt.clientX - offX, maxX)) + 'px';
                icon.style.top = Math.max(10, Math.min(lastEvt.clientY - offY, maxY)) + 'px';
                icon.style.right = 'auto';
                icon.style.bottom = 'auto';
            });
        }
        function onUp(e) {
            if (!dragging) return;
            dragging = false;
            icon.style.cursor = 'move';
            icon.style.opacity = '1';
            icon.style.transition = 'all 0.3s ease';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            saveMinimizedIconPosition();
            e.preventDefault();
            e.stopPropagation();
        }
    }

    function saveMinimizedIconPosition() {
        if (!minimizedIcon) return;
        try {
            const rect = minimizedIcon.getBoundingClientRect();
            muliSpecialStorage.setItem('redPacketMinimizedIconPosition', JSON.stringify({ x: rect.left, y: rect.top }));
        } catch (e) { }
    }
    function loadMinimizedIconPosition() {
        try {
            const saved = muliSpecialStorage.getItem('redPacketMinimizedIconPosition');
            if (saved && minimizedIcon) {
                const pos = JSON.parse(saved);
                const maxX = window.innerWidth - minimizedIcon.offsetWidth;
                const maxY = window.innerHeight - minimizedIcon.offsetHeight;
                minimizedIcon.style.left = Math.max(10, Math.min(pos.x, maxX)) + 'px';
                minimizedIcon.style.top = Math.max(10, Math.min(pos.y, maxY)) + 'px';
                minimizedIcon.style.right = 'auto';
                minimizedIcon.style.bottom = 'auto';
            }
        } catch (e) { }
    }

    function showIconContextMenu(e) {
        const old = document.querySelector('.' + NS + 'menu');
        if (old) old.remove();
        const menu = document.createElement('div');
        menu.className = NS + 'menu';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        const info = document.createElement('div');
        info.style.cssText = 'padding: 8px 16px; font-size: 12px; color: var(--hb2_text2); border-bottom: 1px solid var(--hb2_border);';
        info.textContent = '红包提醒: ' + alertRedPacketIds.size + ' 个新红包';
        menu.appendChild(info);
        const mkItem = (text, fn, borderTop) => {
            const it = document.createElement('div');
            it.className = NS + 'menu-item';
            it.textContent = text;
            if (borderTop) it.style.borderTop = '1px solid var(--hb2_border)';
            it.addEventListener('click', () => { fn(); menu.remove(); });
            menu.appendChild(it);
        };
        mkItem('展开面板', () => toggleMinimizeMode());
        mkItem('清除提醒', () => {
            clearAlertAnimation();
            alertRedPacketIds.clear();
        });
        mkItem('停靠位置', () => {
            if (minimizedIcon) {
                minimizedIcon.style.left = 'auto';
                minimizedIcon.style.top = 'auto';
                minimizedIcon.style.right = '30px';
                minimizedIcon.style.bottom = '100px';
                saveMinimizedIconPosition();
            }
        }, true);
        document.body.appendChild(menu);
        setTimeout(() => {
            const close = () => { menu.remove(); document.removeEventListener('click', close); };
            document.addEventListener('click', close);
        }, 100);
    }

    function addRedPacketAlert(packetId) {
        if (isMinimized && packetId) {
            alertRedPacketIds.add(packetId);
            startAlertAnimation();
        }
    }
    function delRedPacketAlert(packetId) {
        if (isMinimized && packetId) {
            alertRedPacketIds.delete(packetId);
            if (alertRedPacketIds.size < 1) clearAlertAnimation();
        }
    }

    // 闪烁提醒：JS 翻转背景（渐变不可插值，CSS 动画不可靠——旧版行为，实测有效）
    function startAlertAnimation() {
        if (!minimizedIcon || alertRedPacketIds.size < 1) return;
        if (alertAnimationTimer) return;   // 已在闪
        let isRed = false;
        alertAnimationTimer = setInterval(() => {
            if (!minimizedIcon) return;
            if (isRed) {
                minimizedIcon.style.background = 'linear-gradient(135deg, #ff6b6b, #ff8e53)';
                minimizedIcon.style.boxShadow = '0 6px 20px rgba(255,107,107,0.5)';
            } else {
                minimizedIcon.style.background = 'linear-gradient(135deg, #ff0000, #ff4757)';
                minimizedIcon.style.boxShadow = '0 6px 20px rgba(255,0,0,0.7)';
            }
            isRed = !isRed;
        }, 600);
    }
    function clearAlertAnimation() {
        if (alertAnimationTimer) {
            clearInterval(alertAnimationTimer);
            alertAnimationTimer = null;
        }
        if (minimizedIcon) {
            minimizedIcon.style.background = 'linear-gradient(135deg, #ff6b6b, #ff8e53)';
            minimizedIcon.style.boxShadow = '0 6px 20px rgba(255,107,107,0.5)';
        }
    }

    // ================== 浮窗模式 ==================
    function toggleFloatingWindow() {
        if (!panelEl) return;
        if (isFloatingWindow) restoreToDockedMode();
        else switchToFloatingMode();
        isFloatingWindow = !isFloatingWindow;
        muliSpecialStorage.setItem('redPacketIsFloatingWindow', isFloatingWindow);
    }

    function switchToFloatingMode() {
        floatingWindowData = {
            top: panelEl.offsetTop,
            left: panelEl.offsetLeft
        };
        panelEl.style.cssText = 'position: fixed !important; top: 100px !important; right: 20px !important; width: 340px !important; z-index: 10000 !important; border: 1px solid var(--hb2_border) !important; border-radius: 12px !important; box-shadow: 0 10px 30px rgba(0,0,0,0.2) !important; margin-bottom: 0 !important; max-height: ' + (CONFIG.panelMaxHeight + 70) + 'px !important; overflow: hidden !important; resize: both !important; min-width: 300px !important; min-height: 220px !important;';
        makePanelDraggable(panelEl);
        document.body.appendChild(panelEl);
        muliSpecialStorage.setItem('redPacketFloatingWindowData', JSON.stringify(floatingWindowData || {}));
    }

    function restoreToDockedMode() {
        panelEl.style.cssText = '';
        panelEl.classList.remove(NS + 'dragging');
        panelEl.removeAttribute('data-dragging');
        dockPanel();
        startDockGuard();
    }

    // 面板头部拖动（rAF 节流）
    function makePanelDraggable(panel) {
        const header = panel.firstElementChild;
        if (!header) return;
        header.style.cursor = 'move';
        let dragging = false, offX = 0, offY = 0, rafId = 0, lastEvt = null;
        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            dragging = true;
            const rect = panel.getBoundingClientRect();
            offX = e.clientX - rect.left;
            offY = e.clientY - rect.top;
            panel.classList.add(NS + 'dragging');
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            e.preventDefault();
        });
        function onMove(e) {
            if (!dragging) return;
            lastEvt = e;
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = 0;
                if (!dragging || !lastEvt) return;
                const maxX = window.innerWidth - panel.offsetWidth;
                const maxY = window.innerHeight - panel.offsetHeight;
                panel.style.left = Math.max(0, Math.min(lastEvt.clientX - offX, maxX)) + 'px';
                panel.style.top = Math.max(0, Math.min(lastEvt.clientY - offY, maxY)) + 'px';
                panel.style.right = 'auto';
            });
        }
        function onUp() {
            dragging = false;
            panel.classList.remove(NS + 'dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
    }

    // ================== 配置面板（加宽 + 保存栏吸底） ==================
    let configPanelEl = null;
    let configBackdropEl = null;

    function openConfig() {
        if (!configPanelEl) createConfigPanel();
        initializeConfigForm();
        if (configBackdropEl) configBackdropEl.style.display = 'block';
        configPanelEl.style.display = 'block';
    }

    // 统一关闭（×/保存/点遮罩三处共用）
    function closeConfig() {
        if (configPanelEl) configPanelEl.style.display = 'none';
        if (configBackdropEl) configBackdropEl.style.display = 'none';
    }

    function createConfigPanel() {
        // 毛玻璃遮罩（点遮罩关闭，同消息云弹层）
        configBackdropEl = document.createElement('div');
        configBackdropEl.className = NS + 'config-backdrop';
        configBackdropEl.style.display = 'none';
        configBackdropEl.addEventListener('click', closeConfig);
        document.body.appendChild(configBackdropEl);

        const p = document.createElement('div');
        p.className = NS + 'config';
        p.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); background: var(--hb2_elevated); color: var(--hb2_text); border: 1px solid var(--hb2_border); border-radius: 20px; padding: 20px; z-index: 10002; box-shadow: 0 16px 48px rgba(0,0,0,0.28); width: 640px; max-width: 94vw; max-height: 86vh; overflow-y: auto; display: none;';

        const typeChecks = (cls) => ['拼手气红包', '普通红包', '专属红包', '心跳红包', '石头剪刀布红包'].map(t =>
            `<label style="display:flex;align-items:center;font-size:12px;gap:4px;"><input type="checkbox" class="${cls}" value="${t}">${t}</label>`
        ).join('');

        p.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--hb2_border);">
            <h3 style="margin:0;color:#ff6b6b;font-size:18px;">🎁 红包板块配置</h3>
            <button id="${NS}closeConfig" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--hb2_text2);padding:0;line-height:1;">×</button>
        </div>
        <div class="${NS}section">
            <h4 style="margin:0 0 12px 0;color:var(--hb2_text);font-size:14px;">📊 显示设置</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;">
                <div class="${NS}item"><label style="display:flex;justify-content:space-between;align-items:center;font-size:13px;"><span>最大显示红包数量</span>
                    <input type="number" id="${NS}maxDisplayCount" min="5" max="100" style="width:86px;"></label></div>
                <div class="${NS}item"><label style="display:flex;justify-content:space-between;align-items:center;font-size:13px;"><span>默认可见红包数量</span>
                    <input type="number" id="${NS}visibleCount" min="1" max="20" style="width:86px;"></label></div>
                <div class="${NS}item"><label style="display:flex;justify-content:space-between;align-items:center;font-size:13px;"><span>板块最大高度（px）</span>
                    <input type="number" id="${NS}panelMaxHeight" min="300" max="2000" step="20" style="width:86px;"></label></div>
            </div>
        </div>
        <div class="${NS}section">
            <h4 style="margin:0 0 12px 0;color:var(--hb2_text);font-size:14px;">⚙️ 功能设置</h4>
            <div class="${NS}item"><label style="display:flex;align-items:center;font-size:13px;gap:6px;"><input type="checkbox" id="${NS}monitorNewMessages">实时监听新消息</label></div>
            <div class="${NS}item"><label style="display:flex;align-items:center;font-size:13px;gap:6px;"><input type="checkbox" id="${NS}autoDelRedPackets">自动删除已抢光的红包</label></div>
        </div>
        <div class="${NS}section">
            <h4 style="margin:0 0 12px 0;color:var(--hb2_text);font-size:14px;">🚫 红包类型过滤</h4>
            <div class="${NS}item"><label style="display:flex;align-items:center;font-size:13px;gap:6px;"><input type="checkbox" id="${NS}enableRedPacketFilter">启用红包类型过滤（聊天室隐藏）</label></div>
            <div class="${NS}item"><label style="display:flex;align-items:center;font-size:13px;gap:6px;"><input type="checkbox" id="${NS}enableRedPacketModuleFilter">过滤的红包不进入红包板块</label></div>
            <div style="margin-left:14px;border-left:2px solid var(--hb2_border);padding-left:14px;">
                <p style="margin:0 0 8px 0;font-size:12px;color:var(--hb2_text2);">过滤以下红包类型：</p>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">${typeChecks(NS + 'filter-type')}</div>
            </div>
        </div>
        <div class="${NS}section">
            <h4 style="margin:0 0 12px 0;color:var(--hb2_text);font-size:14px;">🤖 自动抢红包</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;">
                <div class="${NS}item"><label style="display:flex;align-items:center;font-size:13px;gap:6px;"><input type="checkbox" id="${NS}autoUnpackRedPacket">启用自动抢红包</label></div>
                <div class="${NS}item"><label style="display:flex;align-items:center;font-size:13px;gap:6px;"><input type="checkbox" id="${NS}enableAutoUnpackRedPacketText">启用感谢文案</label></div>
                <div class="${NS}item"><label style="display:flex;justify-content:space-between;align-items:center;font-size:13px;"><span>自动抢延迟（3000~10000ms）</span>
                    <input type="number" id="${NS}autoUnpackRedPacketTime" min="3000" max="10000" style="width:86px;"></label></div>
                <div class="${NS}item"><label style="display:flex;justify-content:space-between;align-items:center;font-size:13px;"><span>猜拳超过多少不自动抢</span>
                    <input type="number" id="${NS}autoUnpackRedPacketAmount" min="0" style="width:86px;"></label></div>
                <div class="${NS}item"><label style="display:flex;justify-content:space-between;align-items:center;font-size:13px;"><span>抢到多少积分发感谢</span>
                    <input type="number" id="${NS}autoUnpackRedPacketTextMoney" min="0" style="width:86px;"></label></div>
            </div>
            <div class="${NS}item"><label style="display:flex;align-items:flex-start;font-size:13px;color:#c0392b;gap:6px;"><input type="checkbox" id="${NS}autoUnpackRiskConsent" style="margin-top:2px;">
                <span>我已知晓心跳/石头剪刀布红包<b>可能扣除积分</b>，勾选后自动抢不再弹确认</span></label></div>
            <div class="${NS}item">
                <p style="margin:0 0 8px 0;font-size:12px;color:var(--hb2_text2);line-height:1.8;">
                    变量：{user} 用户名；{count} 红包个数；{num} 已有多少人抢；{money} 抢到金额；{type} 红包类型；{result} 胜负平；{gesture} 我的出拳</p>
                <label style="font-size:12px;color:var(--hb2_text2);">🪣 通用感谢语</label>
                <textarea id="${NS}autoUnpackRedPacketText" style="width:100%;height:64px;margin-top:4px;"></textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="${NS}item"><label style="font-size:12px;color:var(--hb2_text2);">🧎 负分忏悔感谢语</label>
                    <textarea id="${NS}autoUnpackRedPacketLoseText" style="width:100%;height:64px;margin-top:4px;"></textarea></div>
                <div class="${NS}item"><label style="font-size:12px;color:var(--hb2_text2);">⚖️ 猜拳平手感谢语</label>
                    <textarea id="${NS}autoUnpackRedPacketMoraZeroText" style="width:100%;height:64px;margin-top:4px;"></textarea></div>
                <div class="${NS}item"><label style="font-size:12px;color:var(--hb2_text2);">✌️ 猜拳胜利感谢语</label>
                    <textarea id="${NS}autoUnpackRedPacketMoraText" style="width:100%;height:64px;margin-top:4px;"></textarea></div>
                <div class="${NS}item"><label style="font-size:12px;color:var(--hb2_text2);">💗 专属红包感谢语</label>
                    <textarea id="${NS}autoUnpackRedPacketExclusiveText" style="width:100%;height:64px;margin-top:4px;"></textarea></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="${NS}item"><label style="font-size:12px;color:var(--hb2_text2);">💗 专属用户（鱼排id，逗号隔开）</label>
                    <textarea id="${NS}exclusiveUsers" style="width:100%;height:40px;margin-top:4px;"></textarea></div>
                <div class="${NS}item"><label style="font-size:12px;color:var(--hb2_text2);">💗 专属用户称呼（对应上项）</label>
                    <textarea id="${NS}exclusiveUserTexes" style="width:100%;height:40px;margin-top:4px;"></textarea></div>
            </div>
            <div style="margin-left:14px;border-left:2px solid var(--hb2_border);padding-left:14px;">
                <p style="margin:0 0 8px 0;font-size:12px;color:var(--hb2_text2);">自动抢以下红包类型：</p>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">${typeChecks(NS + 'auto-type')}</div>
            </div>
        </div>
        <div class="${NS}section">
            <h4 style="margin:0 0 12px 0;color:var(--hb2_text);font-size:14px;">🎨 外观设置</h4>
            <div class="${NS}item"><label style="display:flex;justify-content:space-between;align-items:center;font-size:13px;"><span>红包板块背景色（留空跟随主题）</span>
                <span style="display:flex;align-items:center;gap:8px;">
                    <input type="color" id="${NS}backgroundColor" value="#ffffff" style="width:52px;height:30px;padding:2px;border:1px solid var(--hb2_border);border-radius:8px;">
                    <input type="text" id="${NS}backgroundColorText" placeholder="留空=跟随主题" style="width:130px;">
                </span></label></div>
        </div>
        <div class="${NS}footer">
            <button id="${NS}resetConfig" class="${NS}btn ${NS}btn-ghost">恢复默认</button>
            <button id="${NS}applyConfig" class="${NS}btn ${NS}btn-primary">保存并应用</button>
        </div>
    `;
        document.body.appendChild(p);
        configPanelEl = p;

        p.querySelector('#' + NS + 'closeConfig').addEventListener('click', closeConfig);
        p.querySelector('#' + NS + 'applyConfig').addEventListener('click', applyConfig);
        p.querySelector('#' + NS + 'resetConfig').addEventListener('click', resetConfig);

        const colorInput = p.querySelector('#' + NS + 'backgroundColor');
        const colorText = p.querySelector('#' + NS + 'backgroundColorText');
        colorInput.addEventListener('input', () => { colorText.value = colorInput.value; });
        colorText.addEventListener('input', () => {
            if (isValidColor(colorText.value)) colorInput.value = colorText.value;
        });
    }

    function isValidColor(color) {
        if (!color) return false;
        const s = new Option().style;
        s.color = color;
        return s.color !== '';
    }

    function initializeConfigForm() {
        if (!configPanelEl) return;
        const $ = (id) => configPanelEl.querySelector('#' + NS + id);
        $('maxDisplayCount').value = CONFIG.maxDisplayCount;
        $('visibleCount').value = CONFIG.visibleCount;
        $('panelMaxHeight').value = CONFIG.panelMaxHeight;
        $('monitorNewMessages').checked = CONFIG.monitorNewMessages;
        $('autoDelRedPackets').checked = CONFIG.autoDelRedPackets;
        $('enableRedPacketFilter').checked = CONFIG.enableRedPacketFilter;
        $('enableRedPacketModuleFilter').checked = CONFIG.enableRedPacketModuleFilter;
        configPanelEl.querySelectorAll('.' + NS + 'filter-type').forEach(cb => {
            cb.checked = CONFIG.filterRedPacketTypes.map(normalizeType).includes(cb.value);
        });
        $('autoUnpackRedPacket').checked = CONFIG.autoUnpackRedPacket;
        $('autoUnpackRiskConsent').checked = !!CONFIG.autoUnpackRiskConsent;
        $('enableAutoUnpackRedPacketText').checked = CONFIG.enableAutoUnpackRedPacketText;
        $('autoUnpackRedPacketTime').value = CONFIG.autoUnpackRedPacketTime;
        $('autoUnpackRedPacketAmount').value = CONFIG.autoUnpackRedPacketAmount;
        $('autoUnpackRedPacketTextMoney').value = CONFIG.autoUnpackRedPacketTextMoney;
        $('autoUnpackRedPacketText').value = CONFIG.autoUnpackRedPacketText;
        $('autoUnpackRedPacketLoseText').value = CONFIG.autoUnpackRedPacketLoseText;
        $('autoUnpackRedPacketMoraZeroText').value = CONFIG.autoUnpackRedPacketMoraZeroText;
        $('autoUnpackRedPacketMoraText').value = CONFIG.autoUnpackRedPacketMoraText;
        $('autoUnpackRedPacketExclusiveText').value = CONFIG.autoUnpackRedPacketExclusiveText;
        $('exclusiveUsers').value = (CONFIG.exclusiveUsers || []).join(',');
        $('exclusiveUserTexes').value = (CONFIG.exclusiveUserTexes || []).join(',');
        configPanelEl.querySelectorAll('.' + NS + 'auto-type').forEach(cb => {
            cb.checked = CONFIG.autoUnpackRedPacketTypes.map(normalizeType).includes(cb.value);
        });
        $('backgroundColor').value = CONFIG.backgroundColor || '#ffffff';
        $('backgroundColorText').value = CONFIG.backgroundColor || '';
    }

    function applyConfig() {
        if (!configPanelEl) return;
        const $ = (id) => configPanelEl.querySelector('#' + NS + id);
        CONFIG.maxDisplayCount = clamp($('maxDisplayCount').value, 5, 100);
        CONFIG.visibleCount = clamp($('visibleCount').value, 1, 20);
        CONFIG.panelMaxHeight = clamp($('panelMaxHeight').value, 300, 2000);
        CONFIG.monitorNewMessages = $('monitorNewMessages').checked;
        CONFIG.autoDelRedPackets = $('autoDelRedPackets').checked;
        CONFIG.enableRedPacketFilter = $('enableRedPacketFilter').checked;
        CONFIG.enableRedPacketModuleFilter = $('enableRedPacketModuleFilter').checked;
        CONFIG.filterRedPacketTypes = [];
        configPanelEl.querySelectorAll('.' + NS + 'filter-type:checked').forEach(cb => CONFIG.filterRedPacketTypes.push(cb.value));
        CONFIG.autoUnpackRedPacket = $('autoUnpackRedPacket').checked;
        CONFIG.autoUnpackRiskConsent = $('autoUnpackRiskConsent').checked;
        CONFIG.enableAutoUnpackRedPacketText = $('enableAutoUnpackRedPacketText').checked;
        CONFIG.autoUnpackRedPacketTime = clamp($('autoUnpackRedPacketTime').value, 3000, 10000);
        CONFIG.autoUnpackRedPacketAmount = Number($('autoUnpackRedPacketAmount').value) || 0;
        CONFIG.autoUnpackRedPacketTextMoney = clamp($('autoUnpackRedPacketTextMoney').value, 200, 1000000);
        CONFIG.autoUnpackRedPacketText = $('autoUnpackRedPacketText').value;
        CONFIG.autoUnpackRedPacketLoseText = $('autoUnpackRedPacketLoseText').value;
        CONFIG.autoUnpackRedPacketMoraZeroText = $('autoUnpackRedPacketMoraZeroText').value;
        CONFIG.autoUnpackRedPacketMoraText = $('autoUnpackRedPacketMoraText').value;
        CONFIG.autoUnpackRedPacketExclusiveText = $('autoUnpackRedPacketExclusiveText').value;
        CONFIG.exclusiveUsers = $('exclusiveUsers').value ? $('exclusiveUsers').value.split(',').map(s => s.trim()).filter(Boolean) : [];
        CONFIG.exclusiveUserTexes = $('exclusiveUserTexes').value ? $('exclusiveUserTexes').value.split(',').map(s => s.trim()).filter(Boolean) : [];
        CONFIG.autoUnpackRedPacketTypes = [];
        configPanelEl.querySelectorAll('.' + NS + 'auto-type:checked').forEach(cb => CONFIG.autoUnpackRedPacketTypes.push(cb.value));
        const colorVal = $('backgroundColorText').value.trim();
        CONFIG.backgroundColor = isValidColor(colorVal) ? colorVal : '';

        saveConfigToStorage();
        updatePanelStyles();
        applyFilter();
        renderList();
        muliShowToast('配置已保存并应用');
        closeConfig();
    }

    // 恢复默认：沿用旧版行为（只重置显示/功能/过滤/外观，自动抢与文案保留）
    function resetConfig() {
        const keep = {};
        ['autoUnpackRedPacket', 'autoUnpackRedPacketTypes', 'autoUnpackRedPacketTime', 'autoUnpackRedPacketAmount',
            'autoUnpackRedPacketText', 'autoUnpackRedPacketLoseText', 'autoUnpackRedPacketMoraZeroText',
            'autoUnpackRedPacketMoraText', 'autoUnpackRedPacketExclusiveText', 'autoUnpackRedPacketTextMoney',
            'enableAutoUnpackRedPacketText', 'exclusiveUsers', 'exclusiveUserTexes', 'autoUnpackRiskConsent'].forEach(k => { keep[k] = CONFIG[k]; });
        Object.assign(CONFIG, JSON.parse(JSON.stringify(DEFAULT_CONFIG)), keep);
        initializeConfigForm();
        saveConfigToStorage();
        updatePanelStyles();
        applyFilter();
        renderList();
        muliShowToast('已恢复默认配置');
    }

    function saveConfigToStorage() {
        try {
            muliSpecialStorage.setItem('redPacketConfig', JSON.stringify(Object.assign({}, CONFIG)));
        } catch (e) { }
    }

    function loadConfigFromStorage() {
        try {
            const saved = muliSpecialStorage.getItem('redPacketConfig');
            if (!saved) return false;
            const parsed = JSON.parse(saved);
            Object.keys(parsed).forEach(key => {
                if (CONFIG.hasOwnProperty(key)) CONFIG[key] = parsed[key];
            });
            // 兼容旧默认（#fff 背景 = 改为跟随主题）
            if (CONFIG.backgroundColor === '#ffffff' || CONFIG.backgroundColor === '#fff') CONFIG.backgroundColor = '';
            // 旧类型名归一化（猜拳红包 → 石头剪刀布红包），去重
            ['filterRedPacketTypes', 'autoUnpackRedPacketTypes'].forEach(k => {
                if (Array.isArray(CONFIG[k])) {
                    CONFIG[k] = Array.from(new Set(CONFIG[k].map(normalizeType)));
                }
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    function updatePanelStyles() {
        if (!panelEl) return;
        const body = panelEl.querySelector('.' + NS + 'body');
        if (body) {
            body.style.maxHeight = (panelExpanded ? CONFIG.panelMaxHeight : collapsedHeight()) + 'px';
        }
        if (CONFIG.backgroundColor) {
            panelEl.style.background = CONFIG.backgroundColor;
        } else {
            panelEl.style.background = '';
        }
    }

    // ================== 初始化 ==================
    function init() {
        loadConfigFromStorage();
        addStyles();

        panelEl = createPanel();
        updatePanelStyles();
        renderList();   // 空态提示（"还没有红包消息"）在初始化时就要出现

        // 装订进侧栏（延迟 1.2s 避开 Vue 水合清节点 + 存活看护）
        setTimeout(() => {
            if (!dockPanel()) {
                const retry = setInterval(() => { if (dockPanel()) clearInterval(retry); }, 1000);
                setTimeout(() => clearInterval(retry), 30000);
            }
            startDockGuard();
        }, 1200);

        Watcher.boot();
        Watcher.scanNow();
        updateModeBadge();
        startStatusSweep();
        HbRealtime.start();   // 实时通道：红包状态真值（got/count）来源

        // 浮窗/最小化状态恢复
        try {
            const floating = muliSpecialStorage.getItem('redPacketIsFloatingWindow');
            if (floating === 'true') {
                setTimeout(() => {
                    if (panelEl) { switchToFloatingMode(); isFloatingWindow = true; }
                }, 1500);
            }
            const savedMinimized = muliSpecialStorage.getItem('redPacketMinimizedState');
            if (savedMinimized === 'true') {
                setTimeout(() => { toggleMinimizeMode(); }, 1800);
            }
        } catch (e) { }

        window.addEventListener('beforeunload', saveMinimizedIconPosition);
        window.addEventListener('resize', () => {
            if (!minimizedIcon) return;
            const rect = minimizedIcon.getBoundingClientRect();
            const maxX = window.innerWidth - minimizedIcon.offsetWidth;
            const maxY = window.innerHeight - minimizedIcon.offsetHeight;
            if (rect.left > maxX || rect.top > maxY) {
                minimizedIcon.style.left = Math.max(10, Math.min(rect.left, maxX)) + 'px';
                minimizedIcon.style.top = Math.max(10, Math.min(rect.top, maxY)) + 'px';
            }
        });

        // 菜单入口（Safari 无 GM_registerMenuCommand 时静默跳过）
        try {
            if (typeof GM_registerMenuCommand === 'function') {
                GM_registerMenuCommand('🧧 红包板块配置', () => openConfig());
            }
        } catch (e) { }
    }

    // ================== 调试接口 ==================
    window.RedPacketManager = {
        rescan() { Watcher.scanNow(); },
        getStats() {
            const stats = { total: redPackets.size, available: 0, empty: 0, watcher: Watcher.currentMode() };
            redPackets.forEach(p => { stats[p.status] = (stats[p.status] || 0) + 1; });
            return stats;
        },
        getPacket(id) { return redPackets.get(id); },
        getConfig() { return Object.assign({}, CONFIG); },
        setConfig(newConfig) {
            Object.assign(CONFIG, newConfig);
            saveConfigToStorage();
            updatePanelStyles();
            applyFilter();
            renderList();
        },
        openConfig() { openConfig(); }
    };

    // ================== 启动 ==================
    TokenStore.install();   // document-start 立即装钩子，尽早捕获页面 token
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
