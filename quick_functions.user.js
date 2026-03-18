// ==UserScript==
// @name         鱼派快捷功能
// @version      2.6.2
// @description  快捷操作，快捷引用、消息、表情包分组、小尾巴
// @author       Kirito + muli + 18 + trd
// @match        https://fishpi.cn/cr
// @icon         https://file.fishpi.cn/2025/11/blob-4d0e46ad.png?imageView2/1/w/48/h/48/interlace/0/q/100
// @license      MIT
// @grant        GM_addStyle
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @downloadURL  https://raw.githubusercontent.com/mu-xiao-li/yupai-extend-js/main/quick_functions.user.js
// @updateURL    https://raw.githubusercontent.com/mu-xiao-li/yupai-extend-js/main/quick_functions.user.js
// ==/UserScript==

// 更新
// 2025-12-1 muli 优化按钮布局，三个自动换行，并添加回到顶部按钮
// 2025-12-2 muli 按钮支持配置子级按钮（目前只支持到第二层），Alt + Enter才触发发送按钮，保留Enter换行的行为，添加muliRefresh配置，可控制触发按钮后是否刷新页面
// 2025-12-2 muli 修复：1.修复父按钮冷却文本显示问题 2.父按钮冷却时可以展开子按钮 3.提高子按钮浮窗权限级别
// 2025-12-3 muli 添加：1.拖拽功能 2.位置记忆功能 3.双击复位功能
// 2025-12-3 muli 优化：子按钮智能弹出方向，根据父按钮在屏幕位置自动调整
// 2025-12-5 muli 新增双击头像可快捷艾特，新增双击消息体可快捷引用，重构按钮工厂，支持按钮配置在线编辑
// 2025-12-5 18 优化 promptAndSend 函数 允许多占位符, 并支持默认值
// 2025-12-5 18 新增 移除小贴士功能
// 2025-12-5 18 新增 停靠按钮, 允许用户自定义停靠位置或贴边用户信息. !!! 注意, 贴靠时如果边栏消失则插件无法渲染!!!
// 2025-12-5 18 优化样式, 贴边情况下, 动态排列按钮, 在极窄边框下自动换行
// 2025-12-12 muli 新增快捷复读按钮，新增快捷父按钮可联动子按钮冷却配置功能（cooldownChildren）
// 2025-12-14 trd 新增sendIconTextMsg()函数动作 用于发送图标文字
// 2025-12-15 muli 完善图片消息动作，支持动态配置图片参数
// 2025-12-18 muli 新增小尾巴设置（来源小梦的魔法）
// 2025-12-19 muli 引用和复读将剥夺别人的小尾巴，前提要开启小尾巴功能
// 2025-12-26 muli 图片消息函数引入新参数，可指定默认执行发生时的参数，优化了双击引用时，一些消息无法准确识别的问题（依旧有部分极限场景可能出现问题）
// 2026-01-04 muli 修复关闭小尾巴时，引用依旧添加小尾巴；修复保存消息配置时，换行丢失问题
// 2026-01-08 muli 新增表情包分组功能，与鱼排原有表情包不冲突，可同步保存和读取鱼排表情包数据
// 2026-01-09 muli 表情包分组tab双击可修改名称，支持对已有表情包进行分组
// 2026-01-14 muli 新增发送红包函数
// 2026-01-21 muli 修复全部分组中删除表情包不生效问题，同步鱼排最新引用功能，修复最新引用功能图片在其他端无法显示问题
// 2026-01-22 muli 修复脚本多次引用后出现引用名字丢失的问题，优化文字换行时引用的显示，修复专属红包可以输入空字符串的问题，修复引用话题时的样式问题
// 2026-01-22 muli 修复多次引用层级不对问题，修复表情包url上传弹框两次问题
// 2026-01-23（2.5.0） muli 调整引用图片时使用图片的源地址，表情包新增一键发送按钮（鼠标放在表情包上的右下角蓝色按钮）
// 2026-01-27 muli 修复专属和其他红包错误显示问题
// 2026-01-28 muli 修复单独话题无法引用的问题（其他单独附带样式的元素）
// 2026-01-29 muli 分配表情包分组新增检查该分组是否已存在该表情包，修复去小尾巴误伤的问题，修复原始引用首行没有换行符的问题，修复无表情包加载递归问题
// 2026-02-02 muli 跟进鱼排最新版表情包分组功能，并新增一键分配和一键发送功能
// 2026-03-06 muli 快捷发送消息，快捷键进行调整，单独回车或者ALT + Enter、Ctrl + Enter都会快捷发送，shift + Enter为正常换行键
// 2026-03-13 muli 修复小尾巴开关在部分场景下，开关状态获取与实际不符的问题
// 2026-03-16 muli 统一封装存储方法，适配鱼排云端存储，并自动同步存储云端和本地（2.6.0）
// 2026-03-18 muli 批量消息支持设置延迟发送

(function () {
    'use strict';

    // ================== 配置存储键名 ==================
    const COOLDOWN_STORAGE_PREFIX = 'fishpi_cooldown_';
    const POSITION_STORAGE_KEY = 'fishpi_quick_actions_position';
    const CONFIG_STORAGE_KEY = 'fishpi_quick_actions_config';
    const DEFAULT_POSITION = { x: 20, y: 20 };

    // ================== 获取自己头像(改) ==================
    let MY_AVATAR = document.querySelector('.avatar-small').style["background-image"];
    MY_AVATAR = MY_AVATAR.slice(5,MY_AVATAR.length-2);
    //默认背景色
    const DEFAULT_ICON_BACKCOLOR = '9a808f,ffffff';
    //默认字体颜色
    const DEFAULT_ICON_FONTCOLOR = 'ffffff,9a808f,9a808f';
    // ================== 发送个性化文字图片时的链接模板  ==================
    let iconText = "![](https://fishpi.cn/gen?ver=0.1&scale=1.5&txt=#{msg}&url=#{avatar}&backcolor=#{backcolor}&fontcolor=#{fontcolor})";

    const client_us = "Web/沐里会睡觉";
    const version_us = "v2.6.2";

    // 设置面板状态
    let settingsPanelVisible = false;

    // 小尾巴固定关键字
    const wb_keyword = '\n\n> ';
    // 区别小尾巴固定关键字的引用关键字
    const tab_keyword = '\"跳转至原消息\")';
    // 区分是否多次引用
    const tabs_keyword = 'title=\"跳转至原消息\"';

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

    // 小尾巴开关状态
    var suffixFlag = muliSpecialStorage.getItem('xwb_flag') != null ? JSON.parse(muliSpecialStorage.getItem('xwb_flag')) : false;
    // 创建设置面板
    function createSettingsPanel() {
        // 检查是否已存在面板
        const existingPanel = document.getElementById('tail-word-settings-panel');
        if (existingPanel) {
            return existingPanel;
        }

        // 创建面板容器
        const panel = document.createElement('div');
        panel.id = 'tail-word-settings-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 16px;
            padding: 0;
            z-index: 10000;
            width: 550px;
            max-height: 80vh;
            display: none;
            flex-direction: column;
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            transition: all 0.3s ease;
            backdrop-filter: blur(10px);
        `;

        // 创建可拖动的标题栏
        const titleBar = document.createElement('div');
        titleBar.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 16px 20px;
            border-radius: 12px 12px 0 0;
            cursor: move;
            user-select: none;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        // 面板标题
        const title = document.createElement('h3');
        title.textContent = '小尾巴和单词头像设置';
        title.style.margin = '0';
        title.style.fontSize = '18px';
        title.style.fontWeight = '600';
        titleBar.appendChild(title);

        // 标题栏关闭按钮
        const titleCloseBtn = document.createElement('button');
        titleCloseBtn.innerHTML = '×';
        titleCloseBtn.style.cssText = `
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: none;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.3s ease;
        `;

        titleCloseBtn.onclick = function() {
            hideSettingsPanel();
        };

        titleCloseBtn.addEventListener('mouseenter', () => {
            titleCloseBtn.style.background = 'rgba(255, 255, 255, 0.3)';
        });

        titleCloseBtn.addEventListener('mouseleave', () => {
            titleCloseBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        });

        titleBar.appendChild(titleCloseBtn);
        panel.appendChild(titleBar);

        // 创建内容容器
        const contentContainer = document.createElement('div');
        contentContainer.style.cssText = `
            padding: 20px;
            flex: 1;
            overflow-y: auto;
        `;
        panel.appendChild(contentContainer);

        // 添加小尾巴设置区域
        const suffixSection = document.createElement('div');
        suffixSection.style.cssText = `
            background: #fafafa;
            border: 2px dashed #e1e5e9;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 20px;
            transition: all 0.3s ease;
        `;

        suffixSection.addEventListener('mouseenter', () => {
            suffixSection.style.borderColor = '#667eea';
            suffixSection.style.background = '#f0f2ff';
        });

        suffixSection.addEventListener('mouseleave', () => {
            suffixSection.style.borderColor = '#e1e5e9';
            suffixSection.style.background = '#fafafa';
        });

        const suffixTitle = document.createElement('h4');
        suffixTitle.textContent = '小尾巴设置';
        suffixTitle.style.marginTop = '0';
        suffixTitle.style.marginBottom = '20px';
        suffixTitle.style.color = '#333';
        suffixTitle.style.fontSize = '16px';
        suffixSection.appendChild(suffixTitle);

        // 小尾巴开关
        const suffixToggleDiv = document.createElement('div');
        suffixToggleDiv.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
        `;

        const suffixToggleLabel = document.createElement('label');
        suffixToggleLabel.textContent = '启用小尾巴';
        suffixToggleLabel.style.fontWeight = '500';
        suffixToggleLabel.style.color = '#555';

        const suffixToggle = document.createElement('input');
        suffixToggle.type = 'checkbox';
        suffixToggle.checked = suffixFlag;
        suffixToggle.id = 'suffix-toggle';
        suffixToggle.style.cssText = `
            width: 40px;
            height: 20px;
            cursor: pointer;
        `;

        suffixToggleDiv.appendChild(suffixToggleLabel);
        suffixToggleDiv.appendChild(suffixToggle);
        suffixSection.appendChild(suffixToggleDiv);

        // 小尾巴预设选择
        const presetTitle = document.createElement('div');
        presetTitle.textContent = '预设小尾巴';
        presetTitle.style.marginBottom = '10px';
        presetTitle.style.fontWeight = '500';
        presetTitle.style.color = '#555';
        suffixSection.appendChild(presetTitle);

        const presetSelect = document.createElement('select');
        presetSelect.id = 'suffix-preset-select';
        presetSelect.style.cssText = `
            width: 100%;
            padding: 10px 12px;
            margin-bottom: 20px;
            border: 1px solid #d9d9d9;
            border-radius: 6px;
            box-sizing: border-box;
            font-size: 14px;
            background-color: white;
            cursor: pointer;
            transition: all 0.3s ease;
            outline: none;
        `;

        suffixOptions.forEach((option, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.textContent = option;
            presetSelect.appendChild(opt);
        });

        // 设置当前选中的预设
        const currentIndex = getCurrentSuffixIndex();
        const isCustom = muliSpecialStorage.getItem('xwb_is_custom_suffix') === 'true' ||
            muliSpecialStorage.getItem('xwb_is_custom_suffix') === true;
        if (!isCustom) {
            presetSelect.value = currentIndex;
        }

        suffixSection.appendChild(presetSelect);

        // 自定义小尾巴输入
        const customTitle = document.createElement('div');
        customTitle.textContent = '自定义小尾巴';
        customTitle.style.marginBottom = '10px';
        customTitle.style.fontWeight = '500';
        customTitle.style.color = '#555';
        suffixSection.appendChild(customTitle);

        const customInput = document.createElement('textarea');
        customInput.id = 'custom-suffix-input';
        customInput.placeholder = '请输入自定义小尾巴...';
        customInput.rows = 3;
        customInput.value = muliSpecialStorage.getItem('xwb_custom_suffix') || '';
        customInput.style.cssText = `
            width: 100%;
            padding: 10px 12px;
            margin-bottom: 20px;
            border: 1px solid #d9d9d9;
            border-radius: 6px;
            box-sizing: border-box;
            font-size: 14px;
            resize: vertical;
            transition: all 0.3s ease;
            outline: none;
        `;
        suffixSection.appendChild(customInput);

        // 自定义开关
        const customToggleDiv = document.createElement('div');
        customToggleDiv.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
        `;

        const customToggleLabel = document.createElement('label');
        customToggleLabel.textContent = '使用自定义小尾巴';
        customToggleLabel.style.fontWeight = '500';
        customToggleLabel.style.color = '#555';

        const customToggle = document.createElement('input');
        customToggle.type = 'checkbox';
        customToggle.checked = isCustom;
        customToggle.id = 'custom-suffix-toggle';
        customToggle.style.cssText = `
            width: 40px;
            height: 20px;
            cursor: pointer;
        `;

        customToggleDiv.appendChild(customToggleLabel);
        customToggleDiv.appendChild(customToggle);
        suffixSection.appendChild(customToggleDiv);

        // 当前预览
        const previewTitle = document.createElement('div');
        previewTitle.textContent = '当前预览';
        previewTitle.style.marginBottom = '10px';
        previewTitle.style.fontWeight = '500';
        previewTitle.style.color = '#555';
        suffixSection.appendChild(previewTitle);

        const previewDiv = document.createElement('div');
        previewDiv.id = 'suffix-preview';
        previewDiv.style.cssText = `
            background: #f0f2ff;
            border: 1px solid #667eea;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 10px;
            font-style: italic;
            color: #333;
            min-height: 40px;
            display: flex;
            align-items: center;
        `;
        previewDiv.textContent = getCurrentSuffixText();
        suffixSection.appendChild(previewDiv);

        contentContainer.appendChild(suffixSection);



        // 添加保存按钮
        const saveBtn = document.createElement('button');
        saveBtn.textContent = '保存设置';
        saveBtn.style.cssText = `
            width: 100%;
            padding: 12px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 500;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
            margin-top: 20px;
        `;

        saveBtn.addEventListener('mouseenter', () => {
            saveBtn.style.transform = 'translateY(-2px)';
            saveBtn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
        });

        saveBtn.addEventListener('mouseleave', () => {
            saveBtn.style.transform = 'translateY(0)';
            saveBtn.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
        });

        saveBtn.onclick = saveSettings;
        contentContainer.appendChild(saveBtn);

        // 添加到页面
        document.body.appendChild(panel);

        // 添加事件监听
        addSettingsEventListeners();

        return panel;
    }

    // ================== 动作执行器 ==================
    const ActionExecutor = {
        functions: {
            sendMsg: (params) => {
                if (typeof params.params === 'string') {
                    return sendMsg(params.params);
                } else if (Array.isArray(params.params)) {
                    if (params.delay) {
                        return sendMessagesApi(params.params, params.delay);
                    } else {
                        return sendMsg(params.params);
                    }
                }
                return Promise.reject('sendMsg参数错误');
            },
            sendRedPacketMsg: (params) => {
                if (typeof params === 'object') {
                    return sendRedPacketMsg(params);
                }
                return Promise.reject('sendRedPacketMsg参数错误');
            },
            sendIconTextMsg: (params) => {
                if (typeof params === 'string') {

                    return sendIconTextMsg(...params.split('|'));
                }
                return Promise.reject('sendIconTextMsg参数错误');
            },
            promptAndIconTextMsg: (params) => {
                new Promise((resolve) => {
                    const input = prompt('请输入：消息|头像（用户名或图片链接）|背景|字体，参数', params.defaultValue || '消息|null|null|null');
                    if (input === null) {
                        resolve();
                        return;
                    }
                    try {

                        return sendIconTextMsg(...String(input).split('|'));
                    } catch (err) {
                        console.error('输入+发送图片消息异常:', err);
                        resolve();
                    }
                });
            },
            muliRefreshPage: (params) => {
                if (typeof params === 'string') {
                    return muliRefreshPage(params);
                } else if (Array.isArray(params)) {
                    return muliRefreshPage(...params);
                } else {
                    return muliRefreshPage();
                }
            },
            fetchPrivate: (params) => {
                if (typeof params === 'string') {
                    return fetchPrivate(params);
                } else if (Array.isArray(params)) {
                    params.forEach(param => {
                        fetchPrivate(param);
                    });
                    return true;
                }
                return Promise.reject('fetchPrivate参数错误');
            },
            promptAndSend: (params) => {
                new Promise((resolve) => {
                    const input = prompt(params.promptText || '请输入', params.defaultValue || '');
                    if (input === null) {
                        resolve();
                        return;
                    }
                    try {
                        const parts = String(input).split(',').map(s => s.trim());
                        let seqIndex = 0;
                        const actionCodeFilled = params.actionCode.replace(/\${input(\d+)?}/g, (_m, n) => {
                            if (n) {
                                const pos = Number(n) - 1;
                                return (parts[pos] !== undefined) ? parts[pos] : '';
                            } else {
                                const val = (parts[seqIndex] !== undefined) ? parts[seqIndex] : '';
                                seqIndex++;
                                return val;
                            }
                        });
                        return sendMsg(actionCodeFilled);
                    } catch (err) {
                        console.error('输入+发送异常:', err);
                        resolve();
                    }
                });
            }
        },

        execute: async function (actionConfig) {
            if (!actionConfig) return;

            try {
                if (typeof actionConfig === 'function') {
                    return await actionConfig();
                }

                if (actionConfig.type && this.functions[actionConfig.type]) {
                    if (actionConfig.type === 'sendMsg') {
                        return await this.functions[actionConfig.type](actionConfig);
                    }
                    return await this.functions[actionConfig.type](actionConfig.params);
                }

                console.warn('未知的动作类型:', actionConfig);
                return true;
            } catch (error) {
                console.error('动作执行失败:', error);
                return Promise.reject(error);
            }
        },

        configToFunction: function (actionConfig) {
            if (typeof actionConfig === 'function') return actionConfig;

            if (!actionConfig || !actionConfig.type) {
                return () => Promise.resolve();
            }

            switch (actionConfig.type) {
                case 'sendMsg':
                    return () => sendMsg(actionConfig);
                case 'sendRedPacketMsg':
                    return () => sendRedPacketMsg(actionConfig.params);
                case 'muliRefreshPage':
                    return () => muliRefreshPage(actionConfig.params);
                case 'fetchPrivate':
                    return () => fetchPrivate(actionConfig.params);
                case 'promptAndSend':
                    return () => this.execute(actionConfig);
                case 'sendIconTextMsg':
                    return () => sendIconTextMsg(actionConfig.params);
                case 'promptAndIconTextMsg':
                    return () => promptAndIconTextMsg(actionConfig.params);
                case 'customCode':
                    try {
                        return new Function('return ' + actionConfig.params)();
                    } catch (e) {
                        return () => Promise.resolve();
                    }
                default:
                    return () => Promise.resolve();
            }
        }
    };

    //保存所有冷却状态
    function saveAllCooldownStates() {
        const container = document.getElementById('quick-actions');
        if (!container) return;

        const coolingButtons = container.querySelectorAll('.cr-btn.cooldown, .sub-btn.cooldown');

        coolingButtons.forEach(btn => {
            const buttonId = btn.dataset.buttonId;
            if (!buttonId) return;

            const match = btn.textContent.match(/\((\d+)s\)/);
            if (match && match[1]) {
                const remainingSeconds = parseInt(match[1]);
                if (remainingSeconds > 0) {
                    const endTime = Date.now() + (remainingSeconds * 1000);
                    const cooldownKey = `${COOLDOWN_STORAGE_PREFIX}${buttonId}`;
                    muliSpecialStorage.setItem(cooldownKey, endTime.toString());
                }
            }
        });
    }

    // ================== 序列化/反序列化工具 ==================
    const ConfigSerializer = {
        serialize: function (config) {
            return JSON.stringify(config, function (key, value) {
                if (typeof value === 'function') {
                    return ActionExecutor.functionToConfig(value);
                }

                if (value && typeof value === 'object' && value.type === 'function') {
                    return ActionExecutor.functionToConfig(value);
                }

                return value;
            }, 2);
        },

        deserialize: function (jsonString) {
            return JSON.parse(jsonString, function (key, value) {
                if (value && typeof value === 'object' && value.type) {
                    return value;
                }

                return value;
            });
        },

        migrateOldConfig: function (oldConfig) {
            return oldConfig.map(button => ({
                ...button,
                action: ActionExecutor.functionToConfig(button.action),
                children: button.children ? button.children.map(child => ({
                    ...child,
                    action: ActionExecutor.functionToConfig(child.action)
                })) : undefined
            }));
        }
    };

    // 添加复读按钮的函数
    function addRepeatButtonOptimized(chatItem) {
        if (chatItem.classList.contains('repeat-btn-added')) {
            return;
        }

        const chatContent = chatItem.querySelector('.chats__content');
        if (!chatContent) return;

        // 确保chatItem有相对定位
        chatItem.style.position = 'relative';

        // 创建复读按钮
        const repeatBtn = document.createElement('button');
        repeatBtn.className = 'repeat-btn';
        repeatBtn.innerHTML = '↲↲'; // 或使用 '🔁'
        repeatBtn.title = '复读';
        repeatBtn.style.cssText = `
            position: absolute;
            background: rgba(191, 185, 185, 0.5);
            border: none;
            border-radius: 3px;
            padding: 2px 6px;
            cursor: pointer;
            font-size: 12px;
            opacity: 0.7;
            transition: opacity 0.2s, transform 0.2s, background 0.2s;
            z-index: 10;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            pointer-events: auto;
        `;

        // 更新位置的函数
        const updatePosition = () => {
            const contentRect = chatContent.getBoundingClientRect();
            const itemRect = chatItem.getBoundingClientRect();

            // 计算位置：放在chats__content的右上角外面
            const top = contentRect.top - itemRect.top - 8;
            const right = itemRect.right - contentRect.right - 10;

            repeatBtn.style.top = `${top}px`;
            repeatBtn.style.right = `${right}px`;
        };

        // 鼠标效果
        repeatBtn.addEventListener('mouseenter', () => {
            repeatBtn.style.opacity = '1';
            repeatBtn.style.transform = 'scale(1.1)';
            repeatBtn.style.background = 'rgba(191, 185, 185, 0.8)';
        });

        repeatBtn.addEventListener('mouseleave', () => {
            repeatBtn.style.opacity = '0.7';
            repeatBtn.style.transform = 'scale(1)';
            repeatBtn.style.background = 'rgba(191, 185, 185, 0.5)';
        });

        // 点击处理
        repeatBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            // 推送右上角提示
            // 提取消息信息
            const messageInfo = extractMessageInfo(chatContent);
            if (!messageInfo || !messageInfo.username || !messageInfo.messageId) {

                return;
            }
            //音乐、红包禁止复读
            if (chatContent.querySelector('.music-player')) {
                showTemporaryHint(`善良的小鱼油，别复读音乐🎵哦！！！！！`);
                return;
            }
            if (chatContent.querySelector('.hongbao__item')) {
                showTemporaryHint(`善良的小鱼油，别复读红包🧧哦！！！！！`);
                return;
            }

            if (messageInfo.messageId.startsWith('chatroom')) {
                const chatId = messageInfo.messageId.slice(8);
                //复读
                ChatRoom.repeat(chatId);
            }

            // 提取消息的HTML内容
            // const messageHTML = extractMessageHTML(chatContent);
            // // 发送消息（非引用不需要blockquote）
            // if(!messageHTML.includes('引用 @')) {
            //     sendMsg(messageHTML.replace(/<blockquote\b[^>]*>(.*?)<\/blockquote>/gis, ''));
            // } else {
            //     sendMsg(messageHTML);
            // }



            // 显示成功提示
            showTemporaryHint(`已复读 ${messageInfo.displayName || messageInfo.username} 的消息`);
        });

        // 添加到DOM
        chatItem.appendChild(repeatBtn);

        // 初始定位
        requestAnimationFrame(updatePosition);

        // 标记已添加
        chatItem.classList.add('repeat-btn-added');

        // 监听变化重新定位
        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(updatePosition);
        });

        resizeObserver.observe(chatItem);
        resizeObserver.observe(chatContent);
    }

    // 为所有聊天项添加按钮
    document.querySelectorAll('.chats__item').forEach(addRepeatButtonOptimized);

    // 监听新聊天项
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // if (node.matches && node.matches('.chats__item')) {
                    //     setTimeout(() => addRepeatButtonOptimized(node), 100);
                    // }

                    const items = node.querySelectorAll ? node.querySelectorAll('.chats__item') : [];
                    items.forEach(item => {
                        setTimeout(() => addRepeatButtonOptimized(item), 100);
                    });
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 添加一些CSS样式
    const style = document.createElement('style');
    style.textContent = `
        .repeat-btn:hover {
            box-shadow: 0 2px 5px rgba(0,0,0,0.2) !important;
        }

        .chats__item {
            min-height: 1px; /* 确保有高度用于定位 */
        }
    `;
    document.head.appendChild(style);

    // ================== 默认配置 ==================
    const ORIGINAL_BUTTONS_CONFIG = [
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
            text: "小斗士指令",
            color: "btn-blue",
            action: { type: 'sendMsg', params: '小斗士 签到' },
            cooldown: 30,
            muliRefresh: true,
            children: [
                {
                    text: "查询积分",
                    action: { type: 'sendMsg', params: '小斗士 查询积分' },
                    muliRefresh: true,
                    cooldown: 30
                },
                {
                    text: "积分榜",
                    action: { type: 'sendMsg', params: '小斗士 查询积分榜' },
                    muliRefresh: true,
                    cooldown: 60
                },
                {
                    text: "负分榜",
                    action: { type: 'sendMsg', params: '小斗士 查询负分榜' },
                    muliRefresh: true,
                    cooldown: 60
                },
                {
                    text: "签到",
                    action: { type: 'sendMsg', params: '小斗士 签到' },
                    cooldown: 60
                },
                {
                    text: "交易列表",
                    action: { type: 'sendMsg', params: '小斗士 交易列表' },
                    muliRefresh: true,
                    cooldown: 60
                },
                {
                    text: "爆了！",
                    muliRefresh: true,
                    action: {
                        type: 'promptAndSend',
                        params: {
                            promptText: '输入要爆的人',
                            defaultValue: '',
                            actionCode: '小斗士 ${input}我和你爆了'
                        }
                    }
                },
                {
                    text: "购买仆人",
                    muliRefresh: true,
                    action: {
                        type: 'promptAndSend',
                        params: {
                            promptText: '输入要购买的交易列表序号',
                            defaultValue: '',
                            actionCode: '小斗士 购买${input}'
                        }
                    }
                },
                {
                    text: "桃",
                    action: { type: 'sendMsg', params: '小斗士 桃' },
                    muliRefresh: true
                },
                {
                    text: "酒",
                    action: { type: 'sendMsg', params: '小斗士 酒' },
                    muliRefresh: true
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
                params: ['/chat/mark-all-as-read', '/notifications/all-read']
            }
        },

        {
            text: "小管家指令",
            color: "btn-blue",
            action: {
                type: 'sendMsg',
                params: ['/ 来一杯', '/ 烟花雨']
            },
            cooldownChildren: '1,2',
            cooldown: 300,
            children: [
                {
                    text: "来一杯",
                    action: { type: 'sendMsg', params: '/ 来一杯' },
                    cooldown: 300
                },
                {
                    text: "烟花雨",
                    action: { type: 'sendMsg', params: '/ 烟花雨' },
                    cooldown: 300
                },
                {
                    text: "存钱",
                    action: {
                        type: 'promptAndSend',
                        params: {
                            promptText: '输入存入金额',
                            defaultValue: '',
                            actionCode: '/ 存 ${input}'
                        }
                    }
                },
                {
                    text: "取钱",
                    action: {
                        type: 'promptAndSend',
                        params: {
                            promptText: '输入取出金额',
                            defaultValue: '',
                            actionCode: '/ 取 ${input}'
                        }
                    }
                }
            ]
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
                    text: "说话",
                    action: { type: 'sendMsg', params: '# 说话！' },
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

    // 最终使用的配置
    let FINAL_BUTTONS_CONFIG = [];

    // 编辑器中的当前配置
    let activeConfig = [];

    // ================== API函数 ==================

    /**
     * 发送图片消息
     * msg 消息
     * avatar 头像地址
     * backcolor 背景颜色
     * fontcolor 文字颜色
     *
     * */
    function sendIconTextMsg(msg, avatar, backcolor, fontcolor){
        if (!msg || msg == null || msg === 'null') {
            msg = '沐里天下第一！！！';
        }
        if (!avatar || avatar == null || avatar === 'null') {
            //默认自己头像
            avatar = MY_AVATAR;
        } else {
            //先尝试当前页面寻找用户
            const avatarDiv = document.querySelector('#comments div[aria-label="' + avatar + '"]');
            if (avatarDiv) {
                avatar = avatarDiv.style["background-image"];
                avatar = avatar.slice(5,avatar.length-2);
            }
        }
        if (!backcolor || backcolor == null || backcolor === 'null') {
            //默认背景颜色
            backcolor = DEFAULT_ICON_BACKCOLOR;
        }
        if (!fontcolor || fontcolor == null || fontcolor === 'null') {
            //默认文字颜色
            fontcolor = DEFAULT_ICON_FONTCOLOR;
        }
        //替换文字(创建一个新的对象)
        var thisIconText = String(iconText);
        thisIconText = thisIconText.replace("#{msg}", msg);
        thisIconText = thisIconText.replace("#{avatar}", avatar);
        thisIconText = thisIconText.replace("#{backcolor}", backcolor);
        thisIconText = thisIconText.replace("#{fontcolor}", fontcolor);
        //发送消息
        sendMsg(thisIconText);
    }

    // 睡眠毫秒数
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 延迟循环消息
    function sendMessagesApi(messages, delay) {
        if (!delay) {
            delay = 0;
        }
        return new Promise((resolve, reject) => {
            let index = 0;

            function sendNext() {
                if (index >= messages.length) {
                    resolve();
                    return;
                }

                const message = messages[index];
                index++;

                sendMsg(message)
                    .then(() => {
                        setTimeout(sendNext, delay);
                    })
                    .catch(reject);
            }

            sendNext();
        });
    }

    // 发送消息函数
    function sendMsg(msg) {
        if (Array.isArray(msg)) {
            var list = [];
            msg.forEach(param => {
                sendMsg(param);
            });
            return list;
        } else {
            return new Promise((resolve, reject) => {
                if (suffixFlag) {
                    let muliWb = getCurrentSuffixText();
                    if(!muliWb || muliWb == null) {
                        muliWb = '';
                    } else {
                        muliWb = '\n\n\n>  ' + muliWb;
                    }
                    $.ajax({
                        url: "/chat-room/send",
                        type: "POST",
                        data: JSON.stringify({ content: msg + muliWb, client: client_us + version_us }),
                        success: resolve,
                        error: reject
                    });
                } else {
                    $.ajax({
                        url: "/chat-room/send",
                        type: "POST",
                        data: JSON.stringify({ content: msg, client: client_us + version_us }),
                        success: resolve,
                        error: reject
                    });
                }
            });
        }

    }


    // 发送红包函数
    function sendRedPacketMsg(data) {
        let msg = JSON.parse(JSON.stringify(data));
        //格式化数据
        if (msg.type) {
            if (msg.type == '拼手气红包') {
                msg.type = 'random';
            } else if (msg.type == '普通红包') {
                msg.type = 'average';
            } else if (msg.type == '专属红包') {
                msg.type = 'specify';
            } else if (msg.type == '心跳红包') {
                msg.type = 'heartbeat';
            } else if (msg.type == '猜拳红包') {
                msg.type = 'rockPaperScissors';
            }
        } else {
            //
            muliShowToast("拜托🙏先选一下红包类型好吗~");
            return;
        }
        if (msg.gesture && msg.gesture !== '无') {
            if (msg.gesture == '石头') {
                msg.gesture = '0';
            } else if (msg.gesture == '剪刀') {
                msg.gesture = '1';
            } else if (msg.gesture == '布') {
                msg.gesture = '2';
            }
        } else {
            if(msg.type == 'rockPaperScissors') {
                let input = prompt('请输入：石头（0）、剪刀（1）、布（2）', '0');
                if (input === null || input == "") {
                    muliShowToast("我跟你说剪刀石头布，你耳朵聋吗？");
                    return;
                }
                msg.gesture = input;
                if (msg.gesture == '石头') {
                    msg.gesture = '0';
                } else if (msg.gesture == '剪刀') {
                    msg.gesture = '1';
                } else if (msg.gesture == '布') {
                    msg.gesture = '2';
                }
            }

        }
        if (!msg.msg) {
            msg.msg = '沐里天下第一！！！';
        }
        if (!msg.money || msg.money < 1) {
            let input = prompt('请输入红包金额：', '256');
            if (input === null || input == "") {
                muliShowToast("💰金额我替你填？？99999????~");
                return;
            }
            msg.money = input;

        }
        if (!msg.count) {
            msg.count = 1;
        }
        if ((!msg.recivers || msg.recivers < 1 || msg.recivers[0] == '') && msg.type == 'specify') {
            let input = prompt('请输入专属用户名：）', 'muli');
            if (input === null || input == "") {
                muliShowToast("你懒得输入的话，就发给沐里大人！");
                return;
            }
            msg.recivers = [input];
        }

        let content;
        if (msg.type == "rockPaperScissors") {
            content = {
                type: msg.type,
                money: msg.money,
                count: msg.count,
                msg: msg.msg,
                gesture: msg.gesture
            }
        } else if (msg.type == "specify") {
            content = {
                type: msg.type,
                money: msg.money,
                count: msg.count,
                recivers: msg.recivers,
                msg: msg.msg
            }
        } else {
            content = {
                type: msg.type,
                money: msg.money,
                count: msg.count,
                msg: msg.msg
            }
        }

        let requestJSONObject = {
            content: "[redpacket]" + JSON.stringify(msg) + "[/redpacket]",
            client: client_us + version_us
        }
        $.ajax({
            url: Label.servePath + '/chat-room/send',
            type: 'POST',
            cache: false,
            data: JSON.stringify(requestJSONObject),
            success: function (result) {
                if (0 !== result.code) {
                    $('#chatContentTip').addClass('error').html('<ul><li>' + result.msg + '</li></ul>')
                }
            },
            error: function (result) {
                $('#chatContentTip').addClass('error').html('<ul><li>' + result.statusText + '</li></ul>')
            }
        })
        Util.closeAlert();
    }

    //私信接口
    function fetchPrivate(endpoint) {
        return fetch(`${location.origin}${endpoint}?apiKey=${Label.node.apiKey}`);
    }
    // 刷新页面
    async function muliRefreshPage(message = null, delay = 100) {
        try {
            if (message && !(message === 'true')) {
                await muliShowToast(message);
            }
        } catch (err) {
            console.error("提示息失败:", err);
        }

        saveAllCooldownStates();

        const container = document.getElementById('quick-actions');
        if (container && container.dragManager) {
            container.dragManager.savePosition();
        }

        setTimeout(() => {
            location.reload();
        }, delay);
    }

    //刷新页面的提示
    function muliShowToast(message, duration = 2000, type = 'info') {
        const oldToast = document.getElementById('muli-toast');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.id = 'muli-toast';
        toast.innerHTML = message;

        Object.assign(toast.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            color: 'white',
            padding: '14px 24px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            zIndex: '999999',
            textAlign: 'center',
            maxWidth: '80%',
            boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
            pointerEvents: 'none',
            opacity: '0',
            transition: 'all 0.3s ease'
        });

        const typeColors = {
            success: '#51cf66',
            info: '#339af0',
            warning: '#ff922b',
            error: '#ff6b6b'
        };
        toast.style.borderLeft = `4px solid ${typeColors[type] || typeColors.info}`;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translate(-50%, -50%) scale(1.05)';
        }, 10);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -50%) scale(0.95)';

            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, duration);
    }

    // ================== 辅助函数 ==================
    function loadConfig() {
        try {
            const saved = muliSpecialStorage.getItem(CONFIG_STORAGE_KEY);
            return saved ? ConfigSerializer.deserialize(saved) : null;
        } catch (e) {
            console.error('加载配置失败:', e);
            return null;
        }
    }

    function loadUserConfig() {
        const saved = loadConfig();
        if (saved) {
            FINAL_BUTTONS_CONFIG = saved;
        } else {
            FINAL_BUTTONS_CONFIG = JSON.parse(JSON.stringify(ORIGINAL_BUTTONS_CONFIG));
        }
    }

    // Enter发送消息
    // shift + Enter 正常空格
    const sendButton = document.querySelector('.green');
    if (sendButton) {
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' && event.shiftKey) {
                // event.preventDefault();
                // sendButton.click();
            } else if (event.key === 'Enter' && event.altKey) {
                event.preventDefault();
                sendButton.click();
            } else if (event.key === 'Enter' && event.ctrlKey) {
                event.preventDefault();
                sendButton.click();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                sendButton.click();
            }
        });
    }

    // ================== 双击功能 ==================
    // 辅助函数：检查a标签是否包含头像
    function hasAvatar(link) {
        return link.querySelector('.avatar.tooltipped__user') !== null;
    }

    // 双击检测状态
    let lastClick = {
        element: null,
        time: 0
    };

    // 全局点击事件处理
    document.addEventListener('click', function (event) {
        //event.preventDefault();
        // 检查是否点击了a标签
        const link = event.target.closest('a');
        if (!link) return;

        // 检查a标签是否包含头像
        if (!hasAvatar(link)) return;

        // 获取头像元素
        const avatar = link.querySelector('.avatar.tooltipped__user');
        if (!avatar) return;

        // 获取当前时间
        const now = Date.now();
        event.preventDefault();
        // 检查是否为双击（400ms内点击同一a标签）
        if (lastClick.element === link && (now - lastClick.time) < 400) {
            // 双击事件：阻止跳转，插入@用户名
            event.preventDefault();
            event.stopPropagation();

            const username = avatar.getAttribute('aria-label');
            if (username) {
                // 插入到输入框
                insertToVditorInput(`@${username} `);
                //ChatRoom.at('muli', '1765523194512', true)
            }

            // 重置状态
            lastClick.element = null;
            lastClick.time = 0;
        } else {
            event.preventDefault();
            // 单击事件：记录状态
            lastClick.element = link;
            lastClick.time = now;

            // 设置超时，500ms后重置状态
            setTimeout(() => {
                if (lastClick.element === link) {
                    lastClick.element = null;
                    lastClick.time = 0;
                    window.location.href = link.href;
                }
            }, 500);
        }
    });

    // 获取活跃的输入框
    function getActiveInput() {
        const chatContent = document.getElementById('chatContent');
        if (!chatContent) return null;

        let activeInput = null;
        const irInput = chatContent.querySelector('.vditor-ir .vditor-reset[contenteditable="true"]');
        if (irInput && irInput.offsetParent) {
            activeInput = irInput;
        }

        if (!activeInput) {
            const wysiwygInput = chatContent.querySelector('.vditor-wysiwyg .vditor-reset[contenteditable="true"]');
            if (wysiwygInput && wysiwygInput.offsetParent) {
                activeInput = wysiwygInput;
            }
        }

        if (!activeInput) {
            const svInput = chatContent.querySelector('.vditor-sv .vditor-reset[contenteditable="true"]');
            if (svInput && svInput.offsetParent) {
                activeInput = svInput;
            }
        }

        return activeInput;
    }

    // 在输入框末尾插入文本，光标移动到最前面
    function insertAtEndOfVditorInput(text) {
        const activeInput = getActiveInput();
        if (!activeInput) return false;

        // 获取当前内容
        const currentContent = activeInput.textContent || '';

        // 在新内容后添加引用
        const newContent = currentContent + text;

        // 替换输入框内容
        activeInput.textContent = newContent;

        // 让输入框获得焦点
        activeInput.focus();

        // 将光标移动到最前面（第一行开头）
        const range = document.createRange();
        const selection = window.getSelection();

        // 移动到输入框的最开始位置
        range.setStart(activeInput, 0);
        range.setEnd(activeInput, 0);
        selection.removeAllRanges();
        selection.addRange(range);

        // 触发输入事件
        const inputEvent = new Event('input', { bubbles: true });
        activeInput.dispatchEvent(inputEvent);

        return true;
    }

    // ================== 引用消息处理函数 ==================

    // 提取消息的HTML内容（包括嵌套引用）
    function extractMessageHTML(chatContent) {
        const vditorReset = chatContent.querySelector('.vditor-reset');
        if (!vditorReset) return null;

        // 返回内部的HTML，包括嵌套的引用
        return vditorReset.innerHTML;
    }
    // 解析消息
    // 将HTML转换为Markdown格式的引用
    function htmlToMarkdownQuote(html, currentLevel = 0) {
        // 创建一个临时元素来解析HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        // 第一次引用
        if (!html.includes(tabs_keyword)) {
            var blockquotes = tempDiv.querySelectorAll('blockquote');
            blockquotes.forEach(function(tempBlock) {
                tempBlock.remove(); // 或者 pElement.parentNode.removeChild(pElement);
            });
        }

        // 递归处理元素
        function processElement(element, level) {
            let markdown = '';
            let indent = '>'.repeat(level) + (level > 0 ? ' ' : '');
            let thisBlockquoteLevel  = 0;
            if (indent == "") {
                indent = "\n";
            }

            // 遍历所有子节点
            for (let node of element.childNodes) {
                if (node.parentNode && node.parentNode.tagName && node.parentNode.tagName.toLowerCase() === 'p') {
                    continue;
                }

                if (node.nodeType === Node.TEXT_NODE) {
                    // 文本节点
                    const text = node.textContent.trim();
                    if (text) {
                        markdown += indent + text + '\n';
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    // 元素节点
                    const tagName = node.tagName.toLowerCase();
                    if (tagName === 'img' || tagName === 'a' || tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || tagName === 'h4') {
                        if (tagName === 'img') {
                            // src
                            let aurl = node.getAttribute("originalsrc");
                            markdown += indent + `![图片表情](${aurl})\n`;
                            //markdown += indent + node.outerHTML + '\n';
                        } else if (tagName === 'a') {
                            let aurl = node.getAttribute("href");
                            let atxt = node.textContent;
                            markdown += indent + `[${atxt}](${aurl})\n`;
                        } else {
                            markdown += indent + node.outerHTML.trim() + '\n';
                        }

                    } else if (tagName === 'p') {
                        if (!node.innerHTML) {
                            continue;
                        }
                        // 段落
                        const pContent = node.innerHTML.trim();

                        if(node.childNodes.length > 1) {
                            var n = 1;
                            markdown += indent;
                            node.childNodes.forEach(son_node => {
                                if(son_node.tagName && son_node.tagName.toLowerCase() === 'a') {
                                    //markdown += son_node.outerHTML;
                                    let aurl = son_node.getAttribute("href");
                                    let atxt = son_node.textContent;
                                    markdown += `[${atxt}](${aurl})`;
                                } else if(son_node.tagName && son_node.tagName.toLowerCase() === 'img') {
                                    //markdown += son_node.outerHTML + '\n';
                                    let aurl = son_node.getAttribute("originalsrc");
                                    markdown += `![图片表情](${aurl})\n`;
                                } else if(son_node.tagName && son_node.tagName.toLowerCase() === 'br') {
                                    markdown += '\n';
                                } else if(son_node.nodeType === Node.TEXT_NODE) {
                                    markdown += son_node.textContent;

                                } else {
                                    markdown += son_node.outerHTML;
                                }

                                n++;
                            });
                            markdown += '\n';
                        } else {
                            if (node.childNodes && node.childNodes[0].tagName) {
                                if(node.childNodes[0] && node.childNodes[0].tagName.toLowerCase() === 'img') {
                                    //markdown += node.childNodes[0].outerHTML + '\n';
                                    let aurl = node.childNodes[0].getAttribute("originalsrc");
                                    markdown += indent + `![图片表情](${aurl})\n`;
                                } else if(node.childNodes[0].tagName.toLowerCase() === 'a') {
                                    //markdown += indent + node.innerHTML.trim() + '\n';
                                    let aurl = node.childNodes[0].getAttribute("href");
                                    let atxt = node.childNodes[0].textContent;
                                    markdown += indent + `[${atxt}](${aurl})\n`;
                                } else {
                                    markdown += node.childNodes[0].outerHTML + '\n';
                                }
                            } else {
                                markdown += indent + pContent + '\n';
                            }
                        }


                    } else if (tagName === 'h5') {
                        // 引用标题 - 提取用户名和链接
                        const userLink = node.querySelector('a[href*="/member/"]');
                        const backLink = node.querySelector('a[href*="cr#"]');
                        //非引用层
                        if(!userLink && !backLink) {
                            markdown += indent + node.outerHTML.trim() + '\n';
                            continue;
                        }

                        let userText = '';
                        if (userLink) {
                            const ariaLabel = userLink.getAttribute('aria-label');
                            userText = ariaLabel || userLink.textContent;
                        } else {
                            // 已经被脚本引用过了 因为脚本艾特可能启用的是中文 所以会导致抓取不到原来的名称
                            let nameTempText = node.textContent;
                            let tempStaIndex = nameTempText.indexOf("引用 @");
                            if (tempStaIndex > -1) {
                                let tempEndIndex = nameTempText.indexOf(" ↩");
                                userText = node.textContent.substring(tempStaIndex + 4, tempEndIndex);
                            }
                        }

                        let linkText = '';
                        if (backLink) {
                            const href = backLink.getAttribute('href');
                            const title = backLink.getAttribute('title') || '跳转至原消息';
                            linkText = `[↩](${href} "${title}")`;
                        }

                        markdown += indent + `##### 引用 @${userText} ${linkText}\n`;
                    } else if (tagName === 'blockquote') {
                        if (thisBlockquoteLevel > 0) {
                            continue;
                        }
                        // 引用块 - 递归处理，增加层级
                        const blockquoteContent = processElement(node, level + 1);
                        thisBlockquoteLevel++;
                        markdown += blockquoteContent;

                    } else if (tagName === 'a' && node.closest('h5') === null) {
                        // 链接（不在h5中的）
                        const href = node.getAttribute('href');
                        const text = node.textContent;
                        markdown += indent + `[${text}](${href})`;
                    } else {
                        // 其他元素，递归处理
                        markdown += processElement(node, level);
                    }
                }
            }

            // 如果不是根元素，添加空行分隔
            if (level === 0 && markdown) {
                markdown += '\n';
            }

            return markdown;
        }

        return processElement(tempDiv, currentLevel);
    }

    //  提取分离一个标签内的图片和文字
    function splitImgAndText(htmlString) {
        const dom = new JSDOM(htmlString);
        const document = dom.window.document;

        const pElement = document.querySelector('p');
        if (!pElement) return { img: '', text: '', combined: '' };

        const imgElement = pElement.querySelector('img');
        const imgContent = imgElement ? imgElement.outerHTML : '';

        // 获取文本内容（排除img标签）
        const textContent = pElement.textContent || '';

        return {
            img: imgContent,
            text: textContent.trim(),
            combined: imgContent + textContent.trim()
        };
    }

    // 提取消息的基本信息
    function extractMessageInfo(chatContent) {
        const chatItem = chatContent.closest('.chats__item');
        if (!chatItem) return null;

        // 获取消息ID
        const messageId = chatItem.id;

        // 获取用户名（从头像）
        const avatar = chatItem.querySelector('.avatar.tooltipped__user');
        const username = avatar ? avatar.getAttribute('aria-label') : null;

        // 获取显示名
        const userNameElement = chatContent.querySelector('#userName');
        let displayName = username; // 默认使用用户名
        if (userNameElement) {
            const userSpan = userNameElement.querySelector('span');
            if (userSpan && userSpan.textContent) {
                const match = userSpan.textContent.match(/([^(]+)\s*\(/);
                if (match && match[1]) {
                    displayName = match[1].trim();
                }
            }
        }

        return {
            messageId,
            username,
            displayName
        };
    }

    // 生成新的引用层（在内容下方添加引用）
    function generateNewQuoteLayer(messageInfo, innerContent) {
        const { displayName, username, messageId } = messageInfo;
        const link = `https://fishpi.cn/cr#${messageId}`;
        // 修改这里优先使用id还是昵称来引用
        let quotedUser = displayName || username;

        // 将内部内容每行前面添加 "> "
        const quotedContent = innerContent
            .split('\n')
            .map(line => line.trim() === '' ? '>' : `> ${line}`)
            .join('\n');

        // 引用内容添加在现有内容的后面，并在引用前加两个空行
        if (displayName && displayName == '波波') {
            if ('bobo1024' == username) {
                quotedUser = '小波波';
            } else {
                quotedUser = '大波波';
            }
            return `\n\n##### 引用 @${quotedUser}(${username}) [↩](${link} "跳转至原消息")\n\n${quotedContent}\n`;
        } else {
            return `\n\n##### 引用 @${quotedUser} [↩](${link} "跳转至原消息")\n\n${quotedContent}\n`;
        }

    }

    // 处理双击事件-双击引用
    document.addEventListener('dblclick', function (event) {
        // 检查是否双击了.chats__content区域
        const chatContent = event.target.closest('.chats__content');
        if (!chatContent) return;

        // 阻止默认行为
        event.preventDefault();
        event.stopPropagation();

        // 提取消息信息
        const messageInfo = extractMessageInfo(chatContent);
        if (!messageInfo || !messageInfo.username || !messageInfo.messageId) {
            console.error('无法提取消息信息');
            return;
        }
        let success = false;

        // if (messageInfo.messageId.startsWith('chatroom')) {
        //     const chatId = messageInfo.messageId.slice(8);
        //     //引用
        //     ChatRoom.at(messageInfo.username, chatId, false);
        //     success = insertAtEndOfVditorInput("");
        // }

        // 提取消息的HTML内容
        const messageHTML = extractMessageHTML(chatContent);
        if (!messageHTML) {
            console.error('无法提取消息内容');
            return;
        }

        // 将HTML转换为Markdown格式
        const markdownContent = htmlToMarkdownQuote(messageHTML);

        // 生成新的引用层
        //const newQuote = generateNewQuoteLayer(messageInfo, markdownContent);

        // 存储引用信息
        ChatRoom.quoteData.userName = messageInfo.displayName || messageInfo.username;;
        ChatRoom.quoteData.messageId = messageInfo.messageId.slice(8);;
        ChatRoom.quoteData.content = markdownContent;
        // 显示引用预览
        ChatRoom.showQuote();
        success = insertAtEndOfVditorInput("");

        // 在现有内容后插入引用，并将光标移动到最前面
        //success = insertAtEndOfVditorInput(newQuote);

        if (success) {
            //console.log(`已添加对 ${messageInfo.displayName || messageInfo.username} 的引用`);

            // 显示成功提示
            showTemporaryHint(`已引用 ${messageInfo.displayName || messageInfo.username} 的消息`);
        }
    });

    // 显示临时提示
    function showTemporaryHint(message) {
        const hint = document.createElement('div');
        hint.textContent = message;
        hint.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 15px;
            border-radius: 4px;
            z-index: 10000;
            font-size: 14px;
            animation: fadeInOut 2s ease-in-out;
        `;

        // 添加动画
        if (!document.querySelector('#hint-animation-style')) {
            const style = document.createElement('style');
            style.id = 'hint-animation-style';
            style.textContent = `
                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translateY(-10px); }
                    10% { opacity: 1; transform: translateY(0); }
                    90% { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-10px); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(hint);

        // 2秒后移除
        setTimeout(() => {
            if (hint.parentNode) {
                hint.parentNode.removeChild(hint);
            }
        }, 2000);
    }

    // ================== 输入框操作函数 ==================

    function insertToVditorInput(text) {
        const activeInput = getActiveInput();
        if (!activeInput) return false;

        activeInput.focus();
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const textNode = document.createTextNode(text);
        range.deleteContents();
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);

        const inputEvent = new Event('input', { bubbles: true });
        activeInput.dispatchEvent(inputEvent);
        return true;
    }


    // ================== 按钮工厂 ==================
    const buttonFactory = {
        create: (config, index, buttonId) => {
            const btn = document.createElement('button');
            btn.className = `cr-btn ${config.color}`;

            const textNode = document.createTextNode(config.text);
            btn.appendChild(textNode);

            btn.dataset.index = index;
            btn.dataset.buttonId = buttonId;
            btn.dataset.originalText = config.text;

            let hideTimer = null;
            let showTimer = null;
            let subButtonsContainer = null;
            let disabledAboveBtn = null;
            // 子按钮生成
            if (config.children && config.children.length > 0) {
                btn.classList.add('has-sub-buttons');

                subButtonsContainer = document.createElement('div');
                subButtonsContainer.className = 'sub-buttons-container popup-down';
                subButtonsContainer.dataset.parentIndex = index;

                config.children.forEach((childConfig, childIndex) => {
                    const subBtn = document.createElement('button');
                    subBtn.className = 'sub-btn';

                    const subTextNode = document.createTextNode(childConfig.text);
                    subBtn.appendChild(subTextNode);

                    subBtn.dataset.buttonId = `${buttonId}_child_${childIndex}`;
                    subBtn.dataset.originalText = childConfig.text;

                    subBtn.onclick = async (e) => {
                        e.stopPropagation();
                        e.preventDefault();

                        if (subBtn.classList.contains('cooldown')) {
                            return;
                        }

                        try {
                            await ActionExecutor.execute(childConfig.action);
                            if (childConfig.cooldown) {
                                startCooldown(subBtn, childConfig.cooldown, `${buttonId}_child_${childIndex}`);
                            }
                            if (childConfig.muliRefresh) {
                                const refreshMessage = typeof childConfig.muliRefresh === 'string' ? childConfig.muliRefresh : null;
                                await muliRefreshPage(refreshMessage);
                            }
                        } catch (err) {
                            subBtn.style.background = '#ff4757';
                            setTimeout(() => subBtn.style.background = '', 1000);
                        }
                    };

                    subBtn.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                    });

                    subButtonsContainer.appendChild(subBtn);
                });

                subButtonsContainer.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                });

                subButtonsContainer.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                });

                btn.appendChild(subButtonsContainer);

                const getAboveButton = () => {
                    const container = document.getElementById('quick-actions');
                    if (!container) return null;

                    const currentIndex = parseInt(btn.dataset.index);
                    const aboveIndex = currentIndex - 3;

                    if (aboveIndex >= 0) {
                        const aboveBtn = container.querySelector(`.cr-btn[data-index="${aboveIndex}"]`);
                        return aboveBtn;
                    }
                    return null;
                };

                const disableAboveButton = () => {
                    const aboveBtn = getAboveButton();
                    if (aboveBtn && !aboveBtn.classList.contains('disabled-temp')) {
                        aboveBtn.classList.add('disabled-temp');
                        disabledAboveBtn = aboveBtn;
                    }
                };

                const enableAboveButton = () => {
                    if (disabledAboveBtn) {
                        disabledAboveBtn.classList.remove('disabled-temp');
                        disabledAboveBtn = null;
                    }
                };

                const adjustPopupDirection = () => {
                    if (!subButtonsContainer) return;

                    const btnRect = btn.getBoundingClientRect();
                    const windowHeight = window.innerHeight;
                    const estimatedHeight = config.children.length * 30 + 16;
                    const spaceBelow = windowHeight - btnRect.bottom;

                    if (spaceBelow < estimatedHeight && btnRect.top > estimatedHeight) {
                        subButtonsContainer.classList.remove('popup-down');
                        subButtonsContainer.classList.add('popup-up');
                        disableAboveButton();
                    } else {
                        subButtonsContainer.classList.remove('popup-up');
                        subButtonsContainer.classList.add('popup-down');
                        enableAboveButton();
                    }
                };

                btn.addEventListener('mouseenter', (e) => {
                    clearTimeout(hideTimer);
                    clearTimeout(showTimer);
                    adjustPopupDirection();

                    showTimer = setTimeout(() => {
                        if (subButtonsContainer) {
                            subButtonsContainer.classList.add('show');
                        }
                    }, 100);
                });

                btn.addEventListener('mouseleave', (e) => {
                    clearTimeout(showTimer);

                    const relatedTarget = e.relatedTarget;
                    if (!subButtonsContainer || !subButtonsContainer.contains(relatedTarget)) {
                        hideTimer = setTimeout(() => {
                            if (subButtonsContainer) {
                                subButtonsContainer.classList.remove('show');
                                enableAboveButton();
                            }
                        }, 200);
                    }
                });

                subButtonsContainer.addEventListener('mouseenter', (e) => {
                    clearTimeout(hideTimer);
                    clearTimeout(showTimer);

                    if (subButtonsContainer.classList.contains('popup-up') && !disabledAboveBtn) {
                        disableAboveButton();
                    }
                });

                subButtonsContainer.addEventListener('mouseleave', (e) => {
                    const relatedTarget = e.relatedTarget;

                    if (!btn.contains(relatedTarget)) {
                        hideTimer = setTimeout(() => {
                            if (subButtonsContainer) {
                                subButtonsContainer.classList.remove('show');
                                enableAboveButton();
                            }
                        }, 150);
                    }
                });

                btn.onclick = async (e) => {
                    if (btn.classList.contains('cooldown')) {
                        return;
                    }

                    try {
                        await ActionExecutor.execute(config.action);
                        if (config.cooldown) {
                            startCooldown(btn, config.cooldown, buttonId);
                            //如果父按钮配置了，冷却跟从配置，则触发冷却时，同时触发子按钮的冷却
                            if (config.cooldownChildren) {
                                //获取子按钮节点列表
                                const subButtons = Array.from(
                                    btn.querySelectorAll('.sub-buttons-container .sub-btn')
                                );
                                //是否指定了只冷却部分子按钮（坐标 + 1）
                                if (config.cooldownChildren === true) {
                                    //全部子按钮冷却
                                    subButtons.forEach((button, index) => {
                                        const buttonChildrenId = button.dataset.buttonId;
                                        startCooldown(button, config.cooldown, buttonChildrenId);
                                    });
                                } else {
                                    //指定子按钮冷却
                                    const uniqueList = config.cooldownChildren.split(',');
                                    var childIndex = 1;
                                    subButtons.forEach((button, index) => {
                                        if (uniqueList.includes(childIndex.toString())) {
                                            const buttonChildrenId = button.dataset.buttonId;
                                            startCooldown(button, config.cooldown, buttonChildrenId);
                                        }
                                        childIndex++;

                                    });
                                }

                            }

                        }
                        if (config.muliRefresh) {
                            const refreshMessage = typeof config.muliRefresh === 'string' ? config.muliRefresh : null;
                            await muliRefreshPage(refreshMessage);
                        }
                    } catch (err) {
                        btn.style.background = '#ff4757';
                        setTimeout(() => btn.style.background = '', 1000);
                    }
                };
            } else {
                btn.onclick = async (e) => {
                    if (btn.classList.contains('cooldown')) {
                        return;
                    }

                    try {
                        await ActionExecutor.execute(config.action);
                        if (config.cooldown) startCooldown(btn, config.cooldown, buttonId);
                        if (config.muliRefresh) {
                            const refreshMessage = typeof config.muliRefresh === 'string' ? config.muliRefresh : null;
                            await muliRefreshPage(refreshMessage);
                        }
                    } catch (err) {
                        btn.style.background = '#ff4757';
                        setTimeout(() => btn.style.background = '', 1000);
                    }
                };
            }

            return btn;
        }
    };

    // ================== 冷却系统 ==================
    function startCooldown(btn, seconds, buttonId) {
        // 如果按钮已经在冷却中，不再重复启动冷却
        if (btn.classList.contains('cooldown')) {
            return;
        }

        // 使用保存的原始文本
        let originalText = btn.dataset.originalText || btn.textContent.replace(/ \(\d+s\)$/, '');
        let remaining = seconds;

        // 添加冷却样式
        btn.classList.add('cooldown');

        // 保存原始文本
        btn.dataset.originalText = originalText;

        // 开始冷却 - 确保格式为：原按钮文本 + (冷却时间)
        // 直接操作按钮的文本节点，避免包含子按钮文本
        const textNode = btn.childNodes[0];
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            textNode.textContent = `${originalText} (${remaining}s)`;
        } else {
            btn.textContent = `${originalText} (${remaining}s)`;
        }

        // 保存冷却开始时间到本地存储
        const cooldownKey = `${COOLDOWN_STORAGE_PREFIX}${buttonId}`;
        const endTime = Date.now() + (seconds * 1000);
        muliSpecialStorage.setItem(cooldownKey, endTime.toString());

        const timer = setInterval(() => {
            remaining--;

            // 更新文本，确保格式正确
            const textNode = btn.childNodes[0];
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                textNode.textContent = `${originalText} (${remaining}s)`;
            } else {
                btn.textContent = `${originalText} (${remaining}s)`;
            }

            if (remaining <= 0) {
                clearInterval(timer);
                // 恢复原始状态
                const textNode = btn.childNodes[0];
                if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                    textNode.textContent = originalText;
                } else {
                    btn.textContent = originalText;
                }
                btn.classList.remove('cooldown');
                // 从本地存储中移除冷却记录
                muliSpecialStorage.removeItem(cooldownKey);
            }
        }, 1000);
    }
    // 刷新页面后 加载冷却状态
    function restoreCooldownStates() {
        const container = document.getElementById('quick-actions');
        if (!container) return;

        const buttons = container.querySelectorAll('.cr-btn, .sub-btn');

        buttons.forEach(btn => {
            const buttonId = btn.dataset.buttonId;
            if (!buttonId) return;

            const cooldownKey = `${COOLDOWN_STORAGE_PREFIX}${buttonId}`;
            const endTimeStr = muliSpecialStorage.getItem(cooldownKey);

            if (endTimeStr) {
                const endTime = parseInt(endTimeStr);
                const now = Date.now();

                if (endTime > now) {
                    const remainingSeconds = Math.ceil((endTime - now) / 1000);
                    let originalText = btn.dataset.originalText || btn.textContent.replace(/ \(\d+s\)$/, '');

                    btn.classList.add('cooldown');
                    btn.dataset.originalText = originalText;

                    const textNode = btn.childNodes[0];
                    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                        textNode.textContent = `${originalText} (${remainingSeconds}s)`;
                    } else {
                        btn.textContent = `${originalText} (${remainingSeconds}s)`;
                    }

                    let remaining = remainingSeconds;
                    const timer = setInterval(() => {
                        remaining--;
                        if (remaining > 0) {
                            const textNode = btn.childNodes[0];
                            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                                textNode.textContent = `${originalText} (${remaining}s)`;
                            } else {
                                btn.textContent = `${originalText} (${remaining}s)`;
                            }
                        } else {
                            clearInterval(timer);
                            const textNode = btn.childNodes[0];
                            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                                textNode.textContent = originalText;
                            } else {
                                btn.textContent = originalText;
                            }
                            btn.classList.remove('cooldown');
                            muliSpecialStorage.removeItem(cooldownKey);
                        }
                    }, 1000);
                } else {
                    muliSpecialStorage.removeItem(cooldownKey);
                }
            }
        });
    }


    // ================== 样式 ==================
    GM_addStyle(`
    #quick-actions {
        position: fixed !important;
        z-index: 9999;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        background: rgba(255,255,255,0.95);
        padding: 12px;
        padding-top: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        border: 1px solid #eee;
        max-width: 420px;
        cursor: move;
        user-select: none;
        transition: box-shadow 0.2s ease;
    }

    /* 停靠在侧边栏模式（相对位置） */
    #quick-actions.docked {
        position: relative !important;
        left: auto !important;
        top: auto !important;
        width: 100% !important; /* 将在运行时根据侧边元素宽度动态覆盖 */
        max-width: none !important;
        margin-top: 8px !important;
        box-sizing: border-box !important;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)) !important; /* 自适应列数，最小列宽120px */
    }

    #quick-actions.docked .drag-handle {
        display: none !important;
    }

    /* 停靠模式下，按钮允许随容器变窄且不溢出 */
    #quick-actions.docked .cr-btn {
        min-width: 0 !important;
        max-width: 100% !important;
        overflow: visible !important; /* 允许子菜单溢出显示 */
    }

    #quick-actions.docked .sub-btn {
        min-width: 0 !important;
        max-width: 100% !important;
        overflow: hidden !important;
    }

    .drag-handle {
        position: absolute;
        top: 0;
        left: 5%;
        right: 0;
        width: 90%;
        height: 18px;
        background: linear-gradient(to right, #667eea, #764ba2);
        border-radius: 8px 8px 0 0;
        cursor: move;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 12px;
        font-weight: bold;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.2s ease;
    }

    #quick-actions:hover .drag-handle {
        opacity: 0.8;
    }

    #quick-actions.dragging {
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        opacity: 0.9;
        cursor: grabbing;
    }

    #quick-actions.dragging .drag-handle {
        opacity: 1;
    }

    .cr-btn, .sub-btn, #goToTopMuLi {
        cursor: pointer;
    }

    .cr-btn {
        position: relative !important;
        border: none;
        border-radius: 6px;
        padding: 8px 12px;
        color: white !important;
        font-size: 14px;
        transition: all 0.2s;
        min-width: 110px;
        text-align: center;
        white-space: nowrap;
        overflow: visible !important;
        text-overflow: ellipsis;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 36px;
    }

    .cr-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 3px 6px rgba(0,0,0,0.15);
        z-index: 10002 !important;
    }

    .cr-btn.has-sub-buttons:hover {
        z-index: 10010 !important;
    }

    .cr-btn.cooldown {
        opacity: 0.7 !important;
        filter: grayscale(0.2) !important;
        cursor: not-allowed !important;
    }

    .cr-btn.cooldown {
        white-space: normal !important;
        word-break: break-all !important;
        line-height: 1.2 !important;
        text-align: center;
    }

    .sub-btn.cooldown {
        opacity: 0.7 !important;
        filter: grayscale(0.1) !important;
        pointer-events: none !important;
        cursor: not-allowed !important;
    }

    .btn-blue { background: linear-gradient(45deg, #4dabf7, #339af0) }
    .btn-red { background: linear-gradient(45deg, #ff6b6b, #ff8787) }
    .btn-warn { background: linear-gradient(45deg, #ff922b, #ff7676) }
    .btn-green { background: linear-gradient(45deg, #51cf66, #37b24d) }

    .sub-buttons-container {
        position: absolute !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        display: none !important;
        flex-direction: column !important;
        gap: 4px !important;
        z-index: 10050 !important;
        background: rgba(255,255,255,0.95) !important;
        padding: 8px !important;
        border-radius: 6px !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
        border: 1px solid #ddd !important;
        min-width: 120px !important;
        pointer-events: auto !important;
        opacity: 0 !important;
        transition: opacity 0.2s ease !important;
    }

    .sub-buttons-container.popup-down {
        top: 100% !important;
        bottom: auto !important;
        margin-top: 8px !important;
        margin-bottom: 0 !important;
    }

    .sub-buttons-container.popup-up {
        bottom: 100% !important;
        top: auto !important;
        margin-bottom: 8px !important;
        margin-top: 0 !important;
    }

    .sub-buttons-container::after {
        content: '' !important;
        position: absolute !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        border-width: 6px !important;
        border-style: solid !important;
        filter: drop-shadow(0 2px 1px rgba(0,0,0,0.1)) !important;
    }

    .sub-buttons-container.popup-down::after {
        top: -12px !important;
        bottom: auto !important;
        border-color: transparent transparent rgba(255,255,255,0.95) transparent !important;
    }

    .sub-buttons-container.popup-up::after {
        top: auto !important;
        bottom: -12px !important;
        border-color: rgba(255,255,255,0.95) transparent transparent transparent !important;
    }

    .sub-buttons-container.show {
        display: flex !important;
        opacity: 1 !important;
    }

    .sub-buttons-container::before {
        content: '';
        position: absolute;
        top: -8px;
        left: -8px;
        right: -8px;
        bottom: -8px;
        z-index: 10049;
        pointer-events: auto;
        background: transparent;
    }

    .sub-btn {
        background: linear-gradient(45deg, #5c7cfa, #4263eb) !important;
        border: none !important;
        border-radius: 4px !important;
        padding: 6px 12px !important;
        color: white !important;
        font-size: 13px !important;
        cursor: pointer !important;
        transition: all 0.2s !important;
        text-align: center !important;
        white-space: nowrap !important;
        pointer-events: auto !important;
        position: relative;
        z-index: 10051;
        min-width: 100px !important;
        box-sizing: border-box;
    }

    .sub-btn:hover {
        background: linear-gradient(45deg, #4263eb, #364fc7) !important;
        transform: translateY(-1px) !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
    }

    .cr-btn.disabled-temp {
        pointer-events: none !important;
        opacity: 0.7;
        filter: grayscale(0.5);
    }

    #goToTopMuLi {
        position: absolute !important;
        top: -10px !important;
        left: -10px !important;
        width: 25px !important;
        height: 25px !important;
        border-radius: 50% !important;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        color: white !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 14px !important;
        font-weight: bold !important;
        cursor: pointer !important;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4) !important;
        border: 3px solid white !important;
        z-index: 10000 !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        animation: pulse 2s infinite !important;
    }

    #goToTopMuLi:hover {
        transform: scale(1.15) rotate(360deg) !important;
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6) !important;
        background: linear-gradient(135deg, #764ba2 0%, #667eea 100%) !important;
    }

    @keyframes pulse {
        0% { box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); }
        50% { box-shadow: 0 4px 25px rgba(102, 126, 234, 0.6); }
        100% { box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); }
    }

    #dockToggleMuLi {
        position: absolute !important;
        top: -10px !important;
        right: -10px !important;
        width: 28px !important;
        height: 28px !important;
        border-radius: 50% !important;
        background: linear-gradient(135deg, #2b8a3e 0%, #20c997 100%) !important;
        color: white !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 14px !important;
        font-weight: bold !important;
        cursor: pointer !important;
        box-shadow: 0 4px 15px rgba(32, 201, 151, 0.4) !important;
        border: 3px solid white !important;
        z-index: 10000 !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }

    #dockToggleMuLi:hover {
        transform: scale(1.08) !important;
        box-shadow: 0 6px 20px rgba(32, 201, 151, 0.6) !important;
        background: linear-gradient(135deg, #20c997 0%, #2b8a3e 100%) !important;
    }

    #quick-actions::before {
        content: '';
        position: absolute;
        top: -10px;
        left: 5px;
        width: 2px;
        height: 10px;
        background: linear-gradient(to top, #667eea, transparent);
        z-index: 9998;
    }

    /* 编辑器样式 */
    #config-editor {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 1000px;
        height: 85vh;
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        z-index: 100001;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    #editor-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 100000;
        backdrop-filter: blur(3px);
    }

    .editor-tabs {
        display: flex;
        background: #f8f9fa;
        border-bottom: 1px solid #e9ecef;
    }

    .editor-tab {
        padding: 12px 24px;
        border: none;
        background: none;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        color: #6c757d;
        border-bottom: 2px solid transparent;
        transition: all 0.2s;
    }

    .editor-tab.active {
        color: #667eea;
        border-bottom-color: #667eea;
    }

    .editor-content {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .tab-pane {
        display: none;
        flex: 1;
        overflow: hidden;
        flex-direction: column;
    }

    .tab-pane.active {
        display: flex;
    }

    .editor-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .editor-footer {
        padding: 16px 20px;
        background: #f8f9fa;
        border-top: 1px solid #e9ecef;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }

    .editor-btn {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        min-width: 100px;
    }

    .editor-btn:hover {
        opacity: 0.9;
        transform: translateY(-1px);
    }

    .json-editor-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 20px;
        gap: 15px;
    }

    #json-editor {
        flex: 1;
        padding: 15px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-family: 'Courier New', monospace;
        font-size: 14px;
        line-height: 1.5;
        resize: none;
        outline: none;
    }

    .json-error {
        padding: 10px;
        border-radius: 4px;
        font-size: 12px;
        display: none;
    }

    .json-error.error {
        display: block;
        background: #ffe3e3;
        color: #c92a2a;
    }

    .json-error.success {
        display: block;
        background: #d3f9d8;
        color: #2b8a3e;
    }

    .visual-editor-area {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .buttons-list {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
    }

    .muli-button-form {
        background: #f8f9fa;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
        border: 1px solid #e9ecef;
    }

    .button-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 1px solid #dee2e6;
    }

    .fieldset {
        border: 1px solid #dee2e6;
        border-radius: 6px;
        padding: 15px;
        margin-bottom: 15px;
    }

    .fieldset legend {
        padding: 0 10px;
        font-weight: 500;
        color: #495057;
        font-size: 14px;
    }

    .form-group {
        margin-bottom: 12px;
    }

    .form-label {
        display: block;
        margin-bottom: 6px;
        font-size: 13px;
        font-weight: 500;
        color: #495057;
    }

    .form-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        box-sizing: border-box;
    }

    .form-input:focus {
        border-color: #667eea;
        outline: none;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .preview-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 20px;
        overflow-y: auto;
    }

    .preview-container {
        flex: 1;
        background: #f8f9fa;
        border-radius: 8px;
        padding: 20px;
        min-height: 200px;
        border: 1px solid #e9ecef;
        overflow-y: auto;
    }

    .sub-buttons-preview {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 10px;
        padding: 10px;
        background: rgba(255,255,255,0.8);
        border-radius: 6px;
        border: 1px dashed #ddd;
    }

    .sub-btn-preview {
        background: linear-gradient(45deg, #5c7cfa, #4263eb);
        border: none;
        border-radius: 4px;
        padding: 4px 8px;
        color: white;
        font-size: 11px;
        white-space: nowrap;
    }

    .add-child-btn {
        padding: 6px 12px;
        background: #e9ecef;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        color: #495057;
        font-size: 13px;
        cursor: pointer;
        margin-top: 10px;
    }

    .child-button-form {
        background: white;
        border: 1px solid #dee2e6;
        border-radius: 6px;
        padding: 15px;
        margin-bottom: 10px;
        position: relative;
    }

    .remove-child-btn {
        position: absolute;
        top: 10px;
        right: 10px;
        background: none;
        border: none;
        color: #ff6b6b;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .remove-child-btn:hover {
        background: #ffe3e3;
    }

    .children-list {
        margin-top: 10px;
    }

    .no-children {
        text-align: center;
        color: #6c757d;
        font-size: 13px;
        padding: 20px;
        background: rgba(255,255,255,0.5);
        border-radius: 6px;
        border: 1px dashed #dee2e6;
    }

    .preview-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 10px;
    }

    .preview-info {
        margin-top: 20px;
        padding: 15px;
        background: white;
        border-radius: 6px;
        border: 1px solid #e9ecef;
        font-size: 12px;
        color: #6c757d;
    }

    /* 编辑按钮样式 */
    #edit-quick-actions {
        position: fixed;
        bottom: 10px;
        right: 10px;
        width: 45px;
        height: 45px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        font-size: 18px;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        user-select: none;
    }

    #edit-quick-actions:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
    }

    /* 提示动画 */
    #editor-toast-style {
        display: none;
    }

    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }

    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`);


    // ================== 拖拽功能 ==================
    // 自带记忆功能
    class DragManager {
        constructor(container) {
            this.container = container;
            this.isDragging = false;
            this.startX = 0;
            this.startY = 0;
            this.startLeft = 0;
            this.startTop = 0;

            this.init();
        }

        init() {
            // 创建拖拽手柄
            this.createDragHandle();

            // 加载保存的位置
            this.loadPosition();

            // 添加事件监听
            this.addEventListeners();
        }

        createDragHandle() {
            const handle = document.createElement('div');
            handle.className = 'drag-handle';
            handle.innerHTML = '☰ 拖拽 双击复位';
            this.container.appendChild(handle);

            // 双击手柄复位
            handle.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.resetPosition();
            });
        }

        addEventListeners() {
            // 手柄按下开始拖拽
            const handle = this.container.querySelector('.drag-handle');
            handle.addEventListener('mousedown', this.startDrag.bind(this));

            // 整个容器也可以拖拽（但优先响应内部按钮点击）
            this.container.addEventListener('mousedown', (e) => {
                // 如果点击的不是按钮或返回顶部按钮，开始拖拽
                if (!e.target.classList.contains('cr-btn') &&
                    !e.target.classList.contains('sub-btn') &&
                    e.target.id !== 'goToTopMuLi' &&
                    !e.target.closest('.cr-btn') &&
                    !e.target.closest('.sub-btn')) {
                    this.startDrag(e);
                }
            });

            // 文档级别的事件监听
            document.addEventListener('mousemove', this.drag.bind(this));
            document.addEventListener('mouseup', this.stopDrag.bind(this));

            // 防止拖拽时选中文本
            document.addEventListener('selectstart', (e) => {
                if (this.isDragging) {
                    e.preventDefault();
                }
            });
        }

        startDrag(e) {
            // 停靠模式不允许拖拽
            if (this.container.classList.contains('docked')) return;
            this.isDragging = true;
            this.container.classList.add('dragging');

            // 获取当前位置
            const rect = this.container.getBoundingClientRect();
            this.startX = e.clientX;
            this.startY = e.clientY;
            this.startLeft = rect.left;
            this.startTop = rect.top;

            // 防止默认行为
            e.preventDefault();
            e.stopPropagation();
        }

        drag(e) {
            // 停靠模式不允许拖拽
            if (this.container.classList.contains('docked')) return;
            if (!this.isDragging) return;

            // 计算移动距离
            const dx = e.clientX - this.startX;
            const dy = e.clientY - this.startY;

            // 应用新位置
            const newLeft = this.startLeft + dx;
            const newTop = this.startTop + dy;

            // 边界检查（确保不完全移出窗口）
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const containerWidth = this.container.offsetWidth;
            const containerHeight = this.container.offsetHeight;

            const boundedLeft = Math.max(0, Math.min(newLeft, windowWidth - containerWidth));
            const boundedTop = Math.max(0, Math.min(newTop, windowHeight - containerHeight));

            this.container.style.left = boundedLeft + 'px';
            this.container.style.top = boundedTop + 'px';

            // 防止默认行为
            e.preventDefault();
        }

        stopDrag() {
            // 停靠模式不保存位置
            if (this.container.classList.contains('docked')) return;
            if (!this.isDragging) return;

            this.isDragging = false;
            this.container.classList.remove('dragging');

            // 保存位置
            this.savePosition();
        }

        savePosition() {
            // 停靠模式不保存位置
            if (this.container.classList.contains('docked')) return;
            const rect = this.container.getBoundingClientRect();
            const position = {
                x: rect.left,
                y: rect.top,
                timestamp: Date.now()
            };

            try {
                muliSpecialStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
            } catch (e) {
                console.warn('无法保存位置到本地存储:', e);
            }
        }

        loadPosition() {
            try {
                // 停靠模式不加载位置
                if (this.container.classList.contains('docked')) return;
                const saved = muliSpecialStorage.getItem(POSITION_STORAGE_KEY);
                if (saved) {
                    const position = JSON.parse(saved);

                    // 检查位置是否合理（在可视区域内）
                    const windowWidth = window.innerWidth;
                    const windowHeight = window.innerHeight;
                    const containerWidth = this.container.offsetWidth;
                    const containerHeight = this.container.offsetHeight;

                    // 如果位置有效且时间在24小时内，使用保存的位置
                    if (position &&
                        position.x !== undefined &&
                        position.y !== undefined &&
                        (!position.timestamp || Date.now() - position.timestamp < 24 * 60 * 60 * 1000) &&
                        position.x >= 0 && position.x <= windowWidth - containerWidth &&
                        position.y >= 0 && position.y <= windowHeight - containerHeight) {

                        this.container.style.left = position.x + 'px';
                        this.container.style.top = position.y + 'px';
                        return;
                    }
                }
            } catch (e) {
                console.warn('无法加载保存的位置:', e);
            }

            // 使用默认位置
            this.resetPosition();
        }

        resetPosition() {
            // 停靠模式不复位位置
            if (this.container.classList.contains('docked')) return;
            this.container.style.left = DEFAULT_POSITION.x + 'px';
            this.container.style.top = DEFAULT_POSITION.y + 'px';
            this.savePosition();

            // 显示提示
            muliShowToast('已复位到默认位置', 1500, 'success');
        }
    }

    // ================== 编辑器功能 ==================
    // 红包类型
    let RED_PACKET_TYPES = [
        '拼手气红包',
        '普通红包',
        '专属红包',
        '心跳红包',
        '猜拳红包'
    ];

    let RED_PACKET_GESTURE = [
        '无',
        '石头',
        '剪刀',
        '布'
    ];
    // 动作函数模板
    let ACTION_TEMPLATES = {
        sendMsg: {
            params: [
                { name: 'delay', type: 'number', label: '延迟(ms)，多条消息时才有效', defaultValue: 0 },
                { name: 'message', type: 'msg', label: '消息内容（多条逗号隔开）', required: true }
            ]
        },
        sendIconTextMsg: {
            params: [
                { name: 'message', type: 'text', label: '消息|头像|背景|字体（|隔开参数，null为使用默认参数）', defaultValue: '消息|null|null|null', required: true }
            ]
        },
        promptAndIconTextMsg: {
            params: [ {name: 'defaultValue', type: 'text', label: '默认参数，消息|头像|背景|字体（|隔开参数，null为使用默认参数）', placeholder: '消息|头像|背景|字体（|隔开参数，null为使用默认参数）', defaultValue: '消息|null|null|null', required: false} ]
        },
        muliRefreshPage: {
            params: [
                { name: 'message', type: 'text', label: '刷新提示消息', required: false },
                { name: 'delay', type: 'number', label: '延迟(ms)', defaultValue: 100 }
            ]
        },
        fetchPrivate: {
            params: [
                { name: 'endpoint', type: 'text', label: 'API路径（多条逗号隔开）', required: true }
            ]
        },
        promptAndSend: {
            params: [
                { name: 'promptText', type: 'text', label: '提示文本', defaultValue: '请输入' },
                { name: 'defaultValue', type: 'text', label: '默认值', required: false },
                { name: 'actionCode', type: 'code', label: '发送内容', placeholder: '消息 + ${input}', required: true }
            ]
        },
        sendRedPacketMsg: {
            params: [
                { name: 'type', type: 'select', label: '红包类型', options: RED_PACKET_TYPES, required: false},
                { name: 'money', type: 'number', label: '金额', defaultValue: 0, required: false },
                { name: 'count', type: 'number', label: '红包数量', defaultValue: 1, required: false },
                { name: 'msg', type: 'text', label: '红包信息', defaultValue: '摸鱼者事尽成', required: false },
                { name: 'recivers', type: 'text', label: '专属用户名（逗号隔开，非专属可不填）', required: false },
                { name: 'gesture', type: 'select', label: '石头，剪刀，布（非猜拳可不填）', options: RED_PACKET_GESTURE, required: false },
            ]
        }
    };
    const COLOR_OPTIONS = [
        { value: 'btn-blue', label: '蓝色', color: '#339af0' },
        { value: 'btn-red', label: '红色', color: '#ff6b6b' },
        { value: 'btn-warn', label: '橙色', color: '#ff922b' },
        { value: 'btn-green', label: '绿色', color: '#51cf66' }
    ];


    function createEditButton() {
        const editBtn = document.createElement('div');
        editBtn.id = 'edit-quick-actions';
        editBtn.innerHTML = '✎';
        editBtn.title = '编辑按钮配置';

        editBtn.addEventListener('click', showEditor);
        document.body.appendChild(editBtn);
    }

    function showEditor() {
        const existingEditor = document.getElementById('config-editor');
        if (existingEditor) {
            existingEditor.remove();
            const overlay = document.getElementById('editor-overlay');
            if (overlay) overlay.remove();
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'editor-overlay';
        overlay.addEventListener('click', () => closeEditor());
        document.body.appendChild(overlay);

        const editor = document.createElement('div');
        editor.id = 'config-editor';

        activeConfig = JSON.parse(JSON.stringify(FINAL_BUTTONS_CONFIG));

        const header = document.createElement('div');
        header.className = 'editor-header';
        header.innerHTML = `
            <h2 style="margin: 0; font-size: 18px;">快捷按钮配置编辑器</h2>
            <button id="close-editor" style="
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            ">×</button>
        `;

        header.querySelector('#close-editor').addEventListener('click', closeEditor);
        header.querySelector('#close-editor').addEventListener('mouseenter', function () {
            this.style.background = 'rgba(255,255,255,0.2)';
        });
        header.querySelector('#close-editor').addEventListener('mouseleave', function () {
            this.style.background = 'none';
        });

        const tabs = document.createElement('div');
        tabs.className = 'editor-tabs';
        tabs.innerHTML = `
            <button class="editor-tab active" data-tab="json">JSON编辑</button>
            <button class="editor-tab" data-tab="visual">可视化编辑</button>
            <button class="editor-tab" data-tab="preview">预览</button>
        `;

        const content = document.createElement('div');
        content.className = 'editor-content';

        const jsonPane = createJsonPane();
        const visualPane = createVisualPane();
        const previewPane = createPreviewPane();

        content.appendChild(jsonPane);
        content.appendChild(visualPane);
        content.appendChild(previewPane);

        const footer = document.createElement('div');
        footer.className = 'editor-footer';
        footer.innerHTML = `
            <button class="editor-btn" id="save-config" style="background: #51cf66;">💾 保存配置</button>
            <button class="editor-btn" id="reset-config" style="background: #ff922b;">🔄 重置默认</button>
            <button class="editor-btn" id="cancel-config" style="background: #ff6b6b;">❌ 取消</button>
        `;

        editor.appendChild(header);
        editor.appendChild(tabs);
        editor.appendChild(content);
        editor.appendChild(footer);
        document.body.appendChild(editor);

        setupEventListeners();
    }

    function closeEditor() {
        const editor = document.getElementById('config-editor');
        const overlay = document.getElementById('editor-overlay');

        if (editor) editor.remove();
        if (overlay) overlay.remove();
    }

    function createJsonPane() {
        const pane = document.createElement('div');
        pane.className = 'tab-pane active';
        pane.id = 'json-pane';

        const area = document.createElement('div');
        area.className = 'json-editor-area';

        area.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin: 0; color: #495057; font-size: 16px;">JSON配置编辑器</h3>
                <div style="display: flex; gap: 8px;">
                    <button id="format-json" style="
                        padding: 6px 12px;
                        background: #667eea;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        font-size: 12px;
                        cursor: pointer;
                        white-space: nowrap;
                    ">格式化JSON</button>
                    <button id="format-json-export" style="
                        padding: 6px 12px;
                        background: #4CAF50;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        font-size: 12px;
                        cursor: pointer;
                        white-space: nowrap;
                    ">导出配置</button>
                    <button id="format-json-import" style="
                        padding: 6px 12px;
                        background: #ff9800;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        font-size: 12px;
                        cursor: pointer;
                        white-space: nowrap;
                    ">导入配置</button>
                </div>
            </div>
            <textarea id="json-editor">${ConfigSerializer.serialize(activeConfig)}</textarea>
            <div id="json-error" class="json-error"></div>
        `;

        pane.appendChild(area);
        return pane;
    }

    function createVisualPane() {
        const pane = document.createElement('div');
        pane.className = 'tab-pane';
        pane.id = 'visual-pane';

        const area = document.createElement('div');
        area.className = 'visual-editor-area';

        area.innerHTML = `
            <div style="padding: 20px; border-bottom: 1px solid #e9ecef;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: #495057; font-size: 16px;">可视化编辑器</h3>
                    <button id="add-button" style="
                        padding: 8px 16px;
                        background: #667eea;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        font-size: 13px;
                        cursor: pointer;
                    ">+ 添加按钮</button>
                </div>
                <p style="margin: 10px 0 0 0; color: #6c757d; font-size: 12px;">
                    点击按钮配置详细信息，可以添加子按钮（最多一级）
                </p>
            </div>
            <div class="buttons-list" id="buttons-list"></div>
        `;

        pane.appendChild(area);
        return pane;
    }

    function createPreviewPane() {
        const pane = document.createElement('div');
        pane.className = 'tab-pane';
        pane.id = 'preview-pane';

        const area = document.createElement('div');
        area.className = 'preview-area';

        area.innerHTML = `
            <h3 style="margin: 0 0 20px 0; color: #495057; font-size: 16px;">按钮预览</h3>
            <div class="preview-container" id="preview-container"></div>
            <div class="preview-info" id="preview-info"></div>
        `;

        pane.appendChild(area);
        return pane;
    }
    // tab切换事件
    function setupEventListeners() {
        document.querySelectorAll('.editor-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;

                document.querySelectorAll('.editor-tab').forEach(t => {
                    t.classList.remove('active');
                });
                tab.classList.add('active');

                document.querySelectorAll('.tab-pane').forEach(pane => {
                    pane.classList.remove('active');
                });
                document.getElementById(`${tabName}-pane`).classList.add('active');

                if (tabName === 'visual') {
                    updateVisualEditor();
                } else if (tabName === 'preview') {
                    updatePreview();
                }
            });
        });

        document.getElementById('format-json').addEventListener('click', formatJson);
        document.getElementById('json-editor').addEventListener('input', validateJson);
        document.getElementById('add-button').addEventListener('click', () => addButtonForm());
        document.getElementById('save-config').addEventListener('click', saveConfig);
        document.getElementById('reset-config').addEventListener('click', resetConfig);
        document.getElementById('cancel-config').addEventListener('click', closeEditor);

        document.getElementById('format-json-export').addEventListener('click', exportConfig);
        document.getElementById('format-json-import').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.addEventListener('change', handleImportConfig);
            input.click();
        });

        updateVisualEditor();
        updatePreview();
    }

    function formatJson() {
        const editor = document.getElementById('json-editor');
        const errorDiv = document.getElementById('json-error');

        try {
            const json = JSON.parse(editor.value);
            editor.value = JSON.stringify(json, null, 2);
            errorDiv.textContent = 'JSON格式正确';
            errorDiv.className = 'json-error success';

            activeConfig = ConfigSerializer.deserialize(editor.value);
        } catch (e) {
            errorDiv.textContent = 'JSON格式错误: ' + e.message;
            errorDiv.className = 'json-error error';
        }
    }

    function validateJson() {
        const editor = document.getElementById('json-editor');
        const errorDiv = document.getElementById('json-error');

        try {
            JSON.parse(editor.value);
            errorDiv.textContent = '';
            errorDiv.className = 'json-error';

            activeConfig = ConfigSerializer.deserialize(editor.value);
        } catch (e) {
            errorDiv.textContent = 'JSON格式错误: ' + e.message;
            errorDiv.className = 'json-error error';
        }
    }

    function updateVisualEditor() {
        const buttonsList = document.getElementById('buttons-list');
        if (!buttonsList) return;

        buttonsList.innerHTML = '';

        activeConfig.forEach((button, index) => {
            buttonsList.appendChild(createButtonForm(button, index));
        });

        if (activeConfig.length === 0) {
            buttonsList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #6c757d;">
                    <p>还没有任何按钮配置</p>
                    <p>点击上方"添加按钮"开始创建</p>
                </div>
            `;
        }
    }
    //新增按钮
    function createButtonForm(button, index) {
        const form = document.createElement('div');
        form.className = 'muli-button-form';
        form.dataset.index = index;

        const header = document.createElement('div');
        header.className = 'button-header';
        header.innerHTML = `
            <h3 style="margin: 0; font-size: 14px;">按钮 ${index + 1}: ${button.text || '新按钮'}</h3>
            <div style="display: flex; gap: 5px;">
                <button class="move-up-btn" style="
                    padding: 4px 8px;
                    background: #e9ecef;
                    border: 1px solid #dee2e6;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                ">↑</button>
                <button class="move-down-btn" style="
                    padding: 4px 8px;
                    background: #e9ecef;
                    border: 1px solid #dee2e6;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                ">↓</button>
                <button class="delete-btn" style="
                    padding: 4px 8px;
                    background: #ff6b6b;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                ">删除</button>
            </div>
        `;

        const basicSettings = document.createElement('fieldset');
        basicSettings.className = 'fieldset';
        basicSettings.innerHTML = '<legend>基本设置</legend>';

        const textGroup = document.createElement('div');
        textGroup.className = 'form-group';
        textGroup.innerHTML = `
            <label class="form-label">按钮文本 *</label>
            <input type="text" class="form-input" name="text" value="${button.text || ''}"
                   placeholder="例如: 冰冰指令" required>
        `;

        const colorGroup = document.createElement('div');
        colorGroup.className = 'form-group';
        colorGroup.innerHTML = `
            <label class="form-label">按钮颜色</label>
            <select class="form-input" name="color">
                ${COLOR_OPTIONS.map(opt => `
                    <option value="${opt.value}" ${button.color === opt.value ? 'selected' : ''}>
                        ${opt.label}
                    </option>
                `).join('')}
            </select>
        `;

        const cooldownGroup = document.createElement('div');
        cooldownGroup.className = 'form-group';
        cooldownGroup.innerHTML = `
            <label class="form-label">冷却时间(秒)</label>
            <input type="number" class="form-input" name="cooldown"
                   value="${button.cooldown || ''}" placeholder="0表示无冷却" min="0">
        `;

        const cooldownChildrenGroup = document.createElement('div');
        cooldownChildrenGroup.className = 'form-group';
        cooldownChildrenGroup.innerHTML = `
            <label class="form-label">子按钮是否联动冷却</label>
            <input type="text" class="form-input" name="cooldownChildren"
                   value="${typeof button.cooldownChildren === 'string' ? button.cooldownChildren : (button.cooldownChildren ? 'true' : '')}"
                   placeholder="不填为不联动，true或者数字逗号隔开为全部联动或指定联动">
        `;

        const refreshGroup = document.createElement('div');
        refreshGroup.className = 'form-group';
        refreshGroup.innerHTML = `
            <label class="form-label">刷新后提示消息</label>
            <input type="text" class="form-input" name="muliRefresh"
                   value="${typeof button.muliRefresh === 'string' ? button.muliRefresh : (button.muliRefresh ? 'true' : '')}"
                   placeholder="留空不刷新，填true或提示消息">
        `;

        basicSettings.appendChild(textGroup);
        basicSettings.appendChild(colorGroup);
        basicSettings.appendChild(cooldownGroup);
        basicSettings.appendChild(cooldownChildrenGroup);
        basicSettings.appendChild(refreshGroup);

        const actionSettings = document.createElement('fieldset');
        actionSettings.className = 'fieldset';
        actionSettings.innerHTML = '<legend>点击动作</legend>';

        const actionTypeGroup = document.createElement('div');
        actionTypeGroup.className = 'form-group';
        actionTypeGroup.innerHTML = `
            <label class="form-label">动作类型</label>
            <select class="form-input" name="actionType">
                <option value="">无</option>
                <option value="sendMsg" ${button.action?.type === 'sendMsg' ? 'selected' : ''}>发送消息</option>
                <option value="sendIconTextMsg" ${button.action?.type === 'sendIconTextMsg' ? 'selected' : ''}>发送图标文字消息</option>
                <option value="promptAndIconTextMsg" ${button.action?.type === 'promptAndIconTextMsg' ? 'selected' : ''}>自定义发送图标文字消息</option>
                <option value="promptAndSend" ${button.action?.type === 'promptAndSend' ? 'selected' : ''}>输入框+发送</option>
                <option value="fetchPrivate" ${button.action?.type === 'fetchPrivate' ? 'selected' : ''}>调用私信API</option>
                <option value="sendRedPacketMsg" ${button.action?.type === 'sendRedPacketMsg' ? 'selected' : ''}>发送红包</option>
            </select>
        `;

        const actionParams = document.createElement('div');
        actionParams.className = 'action-params';
        actionParams.style.marginTop = '10px';

        actionSettings.appendChild(actionTypeGroup);
        actionSettings.appendChild(actionParams);

        const childrenSettings = document.createElement('fieldset');
        childrenSettings.className = 'fieldset';
        childrenSettings.innerHTML = '<legend>子按钮设置</legend>';

        const childrenList = document.createElement('div');
        childrenList.className = 'children-list';

        const addChildBtn = document.createElement('button');
        addChildBtn.type = 'button';
        addChildBtn.className = 'add-child-btn';
        addChildBtn.textContent = '+ 添加子按钮';

        childrenSettings.appendChild(childrenList);
        childrenSettings.appendChild(addChildBtn);

        form.appendChild(header);
        form.appendChild(basicSettings);
        form.appendChild(actionSettings);
        form.appendChild(childrenSettings);

        updateActionParams(actionParams, button.action?.type || 'sendMsg', button);

        if (button.children && button.children.length > 0) {
            button.children.forEach((child, childIndex) => {
                addChildButton(childrenList, child, childIndex);
            });
        } else {
            childrenList.innerHTML = '<div class="no-children">暂无子按钮，点击上方按钮添加</div>';
        }

        setupButtonFormEvents(form, index);

        return form;
    }

    // 渲染可视化编辑界面
    function updateActionParams(container, type, button) {
        container.innerHTML = '';

        if (!type) return;

        const actionTemplates = ACTION_TEMPLATES;

        const template = actionTemplates[type];
        if (!template) return;

        const currentParams = button.action && button.action.params ? button.action.params : {};

        template.params.forEach(param => {
            const group = document.createElement('div');
            group.className = 'form-group';

            let value = '';
            if (param.type === 'code') {
                if (typeof currentParams === 'object' && currentParams[param.name]) {
                    value = currentParams[param.name];
                } else if (typeof currentParams === 'string' && param.name === 'code') {
                    value = currentParams;
                }

                group.innerHTML = `
                    <label class="form-label">${param.label}${param.required ? ' *' : ''}</label>
                    <textarea class="form-input" name="action_${param.name}"
                              rows="4" placeholder="${param.placeholder || ''}"
                              ${param.required ? 'required' : ''}>${value}</textarea>
                `;
            } else if (param.type === 'select') {
                if (typeof currentParams === 'object') {
                    value = currentParams[param.name] || param.defaultValue || '';
                } else if (typeof currentParams === 'string') {
                    value = currentParams || param.defaultValue || '';
                } else {
                    value = param.defaultValue || '';
                }

                let tempHtml = `
                    <label class="form-label">${param.label}${param.required ? ' *' : ''}</label>
                    <select class="form-input" name="action_${param.name}"
                              value="${value || ''}"
                              ${param.required ? 'required' : ''}>`;

                for (var option of param.options) {
                    tempHtml += `
                        <option value="${option}" ${value === option ? 'selected' : ''} >${option}</option>
                    `;
                }

                tempHtml += `
                        </select>
                    `;

                group.innerHTML = tempHtml;
            } else if (param.type === 'msg') {
                if (Array.isArray(currentParams)) {
                    value = currentParams.join(',');
                } else if (typeof currentParams === 'object') {
                    value = currentParams[param.name] || param.defaultValue || '';
                } else if (param.name === 'message' && typeof currentParams === 'string') {
                    value = currentParams;
                } else {
                    value = param.defaultValue || '';
                }

                group.innerHTML = `
                    <label class="form-label">${param.label}${param.required ? ' *' : ''}</label>
                    <textarea class="form-input" name="action_${param.name}"
                              rows="2" placeholder="${param.placeholder || ''}"
                              ${param.required ? 'required' : ''}>${value}</textarea>
                `;
            } else {
                if (Array.isArray(currentParams)) {
                    value = currentParams.join(',');
                } else if (typeof currentParams === 'object') {
                    value = currentParams[param.name] || param.defaultValue || '';
                } else if (param.name === 'message' && typeof currentParams === 'string') {
                    value = currentParams;
                } else {
                    value = param.defaultValue || '';
                }

                // 特殊处理
                if (type ==  'sendMsg' && param.name == 'delay') {
                    value = button.action.delay || null;
                }

                group.innerHTML = `
                    <label class="form-label">${param.label}${param.required ? ' *' : ''}</label>
                    <input type="${param.type}" class="form-input" name="action_${param.name}"
                           value="${value}"
                           placeholder="${param.placeholder || ''}"
                           ${param.required ? 'required' : ''}>
                `;

            }

            container.appendChild(group);
        });
    }
    // 添加子按钮
    function addChildButton(container, childData = {}, childIndex = 0) {
        const noChildren = container.querySelector('.no-children');
        if (noChildren) noChildren.remove();

        const childForm = document.createElement('div');
        childForm.className = 'child-button-form';

        childForm.innerHTML = `
            <button class="remove-child-btn" type="button">×</button>
            <div class="form-group">
                <label class="form-label">子按钮文本 *</label>
                <input type="text" class="form-input" name="text" value="${childData.text || ''}" placeholder="例如: 打劫" required>
            </div>
            <div class="form-group">
                <label class="form-label">动作类型</label>
                <select class="form-input" name="actionType">
                    <option value="">无</option>
                    <option value="sendMsg" ${childData.action?.type === 'sendMsg' ? 'selected' : ''}>发送消息</option>
                    <option value="sendIconTextMsg" ${childData.action?.type === 'sendIconTextMsg' ? 'selected' : ''}>发送图标文字消息</option>
                    <option value="promptAndIconTextMsg" ${childData.action?.type === 'promptAndIconTextMsg' ? 'selected' : ''}>自定义发送图标文字消息</option>
                    <option value="promptAndSend" ${childData.action?.type === 'promptAndSend' ? 'selected' : ''}>输入框+发送</option>
                    <option value="fetchPrivate" ${childData.action?.type === 'fetchPrivate' ? 'selected' : ''}>调用私信API</option>
                    <option value="sendRedPacketMsg" ${childData.action?.type === 'sendRedPacketMsg' ? 'selected' : ''}>发送红包</option>
                </select>
            </div>
            <div class="form-group action-params"></div>
            <div class="form-group">
                <label class="form-label">冷却时间(秒)</label>
                <input type="number" class="form-input" name="cooldown" value="${childData.cooldown || ''}" placeholder="0表示无冷却" min="0">
            </div>
            <div class="form-group">
                <label class="form-label">刷新后提示消息</label>
                <input type="text" class="form-input" name="muliRefresh"
                       value="${typeof childData.muliRefresh === 'string' ? childData.muliRefresh : (childData.muliRefresh ? 'true' : '')}"
                       placeholder="留空不刷新，填true或提示消息">
            </div>
        `;

        const paramsContainer = childForm.querySelector('.action-params');
        updateChildActionParams(paramsContainer, childData.action?.type || 'sendMsg', childData);

        childForm.querySelector('[name="actionType"]').addEventListener('change', (e) => {
            updateChildActionParams(paramsContainer, e.target.value, childData);
        });

        childForm.querySelector('.remove-child-btn').addEventListener('click', () => {
            childForm.remove();
            //保存可视化编辑
            collectVisualEditorData();
            if (container.children.length === 0) {
                container.innerHTML = '<div class="no-children">暂无子按钮，点击上方按钮添加</div>';
            }
        });

        container.appendChild(childForm);
    }

    function updateChildActionParams(container, type, childData) {
        container.innerHTML = '';

        const actionTemplates = ACTION_TEMPLATES;

        const template = actionTemplates[type];
        if (!template) return;

        const currentParams = childData.action && childData.action.params ? childData.action.params : {};

        template.params.forEach(param => {
            const group = document.createElement('div');
            group.className = 'form-group';

            let value = '';
            if (param.type === 'code') {
                if (typeof currentParams === 'object' && currentParams[param.name]) {
                    value = currentParams[param.name];
                } else if (typeof currentParams === 'string' && param.name === 'code') {
                    value = currentParams;
                }

                group.innerHTML = `
                    <label class="form-label">${param.label}${param.required ? ' *' : ''}</label>
                    <textarea class="form-input" name="action_${param.name}"
                              rows="3" placeholder="${param.placeholder || ''}"
                              ${param.required ? 'required' : ''}>${value}</textarea>
                `;
            } else if (param.type === 'msg') {
                if (Array.isArray(currentParams)) {
                    value = currentParams.join(',');
                } else if (typeof currentParams === 'object') {
                    value = currentParams[param.name] || param.defaultValue || '';
                } else if (param.name === 'message' && typeof currentParams === 'string') {
                    value = currentParams;
                } else {
                    value = param.defaultValue || '';
                }

                group.innerHTML = `
                    <label class="form-label">${param.label}${param.required ? ' *' : ''}</label>
                    <textarea class="form-input" name="action_${param.name}"
                              rows="2" placeholder="${param.placeholder || ''}"
                              ${param.required ? 'required' : ''}>${value}</textarea>
                `;
            } else if (param.type === 'select') {
                if (typeof currentParams === 'object') {
                    value = currentParams[param.name] || param.defaultValue || '';
                } else if (typeof currentParams === 'string') {
                    value = currentParams || param.defaultValue || '';
                } else {
                    value = param.defaultValue || '';
                }

                let tempHtml = `
                    <label class="form-label">${param.label}${param.required ? ' *' : ''}</label>
                    <select class="form-input" name="action_${param.name}"
                              value="${value || ''}"
                              ${param.required ? 'required' : ''}>`;

                for (var option of param.options) {
                    tempHtml += `
                        <option value="${option}" ${value === option ? 'selected' : ''} >${option}</option>
                    `;
                }

                tempHtml += `
                        </select>
                    `;

                group.innerHTML = tempHtml;
            } else {
                if (Array.isArray(currentParams)) {
                    value = currentParams.join(',');
                } else if (typeof currentParams === 'object') {
                    value = currentParams[param.name] || param.defaultValue || '';
                } else if (param.name === 'message' && typeof currentParams === 'string') {
                    value = currentParams;
                } else {
                    value = param.defaultValue || '';
                }

                // 特殊处理
                if (type ==  'sendMsg' && param.name == 'delay') {
                    value = childData.action.delay || null;
                }

                group.innerHTML = `
                    <label class="form-label">${param.label}${param.required ? ' *' : ''}</label>
                    <input type="${param.type}" class="form-input" name="action_${param.name}"
                           value="${value}"
                           placeholder="${param.placeholder || ''}"
                           ${param.required ? 'required' : ''}>
                `;
            }

            container.appendChild(group);
        });
    }

    function setupButtonFormEvents(form, index) {
        form.querySelector('[name="actionType"]')?.addEventListener('change', (e) => {
            const paramsContainer = form.querySelector('.action-params');
            const buttonData = activeConfig[index] || {};
            updateActionParams(paramsContainer, e.target.value, buttonData);
        });

        form.querySelector('.delete-btn').addEventListener('click', () => {
            if (confirm('确定删除这个按钮吗？')) {
                activeConfig.splice(index, 1);
                updateVisualEditor();
                updatePreview();
                updateJsonEditor();
                //保存可视化编辑
                collectVisualEditorData();
            }
        });

        form.querySelector('.move-up-btn').addEventListener('click', () => {
            if (index > 0) {
                [activeConfig[index], activeConfig[index - 1]] = [activeConfig[index - 1], activeConfig[index]];
                updateVisualEditor();
                updatePreview();
                updateJsonEditor();
            }
        });

        form.querySelector('.move-down-btn').addEventListener('click', () => {
            if (index < activeConfig.length - 1) {
                [activeConfig[index], activeConfig[index + 1]] = [activeConfig[index + 1], activeConfig[index]];
                updateVisualEditor();
                updatePreview();
                updateJsonEditor();
            }
        });

        form.querySelector('.add-child-btn').addEventListener('click', () => {
            const childrenList = form.querySelector('.children-list');
            addChildButton(childrenList);
        });


    }

    function handleFormChange(form, index, changedElement) {
        // 实时更新 activeConfig
        if (!activeConfig[index]) return;

        const formData = new FormData(form);
        const buttonData = {};

        form.querySelectorAll('input, select, textarea').forEach(element => {
            if (element.name) {
                if (element.type === 'checkbox' || element.type === 'radio') {
                    buttonData[element.name] = element.checked;
                } else {
                    buttonData[element.name] = element.value;
                }
            }
        });

        // 更新按钮数据
        activeConfig[index].text = buttonData.text || '';
        activeConfig[index].color = buttonData.color || 'btn-blue';

        if (buttonData.cooldown && !isNaN(buttonData.cooldown) && parseInt(buttonData.cooldown) > 0) {
            activeConfig[index].cooldown = parseInt(buttonData.cooldown);
        } else {
            delete activeConfig[index].cooldown;
        }

        if (buttonData.muliRefresh) {
            activeConfig[index].muliRefresh = buttonData.muliRefresh === 'true' ? true : buttonData.muliRefresh;
        } else {
            delete activeConfig[index].muliRefresh;
        }

        // 更新动作
        const actionType = buttonData.actionType;
        if (actionType) {
            activeConfig[index].action = { type: actionType };

            const params = {};
            form.querySelectorAll('.action-params input, .action-params textarea').forEach(element => {
                const name = element.name.replace('action_', '');
                params[name] = element.value;
            });

            if ((actionType === 'sendMsg' || actionType === 'sendIconTextMsg') && params.message) {
                activeConfig[index].action.params = params.message;
            } else if (actionType === 'muliRefreshPage') {
                activeConfig[index].action.params = params.message || null;
                if (params.delay) {
                    activeConfig[index].action.params = [params.message || null, parseInt(params.delay) || 100];
                }
            } else if (Object.keys(params).length > 0) {
                activeConfig[index].action.params = params;
            }
        }

        // 更新子按钮
        const childForms = form.querySelectorAll('.child-button-form');
        if (childForms.length > 0) {
            activeConfig[index].children = [];

            childForms.forEach(childForm => {
                const childData = {};
                const childText = childForm.querySelector('[name="text"]')?.value;
                if (!childText?.trim()) return;

                childData.text = childText;

                const childActionType = childForm.querySelector('[name="actionType"]')?.value || 'sendMsg';
                childData.action = { type: childActionType };

                const childCooldown = childForm.querySelector('[name="cooldown"]')?.value;
                if (childCooldown && !isNaN(childCooldown) && parseInt(childCooldown) > 0) {
                    childData.cooldown = parseInt(childCooldown);
                }

                const childRefresh = childForm.querySelector('[name="muliRefresh"]')?.value;
                if (childRefresh) {
                    childData.muliRefresh = childRefresh === 'true' ? true : childRefresh;
                }

                const childParams = {};
                childForm.querySelectorAll('.action-params input, .action-params textarea').forEach(element => {
                    const name = element.name.replace('action_', '');
                    childParams[name] = element.value;
                });

                if ((childCooldown === 'sendMsg' || childCooldown === 'sendIconTextMsg') && childParams.message) {
                    childData.action.params = childParams.message;
                } else if (Object.keys(childParams).length > 0) {
                    childData.action.params = childParams;
                }

                activeConfig[index].children.push(childData);
            });
        } else {
            delete activeConfig[index].children;
        }

        // 更新JSON编辑器
        updateJsonEditor();
    }

    function addButtonForm() {
        const newButton = {
            text: '新按钮',
            color: 'btn-blue',
            action: { type: 'sendMsg', params: '新消息' }
        };

        activeConfig.push(newButton);
        updateVisualEditor();
        updatePreview();
        updateJsonEditor();
    }

    function updatePreview() {
        const container = document.getElementById('preview-container');
        const info = document.getElementById('preview-info');

        if (!container) return;

        container.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'preview-grid';

        activeConfig.forEach((button, index) => {
            const btn = document.createElement('div');
            btn.style.cssText = `
                position: relative;
                background: ${COLOR_OPTIONS.find(c => c.value === button.color)?.color || '#339af0'};
                border-radius: 6px;
                padding: 10px;
                color: white;
                text-align: center;
                font-size: 13px;
                cursor: default;
                user-select: none;
                overflow: hidden;
                min-height: 60px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            btn.innerHTML = `<span>${button.text || '未命名'}</span>`;

            if (button.children && button.children.length > 0) {
                const subButtons = document.createElement('div');
                subButtons.className = 'sub-buttons-preview';

                button.children.forEach(child => {
                    const subBtn = document.createElement('div');
                    subBtn.className = 'sub-btn-preview';
                    subBtn.textContent = child.text || '子按钮';
                    subButtons.appendChild(subBtn);
                });

                btn.appendChild(subButtons);
            }

            grid.appendChild(btn);
        });

        container.appendChild(grid);

        if (info) {
            const hasChildren = activeConfig.some(b => b.children && b.children.length > 0);
            const hasCooldown = activeConfig.some(b => b.cooldown);

            info.innerHTML = `
                <div>共 ${activeConfig.length} 个按钮</div>
                ${hasChildren ? `<div>其中 ${activeConfig.filter(b => b.children?.length).length} 个按钮有子菜单</div>` : ''}
                ${hasCooldown ? `<div>其中 ${activeConfig.filter(b => b.cooldown).length} 个按钮有冷却时间</div>` : ''}
            `;
        }
    }

    function updateJsonEditor() {
        const editor = document.getElementById('json-editor');
        if (editor) {
            editor.value = ConfigSerializer.serialize(activeConfig);
            validateJson();
        }
    }
    // 保存配置
    async function saveConfig() {
        try {
            // 验证配置
            if (!Array.isArray(activeConfig)) {
                throw new Error('配置必须是数组格式');
            }

            // 使用 ConfigSerializer 序列化配置
            const serializedConfig = ConfigSerializer.serialize(activeConfig);
            muliSpecialStorage.setItem(CONFIG_STORAGE_KEY, serializedConfig);

            // 更新最终配置
            FINAL_BUTTONS_CONFIG = JSON.parse(JSON.stringify(activeConfig));

            showToast('配置已保存！请刷新页面生效', 'success');
            closeEditor();
            await muliRefreshPage(true);

        } catch (e) {
            showToast('保存失败: ' + e.message, 'error');
        }
    }

    function resetConfig() {
        if (confirm('确定重置为默认配置吗？当前配置将丢失。')) {
            activeConfig = JSON.parse(JSON.stringify(ORIGINAL_BUTTONS_CONFIG));
            muliSpecialStorage.removeItem(CONFIG_STORAGE_KEY);

            updateVisualEditor();
            updatePreview();
            updateJsonEditor();

            showToast('已重置为默认配置', 'info');
        }
    }

    function exportConfig() {
        const jsonString = ConfigSerializer.serialize(activeConfig);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fishpi_按钮配置备份.json';
        a.click();
        URL.revokeObjectURL(url);

        showToast('配置已导出', 'success');
    }

    function handleImportConfig(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const importedConfig = ConfigSerializer.deserialize(e.target.result);
                activeConfig = importedConfig;

                updateVisualEditor();
                updatePreview();
                updateJsonEditor();

                showToast('配置导入成功！', 'success');
            } catch (error) {
                showToast('导入失败: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.textContent = message;

        const colors = {
            success: '#51cf66',
            error: '#ff6b6b',
            info: '#339af0'
        };

        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 100002;
            animation: slideIn 0.3s ease;
            font-size: 14px;
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 3000);
    }

    // ================== 初始化 ==================
    const DOCK_PREF_KEY = 'fishpi_quick_actions_docked';

    function getDockPreference() {
        try {
            return muliSpecialStorage.getItem(DOCK_PREF_KEY) === 'true';
        } catch (e) {
            return false;
        }
    }

    function setDockPreference(val) {
        try {
            muliSpecialStorage.setItem(DOCK_PREF_KEY, val ? 'true' : 'false');
        } catch (e) {}
    }

    function undockContainer(container) {
        try {
            container.classList.remove('docked');
            document.body.appendChild(container);
            container.style.width = '';
            container.style.removeProperty('grid-template-columns');
            // 恢复到已保存的浮动位置（不强制复位默认值）
            if (container.dragManager) {
                container.dragManager.loadPosition();
            } else {
                // 没有拖拽管理器时，保底设置为默认位置
                container.style.left = DEFAULT_POSITION.x + 'px';
                container.style.top = DEFAULT_POSITION.y + 'px';
            }
            return true;
        } catch (e) {
            console.warn('取消停靠失败:', e);
            return false;
        }
    }

    function applyDockPreference(container) {
        const wantDock = getDockPreference();
        if (wantDock) {
            const ok = dockUnderPersonInfoIfPresent(container);
            if (!ok) {
                // 若无法停靠，回退为浮动
                undockContainer(container);
                setDockPreference(false);
            }
        } else {
            undockContainer(container);
        }
    }
    function dockUnderPersonInfoIfPresent(container) {
        try {
            const side = document.querySelector('div.side');
            if (!side) return false;
            const personInfo = side.querySelector('div.module.person-info');
            if (!personInfo) return false;

            // 将容器移动到 person-info 模块之后
            if (personInfo.parentNode) {
                const next = personInfo.nextSibling;
                if (next) {
                    personInfo.parentNode.insertBefore(container, next);
                } else {
                    personInfo.parentNode.appendChild(container);
                }
            }

            // 打上停靠标记并清理绝对定位痕迹
            container.classList.add('docked');
            container.style.left = '';
            container.style.top = '';
            syncDockedWidth(container, personInfo);
            applyDockedColumnLayout(container);
            return true;
        } catch (e) {
            console.warn('停靠到person-info失败:', e);
            return false;
        }
    }

    function syncDockedWidth(container, anchorEl = null) {
        try {
            const side = document.querySelector('div.side');
            let baseEl = anchorEl || (side ? side.querySelector('div.module') : null);
            if (!baseEl && side) baseEl = side;
            if (!baseEl) return;

            const rect = baseEl.getBoundingClientRect();
            const computed = window.getComputedStyle(baseEl);
            const paddingLeft = parseFloat(computed.paddingLeft) || 0;
            const paddingRight = parseFloat(computed.paddingRight) || 0;
            const targetWidth = Math.max(0, rect.width - paddingLeft - paddingRight);
            container.style.width = `${Math.round(targetWidth)}px`;
        } catch (e) {
            console.warn('同步停靠宽度失败:', e);
        }
    }

    function applyDockedColumnLayout(container) {
        try {
            if (!container || !container.classList.contains('docked')) return;
            const width = container.getBoundingClientRect().width;
            const gap = 8; // 与CSS中的gap一致
            const minCell = 120; // 最小列宽，与CSS中的minmax一致
            if (width && width < (minCell * 2 + gap)) {
                // 极窄：强制两列
                container.style.setProperty('grid-template-columns', 'repeat(2, minmax(0, 1fr))', 'important');
            } else {
                // 恢复为CSS的自适应列数
                container.style.removeProperty('grid-template-columns');
            }
        } catch (e) {
            console.warn('应用停靠列数失败:', e);
        }
    }
    function removeTipsModule() {
        try {
            const side = document.querySelector('div.side');
            if (!side) return;
            const firstModule = side.querySelector('div.module');
            if (!firstModule) return;
            const titleEl = firstModule.querySelector('.module-header h2');
            const title = (titleEl && titleEl.textContent) ? titleEl.textContent.trim() : '';
            if (title === '小贴士') {
                firstModule.remove();
            }
        } catch (e) {
            console.warn('移除小贴士模块异常:', e);
        }
    }

    function init() {
        // 加载用户配置
        loadUserConfig();

        // 迁移旧配置格式
        if (FINAL_BUTTONS_CONFIG.some(btn => typeof btn.action === 'function')) {
            FINAL_BUTTONS_CONFIG = ConfigSerializer.migrateOldConfig(FINAL_BUTTONS_CONFIG);
            muliSpecialStorage.setItem(CONFIG_STORAGE_KEY, ConfigSerializer.serialize(FINAL_BUTTONS_CONFIG));
        }

        // 创建按钮容器
        const container = document.createElement('div');
        container.id = 'quick-actions';
        container.align = 'right';

        // 创建按钮
        FINAL_BUTTONS_CONFIG.forEach((config, index) => {
            const buttonId = `button_${index}_${config.text.replace(/\s+/g, '_')}`;
            container.appendChild(buttonFactory.create(config, index, buttonId));
        });

        document.body.appendChild(container);

        // 创建返回顶部按钮
        const goToTopBtn = document.createElement('div');
        goToTopBtn.id = 'goToTopMuLi';
        goToTopBtn.title = '返回顶部';
        goToTopBtn.innerHTML = '↑';
        goToTopBtn.onclick = () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        };
        container.appendChild(goToTopBtn);

        // 创建停靠/浮动切换按钮
        const dockToggleBtn = document.createElement('div');
        dockToggleBtn.id = 'dockToggleMuLi';
        dockToggleBtn.title = '停靠/浮动切换';
        dockToggleBtn.innerHTML = '⇄';
        dockToggleBtn.onclick = () => {
            if (container.classList.contains('docked')) {
                if (undockContainer(container)) {
                    setDockPreference(false);
                    muliShowToast('已切换为浮动定位', 1200, 'info');
                }
            } else {
                const ok = dockUnderPersonInfoIfPresent(container);
                if (ok) {
                    setDockPreference(true);
                    muliShowToast('已停靠到侧边信息下方', 1200, 'success');
                    syncDockedWidth(container);
                    applyDockedColumnLayout(container);
                } else {
                    muliShowToast('未找到侧边个人信息模块', 1500, 'warning');
                }
            }
        };
        container.appendChild(dockToggleBtn);

        // 初始化拖拽管理器
        const dragManager = new DragManager(container);
        container.dragManager = dragManager;

        // 恢复冷却状态
        restoreCooldownStates();

        // 创建编辑按钮
        createEditButton();

        // 尝试移除侧边第一个“小贴士”模块（若存在）
        removeTipsModule();

        // 按配置应用停靠/浮动
        applyDockPreference(container);

        // 窗口尺寸变化时，同步停靠宽度
        window.addEventListener('resize', () => {
            if (container.classList.contains('docked')) {
                syncDockedWidth(container);
                applyDockedColumnLayout(container);
            }
        });

        // 表情包分组（新版鱼排已自带表情包分组功能）
        //ChatRoomEmojiManager.init();

    }

    // 可视化编辑-为所有按钮表单建立统一的事件委托监听
    document.addEventListener('input', function (event) {
        const target = event.target;
        // 检查事件是否发生在 .muli-button-form 内的输入元素
        const buttonForm = target.closest('.muli-button-form');
        if (buttonForm) {
            //保存可视化编辑
            collectVisualEditorData();
        }
    });

    // 同样监听 change 事件（用于 select、checkbox 等）
    document.addEventListener('change', function (event) {
        const target = event.target;
        const buttonForm = target.closest('.muli-button-form');
        if (buttonForm) {
            //保存可视化编辑
            collectVisualEditorData();
        }
    });

    // 从可视化编辑器收集数据
    function collectVisualEditorData() {
        const forms = document.querySelectorAll('.muli-button-form');
        const newConfig = [];

        forms.forEach((form, index) => {
            const buttonData = {};

            // 基本设置
            const text = form.querySelector('[name="text"]').value;
            if (!text.trim()) {
                throw new Error(`按钮 ${index + 1}: 按钮文本不能为空`);
            }
            buttonData.text = text;
            buttonData.color = form.querySelector('[name="color"]').value;

            const cooldown = form.querySelector('[name="cooldown"]').value;
            if (cooldown && !isNaN(cooldown) && parseInt(cooldown) > 0) {
                buttonData.cooldown = parseInt(cooldown);
            }

            const cooldownChildren = form.querySelector('[name="cooldownChildren"]').value;
            if (cooldownChildren) {
                buttonData.cooldownChildren = cooldownChildren === 'true' ? true : cooldownChildren;
            }

            const refreshValue = form.querySelector('[name="muliRefresh"]').value;
            if (refreshValue) {
                buttonData.muliRefresh = refreshValue === 'true' ? true : refreshValue;
            }

            // 动作设置
            const actionType = form.querySelector('[name="actionType"]').value;
            buttonData.action = {};
            buttonData.action.type = actionType;
            if (actionType && ACTION_TEMPLATES[actionType]) {
                // 这里简化处理，实际应该根据模板生成代码
                if (actionType === 'sendMsg') {
                    var message = form.querySelector('[name="action_message"]')?.value;
                    var messages = message.split(',');
                    if (messages.length > 1) {
                        buttonData.action.params = messages;
                    } else {
                        buttonData.action.params = message;
                    }
                    var delay = form.querySelector('[name="action_delay"]')?.value;
                    if (!delay) {
                        delay = 0;
                    }
                    buttonData.action.delay = delay;
                } else if (actionType === 'sendIconTextMsg') {
                    var message = form.querySelector('[name="action_message"]')?.value;
                    buttonData.action.params = message;
                } else if (actionType === 'promptAndSend') {
                    const promptText = form.querySelector('[name="action_promptText"]')?.value;
                    const defaultValue = form.querySelector('[name="action_defaultValue"]')?.value;
                    const actionCode = form.querySelector('[name="action_actionCode"]')?.value;
                    buttonData.action.params = {};
                    buttonData.action.params.promptText = promptText;
                    buttonData.action.params.defaultValue = defaultValue;
                    buttonData.action.params.actionCode = actionCode;
                } else if (actionType === 'fetchPrivate') {
                    var message = form.querySelector('[name="action_endpoint"]')?.value;
                    var messages = message.split(',');
                    if (messages.length > 1) {
                        buttonData.action.params = messages;
                    } else {
                        buttonData.action.params = message;
                    }
                } else if (actionType === 'promptAndIconTextMsg') {
                    const defaultValue = form.querySelector('[name="action_defaultValue"]')?.value;
                    buttonData.action.params = {};
                    buttonData.action.params.defaultValue = defaultValue;
                } else if (actionType === 'sendRedPacketMsg') {
                    const type = form.querySelector('[name="action_type"]')?.value;
                    const money = form.querySelector('[name="action_money"]')?.value;
                    const count = form.querySelector('[name="action_count"]')?.value;
                    const msg = form.querySelector('[name="action_msg"]')?.value;
                    const recivers = form.querySelector('[name="action_recivers"]')?.value;
                    const gesture = form.querySelector('[name="action_gesture"]')?.value;
                    buttonData.action.params = {};
                    buttonData.action.params.type = type;
                    buttonData.action.params.money = money;
                    buttonData.action.params.count = count;
                    buttonData.action.params.msg = msg;
                    buttonData.action.params.recivers = recivers == null ? [] : recivers.split(",");
                    buttonData.action.params.gesture = gesture;
                }
            }

            // 子按钮设置
            const childForms = form.querySelectorAll('.child-button-form');
            if (childForms.length > 0) {
                buttonData.children = [];

                childForms.forEach(childForm => {
                    const childData = {};
                    const childText = childForm.querySelector('[name="text"]').value;
                    if (!childText.trim()) {
                        throw new Error(`按钮 ${index + 1} 的子按钮: 文本不能为空`);
                    }
                    childData.text = childText;

                    const childCooldown = childForm.querySelector('[name="cooldown"]').value;
                    if (childCooldown && !isNaN(childCooldown) && parseInt(childCooldown) > 0) {
                        childData.cooldown = parseInt(childCooldown);
                    }

                    const childRefreshValue = childForm.querySelector('[name="muliRefresh"]').value;
                    if (childRefreshValue) {
                        childData.muliRefresh = childRefreshValue === 'true' ? true : childRefreshValue;
                    }

                    const childActionType = childForm.querySelector('[name="actionType"]').value;
                    childData.action = {};
                    childData.action.type = childActionType;
                    if (childActionType && ACTION_TEMPLATES[childActionType]) {
                        // 这里简化处理，实际应该根据模板生成代码
                        if (childActionType === 'sendMsg') {
                            var message = childForm.querySelector('[name="action_message"]')?.value;
                            var messages = message.split(',');
                            if (messages.length > 1) {
                                childData.action.params = messages;
                            } else {
                                childData.action.params = message;
                            }
                            var delay = childForm.querySelector('[name="action_delay"]')?.value;
                            if (!delay) {
                                delay = 0;
                            }
                            childData.action.delay = delay;
                        } else if (childActionType === 'sendIconTextMsg') {
                            var message = childForm.querySelector('[name="action_message"]')?.value;
                            childData.action.params = message;
                        } else if (childActionType === 'promptAndSend') {
                            const promptText = childForm.querySelector('[name="action_promptText"]')?.value;
                            const defaultValue = childForm.querySelector('[name="action_defaultValue"]')?.value;
                            const actionCode = childForm.querySelector('[name="action_actionCode"]')?.value;
                            childData.action.params = {};
                            childData.action.params.promptText = promptText;
                            childData.action.params.defaultValue = defaultValue;
                            childData.action.params.actionCode = actionCode;
                        } else if (childActionType === 'fetchPrivate') {
                            var message = childForm.querySelector('[name="action_endpoint"]')?.value;
                            var messages = message.split(',');
                            if (messages.length > 1) {
                                childData.action.params = messages;
                            } else {
                                childData.action.params = message;
                            }
                        } else if (childActionType === 'promptAndIconTextMsg') {
                            const defaultValue = childForm.querySelector('[name="action_defaultValue"]')?.value;
                            childData.action.params = {};
                            childData.action.params.defaultValue = defaultValue;
                        } else if (childActionType === 'sendRedPacketMsg') {
                            const type = childForm.querySelector('[name="action_type"]')?.value;
                            const money = childForm.querySelector('[name="action_money"]')?.value;
                            const count = childForm.querySelector('[name="action_count"]')?.value;
                            const msg = childForm.querySelector('[name="action_msg"]')?.value;
                            const recivers = childForm.querySelector('[name="action_recivers"]')?.value;
                            const gesture = childForm.querySelector('[name="action_gesture"]')?.value;
                            childData.action.params = {};
                            childData.action.params.type = type;
                            childData.action.params.money = money;
                            childData.action.params.count = count;
                            childData.action.params.msg = msg;
                            childData.action.params.recivers = recivers == null ? [] : recivers.split(",");
                            childData.action.params.gesture = gesture;
                        }
                    }

                    buttonData.children.push(childData);
                });
            }

            newConfig.push(buttonData);
        });

        activeConfig = newConfig;
        updateJsonEditor();
    }
// ================= 小尾巴 ==================
    // 替换原有菜单系统，添加统一的设置按钮
    GM_registerMenuCommand("设置小尾巴", showSettingsPanel);

    // 显示设置面板
    function showSettingsPanel() {
        const panel = createSettingsPanel();
        panel.style.display = 'flex';
        settingsPanelVisible = true;
    }

    // 隐藏设置面板
    function hideSettingsPanel() {
        const panel = document.getElementById('tail-word-settings-panel');
        if (panel) {
            panel.style.display = 'none';
            settingsPanelVisible = false;
        }
    }

    // 保存设置
    function saveSettings() {
        // 保存小尾巴设置
        const suffixToggle = document.getElementById('suffix-toggle');
        const customToggle = document.getElementById('custom-suffix-toggle');
        const customInput = document.getElementById('custom-suffix-input');
        const presetSelect = document.getElementById('suffix-preset-select');

        suffixFlag = suffixToggle.checked;
        muliSpecialStorage.setItem('xwb_flag', suffixFlag);

        if (customToggle.checked) {
            muliSpecialStorage.setItem('xwb_is_custom_suffix', 'true');
            muliSpecialStorage.setItem('xwb_custom_suffix', customInput.value.trim());
        } else {
            muliSpecialStorage.removeItem('xwb_is_custom_suffix');
            muliSpecialStorage.setItem('xwb_suffix_index', presetSelect.value);
        }



        // 显示保存成功提示
        showTemporaryHint('设置保存成功！');

        // 更新预览
        updateSuffixPreview();
    }

    // 更新小尾巴预览
    function updateSuffixPreview() {
        const previewDiv = document.getElementById('suffix-preview');
        if (previewDiv) {
            previewDiv.textContent = getCurrentSuffixText();
        }
    }

    // 添加设置面板事件监听
    function addSettingsEventListeners() {
        // 小尾巴开关和自定义切换
        const suffixToggle = document.getElementById('suffix-toggle');
        const customToggle = document.getElementById('custom-suffix-toggle');
        const customInput = document.getElementById('custom-suffix-input');
        const presetSelect = document.getElementById('suffix-preset-select');

        // 监听预览更新
        suffixToggle.addEventListener('change', updateSuffixPreview);
        customToggle.addEventListener('change', updateSuffixPreview);
        customInput.addEventListener('input', updateSuffixPreview);
        presetSelect.addEventListener('change', updateSuffixPreview);

        // 风格选择
        const styleGrid = document.getElementById('style-grid');
        if (styleGrid) {
            styleGrid.addEventListener('click', (e) => {
                const styleOption = e.target;
                if (styleOption.dataset.styleIndex !== undefined) {
                    const styleIndex = parseInt(styleOption.dataset.styleIndex);

                    // 更新选中状态
                    Array.from(styleGrid.children).forEach(child => {
                        child.style.boxShadow = '';
                        child.style.transform = '';
                    });
                    styleOption.style.boxShadow = '0 0 0 2px #667eea';
                    styleOption.style.transform = 'scale(1.05)';

                    // 应用样式
                    applyWordPanelStyle(styleIndex);
                }
            });
        }
    }

    // 小尾巴选项数组
    const suffixOptions = [
        '时光清浅处，一步一安然。',
        '心若向阳，无畏悲伤。',
        '岁月静好，现世安稳。',
        '人生如逆旅，我亦是行人。',
        '胸有丘壑，眼存山河。',
        '但行好事，莫问前程。',
        '愿有岁月可回首，且以深情共白头。',
        '人间烟火气，最抚凡人心。'
    ];

    // 获取当前选中的小尾巴索引
    function getCurrentSuffixIndex() {
        const index = parseInt(muliSpecialStorage.getItem('xwb_suffix_index'));
        return isNaN(index) || index < 0 || index >= suffixOptions.length ? 0 : index;
    }

    // 获取当前小尾巴文本
    function getCurrentSuffixText() {
        // 优先检查是否有自定义小尾巴
        const isCustom = muliSpecialStorage.getItem('xwb_is_custom_suffix') === 'true'
            || muliSpecialStorage.getItem('xwb_is_custom_suffix') === true;
        const customSuffix = muliSpecialStorage.getItem('xwb_custom_suffix');

        // 如果设置了自定义小尾巴且不为空，则返回自定义文本
        if (isCustom && customSuffix) {
            return customSuffix;
        }

        // 否则返回预设的小尾巴选项
        return suffixOptions[getCurrentSuffixIndex()] || suffixOptions[0];
    }

    // 重写发送消息函数，添加小尾巴
    ChatRoom.send = function (needwb) {
        var wbMsg = '\n\n\n>  ' + getCurrentSuffixText();
        var t, e;
        ChatRoom.isSend || (ChatRoom.isSend = !0,
            e = {
                content: t = ChatRoom.editor.getValue(),
            },
            ChatRoom.editor.setValue(""),
            $.ajax({
                url: Label.servePath + "/chat-room/send",
                type: "POST",
                cache: !1,
                data: JSON.stringify({
                    content: function () {
                        // 获取原始消息内容
                        let originalContent = t;

                        // 如果是鱼排的函数引用，小尾巴会出现最后引用换行的情况，因此需要特殊截取（废弃 目前引用已改版）
                        // var yp_yy_index = originalContent.lastIndexOf('\n> \n>\n');
                        // if (yp_yy_index > 0 && yp_yy_index + 9 == originalContent.length) {
                        //     originalContent = originalContent.substring(0, yp_yy_index);
                        // }

                        let muliWb = getCurrentSuffixText();
                        let strOriginalContent = String(originalContent);
                        // 复读之替换别人的小尾巴（太邪恶了）
                        if (strOriginalContent.includes(wb_keyword)) {
                            var wbEnd  = strOriginalContent.lastIndexOf(wb_keyword);
                            //判断是不是最后出现的小尾巴结尾(判断是引用 还是真实的小尾巴)
                            if (strOriginalContent.lastIndexOf("> ") - 2 == wbEnd) {
                                var wbStartMsg = strOriginalContent.substring(0, wbEnd);
                                //如果是双击引用 则改为截取最后正确的小尾巴部分
                                if (wbStartMsg.includes(tab_keyword) && (wbStartMsg.lastIndexOf(tab_keyword) + tab_keyword.length) == wbStartMsg.length) {
                                    //探寻到引用的末端 检查是否出现两个引用层级
                                    var tabEnd = strOriginalContent.lastIndexOf(tab_keyword);
                                    var tabEndStr = strOriginalContent.substring(tabEnd + tab_keyword.length);
                                    // 因为现在双击引用时，会自动在发送前去除小尾巴，所以不用再二次去除了
                                    // if(tabEndStr.lastIndexOf('> ') == tabEndStr.indexOf('> ') || (tabEndStr.lastIndexOf('> ') == tabEndStr.lastIndexOf('> !['))
                                    //    || (tabEndStr.lastIndexOf('> ') == tabEndStr.lastIndexOf('</a>') + 3)) {
                                    //     //说明是最后一个层级
                                    //     // 不去除小尾巴
                                    //     wbStartMsg = strOriginalContent;
                                    // } else {
                                    //     wbStartMsg = strOriginalContent.substring(0, strOriginalContent.lastIndexOf('> '));
                                    // }
                                    wbStartMsg = strOriginalContent;
                                }
                                if (!suffixFlag) {
                                    //去掉别人的尾巴
                                    return wbStartMsg;
                                } else  {
                                    //加上自己的尾巴
                                    return wbStartMsg + '\n\n\n>  ' + muliWb;;
                                }
                            }


                        }

                        // 非内容引用 则是鱼排自带的新版引用
                        // 如果有引用内容，拼接到消息前面
                        if (ChatRoom.quoteData.userName && ChatRoom.quoteData.content) {
                            if (!ChatRoom.quoteData.content.startsWith("\n")) {
                                ChatRoom.quoteData.content = "\n" + ChatRoom.quoteData.content;
                            }
                            let quoteMd = ChatRoom.quoteData.content.replace(/\n/g, "\n> ");
                            // 将内部内容每行前面添加 "> "
                            // let quoteMd = ChatRoom.quoteData.content
                            //     .split('\n')
                            //     .map(line => line.trim() === '' ? '>' : `> ${line}`)
                            //     .join('\n');
                            originalContent = originalContent + `\n\n##### 引用 @${ChatRoom.quoteData.userName} [↩](${Label.servePath}/cr#chatroom${ChatRoom.quoteData.messageId} "跳转至原消息")  \n ${quoteMd}\n`;
                        }

                        // 处理小尾巴和单词
                        if (strOriginalContent.includes(muliWb)
                            || t.trim().length == 0 || (!suffixFlag) || needwb == 0 || t.trim().startsWith('凌 ')
                            || t.trim().startsWith('鸽 ') || t.trim().startsWith('小冰 ') || t.trim().startsWith('冰冰 ') || t.trim().startsWith('点歌 ')
                            || t.trim().startsWith('TTS ') || t.trim().startsWith('朗读 ')) {
                            return originalContent;
                        } else {
                            return originalContent + '\n\n\n>  ' + muliWb;
                        }
                    }(),
                    client: client_us + version_us
                }),
                beforeSend: function () {
                    $("#form button.red").attr("disabled", "disabled").css("opacity", "0.3")
                },
                success: function (e) {
                    0 === e.code ? $("#chatContentTip").removeClass("error succ").html("") : ($("#chatContentTip").addClass("error").html("<ul><li>" + e.msg + "</li></ul>"),
                        ChatRoom.editor.setValue(t))
                    // 发送成功后清除引用
                    ChatRoom.cancelQuote()
                },
                error: function (e) {
                    $("#chatContentTip").addClass("error").html("<ul><li>" + e.statusText + "</li></ul>"),
                        ChatRoom.editor.setValue(t)
                    ChatRoom.editor.setValue(ChatRoom.editor.getValue().replace(content.split('\n\n')[0] + '\n\n', ''))
                },
                complete: function (e, t) {
                    ChatRoom.isSend = !1,
                        $("#form button.red").removeAttr("disabled").css("opacity", "1")
                }
            }))
    };

    // 重写获取表情包数据（新版鱼排已自带表情包分组功能）
    // ChatRoom.fromURL = function () {
    //     // 不再作用
    // };


    // 表情包管理模块
    const ChatRoomEmojiManager = {
        // 初始化表情包系统
        init: function() {
            this.setupTabSystem();
            this.bindEvents();
            this.loadEmojis();
        },

        // 获取表情包数据
        getEmojis: function (gameIdKey) {
            if (!gameIdKey || gameIdKey == '') {
                gameIdKey = "muli-emojis"
            }
            let ret;
            $.ajax({
                url: Label.servePath + "/api/cloud/get",
                method: "POST",
                data: JSON.stringify({
                    gameId: gameIdKey,
                }),
                headers: {'csrfToken': Label.csrfToken},
                async: false,
                success: function (result) {
                    if (result.code === 0) {
                        if (result.data !== "") {
                            ret = JSON.parse(result.data);
                        } else {
                            ret = "";
                        }
                    } else {
                        ret = {};
                    }
                },
            });

            if (ret == "" && gameIdKey == 'muli-emojis') {
                // 第一次初始化脚本表情包 将鱼排表情包进行读取
                ret = this.getEmojis("emojis");
            } else if (!Array.isArray(ret) && typeof ret === 'object' && ret !== null) {
                // 实时同步鱼排和分组的表情包
                if (ret['全部'] && Array.isArray(ret['全部'])) {
                    let tempRet = this.getEmojis("emojis");
                    if (tempRet && Array.isArray(tempRet)) {
                        ret['全部'] = Array.from(tempRet);
                    }

                }
            }
            return ret;
        },


        // 设置标签系统
        setupTabSystem: function() {
            const emojiList = document.getElementById('emojiList');
            if (!emojiList) return;

            // 保存原始内容（包含tail部分）
            const originalContent = emojiList.innerHTML;
            const emojisDiv = document.getElementById('emojis');

            // 创建标签容器
            const tabsContainer = document.createElement('div');
            tabsContainer.className = 'emoji-tabs-container';
            tabsContainer.style.display = 'flex';
            tabsContainer.style.borderBottom = '1px solid #ddd';
            tabsContainer.style.overflowX = 'auto';
            tabsContainer.style.background = '#f5f5f5';
            tabsContainer.style.padding = '5px';

            // 创建标签内容容器
            const tabsContent = document.createElement('div');
            tabsContent.id = 'emojiTabsContent';
            tabsContent.className = 'emoji-tabs-content';
            tabsContent.style.maxHeight = '200px';
            tabsContent.style.overflowY = 'auto';

            // 替换原有结构
            emojiList.innerHTML = '';
            emojiList.appendChild(tabsContainer);
            emojiList.appendChild(tabsContent);

            // 重新添加tail部分（从原始内容中提取）
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = originalContent;
            const tailDiv = tempDiv.querySelector('.hide-list-emojis__tail');
            if (tailDiv) {
                emojiList.appendChild(tailDiv);
            }
        },

        // 绑定事件
        bindEvents: function() {
            // 修改上传事件，添加上传到当前标签的功能
            //$(document).on('change', '#uploadEmoji input', this.handleUpload.bind(this));

            $('#uploadEmoji').fileupload({
                acceptFileTypes: /(\.|\/)(gif|jpe?g|png)$/i,
                maxFileSize: 5242880,
                multipart: true,
                pasteZone: null,
                dropZone: null,
                url: Label.servePath + '/upload',
                paramName: 'file[]',
                add: function (e, data) {
                    //ext = data.files[0].type.split('/')[1]
                    // const file = e.target.files[0];
                    // if (!file) return;
                    // 获取当前激活的标签
                    const activeTab = document.querySelector('.emoji-tab.active');
                    if (!activeTab || activeTab.classList.contains('add-tab')) {
                        Util.notice('warning', 1500, '请先选择一个标签！');
                        e.target.value = ''; // 清空文件选择
                        return;
                    }
                    const tabName = activeTab.dataset.tab;
                    if (window.File && window.FileReader && window.FileList &&
                        window.Blob) {
                        var reader = new FileReader()
                        reader.readAsArrayBuffer(data.files[0])
                        reader.onload = function (evt) {
                            var fileBuf = new Uint8Array(evt.target.result.slice(0, 11))
                            var isImg = isImage(fileBuf)

                            if (!isImg) {
                                Util.alert('只允许上传图片!')

                                return
                            }

                            if (evt.target.result.byteLength > 1024 * 1024 * 5) {
                                Util.alert('图片过大 (最大限制 5M)')

                                return
                            }

                            data.submit()
                        }
                    } else {
                        data.submit()
                    }
                },
                formData: function (form) {
                    var data = form.serializeArray()
                    return data
                },
                submit: function (e, data) {
                },
                done: function (e, data) {
                    var result = {
                        result: {
                            key: data.result.data.succMap[Object.keys(data.result.data.succMap)[0]]
                        }
                    }
                    const activeTab = document.querySelector('.emoji-tab.active');
                    const tabName = activeTab.dataset.tab;
                    //保存表情包
                    let emojisData = ChatRoomEmojiManager.getEmojis();
                    let emojisMap = ChatRoomEmojiManager.normalizeEmojisData(emojisData);

                    if (!emojisMap[tabName]) {
                        emojisMap[tabName] = [];
                    }

                    emojisMap[tabName].push(result.result.key);
                    if (tabName !== '全部') {
                        emojisMap['全部'].push(result.result.key);
                    }
                    ChatRoomEmojiManager.saveEmojis(emojisMap);
                    // 重新加载
                    ChatRoomEmojiManager.loadEmojis();
                },
                fail: function (e, data) {
                    Util.alert('Upload error: ' + data.errorThrown)
                },
            });

            // 修改URL导入事件
            $(document).on('click', 'a[onclick*="ChatRoom.fromURL"]', (e) => {
                e.preventDefault();
                this.fromURL();
            });
        },

        // 加载表情包（兼容数组和Map格式）
        loadEmojis: function(thisEmojisMap) {
            let emojisData;
            if (thisEmojisMap) {
                emojisData = thisEmojisMap;
            } else {
                emojisData = this.getEmojis();
            }
            let emojisMap = this.normalizeEmojisData(emojisData);

            // 保存当前激活的标签
            const activeTab = $('.emoji-tab.active').data('tab') || '全部';

            // 生成标签
            this.generateTabs(emojisMap);

            // 生成标签内容
            this.generateTabContent(emojisMap);

            // 激活之前的标签或默认标签
            const tabToActivate = emojisMap[activeTab] ? activeTab : '全部';
            this.switchTab(tabToActivate);
        },

        // 标准化表情包数据（兼容数组和Map格式）
        normalizeEmojisData: function(data) {
            if (Array.isArray(data)) {
                // 旧格式数组，转换为Map
                return { '全部': Array.from(new Set(data)) };
            } else if (typeof data === 'object' && data !== null) {
                // 已经是Map格式
                if (data['默认'] && Array.isArray(data['默认'])) {
                    data['全部'] = Array.from(new Set(data['默认']));
                    delete data['默认'];
                }
                return data;
            } else {
                // 无效数据，返回空Map
                return { '全部': [] };
            }
        },

        // 反向-标准化表情包数据（兼容数组和Map格式）
        entypyNormalizeEmojisData: function(data) {
            if (Array.isArray(data)) {
                // 已经是list
                data = Array.from(new Set(data));
                return data;
            } else if (typeof data === 'object' && data !== null) {
                // Map格式转换list
                if (data['全部'] && Array.isArray(data['全部'])) {
                    return Array.from(new Set(data['全部']));
                }
                let newList = [];
                Object.keys(data).forEach(tabName => {
                    data[tabName].forEach(url => {
                        newList.push(url);
                    });
                });
                return Array.from(new Set(newList));
            } else {
                // 无效数据，返回空LIST
                return  [] ;
            }
        },

        // 生成标签
        generateTabs: function(emojisMap) {
            const tabsContainer = document.querySelector('#emojiList .emoji-tabs-container');
            if (!tabsContainer) return;

            tabsContainer.innerHTML = '';

            const allTab = document.createElement('div');
            allTab.className = 'emoji-tab';
            allTab.dataset.tab = "全部";
            allTab.textContent = "全部";
            allTab.style.cssText = `
                padding: 5px 10px;
                margin-right: 5px;
                cursor: pointer;
                border: 1px solid #ddd;
                border-bottom: none;
                border-radius: 3px 3px 0 0;
                background: #fff;
                white-space: nowrap;
            `;

            allTab.onclick = () => this.switchTab("全部");
            // 移除之前的事件绑定（避免重复）
            allTab.removeEventListener('dblclick', this.handleEmojisTabDoubleClick);

            // 添加双击事件
            allTab.addEventListener('dblclick', this.handleEmojisTabDoubleClick);
            tabsContainer.appendChild(allTab);

            Object.keys(emojisMap).forEach(tabName => {
                if (tabName !==  '全部') {
                    const tab = document.createElement('div');
                    tab.className = 'emoji-tab';
                    tab.dataset.tab = tabName;
                    tab.textContent = tabName;
                    tab.style.cssText = `
                        padding: 5px 10px;
                        margin-right: 5px;
                        cursor: pointer;
                        border: 1px solid #ddd;
                        border-bottom: none;
                        border-radius: 3px 3px 0 0;
                        background: #fff;
                        white-space: nowrap;
                    `;

                    tab.onclick = () => this.switchTab(tabName);
                    // 移除之前的事件绑定（避免重复）
                    tab.removeEventListener('dblclick', this.handleEmojisTabDoubleClick);

                    // 添加双击事件
                    tab.addEventListener('dblclick', this.handleEmojisTabDoubleClick);
                    tabsContainer.appendChild(tab);
                }

            });

            // 添加"新建标签"按钮
            const addTab = document.createElement('div');
            addTab.className = 'emoji-tab add-tab';
            addTab.textContent = '+';
            addTab.style.cssText = `
            padding: 5px 10px;
            margin-right: 5px;
            cursor: pointer;
            border: 1px solid #6c757d;
            border-bottom: none;
            border-radius: 3px 3px 0 0;
            background: #6c757d;
            color: white;
            min-width: 30px;
            text-align: center;
            white-space: nowrap;
        `;
            addTab.onclick = () => this.addNewTab();
            tabsContainer.appendChild(addTab);
        },

        // 生成标签内容
        generateTabContent: function(emojisMap) {
            const tabsContent = document.getElementById('emojiTabsContent');
            if (!tabsContent) return;

            tabsContent.innerHTML = '';

            Object.keys(emojisMap).forEach(tabName => {
                const tabPanel = document.createElement('div');
                tabPanel.id = `emoji-tab-${tabName}`;
                tabPanel.className = 'emoji-tab-panel';
                tabPanel.style.display = 'none';
                let tempList = Array.from(emojisMap[tabName].reverse());
                tempList.forEach(url => {
                    const button = document.createElement('button');
                    button.style.cssText = `
                    border: none;
                    background: none;
                    padding: 3px;
                    position: relative;
                    cursor: pointer;
                    width: 72px;
                    height: 72px;
                `;

                    button.onclick = () => {
                        const editor = ChatRoom.editor || Comment.editor;
                        if (editor && editor.setValue) {
                            editor.setValue(editor.getValue() + `![图片表情](${url})`);
                        }
                    };

                    // 删除按钮
                    const divX = document.createElement('div');
                    divX.className = 'divX';
                    divX.style.cssText = `
                    position: absolute;
                    top: 2px;
                    right: 2px;
                    display: none;
                    background: rgba(255,0,0,0.7);
                    border-radius: 50%;
                    width: 15px;
                    height: 15px;
                    cursor: pointer;
                    text-align: center;
                    line-height: 15px;
                    color: white;
                    font-size: 12px;
                `;
                    divX.innerHTML = '×';

                    divX.onclick = (e) => {
                        e.stopPropagation();
                        this.delEmoji(url, tabName);
                    };

                    // 重新分组按钮
                    const divAllocation = document.createElement('div');
                    divAllocation.className = 'divAllocation';
                    divAllocation.style.cssText = `
                    position: absolute;
                    top: 2px;
                    left: -2px;
                    display: none;
                    background: rgba(34,197,94,0.8);
                    border-radius: 50%;
                    width: 15px;
                    height: 15px;
                    cursor: pointer;
                    text-align: center;
                    line-height: 15px;
                    color: white;
                    font-size: 12px;
                `;
                    divAllocation.innerHTML = '⇄';

                    divAllocation.onclick = (e) => {
                        e.stopPropagation();
                        this.allocationEmoji(url, tabName);
                    };

                    // 一键发送按钮
                    const divSend = document.createElement('div');
                    divSend.className = 'divEmojiSend';
                    divSend.style.cssText = `
                    position: absolute;
                    bottom: -2px;
                    right: 2px;
                    display: none;
                    background: rgba(51,154,240,0.8);
                    border-radius: 40%;
                    width: 16px;
                    height: 16px;
                    cursor: pointer;
                    text-align: center;
                    line-height: 16px;
                    color: white;
                    font-size: 12px;
                `;
                    divSend.innerHTML = '↗️';

                    divSend.onclick = (e) => {
                        e.stopPropagation();
                        this.muliSendEmoji(url, tabName);
                    };

                    // 表情图片
                    const img = document.createElement('img');
                    img.className = 'vditor-emojis__icon';
                    img.src = url;
                    img.style.maxHeight = '50px';
                    img.style.display = 'block';

                    button.appendChild(divX);
                    button.appendChild(divAllocation);
                    button.appendChild(divSend);
                    button.appendChild(img);
                    tabPanel.appendChild(button);

                    // 鼠标悬停显示删除按钮
                    button.addEventListener('mouseenter', () => {
                        divX.style.display = 'block';
                        divAllocation.style.display = 'block';
                        divSend.style.display = 'block';
                    });
                    button.addEventListener('mouseleave', () => {
                        divX.style.display = 'none';
                        divAllocation.style.display = 'none';
                        divSend.style.display = 'none';
                    });
                });

                tabsContent.appendChild(tabPanel);
            });
        },

        // 切换标签
        switchTab: function(tabName) {
            // 移除所有标签的active状态
            document.querySelectorAll('.emoji-tab').forEach(tab => {
                tab.style.background = '#fff';
                tab.style.color = '#000';
                tab.style.borderColor = '#ddd';
                tab.classList.remove('active');
            });

            // 激活当前标签
            const activeTab = document.querySelector(`.emoji-tab[data-tab="${tabName}"]`);
            if (activeTab) {
                activeTab.style.background = '#007bff';
                activeTab.style.color = 'white';
                activeTab.style.borderColor = '#007bff';
                activeTab.classList.add('active');
            }

            // 隐藏所有标签内容
            document.querySelectorAll('.emoji-tab-panel').forEach(panel => {
                panel.style.display = 'none';
            });

            // 显示当前标签内容
            const activePanel = document.getElementById(`emoji-tab-${tabName}`);
            if (activePanel) {
                activePanel.style.display = 'block';
            }
        },

        // 添加新标签
        addNewTab: function() {
            const tabName = prompt('请输入新标签名称：');
            if (tabName && tabName.trim()) {
                const trimmedName = tabName.trim();
                let emojisData = this.getEmojis();
                let emojisMap = this.normalizeEmojisData(emojisData);

                // 检查标签是否已存在
                if (emojisMap[trimmedName]) {
                    Util.notice('warning', 1500, '标签已存在！');
                    return;
                }

                // 添加新标签
                emojisMap[trimmedName] = [];

                // 切换到新标签
                this.switchTab(trimmedName);

                // 保存数据
                this.saveEmojis(emojisMap);

                // 重新加载
                this.loadEmojis();


                setTimeout(() => {
                    this.switchTab(trimmedName);
                }, 50);
            }
        },

        // 删除表情包
        delEmoji: function(url, tabName) {
            Comment.confirmed = confirm('确定要删除该表情包吗？');
            if (Comment.confirmed) {

                let emojisData = this.getEmojis();
                let emojisMap = this.normalizeEmojisData(emojisData);

                if (emojisMap[tabName]) {
                    const index = emojisMap[tabName].indexOf(url);
                    if (index !== -1) {
                        emojisMap[tabName].splice(index, 1);

                        // 同时在全部中删除表情包
                        if (tabName !== '全部') {
                            const allIndex = emojisMap['全部'].indexOf(url);
                            if (allIndex !== -1) {
                                emojisMap['全部'].splice(allIndex, 1);
                            }
                        } else {
                            // 遍历在其他分组删除
                            Object.keys(emojisMap).forEach(tempTabName => {
                                const tempIndex = emojisMap[tempTabName].indexOf(url);
                                if (tempIndex !== -1) {
                                    emojisMap[tempTabName].splice(tempIndex, 1);
                                }
                            });
                        }

                        // 如果标签为空，询问是否删除标签
                        if (emojisMap[tabName].length === 0 && tabName !== 'default' && tabName !== '全部') {
                            if (confirm('此标签已为空，是否删除该标签？')) {
                                delete emojisMap[tabName];
                            }
                        }

                        // 保存修改
                        this.saveEmojis(emojisMap);
                        // 重新加载
                        this.loadEmojis();
                    }
                }
            }
            Comment.confirmed = false;
        },

        // 重新分配表情包分组
        allocationEmoji: function(url, tabName) {
            let emojisData = this.getEmojis();
            let emojisMap = this.normalizeEmojisData(emojisData);
            // 不可分配到当前和全部
            let ops = [];
            Object.keys(emojisMap).forEach(tempTabName => {
                if (tempTabName !== tabName && tempTabName !== '全部') {
                    ops.push(tempTabName);
                }
            });
            if (ops.length == 0) {
                Util.notice('warning', 1500, '没有可分配的表情包分组！');
                return;
            }

            // 调用下拉框选择函数并处理结果
            muliShowSingleSelect(ops, '请选择你要分配到的分组')
                .then(selected => {
                    // 检查是否该分组已存在同样表情包
                    if (emojisMap[selected].indexOf(url) != -1) {
                        Util.notice('warning', 1500, '当前分组已存在该表情包！');
                        return;
                    }
                    emojisMap[selected].push(url);
                    //非全部对其他分组进行分配需要删除当前分组的表情包
                    if (tabName !== '全部') {
                        const index = emojisMap[tabName].indexOf(url);
                        if (index !== -1) {
                            emojisMap[tabName].splice(index, 1);
                        }
                    }
                    // 保存修改
                    this.saveEmojis(emojisMap);
                    // 重新加载
                    this.loadEmojis();
                })
                .catch(err => {
                    Util.notice('warning', 1500, '未进行分配！');
                });
        },

        // 一键发送表情包函数
        muliSendEmoji: function(url, tabName) {
            if (!url || url == '') {
                return;
            }
            sendMsg(`![图片表情](${url})`);
        },

        // 保存表情包数据
        saveEmojis: function(emojisMap, gameIdKey) {
            if(!gameIdKey || gameIdKey == "") {
                gameIdKey = 'muli-emojis';
            }
            $.ajax({
                url: Label.servePath + '/api/cloud/sync',
                method: 'POST',
                data: JSON.stringify({
                    gameId: gameIdKey,
                    data: emojisMap
                }),
                headers: { 'csrfToken': Label.csrfToken },
                async: false,
                success: function(result) {
                    if (result.code === 0) {
                        Util.notice('success', 1500, '操作成功！');
                        ChatRoomEmojiManager.loadEmojis();
                        setTimeout(() => {
                            $('#emojiBtn').click();
                        }, 50);
                    } else {
                        Util.notice('warning', 1500, '操作失败：' + result.msg);
                    }
                }
            });
            if (gameIdKey === 'muli-emojis') {
                //鱼排原有功能也提交
                this.saveEmojis(this.entypyNormalizeEmojisData(emojisMap), "emojis");
            }
        },

        // 从URL导入表情包
        fromURL: function() {
            // 获取当前激活的标签
            const activeTab = document.querySelector('.emoji-tab.active');
            if (!activeTab || activeTab.classList.contains('add-tab')) {
                Util.notice('warning', 1500, '请先选择一个标签！');
                return;
            }

            const tabName = activeTab.dataset.tab;
            const url = prompt('请输入表情包图片URL：');

            if (url && url.trim()) {
                let emojisData = this.getEmojis();
                let emojisMap = this.normalizeEmojisData(emojisData);

                if (!emojisMap[tabName]) {
                    emojisMap[tabName] = [];
                }

                // 检查是否已存在
                if (emojisMap[tabName].includes(url)) {
                    Util.notice('warning', 1500, '该表情包已存在！');
                    return;
                }

                emojisMap[tabName].push(url);
                if (tabName !== '全部') {
                    emojisMap['全部'].push(url);
                }
                this.saveEmojis(emojisMap);
                // 重新加载
                this.loadEmojis();
            }
        },

        // 处理上传
        handleUpload: function(e) {
            const file = e.target.files[0];
            if (!file) return;
            // 获取当前激活的标签
            const activeTab = document.querySelector('.emoji-tab.active');
            if (!activeTab || activeTab.classList.contains('add-tab')) {
                Util.notice('warning', 1500, '请先选择一个标签！');
                e.target.value = ''; // 清空文件选择
                return;
            }
            const tabName = activeTab.dataset.tab;


        },

        // 表情包Tab双击事件处理
        handleEmojisTabDoubleClick: function(e) {
            const tab = e.currentTarget;
            const originalTabName = tab.textContent;

            // 如果标签是"全部"或"default"，则不触发编辑
            if (originalTabName === '全部' || originalTabName === 'default') {
                return;
            }

            // 创建输入框
            const input = document.createElement('input');
            input.type = 'text';
            input.value = originalTabName;
            input.style.cssText = `
                width: 100%;
                height: 100%;
                border: 2px solid #1890ff;
                border-radius: 3px;
                padding: 0 5px;
                font-size: 14px;
                outline: none;
                box-sizing: border-box;
            `;

            // 替换tab内容为输入框
            tab.textContent = '';
            tab.appendChild(input);
            input.focus();
            input.select();

            // 保存新名称的函数
            const saveTabName = () => {
                const newName = input.value.trim();

                // 验证新名称
                if (!newName) {
                    // 名称不能为空，恢复原名称
                    tab.textContent = originalTabName;
                    return false;
                }

                if (newName === originalTabName) {
                    // 名称未改变，恢复原样式
                    tab.textContent = originalTabName;
                    return true;
                }

                // 检查名称是否已存在
                const existingTabs = document.querySelectorAll('.emoji-tab:not(.add-tab)');
                let nameExists = false;

                existingTabs.forEach(existingTab => {
                    if (existingTab !== tab && existingTab.textContent === newName) {
                        nameExists = true;
                    }
                });

                if (nameExists) {
                    alert('标签名称已存在，请使用其他名称');
                    input.focus();
                    input.select();
                    return false;
                }

                // 保存新名称
                tab.textContent = newName;

                // 更新表情包数据
                ChatRoomEmojiManager.updateEmojisTabNameInData(originalTabName, newName);

                return true;
            };

            // 输入框失焦时保存
            input.addEventListener('blur', () => {
                saveTabName();

            });

            // 回车键保存
            input.addEventListener('keydown', (jpe) => {
                if (jpe.key === 'Enter') {
                    saveTabName()
                } else if (jpe.key === 'Escape') {
                    // ESC键取消，恢复原名称
                    tab.textContent = originalTabName;
                }
            });

            // 阻止事件冒泡，避免触发其他事件
            e.stopPropagation();
        },

        // 更新表情包数据中的标签名称
        updateEmojisTabNameInData: function(oldName, newName) {
            // 获取当前表情包数据
            let emojisData = this.getEmojis();
            let emojisMap = this.normalizeEmojisData(emojisData);

            // 如果旧名称存在，则更新为新名称
            if (emojisMap[oldName]) {
                emojisMap[newName] = emojisMap[oldName];
                delete emojisMap[oldName];

                // 保存更新后的数据
                this.saveEmojis(emojisMap);

                // 更新标签的data-tab属性
                const tab = document.querySelector(`.emoji-tab[data-tab="${oldName}"]`);
                if (tab) {
                    tab.dataset.tab = newName;
                }

                // 更新标签内容面板的ID
                const oldPanel = document.getElementById(`emoji-tab-${oldName}`);
                if (oldPanel) {
                    oldPanel.id = `emoji-tab-${newName}`;
                }
                ChatRoomEmojiManager.switchTab(newName);

                Util.notice('success', 1500, '分组名称已更新');
            }
        }

    };

    // 修改原Comment对象的函数以兼容新系统（新版鱼排已自带表情包分组功能）
    //const originalLoadEmojis = Comment.loadEmojis;
    // Comment.loadEmojis = function() {
    //     // 如果表情包管理器已初始化，使用新系统
    //     if (typeof ChatRoomEmojiManager !== 'undefined') {
    //         ChatRoomEmojiManager.loadEmojis();
    //     } else {
    //         originalLoadEmojis.call(this);
    //     }
    // };

    // const originalDelEmoji = Comment.delEmoji;
    // Comment.delEmoji = function(url, tabName) {
    //     if (typeof ChatRoomEmojiManager !== 'undefined') {
    //         ChatRoomEmojiManager.delEmoji(url, tabName);
    //     } else {
    //         originalDelEmoji.call(this, url);
    //     }
    // };

    // 添加CSS样式
    const emojiStyle = document.createElement('emojiStyle');
    emojiStyle.textContent = `
        .emoji-tabs-container {
            display: flex;
            border-bottom: 1px solid #ddd;
            padding: 5px;
            overflow-x: auto;
            background: #f5f5f5;
        }

        .emoji-tab {
            padding: 5px 10px;
            margin-right: 5px;
            cursor: pointer;
            border: 1px solid #ddd;
            border-bottom: none;
            border-radius: 3px 3px 0 0;
            background: #fff;
            white-space: nowrap;
        }

        .emoji-tab.active {
            background: #007bff !important;
            color: white !important;
            border-color: #007bff !important;
        }

        .emoji-tab.add-tab {
            background: #6c757d;
            color: white;
            border-color: #6c757d;
            min-width: 30px;
            text-align: center;
        }

        .emoji-tabs-content {
            max-height: 200px;
            overflow-y: auto;
            padding: 10px;
        }

        .emoji-tab-panel {
            display: none;
        }

        .emoji-tab-panel.active {
            display: block;
        }

        button .divX {
            position: absolute;
            top: 2px;
            right: 2px;
            display: none;
            background: rgba(255,0,0,0.7);
            border-radius: 50%;
            width: 15px;
            height: 15px;
            cursor: pointer;
            text-align: center;
            line-height: 15px;
            color: white;
            font-size: 12px;
        }

        button:hover .divX {
            display: block;
        }
    `;
    document.head.appendChild(emojiStyle);

    // 添加表情包tab CSS样式
    const tabEmojiEditStyle = document.createElement('style');
    tabEmojiEditStyle.textContent = `
        .emoji-tab:not(.add-tab) {
            cursor: pointer;
            transition: background-color 0.2s;
            user-select: none;
        }

        .emoji-tab:not(.add-tab):hover {
            background-color: #f0f0f0;
        }

        .emoji-tab:not(.add-tab).active:hover {
            background-color: #0066cc;
        }

        .emoji-tab input {
            min-width: 60px;
            font-family: inherit;
        }
    `;
    document.head.appendChild(tabEmojiEditStyle);

    /**
     * 创建单选下拉选择框（支持字符串数组）
     * @param {Array<string>} options 下拉选项数组，如：['选项1', '选项2', '选项3']
     * @param {string} title 选择框标题
     * @returns {Promise} 返回Promise，resolve为用户选择的文本值，reject为取消选择
     */
    function muliShowSingleSelect(options, title = '请选择') {
        return new Promise((resolve, reject) => {
            // 创建遮罩层
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);z-index:9998;';

            // 创建选择框
            const selectBox = document.createElement('div');
            selectBox.style.cssText = 'position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);background:white;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:9999;min-width:280px;max-width:400px;padding:0;overflow:hidden;';

            // 创建标题
            const header = document.createElement('div');
            header.style.cssText = 'padding:16px 20px;border-bottom:1px solid #e8e8e8;font-size:16px;font-weight:500;color:#333;background:#fafafa;';
            header.textContent = title;

            // 创建下拉框
            const select = document.createElement('select');
            select.style.cssText = 'width:100%;padding:12px 20px;border:none;outline:none;font-size:14px;color:#333;background:white;border-radius:0;appearance:none;cursor:pointer;';

            // 添加默认选项
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '请选择...';
            defaultOption.disabled = true;
            defaultOption.selected = true;
            select.appendChild(defaultOption);

            // 添加选项（字符串数组直接作为选项）
            options.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option;
                opt.textContent = option;
                select.appendChild(opt);
            });

            // 创建按钮区域
            const buttons = document.createElement('div');
            buttons.style.cssText = 'padding:12px 20px;border-top:1px solid #e8e8e8;display:flex;justify-content:flex-end;gap:10px;background:#fafafa;';

            const cancelBtn = document.createElement('button');
            cancelBtn.style.cssText = 'padding:6px 16px;border:1px solid #d9d9d9;background:white;border-radius:4px;cursor:pointer;font-size:14px;color:#666;';
            cancelBtn.textContent = '取消';

            const confirmBtn = document.createElement('button');
            confirmBtn.style.cssText = 'padding:6px 16px;border:none;background:#1890ff;border-radius:4px;cursor:pointer;font-size:14px;color:white;';
            confirmBtn.textContent = '确定';
            confirmBtn.disabled = true;

            // 选项变化时启用确定按钮
            select.addEventListener('change', () => {
                confirmBtn.disabled = select.value === '';
            });

            // 按钮事件处理
            cancelBtn.onclick = () => {
                document.body.removeChild(overlay);
                document.body.removeChild(selectBox);
                reject(new Error('用户取消选择'));
            };

            confirmBtn.onclick = () => {
                if (select.value !== '') {
                    const selectedValue = select.value;
                    document.body.removeChild(overlay);
                    document.body.removeChild(selectBox);
                    resolve(selectedValue);
                }
            };

            // 点击遮罩层关闭
            overlay.onclick = cancelBtn.onclick;

            // 阻止选择框点击事件冒泡
            selectBox.onclick = (e) => e.stopPropagation();

            // 组装元素
            buttons.appendChild(cancelBtn);
            buttons.appendChild(confirmBtn);
            selectBox.appendChild(header);
            selectBox.appendChild(select);
            selectBox.appendChild(buttons);

            // 添加到页面
            document.body.appendChild(overlay);
            document.body.appendChild(selectBox);

            // 自动聚焦下拉框
            select.focus();
        });
    }

    // 表情包增强2.0
    const NewChatRoomEmojiManager = {
        // 渲染全部分组中的表情包，为他附加分配和一键发送按钮
        init: function () {
            const emojiBtnList = document.querySelectorAll('#emojisNew .emoji-insert-btn');

            // 遍历添加分配和一键发送按钮
            emojiBtnList.forEach(button => {
                var url = button.getAttribute('data-url');
                var emojiId = button.getAttribute('data-emoji-id');
                var emojiName = button.getAttribute('data-emoji-name');
                // 重新分组按钮
                const divAllocation = document.createElement('div');
                divAllocation.className = 'divAllocation';
                divAllocation.style.cssText = `
                    position: absolute;
                    top: 0px;
                    left: 0px;
                    display: none;
                    background: rgba(34,197,94,0.8);
                    border-radius: 50%;
                    width: 16px;
                    height: 16px;
                    cursor: pointer;
                    text-align: center;
                    line-height: 16px;
                    color: white;
                    font-size: 12px;
                `;
                divAllocation.innerHTML = '⇄';

                divAllocation.onclick = (e) => {
                    e.stopPropagation();
                    this.muliShowGroupSelectDialog(emojiId, emojiName, this);
                };

                // 一键发送按钮
                const divSend = document.createElement('div');
                divSend.className = 'divEmojiSend';
                divSend.style.cssText = `
                    position: absolute;
                    bottom: 0px;
                    right: 0px;
                    display: none;
                    background: rgba(51,154,240);
                    border-radius: 40%;
                    width: 16px;
                    height: 16px;
                    cursor: pointer;
                    text-align: center;
                    line-height: 16px;
                    color: white;
                    font-size: 12px;
                `;
                divSend.innerHTML = '↗️';

                divSend.onclick = (e) => {
                    e.stopPropagation();
                    this.muliSendEmoji(url);
                };


                //button.appendChild(divX);
                button.appendChild(divAllocation);
                button.appendChild(divSend);
                //button.appendChild(img);
                //tabPanel.appendChild(button);

                var divDel = button.querySelector(".emoji-del-btn");
                divDel.style.display = 'none';

                // 鼠标悬停显示按钮
                button.addEventListener('mouseenter', () => {
                    divAllocation.style.display = 'block';
                    divSend.style.display = 'block';
                    divDel.style.display = 'block';
                });
                button.addEventListener('mouseleave', () => {
                    divAllocation.style.display = 'none';
                    divSend.style.display = 'none';
                    divDel.style.display = 'none';
                });
            });
        },

        // 一键发送表情包函数
        muliSendEmoji: function (url) {
            if (!url || url == '') {
                return;
            }
            sendMsg(`![图片表情](${url})`);
        },
        /**
         * 显示分组选择弹窗emojiGroups
         * @param {string} emojiId 表情id
         * @param {array} groups 分组列表
         */
        muliShowGroupSelectDialog: function (emojiId, name, NewChatRoomEmojiManager) {
            var tempHtml = "";


            // 获取所有有效分组
            $.ajax({
                url: Label.servePath + '/api/emoji/groups',
                type: 'GET',
                cache: false,
                success: function (result) {
                    if(result.code == 0){
                        var groups = result.data || [];

                        // 生成分组选择HTML
                        var html = '<div id="emojiGroupSelectDialog"><div class="form fn-clear" style="padding:0 20px;">';
                        html += '<label>请选择要添加到的分组：</label><br><br>';
                        html += '<select id="groupSelect" style="width: 100%; padding: 8px; margin-bottom: 10px;">';

                        for (var i = 0; i < groups.length; i++) {
                            var group = groups[i];
                            var selected = '';
                            if (group.type == 1) {
                                continue;
                            }
                            html += '<option value="' + group.oId + '" ' + selected + '>' + group.name + '</option>';
                        }
                        html += '</select>';
                        html += '<label>表情别名（可选）：</label><br>';
                        html += '<input id="emojiName" type="text" placeholder="可选，输入表情别名" value="' + (name || '') + '" style="width: 100%; padding: 8px; margin-bottom: 10px;"/>';
                        html += '<br><br>';
                        html += '<button id="muliEmojiAllocationConfirm" onclick="ChatRoom.muliConfirmAddEmojiToGroup(\'' + emojiId + '\')" class="fn-right green">确定</button>';
                        html += '<button onclick="$(\'#emojiGroupSelectDialog\').dialog(\'close\')" class="fn-right" style="margin-right: 10px;">取消</button>';
                        html += '</div></div>';

                        // 检查弹窗是否存在，如果不存在则创建
                        if ($('#emojiGroupSelectDialog').length === 0) {
                            $('body').append(html);
                        } else {
                            $('#emojiGroupSelectDialog').remove();
                            $('body').append(html);
                        }

                        //$('#emojiGroupSelectDialog').html(html);


                        // 初始化弹窗
                        $('#emojiGroupSelectDialog').dialog({
                            'width': $(window).width() > 400 ? 400 : $(window).width() - 50,
                            'height': 350,
                            'modal': true,
                            'hideFooter': true,
                            'title': '选择分组'
                        });

                        $('#emojiGroupSelectDialog').dialog('open');

                    }else {
                        Util.notice('warning', 2000, result.msg || '加载分组失败');
                    }

                },
                error: function () {
                    Util.notice('warning', 2000, '加载分组失败，请检查网络');
                }
            });


        },

        /**
         * 确认添加表情到分组
         * @param {string} emojiId 表情id
         */
        muliConfirmAddEmojiToGroup: function (emojiId) {
        var groupId = $('#groupSelect').val();
        var name = $('#emojiName').val().trim();

        if (!groupId) {
            Util.notice('warning', 2000, '请选择一个分组');
            return;
        }

        $.ajax({
            url: Label.servePath + '/api/emoji/group/add-emoji',
            type: 'POST',
            data: JSON.stringify({
                groupId: groupId,
                emojiId: emojiId,
                sort: 0,
                name: name
            }),
            contentType: 'application/json;charset=UTF-8',
            success: function (result) {
                if (result.code === 0) {
                    Util.notice('success', 1200, '添加表情到分组成功');
                    $('#emojiGroupSelectDialog').dialog('close');
                    // 如果当前正在查看该分组，则刷新表情列表
                    // if (Settings.currentEmojiGroupId === groupId) {
                    //   Settings.loadGroupEmojis(groupId);
                    // }
                    ChatRoom.emojiGroupsDataNew[ChatRoom.currentEmojiGroupIdNew] = null;
                    ChatRoom.loadGroupEmojisNew(groupId);
                } else {
                    Util.notice('warning', 2000, result.msg || '添加表情失败');
                }
            },
            error: function () {
                Util.notice('warning', 2000, '添加表情失败，请检查网络');
            }
        });
    }

    }


    // 覆盖原有分组表情包加载
    const originalRenderGroupEmojisNew = ChatRoom.renderGroupEmojisNew;
    ChatRoom.renderGroupEmojisNew = function() {
        originalRenderGroupEmojisNew.call(this, ChatRoom.emojiGroupsDataNew[ChatRoom.currentEmojiGroupIdNew]);
        NewChatRoomEmojiManager.init();
    };

    ChatRoom.muliConfirmAddEmojiToGroup = function (emojiId) {
        NewChatRoomEmojiManager.muliConfirmAddEmojiToGroup(emojiId);
    }

    // 启动脚本
    init();
})();
