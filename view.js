document.addEventListener('DOMContentLoaded', async () => {
    const groupBySelect = document.getElementById('groupBy');
    const themeToggle = document.getElementById('themeToggle');
    const searchInput = document.getElementById('searchInput');
    const searchPrev = document.getElementById('searchPrev');
    const searchNext = document.getElementById('searchNext');
    const searchInfo = document.getElementById('searchInfo');
    const languageSelect = document.getElementById('language');
    const paginationContainer = document.getElementById('paginationContainer');

    // 初始化语言选择器
    languageSelect.value = getCurrentLanguage();

    let graph = null;
    let isDarkTheme = false;
    let historyItems = [];
    let searchResults = [];
    let currentSearchIndex = -1;
    let treeDataCache = null;
    let allNodes = [];
    let currentPage = 1;
    let totalPages = 1;
    const itemsPerPage = 1000;

    // 更新分页按钮
    const updatePagination = (totalItems) => {
        totalPages = Math.ceil(totalItems / itemsPerPage);
        paginationContainer.innerHTML = '';

        // 如果总页数小于1
        if (totalPages <= 1) {
            paginationContainer.style.display = 'none';
            return;
        }

        paginationContainer.style.display = 'flex';
        for (let i = 1; i <= totalPages; i++) {
            const button = document.createElement('button');
            button.className = `pagination-button ${i === currentPage ? 'active' : ''}`;
            const start = (i - 1) * itemsPerPage;
            button.textContent = `${start + 1}+`;
            button.addEventListener('click', () => {
                if (currentPage !== i) {
                    currentPage = i;
                    loadHistoryItems();
                }
            });
            paginationContainer.appendChild(button);
        }
    };

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
        groupBySelect.innerHTML = `
            <option value="domain">${t('groupByDomain')}</option>
            <option value="date">${t('groupByDate')}</option>
        `;
        themeToggle.textContent = t('toggleTheme');
        searchInput.placeholder = t('searchPlaceholder');
        searchButton.title = t('searchButton');
        searchPrev.title = t('prevMatch');
        searchNext.title = t('nextMatch');

        // 只有在需要时且图已初始化的情况下才更新视图
        if (!skipViewUpdate && typeof graph !== 'undefined' && graph !== null) {
            updateView();
        }
    }

    // 监听语言变化
    languageSelect.addEventListener('change', (e) => {
        setLanguage(e.target.value);
        updateUIText();
    });

    window.addEventListener('languageChanged', () => {
        updateUIText();
    });

    // 初始化界面文本（跳过视图更新）
    updateUIText(true);

    // 找第个URL
    const findFirstUrl = (node) => {
        if (node.url) return node.url;
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                const url = findFirstUrl(child);
                if (url) return url;
            }
        }
        return null;
    };

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
                fill: isDarkTheme ? 'rgba(30, 41, 59, 0.5)' : 'rgba(255, 255, 255, 0.5)',
                stroke: isDarkTheme ? '#64748b' : '#94a3b8',
                textColor: isDarkTheme ? '#f1f5f9' : '#1e293b'
            },
            domain: {
                fill: isDarkTheme ? 'rgba(51, 65, 85, 0.5)' : 'rgba(241, 245, 249, 0.5)',
                stroke: isDarkTheme ? '#475569' : '#cbd5e1',
                textColor: isDarkTheme ? '#e2e8f0' : '#334155'
            },
            leaf: {
                fill: isDarkTheme ? 'rgba(71, 85, 105, 0.5)' : 'rgba(226, 232, 240, 0.5)',
                stroke: isDarkTheme ? '#334155' : '#94a3b8',
                textColor: isDarkTheme ? '#cbd5e1' : '#475569'
            }
        };
    };

    // 获取根域名的函数
    const getRootDomain = (hostname) => {
        // 检查是否是IP地址（包括IPv4和IPv6）
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

        // 果是IP地址，直接返回完整地址
        if (ipv4Regex.test(hostname) || ipv6Regex.test(hostname)) {
            return hostname;
        }

        // 如果域名不包含点号或者是localhost，直返回
        if (!hostname.includes('.') || hostname === 'localhost') {
            return hostname;
        }

        // 如域名以数字开头，检查是否为纯数字和点组成的IP地址形式
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

        // 如果只有两部分，直接返回完整域名
        if (parts.length <= 2) {
            return hostname;
        }

        // 查最后两部分是否构成特殊顶级域名
        const lastTwoParts = parts.slice(-2).join('.');
        if (specialDomains[lastTwoParts]) {
            // 如果是特顶级域名，返回后三部分
            return parts.slice(-3).join('.');
        }

        // 对于其他情况，返回最后两部分
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
                    // 移除可能的端号和空格（确保再次查
                    hostname = hostname.split(':')[0];
                } else {
                    // 如果正则匹配失败，尝试使用 URL 对
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

                // 果 chrome://  edge:// 特殊协议直接使用完整名作为根名
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
                        // 检查是否是特殊顶域名
                        const lastTwoParts = parts.slice(-2).join('.');
                        if (specialDomains[lastTwoParts]) {
                            // 如果是特殊顶级域名（如 .com.cn），使用最后三部分作为根域
                            rootDomain = parts.slice(-3).join('.');
                        } else {
                            // 使用最后两部分作为根域名（如 bilibili.com）
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

    // 构建树形数据
    const buildTreeData = (groups) => {
        let treeData = {
            id: 'root',
            label: t('title'),
            children: [],
            collapsed: false
        };

        if (groupBySelect.value === 'date') {
            // 获取所有月份并排序
            const monthKeys = Object.keys(groups).sort((a, b) => {
                if (a === 'earlier') return 1;
                if (b === 'earlier') return -1;
                return b.localeCompare(a);
            });

            monthKeys.forEach(monthKey => {
                const monthData = groups[monthKey];
                const monthNode = {
                    id: monthKey,
                    label: monthData.isEarlier ? '更早' : `${monthData.year}年${monthData.month}月`,
                    children: [],
                    collapsed: true
                };

                // 获取所有期并排序
                const days = Object.keys(monthData.days).sort((a, b) => b - a);
                days.forEach(day => {
                    const items = monthData.days[day];
                    const dayNode = {
                        id: `${monthKey}-day-${day}`,
                        label: `${day}日 (${items.length})`,
                        children: items.map(item => ({
                            id: String(item.id),
                            label: item.title || item.url,
                            url: item.url,
                            isLeaf: true
                        })),
                        collapsed: true
                    };
                    monthNode.children.push(dayNode);
                });

                // 更新月份节点的标签，添加记录总数
                const totalItems = monthNode.children.reduce((sum, day) => sum + day.children.length, 0);
                monthNode.label = monthData.isEarlier ?
                    `更早 (${totalItems})` :
                    `${monthData.year}年${monthData.month}月 (${totalItems})`;

                treeData.children.push(monthNode);
            });
        } else {
            // 域名分组的处理
            const entries = Object.entries(groups);

            // 按照域名首字母排
            entries.sort((a, b) => {
                // 特殊处理"其他"分组，始终放在最后
                if (a[0] === t('other')) return 1;
                if (b[0] === t('other')) return -1;
                // 其他情况按照域名字母排序
                return a[0].toLowerCase().localeCompare(b[0].toLowerCase());
            });

            entries.forEach(([rootDomain, domainData]) => {
                const rootNode = {
                    id: rootDomain,
                    label: `${rootDomain} (${domainData.totalCount})`,
                    children: [],
                    collapsed: true,  // 默认折叠根节点
                    isRoot: true
                };

                // 对子域名进行排序
                const subdomainEntries = Object.entries(domainData.subdomains)
                    .sort((a, b) => b[1].length - a[1].length);

                subdomainEntries.forEach(([subdomain, items]) => {
                    // 如果子域名和根域名相同，直接加叶子节点
                    if (subdomain === rootDomain) {
                        items.sort((a, b) => b.lastVisitTime - a.lastVisitTime)
                            .forEach(item => {
                                rootNode.children.push({
                                    id: String(item.id),
                                    label: item.title || item.url,
                                    url: item.url,
                                    isLeaf: true
                                });
                            });
                    } else {
                        // 否则创子域名节点
                        const subdomainNode = {
                            id: subdomain,
                            label: `${subdomain} (${items.length})`,
                            children: items
                                .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
                                .map(item => ({
                                    id: String(item.id),
                                    label: item.title || item.url,
                                    url: item.url,
                                    isLeaf: true
                                })),
                            collapsed: true,  // 默认折叠子域名节点
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
        // 首先确保有节点见
        treeData.children.forEach(rootData => {
            const rootNode = graph.findById(rootData.id);
            if (rootNode) {
                graph.showItem(rootNode);
                // 显示连接到根节点的边
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
                                // 如果父节点是折叠状态，隐藏子节点
                                graph.hideItem(childNode);
                                // 隐藏连接到子节点的边
                                graph.getEdges().forEach(edge => {
                                    if (edge.getTarget().get('id') === childData.id) {
                                        graph.hideItem(edge);
                                    }
                                });
                            } else {
                                // 如果父节点是展开状态，显示子节点
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

        // 遍历所有节点
        treeData.children.forEach(rootData => {
            const rootNode = graph.findById(rootData.id);
            if (rootNode) {
                // 保持根节点的折叠状态
                rootNode.getModel().collapsed = rootData.collapsed;
                processNodeState(rootNode);
            }
        });
    };

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

                // 计算节点宽度：文本宽度 + 左右padding + 按钮区域 + 图标区域
                const buttonSpace = (!isLeaf && children && children.length) ? 90 : 40;
                const iconSpace = isLeaf && cfg.url ? 24 : 0; // 只在叶子节点且有URL时预留图标空间
                const maxTextWidth = 300; // 限制文本最大宽度
                const width = Math.min(Math.max(Math.min(textWidth, maxTextWidth) + 24 + buttonSpace + iconSpace, 180), 400);

                // 获取favicon URL
                let faviconUrl = '';
                if (isLeaf && cfg.url) {  // 只在叶子节点且有URL时显示favicon
                    faviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(cfg.url)}&size=16`;
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
                        opacity: 0.9,
                        shadowColor: isDarkTheme ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)',
                        shadowBlur: 10,
                        shadowOffsetX: 2,
                        shadowOffsetY: 4,
                    },
                    name: 'glass-bg'
                });

                // 绘制玻璃态效果
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

                // 添加favicon
                if (faviconUrl) {
                    group.addShape('image', {
                        attrs: {
                            x: 12,
                            y: height / 2 - 8,
                            width: 16,
                            height: 16,
                            img: faviconUrl,
                            cursor: 'pointer',
                        },
                        name: 'favicon'
                    });
                }

                // 绘制文本
                group.addShape('text', {
                    attrs: {
                        text: displayText,
                        x: faviconUrl ? 36 : 12,  // 根据是否有favicon调整文本位置
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

                // 添加标悬停效
                group.on('mouseenter', () => {
                    glassBg.attr({
                        shadowBlur: 20,
                        opacity: 1,
                    });
                });

                group.on('mouseleave', () => {
                    glassBg.attr({
                        shadowBlur: 10,
                        opacity: 0.9,
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

        // 创建图例
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
                    // 创建时canvas计算文本宽度
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    context.font = '13px Arial';
                    const textWidth = context.measureText(d.label).width;
                    const buttonSpace = (!d.isLeaf && d.children && d.children.length) ? 90 : 40;
                    const iconSpace = d.isLeaf && d.url ? 24 : 0; // 只在叶子节点且有URL时预留图标空间
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
        treeDataCache = treeData;  // 缓存树形数据

        // 加载数据初始化
        graph.data(treeData);
        graph.render();

        // 确保所有根节点都见
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

        // 调用 initializeCollapsedState 时入必要参数
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
                            // 显示连接到子节点的边
                            graph.getEdges().forEach(edge => {
                                if (edge.getTarget().get('id') === childData.id) {
                                    graph.showItem(edge);
                                }
                            });

                            // 保持子节点折叠状态
                            if (childNode.getModel().collapsed) {
                                // 如果子节点是折叠态，确保其子节点保持
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
                        // 删除单个页面记录
                        await chrome.history.deleteUrl({ url: model.url });

                        // 父点数据
                        const parentNode = graph.findById(item.get('parent'));
                        if (parentNode) {
                            const parentModel = parentNode.getModel();
                            // 从父节点的children中移除当前节点
                            parentModel.children = parentModel.children.filter(child => child.id !== model.id);
                            // 更新父节点显示的数
                            const count = parentModel.children.length;
                            const newLabel = parentModel.label.replace(/\(\d+\)/, `(${count})`);
                            graph.updateItem(parentNode, {
                                ...parentModel,
                                label: newLabel
                            });

                            // 如果节点没有子节点了，删除父节点
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

                        // 移除当前节点及其所有子节点
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
                        maxResults: 10000,
                        startTime: 0
                    });

                    // 更新分页
                    updatePagination(allHistory.length);

                    // 获取当前页的历史记录
                    const start = (currentPage - 1) * itemsPerPage;
                    const end = currentPage * itemsPerPage;
                    historyItems = allHistory.slice(start, end);

                    // 存储所有展开节点的ID和它们的父节点ID
                    const expandedNodeIds = new Set();
                    const expandedParentIds = new Set();
                    graph.getNodes().forEach(node => {
                        const nodeModel = node.getModel();
                        if (!nodeModel.collapsed) {
                            expandedNodeIds.add(nodeModel.id);
                            // 如果是展开节点，父节点也应该是展开的
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
                                // 如果节点ID在展开集合中，或者它是展开节点的父节点，则设置为展开状态
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

                    // 隐藏折叠节点的子节点
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
                                        // 将父节点的折叠状态传给子节点
                                        queue.push({
                                            node: childNode,
                                            parentCollapsed: isCurrentNodeCollapsed || parentCollapsed
                                        });
                                    }
                                });
                            }
                        }
                    };

                    // 处理所有根节点
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

            // 处理子节点显示/隐藏
            processChildren(item, collapsed);

            // 更新节点状态
            graph.updateItem(item, {
                collapsed: collapsed
            });

            // 重新布局
            graph.layout();
        });

        // 监听分组方式变化
        groupBySelect.addEventListener('change', updateView);

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            if (graph) {
                const container = document.getElementById('container');
                graph.changeSize(container.scrollWidth, container.scrollHeight);
            }
        });

        // 初始化搜索功能
        initializeSearch();
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

        // 导航按钮点击事件
        searchPrev.addEventListener('click', () => {
            navigateSearch('prev');
        });

        searchNext.addEventListener('click', () => {
            navigateSearch('next');
        });
    }

    function performSearch(query) {
        // 除之前的搜索结果
        clearSearchHighlights();
        searchResults = [];
        currentSearchIndex = -1;

        if (!query || !treeDataCache) {
            updateSearchInfo();
            return;
        }

        const queryLower = query.toLowerCase();

        // 存储所有匹配的节点和它们的路径
        const matchedPaths = [];

        // 递归搜索函数
        function searchNode(nodeData, currentPath = []) {
            const label = nodeData.label || '';
            const url = nodeData.url || '';
            const isMatched = label.toLowerCase().includes(queryLower) || url.toLowerCase().includes(queryLower);

            // 果当前节点匹配，记录完整路径
            if (isMatched) {
                matchedPaths.push([...currentPath, nodeData]);
            }

            // 继续搜索子节点论是否折叠
            if (nodeData.children) {
                nodeData.children.forEach(child => {
                    searchNode(child, [...currentPath, nodeData]);
                });
            }
        }

        // 从缓存的树形数据开始搜索
        if (treeDataCache.children) {
            treeDataCache.children.forEach(child => {
                searchNode(child, []);
            });
        }

        // 如果没有匹配结果，直接返回
        if (matchedPaths.length === 0) {
            updateSearchInfo();
            return;
        }

        // 找到最大度
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

            // 如果当前深度有节点被展开，更新布局
            if (hasExpandedNodes) {
                graph.layout();
                graph.paint();
            }

            // 如果还有更深的层级继续展开
            if (depth < maxDepth) {
                setTimeout(() => {
                    expandNodesAtDepth(depth + 1);
                }, 100); // 延迟100ms展开下一层
            } else {
                // 所有层级都展开完成后，高亮匹配节点
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

            // 如果有搜索结果，跳转到第��个
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
        const padding = 100;  // 距
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
            // 移除所有索相关的形状
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
            // 移除焦点高亮
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
            throw new Error('G6 库未能正确加载');
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