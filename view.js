document.addEventListener('DOMContentLoaded', async () => {
    // 全局变量声明
    let graph = null;
    let isDarkTheme = false;
    let historyItems = [];
    let searchResults = [];
    let currentSearchIndex = -1;
    let treeDataCache = null;
    let allNodes = [];
    let sortBy = 'name';  // 默认按名称排序
    let sortDirection = 'asc';  // 默认升序

    // 获取DOM元素
    const groupBySelect = document.getElementById('groupBy');
    const themeToggle = document.getElementById('themeToggle');
    const searchInput = document.getElementById('searchInput');
    const searchPrev = document.getElementById('searchPrev');
    const searchNext = document.getElementById('searchNext');
    const searchInfo = document.getElementById('searchInfo');
    const languageSelect = document.getElementById('language');
    const sortSelect = document.getElementById('sortSelect');
    const sortDirectionBtn = document.getElementById('sortDirection');

    // 初始化排序控件
    if (sortSelect) {
        sortSelect.value = sortBy;
        sortSelect.addEventListener('change', (e) => {
            sortBy = e.target.value;
            updateView();
        });
    }

    if (sortDirectionBtn) {
        sortDirectionBtn.textContent = sortDirection === 'asc' ? '↑' : '↓';
        sortDirectionBtn.addEventListener('click', () => {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            sortDirectionBtn.textContent = sortDirection === 'desc' ? '↓' : '↑';
            updateView();
        });
    }

    // 初始化语言选择器
    languageSelect.value = getCurrentLanguage();

    // 加载历史记录
    const loadHistoryItems = async () => {
        try {
            // 计算时间范围
            const endTime = Date.now();
            const startTime = 0;  // 从最早的记录开始

            // 获取所有历史记录
            historyItems = await chrome.history.search({
                text: '',
                maxResults: 100000,  // 设置一个足够大的值
                startTime,
                endTime
            });

            // 更新视图
            updateView();
        } catch (error) {
            const container = document.getElementById('container');
            if (container) {
                container.innerHTML = `<div style="color: red; padding: 20px;">
                    ${t('loadError', { error: error.message })}
                </div>`;
            }
        }
    };

    // 更新界面文本
    function updateUIText(skipViewUpdate = false) {
        document.title = t('title');

        // 更新分组选择器
        groupBySelect.innerHTML = `
            <option value="domain">${t('groupByDomain')}</option>
            <option value="date">${t('groupByDate')}</option>
        `;

        // 更新排序控件
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            const currentValue = sortSelect.value;
            sortSelect.innerHTML = `
                <option value="name">${t('sortByName')}</option>
                <option value="count">${t('sortByCount')}</option>
            `;
            sortSelect.value = currentValue || 'name';
        }

        // 更新其他控件
        themeToggle.textContent = t('toggleTheme');
        searchInput.placeholder = t('searchPlaceholder');
        searchButton.title = t('searchButton');
        searchPrev.title = t('prevMatch');
        searchNext.title = t('nextMatch');

        // 确保排序控件的显示状态正确
        const sortControls = document.getElementById('sortControls');
        if (sortControls) {
            sortControls.style.display = groupBySelect.value === 'domain' ? 'flex' : 'none';
        }

        // 只有在需要时且图��始化的情况下才更新视图
        if (!skipViewUpdate && typeof graph !== 'undefined' && graph !== null) {
            updateView();
        }
    }

    // 监听语言变化
    languageSelect.addEventListener('change', (e) => {
        const lang = e.target.value;
        setLanguage(lang);
    });

    // 监听语言变化事件
    window.addEventListener('languageChanged', () => {
        document.title = t('title');

        // 更新分组选择器
        groupBySelect.innerHTML = `
            <option value="domain">${t('groupByDomain')}</option>
            <option value="date">${t('groupByDate')}</option>
        `;

        // 更新题切换按钮
        themeToggle.textContent = t('toggleTheme');

        // 更新排序控件
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            const currentValue = sortSelect.value;
            sortSelect.innerHTML = `
                <option value="name">${t('sortByName')}</option>
                <option value="count">${t('sortByCount')}</option>
            `;
            sortSelect.value = currentValue || 'name';
        }

        // 更新搜索相关文本
        searchInput.placeholder = t('searchPlaceholder');
        searchButton.title = t('searchButton');
        searchPrev.title = t('prevMatch');
        searchNext.title = t('nextMatch');

        // 更新视图
        if (typeof graph !== 'undefined' && graph !== null) {
            updateView();
        }
    });

    // 初始化界面文本（跳过视图更新）
    updateUIText(true);

    // 主题切换函数
    const toggleTheme = () => {
        isDarkTheme = !isDarkTheme;
        document.body.classList.toggle('dark-theme', isDarkTheme);
        if (graph) {
            updateView();
        }
    };

    // 监听主题切换按钮
    themeToggle.addEventListener('click', toggleTheme);

    // 获取主题相关的颜色
    const getThemeColors = () => {
        return {
            root: {
                fill: isDarkTheme ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.5)',
                stroke: isDarkTheme ? '#475569' : '#94a3b8',
                textColor: isDarkTheme ? '#f1f5f9' : '#1e293b'
            },
            domain: {
                fill: isDarkTheme ? 'rgba(51, 65, 85, 0.8)' : 'rgba(241, 245, 249, 0.5)',
                stroke: isDarkTheme ? '#334155' : '#cbd5e1',
                textColor: isDarkTheme ? '#e2e8f0' : '#334155'
            },
            leaf: {
                fill: isDarkTheme ? 'rgba(71, 85, 105, 0.8)' : 'rgba(226, 232, 240, 0.5)',
                stroke: isDarkTheme ? '#1e293b' : '#94a3b8',
                textColor: isDarkTheme ? '#cbd5e1' : '#475569'
            }
        };
    };

    // 获取根域名的函数
    const getRootDomain = (hostname) => {
        // 检查是否是IP地址（包括IPv4和IPv6）
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

        // 如果是IP地址，直接返回完整地址
        if (ipv4Regex.test(hostname) || ipv6Regex.test(hostname)) {
            return hostname;
        }

        // 如果域名不包含点号或者是localhost，直接返回
        if (!hostname.includes('.') || hostname === 'localhost') {
            return hostname;
        }

        // 如果域名以数字开头，检查是否为纯数字和点组成的IP地址形式
        if (/^\d/.test(hostname)) {
            // 如果看起来像IP地址格式，直接返回
            if (hostname.split('.').every(part => !isNaN(part))) {
                return hostname;
            }
        }

        // 处理特殊情况
        const specialDomains = {
            'com.cn': true, 'net.cn': true, 'org.cn': true, 'gov.cn': true,
            'co.uk': true, 'co.jp': true, 'co.kr': true, 'co.nz': true,
            'com.au': true, 'com.tw': true, 'com.hk': true
        };

        const parts = hostname.split('.');

        // 如果部分，直接返回完整域名
        if (parts.length <= 2) {
            return hostname;
        }

        // 查最后两部分是否构成特殊顶级域名
        const lastTwoParts = parts.slice(-2).join('.');
        if (specialDomains[lastTwoParts]) {
            // 如果是特殊顶级域名，返回后部分
            return parts.slice(-3).join('.');
        }

        // 对于其他情况，返回后两部分
        return parts.slice(-2).join('.');
    };

    // 按域名分组
    const groupByDomain = (items) => {
        const groups = {};
        const otherGroup = {
            subdomains: {
                'other': []
            },
            totalCount: 0
        };

        items.forEach(item => {
            try {
                let hostname;
                // 尝试从URL中提取域名
                const urlStr = item.url.toLowerCase();

                // 改正则表达式以更好处理数字开头的域名和IP地址
                const domainMatch = urlStr.match(/^(?:https?:\/\/)?([^\/\s]+)/i);
                if (domainMatch) {
                    hostname = domainMatch[1].toLowerCase().trim();
                    // 移除可能的号和空（确保再次查
                    hostname = hostname.split(':')[0];
                } else {
                    // 果正则匹配失败，尝试使用 URL 对
                    try {
                        const url = new URL(urlStr);
                        hostname = url.hostname;
                    } catch (e) {
                        hostname = null;
                    }
                }

                if (!hostname) {
                    otherGroup.subdomains['other'].push(item);
                    otherGroup.totalCount++;
                    return;
                }

                // 除可能的端号和空格（确保再次查）
                hostname = hostname.split(':')[0].trim();

                // 果 chrome://  edge:// 特殊协议直接使用整名作为根名
                if (hostname.includes('://')) {
                    const rootDomain = hostname;
                    if (!groups[rootDomain]) {
                        groups[rootDomain] = {
                            subdomains: {},
                            totalCount: 0
                        };
                    }
                    if (!groups[rootDomain].subdomains[hostname]) {
                        groups[rootDomain].subdomains[hostname] = [];
                    }
                    groups[rootDomain].subdomains[hostname].push(item);
                    groups[rootDomain].totalCount++;
                    return;
                }

                let rootDomain;
                // 检查是否是IP地址（包括IPv4和IPv6）
                const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
                const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

                // 如果是IP地址或者以数字开头
                if (ipv4Regex.test(hostname) || ipv6Regex.test(hostname)) {
                    rootDomain = hostname;
                } else if (!hostname.includes('.') || hostname === 'localhost') {
                    // 如果是本地地址
                    rootDomain = hostname;
                } else {
                    // 处理域名
                    const parts = hostname.split('.');

                    // 处理特殊情况
                    const specialDomains = {
                        'com.cn': true, 'net.cn': true, 'org.cn': true, 'gov.cn': true,
                        'co.uk': true, 'co.jp': true, 'co.kr': true, 'co.nz': true,
                        'com.au': true, 'com.tw': true, 'com.hk': true
                    };

                    // 确定根域名
                    if (parts.length === 1) {
                        // 一级域
                        rootDomain = hostname;
                    } else {
                        // 检查是否是特殊域名
                        const lastTwoParts = parts.slice(-2).join('.');
                        if (specialDomains[lastTwoParts]) {
                            // 如果是特殊顶级域名（如 .com.cn），使用最后三部分作为根域名
                            rootDomain = parts.slice(-3).join('.');
                        } else {
                            // 使用最后两部分作为根名（如 bilibili.com）
                            rootDomain = parts.slice(-2).join('.');
                        }
                    }
                }

                if (!groups[rootDomain]) {
                    groups[rootDomain] = {
                        subdomains: {},
                        totalCount: 0
                    };
                }

                if (!groups[rootDomain].subdomains[hostname]) {
                    groups[rootDomain].subdomains[hostname] = [];
                }

                groups[rootDomain].subdomains[hostname].push(item);
                groups[rootDomain].totalCount++;
            } catch (error) {
                otherGroup.subdomains['other'].push(item);
                otherGroup.totalCount++;
            }
        });

        // 如果有无法析的 URL，添加 "他" 分组
        if (otherGroup.totalCount > 0) {
            groups[t('other')] = otherGroup;
        }

        return groups;
    };

    // 按日期分组
    const groupByDate = (items) => {
        const groups = {};
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        // 创建最近12个月的日期范围
        const monthRanges = [];
        for (let i = 0; i < 12; i++) {
            const date = new Date(currentYear, currentMonth - i, 1);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            monthRanges.push({ year, month });
        }

        items.forEach(item => {
            const date = new Date(item.lastVisitTime);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();

            // 检查是否在最近12个月内
            const isRecent = monthRanges.some(range => range.year === year && range.month === month);

            let groupKey;
            if (isRecent) {
                groupKey = `${year}-${month.toString().padStart(2, '0')}`;
            } else {
                groupKey = 'earlier';
            }

            if (!groups[groupKey]) {
                groups[groupKey] = {
                    year,
                    month,
                    isEarlier: groupKey === 'earlier',
                    days: {}
                };
            }

            if (!groups[groupKey].days[day]) {
                groups[groupKey].days[day] = [];
            }

            groups[groupKey].days[day].push(item);
        });

        return groups;
    };

    // 查找第一个可用的URL
    function findFirstUrl(node) {
        if (node.url) {
            return node.url;
        }
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                const url = findFirstUrl(child);
                if (url) {
                    return url;
                }
            }
        }
        return null;
    }

    // 构建树形数据
    const buildTreeData = (groups) => {
        const treeData = {
            id: 'root',
            label: t('title'),
            children: []
        };

        if (groupBySelect.value === 'domain') {
            // 域名分组的处理
            const entries = Object.entries(groups);

            // 根据选择的排序方式进行排序
            entries.sort((a, b) => {
                // 特殊处理"其他"分组，始终放在最后
                if (a[0] === t('other')) return 1;
                if (b[0] === t('other')) return -1;

                let result;
                if (sortBy === 'name') {
                    // 按域名字母排序
                    result = a[0].toLowerCase().localeCompare(b[0].toLowerCase());
                } else {
                    // 按数量排序
                    result = b[1].totalCount - a[1].totalCount;
                }
                return sortDirection === 'desc' ? -result : result;
            });

            entries.forEach(([rootDomain, domainData]) => {
                const rootNode = {
                    id: rootDomain,
                    label: `${rootDomain} (${domainData.totalCount})`,
                    children: [],
                    collapsed: true,
                    isRoot: true
                };

                // 对子域名进行排序
                const subdomainEntries = Object.entries(domainData.subdomains);
                subdomainEntries.sort((a, b) => {
                    let result;
                    if (sortBy === 'name') {
                        result = a[0].toLowerCase().localeCompare(b[0].toLowerCase());
                    } else {
                        result = b[1].length - a[1].length;
                    }
                    return sortDirection === 'desc' ? -result : result;
                });

                subdomainEntries.forEach(([subdomain, items]) => {
                    if (subdomain === rootDomain) {
                        // 对叶子节点进行排序
                        const sortedItems = [...items].sort((a, b) => {
                            let result;
                            if (sortBy === 'name') {
                                result = (a.title || a.url).toLowerCase().localeCompare((b.title || b.url).toLowerCase());
                            } else {
                                result = b.visitCount - a.visitCount;
                            }
                            return sortDirection === 'desc' ? -result : result;
                        });

                        sortedItems.forEach(item => {
                            rootNode.children.push({
                                id: String(item.id),
                                label: item.title || item.url,
                                url: item.url,
                                isLeaf: true
                            });
                        });
                    } else {
                        const subdomainNode = {
                            id: subdomain,
                            label: `${subdomain} (${items.length})`,
                            children: items
                                .sort((a, b) => {
                                    let result;
                                    if (sortBy === 'name') {
                                        result = (a.title || a.url).toLowerCase().localeCompare((b.title || b.url).toLowerCase());
                                    } else {
                                        result = b.visitCount - a.visitCount;
                                    }
                                    return sortDirection === 'desc' ? -result : result;
                                })
                                .map(item => ({
                                    id: String(item.id),
                                    label: item.title || item.url,
                                    url: item.url,
                                    isLeaf: true
                                })),
                            collapsed: true,
                            isSubdomain: true
                        };
                        rootNode.children.push(subdomainNode);
                    }
                });

                treeData.children.push(rootNode);
            });
        }

        return treeData;
    };

    // 初始折叠状态
    const initializeCollapsedState = (graph, treeData) => {
        // 首先确有节点见
        treeData.children.forEach(rootData => {
            const rootNode = graph.findById(rootData.id);
            if (rootNode) {
                graph.showItem(rootNode);
                // 显示连接到节点的边
                graph.getEdges().forEach(edge => {
                    if (edge.getSource().get('id') === rootData.id) {
                        graph.showItem(edge);
                    }
                });
            }
        });

        const processNodeState = (rootNode) => {
            const queue = [rootNode];
            const processedNodes = new Set();

            while (queue.length > 0) {
                const node = queue.shift();
                if (processedNodes.has(node.getModel().id)) continue;

                const nodeModel = node.getModel();
                processedNodes.add(nodeModel.id);

                if (nodeModel.children) {
                    nodeModel.children.forEach(childData => {
                        const childNode = graph.findById(childData.id);
                        if (childNode) {
                            if (nodeModel.collapsed) {
                                // 如果父节点是折叠态，隐藏子节点
                                graph.hideItem(childNode);
                                // 隐藏连接到子节点的边
                                graph.getEdges().forEach(edge => {
                                    if (edge.getTarget().get('id') === childData.id) {
                                        graph.hideItem(edge);
                                    }
                                });
                            } else {
                                // 如果父节点展开状态，显示子节点
                                graph.showItem(childNode);
                                // 显示连接到子节点的边
                                graph.getEdges().forEach(edge => {
                                    if (edge.getTarget().get('id') === childData.id) {
                                        graph.showItem(edge);
                                    }
                                });
                            }

                            if (childData.children) {
                                queue.push(childNode);
                            }
                        }
                    });
                }
            }
        };

        // 遍历所有节
        treeData.children.forEach(rootData => {
            const rootNode = graph.findById(rootData.id);
            if (rootNode) {
                // 保持根节点的折叠状态
                rootNode.getModel().collapsed = rootData.collapsed;
                processNodeState(rootNode);
            }
        });
    };

    // 获取favicon URL的工具函数
    function getFaviconUrl(node) {
        if (!node) return '';

        if (node.id === 'root') {
            return `chrome-extension://${chrome.runtime.id}/icons/icon48.png`;
        }

        if (node.url) {
            return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(node.url)}&size=16`;
        }

        if (node.id && node.id !== 'root') {
            return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=https://${encodeURIComponent(node.id)}&size=16`;
        }

        return '';
    }

    // 更新视图
    const updateView = () => {
        const container = document.getElementById('container');
        const width = container.scrollWidth;
        const height = container.scrollHeight || 600;

        if (graph) {
            graph.destroy();
        }

        // 注册自定义节点
        G6.registerNode('mindmap-node', {
            draw: (cfg, group) => {
                const { collapsed = true, children, isLeaf } = cfg;
                const height = 40;

                // 计算本宽度
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                context.font = '13px Arial';
                const textWidth = context.measureText(cfg.label).width;

                // 计算节点宽度：文本宽度 + 右padding + 按钮区域 + 图标区域
                const buttonSpace = (!isLeaf && children && children.length) ? 90 : 40;
                const iconSpace = (isLeaf || groupBySelect.value === 'domain') ? 24 : 0; // 在域名分组视图中所有节点都预留图标空间
                const maxTextWidth = 300; // 限制文本最大宽度
                const width = Math.min(Math.max(Math.min(textWidth, maxTextWidth) + 24 + buttonSpace + iconSpace, 180), 400);

                // 获取favicon URL
                let faviconUrl = '';
                if (cfg.id === 'root') {
                    faviconUrl = `chrome-extension://${chrome.runtime.id}/icons/icon48.png`;  // 用48x48的图标
                } else if (cfg.url) {
                    faviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(cfg.url)}&size=16`;
                } else if (cfg.id && cfg.id !== 'root') {
                    // 对于非叶子节点，使用域名构建favicon URL
                    faviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=https://${encodeURIComponent(cfg.id)}&size=16`;
                }

                // 计算文本是否需要截断
                const availableTextWidth = width - 24 - buttonSpace - (faviconUrl ? iconSpace : 0);
                let displayText = cfg.label;
                if (textWidth > availableTextWidth) {
                    // 计算能示的字符数
                    let start = 0;
                    let end = displayText.length;
                    let mid;
                    while (start < end) {
                        mid = Math.floor((start + end + 1) / 2);
                        const truncatedText = displayText.slice(0, mid) + '...';
                        const truncatedWidth = context.measureText(truncatedText).width;
                        if (truncatedWidth <= availableTextWidth) {
                            start = mid;
                        } else {
                            end = mid - 1;
                        }
                    }
                    displayText = displayText.slice(0, start) + '...';
                }

                // 获取当前主题的颜色方案
                const colorSchemes = getThemeColors();

                // 选择颜色方案
                let colorScheme;
                if (cfg.id === 'root') {
                    colorScheme = colorSchemes.root;
                } else if (isLeaf) {
                    colorScheme = colorSchemes.leaf;
                } else {
                    colorScheme = colorSchemes.domain;
                }

                // 绘制玻璃态背景
                const glassBg = group.addShape('rect', {
                    attrs: {
                        x: 0,
                        y: 0,
                        width,
                        height,
                        radius: 8,
                        fill: colorScheme.fill,
                        stroke: colorScheme.stroke,
                        lineWidth: 1,
                        opacity: isDarkTheme ? 1 : 0.9,
                        shadowColor: isDarkTheme ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.1)',
                        shadowBlur: isDarkTheme ? 3 : 10,
                        shadowOffsetX: isDarkTheme ? 1 : 2,
                        shadowOffsetY: isDarkTheme ? 1 : 4,
                    },
                    name: 'glass-bg'
                });

                // 只在亮色主题下添加玻璃态高光效果
                if (!isDarkTheme) {
                    group.addShape('rect', {
                        attrs: {
                            x: 0,
                            y: 0,
                            width: width / 2,
                            height: height / 2,
                            radius: [8, 0, 0, 0],
                            fill: 'rgba(255, 255, 255, 0.1)',
                            opacity: 0.3,
                        },
                        name: 'glass-highlight'
                    });
                }

                // 添加favicon
                if (faviconUrl) {
                    const iconSize = 16;  // 统一使用16x16的尺寸
                    const iconX = cfg.id === 'root' ? 8 : 12;  // 根节点的图标位置靠左一些
                    group.addShape('image', {
                        attrs: {
                            x: iconX,
                            y: height / 2 - iconSize / 2,
                            width: iconSize,
                            height: iconSize,
                            img: faviconUrl,
                            cursor: 'pointer',
                        },
                        name: 'favicon'
                    });
                }

                // 绘文本
                group.addShape('text', {
                    attrs: {
                        text: displayText,
                        x: faviconUrl ? (cfg.id === 'root' ? 28 : 36) : 12,  // 根节点的文本位置需要考虑图标间距
                        y: height / 2,
                        fontSize: 13,
                        fontFamily: 'Arial',
                        fill: colorScheme.textColor,
                        textBaseline: 'middle',
                        textAlign: 'left',
                        cursor: 'pointer',
                    },
                    name: 'label'
                });

                // 如果本被截断，添加完整文的title提示
                if (displayText !== cfg.label) {
                    group.addShape('text', {
                        attrs: {
                            text: cfg.label,
                            opacity: 0
                        },
                        name: 'title'
                    });
                }

                // 如果不是叶子节点，添加展开/折叠图标
                if (!isLeaf && children && children.length) {
                    const iconBox = group.addShape('circle', {
                        attrs: {
                            x: width - 52,
                            y: height / 2,
                            r: 12,
                            fill: colorScheme.fill,
                            stroke: colorScheme.stroke,
                            lineWidth: 1,
                            cursor: 'pointer',
                        },
                        name: 'icon-box'
                    });

                    group.addShape('text', {
                        attrs: {
                            x: width - 52,
                            y: height / 2,
                            text: collapsed ? '+' : '-',
                            fontSize: 16,
                            fontWeight: 'bold',
                            fill: colorScheme.textColor,
                            textAlign: 'center',
                            textBaseline: 'middle',
                            cursor: 'pointer',
                            dy: 1
                        },
                        name: 'collapse-text'
                    });
                }

                // 添加删除按钮
                group.addShape('circle', {
                    attrs: {
                        x: width - 24,
                        y: height / 2,
                        r: 12,
                        fill: colorScheme.fill,
                        stroke: colorScheme.stroke,
                        lineWidth: 1,
                        cursor: 'pointer',
                    },
                    name: 'delete-box'
                });

                group.addShape('text', {
                    attrs: {
                        x: width - 24,
                        y: height / 2,
                        text: '×',
                        fontSize: 16,
                        fontWeight: 'bold',
                        fill: colorScheme.textColor,
                        textAlign: 'center',
                        textBaseline: 'middle',
                        cursor: 'pointer',
                        dy: 1
                    },
                    name: 'delete-button'
                });

                // 添加hover效果
                group.on('mouseenter', () => {
                    glassBg.attr({
                        shadowBlur: isDarkTheme ? 6 : 20,
                        opacity: isDarkTheme ? 1 : 1,
                        shadowColor: isDarkTheme ? 'rgba(0, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.2)',
                    });
                });

                group.on('mouseleave', () => {
                    glassBg.attr({
                        shadowBlur: isDarkTheme ? 3 : 10,
                        opacity: isDarkTheme ? 1 : 0.9,
                        shadowColor: isDarkTheme ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.1)',
                    });
                });

                return glassBg;
            },
            update: (cfg, item) => {
                const group = item.getContainer();
                const textShape = group.find(element => element.get('name') === 'collapse-text');
                if (textShape) {
                    textShape.attr('text', cfg.collapsed ? '+' : '-');
                }
            },
        });

        // 创图例
        graph = new G6.TreeGraph({
            container: 'container',
            width,
            height,
            modes: {
                default: ['drag-canvas', 'zoom-canvas']
            },
            defaultNode: {
                type: 'mindmap-node',
                anchorPoints: [[0, 0.5], [1, 0.5]]
            },
            defaultEdge: {
                type: 'cubic-horizontal',
                style: {
                    stroke: 'rgb(143,115,243)',
                }
            },
            layout: {
                type: 'compactBox',
                direction: 'LR',
                getId: function getId(d) {
                    return d.id;
                },
                getHeight: () => 40,
                getWidth: (d) => {
                    // 创建时canvas计算文本宽
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    context.font = '13px Arial';
                    const textWidth = context.measureText(d.label).width;
                    const buttonSpace = (!d.isLeaf && d.children && d.children.length) ? 90 : 40;
                    const iconSpace = (d.isLeaf || groupBySelect.value === 'domain') ? 24 : 0; // 在域名分组视图中所节点都预留图标空间
                    const maxTextWidth = 300; // 限制文本最大宽度
                    return Math.min(Math.max(Math.min(textWidth, maxTextWidth) + 24 + buttonSpace + iconSpace, 180), 400);
                },
                getVGap: (node) => {
                    const model = node.getModel ? node.getModel() : node;
                    if (model.collapsed) return 10;
                    if (model.isLeaf) return 10;
                    if (model.isSubdomain) return 15;
                    return 20;
                },
                getHGap: () => 50,
                getSide: () => 'right',
                preventOverlap: true,
                preventOverlapPadding: 5,
            },
            animate: false,
            fitView: true,
            fitViewPadding: [50, 50, 50, 50],
            minZoom: 0.2,
            maxZoom: 2
        });

        // 数据
        const groupingMethod = groupBySelect.value;
        const groups = groupingMethod === 'domain'
            ? groupByDomain(historyItems)
            : groupByDate(historyItems);

        const treeData = buildTreeData(groups);
        treeDataCache = treeData;  // 存树形数据

        // 加载数据初始化
        graph.data(treeData);
        graph.render();

        // 确保所有根节点都
        graph.getNodes().forEach(node => {
            if (!node.get('parent')) {
                graph.showItem(node);
                // 显示连接到根节点的边
                graph.getEdges().forEach(edge => {
                    if (edge.getSource().get('id') === node.get('id')) {
                        graph.showItem(edge);
                    }
                });
            }
        });

        // 调 initializeCollapsedState 时入必要参数
        initializeCollapsedState(graph, treeData);

        // 处理节点的显示/隐藏
        const processChildren = (node, isCollapsed) => {
            const nodeModel = node.getModel();

            if (nodeModel.children) {
                // 只处理当前节点的直接子节点
                nodeModel.children.forEach(childData => {
                    const childNode = graph.findById(childData.id);
                    if (childNode) {
                        if (isCollapsed) {
                            // 折叠时隐藏子节点
                            graph.hideItem(childNode);
                            // 隐藏连接到子节点的边
                            graph.getEdges().forEach(edge => {
                                if (edge.getTarget().get('id') === childData.id) {
                                    graph.hideItem(edge);
                                }
                            });

                            // 归隐藏所有子节点的子节点
                            const hideChildren = (node) => {
                                if (node.children) {
                                    node.children.forEach(grandChild => {
                                        const grandChildNode = graph.findById(grandChild.id);
                                        if (grandChildNode) {
                                            graph.hideItem(grandChildNode);
                                            graph.getEdges().forEach(edge => {
                                                if (edge.getTarget().get('id') === grandChild.id) {
                                                    graph.hideItem(edge);
                                                }
                                            });
                                            hideChildren(grandChild);
                                        }
                                    });
                                }
                            };
                            hideChildren(childData);
                        } else {
                            // 展开时只显示直接子节点
                            graph.showItem(childNode);
                            // 显示连接到子节点边的边
                            graph.getEdges().forEach(edge => {
                                if (edge.getTarget().get('id') === childData.id) {
                                    graph.showItem(edge);
                                }
                            });

                            // 保持子节点折叠状态
                            if (childNode.getModel().collapsed) {
                                // 如果子节点是折叠态，确保其子点保
                                const hideCollapsedChildren = (node) => {
                                    if (node.children) {
                                        node.children.forEach(grandChild => {
                                            const grandChildNode = graph.findById(grandChild.id);
                                            if (grandChildNode) {
                                                graph.hideItem(grandChildNode);
                                                graph.getEdges().forEach(edge => {
                                                    if (edge.getTarget().get('id') === grandChild.id) {
                                                        graph.hideItem(edge);
                                                    }
                                                });
                                                hideCollapsedChildren(grandChild);
                                            }
                                        });
                                    }
                                };
                                hideCollapsedChildren(childData);
                            }
                        }
                    }
                });
            }
        };

        // 修改节点点击事件处理
        graph.on('node:click', async (evt) => {
            const { item, target } = evt;
            const model = item.getModel();
            const targetName = target.get('name');

            // 处理删除按钮点击
            if (targetName === 'delete-button' || targetName === 'delete-box') {
                const confirmDelete = confirm(t('deleteConfirm'));
                if (!confirmDelete) return;

                try {
                    // 获取当前视图状态
                    const zoom = graph.getZoom();
                    const matrix = graph.getGroup().getMatrix();

                    if (model.isLeaf) {
                        // 删除个页面记录
                        await chrome.history.deleteUrl({ url: model.url });

                        // 父点数据
                        const parentNode = graph.findById(item.get('parent'));
                        if (parentNode) {
                            const parentModel = parentNode.getModel();
                            // 从节点的children移除当前节点
                            parentModel.children = parentModel.children.filter(child => child.id !== model.id);
                            // 更新父节点显示的数
                            const count = parentModel.children.length;
                            const newLabel = parentModel.label.replace(/\(\d+\)/, `(${count})`);
                            graph.updateItem(parentNode, {
                                ...parentModel,
                                label: newLabel
                            });

                            // 如果点没有子节点了，删除父节点
                            if (count === 0) {
                                const grandParentNode = graph.findById(parentNode.get('parent'));
                                if (grandParentNode) {
                                    const grandParentModel = grandParentNode.getModel();
                                    grandParentModel.children = grandParentModel.children.filter(child => child.id !== parentModel.id);
                                    graph.updateItem(grandParentNode, grandParentModel);
                                }
                                graph.removeItem(parentNode);
                            }
                        }

                        // 移除当前节点
                        graph.removeItem(item);
                    } else {
                        // 删除域名日期下有记录
                        const deletePromises = [];
                        const collectUrlsToDelete = (rootNode) => {
                            const queue = [rootNode];
                            const processedNodes = new Set();

                            while (queue.length > 0) {
                                const node = queue.shift();
                                if (processedNodes.has(node.id)) continue;
                                processedNodes.add(node.id);

                                if (node.isLeaf && node.url) {
                                    deletePromises.push(chrome.history.deleteUrl({ url: node.url }));
                                }
                                if (node.children) {
                                    queue.push(...node.children);
                                }
                            }
                        };
                        collectUrlsToDelete(model);
                        await Promise.all(deletePromises);

                        // 从父节点中移除当前节点
                        const parentNode = graph.findById(item.get('parent'));
                        if (parentNode) {
                            const parentModel = parentNode.getModel();
                            parentModel.children = parentModel.children.filter(child => child.id !== model.id);
                            graph.updateItem(parentNode, parentModel);
                        }

                        // 除当前节点及其所有子节点
                        const removeNodeAndChildren = (rootNode) => {
                            const queue = [rootNode];
                            const processedNodes = new Set();

                            while (queue.length > 0) {
                                const node = queue.shift();
                                if (processedNodes.has(node.id)) continue;
                                processedNodes.add(node.id);

                                if (node.children) {
                                    node.children.forEach(child => {
                                        const childNode = graph.findById(child.id);
                                        if (childNode) {
                                            queue.push(childNode.getModel());
                                            graph.removeItem(childNode);
                                        }
                                    });
                                }
                            }
                        };
                        removeNodeAndChildren(model);
                        graph.removeItem(item);
                    }

                    // 更新内部数据
                    const allHistory = await chrome.history.search({
                        text: '',
                        maxResults: 100000,
                        startTime: 0
                    });

                    // 更新历史记录
                    historyItems = allHistory;

                    // 存储所有展开节点的ID和它们的父节点ID
                    const expandedNodeIds = new Set();
                    const expandedParentIds = new Set();
                    graph.getNodes().forEach(node => {
                        const nodeModel = node.getModel();
                        if (!nodeModel.collapsed) {
                            expandedNodeIds.add(nodeModel.id);
                            const parentNode = graph.findById(node.get('parent'));
                            if (parentNode) {
                                expandedParentIds.add(parentNode.get('id'));
                            }
                        }
                    });

                    // 重新构建数据并更新图
                    const groupingMethod = groupBySelect.value;
                    const groups = groupingMethod === 'domain'
                        ? groupByDomain(historyItems)
                        : groupByDate(historyItems);

                    // 恢复节点的展开状态
                    const restoreExpandState = (treeData) => {
                        if (treeData.children) {
                            treeData.children.forEach(node => {
                                // 如果节点ID在展开集合或者它是展开节点的父节点，则设置为展开状态
                                if (expandedNodeIds.has(node.id) || expandedParentIds.has(node.id)) {
                                    node.collapsed = false;
                                }
                                if (node.children) {
                                    restoreExpandState(node);
                                }
                            });
                        }
                        return treeData;
                    };

                    const newTreeData = restoreExpandState(buildTreeData(groups));
                    graph.changeData(newTreeData);

                    // 隐藏折叠节点的节点
                    const hideCollapsedChildren = (rootNode) => {
                        const queue = [{ node: rootNode, parentCollapsed: false }];
                        const processedNodes = new Set();

                        while (queue.length > 0) {
                            const { node, parentCollapsed } = queue.shift();
                            const model = node.getModel();

                            if (processedNodes.has(model.id)) continue;
                            processedNodes.add(model.id);

                            if (model.children) {
                                const isCurrentNodeCollapsed = model.collapsed;
                                model.children.forEach(childData => {
                                    const childNode = graph.findById(childData.id);
                                    if (childNode) {
                                        // 只有当当前节点折叠或节点折叠时才隐藏子节点
                                        if (isCurrentNodeCollapsed || parentCollapsed) {
                                            graph.hideItem(childNode);
                                            graph.getEdges().forEach(edge => {
                                                if (edge.getTarget().get('id') === childData.id) {
                                                    graph.hideItem(edge);
                                                }
                                            });
                                        }
                                        // 将父节点的折叠态传给子节点
                                        queue.push({
                                            node: childNode,
                                            parentCollapsed: isCurrentNodeCollapsed || parentCollapsed
                                        });
                                    }
                                });
                            }
                        }
                    };

                    // 处理所有根点
                    const rootNodes = graph.getNodes().filter(node => !node.get('parent'));
                    rootNodes.forEach(rootNode => {
                        hideCollapsedChildren(rootNode);
                    });

                    // 恢复视图状态
                    if (matrix) {
                        setTimeout(() => {
                            graph.getGroup().setMatrix(matrix);
                            graph.zoomTo(zoom);
                        }, 0);
                    }
                } catch (error) {
                    console.error('Error deleting history:', error);
                    alert(t('deleteError'));
                }
                return;
            }

            // 处理叶子节点点击
            if (model.isLeaf && model.url) {
                chrome.tabs.create({ url: model.url });
                return;
            }

            // 处理展开/折叠
            model.collapsed = !model.collapsed;
            const collapsed = model.collapsed;

            // 更新展开/折叠图标
            const group = item.getContainer();
            const icon = group.find(element => element.get('name') === 'collapse-text');
            if (icon) {
                icon.attr('text', collapsed ? '+' : '-');
            }

            // 处理子节点显示/隐��
            processChildren(item, collapsed);

            // 更新节点状态
            graph.updateItem(item, {
                collapsed: collapsed
            });

            // 重新布局
            graph.layout();
        });

        // 监听分组方式变化
        groupBySelect.addEventListener('change', () => {
            const sortControls = document.getElementById('sortControls');
            if (sortControls) {
                sortControls.style.display = groupBySelect.value === 'domain' ? 'flex' : 'none';
            }
            updateView();
        });

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            if (graph) {
                const container = document.getElementById('container');
                graph.changeSize(container.scrollWidth, container.scrollHeight);
            }
        });

        // 初始化搜索功能
        initializeSearch();

        // Initialize sort controls
        const sortSelect = document.getElementById('sortSelect');
        const sortDirectionBtn = document.getElementById('sortDirection');

        function updateSortControls() {
            if (sortSelect) {
                const currentValue = sortSelect.value;
                sortSelect.innerHTML = `
                    <option value="name">${t('sortByName')}</option>
                    <option value="count">${t('sortByCount')}</option>
                `;
                sortSelect.value = currentValue || 'name';
            }
        }

        // Add language change listener
        window.addEventListener('languageChanged', updateSortControls);

        // Initial update
        updateSortControls();
    };

    function initializeSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchButton = document.getElementById('searchButton');
        const searchPrev = document.getElementById('searchPrev');
        const searchNext = document.getElementById('searchNext');

        // 执行搜索的函数
        const executeSearch = () => {
            const query = searchInput.value.trim();
            if (query) {
                performSearch(query);
            }
        };

        // 监听回车键
        searchInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                executeSearch();
            }
        });

        // 监听搜索按钮点击
        searchButton.addEventListener('click', executeSearch);

        // 导航按钮点击事
        searchPrev.addEventListener('click', () => {
            navigateSearch('prev');
        });

        searchNext.addEventListener('click', () => {
            navigateSearch('next');
        });
    }

    function performSearch(query) {
        // 除之前搜索结果
        clearSearchHighlights();
        searchResults = [];
        currentSearchIndex = -1;

        if (!query || !treeDataCache) {
            updateSearchInfo();
            return;
        }

        const queryLower = query.toLowerCase();

        // 存储所有匹配的节点和它的路径
        const matchedPaths = [];

        // 递归索函数
        function searchNode(nodeData, currentPath = []) {
            const label = nodeData.label || '';
            const url = nodeData.url || '';
            const isMatched = label.toLowerCase().includes(queryLower) || url.toLowerCase().includes(queryLower);

            // 果当节点匹配，记录完路径
            if (isMatched) {
                matchedPaths.push([...currentPath, nodeData]);
            }

            // 继续搜索节点论是否叠
            if (nodeData.children) {
                nodeData.children.forEach(child => {
                    searchNode(child, [...currentPath, nodeData]);
                });
            }
        }

        // 从缓存的树形数据始搜索
        if (treeDataCache.children) {
            treeDataCache.children.forEach(child => {
                searchNode(child, []);
            });
        }

        // 如果没匹配结果，直接返回
        if (matchedPaths.length === 0) {
            updateSearchInfo();
            return;
        }

        // 找到最大
        const maxDepth = Math.max(...matchedPaths.map(path => path.length));

        // 按深度逐层展开节点
        function expandNodesAtDepth(depth) {
            let hasExpandedNodes = false;

            matchedPaths.forEach(path => {
                if (path.length >= depth) {
                    const nodeData = path[depth - 1];
                    const node = graph.findById(nodeData.id);
                    if (node) {
                        const model = node.getModel();
                        if (model.collapsed) {
                            hasExpandedNodes = true;
                            model.collapsed = false;
                            graph.updateItem(node, {
                                collapsed: false
                            });

                            // 更新展开/折叠图标
                            const group = node.getContainer();
                            const icon = group.find(element => element.get('name') === 'collapse-text');
                            if (icon) {
                                icon.attr('text', '-');
                            }

                            // 显示当前节点
                            graph.showItem(node);

                            // 显示到下一层点的边
                            if (depth < path.length) {
                                const nextNodeData = path[depth];
                                graph.getEdges().forEach(edge => {
                                    if (edge.getSource().get('id') === nodeData.id &&
                                        edge.getTarget().get('id') === nextNodeData.id) {
                                        graph.showItem(edge);
                                    }
                                });
                            }
                        }
                    }
                }
            });

            // 如果当前度有节点被展开更新布局
            if (hasExpandedNodes) {
                graph.layout();
                graph.paint();
            }

            // 果还有更深的层级继续展开
            if (depth < maxDepth) {
                setTimeout(() => {
                    expandNodesAtDepth(depth + 1);
                }, 100); // 延迟100ms展开下一层
            } else {
                // 所有层级都展开完成后亮匹配节点
                highlightMatchedNodes();
            }
        }

        // 高亮匹配的节点
        function highlightMatchedNodes() {
            searchResults = matchedPaths.map(path => {
                const targetNode = graph.findById(path[path.length - 1].id);
                if (targetNode) {
                    // 确保点
                    graph.showItem(targetNode);

                    // 添加高亮效果
                    const bbox = targetNode.getBBox();
                    targetNode.get('group').addShape('rect', {
                        attrs: {
                            x: 0,
                            y: 0,
                            width: bbox.width,
                            height: bbox.height,
                            fill: 'transparent',
                            stroke: '#3b82f6',
                            lineWidth: 2,
                            radius: 8
                        },
                        name: 'search-highlight'
                    });
                    return targetNode;
                }
                return null;
            }).filter(Boolean);

            // 更新搜索信息
            updateSearchInfo();

            // 如果有搜索结果，跳转到第一个
            if (searchResults.length > 0) {
                currentSearchIndex = 0;
                focusSearchResult();
            }
        }

        // 开始从第一层展开
        expandNodesAtDepth(1);
    }

    function focusSearchResult() {
        const node = searchResults[currentSearchIndex];
        if (!node) return;

        // 获取节点的大小信息
        const bbox = node.getBBox();
        const group = node.get('group');

        // 清除前的焦点样式
        const oldFocus = group.findAll(element => element.get('name') === 'search-focus');
        oldFocus.forEach(shape => shape.remove());

        // 添加焦点样式
        group.addShape('rect', {
            attrs: {
                x: 0,
                y: 0,
                width: bbox.width,
                height: bbox.height,
                fill: 'transparent',
                stroke: '#f59e0b',
                lineWidth: 3,
                radius: 8,
                shadowColor: 'rgba(245, 158, 11, 0.5)',
                shadowBlur: 8
            },
            name: 'search-focus'
        });

        // 获取当前节点的所有父节点
        const getParentNodes = (node) => {
            const parents = [];
            let current = node;
            while (current.get('parent')) {
                const parent = graph.findById(current.get('parent'));
                if (parent) {
                    parents.push(parent);
                    current = parent;
                } else {
                    break;
                }
            }
            return parents;
        };

        // 计算包含当前节点及其所有父节点的边框
        const parentNodes = getParentNodes(node);
        const allNodes = [node, ...parentNodes];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        allNodes.forEach(n => {
            const box = n.getBBox();
            const matrix = n.get('group').getMatrix();
            const x = matrix[6];
            const y = matrix[7];

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + box.width);
            maxY = Math.max(maxY, y + box.height);
        });

        // 计算合适的缩放级别
        const padding = 100;  // 边距
        const viewportWidth = graph.get('width');
        const viewportHeight = graph.get('height');
        const contentWidth = maxX - minX + padding * 2;
        const contentHeight = maxY - minY + padding * 2;

        const scaleX = viewportWidth / contentWidth;
        const scaleY = viewportHeight / contentHeight;
        const scale = Math.min(Math.min(scaleX, scaleY), 1);  // 限制最大缩放级别为1

        // 先缩放到合适的级别
        graph.zoomTo(scale, {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2
        });

        // 然后使用 focusItem 显示当前节点
        graph.focusItem(node, true, {
            easing: 'easeCubic',
            duration: 300,
            padding: [50, 50, 50, 50]
        });

        // 更新搜索信息
        updateSearchInfo();
    }

    function navigateSearch(direction) {
        if (searchResults.length === 0) return;

        clearSearchFocus();

        if (direction === 'prev') {
            currentSearchIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
        } else {
            currentSearchIndex = (currentSearchIndex + 1) % searchResults.length;
        }

        focusSearchResult();
    }

    function clearSearchHighlights() {
        graph.findAll('node', node => {
            const group = node.get('group');
            // 移除所有索相关形状
            const shapes = group.get('children').filter(shape =>
                shape.get('name') === 'search-highlight' ||
                shape.get('name') === 'search-focus'
            );
            shapes.forEach(shape => shape.remove());
            return false;
        });
        graph.paint();
    }

    function clearSearchFocus() {
        graph.findAll('node', node => {
            const group = node.get('group');
            // 移除焦点亮
            const shapes = group.get('children').filter(shape =>
                shape.get('name') === 'search-focus'
            );
            shapes.forEach(shape => shape.remove());
            return false;
        });
        graph.paint();
    }

    function updateSearchInfo() {
        if (searchResults.length === 0) {
            searchInfo.textContent = t('noMatch');
        } else {
            searchInfo.textContent = t('matchCount', {
                current: currentSearchIndex + 1,
                total: searchResults.length
            });
        }
    }

    try {
        if (typeof G6 === 'undefined') {
            throw new Error('G6 库未能正确载');
        }

        // 初始加载
        await loadHistoryItems();

    } catch (error) {
        const container = document.getElementById('container');
        if (container) {
            container.innerHTML = `<div style="color: red; padding: 20px;">
                ${t('loadError', { error: error.message })}
            </div>`;
        }
    }
}); 