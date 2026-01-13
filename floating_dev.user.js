// ==UserScript==
// @name         鱼排红包板块(T老师代写版)
// @namespace    https://fishpi.cn
// @license      MIT
// @version      1.6
// @description  红包浮层面板可拖拽+折叠悬浮ICON也可拖拽+无确认删除红包+未抢红包角标+一键快速定位红包+T老师重构
// @author       muli
// @match        https://fishpi.cn/cr
// @icon         https://file.fishpi.cn/2025/11/blob-4d0e46ad.png?imageView2/1/w/48/h/48/interlace/0/q/100
// @grant        none
// @run-at       document-end
// ==/UserScript==
(function() {
    'use strict';

    // 配置项 - 可按需修改
    const CONFIG = {
        maxDisplayCount: 20,          // 最多显示红包数量
        visibleCount: 5,              // 默认可见红包数量
        refreshInterval: 10000,       // 全量扫描间隔
        syncInterval: 1000,           // 同步状态间隔
        monitorNewMessages: true,     // 监听新消息
        newMessageThreshold: 5,       // 每次扫描的新消息数量
        autoDelRedPackets: false,     // 是否自动删除已抢光的红包
        autoOpenRedPackets: false,    // 是否自动打开红包
        floatPanel: {                 // 浮层面板配置
            width: 380,               // 面板宽度
            top: 100,                 // 默认顶部距离
            right: 20,                // 默认右侧距离
            zIndex: 99999,            // 层级(调高防止被遮挡)
            dragHandleHeight: 36      // 拖拽区域高度
        },
        floatIcon: {                  // 折叠后悬浮ICON配置
            size: 42,                 // icon大小
            right: 20,                // icon右侧距离
            bottom: 20,               // icon底部距离
            zIndex: 999999            // icon层级最高
        }
    };

    // 全局变量
    let redPackets = new Map();        // 红包ID -> 红包数据
    let displayOrder = [];             // 显示顺序（红包ID数组）
    let currentDisplayed = new Set();  // 当前显示的红包ID
    let observers = new Map();         // 观察器映射
    let isInitialized = false;
    let chatObserver = null;           // 聊天室观察器
    let lastProcessedTime = 0;         // 上次处理时间
    let processedMessageIds = new Set(); // 已处理的消息ID
    let panelCollapsed = false;        // 面板是否折叠
    let unclaimedPacketIds = [];       // 未抢红包ID列表，用于快速定位
    // 拖拽信息结构
    const dragInfo = {
        panel: { isDragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0, transformX: 0, transformY: 0, moved: false },
        icon: { isDragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0, transformX: 0, transformY: 0, moved: false }
    };

    // 主初始化函数
    function init() {
        if (isInitialized) return;

        // 创建红包浮层面板和悬浮ICON
        const panel = createRedPacketFloatPanel();
        document.body.appendChild(panel);
        createFloatIcon();

        // 初始化拖拽事件和窗口大小变化处理
        initDragEvent();
        initWindowResizeEvent();

        // 初始全量扫描
        scanRedPackets();
        // 开始监听聊天室变化
        startChatroomMonitoring();
        // 开始定时任务
        startTimers();

        isInitialized = true;
    }

    // 创建可拖拽的红包浮层面板
    function createRedPacketFloatPanel() {
        const panel = document.createElement('div');
        panel.className = 'red-packet-float-panel';
        panel.style.cssText = `
            position: fixed;
            top: ${CONFIG.floatPanel.top}px;
            right: ${CONFIG.floatPanel.right}px;
            width: ${CONFIG.floatPanel.width}px;
            z-index: ${CONFIG.floatPanel.zIndex};
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 4px 25px rgba(0,0,0,0.2);
            overflow: hidden;
            transition: all 0.3s ease;
            cursor: default;
        `;

        // 拖拽头部
        const dragHeader = document.createElement('div');
        dragHeader.className = 'red-packet-drag-header';
        dragHeader.style.cssText = `
            background: linear-gradient(135deg, #ff6b6b, #ff8e53);
            color: white;
            height: ${CONFIG.floatPanel.dragHandleHeight}px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 15px;
            cursor: move;
            user-select: none;
        `;
        dragHeader.title = "按住可拖拽移动面板";

        const title = document.createElement('div');
        title.style.cssText = 'font-size: 16px; font-weight: bold;';
        title.innerHTML = '  🧧 聊天室红包';

        const controls = document.createElement('div');
        controls.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const countBadge = document.createElement('span');
        countBadge.className = 'red-packet-count';
        countBadge.style.cssText = `
            background: rgba(255,255,255,0.2);
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            min-width: 18px;
            text-align: center;
        `;
        countBadge.textContent = '0';

        // 折叠按钮
        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'collapse-btn';
        collapseBtn.style.cssText = `
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            width: 24px;
            height: 24px;
            borderRadius: 50%;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
        `;
        collapseBtn.innerHTML = '−';
        collapseBtn.title = '折叠面板';

        // 展开/收起列表按钮
        const expandBtn = document.createElement('button');
        expandBtn.className = 'expand-btn';
        expandBtn.style.cssText = `
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
        `;
        expandBtn.innerHTML = '▼';
        expandBtn.title = '展开/收起红包列表';

        controls.appendChild(countBadge);
        controls.appendChild(expandBtn);
        controls.appendChild(collapseBtn);
        dragHeader.appendChild(title);
        dragHeader.appendChild(controls);

        // 面板主体
        const body = document.createElement('div');
        body.className = 'module-panel red-packet-body';
        body.style.cssText = `
            max-height: ${CONFIG.visibleCount * 120}px;
            overflow-y: auto;
            transition: max-height 0.3s ease;
            padding: 10px;
            max-height: 400px;
        `;

        // 红包列表
        const list = document.createElement('div');
        list.className = 'red-packet-list';
        list.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';
        body.appendChild(list);

        // 展开/收起列表逻辑
        expandBtn.addEventListener('click', () => {
            const isExpanded = body.style.maxHeight === 'none';
            body.style.maxHeight = isExpanded ? `${CONFIG.visibleCount * 120}px` : 'none';
            expandBtn.innerHTML = isExpanded ? '▼' : '▲';
        });

        // 折叠面板逻辑
        collapseBtn.addEventListener('click', () => {
            panelCollapsed = true;
            panel.style.display = 'none';
            document.querySelector('.red-packet-float-icon').style.display = 'flex';
            updateUnclaimedCount();
            updateFloatIconBadge();
        });

        panel.appendChild(dragHeader);
        panel.appendChild(body);
        return panel;
    }

    // 创建折叠后的悬浮小红包ICON
    function createFloatIcon() {
        const floatIcon = document.createElement('div');
        floatIcon.className = 'red-packet-float-icon';
        floatIcon.style.cssText = `
            position: fixed;
            right: ${CONFIG.floatIcon.right}px;
            bottom: ${CONFIG.floatIcon.bottom}px;
            width: ${CONFIG.floatIcon.size}px;
            height: ${CONFIG.floatIcon.size}px;
            background: linear-gradient(135deg, #ff6b6b, #ff8e53);
            border-radius: 50%;
            color: white;
            display: none;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            box-shadow: 0 3px 15px rgba(255,107,107,0.6);
            cursor: move;
            z-index: ${CONFIG.floatIcon.zIndex};
            user-select: none;
            transition: all 0.2s ease;
        `;
        floatIcon.innerHTML = '🧧';
        floatIcon.title = '按住拖拽移动图标 | 点击展开面板+快速定位未抢红包';

        // 数字角标
        const badge = document.createElement('span');
        badge.className = 'float-icon-badge';
        badge.style.cssText = `
            position: absolute;
            top: -5px;
            right: -5px;
            background: #ff2d55;
            color: white;
            font-size: 12px;
            font-weight: bold;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        `;
        badge.textContent = '0';
        floatIcon.appendChild(badge);

        // ICON点击事件：展开面板+定位第一个未抢红包
        floatIcon.addEventListener('click', (e) => {
        if (dragInfo.icon.isDragging || dragInfo.icon.moved) {
            dragInfo.icon.moved = false;
            return;
        }
        panelCollapsed = false;
        floatIcon.style.display = 'none';
        document.querySelector('.red-packet-float-panel').style.display = 'block';
        updateRedPacketDisplay();
    
        // 快速定位
        if (unclaimedPacketIds.length > 0) {
            highlightOriginalRedPacket(unclaimedPacketIds[0]);
        }
        });

        document.body.appendChild(floatIcon);
    }

    // 通用拖拽事件初始化
    function initDragEvent() {
        // 面板拖拽
        const panel = document.querySelector('.red-packet-float-panel');
        const dragHeader = document.querySelector('.red-packet-drag-header');
        
        dragHeader.addEventListener('mousedown', (e) => {
            e.preventDefault();
            dragInfo.panel.isDragging = true;
            dragInfo.panel.startX = e.clientX;
            dragInfo.panel.startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            dragInfo.panel.offsetX = rect.left;
            dragInfo.panel.offsetY = rect.top;
            dragHeader.style.opacity = '0.8';
            panel.style.boxShadow = '0 6px 30px rgba(0,0,0,0.25)';
            panel.style.transition = 'none';
        });

        // 图标拖拽
        const icon = document.querySelector('.red-packet-float-icon');
        
        icon.addEventListener('mousedown', (e) => {
            e.preventDefault();
            dragInfo.icon.isDragging = true;
            dragInfo.icon.startX = e.clientX;
            dragInfo.icon.startY = e.clientY;
            const rect = icon.getBoundingClientRect();
            dragInfo.icon.offsetX = rect.left;
            dragInfo.icon.offsetY = rect.top;
            icon.style.opacity = '0.9';
            icon.style.transform = 'scale(1.1)';
            icon.style.boxShadow = '0 6px 20px rgba(255,107,107,0.8)';
            icon.style.transition = 'none';
        });

        // 鼠标移动事件
        let isDraggingFrameRequested = false;
        document.addEventListener('mousemove', (e) => {
            if (!dragInfo.panel.isDragging && !dragInfo.icon.isDragging) return;
            
            if (!isDraggingFrameRequested) {
                isDraggingFrameRequested = true;
                requestAnimationFrame(() => {
                    if (dragInfo.panel.isDragging) {
                        const x = dragInfo.panel.offsetX + (e.clientX - dragInfo.panel.startX);
                        const y = dragInfo.panel.offsetY + (e.clientY - dragInfo.panel.startY);
                        panel.style.transform = `translate(${x}px, ${y}px)`;
                        panel.style.left = '0';
                        panel.style.top = '0';
                        panel.style.right = 'auto';
                        panel.style.bottom = 'auto';
                        dragInfo.panel.transformX = x;
                        dragInfo.panel.transformY = y;
                    }
                });
            }
            // 处理图标拖拽
            if (dragInfo.icon.isDragging) {
                const x = dragInfo.icon.offsetX + (e.clientX - dragInfo.icon.startX);
                const y = dragInfo.icon.offsetY + (e.clientY - dragInfo.icon.startY);
                icon.style.transform = `translate(${x}px, ${y}px)`;
                icon.style.left = '0';
                icon.style.top = '0';
                icon.style.right = 'auto';
                icon.style.bottom = 'auto';
                dragInfo.icon.transformX = x;
                dragInfo.icon.transformY = y;
                // 检测是否有实际移动（超过5像素）
                if (Math.abs(e.clientX - dragInfo.icon.startX) > 5 || Math.abs(e.clientY - dragInfo.icon.startY) > 5) {
                    dragInfo.icon.moved = true;
                }
            }
            
            isDraggingFrameRequested = false;
        });

        // 鼠标释放事件
        document.addEventListener('mouseup', () => {
            // 恢复面板样式
            if (dragInfo.panel.isDragging) {
                dragInfo.panel.isDragging = false;
                dragHeader.style.opacity = '1';
                panel.style.boxShadow = '0 4px 25px rgba(0,0,0,0.2)';
                panel.style.transition = '';
                panel.style.left = `${dragInfo.panel.transformX}px`;
                panel.style.top = `${dragInfo.panel.transformY}px`;
                panel.style.transform = '';
            }
        
            if (dragInfo.icon.isDragging) {
                dragInfo.icon.isDragging = false;
                icon.style.opacity = '1';
                icon.style.transform = 'scale(1)';
                icon.style.boxShadow = '0 3px 15px rgba(255,107,107,0.6)';
                icon.style.transition = '';
                icon.style.left = `${dragInfo.icon.transformX}px`;
                icon.style.top = `${dragInfo.icon.transformY}px`;
                icon.style.transform = '';
            }
        });
    }

    // 窗口大小变化处理
    function initWindowResizeEvent() {
        window.addEventListener('resize', () => {
            const panel = document.querySelector('.red-packet-float-panel');
            const icon = document.querySelector('.red-packet-float-icon');
            
            // 调整面板位置
            if (panel && panel.style.display !== 'none') {
                const rect = panel.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                
                let x = parseFloat(panel.style.left) || CONFIG.floatPanel.top;
                let y = parseFloat(panel.style.top) || CONFIG.floatPanel.right;
                
                // 确保面板在可视区域内
                if (rect.right > viewportWidth) x = viewportWidth - rect.width;
                if (rect.left < 0) x = 0;
                if (rect.bottom > viewportHeight) y = viewportHeight - rect.height;
                if (rect.top < 0) y = 0;
                
                panel.style.left = `${x}px`;
                panel.style.top = `${y}px`;
            }
            
            // 调整图标位置
            if (icon && icon.style.display !== 'none') {
                const rect = icon.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                
                let x = parseFloat(icon.style.left) || CONFIG.floatIcon.right;
                let y = parseFloat(icon.style.top) || CONFIG.floatIcon.bottom;
                
                // 确保图标在可视区域内
                if (rect.right > viewportWidth) x = viewportWidth - rect.width;
                if (rect.left < 0) x = 0;
                if (rect.bottom > viewportHeight) y = viewportHeight - rect.height;
                if (rect.top < 0) y = 0;
                
                icon.style.left = `${x}px`;
                icon.style.top = `${y}px`;
            }
        });
    }

    // 更新未抢红包数量
    function updateUnclaimedCount() {
        unclaimedPacketIds = [];
        redPackets.forEach((packet, id) => {
            if (packet.status === 'available') unclaimedPacketIds.push(id);
        });
        return unclaimedPacketIds.length;
    }

    // 更新悬浮ICON角标数字
    function updateFloatIconBadge() {
        const badge = document.querySelector('.float-icon-badge');
        const count = updateUnclaimedCount();
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }

    // 扫描红包（全量）
    function scanRedPackets() {
        const chatItems = document.querySelectorAll('#comments .chats__item');
        const newPackets = [];
        chatItems.forEach(item => processChatItem(item, newPackets));

        if (newPackets.length > 0) handleNewPackets(newPackets);
        updateDisplayOrder();
        updateRedPacketDisplay();
        updateFloatIconBadge();
    }

    // 处理单个聊天项
    function processChatItem(item, newPackets) {
        const redPacket = item.querySelector('.hongbao__item');
        if (!redPacket) return;

        const packetId = getRedPacketId(item, redPacket);
        if (!packetId || processedMessageIds.has(packetId)) return;

        if (!redPackets.has(packetId)) {
            const metadata = getMessageMetadata(item);
            const status = getRedPacketStatus(redPacket);
            
            if (CONFIG.autoDelRedPackets && status == 'empty') return;

            const packetData = {
                id: packetId,
                element: item.cloneNode(true),
                originalElement: item,
                originalRedPacket: redPacket,
                time: metadata.time,
                user: metadata.user,
                status: status,
                lastUpdated: Date.now(),
                observer: null,
                isNew: true
            };

            redPackets.set(packetId, packetData);
            processedMessageIds.add(packetId);
            newPackets.push(packetData);
            setupRedPacketObserver(packetData);
        }
    }

    // 获取消息元数据（时间和用户）
    function getMessageMetadata(chatItem) {
        const timeElement = chatItem.querySelector('.date-bar');
        const userElement = chatItem.querySelector('#userName .ft-gray');
        const avatarElement = chatItem.querySelector('.avatar');
        
        return {
            time: timeElement ? timeElement.textContent.trim() : '',
            user: {
                name: userElement ? userElement.textContent.trim() : '匿名',
                avatar: avatarElement ? avatarElement.style.backgroundImage : ''
            }
        };
    }

    // 获取红包ID
    function getRedPacketId(chatItem, redPacket) {
        const chatId = chatItem.id;
        if (chatId && chatId.startsWith('chatroom')) return chatId.replace('chatroom', '');
        
        const onclick = redPacket.getAttribute('onclick');
        if (onclick) {
            const match = onclick.match(/unpackRedPacket\('([^']+)'\)/);
            if (match) return match[1];
        }
        
        const metadata = getMessageMetadata(chatItem);
        return `${metadata.user.name}_${metadata.time}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // 获取红包状态
    function getRedPacketStatus(redPacket) {
        const desc = redPacket.querySelector('.redPacketDesc');
        if (!desc) return 'unknown';
        
        const text = desc.textContent.toLowerCase();
        if (text.includes('已经') || text.includes('抢光') || text.includes('抢完')) return 'empty';
        if (text.includes('已领取')) return 'opened';
        if (text.includes('未领取')) return 'available';
        if (text.includes('过期')) return 'expired';
        
        return 'available';
    }

    // 自动打开红包
    function autoOpenRedPacket(packetData) {
        if (!packetData || packetData.status !== 'available') return;
        
        if (!document.contains(packetData.originalRedPacket)) return;
        
        try {
            const onclick = packetData.originalRedPacket.getAttribute('onclick');
            if (onclick) {
                const match = onclick.match(/unpackRedPacket\('([^']+)'\)/);
                if (match && typeof window.unpackRedPacket === 'function') {
                    window.unpackRedPacket(match[1]);
                } else {
                    packetData.originalRedPacket.click();
                }
            } else {
                const clickable = packetData.originalRedPacket.querySelector('button, a, .hongbao__item');
                if (clickable) clickable.click();
            }
        } catch (error) {
            console.error('自动点击红包失败:', error);
        }
    }

    // 处理新红包
    function handleNewPackets(newPackets) {
        newPackets.forEach(packetData => {
            packetData.isNew = true;
            setTimeout(() => {
                packetData.isNew = false;
                updateRedPacketItem(packetData.id);
            }, 5000);
            
            // 自动打开红包
            if (CONFIG.autoOpenRedPackets && packetData.status === 'available') {
                setTimeout(() => autoOpenRedPacket(packetData), 10);
            }
        });
        
        if (panelCollapsed) updateFloatIconBadge();
    }

    // 开始监听聊天室变化
    function startChatroomMonitoring() {
        const chatContainer = document.getElementById('comments');
        if (!chatContainer) return setTimeout(startChatroomMonitoring, 2000);
        
        chatObserver = new MutationObserver((mutations) => {
            const now = Date.now();
            if (now - lastProcessedTime < 500) return;
            lastProcessedTime = now;

            let hasNewMessages = false;
            mutations.forEach(m => m.addedNodes.length > 0 && (hasNewMessages = true));
            if (hasNewMessages) setTimeout(scanLatestMessages, 200);
        });

        chatObserver.observe(chatContainer, { childList: true, subtree: true });
    }

    // 扫描最新消息
    function scanLatestMessages() {
        if (!CONFIG.monitorNewMessages) return;
        const chatItems = document.querySelectorAll('#comments .chats__item');
        const newPackets = [];
        Array.from(chatItems).slice(0, CONFIG.newMessageThreshold).forEach(item => processChatItem(item, newPackets));

        if (newPackets.length > 0) {
            handleNewPackets(newPackets);
            updateDisplayOrder();
            updateRedPacketDisplay();
        }
    }

    // 红包删除
    function delRedPacket(id) {
        const element = document.querySelector(`.red-packet-list .red-packet-item[data-packet-id="${id}"]`);
        if (element) {
            element.style.opacity = '0';
            element.style.transform = 'translateX(30px)';
            setTimeout(() => element.remove(), 200);

            const packetData = redPackets.get(id);
            if (packetData && packetData.observer) packetData.observer.disconnect();
            
            redPackets.delete(id);
            displayOrder = displayOrder.filter(item => item !== id);
            currentDisplayed.delete(id);
            processedMessageIds.delete(id);

            updateRedPacketDisplay();
            updateFloatIconBadge();
        }
    }

    // 设置红包观察器
    function setupRedPacketObserver(packetData) {
        if (packetData.status === 'empty') return;
        if (packetData.observer) packetData.observer.disconnect();

        const observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    const newStatus = getRedPacketStatus(packetData.originalRedPacket);
                    if (newStatus !== packetData.status) {
                        packetData.status = newStatus;
                        shouldUpdate = true;
                        if (newStatus === 'empty') {
                            observer.disconnect();
                            packetData.observer = null;
                            if (CONFIG.autoDelRedPackets) delRedPacket(packetData.id);
                        }
                    }
                } else if (mutation.type === 'attributes') {
                    shouldUpdate = true;
                }
            });
            
            if (shouldUpdate) {
                updateRedPacketItem(packetData.id);
                packetData.lastUpdated = Date.now();
                updateFloatIconBadge();
            }
        });

        observer.observe(packetData.originalRedPacket, {
            childList: true, subtree: true, characterData: true, 
            attributes: true, attributeFilter: ['class', 'style', 'onclick']
        });
        
        packetData.observer = observer;
        observers.set(packetData.id, observer);
    }

    // 更新显示顺序
    function updateDisplayOrder() {
        displayOrder = Array.from(redPackets.keys()).sort((a, b) => {
            const timeA = parseTimeString(redPackets.get(a).time);
            const timeB = parseTimeString(redPackets.get(b).time);
            return timeB - timeA;
        });
    }

    // 解析时间字符串
    function parseTimeString(timeStr) {
        if (!timeStr) return new Date(0);
        const match = timeStr.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
        return match ? new Date(match[0].replace(/-/g, '/')) : new Date(0);
    }

    // 更新红包显示
    function updateRedPacketDisplay() {
        const listContainer = document.querySelector('.red-packet-list');
        const countBadge = document.querySelector('.red-packet-count');
        if (!listContainer || !countBadge) return;

        countBadge.textContent = displayOrder.length;
        if (displayOrder.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; color: #999; padding: 30px; font-size: 14px;">
                    🎈 暂无红包消息<br><small>聊天室红包会实时同步到这里</small>
                </div>
            `;
            return;
        }

        const displayIds = displayOrder.slice(0, CONFIG.maxDisplayCount);
        currentDisplayed = new Set(displayIds);
        listContainer.innerHTML = '';
        displayIds.forEach(packetId => {
            const packetData = redPackets.get(packetId);
            if (packetData) listContainer.appendChild(createRedPacketListItem(packetData));
        });
    }

    // 创建红包列表项
    function createRedPacketListItem(packetData) {
        const container = document.createElement('div');
        container.className = 'red-packet-item';
        container.dataset.packetId = packetData.id;
        container.style.cssText = packetData.isNew ? `
            border: 2px solid #ff4757; border-radius: 6px; padding: 10px; background: #fff;
            transition: all 0.2s ease; position: relative; overflow: hidden; margin-bottom: 10px;
            animation: newRedPacket 0.5s ease-out;
        ` : `
            border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px; background: #fff;
            transition: all 0.2s ease; position: relative; overflow: hidden; margin-bottom: 10px;
        `;

        // 状态角标
        const statusIndicator = document.createElement('div');
        statusIndicator.style.cssText = `position:absolute;top:0;right:0;width:30px;height:30px;clip-path:polygon(100% 0,100% 100%,0 0);z-index:1;`;
        const statusColors = {available:'#4CAF50',opened:'#2196F3',empty:'#FF9800',expired:'#9E9E9E',unknown:'#607D8B'};
        statusIndicator.style.background = statusColors[packetData.status];
        container.appendChild(statusIndicator);

        // 删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'red-packet-delete-btn';
        deleteBtn.style.cssText = `
            position:absolute;top:5px;left:5px;width:22px;height:22px;background:#ff4757;color:white;border:none;border-radius:50%;
            cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;z-index:3;opacity:0.8;transition:all 0.2s;
        `;
        deleteBtn.innerHTML = '×';
        deleteBtn.title = '删除此红包';
        deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); delRedPacket(packetData.id); });
        container.appendChild(deleteBtn);

        // 新红包标记
        if (packetData.isNew) {
            const newBadge = document.createElement('div');
            newBadge.style.cssText = `position:absolute;top:-6px;right:-6px;background:#ff4757;color:white;font-size:10px;padding:2px 6px;border-radius:10px;z-index:2;font-weight:bold;`;
            newBadge.textContent = 'NEW';
            container.appendChild(newBadge);
        }

        // 鼠标悬浮效果
        container.addEventListener('mouseenter', () => {
            deleteBtn.style.opacity = 1;
            container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
            container.style.transform = 'translateY(-2px)';
        });
        container.addEventListener('mouseleave', () => {
            deleteBtn.style.opacity = 0.8;
            container.style.boxShadow = '';
            container.style.transform = '';
        });

        // 用户信息
        const userRow = document.createElement('div');
        userRow.style.cssText = `display:flex;align-items:center;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #f0f0f0;padding-left:28px;`;
        const avatar = document.createElement('div');
        avatar.style.cssText = `width:24px;height:24px;border-radius:50%;margin-right:8px;background-size:cover;background-position:center;`;
        avatar.style.backgroundImage = packetData.user.avatar || 'none';
        const userName = document.createElement('span');
        userName.style.cssText = `font-weight:bold;color:#333;font-size:14px;flex:1;`;
        userName.textContent = packetData.user.name;
        const timeSpan = document.createElement('span');
        timeSpan.style.cssText = `font-size:12px;color:#888;`;
        timeSpan.textContent = packetData.time.split(' ')[0];
        userRow.appendChild(avatar);
        userRow.appendChild(userName);
        userRow.appendChild(timeSpan);

        // 红包内容
        const redPacketContent = packetData.element.querySelector('.chats__content').cloneNode(true);
        redPacketContent.style.cssText = `margin:0;padding:0;transform:scale(0.85);transform-origin:top left;margin-left:28px;`;
        const actionButtons = redPacketContent.querySelectorAll('.action__item, .fn__layer, details');
        actionButtons.forEach(btn => btn.remove());

        // 点击定位原消息
        container.addEventListener('click', (e) => {
            if (!e.target.closest('.hongbao__item') && !e.target.closest('.red-packet-delete-btn')) {
                highlightOriginalRedPacket(packetData.id);
            }
        });

        container.appendChild(userRow);
        container.appendChild(redPacketContent);
        return container;
    }

    // 更新单个红包项
    function updateRedPacketItem(packetId) {
        const packetData = redPackets.get(packetId);
        if (!packetData || !currentDisplayed.has(packetId)) return;
        
        packetData.element = packetData.originalElement.cloneNode(true);
        packetData.status = getRedPacketStatus(packetData.originalRedPacket);

        const listContainer = document.querySelector('.red-packet-list');
        const existingItem = listContainer.querySelector(`[data-packet-id="${packetId}"]`);
        if (existingItem) {
            const index = Array.from(listContainer.children).findIndex(item => item.dataset.packetId === packetId);
            existingItem.remove();
            const newItem = createRedPacketListItem(packetData);
            listContainer.insertBefore(newItem, listContainer.children[index] || null);
        }
    }

    // 高亮并定位原聊天室红包
    function highlightOriginalRedPacket(packetId) {
        const packetData = redPackets.get(packetId);
        if (!packetData || !packetData.originalElement) return;
        
        document.querySelectorAll('.red-packet-highlight').forEach(el => el.classList.remove('red-packet-highlight'));
        packetData.originalElement.classList.add('red-packet-highlight');
        packetData.originalElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => packetData.originalElement.classList.remove('red-packet-highlight'), 3000);
    }

    // 定时任务
    function startTimers() {
        setInterval(scanRedPackets, CONFIG.refreshInterval);
        setInterval(syncRedPacketStates, CONFIG.syncInterval);
    }

    // 同步红包状态
    function syncRedPacketStates() {
        redPackets.forEach((packetData, packetId) => {
            if (!packetData.originalElement || !packetData.originalElement.parentNode) {
                cleanupRedPacket(packetId);
                return;
            }
            
            const newStatus = getRedPacketStatus(packetData.originalRedPacket);
            if (newStatus !== packetData.status) {
                updateRedPacketItem(packetId);
                if (newStatus === 'empty' && packetData.observer) packetData.observer.disconnect();
            }
        });
        
        updateFloatIconBadge();
    }

    // 清理红包
    function cleanupRedPacket(packetId) {
        const packetData = redPackets.get(packetId);
        if (packetData && packetData.observer) packetData.observer.disconnect();
        
        redPackets.delete(packetId);
        observers.delete(packetId);
        currentDisplayed.delete(packetId);
        processedMessageIds.delete(packetId);
        
        const item = document.querySelector(`[data-packet-id="${packetId}"]`);
        if (item) item.remove();
        
        updateRedPacketDisplay();
    }

    // 添加全局样式
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .red-packet-body {scrollbar-width: thin;scrollbar-color: #ff6b6b #f0f0f0;}
            .red-packet-body::-webkit-scrollbar {width: 6px;}
            .red-packet-body::-webkit-scrollbar-track {background: #f0f0f0;border-radius:3px;}
            .red-packet-body::-webkit-scrollbar-thumb {background: #ff6b6b;border-radius:3px;}
            .red-packet-body::-webkit-scrollbar-thumb:hover {background: #ff4757;}
            
            @keyframes newRedPacket {0%{transform: translateY(-20px);opacity:0;}100%{transform: translateY(0);opacity:1;}}
            @keyframes highlightPulse {0%,100%{box-shadow:0 0 0 0 rgba(255,107,107,0.4);}50%{box-shadow:0 0 0 10px rgba(255,107,107,0);}}
            
            .red-packet-highlight {animation: highlightPulse 1s ease-in-out 3;border:2px solid #ff6b6b !important;}
            
            .red-packet-delete-btn:hover {background: #ff3040;transform: scale(1.1);}
            .red-packet-float-icon:hover {transform: scale(1.1);box-shadow:0 5px 20px rgba(255,107,107,0.8);}
            
            @media (max-width:768px) {
                .red-packet-float-panel {width:90%!important;right:5%!important;top:20px!important;}
                .red-packet-body {max-height:300px!important;}
            }
        `;
        document.head.appendChild(style);
    }

    // 页面加载初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { addStyles(); setTimeout(init, 1500); });
    } else {
        addStyles(); setTimeout(init, 1500);
    }
})();