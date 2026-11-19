// ==UserScript==
// @name         鱼排聊天增强
// @namespace    https://fishpi.cn
// @version      1.0.7
// @description  新版聊天室增强：快捷消息按钮、表情包增强、语录记事本（全新重构版）
// @author       muli
// @match        https://new.fishpi.cn/cr
// @icon         https://file.fishpi.cn/2025/11/blob-4d0e46ad.png?imageView2/1/w/48/h/48/interlace/0/q/100
// @license      MIT
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/mu-xiao-li/yupai-extend-js/main/fishpi_chat_plus.user.js
// @updateURL    https://raw.githubusercontent.com/mu-xiao-li/yupai-extend-js/main/fishpi_chat_plus.user.js
// ==/UserScript==

// 更新
// 2026-11-19 v1.0.7 移除快捷复读按钮 ↲（站点原生 .chat-repeat 已支持直接复读，脚本不再重复实现；
//   收藏 ⭐ 保留，仍走 v3 取原文入记事本）
// 2026-11-18 v1.0.6 Safari 系脚本管理器兼容：GM_addStyle 缺失时降级为 createElement('style') 注入，
//   GM_registerMenuCommand 缺失时静默跳过（功能均有浮块/界面入口，不丢功能）；
//   移除双击头像艾特（站点原生已收编该功能，脚本不再重复实现）；
//   移除双击消息体引用与双击图片引用（站点原生已收编双击引用，脚本不再重复实现）；
//   修复红包误报"接口响应格式异常"：v3 错误响应 code 可能为字符串（unauthorized/captcha 等），
//   改为透出服务端 msg，格式异常时附带状态码+响应原文（前端逆向自线上 bundle）；
//   猜拳红包请求体对齐线上原生（不带 count）；红包金额/个数/留言/手势按 bundle 校验规则（fa）前置校验；
//   发送/复读链路加耗时埋点（console.log：token 段 + fetch 段 + 401 重试标记 + 复读全流程），定位点击后延迟来源；
//   启动时后台预热 token（实测首次点击付 ~393ms 刷新代价：应用首批请求早于钩子安装、捕获不到 Bearer）
// 2026-11-18 v1.0.5 取消api硬拼/api/v3，由配置方自己控制api前缀，脚本只负责定死url
//   凭证双轨自动分流（新旧 token 不通用）：/api/v3/* 带新版 Bearer token + 幂等键，其他站内路径带旧版凭证
//   （Label.csrfToken 头 + Label.node.apiKey 参数 + Cookie），外部域名不带任何凭证，自定义请求头可覆盖；
//   修复单击图片报错（油猴沙箱 window 不能作 MouseEvent 的 view 属性，合成点击已移除 view 参数）
// 2026-11-17 v1.0.5 子按钮弹层超过 9 个自动换列（每列上限 9，以屏幕中间装订位为极限基准），
//   并加视口边界夹取（多列变宽/任意浮块位置下弹层均完整可见）；
//   修复专属红包不弹用户名填写/配置无效（recivers 空串数组归一化过滤 + getUser 响应形态兼容 + 解析失败明确报错）；
//   配置界面新增快速定位栏（一级按钮 chip 一键跳转+闪烁高亮，悬停 chip 弹出子按钮定位，改名实时跟随）；
//   URL请求 POST 增强：参数合法性校验（method 白名单/地址格式/JSON body）、站内请求自动注入 Bearer token（外部域名不携带防泄漏）；
//   修复表情工具条残留：点击表情置入输入框后立即隐藏，hover 追踪改 panel 委托（抗 Vue 重渲染，不再出现空工具条）；
//   记事本改旧版紧凑布局：单行省略条目、主区点击置入输入框（追加末尾+光标归位）、右侧竖排 ➤✎🗑 小按钮、记录来源时间（来自 xx · MM-DD HH:mm）；
//   URL请求升级多请求模式：一按钮配多请求（独立参数/可重复同接口，数组顺序依次执行，整体校验后执行、单条失败不中断），
//   每条支持执行前延迟（定时请求），POST 请求体支持 JSON/表单 urlencoded/纯文本三种类型（专用多请求编辑器 UI）；
//   可视化配置层级明晰化：每卡带「一级/二级」徽标+归属标注（二级显示属于哪个一级），二级区虚线框+归属标签，
//   蓝/橙左边框区分层级；定位跳转改滚卡片头部（避开高卡居中跑偏）+子区索引修正（跳过归属标签行）；
//   修复旧格式配置可视化编辑失效：字符串数组（旧 GET 多条）误判为新格式导致 URL 渲染为空/编辑不保存——迁移判断改为逐条验证对象类型；
//   补可视化→JSON 双向同步（左栏编辑实时刷新 JSON 视图，焦点在 JSON 区时不覆盖）；
//   跟进深浅色模式：UI 配色全面接入新 UI 主题变量（--fp-card/text/border 等中性色，随 data-theme 自动切换），
//   消除硬编码浅色（旧版靠 DarkReader 整页反转故自动适配，新版主题变量体系需显式接入）；
//   按钮配色（蓝/红/橙/绿）保持固定色不跟主题 accent（误跟会把蓝按钮染成品牌棕色，已修复）；
//   URL请求增强：方法扩为 GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS（POST/PUT/PATCH/DELETE 可带请求体），
//   每条请求支持自定义请求头（JSON 对象或每行 k=v，执行时归一化校验，覆盖同名自动头）；
//   站内请求默认头补全（与浏览器端一致）：Authorization Bearer token、Idempotency-Key（settings:/req: 前缀 32hex）、
//   Content-Type（按请求体类型）、Accept、Cookie（credentials:include）；无独立签名机制（v3 即 token+cookie+幂等键）；
//   移除可视化配置的拖拽排序（卡片高易误触且有 bug，调顺序请改右侧 JSON 数组顺序）；修复 methodHasBody 归属错误导致面板设置崩溃；
// 2026-11-17 v1.0.4 URL请求动作新增 POST 支持（method/endpoint/body 三字段，body 为 JSON 校验），
//   旧配置（字符串/数组 = GET 多条）完全兼容，编辑时自动迁移为新格式
// 2026-11-17 v1.0.3 四轮测试优化：toast 提示移到顶部（底部会被浮块遮挡）；按钮放大（13px 字号）且浮动/装订统一三列等宽布局；
//   浮块固定 360px 宽（原运行时测宽会误取整栏宽度撑满屏，已移除）；复读按钮锚定气泡右上角（1/3 悬于气泡外、2/3 在内，避开用户名）；
//   悬停高亮增强（实色高亮+微放大+投影）；装订进侧栏（我的资料与清风明月之间），上下留空收紧；
//   修复装订+刷新后浮块消失：装订延迟 1.2s 避开 Vue 水合清节点，加装订存活看护（被重渲染冲掉自动重新装订）
// 2026-11-17 v1.0.2 三轮测试修复：装订改为进入侧栏（我的资料与清风明月之间，含侧栏未渲染时自动等待）；
//   复读按钮常态化显示、复读/收藏锚定消息气泡对角角心（不受用户名/勋章长短影响）、收藏星移至左下角角心；
//   双击图片引用不再触发图片查看器（延迟放行保留单击看图）；冷却倒计时改角标显示（不撑大按钮）
// 2026-11-17 v1.0.1 二轮测试修复：子按钮改为 hover 自动展开（按浮块屏幕位置智能上下展开）、一级按钮恢复自身动作；
//   表情包三按钮改四角角标（不再挡住表情）；复读/收藏按钮锚定 .message-stack；双击引用绑定 .message-stack 并修复选词干扰；
//   浮块新增回到顶部/装订贴边；拖动 rAF 节流优化；猜拳红包"无"手势默认随机、多条消息逗号分隔连续/延迟发送；
//   双击艾特后自动补空格；按钮统一 5 字等宽（84px）
// 2026-11-17 v1.0.0 全新重构（适配新版聊天室）：
//   双击消息体引用（触发原生引用按钮）、双击头像艾特（修复失效/误进主页）、
//   消息快捷复读 ↲➲ 与语录收藏 ⭐、快捷消息按钮浮块 + 全新配置界面、
//   表情包一键发送/分配/删除、语录记事本、MessageWatcher 统一消息监听单例；
//   发送时自动剥离旧版 md 引用小尾巴（新版小尾巴由后端自动处理，脚本不再实现小尾巴）
//   存储中心本地+云端双写同步（cloudStorage 存在时启用，云端优先、缺失回写，兼容对象/字符串类型差异）
//   注意：发送走 /api/v3/chat/messages，client 固定 "Web/PC网页端"（v3 强校验，无法自定义签名）

(function () {
    'use strict';

    // ================== 常量 ==================
    const API_BASE = 'https://fishpi.cn';
    const CLIENT_US = "Web/沐里爱睡觉";
    const VERSION_US = "v1.0.7";
    const CLIENT_TAG = CLIENT_US + VERSION_US;
    const NS = 'fpcp_';                   // localStorage 前缀
    const DEFAULT_POSITION = { x: 20, y: 20 };

    // ================== 基础工具 ==================
    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

    function el(tag, attrs, children) {
        const node = document.createElement(tag);
        if (attrs) {
            for (const [k, v] of Object.entries(attrs)) {
                if (k === 'class') node.className = v;
                else if (k === 'text') node.textContent = v;
                else if (k === 'html') node.innerHTML = v;
                else if (k === 'style') node.style.cssText = v;
                else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
                else if (v !== null && v !== undefined) node.setAttribute(k, v);
            }
        }
        if (children) {
            (Array.isArray(children) ? children : [children]).forEach(c => {
                if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
            });
        }
        return node;
    }

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function isMobileDevice() {
        try {
            if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') return navigator.userAgentData.mobile;
        } catch (e) { }
        const ua = navigator.userAgent || '';
        if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)) return true;
        if (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1) return true;
        return false;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ================== 轻提示 ==================
    let toastTimer = null;
    function toast(msg, duration = 1800) {
        let box = $('#fpcp-toast');
        if (!box) {
            box = el('div', { id: 'fpcp-toast' });
            document.body.appendChild(box);
        }
        box.textContent = String(msg ?? '');
        box.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => box.classList.remove('show'), duration);
    }

    // ================== 存储中心（本地 + 云端双写同步） ==================
    // cloudStorage 属于云端存储，仅在部分场景可用，必须每次 typeof 判断存在后再使用；
    // 与本地存储存在类型差异：cloudStorage.getItem 可能直接返回对象，须归一化为字符串再解析；
    // 两端存取均为字符串，对象类型由本层统一 JSON 序列化/反序列化（对应旧版 muliSpecialStorage 约定）。
    // 读取优先级：云端优先（跨设备同步）→ 云端无有效值时回退本地，并把本地值回写云端 → 默认值。
    const Store = {
        // 云端存储可用性（特殊场景才存在，不能缓存结果，须每次判断）
        hasCloud() {
            try { return typeof cloudStorage !== 'undefined' && cloudStorage !== null; } catch (e) { return false; }
        },

        // 有效原始值判断（排除 null/空串/'undefined'/'null' 等假值字符串）
        _valid(raw) {
            return raw !== null && raw !== undefined && raw !== ''
                && raw !== 'undefined' && raw !== 'null';
        },

        // 归一化：cloudStorage 可能返回对象，统一转成 JSON 字符串
        _normalize(data) {
            if (data && typeof data === 'object') {
                try { return JSON.stringify(data); } catch (e) { return null; }
            }
            return data;
        },

        // 写入：云端 + 本地双写（两端都存 JSON 字符串）
        set(key, val) {
            let raw;
            try { raw = JSON.stringify(val); } catch (e) { return; }
            if (raw === undefined) return;   // JSON.stringify(undefined) === undefined
            if (this.hasCloud()) {
                try { cloudStorage.setItem(NS + key, raw); } catch (e) { }
            }
            try { localStorage.setItem(NS + key, raw); } catch (e) { }
        },

        // 读取：云端优先 → 本地回退（并回写云端）→ 默认值
        get(key, def) {
            let raw = null;
            if (this.hasCloud()) {
                try { raw = this._normalize(cloudStorage.getItem(NS + key, null)); } catch (e) { raw = null; }
            }
            if (!this._valid(raw)) {
                try { raw = localStorage.getItem(NS + key); } catch (e) { raw = null; }
                // 本地存在、云端不存在（常见于云端不可用期间写入的数据），同步到云端
                if (this._valid(raw) && this.hasCloud()) {
                    try { cloudStorage.setItem(NS + key, raw); } catch (e) { }
                }
            }
            if (!this._valid(raw)) return def;
            try {
                const parsed = JSON.parse(raw);
                return parsed === null || parsed === undefined ? def : parsed;
            } catch (e) {
                return def;
            }
        },

        // 删除：云端 + 本地同删
        del(key) {
            if (this.hasCloud()) {
                try { cloudStorage.removeItem(NS + key); } catch (e) { }
            }
            try { localStorage.removeItem(NS + key); } catch (e) { }
        }
    };

    // ================== 旧版小尾巴剥离 ==================
    // 旧版脚本小尾巴签名：消息末尾「> + 两个空格」开头的行（被引用包裹后形如 「> >  文本」）
    const OLD_TAIL_LINE = /^(?:> )*> {2}/;
    function stripOldTail(content) {
        const lines = String(content ?? '').split('\n');
        let end = lines.length;
        while (end > 0 && OLD_TAIL_LINE.test(lines[end - 1])) end--;
        if (end === lines.length) return String(content ?? '');
        return lines.slice(0, end).join('\n').replace(/\s+$/, '');
    }

    // ================== Idempotency-Key ==================
    function idemKey(prefix) {
        const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
        return `fpcp:${prefix}:${hex}`;   // 匹配 /^[A-Za-z0-9._:-]{1,128}$/
    }

    // ================== Api 模块 ==================
    const Api = {
        _token: null,
        _refreshing: null,

        // 获取 accessToken（优先直调 refresh 端点；失败时 fetch 钩子会捕获应用自身的 Bearer 兜底）
        async token(force) {
            if (this._token && !force) return this._token;
            if (this._refreshing) return this._refreshing;
            this._refreshing = (async () => {
                const t0 = performance.now();
                const rsp = await fetch(`${API_BASE}/api/v3/auth/refresh`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}'
                });
                const j = await rsp.json().catch(() => null);
                const ms = (performance.now() - t0).toFixed(0);
                if (j && j.code === 0 && j.data && typeof j.data.accessToken === 'string') {
                    this._token = j.data.accessToken;
                    // console.log(`[fpcp] token 刷新成功 ${ms}ms`);
                    return this._token;
                }
                // console.log(`[fpcp] token 刷新失败 ${ms}ms status=${rsp.status}`);
                throw new Error('accessToken 获取失败');
            })().finally(() => { this._refreshing = null; });
            return this._refreshing;
        },

        // 通用 v3 请求：自动带 Bearer，401 自动刷新一次
        async req(path, opt = {}) {
            const { __forceToken, ...fetchOpt } = opt;
            let tokenMs = 0, fetchMs = 0, retried = false;
            const doFetch = async () => {
                const t1 = performance.now();
                const token = await this.token(!!__forceToken);
                tokenMs += performance.now() - t1;
                const headers = Object.assign({ 'Content-Type': 'application/json' }, fetchOpt.headers || {}, {
                    'Authorization': `Bearer ${token}`
                });
                const t2 = performance.now();
                const rsp = await fetch(API_BASE + path, Object.assign({}, fetchOpt, { headers, credentials: 'include' }));
                fetchMs += performance.now() - t2;
                return rsp;
            };
            const t0 = performance.now();
            let rsp = await doFetch();
            if (rsp.status === 401) {
                this._token = null;
                retried = true;
                rsp = await doFetch();
            }
            // 耗时埋点：token 段（含刷新/401 重试）与 API 往返分开计，定位"点击后延迟"来源
            // console.log(`[fpcp] ${fetchOpt.method || 'GET'} ${path} 总${(performance.now() - t0).toFixed(0)}ms = token ${tokenMs.toFixed(0)}ms + fetch ${fetchMs.toFixed(0)}ms，status=${rsp.status}${retried ? '（401已重试）' : ''}`);
            // 先读文本再解析。v3 错误响应的 code 可能是字符串（如 unauthorized/captcha——
            // 线上 bundle http 客户端按 String(code) 处理），只有缺 code/非 JSON 才算格式异常；
            // 有 code 一律走业务报错透出服务端 msg，不再把字符串码误报成"格式异常"
            const text = await rsp.text().catch(() => '');
            let j = null;
            try { j = JSON.parse(text); } catch (e) { /* 非 JSON（HTML/空响应）走下方报错 */ }
            if (!j || typeof j !== 'object' || j.code === undefined || j.code === null) {
                throw new Error(`接口响应格式异常(${rsp.status}): ${text.slice(0, 200) || '(空响应)'}`);
            }
            if (j.code !== 0) throw new Error(j.msg || `请求失败(${j.code})`);
            return j.data;
        },

        // 发送聊天消息（content 尾部旧尾巴会在 fetch 钩子里统一剥离）
        send(content) {
            return this.req('/api/v3/chat/messages', {
                method: 'POST',
                headers: { 'Idempotency-Key': idemKey('chat') },
                body: JSON.stringify({ content: String(content ?? ''), client: CLIENT_TAG })
            });
        },

        // 获取消息（含原始 markdown：content 字段）
        getMessage(id) {
            return this.req(`/api/v3/chat/messages/${encodeURIComponent(id)}`);
        },

        // 用户名 -> 用户信息（专属红包收件人解析）；兼容包装/裸对象两种响应形态
        async getUser(name) {
            const d = await this.req(`/api/v3/users/${encodeURIComponent(name)}`);
            // 响应可能是 {code,data:{id,…}} 解包后的 {id,…}，也可能再嵌一层
            const u = (d && d.id !== undefined) ? d : ((d && d.data && d.data.id !== undefined) ? d.data : null);
            if (!u || u.id === undefined || u.id === null) throw new Error('用户信息格式异常');
            return u;
        },

        // 发红包
        // cfg: {type, money, message, count?, recipientIds?, gesture?, riskAccepted?}
        sendRedPacket(cfg) {
            return this.req('/api/v3/chat/red-packets', {
                method: 'POST',
                headers: { 'Idempotency-Key': idemKey('rp') },
                body: JSON.stringify(cfg)
            });
        },

        // ---- 表情包（/api/v3/me/settings/emoji-groups）----
        emojiGroups() {
            return this.req('/api/v3/me/settings/emoji-groups');
        },
        emojiList(groupId) {
            return this.req(`/api/v3/me/settings/emoji-groups/${encodeURIComponent(groupId)}/emojis?order=manual`);
        },
        emojiAdd(groupId, payload) {
            // payload: {url, name, sort}
            const path = groupId
                ? `/api/v3/me/settings/emoji-groups/${encodeURIComponent(groupId)}/emojis`
                : '/api/v3/me/settings/emojis';
            return this.req(path, {
                method: 'POST',
                headers: { 'Idempotency-Key': idemKey('emoji') },
                body: JSON.stringify(payload)
            });
        },
        emojiDel(groupId, emojiId) {
            return this.req(`/api/v3/me/settings/emoji-groups/${encodeURIComponent(groupId)}/emojis/${encodeURIComponent(emojiId)}`, {
                method: 'DELETE',
                headers: { 'Idempotency-Key': idemKey('emoji') }
            });
        },
        emojiGroupCreate(payload) {
            // payload: {name, sort}
            return this.req('/api/v3/me/settings/emoji-groups', {
                method: 'POST',
                headers: { 'Idempotency-Key': idemKey('eg') },
                body: JSON.stringify(payload)
            });
        }
    };

    // ================== fetch 钩子（集中唯一的侵入点） ==================
    // 1) 发消息时剥离内容尾部的旧版 md 引用小尾巴
    // 2) 捕获应用自身请求里的 Bearer token（refresh 直调失败时的兜底）
    function installFetchHook() {
        const origFetch = window.fetch;
        window.fetch = function (input, init) {
            try {
                // 捕获 token
                let auth = null;
                if (init && init.headers) {
                    const h = new Headers(init.headers);
                    auth = h.get('Authorization');
                } else if (input && typeof input.headers !== 'undefined') {
                    try { auth = new Headers(input.headers).get('Authorization'); } catch (e) { }
                }
                if (auth && auth.startsWith('Bearer ')) Api._token = auth.slice(7);

                // 发消息去旧尾巴
                const url = typeof input === 'string' ? input : (input && input.url) || '';
                const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
                if (method === 'POST' && /\/api\/v3\/chat\/messages\/?$/.test(url) && init && typeof init.body === 'string') {
                    const body = JSON.parse(init.body);
                    if (body && typeof body.content === 'string') {
                        const stripped = stripOldTail(body.content);
                        if (stripped !== body.content) {
                            body.content = stripped;
                            init = Object.assign({}, init, { body: JSON.stringify(body) });
                        }
                    }
                }
            } catch (e) {
                // 钩子内部异常不影响原始请求
            }
            return origFetch.call(this, input, init);
        };
    }

    // ================== MessageWatcher（全脚本唯一消息监听单例） ==================
    // 唯一一个 MutationObserver + rAF 合批；所有需要感知 DOM 的模块共用这一个监听线程
    const MessageWatcher = (() => {
        const handlers = [];          // { id, fn }
        let pending = new Set();      // 待处理的新增节点
        let scheduled = false;
        let observer = null;

        function flush() {
            scheduled = false;
            const nodes = Array.from(pending);
            pending.clear();
            if (nodes.length === 0) return;
            for (const h of handlers) {
                try { h.fn(nodes); } catch (e) { console.warn('[fishpi_chat_plus] watcher handler error:', e); }
            }
        }

        function schedule(node) {
            pending.add(node);
            if (!scheduled) {
                scheduled = true;
                requestAnimationFrame(flush);
            }
        }

        function start() {
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

        return {
            start,
            // 订阅 DOM 新增节点（返回取消函数）
            on(fn) {
                const item = { id: Math.random().toString(36).slice(2), fn };
                handlers.push(item);
                return () => {
                    const i = handlers.indexOf(item);
                    if (i >= 0) handlers.splice(i, 1);
                };
            },
            // 立即对现存 DOM 跑一遍（初始化时补扫）
            scanNow() {
                const root = document.body;
                if (!root) return;
                const fake = [root];
                for (const h of handlers) {
                    try { h.fn(fake); } catch (e) { console.warn('[fishpi_chat_plus] watcher handler error:', e); }
                }
            }
        };
    })();

    // ================== 消息 DOM 解析 ==================
    // 新版消息结构：
    // div.chat-message-entry > article.fp-msg#chatroom<id>
    //   > a.fp-avatar-frame[href=/member/xxx] > img.fp-avatar
    //   > div.message-stack > div.head(.chat-author > button.name.name--mention)
    //     + div.fp-bubble > div.vditor-reset.body  + p.fp-chat-tail
    //     + div.foot > time / .message-reactions / .actions
    const MsgDom = {
        // 从任意节点向上找到消息容器
        entryOf(node) {
            if (!node || !node.closest) return null;
            return node.closest('.chat-message-entry') || node.closest('article.fp-msg');
        },
        // 提取消息信息；entry 为 article 或其子节点均可
        parse(entry) {
            const article = entry && entry.matches && entry.matches('article.fp-msg') ? entry : (entry && entry.querySelector ? entry.querySelector('article.fp-msg') : null);
            if (!article) return null;
            const rawId = article.id || '';
            const id = rawId.startsWith('chatroom') ? rawId.slice(8) : '';
            const avatarLink = article.querySelector('a.fp-avatar-frame');
            let userName = '';
            if (avatarLink) {
                userName = avatarLink.getAttribute('data-user-card') || '';
                if (!userName) {
                    const href = avatarLink.getAttribute('href') || '';
                    const m = href.match(/\/member\/([^/?#]+)/);
                    if (m) userName = decodeURIComponent(m[1]);
                }
            }
            const nameEl = article.querySelector('.chat-author-name');
            const nickname = nameEl ? nameEl.textContent.trim() : '';
            const body = article.querySelector('.fp-bubble .vditor-reset.body');
            return {
                article,
                id,
                userName,
                nickname,
                isSelf: article.classList.contains('is-self'),
                body
            };
        }
    };

    // ================== 编辑器工具 ==================
    // 新版编辑器是 Vditor contenteditable（.vditor-ir > pre.vditor-reset）
    function getEditorEl() {
        return document.querySelector('.vditor-ir .vditor-reset[contenteditable="true"]')
            || document.querySelector('.vditor-wysiwyg .vditor-reset[contenteditable="true"]')
            || document.querySelector('.vditor-sv .vditor-reset[contenteditable="true"]');
    }

    // 向输入框插入文本（光标处/末尾），触发 input 事件让 Vditor 感知
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

    // ================== 消息快捷按钮：收藏 ⭐ ==================
    const MessageActions = {
        init() {
            // 新消息到达时挂按钮（订阅唯一的 MessageWatcher）
            MessageWatcher.on(nodes => {
                for (const node of nodes) {
                    if (!(node instanceof Element)) continue;
                    const articles = [];
                    if (node.matches && node.matches('article.fp-msg')) articles.push(node);
                    if (node.querySelectorAll) articles.push(...node.querySelectorAll('article.fp-msg'));
                    for (const article of articles) this.decorate(article);
                }
            });
        },

        decorate(article) {
            if (article.dataset.fpcpDecorated === '1') return;
            article.dataset.fpcpDecorated = '1';
            if (article.classList.contains('is-self')) return;   // 自己的消息不挂收藏

            // 按钮挂在消息气泡（fp-bubble）对角上——气泡位置由内容决定，
            // 不受用户名/勋章长短影响，位置直观可预测
            const bubble = article.querySelector('.fp-bubble') || article.querySelector('.message-stack');
            if (!bubble) return;

            // 收藏按钮（气泡左下角角心，小星星 ⭐）
            const favBtn = el('button', {
                class: 'fpcp-msg-btn fpcp-fav-btn',
                title: '收藏到语录记事本',
                text: '⭐',
                onclick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.favorite(article);
                }
            });

            bubble.appendChild(favBtn);
        },

        // 收藏：取消息原文（原始 markdown）→ 入记事本
        async favorite(article) {
            const info = MsgDom.parse(article);
            if (!info || !info.id) return;
            try {
                const msg = await Api.getMessage(info.id);
                const content = stripOldTail(msg.content || '');
                if (!content.trim()) {
                    toast('消息内容为空，无法收藏');
                    return;
                }
                Notepad.addFromMessage(content, info.nickname || info.userName);
            } catch (e) {
                toast('收藏失败：' + (e && e.message ? e.message : e));
            }
        }
    };

    // ================== URL 请求配置归一化 ==================
    // 统一归一化为数组：[{method, endpoint, bodyType, body, delay}]
    // 兼容旧格式：字符串（逗号分隔）/字符串数组 = GET 多条；单对象 = 单请求；对象数组 = 多请求
    function normalizeUrlRequests(params) {
        const toItem = (m, ep, bodyType, body, delay, headers) => ({
            method: String(m || 'GET').toUpperCase(),
            endpoint: String(ep ?? '').trim(),
            bodyType: ['json', 'form', 'text'].includes(bodyType) ? bodyType : 'json',
            body: body == null ? '' : String(body),
            delay: Math.max(0, Number(delay) || 0),
            headers: normalizeHeaders(headers)
        });
        if (!params) return [];
        if (typeof params === 'string') {
            return params.split(',').map(s => s.trim()).filter(Boolean).map(ep => toItem('GET', ep));
        }
        if (Array.isArray(params)) {
            return params
                .map(p => typeof p === 'string'
                    ? toItem('GET', p)
                    : (p && typeof p === 'object' ? toItem(p.method, p.endpoint, p.bodyType, p.body, p.delay, p.headers) : null))
                .filter(Boolean);
        }
        if (typeof params === 'object') {
            return [toItem(params.method, params.endpoint, params.bodyType, params.body, params.delay, params.headers)];
        }
        return [];
    }

    // 请求头归一化为对象：支持对象 / JSON 字符串 / "k=v"换行文本；非法返回 null（校验时拦截）
    function normalizeHeaders(headers) {
        if (headers == null || headers === '') return {};
        if (typeof headers === 'object' && !Array.isArray(headers)) return headers;
        if (typeof headers === 'string') {
            const t = headers.trim();
            if (!t) return {};
            if (t.startsWith('{')) {
                try {
                    const obj = JSON.parse(t);
                    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : null;
                } catch (e) { return null; }
            }
            // k=v 每行一对
            const obj = {};
            for (const line of t.split('\n')) {
                const idx = line.indexOf('=');
                if (idx <= 0) return null;
                obj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
            }
            return obj;
        }
        return null;
    }

    // 请求体类型 → Content-Type
    function bodyTypeContentType(bodyType) {
        return bodyType === 'form' ? 'application/x-www-form-urlencoded'
            : bodyType === 'text' ? 'text/plain'
                : 'application/json';
    }

    // 允许携带请求体的方法（动作执行器/配置编辑器共用）
    function methodHasBody(method) {
        return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method).toUpperCase());
    }

    // ================== 动作执行器 ==================
    // 动作类型全集（兼容旧版配置 JSON）：
    //   sendMsg / sendRedPacketMsg / sendIconTextMsg / promptAndIconTextMsg
    //   promptAndSend / fetchPrivate / muliRefreshPage / customCode
    const ActionExecutor = {
        async execute(actionConfig) {
            if (!actionConfig) return;
            if (typeof actionConfig === 'function') return actionConfig();
            const type = actionConfig.type;
            const params = actionConfig.params;
            try {
                switch (type) {
                    case 'sendMsg': return await this.sendMsg(actionConfig);
                    case 'sendRedPacketMsg': return await this.sendRedPacket(params);
                    case 'sendIconTextMsg': return await this.sendIconTextMsg(typeof params === 'string' ? params.split('|') : params);
                    case 'promptAndIconTextMsg': return await this.promptAndIconTextMsg(params);
                    case 'promptAndSend': return await this.promptAndSend(params);
                    case 'fetchPrivate': return await this.fetchPrivate(params);
                    case 'muliRefreshPage': return await this.muliRefreshPage(params);
                    case 'customCode': return await this.customCode(params);
                    default:
                        console.warn('[fishpi_chat_plus] 未知动作类型:', type);
                }
            } catch (e) {
                console.error('[fishpi_chat_plus] 动作执行失败:', e);
                toast('动作执行失败：' + (e && e.message ? e.message : e));
            }
        },

        // 发消息（支持多条 + 延迟）
        async sendMsg(actionConfig) {
            const params = actionConfig.params;
            const delay = Number(actionConfig.delay) || 0;
            if (typeof params === 'string') {
                await Api.send(params);
            } else if (Array.isArray(params)) {
                for (let i = 0; i < params.length; i++) {
                    await Api.send(params[i]);
                    if (delay > 0 && i < params.length - 1) await sleep(delay);
                }
            } else {
                throw new Error('sendMsg 参数错误');
            }
        },

        // 发红包（v3 正规 API）
        async sendRedPacket(p) {
            if (!p || typeof p !== 'object') throw new Error('sendRedPacketMsg 参数错误');
            const typeMap = {
                '拼手气红包': 'random', '普通红包': 'average', '专属红包': 'specify',
                '心跳红包': 'heartbeat', '猜拳红包': 'rockPaperScissors',
                'random': 'random', 'average': 'average', 'specify': 'specify',
                'heartbeat': 'heartbeat', 'rockPaperScissors': 'rockPaperScissors'
            };
            const type = typeMap[p.type] || p.type;
            if (!['random', 'average', 'specify', 'heartbeat', 'rockPaperScissors'].includes(type)) {
                throw new Error('红包类型不正确');
            }
            const gestureMap = { '石头': 0, '剪刀': 1, '布': 2, '0': 0, '1': 1, '2': 2 };
            const cfg = { type, money: Number(p.money), message: String(p.msg ?? p.message ?? '摸鱼者事尽成') };
            // 手势：'无' 或留空默认随机（与旧版一致）
            const gestureRandom = () => Math.floor(Math.random() * 3);
            // 线上 bundle 请求体硬校验（fa 函数）前置化：金额 32-10240 整数、猜拳 ≥256，
            // 留言有效字符（中英文/数字/常用标点）≤20——非法配置直接明确报错，不再靠服务端 422
            const minMoney = type === 'rockPaperScissors' ? 256 : 32;
            if (!Number.isSafeInteger(cfg.money) || cfg.money < minMoney || cfg.money > 10240) {
                const input = prompt(`请输入红包金额（${minMoney}-10240 整数）：`, '256');
                if (input === null || input === '') return;
                cfg.money = Number(input);
            }
            if (!Number.isSafeInteger(cfg.money) || cfg.money < minMoney || cfg.money > 10240) {
                throw new Error(`红包金额需为 ${minMoney}-10240 的整数`);
            }
            const effectiveLen = cfg.message.replace(/[^0-9a-zA-Z一-龥,，.。！!?？《》 ]/gu, '').length;
            if (cfg.message.length > 4096 || effectiveLen > 20) {
                throw new Error('红包留言超限：总长 ≤4096，且有效字符（中英文/数字/常用标点）≤20');
            }
            if (type === 'specify') {
                // 专属红包：用户名 → 用户ID（v3 用 recipientIds）
                // 归一化：数组里的空串/空白一并过滤（旧配置 recivers:[''] 会跳过填写流程直接报错）
                const rawList = Array.isArray(p.recivers) ? p.recivers : String(p.recivers || '').split(/[,，]/);
                const recivers = rawList.map(s => String(s).trim()).filter(Boolean);
                if (recivers.length === 0) {
                    const input = prompt('请输入专属用户名：', 'muli');
                    if (input === null || input === '') return;
                    const name = input.trim();
                    if (!name) return;
                    recivers.push(name);
                }
                const ids = [];
                for (const name of recivers) {
                    try {
                        const u = await Api.getUser(name);
                        const id = u && u.id;
                        if (id === undefined || id === null) throw new Error('返回数据无用户ID');
                        ids.push(id);
                    } catch (e) {
                        toast(`专属用户「${name}」解析失败：${e && e.message ? e.message : e}`);
                        return;
                    }
                }
                cfg.recipientIds = ids;
            } else if (type !== 'rockPaperScissors') {
                // 猜拳红包不带 count（对齐线上原生请求体：fa 只发 type/money/message/riskAccepted/gesture，
                // count 若存在必须为 1，原生构造时不带）；其他类型 count 必填 1-100（心跳 5-100）
                cfg.count = Number(p.count) || (type === 'heartbeat' ? 5 : 1);
                const minCount = type === 'heartbeat' ? 5 : 1;
                if (!Number.isSafeInteger(cfg.count) || cfg.count < minCount || cfg.count > 100) {
                    throw new Error(`红包个数需为 ${minCount}-100 的整数`);
                }
            }
            if (type === 'rockPaperScissors') {
                let gesture;
                if (p.gesture === '无' || p.gesture === '' || p.gesture === undefined || p.gesture === null) {
                    gesture = gestureRandom();   // 默认随机手势
                } else {
                    gesture = gestureMap[p.gesture];
                    if (gesture === undefined) {
                        const input = prompt('请输入：石头（0）、剪刀（1）、布（2）', '0');
                        if (input === null || input === '') return;
                        gesture = Number(input);
                    }
                }
                if (!Number.isSafeInteger(gesture) || gesture < 0 || gesture > 2) {
                    throw new Error('手势需为 0-2（石头/剪刀/布）');
                }
                cfg.gesture = gesture;
                cfg.riskAccepted = true;
            }
            if (type === 'heartbeat') cfg.riskAccepted = true;
            await Api.sendRedPacket(cfg);
            toast('红包已发送');
        },

        // 个性化文字图片消息（fishpi.cn/gen 生成）
        async sendIconTextMsg(parts) {
            let [msg, avatar, backcolor, fontcolor] = Array.isArray(parts) ? parts : [];
            if (!msg || msg === 'null') msg = '摸鱼真开心！！！';
            if (!avatar || avatar === 'null') avatar = this.getSelfAvatar();
            if (!backcolor || backcolor === 'null') backcolor = '9a808f,ffffff';
            if (!fontcolor || fontcolor === 'null') fontcolor = 'ffffff,9a808f,9a808f';
            const url = `https://fishpi.cn/gen?ver=0.1&scale=1.5&txt=${encodeURIComponent(msg)}&url=${encodeURIComponent(avatar)}&backcolor=${encodeURIComponent(backcolor)}&fontcolor=${encodeURIComponent(fontcolor)}`;
            await Api.send(`![](${url})`);
        },

        async promptAndIconTextMsg(p) {
            const def = (p && p.defaultValue) || '消息|null|null|null';
            const input = prompt('请输入：消息|头像（用户名或图片链接）|背景|字体', def);
            if (input === null) return;
            await this.sendIconTextMsg(String(input).split('|'));
        },

        // 输入 + 发送（${input} / ${input1},${input2}… 占位）
        async promptAndSend(p) {
            const input = prompt((p && p.promptText) || '请输入', (p && p.defaultValue) || '');
            if (input === null) return;
            const parts = String(input).split(',').map(s => s.trim());
            let seq = 0;
            const filled = String(p.actionCode).replace(/\$\{input(\d+)?\}/g, (_m, n) => {
                if (n) return parts[Number(n) - 1] !== undefined ? parts[Number(n) - 1] : '';
                const val = parts[seq] !== undefined ? parts[seq] : '';
                seq++;
                return val;
            });
            await Api.send(filled);
        },

        // URL 请求：支持多请求按配置顺序依次执行（每条独立参数，可重复同一接口），
        // 每条可设执行前延迟（定时请求）；POST 请求体支持 JSON/表单/纯文本多种类型；
        // 同站请求自动注入 Bearer token；旧配置完全兼容（字符串/数组=GET多条、单对象=单请求）
        async fetchPrivate(params) {
            const requests = normalizeUrlRequests(params);
            if (requests.length === 0) throw new Error('URL请求参数错误');

            // 先整体校验（配置错误时不发出任何请求）
            requests.forEach((r, i) => {
                const no = `第${i + 1}条`;
                if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(r.method)) throw new Error(`${no}：不支持的请求方法 ${r.method}`);
                if (!r.endpoint) throw new Error(`${no}：请求地址不能为空`);
                if (!/^(https?:\/\/|\/)/i.test(r.endpoint)) throw new Error(`${no}：地址须以 http(s):// 或 / 开头`);
                if (r.delay < 0) throw new Error(`${no}：延迟不能为负数`);
                if (r.headers === null) throw new Error(`${no}：请求头格式不合法（JSON 对象或每行 k=v）`);
                if (methodHasBody(r.method)) this.buildRequestBody(r, no);   // 请求体类型校验
            });

            // 依序执行（配置错误已在上面整体拦截；执行中单条失败不中断后续）
            let okCount = 0;
            for (let i = 0; i < requests.length; i++) {
                const r = requests[i];
                const tag = requests.length > 1 ? `(${i + 1}/${requests.length})` : '';
                if (r.delay > 0) await sleep(r.delay);   // 定时：该条执行前等待
                try {
                    const body = methodHasBody(r.method) ? this.buildRequestBody(r) : null;
                    const opt = await this.buildFetchOpt(r.method, r.endpoint, body, bodyTypeContentType(r.bodyType), r.headers);
                    const rsp = await fetch(opt.url, opt.init);
                    if (!rsp.ok) toast(`URL请求${tag}：HTTP ${rsp.status}`);
                    else okCount++;
                } catch (e) {
                    toast(`URL请求${tag} 失败：${e && e.message ? e.message : e}`);
                }
            }
            if (requests.length === 1 && okCount === 1) toast('URL请求已发送');
            else if (okCount > 1) toast(`已依次执行 ${okCount}/${requests.length} 个请求`);
        },

        // 按请求体类型构造 body（json 校验合法性 / form 校验 k=v 形态 / text 原样）
        buildRequestBody(r, no = '') {
            const raw = String(r.body ?? '');
            switch (r.bodyType) {
                case 'form': {
                    const t = raw.trim();
                    if (t.startsWith('{') || t.startsWith('[')) throw new Error(`${no}表单请求体应为 a=1&b=2 格式`);
                    return t || '';
                }
                case 'text':
                    return raw;
                case 'json':
                default: {
                    const t = raw.trim();
                    if (!t) return '{}';
                    try {
                        JSON.parse(t);
                    } catch (e) {
                        throw new Error(`${no}请求体不是合法 JSON`);
                    }
                    return t;
                }
            }
        },

        // 构造请求：按接口代际自动选凭证体系（两套 token 不通用，不能瞎带）
        //   /api/v3/*  → 新版：Bearer accessToken（/api/v3/auth/refresh 签发）+ Idempotency-Key
        //   其他站内   → 旧版：cookie 会话 + csrfToken 头 + apiKey 查询参数（Label 存在时，如旧版页面）
        // 外部域名不携带任何凭证，防泄漏；用户配置的自定义请求头永远最后覆盖
        async buildFetchOpt(method, ep, body, contentType, customHeaders) {
            let url = this.buildUrl(ep);
            const init = { method, credentials: 'include' };
            const isSameSite = /^https:\/\/(www\.)?fishpi\.cn(\/|$)/i.test(url) || url.startsWith(location.origin);
            const headers = {};
            if (isSameSite) {
                if (/\/api\/v3\//.test(url)) {
                    // ---- 新版 v3：Bearer token + 写操作幂等键 ----
                    try {
                        const token = await Api.token();
                        if (token) headers['Authorization'] = `Bearer ${token}`;
                    } catch (e) {
                        console.warn('[fishpi_chat_plus] URL请求未取到 token，按无凭证发送:', e);
                    }
                    if (methodHasBody(method)) {
                        headers['Idempotency-Key'] = this.makeIdemKey(url);
                    }
                } else {
                    // ---- 旧版接口：csrfToken 头 + apiKey 参数（Label 存在时自动带；cookie 会话始终带）----
                    try {
                        const L = typeof Label !== 'undefined' ? Label : null;
                        if (L) {
                            if (L.csrfToken) headers['csrfToken'] = L.csrfToken;
                            if (L.node && L.node.apiKey) {
                                url += (url.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(L.node.apiKey);
                            }
                        }
                    } catch (e) {
                        console.warn('[fishpi_chat_plus] 旧版凭证读取失败，按纯 cookie 发送:', e);
                    }
                }
            }
            headers['Accept'] = '*/*';
            if (body !== null && body !== undefined) {
                headers['Content-Type'] = contentType || 'application/json';
                init.body = body;
            }
            // 自定义请求头合并（覆盖同名自动头）
            if (customHeaders && typeof customHeaders === 'object') {
                for (const [k, v] of Object.entries(customHeaders)) {
                    if (k && v != null) headers[k] = String(v);
                }
            }
            if (Object.keys(headers).length > 0) init.headers = headers;
            return { url, init };
        },

        // 幂等键：settings 路径用 settings: 前缀（与站点浏览器端一致），其余用 req: 前缀
        makeIdemKey(url) {
            const prefix = /\/settings(\/|$)/.test(url) ? 'settings' : 'req';
            const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
            return `${prefix}:${hex}`;
        },

        // 相对路径补全（相对路径按鱼排拼接）
        buildUrl(ep) {
            const s = String(ep);
            return s.startsWith('http') ? s : `${API_BASE}${s.startsWith('/') ? '' : '/'}${s}`;
        },

        async muliRefreshPage(params) {
            const [message, delay] = Array.isArray(params) ? params : [params, 100];
            if (message && message !== 'true') await sleep(200), toast(message, 1000);
            saveAllCooldownStates();
            await sleep(Number(delay) || 100);
            location.reload();
        },

        async customCode(code) {
            const fn = new Function('return (' + code + ')')();
            if (typeof fn === 'function') return fn();
        },

        getSelfAvatar() {
            const img = document.querySelector('.menu-user img') || document.querySelector('header img');
            return img ? (img.getAttribute('src') || '') : '';
        }
    };

    // ================== 冷却系统（时间戳 + 单定时器轮转） ==================
    // 倒计时以角标气泡显示在按钮右上角（绝对定位），不改变按钮文字、不撑大按钮
    const COOLDOWN_PREFIX = 'cd_';
    const cooldownState = Store.get('cooldowns', {});   // { buttonId: endTimeMs }
    let cooldownTimer = null;

    function cdBadgeOf(btn) {
        if (!btn) return null;
        let badge = btn.querySelector('.fpcp-cd');
        if (!badge) {
            badge = el('span', { class: 'fpcp-cd', text: '' });
            btn.appendChild(badge);
        }
        return badge;
    }

    function startCooldown(buttonId, seconds, btnEl) {
        if (!seconds || seconds <= 0) return;
        const end = Date.now() + seconds * 1000;
        cooldownState[buttonId] = end;
        Store.set('cooldowns', cooldownState);
        if (btnEl) {
            btnEl.classList.add('fpcp-cooling');
            const badge = cdBadgeOf(btnEl);
            if (badge) badge.textContent = seconds + 's';
        }
        ensureCooldownTimer();
    }

    function getCooldownRemain(buttonId) {
        const end = cooldownState[buttonId];
        return end ? Math.max(0, Math.ceil((end - Date.now()) / 1000)) : 0;
    }

    function ensureCooldownTimer() {
        if (cooldownTimer) return;
        cooldownTimer = setInterval(() => {
            const now = Date.now();
            let hasActive = false;
            for (const id of Object.keys(cooldownState)) {
                const remain = cooldownState[id] - now;
                const btn = document.querySelector(`.fpcp-btn[data-button-id="${id}"]`);
                if (remain <= 0) {
                    delete cooldownState[id];
                    if (btn) {
                        btn.classList.remove('fpcp-cooling');
                        const badge = btn.querySelector('.fpcp-cd');
                        if (badge) badge.remove();
                    }
                } else {
                    hasActive = true;
                    if (btn) {
                        const badge = cdBadgeOf(btn);
                        if (badge) badge.textContent = Math.ceil(remain / 1000) + 's';
                    }
                }
            }
            Store.set('cooldowns', cooldownState);
            if (!hasActive) {
                clearInterval(cooldownTimer);
                cooldownTimer = null;
            }
        }, 500);
    }

    function saveAllCooldownStates() {
        // 状态已实时持久化，这里保证最后一次写盘
        Store.set('cooldowns', cooldownState);
    }

    // ================== 默认按钮配置（兼容旧版 JSON 结构） ==================
    const DEFAULT_CONFIG = [
        {
            text: "冰冰指令",
            color: "btn-blue",
            action: { type: 'sendMsg', params: '冰冰 去打劫' },
            cooldown: 60,
            children: [
                {
                    text: "打劫",
                    action: { type: 'sendMsg', params: '冰冰 去打劫' },
                    muliRefresh: true,
                    cooldown: 60
                },
                {
                    text: "行行好",
                    action: { type: 'sendMsg', params: '鸽 行行好吧' },
                    muliRefresh: true,
                    cooldown: 60
                },
                {
                    text: "红包",
                    action: {
                        type: 'promptAndSend',
                        params: {
                            promptText: '输入红包金额',
                            defaultValue: '10',
                            actionCode: '冰冰 来个红包 ${input}'
                        }
                    },
                    muliRefresh: true,
                    cooldown: 60
                },
            ]
        },
        {
            text: "图片文字",
            color: "btn-warn",
            action: {
                type: 'promptAndIconTextMsg',
                params: {
                    defaultValue: '消息|null|null|null'
                }
            },
            children: [
                {
                    text: "紫色渐变",
                    action: {
                        type: 'promptAndIconTextMsg',
                        params: {
                            defaultValue: '消息|null|FFEDCC,EDE9FE|FB923C,8B5CF6'
                        }
                    }
                },
                {
                    text: "橙色渐变",
                    action: {
                        type: 'promptAndIconTextMsg',
                        params: {
                            defaultValue: '消息|null|FFF7ED,FFEDD5|F97316,ffffff'
                        }
                    }
                },
                {
                    text: "cos沐里",
                    action: {
                        type: 'promptAndIconTextMsg',
                        params: {
                            defaultValue: '消息|muli|null|null'
                        }
                    }
                },
            ]
        },
        {
            text: "清空私信",
            color: "btn-green",
            action: {
                type: 'fetchPrivate',
                params: ['/me/messages/unread-count', '/me/notifications/unread-count']
            }
        },
        {
            text: "快捷发言",
            color: "btn-blue",
            action: { type: 'customCode', params: '() => Promise.resolve()' },
            children: [
                {
                    text: "慈善",
                    action: { type: 'sendMsg', params: '#### 慈善？' },
                    cooldown: 5
                },
                {
                    text: "颗秒",
                    action: { type: 'sendMsg', params: '# 颗秒！！！' },
                    cooldown: 5
                },
                {
                    text: "交税",
                    action: { type: 'sendMsg', params: '# 交税！！！' },
                    cooldown: 5
                },
                {
                    text: "桀桀桀",
                    action: { type: 'sendMsg', params: '### 桀桀桀' },
                    cooldown: 5
                },
                {
                    text: "还我",
                    action: { type: 'sendMsg', params: '## 还我' },
                    cooldown: 5
                },
                {
                    text: "还有谁icon",
                    action: { type: 'sendIconTextMsg', params: '还有谁！！！' },
                    cooldown: 5
                },
                {
                    text: "分钱",
                    action: { type: 'sendMsg', params: '# 分钱！' },
                    cooldown: 5
                },
                {
                    text: "谢谢",
                    action: { type: 'sendMsg', params: '# 谢谢' },
                    cooldown: 5
                },
                {
                    text: "呜呜呜",
                    action: { type: 'sendMsg', params: '# 呜呜呜' },
                    cooldown: 5
                },
                {
                    text: "沐嘿嘿嘿",
                    action: { type: 'sendMsg', params: '### 沐嘿嘿嘿 沐嘿嘿嘿\n' + '![图片表情](https://file.fishpi.cn/2025/12/13411020365279481-cbcd485f.gif)' },
                    cooldown: 5
                },
                {
                    text: "我是谁",
                    action: { type: 'sendMsg', params: '### 我是谁？\n' + '![图片表情](https://file.fishpi.cn/2025/12/image-3b45af46.png)' },
                    cooldown: 5
                }
            ]
        },
        {
            text: "发送红包",
            color: "btn-red",
            action: {
                type: "sendRedPacketMsg",
                params: {
                    type: "猜拳红包",
                    money: "",
                    count: "1",
                    msg: "来上一拳！",
                    recivers: [
                        ""
                    ],
                    gesture: "无"
                }
            },
            children: [
                {
                    text: "拼手气",
                    action: {
                        type: "sendRedPacketMsg",
                        params: {
                            type: "拼手气红包",
                            money: "256",
                            count: "1",
                            msg: "摸鱼者事尽成",
                            recivers: [
                                ""
                            ],
                            gesture: "无"
                        }
                    }
                },
                {
                    text: "普通",
                    action: {
                        type: "sendRedPacketMsg",
                        params: {
                            type: "普通红包",
                            money: "256",
                            count: "1",
                            msg: "摸鱼者事尽成",
                            recivers: [
                                ""
                            ],
                            gesture: "无"
                        }
                    }
                },
                {
                    text: "专属",
                    action: {
                        type: "sendRedPacketMsg",
                        params: {
                            type: "专属红包",
                            money: "256",
                            count: "1",
                            msg: "摸鱼者事尽成",
                            recivers: [
                                ""
                            ],
                            gesture: "无"
                        }
                    }
                },
                {
                    text: "心跳",
                    action: {
                        type: "sendRedPacketMsg",
                        params: {
                            type: "心跳红包",
                            money: "256",
                            count: "10",
                            msg: "摸鱼者事尽成",
                            recivers: [
                                ""
                            ],
                            gesture: "无"
                        }
                    }
                },
                {
                    text: "猜拳",
                    action: {
                        type: "sendRedPacketMsg",
                        params: {
                            type: "猜拳红包",
                            money: "256",
                            count: "1",
                            msg: "摸鱼者事尽成",
                            recivers: [
                                ""
                            ],
                            gesture: "无"
                        }
                    }
                }
            ]
        },
    ];

    let buttonsConfig = Store.get('buttons', null) || JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    // ================== 快捷按钮浮块 ==================
    const QuickActions = {
        container: null,
        dragManager: null,

        init() {
            if (isMobileDevice() && Store.get('ui_disabled') !== 'false') return;
            if (Store.get('ui_disabled') === 'true') return;
            this.build();
        },

        build() {
            const container = el('div', { id: 'fpcp-quick-actions' });
            this.container = container;

            // 头部（拖拽把手 + 回到顶部 + 装订 + 设置 + 记事本入口）
            const head = el('div', { class: 'fpcp-qa-head' }, [
                el('span', { class: 'fpcp-qa-drag', title: '拖拽移动（双击复位）', text: '⠿' }),
                el('span', { class: 'fpcp-qa-title', text: '快捷功能' }),
                el('button', { class: 'fpcp-qa-icon', title: '回到顶部', text: '⤴', onclick: () => this.scrollToTop() }),
                el('button', { class: 'fpcp-qa-icon', title: '装订到页面（贴边固定）', text: '📌', onclick: () => this.toggleDock() }),
                el('button', { class: 'fpcp-qa-icon', title: '语录记事本', text: '⭐', onclick: () => Notepad.toggle() }),
                el('button', { class: 'fpcp-qa-icon', title: '按钮配置', text: '⚙', onclick: () => Editor.open() })
            ]);
            container.appendChild(head);

            // 按钮区
            const grid = el('div', { class: 'fpcp-qa-grid' });
            this.renderButtons(grid);
            container.appendChild(grid);

            document.body.appendChild(container);
            this.initDrag(container);
            // 恢复装订状态：延迟执行，等 Vue 水合完成后再装进侧栏，
            // 避免装订节点被水合/首屏重渲染当作外来节点清掉（刷新后浮块消失的根因）
            if (Store.get('docked', false)) {
                setTimeout(() => {
                    if (Store.get('docked', false) && this.container) this.applyDock(true);
                }, 1200);
            }
        },

        // 回到顶部（滚动消息列表/页面到顶部）
        scrollToTop() {
            // 优先滚动消息列表的可滚动祖先，其次页面
            const list = document.querySelector('.cr-classic-list') || document.querySelector('#chats');
            if (list) {
                let node = list;
                while (node && node !== document.body) {
                    if (node.scrollHeight > node.clientHeight + 10) {
                        node.scrollTop = 0;
                        return;
                    }
                    node = node.parentElement;
                }
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        // 装订：移入侧栏（我的资料与清风明月之间），再次点击恢复浮动
        toggleDock() {
            const docked = !Store.get('docked', false);
            Store.set('docked', docked);
            this.applyDock(docked);
            toast(docked ? '已装订到侧栏' : '已恢复浮动');
        },

        applyDock(docked) {
            const c = this.container;
            if (!c) return;
            const handle = c.querySelector('.fpcp-qa-drag');
            if (docked) {
                c.classList.add('fpcp-docked');
                c.style.left = '';
                c.style.top = '';
                c.style.right = '';
                c.style.bottom = '';
                if (handle) handle.style.visibility = 'hidden';
                this._startDockGuard();
                this._ensureDocked();
            } else {
                this._stopDockGuard();
                c.classList.remove('fpcp-docked');
                document.body.appendChild(c);
                c.style.right = '';
                const pos = Store.get('pos', DEFAULT_POSITION);
                c.style.left = pos.x + 'px';
                c.style.top = pos.y + 'px';
                if (handle) handle.style.visibility = '';
            }
        },

        // 装订目标：侧栏 .chat-sidebar 内、清风明月（section.sidebar-tabs）上方的中间位置
        _ensureDocked() {
            const c = this.container;
            if (!c) return;
            const sidebar = document.querySelector('aside.sidebar-layout.chat-sidebar') || document.querySelector('.chat-sidebar');
            if (!sidebar) return;   // 侧栏不在（未渲染/已离开页面），等看护触发重试
            if (sidebar.contains(c) && c.isConnected) return;   // 已就位
            const tabs = sidebar.querySelector('section.sidebar-tabs');
            if (tabs) sidebar.insertBefore(c, tabs);
            else sidebar.appendChild(c);
        },

        // 装订存活看护：Vue 重渲染/水合会把外来节点从侧栏清掉，被清后自动重新装订。
        // 双保险——MessageWatcher（DOM 变化即时感知）+ 慢心跳（纯移除场景兜底）
        _startDockGuard() {
            if (!this._dockGuardUnsub) {
                this._dockGuardUnsub = MessageWatcher.on(() => {
                    if (!Store.get('docked', false) || !this.container) { this._stopDockGuard(); return; }
                    this._ensureDocked();
                });
            }
            if (!this._dockHeartbeat) {
                this._dockHeartbeat = setInterval(() => {
                    if (!Store.get('docked', false) || !this.container) { this._stopDockGuard(); return; }
                    if (!this.container.isConnected || !this._ensureDockedAlive()) this._ensureDocked();
                }, 3000);
            }
        },

        _ensureDockedAlive() {
            const c = this.container;
            const sidebar = document.querySelector('aside.sidebar-layout.chat-sidebar') || document.querySelector('.chat-sidebar');
            return !!(c && sidebar && sidebar.contains(c) && c.isConnected);
        },

        _stopDockGuard() {
            if (this._dockGuardUnsub) { this._dockGuardUnsub(); this._dockGuardUnsub = null; }
            if (this._dockHeartbeat) { clearInterval(this._dockHeartbeat); this._dockHeartbeat = null; }
        },

        renderButtons(grid) {
            grid.innerHTML = '';
            buttonsConfig.forEach((cfg, index) => {
                grid.appendChild(this.buildButton(cfg, `btn_${index}`, 0));
            });
        },

        buildButton(cfg, id, depth) {
            const btn = el('button', {
                class: `fpcp-btn ${cfg.color || 'btn-blue'}`,
                'data-button-id': id,
                text: cfg.text || '按钮'
            });

            // 冷却恢复（角标显示，不撑大按钮）
            const remain = getCooldownRemain(id);
            if (remain > 0) {
                btn.classList.add('fpcp-cooling');
                const badge = cdBadgeOf(btn);
                if (badge) badge.textContent = remain + 's';
                ensureCooldownTimer();
            }

            // 点击 = 执行自身动作（一级按钮同样有动作）
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (btn.classList.contains('fpcp-cooling')) return;
                if (cfg.cooldown) startCooldown(id, cfg.cooldown, btn);
                await ActionExecutor.execute(cfg.action);
                if (cfg.muliRefresh) {
                    saveAllCooldownStates();
                    location.reload();
                }
            });

            // hover = 自动展开子按钮（保持旧版交互）
            if (cfg.children && cfg.children.length > 0 && depth === 0) {
                btn.addEventListener('mouseenter', () => this.showChildren(btn, cfg, id));
                btn.addEventListener('mouseleave', () => this.scheduleHideChildren());
            }

            return btn;
        },

        // 子按钮弹出层（hover 展开，智能方向：浮块在屏幕下半部分则向上展开，上半部分则向下）
        showChildren(parentBtn, cfg, parentId) {
            clearTimeout(this._hidePopTimer);
            // 复用已有弹层，避免 hover 抖动时重复创建
            let pop = document.querySelector('.fpcp-children-pop');
            if (pop && pop.dataset.owner === parentId) {
                return; // 同一父按钮的弹层已展开
            }
            if (pop) pop.remove();

            pop = el('div', { class: 'fpcp-children-pop' });
            pop.dataset.owner = parentId;
            cfg.children.forEach((child, i) => {
                const childBtn = el('button', {
                    class: `fpcp-btn ${child.color || cfg.color || 'btn-blue'}`,
                    'data-button-id': `${parentId}_c${i}`,
                    text: child.text || '子按钮'
                });
                const childId = `${parentId}_c${i}`;
                const remain = getCooldownRemain(childId);
                if (remain > 0) {
                    childBtn.classList.add('fpcp-cooling');
                    const badge = cdBadgeOf(childBtn);
                    if (badge) badge.textContent = remain + 's';
                    ensureCooldownTimer();
                }
                childBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (childBtn.classList.contains('fpcp-cooling')) return;
                    pop.remove();
                    if (child.cooldown) startCooldown(childId, child.cooldown, childBtn);
                    await ActionExecutor.execute(child.action);
                    if (child.muliRefresh) {
                        saveAllCooldownStates();
                        location.reload();
                    }
                });
                pop.appendChild(childBtn);
            });

            // 智能方向：以浮块位置决定展开方向（浮块在屏幕下方→向上展开，在上方→向下展开）
            const containerRect = (this.container || parentBtn).getBoundingClientRect();
            const expandUp = containerRect.top + containerRect.height / 2 > window.innerHeight / 2;

            document.body.appendChild(pop);
            const rect = parentBtn.getBoundingClientRect();
            const popW = pop.offsetWidth;
            const popH = pop.offsetHeight;
            // 纵向：优先按智能方向展开
            let top = expandUp ? (rect.top - popH - 6) : (rect.bottom + 6);
            // 横向：优先与父按钮左对齐
            let left = rect.left;
            // 视口夹取：保证弹层任何位置都完整可见（多列变宽时防超出右边/下边）
            const margin = 8;
            if (left + popW > window.innerWidth - margin) left = window.innerWidth - popW - margin;
            if (left < margin) left = margin;
            if (top + popH > window.innerHeight - margin) top = window.innerHeight - popH - margin;
            if (top < margin) top = margin;
            pop.style.left = `${left}px`;
            pop.style.top = `${top}px`;

            // 弹层自身 hover 保持展开，离开后延迟关闭
            pop.addEventListener('mouseenter', () => clearTimeout(this._hidePopTimer));
            pop.addEventListener('mouseleave', () => this.scheduleHideChildren());
        },

        scheduleHideChildren() {
            clearTimeout(this._hidePopTimer);
            this._hidePopTimer = setTimeout(() => {
                const pop = document.querySelector('.fpcp-children-pop');
                if (pop) pop.remove();
            }, 180);
        },

        // 拖拽 + 位置记忆 + 双击复位（rAF 节流 + transform，消除拖动卡顿）
        initDrag(container) {
            const handle = container.querySelector('.fpcp-qa-drag');
            let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
            let rafId = null, pendingX = 0, pendingY = 0;

            // 恢复位置
            const pos = Store.get('pos', DEFAULT_POSITION);
            container.style.left = pos.x + 'px';
            container.style.top = pos.y + 'px';

            const applyPos = () => {
                rafId = null;
                container.style.left = pendingX + 'px';
                container.style.top = pendingY + 'px';
            };

            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                dragging = true;
                startX = e.clientX;
                startY = e.clientY;
                origX = container.offsetLeft;
                origY = container.offsetTop;
                container.classList.add('fpcp-dragging');
            });

            document.addEventListener('mousemove', (e) => {
                if (!dragging) return;
                pendingX = origX + e.clientX - startX;
                pendingY = origY + e.clientY - startY;
                if (rafId === null) rafId = requestAnimationFrame(applyPos);
            });

            document.addEventListener('mouseup', () => {
                if (!dragging) return;
                dragging = false;
                container.classList.remove('fpcp-dragging');
                if (rafId !== null) {
                    cancelAnimationFrame(rafId);
                    applyPos();
                }
                Store.set('pos', { x: container.offsetLeft, y: container.offsetTop });
            });

            // 双击把手复位
            handle.addEventListener('dblclick', () => {
                container.style.left = DEFAULT_POSITION.x + 'px';
                container.style.top = DEFAULT_POSITION.y + 'px';
                Store.set('pos', DEFAULT_POSITION);
                toast('浮块位置已复位');
            });
        }
    };

    // ================== 配置界面 Editor（全新设计） ==================
    // 动作参数模板（表单化配置用）
    const ACTION_TEMPLATES = {
        sendMsg: {
            label: '发送消息',
            params: [
                { name: 'delay', type: 'number', label: '多条消息时的间隔(ms)', defaultValue: 0 },
                { name: 'message', type: 'msg', label: '消息内容（多条用英文逗号隔开）', required: true }
            ]
        },
        sendRedPacketMsg: {
            label: '发送红包',
            params: [
                { name: 'type', type: 'select', label: '红包类型', options: ['拼手气红包', '普通红包', '专属红包', '心跳红包', '猜拳红包'], required: true },
                { name: 'money', type: 'number', label: '金额', defaultValue: 256 },
                { name: 'count', type: 'number', label: '数量', defaultValue: 1 },
                { name: 'msg', type: 'text', label: '红包留言', defaultValue: '摸鱼者事尽成' },
                { name: 'recivers', type: 'text', label: '专属用户名（逗号隔开，非专属留空）' },
                { name: 'gesture', type: 'select', label: '猜拳手势（非猜拳留空）', options: ['', '石头', '剪刀', '布', '无'] }
            ]
        },
        sendIconTextMsg: {
            label: '个性化文字图片',
            params: [
                { name: 'message', type: 'text', label: '消息|头像|背景|字体（|隔开，null 用默认）', defaultValue: '消息|null|null|null', required: true }
            ]
        },
        promptAndIconTextMsg: {
            label: '输入+文字图片',
            params: [
                { name: 'defaultValue', type: 'text', label: '默认参数 消息|头像|背景|字体', defaultValue: '消息|null|null|null' }
            ]
        },
        promptAndSend: {
            label: '输入+发送',
            params: [
                { name: 'promptText', type: 'text', label: '输入提示', defaultValue: '请输入' },
                { name: 'defaultValue', type: 'text', label: '默认值' },
                { name: 'actionCode', type: 'code', label: '发送模板（${input} 占位）', placeholder: '消息 + ${input}', required: true }
            ]
        },
        fetchPrivate: {
            label: 'URL请求',
            params: []   // 专用多请求编辑器（buildRequestListEditor），不走通用模板
        },
        muliRefreshPage: {
            label: '刷新页面',
            params: [
                { name: 'message', type: 'text', label: '刷新提示' },
                { name: 'delay', type: 'number', label: '延迟(ms)', defaultValue: 100 }
            ]
        },
        customCode: {
            label: '自定义JS',
            params: [
                { name: 'code', type: 'code', label: 'JS 代码（可为箭头函数）', placeholder: '() => Promise.resolve()', required: true }
            ]
        }
    };

    const Editor = {
        overlay: null,

        open() {
            if (this.overlay) {
                this.overlay.style.display = 'flex';
                return;
            }
            this.build();
        },

        close() {
            if (this.overlay) this.overlay.style.display = 'none';
        },

        build() {
            const overlay = el('div', { id: 'fpcp-editor-overlay' });
            this.overlay = overlay;

            const panel = el('div', { class: 'fpcp-editor-panel' });

            // 头部
            const head = el('div', { class: 'fpcp-editor-head' }, [
                el('span', { class: 'fpcp-editor-title', text: '快捷按钮配置' }),
                el('div', { class: 'fpcp-editor-head-actions' }, [
                    el('button', { class: 'fpcp-btn-sm', text: '导入', onclick: () => this.importConfig() }),
                    el('button', { class: 'fpcp-btn-sm', text: '导出', onclick: () => this.exportConfig() }),
                    el('button', { class: 'fpcp-btn-sm', text: '恢复默认', onclick: () => this.resetConfig() }),
                    el('button', { class: 'fpcp-btn-sm fpcp-btn-primary', text: '保存', onclick: () => this.save() }),
                    el('button', { class: 'fpcp-btn-sm', text: '关闭', onclick: () => this.close() })
                ])
            ]);
            panel.appendChild(head);

            // 主体：左侧按钮列表 / 右侧表单
            const body = el('div', { class: 'fpcp-editor-body' });

            // 左栏：按钮列表
            const listWrap = el('div', { class: 'fpcp-editor-list' });
            listWrap.appendChild(el('div', { class: 'fpcp-editor-list-title', text: '按钮列表' }));
            // 快速定位栏：一级按钮 chip 导航（悬停 chip 弹出子按钮，点击跳转并闪烁高亮）
            const nav = el('div', { id: 'fpcp-nav-bar', class: 'fpcp-nav-bar' });
            this._navBar = nav;   // 直接持引用，构建期 getElementById 找不到未挂载元素
            listWrap.appendChild(nav);
            const list = el('div', { id: 'fpcp-btn-list' });
            this.renderList(list);
            this.renderNav();
            listWrap.appendChild(list);
            listWrap.appendChild(el('button', {
                class: 'fpcp-btn-sm fpcp-btn-add', text: '＋ 添加按钮',
                onclick: () => {
                    buttonsConfig.push({ text: '新按钮', color: 'btn-blue', action: { type: 'sendMsg', params: '' }, cooldown: 0 });
                    this.renderList(list);
                    this.renderNav();
                }
            }));
            body.appendChild(listWrap);

            // 右栏：JSON 编辑器（高级模式，实时校验）
            const jsonWrap = el('div', { class: 'fpcp-editor-json' });
            jsonWrap.appendChild(el('div', { class: 'fpcp-editor-list-title', text: 'JSON 配置（高级模式，修改后自动生效到左侧）' }));
            const textarea = el('textarea', { id: 'fpcp-json-input', spellcheck: 'false' });
            textarea.value = JSON.stringify(buttonsConfig, null, 2);
            jsonWrap.appendChild(textarea);
            const jsonStatus = el('div', { id: 'fpcp-json-status', text: '' });
            jsonWrap.appendChild(jsonStatus);

            // JSON 防抖校验
            let jsonTimer = null;
            let jsonFromVisual = false;   // 可视化→JSON 同步写入时置位，防止回环
            textarea.addEventListener('input', () => {
                if (jsonFromVisual) return;
                jsonStatus.textContent = '输入中…';
                clearTimeout(jsonTimer);
                jsonTimer = setTimeout(() => {
                    try {
                        const parsed = JSON.parse(textarea.value);
                        if (!Array.isArray(parsed)) throw new Error('配置必须是数组');
                        buttonsConfig = parsed;
                        jsonStatus.textContent = '✓ 合法';
                        jsonStatus.className = 'fpcp-json-ok';
                        this.renderList(list);
                    } catch (e) {
                        jsonStatus.textContent = '✗ ' + e.message;
                        jsonStatus.className = 'fpcp-json-err';
                    }
                }, 400);
            });

            // 可视化 → JSON 视图双向同步：左栏任何输入都刷新 JSON 文本（用户正在编辑 JSON 时不动）
            let syncTimer = null;
            listWrap.addEventListener('input', () => {
                clearTimeout(syncTimer);
                syncTimer = setTimeout(() => {
                    if (document.activeElement === textarea) return;   // 焦点在 JSON 区不覆盖用户输入
                    jsonFromVisual = true;
                    textarea.value = JSON.stringify(buttonsConfig, null, 2);
                    jsonStatus.textContent = '';
                    jsonStatus.className = '';
                    // 等 value 写完再放开（input 事件是异步派发，同步置 false 即可）
                    jsonFromVisual = false;
                }, 300);
            });
            body.appendChild(jsonWrap);

            panel.appendChild(body);
            overlay.appendChild(panel);

            // 点击遮罩关闭
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.close();
            });

            document.body.appendChild(overlay);
            // 挂载后重建定位栏（构建期 renderNav 可能因元素未挂载而跳过）
            this.renderNav();
        },

        // 渲染按钮列表（含子按钮展开、表单编辑、拖拽排序）
        renderList(list, arr, parentCfg) {
            arr = arr || buttonsConfig;
            list.innerHTML = '';
            // 子按钮区带归属标签（与 buildItem 内结构一致，保证增删后层级标识不丢）
            if (parentCfg) {
                list.appendChild(el('div', {
                    class: 'fpcp-edit-children-label',
                    text: `「${parentCfg.text || '未命名'}」的二级按钮（${arr.length}）`
                }));
            }
            arr.forEach((cfg, index) => {
                list.appendChild(this.buildItem(cfg, index, list, arr, parentCfg));
            });
            // 主列表重建后同步定位栏
            if (list.id === 'fpcp-btn-list') this.renderNav();
        },

        // ===== 快速定位栏 =====
        renderNav() {
            const nav = this._navBar || document.getElementById('fpcp-nav-bar');
            if (!nav) return;
            nav.innerHTML = '';
            if (buttonsConfig.length === 0) return;
            nav.appendChild(el('span', { class: 'fpcp-nav-label', text: '定位' }));
            buttonsConfig.forEach((cfg, i) => {
                const chip = el('button', {
                    class: 'fpcp-nav-chip',
                    text: (cfg.text || '按钮').slice(0, 5),
                    title: cfg.text || '按钮',
                    onclick: () => this.jumpToItem(i, -1)
                });
                // 有子按钮：悬停弹出子按钮定位面板
                if (cfg.children && cfg.children.length > 0) {
                    chip.addEventListener('mouseenter', () => this.showNavChildren(chip, i, cfg));
                    chip.addEventListener('mouseleave', () => this.scheduleHideNavChildren());
                }
                nav.appendChild(chip);
            });
        },

        // 跳转到列表项并闪烁高亮
        jumpToItem(topIndex, childIndex) {
            const list = document.getElementById('fpcp-btn-list');
            if (!list) return;
            // 只认 .fpcp-edit-item 项（子区首行是归属标签，不能直接用 children 下标）
            const item = list.querySelectorAll(':scope > .fpcp-edit-item')[topIndex];
            if (!item) return;
            let target = item;
            if (childIndex >= 0) {
                const subItems = item.querySelectorAll(':scope > .fpcp-edit-children > .fpcp-edit-item');
                if (subItems[childIndex]) target = subItems[childIndex];
            }
            // 滚动到卡片头部而非整卡居中（卡片含表单很高，居中会把头部滚出视野）
            const head = target.querySelector('.fpcp-edit-item-head') || target;
            head.scrollIntoView({ behavior: 'smooth', block: 'start' });
            target.classList.remove('fpcp-nav-flash');
            void target.offsetWidth;   // 重启动画
            target.classList.add('fpcp-nav-flash');
        },

        // 子按钮定位弹层（悬停 chip 显示）
        showNavChildren(chip, topIndex, cfg) {
            clearTimeout(this._hideNavPopTimer);
            const old = document.getElementById('fpcp-nav-pop');
            if (old) old.remove();

            const pop = el('div', { id: 'fpcp-nav-pop', class: 'fpcp-nav-pop' });
            cfg.children.forEach((child, ci) => {
                pop.appendChild(el('button', {
                    class: 'fpcp-nav-chip fpcp-nav-chip-sub',
                    text: (child.text || '子按钮').slice(0, 6),
                    title: child.text || '子按钮',
                    onclick: () => {
                        pop.remove();
                        this.jumpToItem(topIndex, ci);
                    }
                }));
            });

            document.body.appendChild(pop);
            // 定位在 chip 下方（贴视口上沿则翻到上方）
            const rect = chip.getBoundingClientRect();
            pop.style.left = `${rect.left}px`;
            const expandUp = rect.top + rect.height / 2 > window.innerHeight / 2;
            pop.style.top = expandUp ? `${rect.top - pop.offsetHeight - 4}px` : `${rect.bottom + 4}px`;

            pop.addEventListener('mouseenter', () => clearTimeout(this._hideNavPopTimer));
            pop.addEventListener('mouseleave', () => this.scheduleHideNavChildren());
        },

        scheduleHideNavChildren() {
            clearTimeout(this._hideNavPopTimer);
            this._hideNavPopTimer = setTimeout(() => {
                const pop = document.getElementById('fpcp-nav-pop');
                if (pop) pop.remove();
            }, 180);
        },

        buildItem(cfg, index, list, parentArray, parentCfg) {
            const isSub = !!parentCfg;
            const item = el('div', { class: `fpcp-edit-item ${isSub ? 'fpcp-edit-item--sub' : 'fpcp-edit-item--top'}` });

            // 身份头：明确标注 一级/二级 + 归属（解决层级边界不清）
            item.appendChild(el('div', { class: 'fpcp-edit-item-head' }, [
                el('span', { class: `fpcp-edit-badge ${isSub ? 'is-sub' : 'is-top'}`, text: isSub ? '二级' : '一级' }),
                el('span', {
                    class: 'fpcp-edit-item-no',
                    text: isSub ? `属于「${parentCfg.text || '未命名'}」` : `#${index + 1}`
                })
            ]));

            // 行头（排序请在右侧 JSON 视图中调整数组顺序）
            const row = el('div', { class: 'fpcp-edit-row' }, [
                el('input', {
                    class: 'fpcp-edit-name', value: cfg.text || '',
                    oninput: (e) => {
                        cfg.text = e.target.value;
                        // 一级按钮改名时定位栏 chip 实时跟随
                        if (list.id === 'fpcp-btn-list') this.renderNav();
                    }
                }),
                el('select', {
                    class: 'fpcp-edit-color',
                    onchange: (e) => { cfg.color = e.target.value; }
                }, ['btn-blue', 'btn-red', 'btn-warn', 'btn-green'].map(c =>
                    el('option', { value: c, text: { 'btn-blue': '蓝', 'btn-red': '红', 'btn-warn': '橙', 'btn-green': '绿' }[c], ...(cfg.color === c ? { selected: 'selected' } : {}) })
                )),
                el('button', {
                    class: 'fpcp-btn-sm', text: '子按钮',
                    onclick: () => {
                        cfg.children = cfg.children || [];
                        cfg.children.push({ text: '新子按钮', action: { type: 'sendMsg', params: '' }, cooldown: 0 });
                        this.renderList(list, parentArray || buttonsConfig, parentCfg);
                    }
                }),
                el('button', {
                    class: 'fpcp-btn-sm fpcp-btn-danger', text: '删除',
                    onclick: () => {
                        const arr = parentArray || buttonsConfig;
                        arr.splice(index, 1);
                        this.renderList(list, arr, parentCfg);
                    }
                })
            ]);
            item.appendChild(row);

            // 表单区（动作类型 + 参数）
            item.appendChild(this.buildForm(cfg, list, parentArray, parentCfg));

            // 冷却 / 刷新选项
            const opts = el('div', { class: 'fpcp-edit-opts' }, [
                el('label', {}, [
                    '冷却(秒)',
                    el('input', {
                        type: 'number', class: 'fpcp-edit-cool', value: cfg.cooldown || 0, min: '0',
                        oninput: (e) => { cfg.cooldown = Number(e.target.value) || 0; }
                    })
                ]),
                el('label', {}, [
                    el('input', {
                        type: 'checkbox', ...(cfg.muliRefresh ? { checked: 'checked' } : {}),
                        onchange: (e) => { cfg.muliRefresh = e.target.checked; }
                    }),
                    '触发后刷新页面'
                ])
            ]);
            item.appendChild(opts);

            // 子按钮（带归属标签的嵌套区，复用 renderList 保证结构一致）
            if (cfg.children && cfg.children.length > 0) {
                const subWrap = el('div', { class: 'fpcp-edit-children' });
                item.appendChild(subWrap);
                this.renderList(subWrap, cfg.children, cfg);
            }

            return item;
        },

        // 动作表单
        buildForm(cfg, list, arr, parentCfg) {
            const form = el('div', { class: 'fpcp-edit-form' });
            form._fpcpList = list;
            form._fpcpArr = arr;
            form._fpcpParent = parentCfg || null;
            const action = cfg.action = cfg.action || { type: 'sendMsg', params: '' };

            // 动作类型选择
            const typeSelect = el('select', {
                class: 'fpcp-edit-type',
                onchange: (e) => {
                    action.type = e.target.value;
                    // 初始化参数为模板默认
                    const tpl = ACTION_TEMPLATES[action.type];
                    if (tpl && (action.params === '' || typeof action.params !== 'object')) {
                        if (action.type === 'sendMsg' || action.type === 'sendIconTextMsg' || action.type === 'customCode') {
                            action.params = '';
                        } else {
                            action.params = {};
                        }
                    }
                    this.renderList(form._fpcpList || document.getElementById('fpcp-btn-list'), form._fpcpArr || null, form._fpcpParent);
                }
            });
            Object.keys(ACTION_TEMPLATES).forEach(t => {
                typeSelect.appendChild(el('option', { value: t, text: ACTION_TEMPLATES[t].label, ...(action.type === t ? { selected: 'selected' } : {}) }));
            });
            form.appendChild(typeSelect);

            // 参数字段（fetchPrivate 走专用多请求编辑器）
            const tpl = ACTION_TEMPLATES[action.type];
            if (action.type === 'fetchPrivate') {
                form.appendChild(this.buildRequestListEditor(action, form));
            } else if (tpl) {
                tpl.params.forEach(p => {
                    const currentVal = this.getParamValue(action, p);
                    let input;
                    if (p.type === 'select') {
                        input = el('select', {
                            onchange: (e) => this.setParamValue(action, p, e.target.value)
                        }, p.options.map(o => el('option', { value: o, text: o || '(空)', ...(currentVal === o ? { selected: 'selected' } : {}) })));
                    } else if (p.type === 'code') {
                        input = el('textarea', {
                            class: 'fpcp-edit-code', rows: '2', placeholder: p.placeholder || '',
                            oninput: (e) => this.setParamValue(action, p, e.target.value)
                        });
                        input.value = currentVal ?? '';
                    } else {
                        input = el('input', {
                            type: p.type === 'number' ? 'number' : 'text',
                            placeholder: p.placeholder || '',
                            oninput: (e) => this.setParamValue(action, p, p.type === 'number' ? (Number(e.target.value) || 0) : e.target.value)
                        });
                        input.value = currentVal ?? (p.defaultValue ?? '');
                    }
                    form.appendChild(el('label', { class: 'fpcp-edit-field' }, [p.label + (p.required ? ' *' : ''), input]));
                });
            }
            return form;
        },

        // 参数读写（兼容 string / object 两种 params 形态）
        getParamValue(action, p) {
            if (p.name === 'delay') return action.delay ?? p.defaultValue ?? 0;
            if (typeof action.params === 'string' || Array.isArray(action.params)) {
                // 旧格式：fetchPrivate 的字符串/数组即 endpoint（GET）
                if (action.type === 'fetchPrivate') {
                    return p.name === 'endpoint'
                        ? (Array.isArray(action.params) ? action.params.join(',') : action.params)
                        : (p.defaultValue ?? '');
                }
                return (p.name === 'message' || p.name === 'code') ? action.params : (p.defaultValue ?? '');
            }
            return (action.params || {})[p.name] ?? p.defaultValue ?? '';
        },

        // ===== fetchPrivate 多请求编辑器 =====
        // params 归一化为 [{method, endpoint, bodyType, body, delay}]，按数组顺序执行
        buildRequestListEditor(action, form) {
            // 旧格式迁移：字符串（逗号分隔）、字符串数组、单对象 → 请求对象数组。
            // 注意：字符串数组也是旧格式（每条是 string 不是 object），必须一并迁移，
            // 否则 endpoint 等字段读写落在字符串上：渲染为空、编辑不生效（严格模式下直接抛 TypeError）
            const isReqList = Array.isArray(action.params)
                && action.params.every(p => p && typeof p === 'object');
            if (!isReqList) {
                action.params = normalizeUrlRequests(action.params);
            }
            if (action.params.length === 0) {
                action.params.push({ method: 'GET', endpoint: '', bodyType: 'json', body: '', delay: 0 });
            }

            const wrap = el('div', { class: 'fpcp-req-list' });
            wrap.appendChild(el('div', { class: 'fpcp-req-hint', text: '按顺序依次执行，可添加多条（允许重复同一接口）；「延迟」= 该条执行前等待毫秒数（定时请求）。凭证按 URL 自动选择：/api/v3/ 路径带新版 token（Bearer + 幂等键），其他站内路径带旧版凭证（csrfToken + apiKey + Cookie）。仅在需要覆盖时才填自定义请求头' }));

            action.params.forEach((req, idx) => {
                const card = el('div', { class: 'fpcp-req-card' });

                // 头行：序号 + 方法 + 删除
                const methodSel = el('select', {
                    class: 'fpcp-edit-type',
                    onchange: (e) => {
                        req.method = e.target.value;
                        bodyWrap.style.display = methodHasBody(req.method) ? '' : 'none';
                    }
                }, ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].map(m => el('option', { value: m, text: m, ...(req.method === m ? { selected: 'selected' } : {}) })));
                card.appendChild(el('div', { class: 'fpcp-req-head' }, [
                    el('span', { class: 'fpcp-req-no', text: `#${idx + 1}` }),
                    methodSel,
                    el('span', { class: 'fpcp-req-spacer' }),
                    el('button', {
                        class: 'fpcp-btn-sm fpcp-btn-danger', text: '✕', title: '删除此请求',
                        onclick: () => {
                            action.params.splice(idx, 1);
                            this.renderList(form._fpcpList || document.getElementById('fpcp-btn-list'), form._fpcpArr || null, form._fpcpParent);
                        }
                    })
                ]));

                // 地址
                const epInput = el('input', {
                    class: 'fpcp-req-endpoint', placeholder: '/api/... 或 https://...',
                    value: req.endpoint || '',
                    oninput: (e) => { req.endpoint = e.target.value; }
                });
                card.appendChild(epInput);

                // 延迟（定时请求）
                const delayInput = el('input', {
                    type: 'number', min: '0', class: 'fpcp-req-delay',
                    value: String(req.delay || 0),
                    oninput: (e) => { req.delay = Math.max(0, Number(e.target.value) || 0); }
                });
                card.appendChild(el('div', { class: 'fpcp-req-row' }, [
                    el('label', { class: 'fpcp-req-field' }, ['执行前延迟(ms)', delayInput])
                ]));

                // POST/PUT/PATCH/DELETE 请求体区（请求体类型 + 内容）
                const bodyWrap = el('div', { class: 'fpcp-req-body', style: methodHasBody(req.method) ? '' : 'display:none' });
                const bodyTypeSel = el('select', {
                    class: 'fpcp-edit-type',
                    onchange: (e) => {
                        req.bodyType = e.target.value;
                        bodyInput.placeholder = this.bodyPlaceholder(req.bodyType);
                    }
                }, [
                    ['json', 'JSON'],
                    ['form', '表单 x-www-form-urlencoded'],
                    ['text', '纯文本']
                ].map(([v, t]) => el('option', { value: v, text: t, ...(req.bodyType === v ? { selected: 'selected' } : {}) })));
                const bodyInput = el('textarea', {
                    class: 'fpcp-edit-code', rows: '3',
                    placeholder: this.bodyPlaceholder(req.bodyType),
                    oninput: (e) => { req.body = e.target.value; }
                });
                bodyInput.value = req.body || '';
                bodyWrap.appendChild(el('div', { class: 'fpcp-req-row' }, [
                    el('label', { class: 'fpcp-req-field' }, ['请求体类型', bodyTypeSel])
                ]));
                bodyWrap.appendChild(bodyInput);
                card.appendChild(bodyWrap);

                // 自定义请求头（可选）：JSON 对象或每行 k=v
                const hdrVal = typeof req.headers === 'string'
                    ? req.headers
                    : (req.headers && typeof req.headers === 'object' && Object.keys(req.headers).length
                        ? JSON.stringify(req.headers, null, 2) : '');
                const hdrInput = el('textarea', {
                    class: 'fpcp-edit-code', rows: '2',
                    placeholder: '可选。JSON 对象：{"X-Token": "abc"}\n或每行一对：X-Token=abc',
                    oninput: (e) => {
                        // 存原始文本，执行时归一化校验（空 = 无自定义头）
                        req.headers = e.target.value.trim() ? e.target.value : {};
                    }
                });
                hdrInput.value = hdrVal;
                card.appendChild(el('div', { class: 'fpcp-req-row' }, [
                    el('label', { class: 'fpcp-req-field' }, ['自定义请求头', hdrInput])
                ]));

                wrap.appendChild(card);
            });

            // 添加请求
            wrap.appendChild(el('button', {
                class: 'fpcp-btn-sm fpcp-btn-add', text: '＋ 添加请求',
                onclick: () => {
                    action.params.push({ method: 'GET', endpoint: '', bodyType: 'json', body: '', delay: 0, headers: {} });
                    this.renderList(form._fpcpList || document.getElementById('fpcp-btn-list'), form._fpcpArr || null, form._fpcpParent);
                }
            }));
            return wrap;
        },

        bodyPlaceholder(bodyType) {
            return bodyType === 'form' ? 'a=1&b=2' : (bodyType === 'text' ? '纯文本内容' : '{"key": "value"}');
        },

        setParamValue(action, p, val) {
            // sendMsg/sendIconTextMsg/customCode 的 params 保持字符串（兼容旧配置）
            if (action.type === 'sendMsg' || action.type === 'sendIconTextMsg' || action.type === 'customCode') {
                if (p.name === 'delay') {
                    action.delay = Number(val) || 0;
                } else if (action.type === 'sendMsg' && typeof val === 'string' && val.includes(',')) {
                    // 多条消息：逗号分隔拆为数组（与旧版语义一致），支持批量连续发送
                    const parts = val.split(',').map(s => s.trim());
                    action.params = parts.length > 1 ? parts : val;
                } else {
                    action.params = val;
                }
                return;
            }
            // 其他动作：对象形态（fetchPrivate 走专用多请求编辑器，不经过此处）
            action.params = action.params || {};
            action.params[p.name] = val;
        },

        save() {
            Store.set('buttons', buttonsConfig);
            // 重渲染浮块按钮
            const grid = document.querySelector('.fpcp-qa-grid');
            if (grid && QuickActions.container) QuickActions.renderButtons(grid);
            toast('配置已保存');
            this.close();
        },

        exportConfig() {
            const data = JSON.stringify(buttonsConfig, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const a = el('a', { href: URL.createObjectURL(blob), download: 'fishpi_chat_plus_buttons.json' });
            a.click();
            URL.revokeObjectURL(a.href);
        },

        importConfig() {
            const input = el('input', { type: 'file', accept: '.json' });
            input.addEventListener('change', () => {
                const file = input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const parsed = JSON.parse(reader.result);
                        if (!Array.isArray(parsed)) throw new Error('配置必须是数组');
                        buttonsConfig = parsed;
                        this.renderList(document.getElementById('fpcp-btn-list'));
                        const ta = document.getElementById('fpcp-json-input');
                        if (ta) ta.value = JSON.stringify(buttonsConfig, null, 2);
                        toast('导入成功，点击保存生效');
                    } catch (e) {
                        toast('导入失败：' + e.message);
                    }
                };
                reader.readAsText(file);
            });
            input.click();
        },

        resetConfig() {
            if (!confirm('确定恢复默认按钮配置？当前配置将丢失。')) return;
            buttonsConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
            this.renderList(document.getElementById('fpcp-btn-list'));
            const ta = document.getElementById('fpcp-json-input');
            if (ta) ta.value = JSON.stringify(buttonsConfig, null, 2);
            toast('已恢复默认，点击保存生效');
        }
    };

    // ================== 语录记事本 Notepad ==================
    const Notepad = {
        panel: null,
        quotes: Store.get('notepad', []),   // [{id, title, content, author, time}]
        formMode: 'add',
        editingId: null,

        save() {
            Store.set('notepad', this.quotes);
        },

        toggle() {
            if (this.panel && this.panel.style.display !== 'none') {
                this.panel.style.display = 'none';
            } else {
                this.show();
            }
        },

        show() {
            if (!this.panel) this.build();
            this.panel.style.display = 'flex';
            this.renderList();
        },

        build() {
            const panel = el('div', { id: 'fpcp-notepad' });
            this.panel = panel;

            const head = el('div', { class: 'fpcp-np-head' }, [
                el('span', { class: 'fpcp-np-drag', title: '拖拽移动', text: '⠿' }),
                el('span', { class: 'fpcp-np-title', text: '⭐ 语录记事本' }),
                el('button', {
                    class: 'fpcp-btn-sm fpcp-btn-primary', text: '＋ 添加',
                    onclick: () => this.openForm('add')
                }),
                el('button', {
                    class: 'fpcp-btn-sm', text: '关闭',
                    onclick: () => { panel.style.display = 'none'; }
                })
            ]);
            panel.appendChild(head);

            const list = el('div', { id: 'fpcp-np-list' });
            panel.appendChild(list);

            // 表单区（默认隐藏）
            const form = el('div', { id: 'fpcp-np-form', style: 'display:none' });
            panel.appendChild(form);

            document.body.appendChild(panel);
            this.initDrag(panel);
        },

        renderList() {
            const list = document.getElementById('fpcp-np-list');
            if (!list) return;
            list.innerHTML = '';
            if (this.quotes.length === 0) {
                list.appendChild(el('div', { class: 'fpcp-np-empty', text: '暂无语录\n悬停消息后点击 ⭐ 收藏\n或点右上角 ＋ 手动添加' }));
                return;
            }
            this.quotes.forEach(q => {
                const item = el('div', { class: 'fpcp-np-item' });

                // 主区：标题 + 单行预览 + 来源时间（点击 = 置入输入框）
                const main = el('div', {
                    class: 'fpcp-np-item-main',
                    title: '点击置入输入框'
                }, [
                    el('div', { class: 'fpcp-np-item-title', text: q.title }),
                    el('div', { class: 'fpcp-np-item-preview', text: String(q.content).replace(/\s+/g, ' ') }),
                    el('div', {
                        class: 'fpcp-np-item-meta',
                        text: (q.author ? `来自 ${q.author} · ` : '手动添加 · ') + this.formatTime(q.time)
                    })
                ]);
                main.addEventListener('click', () => this.appendToInput(q));

                // 右侧竖排小按钮
                const ops = el('div', { class: 'fpcp-np-item-ops' }, [
                    el('button', {
                        class: 'fpcp-np-send', text: '➤', title: '一键发送',
                        onclick: (e) => {
                            e.stopPropagation();
                            Api.send(q.content).then(() => toast('语录已发送'))
                                .catch(err => toast('发送失败：' + (err && err.message ? err.message : err)));
                        }
                    }),
                    el('button', {
                        text: '✎', title: '编辑',
                        onclick: (e) => {
                            e.stopPropagation();
                            this.openForm('edit', q.id);
                        }
                    }),
                    el('button', {
                        text: '🗑', title: '删除',
                        onclick: (e) => {
                            e.stopPropagation();
                            if (!confirm(`确定删除语录「${q.title}」吗？`)) return;
                            this.quotes = this.quotes.filter(x => x.id !== q.id);
                            this.save();
                            this.renderList();
                            toast('语录已删除');
                        }
                    })
                ]);

                item.appendChild(main);
                item.appendChild(ops);
                list.appendChild(item);
            });
        },

        // 来源时间格式 MM-DD HH:mm
        formatTime(time) {
            try {
                const d = new Date(time);
                if (isNaN(d.getTime())) return '';
                const pad = n => String(n).padStart(2, '0');
                return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
            } catch (e) {
                return '';
            }
        },

        // 置入输入框（旧版行为：追加到末尾，换行分隔，光标移到末尾）
        appendToInput(quote) {
            const ed = getEditorEl();
            if (!ed) {
                toast('未找到聊天输入框');
                return;
            }
            const current = ed.textContent || '';
            const separator = current && !/\n$/.test(current) ? '\n' : '';
            ed.textContent = current + separator + quote.content;
            ed.focus();
            // 光标移到末尾
            const range = document.createRange();
            range.selectNodeContents(ed);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            ed.dispatchEvent(new Event('input', { bubbles: true }));
            toast(`已置入输入框：${quote.title}`);
        },

        openForm(mode, id) {
            this.formMode = mode;
            this.editingId = id || null;
            const form = document.getElementById('fpcp-np-form');
            if (!form) return;
            const quote = mode === 'edit' ? this.quotes.find(q => q.id === id) : null;

            form.innerHTML = '';
            form.style.display = 'block';

            const titleInput = el('input', { class: 'fpcp-np-input', placeholder: '标题（留空自动截取）' });
            titleInput.value = quote ? quote.title : '';
            const contentInput = el('textarea', { class: 'fpcp-np-textarea', rows: '4', placeholder: '语录内容（支持 Markdown）' });
            contentInput.value = quote ? quote.content : '';

            form.appendChild(el('div', { class: 'fpcp-np-form-title', text: mode === 'edit' ? '编辑语录' : '添加语录' }));
            form.appendChild(titleInput);
            form.appendChild(contentInput);
            form.appendChild(el('div', { class: 'fpcp-np-form-actions' }, [
                el('button', {
                    class: 'fpcp-btn-sm fpcp-btn-primary', text: '保存',
                    onclick: () => {
                        const content = contentInput.value.trim();
                        if (!content) { toast('内容不能为空'); return; }
                        const title = titleInput.value.trim() || this.makeAutoTitle(content);
                        if (mode === 'edit' && this.editingId) {
                            const q = this.quotes.find(x => x.id === this.editingId);
                            if (q) { q.title = title; q.content = content; }
                        } else {
                            this.quotes.unshift({
                                id: 'q_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                                title, content,
                                author: '',
                                time: Date.now()
                            });
                        }
                        this.save();
                        this.renderList();
                        form.style.display = 'none';
                        toast('已保存');
                    }
                }),
                el('button', {
                    class: 'fpcp-btn-sm', text: '取消',
                    onclick: () => { form.style.display = 'none'; }
                })
            ]));
        },

        // 从消息收藏（⭐ 调用）
        addFromMessage(content, author) {
            const title = prompt('请输入语录标题（留空自动截取内容）', '');
            if (title === null) return;   // 取消
            this.quotes.unshift({
                id: 'q_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                title: title.trim() || this.makeAutoTitle(content),
                content,
                author: author || '',
                time: Date.now()
            });
            this.save();
            if (this.panel && this.panel.style.display !== 'none') this.renderList();
            toast('已收藏到记事本');
        },

        makeAutoTitle(content) {
            const plain = String(content)
                .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
                .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
                .replace(/^[>\s#*]+/gm, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (!plain) return '语录';
            return plain.length > 15 ? plain.slice(0, 15) + '…' : plain;
        },

        initDrag(panel) {
            const handle = panel.querySelector('.fpcp-np-drag');
            let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
            const pos = Store.get('np_pos', null);
            if (pos) {
                panel.style.left = pos.x + 'px';
                panel.style.top = pos.y + 'px';
            }
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                dragging = true;
                startX = e.clientX; startY = e.clientY;
                origX = panel.offsetLeft; origY = panel.offsetTop;
            });
            document.addEventListener('mousemove', (e) => {
                if (!dragging) return;
                panel.style.left = (origX + e.clientX - startX) + 'px';
                panel.style.top = (origY + e.clientY - startY) + 'px';
            });
            document.addEventListener('mouseup', () => {
                if (!dragging) return;
                dragging = false;
                Store.set('np_pos', { x: panel.offsetLeft, y: panel.offsetTop });
            });
        }
    };

    // ================== 表情包增强 EmojiEnhance ==================
    // 新版面板：div.panel.panel--fixed[aria-label="选择表情"]
    //   nav.categories > button[title="分组名"]   ← 分组 tab（原生）
    //   section.selection[aria-label="当前分组"] > div.grid--custom > button > img
    // 本模块给每个表情格挂 3 个悬浮按钮：一键发送 / 分配 / 删除
    // 全部走官方 REST API（/api/v3/me/settings/emoji-groups）
    const EmojiEnhance = {
        groupCache: null,        // [{id, name, sort}]
        emojiCache: new Map(),   // groupId -> [{id, url, name, sort}]

        init() {
            // 监听表情面板渲染（订阅唯一的 MessageWatcher）
            MessageWatcher.on(nodes => {
                for (const node of nodes) {
                    if (!(node instanceof Element)) continue;
                    const panels = [];
                    if (node.matches && node.matches('div.panel.panel--fixed')) panels.push(node);
                    if (node.querySelectorAll) panels.push(...node.querySelectorAll('div.panel.panel--fixed'));
                    for (const panel of panels) {
                        if (panel.getAttribute('aria-label') === '选择表情') this.decoratePanel(panel);
                    }
                }
            });
        },

        decoratePanel(panel) {
            if (panel.dataset.fpcpDecorated === '1') return;
            panel.dataset.fpcpDecorated = '1';
            // 面板内容随分组切换/插入表情重渲染 → 事件全部委托到 panel（不绑具体表情格，防重渲染后失效）
            panel.addEventListener('mouseover', (e) => {
                const btn = e.target instanceof Element ? e.target.closest('.grid--custom > button') : null;
                if (btn && panel.contains(btn)) this.showToolbar(panel, btn);
            });
            // 点击表情（置入输入框的原生行为）→ 立即隐藏工具条，避免残留
            panel.addEventListener('click', () => this.hideToolbar(0));
            // 离开整个面板 → 隐藏（不依赖表情格元素存活）
            panel.addEventListener('mouseleave', (e) => {
                const bar = document.getElementById('fpcp-emoji-bar');
                if (bar && e.relatedTarget && bar.contains(e.relatedTarget)) return;  // 移向工具条按钮不隐藏
                this.hideToolbar(0);
            });
            // 从表情格移出到面板空白/其他区域 → 延迟隐藏（移回表情格由 mouseover 取消）
            panel.addEventListener('mouseout', (e) => {
                const fromBtn = e.target instanceof Element && e.target.closest && e.target.closest('.grid--custom > button');
                const toEl = e.relatedTarget;
                const toBtn = toEl instanceof Element && toEl.closest && toEl.closest('.grid--custom > button');
                if (fromBtn && !toBtn && !(toEl instanceof Element && toEl.closest && toEl.closest('#fpcp-emoji-bar'))) {
                    this.hideToolbar(150);
                }
            });
        },

        // 隐藏工具条（delay>0 延迟执行，期间重新 hover 可取消）
        hideToolbar(delay) {
            const bar = document.getElementById('fpcp-emoji-bar');
            if (!bar) return;
            clearTimeout(bar._hideTimer);
            if (!delay) {
                bar.style.display = 'none';
                return;
            }
            bar._hideTimer = setTimeout(() => { bar.style.display = 'none'; }, delay);
        },

        // 单一悬浮覆盖层，跟随 hover 的表情格，三个按钮分布在表情四角（仿旧版，不挡表情本体）
        showToolbar(panel, emojiBtn) {
            if (!emojiBtn || !emojiBtn.isConnected) return;
            let bar = document.getElementById('fpcp-emoji-bar');
            if (!bar) {
                bar = el('div', { id: 'fpcp-emoji-bar' });
                document.body.appendChild(bar);
            }
            // 同一元素且已显示 → 只取消隐藏计时；元素被 Vue 重建后（引用变化）会走重建+重定位
            if (bar._btn === emojiBtn && bar.style.display === 'block') {
                clearTimeout(bar._hideTimer);
                return;
            }

            const url = this.emojiUrlOf(emojiBtn);
            const name = emojiBtn.getAttribute('title') || emojiBtn.getAttribute('aria-label') || '';
            bar._btn = emojiBtn;
            bar.dataset.targetUrl = url;

            bar.innerHTML = '';
            // 左上：分配
            bar.appendChild(el('button', {
                class: 'fpcp-eb-btn fpcp-eb-tl', text: '📁', title: '分配到分组',
                onclick: (e) => {
                    e.stopPropagation();
                    bar.style.display = 'none';
                    this.showAssignDialog(url, name);
                }
            }));
            // 右上：删除
            bar.appendChild(el('button', {
                class: 'fpcp-eb-btn fpcp-eb-tr fpcp-eb-danger', text: '🗑', title: '删除该表情',
                onclick: async (e) => {
                    e.stopPropagation();
                    bar.style.display = 'none';
                    await this.deleteEmoji(url);
                }
            }));
            // 右下：一键发送
            bar.appendChild(el('button', {
                class: 'fpcp-eb-btn fpcp-eb-br', text: '⚡', title: '一键发送',
                onclick: async (e) => {
                    e.stopPropagation();
                    bar.style.display = 'none';
                    try {
                        await Api.send(`![](${url})`);
                        toast('表情已发送');
                    } catch (err) {
                        toast('发送失败：' + (err && err.message ? err.message : err));
                    }
                }
            }));

            // 覆盖层精确罩住表情格（透明，仅四角按钮可见可点）
            const rect = emojiBtn.getBoundingClientRect();
            bar.style.display = 'block';
            bar.style.left = `${rect.left}px`;
            bar.style.top = `${rect.top}px`;
            bar.style.width = `${rect.width}px`;
            bar.style.height = `${rect.height}px`;
            clearTimeout(bar._hideTimer);

            // 工具条自身 hover 保持（按钮区域很小，防止移向按钮途中被延迟隐藏吞掉）
            bar.onmouseenter = () => clearTimeout(bar._hideTimer);
            bar.onmouseleave = () => this.hideToolbar(150);
        },

        // 表情原图 URL（剥掉缩略图参数）
        emojiUrlOf(btn) {
            const img = btn.querySelector('img');
            let src = img ? (img.getAttribute('src') || '') : '';
            return src.replace(/\?imageView2\/[^&]*/, '');
        },

        // 当前面板分组名
        currentGroupName(panel) {
            const section = panel.querySelector('section.selection');
            return section ? (section.getAttribute('aria-label') || '') : '';
        },

        // ===== API 数据层 =====
        async getGroups() {
            if (this.groupCache) return this.groupCache;
            const data = await Api.emojiGroups();
            // 兼容 {list:[...]} 或纯数组
            const list = Array.isArray(data) ? data : (data && Array.isArray(data.list) ? data.list : []);
            this.groupCache = list.map(g => ({ id: g.id ?? g.groupId, name: g.name, sort: g.sort }));
            return this.groupCache;
        },

        async getGroupEmojis(groupId) {
            if (this.emojiCache.has(groupId)) return this.emojiCache.get(groupId);
            const data = await Api.emojiList(groupId);
            const list = Array.isArray(data) ? data : (data && Array.isArray(data.list) ? data.list : []);
            const mapped = list.map(e => ({ id: e.id ?? e.emojiId, url: e.url, name: e.name, sort: e.sort }));
            this.emojiCache.set(groupId, mapped);
            return mapped;
        },

        // 按 URL 在所有分组里找表情（返回 [{groupId, emoji}]）
        async findEmojiEverywhere(url) {
            const groups = await this.getGroups();
            const hits = [];
            for (const g of groups) {
                try {
                    const emojis = await this.getGroupEmojis(g.id);
                    const hit = emojis.find(e => e.url === url);
                    if (hit) hits.push({ groupId: g.id, groupName: g.name, emoji: hit });
                } catch (e) { /* 分组读取失败忽略 */ }
            }
            return hits;
        },

        // 分配：弹出分组选择
        async showAssignDialog(url, name) {
            try {
                const groups = await this.getGroups();
                if (groups.length === 0) {
                    toast('还没有自定义分组，请先在「更多表情」里创建');
                    return;
                }
                // 移除旧弹窗
                const old = document.getElementById('fpcp-assign-dialog');
                if (old) old.remove();

                const dialog = el('div', { id: 'fpcp-assign-dialog' }, [
                    el('div', { class: 'fpcp-assign-title', text: `分配「${name || '表情'}」到分组` }),
                    el('div', { class: 'fpcp-assign-list' },
                        groups.map(g => el('button', {
                            class: 'fpcp-btn-sm fpcp-assign-item', text: g.name,
                            onclick: async () => {
                                dialog.remove();
                                await this.assignEmoji(url, name, g);
                            }
                        }))
                    ),
                    el('div', { class: 'fpcp-assign-actions' }, [
                        el('button', {
                            class: 'fpcp-btn-sm', text: '＋ 新建分组',
                            onclick: async () => {
                                const gname = prompt('新分组名称：');
                                if (!gname || !gname.trim()) return;
                                try {
                                    const g = await Api.emojiGroupCreate({ name: gname.trim(), sort: groups.length });
                                    this.groupCache = null;
                                    dialog.remove();
                                    await this.assignEmoji(url, name, { id: g.id ?? g.groupId, name: gname.trim() });
                                } catch (err) {
                                    toast('创建分组失败：' + (err && err.message ? err.message : err));
                                }
                            }
                        }),
                        el('button', { class: 'fpcp-btn-sm', text: '取消', onclick: () => dialog.remove() })
                    ])
                ]);
                document.body.appendChild(dialog);
            } catch (e) {
                toast('读取分组失败：' + (e && e.message ? e.message : e));
            }
        },

        // 分配语义（沿用旧版）：查重 → 添加到目标组 → 若当前在某个分组内则移出当前组
        async assignEmoji(url, name, targetGroup) {
            try {
                const groups = await this.getGroups();
                const target = groups.find(g => String(g.id) === String(targetGroup.id)) || targetGroup;
                // 查重
                const emojis = await this.getGroupEmojis(target.id).catch(() => []);
                if (emojis.some(e => e.url === url)) {
                    toast('目标分组已存在该表情');
                    return;
                }
                await Api.emojiAdd(target.id, { url, name: name || '', sort: emojis.length });
                this.emojiCache.delete(target.id);

                // 若当前面板停留在某个真实分组（非"全部"/"常用"），把原分组里的移除
                const panel = document.querySelector('div.panel.panel--fixed[aria-label="选择表情"]');
                const cur = panel ? this.currentGroupName(panel) : '';
                if (cur && cur !== '全部' && cur !== '常用' && cur !== target.name) {
                    const curGroup = groups.find(g => g.name === cur);
                    if (curGroup) {
                        const curEmojis = await this.getGroupEmojis(curGroup.id).catch(() => []);
                        const hit = curEmojis.find(e => e.url === url);
                        if (hit) {
                            await Api.emojiDel(curGroup.id, hit.id);
                            this.emojiCache.delete(curGroup.id);
                        }
                    }
                }
                toast(`已分配到「${target.name}」`);
            } catch (e) {
                toast('分配失败：' + (e && e.message ? e.message : e));
            }
        },

        // 删除：全部/常用中删 = 所有分组都删；某分组内删 = 仅本组
        async deleteEmoji(url) {
            try {
                const hits = await this.findEmojiEverywhere(url);
                if (hits.length === 0) {
                    toast('未找到该表情的分组数据');
                    return;
                }
                const panel = document.querySelector('div.panel.panel--fixed[aria-label="选择表情"]');
                const cur = panel ? this.currentGroupName(panel) : '全部';
                let toDelete = hits;
                if (cur && cur !== '全部' && cur !== '常用') {
                    toDelete = hits.filter(h => h.groupName === cur);
                }
                if (toDelete.length === 0) toDelete = hits;
                if (!confirm(`确定删除「${toDelete[0].emoji.name || '该表情'}」？${toDelete.length > 1 ? `（将从 ${toDelete.length} 个分组删除）` : ''}`)) return;
                for (const h of toDelete) {
                    await Api.emojiDel(h.groupId, h.emoji.id);
                    this.emojiCache.delete(h.groupId);
                }
                toast('删除成功');
                // 关面板让原生 UI 刷新
                if (panel) {
                    const closeBtn = panel.querySelector('button.ghost.more');
                    if (closeBtn) { /* 面板无关闭按钮时点击外部即可 */ }
                }
            } catch (e) {
                toast('删除失败：' + (e && e.message ? e.message : e));
            }
        }
    };

    // ================== GM API 兼容层 ==================
    // Safari 系脚本管理器（Stay、Userscripts 等）不一定提供 GM_addStyle/GM_registerMenuCommand，
    // 运行时判断：有原生 API 就用，没有则降级实现/跳过，保证脚本不崩
    function addStyle(css) {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
            return;
        }
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    function registerMenu(label, fn) {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand(label, fn);
        }
        // 无油猴菜单的环境静默跳过：各功能均有浮块/界面内入口，不丢功能
    }

    // ================== 样式 ==================
    function injectStyles() {
        addStyle(`
/* ---- 主题变量映射（跟随新 UI data-theme 深浅色自动切换） ---- */
:root {
  --fpcp-card: var(--fp-card, #fff);
  --fpcp-elevated: var(--fp-elevated, #fff);
  --fpcp-text: var(--fp-text, #333);
  --fpcp-text2: var(--fp-title, #868e96);
  --fpcp-border: var(--fp-border, #e4e6eb);
  --fpcp-subtle: var(--fp-surface-subtle, rgba(128, 128, 140, 0.08));
  --fpcp-input-bg: var(--fp-control-bg, #fff);
}

/* ---------- 全局 ---------- */
#fpcp-toast {
    position: fixed; left: 50%; top: 64px; transform: translateX(-50%) translateY(-8px);
    background: rgba(30, 32, 40, 0.92); color: #fff; padding: 8px 18px; border-radius: 8px;
    font-size: 13px; z-index: 10050; opacity: 0; pointer-events: none;
    transition: opacity .25s ease, transform .25s ease; max-width: 70vw;
}
#fpcp-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* ---------- 消息悬浮按钮 ---------- */
.fp-bubble, .message-stack { position: relative; }
.fpcp-msg-btn {
    position: absolute; border: none; background: rgba(128, 128, 140, 0.18);
    border-radius: 6px; width: 26px; height: 24px; font-size: 12px; line-height: 24px;
    cursor: pointer; transition: opacity .18s ease, background .18s ease;
    padding: 0; z-index: 20; color: inherit;
}
.fpcp-msg-btn:hover { background: rgba(51, 154, 240, 0.9); transform: scale(1.12); box-shadow: 0 2px 8px rgba(51, 154, 240, 0.45); }
/* 收藏星：气泡左下角角心（一半悬于消息体外），hover 显示 */
.fpcp-fav-btn { bottom: 0; left: 0; transform: translate(-50%, 50%); opacity: 0; }
.fpcp-fav-btn:hover { transform: translate(-50%, 50%) scale(1.12); }
.chat-message-entry:hover .fpcp-fav-btn { opacity: 1; }

/* ---------- 快捷按钮浮块 ---------- */
#fpcp-quick-actions {
    position: fixed; left: 20px; top: 20px; z-index: 9000;
    background: var(--fpcp-card); border: 1px solid var(--fpcp-border);
    border-radius: 10px; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.10);
    /* 与侧栏（清风明月等模块）同宽 */
    width: 360px; user-select: none; font-size: 13px;
}
.fpcp-qa-head {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px; border-bottom: 1px solid var(--fpcp-border); cursor: default;
}
.fpcp-qa-drag { cursor: grab; color: var(--fpcp-text2); letter-spacing: -1px; }
.fpcp-qa-drag:active { cursor: grabbing; }
.fpcp-qa-title { flex: 1; font-weight: 600; font-size: 12px; color: var(--fpcp-text); }
.fpcp-qa-icon { border: none; background: none; cursor: pointer; font-size: 14px; padding: 2px 4px; border-radius: 5px; }
.fpcp-qa-icon:hover { background: rgba(128, 128, 140, 0.15); }
.fpcp-qa-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 10px 12px; }
.fpcp-btn {
    position: relative;
    border: none; border-radius: 6px; padding: 8px 10px; cursor: pointer;
    font-size: 13px; color: #fff; transition: filter .15s ease; white-space: nowrap;
    /* 统一 5 字宽度基准，格子内等分拉伸 */
    min-width: 84px; box-sizing: border-box; text-align: center;
}
.fpcp-btn:hover { filter: brightness(1.1); }
.fpcp-btn.fpcp-cooling { opacity: 0.55; cursor: not-allowed; }
/* 冷却倒计时角标：绝对定位不占宽度 */
.fpcp-cd {
    position: absolute; top: -8px; right: -6px;
    background: rgba(220, 53, 69, 0.92); color: #fff;
    font-size: 9px; line-height: 1.5; padding: 0 5px;
    border-radius: 8px; pointer-events: none;
    font-weight: 600;
}
.btn-blue { background: #339af0; }
.btn-red { background: #ff6b6b; }
.btn-warn { background: #ff922b; }
.btn-green { background: #51cf66; }
.fpcp-children-pop {
    position: fixed; z-index: 9500;
    /* 每列最多 9 个，超出自动开新列（以屏幕中间装订位为极限基准） */
    display: grid; grid-auto-flow: column; grid-template-rows: repeat(9, auto); gap: 6px;
    background: var(--fpcp-card); border: 1px solid var(--fpcp-border);
    border-radius: 8px; padding: 8px; box-shadow: 0 6px 22px rgba(0, 0, 0, 0.14);
    max-height: calc(100vh - 16px);
}
/* 装订（进入侧栏）态：静态卡片，融入侧栏模块 */
#fpcp-quick-actions.fpcp-docked {
    position: static !important;
    width: 100%; margin: 6px 0;   /* 上下留空收紧 */
    box-shadow: none;
    border-radius: var(--border-radius, 10px);
}
/* 拖动中：禁用过渡与选中，降低重排开销 */
#fpcp-quick-actions.fpcp-dragging { user-select: none; will-change: left, top; }
#fpcp-quick-actions.fpcp-dragging * { pointer-events: none; }

/* ---------- 配置界面 ---------- */
#fpcp-editor-overlay {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 10000;
    display: flex; align-items: center; justify-content: center;
}
.fpcp-editor-panel {
    width: min(880px, 94vw); max-height: 86vh; display: flex; flex-direction: column;
    background: var(--fpcp-card); border-radius: 12px; overflow: hidden;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.fpcp-editor-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; border-bottom: 1px solid var(--fpcp-border);
}
.fpcp-editor-title { font-size: 16px; font-weight: 700; }
.fpcp-editor-head-actions { display: flex; gap: 8px; }
.fpcp-editor-body { display: flex; gap: 14px; padding: 14px 18px; overflow: auto; }
.fpcp-editor-list { flex: 1.2; min-width: 280px; }
.fpcp-editor-json { flex: 1; display: flex; flex-direction: column; }
.fpcp-editor-list-title { font-size: 12px; font-weight: 600; color: #888; margin-bottom: 8px; }
#fpcp-btn-list { display: flex; flex-direction: column; gap: 10px; }
/* ---- 配置界面快速定位栏 ---- */
.fpcp-nav-bar {
    position: sticky; top: 0; z-index: 5;
    display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
    padding: 6px 4px; margin-bottom: 8px;
    background: var(--fpcp-card);
    border-bottom: 1px dashed var(--fpcp-border);
}
.fpcp-nav-label { font-size: 11px; color: var(--fpcp-text2); margin-right: 2px; }
.fpcp-nav-chip {
    border: 1px solid var(--fpcp-border); background: transparent; color: inherit;
    border-radius: 20px; padding: 2px 10px; cursor: pointer; font-size: 11px;
    max-width: 84px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fpcp-nav-chip:hover { background: #339af0; border-color: #339af0; color: #fff; }
.fpcp-nav-pop {
    position: fixed; z-index: 10010;
    display: flex; flex-wrap: wrap; gap: 5px; max-width: 320px;
    background: var(--fpcp-card); border: 1px solid var(--fpcp-border);
    border-radius: 8px; padding: 8px; box-shadow: 0 6px 22px rgba(0, 0, 0, 0.14);
}
.fpcp-nav-chip-sub { background: var(--fpcp-subtle); }
/* 跳转闪烁高亮 */
@keyframes fpcp-nav-flash-anim {
    0% { box-shadow: 0 0 0 3px rgba(51, 154, 240, 0.85); }
    100% { box-shadow: 0 0 0 3px rgba(51, 154, 240, 0); }
}
.fpcp-nav-flash { animation: fpcp-nav-flash-anim 1.2s ease; border-radius: 8px; }
/* ---- 按钮卡片层级区分 ---- */
.fpcp-edit-item {
    border: 1px solid var(--fpcp-border); border-radius: 8px; padding: 10px;
    background: var(--fpcp-subtle);
}
.fpcp-edit-item--top { border-left: 4px solid #339af0; }
.fpcp-edit-item--sub { border-left: 4px solid #b26a00; background: rgba(255, 146, 43, 0.06); }
.fpcp-edit-item-head {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 8px; padding-bottom: 6px;
    border-bottom: 1px dashed var(--fpcp-border);
    scroll-margin-top: 60px;   /* 跳转定位时避开粘性定位栏 */
}
.fpcp-edit-badge {
    font-size: 10px; font-weight: 700; color: #fff;
    padding: 1px 8px; border-radius: 8px; flex: none;
}
.fpcp-edit-badge.is-top { background: #339af0; }
.fpcp-edit-badge.is-sub { background: #d97706; }
.fpcp-edit-item-no { font-size: 11px; color: var(--fpcp-text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fpcp-edit-children-label {
    font-size: 11px; font-weight: 600; color: #b26a00;
    padding: 4px 2px; margin-top: 4px;
}
.fpcp-edit-row { display: flex; align-items: center; gap: 6px; }
.fpcp-edit-name { flex: 1; min-width: 60px; padding: 5px 8px; border: 1px solid var(--fpcp-border); border-radius: 6px; font-size: 13px; }
.fpcp-edit-color, .fpcp-edit-type { padding: 5px 6px; border: 1px solid var(--fpcp-border); border-radius: 6px; font-size: 12px; background: transparent; color: inherit; }
.fpcp-edit-form { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.fpcp-edit-field { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #888; }
.fpcp-edit-field input, .fpcp-edit-field select {
    padding: 5px 8px; border: 1px solid var(--fpcp-border); border-radius: 6px; font-size: 12px;
    background: transparent; color: inherit;
}
.fpcp-edit-code { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--fpcp-border); border-radius: 6px; font-size: 11px; font-family: Consolas, monospace; background: transparent; color: inherit; resize: vertical; }
/* ---- URL请求多请求编辑器 ---- */
.fpcp-req-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.fpcp-req-hint { font-size: 11px; color: var(--fpcp-text2); line-height: 1.5; }
.fpcp-req-card {
    border: 1px solid var(--fpcp-border); border-radius: 8px;
    padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;
    background: var(--fpcp-subtle);
}
.fpcp-req-head { display: flex; align-items: center; gap: 8px; }
.fpcp-req-no { font-size: 11px; font-weight: 700; color: #339af0; min-width: 22px; }
.fpcp-req-spacer { flex: 1; }
.fpcp-req-endpoint, .fpcp-req-delay {
    width: 100%; box-sizing: border-box; padding: 5px 8px;
    border: 1px solid var(--fpcp-border); border-radius: 6px;
    font-size: 12px; background: transparent; color: inherit;
}
.fpcp-req-row { display: flex; gap: 10px; }
.fpcp-req-field { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #888; }
.fpcp-req-field input, .fpcp-req-field select {
    padding: 4px 6px; border: 1px solid var(--fpcp-border); border-radius: 6px;
    font-size: 12px; background: transparent; color: inherit;
}
.fpcp-req-body { display: flex; flex-direction: column; gap: 6px; }
.fpcp-edit-opts { display: flex; gap: 14px; margin-top: 8px; font-size: 12px; color: #888; align-items: center; }
.fpcp-edit-opts input[type="number"] { width: 62px; padding: 3px 6px; border: 1px solid var(--fpcp-border); border-radius: 5px; background: transparent; color: inherit; }
.fpcp-edit-children {
    margin-top: 10px; padding-left: 14px;
    border-left: 2px dashed rgba(217, 119, 6, 0.45);
    display: flex; flex-direction: column; gap: 8px;
}
#fpcp-json-input {
    flex: 1; min-height: 300px; width: 100%; box-sizing: border-box;
    font-family: Consolas, monospace; font-size: 11.5px; padding: 10px;
    border: 1px solid var(--fpcp-border); border-radius: 8px; resize: vertical;
    background: transparent; color: inherit;
}
#fpcp-json-status { margin-top: 6px; font-size: 12px; min-height: 16px; }
.fpcp-json-ok { color: #51cf66; }
.fpcp-json-err { color: #ff6b6b; }
.fpcp-btn-sm {
    border: 1px solid var(--fpcp-border); background: transparent; color: inherit;
    border-radius: 6px; padding: 5px 12px; cursor: pointer; font-size: 12px;
}
.fpcp-btn-sm:hover { background: var(--fpcp-subtle); }
.fpcp-btn-primary { background: #339af0; border-color: #339af0; color: #fff; }
.fpcp-btn-primary:hover { background: #2b86d9; }
.fpcp-btn-danger { border-color: #ff6b6b; color: #ff6b6b; }
.fpcp-btn-danger:hover { background: rgba(255, 107, 107, 0.12); }
.fpcp-btn-add { margin-top: 10px; width: 100%; border-style: dashed; }

/* ---------- 记事本 ---------- */
#fpcp-notepad {
    position: fixed; right: 24px; top: 80px; z-index: 9600; width: min(360px, 92vw);
    max-height: 70vh; display: none; flex-direction: column;
    background: var(--fpcp-card); border: 1px solid var(--fpcp-border);
    border-radius: 12px; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.16); overflow: hidden;
}
.fpcp-np-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--fpcp-border); }
.fpcp-np-drag { cursor: grab; color: var(--fpcp-text2); }
.fpcp-np-title { flex: 1; font-weight: 700; font-size: 13px; }
#fpcp-np-list { flex: 1; overflow: auto; padding: 8px; }
.fpcp-np-empty { color: var(--fpcp-text2); font-size: 12px; text-align: center; padding: 30px 10px; line-height: 1.8; white-space: pre-line; }
/* 语录条目：左主区（点击置入输入框）+ 右侧竖排小按钮 */
.fpcp-np-item {
    display: flex; align-items: stretch; gap: 6px;
    border: 1px solid var(--fpcp-border); border-radius: 6px;
    margin-bottom: 8px; overflow: hidden;
    background: var(--fpcp-card);
}
.fpcp-np-item-main {
    flex: 1; min-width: 0; padding: 8px 10px; cursor: pointer;
    transition: background .15s;
}
.fpcp-np-item-main:hover { background: rgba(245, 159, 0, 0.12); }
.fpcp-np-item-title {
    font-weight: 600; font-size: 13px; margin-bottom: 3px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fpcp-np-item-preview {
    color: var(--fpcp-text2); font-size: 12px; margin-bottom: 3px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fpcp-np-item-meta { color: var(--fpcp-text2); font-size: 11px; }
/* 右侧竖排小按钮 */
.fpcp-np-item-ops {
    display: flex; flex-direction: column;
    border-left: 1px solid var(--fpcp-border);
}
.fpcp-np-item-ops button {
    flex: 1; border: none; background: transparent; cursor: pointer;
    font-size: 12px; color: var(--fpcp-text2); padding: 4px 8px;
    transition: background .15s, color .15s;
}
.fpcp-np-item-ops button:hover { background: var(--fpcp-subtle); color: inherit; }
.fpcp-np-item-ops .fpcp-np-send { color: #2b8a3e; }
.fpcp-np-item-ops .fpcp-np-send:hover { background: rgba(43, 138, 62, 0.14); color: #2b8a3e; }
#fpcp-np-form { padding: 10px 14px; border-top: 1px solid var(--fpcp-border); display: flex; flex-direction: column; gap: 8px; }
.fpcp-np-form-title { font-size: 12px; font-weight: 600; }
.fpcp-np-input, .fpcp-np-textarea { padding: 7px 10px; border: 1px solid var(--fpcp-border); border-radius: 6px; font-size: 12px; background: transparent; color: inherit; }
.fpcp-np-textarea { resize: vertical; font-family: inherit; }
.fpcp-np-form-actions { display: flex; gap: 8px; }

/* ---------- 表情包四角工具按钮 ---------- */
#fpcp-emoji-bar {
    position: fixed; z-index: 10020; display: none;
    pointer-events: none;   /* 覆盖层透明，仅角标按钮可点 */
    border-radius: 6px;
}
.fpcp-eb-btn {
    position: absolute; border: none; cursor: pointer; padding: 0;
    width: 18px; height: 18px; font-size: 10px; line-height: 18px;
    border-radius: 50%; color: #fff;
    background: rgba(30, 32, 40, 0.72); pointer-events: auto;
    transition: transform .12s ease, background .12s ease;
}
.fpcp-eb-btn:hover { transform: scale(1.18); background: rgba(51, 154, 240, 0.92); }
.fpcp-eb-danger:hover { background: rgba(255, 80, 80, 0.92); }
.fpcp-eb-tl { top: -7px; left: -7px; }
.fpcp-eb-tr { top: -7px; right: -7px; }
.fpcp-eb-br { bottom: -7px; right: -7px; }

/* ---------- 分配弹窗 ---------- */
#fpcp-assign-dialog {
    position: fixed; left: 50%; top: 38%; transform: translateX(-50%); z-index: 10030;
    background: var(--fpcp-card); border: 1px solid var(--fpcp-border);
    border-radius: 12px; padding: 16px 18px; min-width: 260px; max-width: 82vw;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.24);
}
.fpcp-assign-title { font-size: 13px; font-weight: 700; margin-bottom: 10px; }
.fpcp-assign-list { display: flex; flex-wrap: wrap; gap: 8px; max-height: 240px; overflow: auto; }
.fpcp-assign-item { background: var(--fpcp-subtle); }
.fpcp-assign-actions { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }
`);
    }

    // ================== 初始化 ==================
    function init() {
        installFetchHook();
        injectStyles();

        // 后台预热 token：脚本 document-end 运行，应用首批带 Bearer 的请求（defer 模块发起）
        // 多在钩子安装前已发出、来不及捕获 → 首次点击会付 ~400ms 刷新代价；
        // 启动时后台预热（不 await、不阻塞首屏），失败静默——点击时仍会走正常刷新流程
        Api.token().catch(() => { });

        // 统一消息监听单例启动
        MessageWatcher.start();
        MessageActions.init();
        EmojiEnhance.init();

        // 快捷浮块
        QuickActions.init();

        // 补扫现存消息
        MessageWatcher.scanNow();

        // 油猴菜单（Safari 等无菜单 API 的环境自动跳过）
        registerMenu('按钮配置', () => Editor.open());
        registerMenu('语录记事本', () => Notepad.toggle());
        registerMenu('启用/禁用快捷浮窗', () => {
            const nowDisabled = Store.get('ui_disabled') === 'true';
            Store.set('ui_disabled', nowDisabled ? 'false' : 'true');
            toast(nowDisabled ? '快捷浮窗已启用，刷新页面生效' : '快捷浮窗已关闭，刷新页面生效');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
