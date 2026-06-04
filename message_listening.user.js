// ==UserScript==
// @name         鱼排消息云·关键词监听
// @namespace    https://fishpi.cn
// @license      MIT
// @version      1.0.1
// @description  监听聊天室关键词/指定用户，消息云图标闪烁提醒，聚合记录并支持上下文追溯
// @author       muli 定制
// @match        https://fishpi.cn/cr
// @icon         https://file.fishpi.cn/2025/11/blob-4d0e46ad.png?imageView2/1/w/48/h/48/interlace/0/q/100
// @downloadURL  https://raw.githubusercontent.com/mu-xiao-li/yupai-extend-js/main/message_listening.user.js
// @updateURL    https://raw.githubusercontent.com/mu-xiao-li/yupai-extend-js/main/message_listening.user.js
// @grant        GM_notification
// @grant        muliSpecialStorage.setItem
// @grant        muliSpecialStorage.getItem
// @run-at       document-end
// ==/UserScript==
// 2026-06-04 muli 修复暂停监听按钮与实际是否监听状态不一致问题，修复弹出界面无法拖动问题

(function() {
    'use strict';

    // 存储中心 -- 存储和获取时 都是string 需要手动还原对象类型
    // 所有数据 优先级都是先从云端获取
    const muliSpecialStorage = {
        // 保存数据
        setItem: function (key, data) {
            if (typeof data === 'object') {
                data = JSON.stringify(data);
            }
            if (typeof cloudStorage !== 'undefined') {
                cloudStorage.setItem(key, data);
            }
            localStorage.setItem(key, data);
        },
        // 获取缓存的数据
        getItem: function (key, defaultData) {
            if (typeof defaultData === 'object') {
                defaultData = JSON.stringify(defaultData);
            }
            let data = null;
            // 先从云端获取
            if (typeof cloudStorage !== 'undefined') {
                data = cloudStorage.getItem(key, defaultData);
                if (data && typeof data === 'object') {
                    data = JSON.stringify(data);
                }
            }
            if (!data || data == null || data == '' || data == {} || data == '{}' || data == 'undefined') {
                data = localStorage.getItem(key);
                // 本地存在 云端不存在，则同步到云端
                if (data && data != null && data != '' && typeof cloudStorage !== 'undefined') {
                    cloudStorage.setItem(key, data);
                }
            } else {
                // 云端获取的有效值 确保是string
                if (typeof data === 'object') {
                    data = JSON.stringify(data);
                }
            }

            if (defaultData && (!data || data == null || data == '' || data == {} || data == '{}' || data == 'undefined')) {
                return defaultData;
            }

            return data;
        },
        // 删除缓存数据
        removeItem: function (key) {
            if (typeof cloudStorage !== 'undefined') {
                cloudStorage.removeItem(key);
            }
            localStorage.removeItem(key);
        }

    }

    // ======================== 配置与存储 ========================
    const STORAGE_KEY = 'MsgCloudConfig';
    const GROUPS_KEY = 'MsgCloudGroups';

    // 默认配置
    let CONFIG = {
        keywords: ['沐里', '红包', '公告'],   // 监听的关键词列表
        users: [],                           // 监听指定用户（精确匹配）
        enableMonitor: true,                 // 是否启用监听
        enableNotification: true,            // 是否开启浏览器通知
        mergeMinutes: 10,                    // 合并窗口（分钟）：同一关键词/用户在此时间内多次触发合并为一条组记录
        maxGroups: 100,                      // 最多保留组数
        maxMessagesPerGroup: 20              // 每组最多保存的消息条数（用于详情展示）
    };

    // 存储数据结构说明：
    // groups 数组，每个元素：
    // {
    //   id: 唯一标识,
    //   key: 关键词或用户名,
    //   type: 'keyword' 或 'user',
    //   firstTime: 组内第一条消息的时间字符串,
    //   latestTime: 组内最新消息时间,
    //   count: 累计触发次数（包括合并的）,
    //   unread: 未读次数（面板关闭期间新增的次数）,
    //   firstSender: 第一个触发消息的发送者,
    //   messages: 存储的消息对象数组（最多maxMessagesPerGroup条），每个消息包含时间、发送者、html内容、原始消息id等
    // }
    let groups = [];
    let processedMsgIds = new Set();   // 已处理的消息ID，防止重复处理
    let isPaused = false;              // 手动暂停监听
    let unreadTotal = 0;               // 所有组的未读总数
    let isPanelOpen = false;           // 主面板是否展开
    let floatingIcon = null;           // 浮动图标元素
    let mainPanel = null;              // 主面板元素
    let blinkInterval = null;          // 闪烁定时器
    let notificationPerm = false;      // 浏览器通知权限
    let isDragging = false;            // 拖拽标志，用于防止误触点击

    // 观察器相关
    let chatObserver = null;
    let lastProcessTime = 0;            // 防抖时间戳

    // 辅助函数：保存配置到 GM 存储
    function saveConfig() {
        muliSpecialStorage.setItem(STORAGE_KEY, JSON.stringify(CONFIG));
        //console.log('[消息云] 配置已保存');
    }

    // 加载配置
    function loadConfig() {
        const saved = muliSpecialStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const cfg = JSON.parse(saved);
                CONFIG = { ...CONFIG, ...cfg };
                //console.log('[消息云] 配置已加载', CONFIG);
                isPaused = !CONFIG.enableMonitor;
            } catch(e) { console.error('[消息云] 加载配置失败', e); }
        }
    }

    // 保存 groups 数据（只保存可序列化的部分）
    function saveGroups() {
        const toSave = groups.map(g => ({
            id: g.id,
            key: g.key,
            type: g.type,
            firstTime: g.firstTime,
            latestTime: g.latestTime,
            count: g.count,
            unread: g.unread,
            firstSender: g.firstSender,
            messages: g.messages.map(m => ({
                id: m.id,
                time: m.time,
                sender: m.sender,
                contentHtml: m.contentHtml,
                originMsgId: m.originMsgId
            }))
        }));
        muliSpecialStorage.setItem(GROUPS_KEY, JSON.stringify(toSave));
    }

    // 加载 groups 数据（消息中的 rawItemClone 需要重建，因为 DOM 克隆不能序列化）
    function loadGroups() {
        const saved = muliSpecialStorage.getItem(GROUPS_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                groups = parsed.map(g => ({
                    ...g,
                    messages: g.messages.map(m => ({ ...m, rawItemClone: null }))
                }));
                //console.log('[消息云] 已加载历史数据，共', groups.length, '组');
            } catch(e) { console.error('[消息云] 加载历史数据失败', e); }
        }
    }

    // 生成唯一ID
    function genId() {
        return Date.now() + '-' + Math.random().toString(36).substr(2, 8);
    }

    // ======================== 核心监听逻辑 ========================

    /**
     * 从聊天项节点中提取唯一标识（用于去重）
     * 优先使用 chatroom 开头的 id，否则根据用户名、时间、文本前30字符组合
     */
    function getMessageId(chatItem) {
        if (chatItem.id && chatItem.id.startsWith('chatroom')) return chatItem.id;
        const timeElem = chatItem.querySelector('.date-bar');
        const userElem = chatItem.querySelector('#userName .ft-gray');
        const textElem = chatItem.querySelector('.chat__msg');
        const time = timeElem ? timeElem.textContent.trim().substring(0,19) : new Date().toLocaleString();
        const user = userElem ? userElem.textContent.trim() : '';
        const text = textElem ? textElem.textContent.trim() : '';
        return `${user}_${time}_${text.slice(0,30)}`;
    }

    /**
     * 解析聊天项，提取发送者、时间、内容
     */
    function parseMessage(chatItem) {
        const userElem = chatItem.querySelector('#userName .ft-gray');
        const timeElem = chatItem.querySelector('.date-bar');
        const contentElem = chatItem.querySelector('.vditor-reset');
        const sender = userElem ? userElem.textContent.trim() : '匿名';
        const time = timeElem ? timeElem.textContent.trim().substring(0,19) : new Date().toLocaleString();
        const content = contentElem ? contentElem.textContent.trim() : '';
        const contentHtml = contentElem ? contentElem.innerHTML : '';
        return { sender, time, content, contentHtml };
    }

    /**
     * 检查消息是否匹配监听条件
     * 规则：先匹配用户（精确匹配），若匹配则返回 user 类型；否则匹配关键词（包含匹配）
     * 返回 null 表示不匹配
     */
    function checkMatch(sender, content) {
        if (!CONFIG.enableMonitor || isPaused) return null;
        const normalizedSender = sender.trim();
        // 优先匹配用户（精确匹配）
        if (CONFIG.users.some(u => u && (normalizedSender.includes('(' + u + ')') || normalizedSender.includes('-' + u) ) )) {
            return { type: 'user', matched: normalizedSender };
        }
        // 再匹配关键词（包含匹配）
        const matchedKeyword = CONFIG.keywords.find(kw => content.includes(kw));
        if (matchedKeyword) {
            return { type: 'keyword', matched: matchedKeyword };
        }
        return null;
    }

    /**
     * 查找是否存在可合并的组
     * 合并条件：类型相同、key相同，且当前时间距离该组的 firstTime 在 mergeMinutes 分钟内
     */
    function findMergeGroup(matchKey, matchType, msgTime) {
        const msgDate = new Date(msgTime);
        for (let i = 0; i < groups.length; i++) {
            const g = groups[i];
            if (g.type === matchType && g.key === matchKey) {
                const firstDate = new Date(g.firstTime);
                const diffMin = (msgDate - firstDate) / 1000 / 60;
                if (diffMin <= CONFIG.mergeMinutes) {
                    return g;   // 在合并窗口内，返回该组
                }
            }
        }
        return null;
    }

    /**
     * 处理单条聊天消息节点
     * 如果匹配监听条件，则更新 groups 数据、触发通知、更新UI
     */
    function processChatItem(chatItem) {
        const msgId = getMessageId(chatItem);
        // 去重：已经处理过的消息不再处理
        if (processedMsgIds.has(msgId)) {
            return false;
        }

        const { sender, time, content, contentHtml } = parseMessage(chatItem);
        const match = checkMatch(sender, content);
        if (!match) return false;

        // 标记已处理
        processedMsgIds.add(msgId);
        //console.log(`[消息云] 捕获到匹配: ${match.type}="${match.matched}" from ${sender} at ${time}`);

        const { type, matched } = match;
        const groupKey = matched;   // 用户组用用户名，关键词组用关键词
        const existingGroup = findMergeGroup(groupKey, type, time);

        // 克隆消息节点，用于详情展示（保留原始样式，移除操作按钮）
        const clonedItem = chatItem.cloneNode(true);
        clonedItem.querySelectorAll('.action__item, .fn__layer, details').forEach(el => el.remove());
        const newMsg = {
            id: genId(),
            time: time,
            sender: sender,
            contentHtml: contentHtml,
            originMsgId: msgId,
            rawItemClone: clonedItem
        };

        if (existingGroup) {
            // === 合并到已有组 ===
            existingGroup.count++;
            existingGroup.latestTime = time;
            // 保存消息，超出限制则移除最旧的
            existingGroup.messages.push(newMsg);
            if (existingGroup.messages.length > CONFIG.maxMessagesPerGroup) {
                existingGroup.messages.shift();
            }
            // 如果面板未打开，增加未读计数
            if (!isPanelOpen) {
                existingGroup.unread++;
                unreadTotal++;
            }
            //console.log(`[消息云] 合并到组 "${groupKey}"，当前组共 ${existingGroup.count} 次触发`);
            saveGroups();
            updateUI();
        } else {
            // === 创建新组 ===
            const newGroup = {
                id: genId(),
                key: groupKey,
                type: type,
                firstTime: time,
                latestTime: time,
                count: 1,
                unread: isPanelOpen ? 0 : 1,
                firstSender: sender,
                messages: [newMsg]
            };
            groups.unshift(newGroup);   // 新组放在最前
            if (!isPanelOpen) unreadTotal++;
            // 限制组数量
            while (groups.length > CONFIG.maxGroups) {
                const removed = groups.pop();
                if (removed && removed.unread) unreadTotal = Math.max(0, unreadTotal - removed.unread);
            }
            //console.log(`[消息云] 新建组 "${groupKey}"`);
            saveGroups();
            updateUI();

            // 浏览器通知：仅新建组时触发一次
            if (CONFIG.enableNotification && notificationPerm && !isPanelOpen) {
                const title = type === 'user' ? `👤 关注人: ${matched}` : `🔑 关键词: ${matched}`;
                const body = `${sender}: ${content.slice(0, 80)}`;
                GM_notification({ title, text: body, timeout: 5000 });
                //console.log(`[消息云] 发送通知: ${title}`);
            }
        }

        // 如果面板未打开，启动图标闪烁
        if (!isPanelOpen) startBlink();
        return true;
    }

    /**
     * 全量扫描：初始化时处理所有现有聊天消息
     */
    function scanAllMessages() {
        const chatItems = document.querySelectorAll('#comments .chats__item');
        //console.log(`[消息云] 全量扫描，共 ${chatItems.length} 条消息`);
        chatItems.forEach(item => processChatItem(item));
        updateUI();
    }

    /**
     * 启动 MutationObserver 监听聊天室新增节点
     * 参考红包脚本的实现，但改为直接处理新增的聊天项节点，避免重复扫描全部
     */
    function startChatroomMonitoring() {
        const chatContainer = document.getElementById('comments');
        if (!chatContainer) {
            console.error('[消息云] 未找到聊天室容器，1秒后重试');
            setTimeout(startChatroomMonitoring, 1000);
            return;
        }
        if (chatObserver) chatObserver.disconnect();

        chatObserver = new MutationObserver((mutations) => {
            // 防抖：500ms 内只处理一次
            const now = Date.now();
            if (now - lastProcessTime < 500) return;
            lastProcessTime = now;

            // 收集所有新增的聊天项节点
            const addedItems = [];
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // 可能新增的是 .chats__item 本身，或者是包含它的容器
                            if (node.classList && node.classList.contains('chats__item')) {
                                addedItems.push(node);
                            } else {
                                const items = node.querySelectorAll('.chats__item');
                                items.forEach(item => addedItems.push(item));
                            }
                        }
                    }
                }
            }
            if (addedItems.length > 0) {
                //console.log(`[消息云] 检测到 ${addedItems.length} 条新消息`);
                // 延迟处理，确保 DOM 完全渲染
                setTimeout(() => {
                    addedItems.forEach(item => processChatItem(item));
                    updateUI();
                }, 100);
            }
        });

        chatObserver.observe(chatContainer, {
            childList: true,
            subtree: true
        });
        //console.log('[消息云] 已启动聊天室监听');
    }

    // ======================== UI 组件（浮动图标、主面板、配置对话框） ========================

    // 开始闪烁提醒
    function startBlink() {
        if (blinkInterval) clearInterval(blinkInterval);
        if (!floatingIcon) return;
        let state = false;
        blinkInterval = setInterval(() => {
            if (floatingIcon && !isPanelOpen && unreadTotal > 0) {
                floatingIcon.style.backgroundColor = state ? '#ff8c69' : '#ff4757';
                floatingIcon.style.boxShadow = state ? '0 0 15px #ff6b6b' : '0 0 25px #ff0000';
                state = !state;
            } else if (floatingIcon && unreadTotal === 0) {
                floatingIcon.style.backgroundColor = '#3498db';
                floatingIcon.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            }
        }, 800);
    }

    function stopBlink() {
        if (blinkInterval) clearInterval(blinkInterval);
        if (floatingIcon) {
            floatingIcon.style.backgroundColor = '#3498db';
            floatingIcon.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        }
    }

    // 创建可拖拽的浮动图标
    function createFloatingIcon() {
        const icon = document.createElement('div');
        icon.id = 'msgcloud-icon';
        icon.innerHTML = '☁️';
        icon.style.cssText = `
            position: fixed; bottom: 120px; right: 30px; width: 58px; height: 58px;
            background: #3498db; border-radius: 50%; cursor: move; z-index: 10000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3); display: flex; align-items: center;
            justify-content: center; font-size: 32px; color: white; user-select: none;
            border: 2px solid white; transition: 0.1s;
        `;
        const badge = document.createElement('span');
        badge.id = 'msgcloud-badge';
        badge.style.cssText = `position: absolute; top: -5px; right: -5px; background: #ff4757;
            color: white; border-radius: 20px; padding: 2px 6px; font-size: 12px; font-weight: bold;`;
        badge.textContent = '0';
        icon.appendChild(badge);
        document.body.appendChild(icon);
        makeDraggable(icon);
        // 点击展开/收起面板（拖拽时不会误触发）
        icon.addEventListener('click', (e) => {
            if (isDragging) return;
            toggleMainPanel();
        });
        return icon;
    }

    // 使元素可拖拽（支持图标和面板头部）
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

    // 使面板可拖拽（拖拽头部移动整个面板）
    function makePanelDraggable(panel, handle) {
        let isDragging = false;
        let dragStartX = 0, dragStartY = 0;
        let panelStartLeft = 0, panelStartTop = 0;

        handle.style.cursor = 'move';
        handle.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            isDragging = false;
            // 获取面板当前的位置（left/top）
            const rect = panel.getBoundingClientRect();
            panelStartLeft = rect.left;
            panelStartTop = rect.top;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const onMouseMove = (moveEvent) => {
                const dx = moveEvent.clientX - dragStartX;
                const dy = moveEvent.clientY - dragStartY;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging = true;
                if (isDragging) {
                    let newLeft = panelStartLeft + dx;
                    let newTop = panelStartTop + dy;
                    // 限制边界
                    newLeft = Math.min(window.innerWidth - panel.offsetWidth, Math.max(0, newLeft));
                    newTop = Math.min(window.innerHeight - panel.offsetHeight, Math.max(0, newTop));
                    panel.style.left = newLeft + 'px';
                    panel.style.top = newTop + 'px';
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
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

    // 更新未读数字角标
    function updateUnreadBadge() {
        const badge = document.getElementById('msgcloud-badge');
        if (badge) badge.textContent = unreadTotal > 0 ? unreadTotal : '';
        if (unreadTotal > 0 && !isPanelOpen) startBlink();
        else if (unreadTotal === 0) stopBlink();
    }

    // 渲染主面板中的组列表（一级菜单）
    function renderGroupList() {
        const container = document.getElementById('msgcloud-list');
        if (!container) return;
        if (groups.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#aaa; padding: 40px;">暂无匹配消息<br>设置关键词或指定用户后自动捕获</div>';
            return;
        }
        container.innerHTML = '';
        groups.forEach(group => {
            const div = document.createElement('div');
            div.style.cssText = 'background: white; margin-bottom: 10px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;';
            if (group.unread > 0) div.style.backgroundColor = '#fff5e6';
            const header = document.createElement('div');
            header.style.cssText = 'padding: 10px 12px 4px 12px; display: flex; justify-content: space-between; align-items: center;';
            const left = document.createElement('div');
            const displayTime = group.firstTime.split(' ')[0] + ' ' + (group.firstTime.split(' ')[1]?.slice(0,5) || '');
            left.innerHTML = `
                <div style="font-size: 12px; color: #666;">${displayTime} · ${group.firstSender}</div>
                <div style="font-weight: 500; margin-top: 4px;">
                    ${group.type === 'user' ? `👤 关注人 ${group.key} 发言` : `🔑 提到「${group.key}」`}
                    ${group.count > 1 ? `<span style="background:#e0e0e0; border-radius:30px; padding:0 8px; margin-left:8px; font-size:12px;">${group.count}次</span>` : ''}
                </div>
            `;
            const delBtn = document.createElement('button');
            delBtn.textContent = '✕';
            delBtn.style.cssText = 'background: none; border: none; font-size: 16px; cursor: pointer; color: #999; padding: 0 6px;';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                const idx = groups.findIndex(g => g.id === group.id);
                if (idx !== -1) {
                    if (group.unread) unreadTotal = Math.max(0, unreadTotal - group.unread);
                    groups.splice(idx, 1);
                    saveGroups();
                    renderGroupList();
                    updateUnreadBadge();
                }
            };
            header.appendChild(left);
            header.appendChild(delBtn);
            div.appendChild(header);
            // 点击组展开详情（二级菜单）
            div.addEventListener('click', (e) => {
                if (e.target === delBtn || delBtn.contains(e.target)) return;
                // 清除未读标记
                group.unread = 0;
                unreadTotal = groups.reduce((sum, g) => sum + (g.unread || 0), 0);
                updateUnreadBadge();
                saveGroups();
                renderGroupList();
                showGroupDetail(group);
            });
            container.appendChild(div);
        });
    }

    // 显示组详情（二级菜单：展示该组所有捕获的消息，支持查看上下文）
    function showGroupDetail(group) {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:20000; display:flex; align-items:center; justify-content:center;';
        const card = document.createElement('div');
        card.style.cssText = 'background:white; width: 700px; max-width: 90vw; max-height: 80vh; border-radius: 20px; overflow: auto; padding: 20px;';
        card.innerHTML = `<h3 style="margin-top:0;">📋 ${group.type === 'user' ? '关注人' : '关键词'}：「${group.key}」 共${group.messages.length}条记录 (累计${group.count}次)</h3><div id="modal-messages-list"></div>`;
        modal.appendChild(card);
        document.body.appendChild(modal);
        const msgContainer = card.querySelector('#modal-messages-list');
        // 按时间倒序显示（最新的在前）
        [...group.messages].reverse().forEach(msg => {
            const block = document.createElement('div');
            block.style.cssText = 'border-bottom:1px solid #eee; margin-bottom:12px; padding-bottom:8px;';
            block.innerHTML = `<div style="font-size:12px; color:#666;">${msg.time} ${msg.sender}</div>`;
            const cloneDiv = document.createElement('div');
            if (msg.rawItemClone) {
                const copy = msg.rawItemClone.cloneNode(true);
                copy.style.transform = 'scale(0.98)';
                cloneDiv.appendChild(copy);
            } else {
                cloneDiv.innerHTML = `<div style="background:#f4f4f4; padding:10px; border-radius:12px;">${msg.contentHtml || '消息内容'}</div>`;
            }
            const ctxBtn = document.createElement('button');
            ctxBtn.textContent = '📖 查看上下文(前后5条)';
            ctxBtn.style.cssText = 'margin-top:8px; background:#ecf0f1; border:none; border-radius:30px; padding:4px 12px; cursor:pointer; font-size:12px;';
            ctxBtn.onclick = (e) => {
                e.stopPropagation();
                showContextModal(msg.originMsgId);
            };
            block.appendChild(cloneDiv);
            block.appendChild(ctxBtn);
            msgContainer.appendChild(block);
        });
        modal.addEventListener('click', (e) => { if(e.target === modal) modal.remove(); });
    }

    // 显示某条消息的上下文（前后5条）
    function showContextModal(targetMsgId) {
        const allItems = document.querySelectorAll('#comments .chats__item');
        let index = -1;
        for (let i = 0; i < allItems.length; i++) {
            if (getMessageId(allItems[i]) === targetMsgId) {
                index = i;
                break;
            }
        }
        if (index === -1) {
            alert('原消息已不在聊天区域，无法获取上下文');
            return;
        }
        const start = Math.max(0, index - 5);
        const end = Math.min(allItems.length - 1, index + 5);
        const contextItems = Array.from(allItems).slice(start, end + 1);
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:30000; display:flex; align-items:center; justify-content:center;';
        const ctxCard = document.createElement('div');
        ctxCard.style.cssText = 'background:#fff; width: 600px; max-height: 70vh; overflow: auto; border-radius: 20px; padding: 20px;';
        ctxCard.innerHTML = '<h3>📜 上下文消息 (前后5条)</h3><div id="ctx-list"></div><button style="margin-top:20px;" id="close-ctx">关闭</button>';
        modal.appendChild(ctxCard);
        document.body.appendChild(modal);
        const listDiv = ctxCard.querySelector('#ctx-list');
        contextItems.forEach(item => {
            const clone = item.cloneNode(true);
            clone.querySelectorAll('.action__item, .fn__layer').forEach(el => el.remove());
            listDiv.appendChild(clone);
        });
        ctxCard.querySelector('#close-ctx').onclick = () => modal.remove();
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
    }

    // 构建主面板（包含头部、列表、底部）
    function buildMainPanel() {
        if (mainPanel) mainPanel.remove();
        const panel = document.createElement('div');
        panel.id = 'msgcloud-panel';
        panel.style.cssText = `
            position: fixed; top: 80px; right: 20px; width: 420px; max-height: 70vh;
            background: white; border-radius: 16px; box-shadow: 0 12px 28px rgba(0,0,0,0.2);
            z-index: 10001; display: flex; flex-direction: column; overflow: hidden;
            font-family: system-ui, -apple-system, sans-serif;
        `;
        panel.innerHTML = `
            <div id="msgcloud-header" style="background: #2c3e50; color: white; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; cursor: move;">
                <span>☁️ 消息云 · 监听面板</span>
                <div style="display: flex; gap: 8px;">
                    <button id="msgcloud-pause-btn" style="background: none; border: none; color: white; font-size: 16px; cursor: pointer;" title="暂停/恢复">⏸️</button>
                    <button id="msgcloud-config-btn" style="background: none; border: none; color: white; font-size: 16px; cursor: pointer;" title="设置">⚙️</button>
                    <button id="msgcloud-clear-all-btn" style="background: none; border: none; color: white; font-size: 16px; cursor: pointer;" title="一键清空">🗑️</button>
                    <button id="msgcloud-close-btn" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer;">✕</button>
                </div>
            </div>
            <div id="msgcloud-list" style="flex:1; overflow-y: auto; padding: 10px; background: #f9f9f9;"></div>
            <div style="padding: 6px 12px; background: #ecf0f1; font-size: 12px; display: flex; justify-content: space-between;">
                <span id="msgcloud-status">监听中</span>
                <span>共 ${groups.length} 组</span>
            </div>
        `;
        document.body.appendChild(panel);
        mainPanel = panel;

        // 使头部可拖拽
        const header = panel.querySelector('div:first-child');
        makePanelDraggable(panel, header);
        // 绑定按钮事件
        panel.querySelector('#msgcloud-close-btn').addEventListener('click', () => toggleMainPanel());
        panel.querySelector('#msgcloud-config-btn').addEventListener('click', () => showConfigDialog());
        panel.querySelector('#msgcloud-clear-all-btn').addEventListener('click', () => {
            groups = [];
            processedMsgIds.clear();
            unreadTotal = 0;
            saveGroups();
            renderGroupList();
            updateUnreadBadge();
            //console.log('[消息云] 已清空所有记录');
        });
        const pauseBtn = panel.querySelector('#msgcloud-pause-btn');
        pauseBtn.addEventListener('click', () => {
            isPaused = !isPaused;
            pauseBtn.textContent = isPaused ? '▶️' : '⏸️';
            document.getElementById('msgcloud-status').innerText = isPaused ? '已暂停' : '监听中';
            //console.log(`[消息云] 监听${isPaused ? '已暂停' : '已恢复'}`);
            CONFIG.enableMonitor = !isPaused;
            saveConfig();
        });
        renderGroupList();
        return panel;
    }

    // 展开/收起主面板
    function toggleMainPanel() {
        if (!mainPanel) {
            buildMainPanel();
            updatePanelStyles();
            isPanelOpen = true;
        } else {
            mainPanel.remove();
            mainPanel = null;
            isPanelOpen = false;
            // 关闭面板时清除所有未读标记
            if (unreadTotal > 0) {
                groups.forEach(g => g.unread = 0);
                unreadTotal = 0;
                saveGroups();
                updateUnreadBadge();
            }
            stopBlink();
        }
    }

    // 显示配置对话框
    function showConfigDialog() {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:20000; display:flex; align-items:center; justify-content:center;';
        const box = document.createElement('div');
        box.style.cssText = 'background:white; width: 420px; border-radius: 16px; padding:20px;';
        box.innerHTML = `
            <h3>⚙️ 消息云配置</h3>
            <label>监听的关键词 (逗号分隔)</label>
            <input id="cfg-keywords" type="text" style="width:100%; margin-bottom:12px;" value="${CONFIG.keywords.join(',')}">
            <label>监听指定用户 (精确匹配,逗号分隔)</label>
            <input id="cfg-users" type="text" style="width:100%; margin-bottom:12px;" value="${CONFIG.users.join(',')}">
            <label><input type="checkbox" id="cfg-notify" ${CONFIG.enableNotification ? 'checked' : ''}> 浏览器通知</label><br>
            <label><input type="checkbox" id="cfg-monitor" ${CONFIG.enableMonitor ? 'checked' : ''}> 启用监听</label><br>
            <label>合并窗口(分钟): <input id="cfg-merge" type="number" min="1" step="1" value="${CONFIG.mergeMinutes}" style="width:70px;"></label>
            <div style="margin-top:20px; text-align:right;">
                <button id="cfg-save">保存</button> <button id="cfg-cancel">取消</button>
            </div>
        `;
        modal.appendChild(box);
        document.body.appendChild(modal);
        box.querySelector('#cfg-save').onclick = () => {
            CONFIG.keywords = box.querySelector('#cfg-keywords').value.split(',').map(s => s.trim()).filter(s => s);
            CONFIG.users = box.querySelector('#cfg-users').value.split(',').map(s => s.trim()).filter(s => s);
            CONFIG.enableNotification = box.querySelector('#cfg-notify').checked;
            CONFIG.enableMonitor = box.querySelector('#cfg-monitor').checked;
            CONFIG.mergeMinutes = parseInt(box.querySelector('#cfg-merge').value) || 10;
            saveConfig();
            if (!CONFIG.enableMonitor) isPaused = true;
            else isPaused = false;
            if (document.getElementById('msgcloud-status')) {
                document.getElementById('msgcloud-pause-btn').textContent = isPaused ? '▶️' : '⏸️';
                document.getElementById('msgcloud-status').innerText = CONFIG.enableMonitor ? '监听中' : '已禁用';
            }
            modal.remove();
            //console.log('[消息云] 配置已更新');
        };
        box.querySelector('#cfg-cancel').onclick = () => modal.remove();
    }

    // 更新UI（重绘列表和角标）
    function updateUI() {
        if (mainPanel) renderGroupList();
        updateUnreadBadge();
    }

    // 初始化浏览器通知权限
    function initNotification() {
        if (typeof GM_notification !== 'undefined') {
            notificationPerm = true;
        } else if (Notification.permission !== 'granted') {
            Notification.requestPermission().then(perm => { notificationPerm = (perm === 'granted'); });
        } else {
            notificationPerm = true;
        }
    }

    // 根据配置更新样式
    function updatePanelStyles() {
        if (document.getElementById('msgcloud-pause-btn')) {
            document.getElementById('msgcloud-pause-btn').textContent = isPaused ? '▶️' : '⏸️';
        }
        if (document.getElementById('msgcloud-status')) {
            document.getElementById('msgcloud-status').innerText = isPaused ? '已暂停' : '监听中';
        }
    }

    // 入口：等待聊天室容器出现，启动监听和全量扫描
    function init() {
        loadConfig();
        loadGroups();
        initNotification();
        floatingIcon = createFloatingIcon();

        // 等待聊天室 DOM 加载完成
        const waitChat = setInterval(() => {
            if (document.getElementById('comments')) {
                clearInterval(waitChat);
                startChatroomMonitoring();
                scanAllMessages();
                updateUnreadBadge();
                //console.log('[消息云] 初始化完成');
            }
        }, 500);

        // 根据配置初始化样式
        updatePanelStyles();

        // 页面卸载时断开观察器
        window.addEventListener('beforeunload', () => {
            if (chatObserver) chatObserver.disconnect();
        });
    }

    // 启动脚本
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
