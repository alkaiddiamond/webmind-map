document.addEventListener('DOMContentLoaded', async () => {
    const groupBySelect = document.getElementById('groupBy');
    const themeToggle = document.getElementById('themeToggle');
    let graph = null;
    let isDarkTheme = false;
    let historyItems = [];

    // 查找第一个可用的URL
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
        console.log('getRootDomain 输入:', hostname);

        // 检查是否是IP地址（包括IPv4和IPv6）
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

        // 如果是IP地址，直接返回完整地址
        if (ipv4Regex.test(hostname) || ipv6Regex.test(hostname)) {
            console.log('识别为IP地址:', hostname);
            return hostname;
        }

        // 如果域名不包含点号或者是localhost，直接返回
        if (!hostname.includes('.') || hostname === 'localhost') {
            console.log('识别为本地地址:', hostname);
            return hostname;
        }

        // 如果域名以数字开头，检查是否为纯数字和点组成的IP地址形式
        if (/^\d/.test(hostname)) {
            // 如果看起来像IP地址格式，直接返回
            if (hostname.split('.').every(part => !isNaN(part))) {
                console.log('识别为类IP格式:', hostname);
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
            console.log('返回双段域名:', hostname);
            return hostname;
        }

        // 检查最后两部分是否构成特殊顶级域名
        const lastTwoParts = parts.slice(-2).join('.');
        if (specialDomains[lastTwoParts]) {
            // 如果是特殊顶级域名，返回最后三部分
            const result = parts.slice(-3).join('.');
            console.log('返回特殊域名:', result);
            return result;
        }

        // 对于其他情况，返回最后两部分
        const result = parts.slice(-2).join('.');
        console.log('返回标准域名:', result);
        return result;
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

        // 打印所有历史记录的 URL
        console.log('所有历史记录:', items.map(item => ({
            url: item.url,
            title: item.title,
            id: item.id,
            lastVisitTime: new Date(item.lastVisitTime).toLocaleString()
        })));

        items.forEach(item => {
            try {
                let hostname;
                // 尝试从URL中提取域名
                const urlStr = item.url.toLowerCase();
                console.log('正在处理URL:', urlStr);

                // 修改正则表达式以更好地处理数字开头的域名和IP地址
                const domainMatch = urlStr.match(/^(?:https?:\/\/)?([^\/\s]+)/i);
                if (domainMatch) {
                    hostname = domainMatch[1].toLowerCase().trim();
                    // 如果包含端口号，去除端口号
                    hostname = hostname.split(':')[0];
                    console.log('正则提取域名成功:', hostname, '原始URL:', urlStr);
                } else {
                    // 如果正则匹配失败，尝试使用 URL 对象
                    try {
                        const url = new URL(urlStr);
                        hostname = url.hostname;
                        console.log('URL对象提取域名成功:', hostname, '原始URL:', urlStr);
                    } catch (e) {
                        console.log('URL解析失败:', e.message, '原始URL:', urlStr);
                        hostname = null;
                    }
                }

                if (!hostname) {
                    console.log('无法获取域名，放入其他组:', urlStr);
                    otherGroup.subdomains['other'].push(item);
                    otherGroup.totalCount++;
                    return;
                }

                // 移除可能的端口号和空格（确保再次检查）
                hostname = hostname.split(':')[0].trim();
                console.log('处理后的域名:', hostname);

                // 如果是 chrome:// 或 edge:// 等特殊协议，直接使用完整域名作为根域名
                if (hostname.includes('://')) {
                    const rootDomain = hostname;
                    console.log('特殊协议域名:', rootDomain);
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
                if (ipv4Regex.test(hostname) || ipv6Regex.test(hostname) || /^\d/.test(hostname)) {
                    console.log('IP地址或数字开头域名:', hostname);
                    rootDomain = hostname;
                } else {
                    // 对于其他情况，使用 getRootDomain
                    rootDomain = getRootDomain(hostname);
                }
                console.log('获取到根域名:', rootDomain);

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

                // 添加调试日志
                console.log('添加记录后的分组状态:', {
                    rootDomain,
                    hostname,
                    totalCount: groups[rootDomain].totalCount,
                    items: groups[rootDomain].subdomains[hostname].map(i => ({
                        url: i.url,
                        title: i.title
                    }))
                });
            } catch (e) {
                console.error('处理URL时出错:', {
                    url: item.url,
                    title: item.title,
                    error: e.message,
                    stack: e.stack
                });
                otherGroup.subdomains['other'].push(item);
                otherGroup.totalCount++;
            }
        });

        // 如果有无法解析的 URL，添加 "其他" 分组
        if (otherGroup.totalCount > 0) {
            groups['其他'] = otherGroup;
        }

        // 打印最终分组结果
        console.log('域名分组结果:', {
            groups: Object.keys(groups).map(domain => ({
                domain,
                totalCount: groups[domain].totalCount,
                subdomains: Object.keys(groups[domain].subdomains),
                urls: Object.values(groups[domain].subdomains).flat().map(item => ({
                    url: item.url,
                    title: item.title,
                    id: item.id
                }))
            })),
            otherGroupCount: otherGroup.totalCount,
            otherUrls: otherGroup.subdomains['other'].map(item => ({
                url: item.url,
                title: item.title,
                id: item.id
            }))
        });

        return groups;
    };

    // 按日期分组
    const groupByDate = (items) => {
        const groups = {};
        items.forEach(item => {
            const date = new Date(item.lastVisitTime);
            const dateStr = date.toLocaleDateString();
            if (!groups[dateStr]) {
                groups[dateStr] = [];
            }
            groups[dateStr].push(item);
        });
        return groups;
    };

    // 构建树形数据
    const buildTreeData = (groups) => {
        console.log('构建树形数据时的分组:', Object.keys(groups));

        let treeData = {
            id: 'root',
            label: '浏览历史',
            children: [],
            collapsed: false
        };

        if (groupBySelect.value === 'date') {
            Object.entries(groups).forEach(([groupName, items]) => {
                const groupNode = {
                    id: groupName,
                    label: `${groupName} (${items.length})`,
                    children: items.map(item => ({
                        id: String(item.id),
                        label: item.title || item.url,
                        url: item.url,
                        isLeaf: true
                    })),
                    collapsed: true
                };
                treeData.children.push(groupNode);
            });
            // 按日期倒序排序
            treeData.children.sort((a, b) => new Date(b.id) - new Date(a.id));
        } else {
            // 域名分组的处理
            const entries = Object.entries(groups);
            console.log('域名分组条目数:', entries.length);

            // 按照访问量降序排序
            entries.sort((a, b) => b[1].totalCount - a[1].totalCount);

            entries.forEach(([rootDomain, domainData]) => {
                console.log('处理域名分组:', rootDomain, {
                    totalCount: domainData.totalCount,
                    subdomains: Object.keys(domainData.subdomains)
                });

                const rootNode = {
                    id: rootDomain,
                    label: `${rootDomain} (${domainData.totalCount})`,
                    children: [],
                    collapsed: true,
                    isRoot: true
                };

                // 对子域名进行排序
                const subdomainEntries = Object.entries(domainData.subdomains)
                    .sort((a, b) => b[1].length - a[1].length);

                subdomainEntries.forEach(([subdomain, items]) => {
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
                        collapsed: true,
                        isSubdomain: true
                    };
                    rootNode.children.push(subdomainNode);
                });

                treeData.children.push(rootNode);
            });
        }

        console.log('最终构建的树形数据:', {
            totalNodes: treeData.children.length,
            domains: treeData.children.map(node => node.label)
        });

        return treeData;
    };

    // 初始化折叠状态
    const initializeCollapsedState = (graph, treeData) => {
        const hideNode = (rootNode) => {
            const queue = [rootNode];
            const processedNodes = new Set();

            while (queue.length > 0) {
                const node = queue.shift();
                if (processedNodes.has(node.getModel().id)) continue;

                const nodeModel = node.getModel();
                processedNodes.add(nodeModel.id);

                // 确保根节点始终可见
                if (!node.get('parent')) {
                    graph.showItem(node);
                }

                if (nodeModel.children) {
                    nodeModel.children.forEach(childData => {
                        const childNode = graph.findById(childData.id);
                        if (childNode) {
                            // 检查是否是IP地址或数字开头的域名
                            const isIpOrNumeric = /^\d/.test(nodeModel.id);

                            if (nodeModel.collapsed && !isIpOrNumeric) {
                                // 只有非IP/数字开头的域名才隐藏子节点
                                graph.hideItem(childNode);
                                // 隐藏连接到这个节点的边
                                graph.getEdges().forEach(edge => {
                                    if (edge.getTarget().get('id') === childData.id) {
                                        graph.hideItem(edge);
                                    }
                                });
                            } else {
                                // IP地址或数字开头的域名，或未折叠的节点，显示其子节点
                                graph.showItem(childNode);
                                // 显示连接到这个节点的边
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

        // 遍历所有根节点
        treeData.children.forEach(rootData => {
            const rootNode = graph.findById(rootData.id);
            if (rootNode) {
                // 检查是否是IP地址或数字开头的域名
                const isIpOrNumeric = /^\d/.test(rootData.id);

                // 如果是IP地址或数字开头的域名，设置为展开状态
                if (isIpOrNumeric) {
                    rootNode.getModel().collapsed = false;
                }

                graph.showItem(rootNode); // 确保根节点可见
                hideNode(rootNode);
            }
        });

        // 添加调试日志
        console.log('初始化折叠状态后的节点状态:', graph.getNodes().map(node => ({
            id: node.get('id'),
            label: node.get('model').label,
            visible: !node.get('visible'),
            collapsed: node.get('model').collapsed,
            isIpOrNumeric: /^\d/.test(node.get('id'))
        })));
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

                // 计算文本宽度
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                context.font = '13px Arial';
                const textWidth = context.measureText(cfg.label).width;

                // 计算节点宽度：文本宽度 + 左右padding + 按钮区域 + 图标区域
                const buttonSpace = (!isLeaf && children && children.length) ? 90 : 40;
                const iconSpace = 24; // 所有节点都预留图标空间
                const maxTextWidth = 300; // 限制文本最大宽度
                const width = Math.min(Math.max(Math.min(textWidth, maxTextWidth) + 24 + buttonSpace + iconSpace, 180), 400);

                // 获取favicon URL
                let faviconUrl = '';
                if (isLeaf && cfg.url) {
                    faviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(cfg.url)}&size=16`;
                } else if (children && children.length > 0) {
                    const firstUrl = findFirstUrl(children[0]);
                    if (firstUrl) {
                        faviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(firstUrl)}&size=16`;
                    }
                }

                // 计算文本是否需要截断
                const availableTextWidth = width - 24 - buttonSpace - (faviconUrl ? iconSpace : 0);
                let displayText = cfg.label;
                if (textWidth > availableTextWidth) {
                    // 计算能显示的字符数
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
                        x: faviconUrl ? 36 : 12,
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

                // 如果文本被截断，添加完整文的title提示
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
                            x: width - 52, // 调整展开按钮位置
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
                            x: width - 52, // 调整展开按钮文字位置
                            y: height / 2,
                            text: collapsed ? '+' : '-',
                            fontSize: 16,
                            fontWeight: 'bold',
                            fill: colorScheme.textColor,
                            textAlign: 'center',
                            textBaseline: 'middle',
                            cursor: 'pointer',
                        },
                        name: 'collapse-text'
                    });
                }

                // 添加删除按钮
                group.addShape('circle', {
                    attrs: {
                        x: width - 24, // 保持删除按钮位置不变
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
                        x: width - 24, // 保持删除按钮文字位置不变
                        y: height / 2,
                        text: '×',
                        fontSize: 16,
                        fontWeight: 'bold',
                        fill: colorScheme.textColor,
                        textAlign: 'center',
                        textBaseline: 'middle',
                        cursor: 'pointer',
                    },
                    name: 'delete-button'
                });

                // 添加鼠标悬停效果
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
                    stroke: '#91d5ff',
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
                    // 创建临时canvas计算文本宽度
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    context.font = '13px Arial';
                    const textWidth = context.measureText(d.label).width;
                    const buttonSpace = (!d.isLeaf && d.children && d.children.length) ? 90 : 40;
                    const iconSpace = 24; // 所有节点都预留图标空间
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

        // 构建数据
        const groupingMethod = groupBySelect.value;
        const groups = groupingMethod === 'domain'
            ? groupByDomain(historyItems)
            : groupByDate(historyItems);

        const treeData = buildTreeData(groups);
        console.log('构建的树形数据:', treeData);

        // 加载数据并初始化
        graph.data(treeData);
        graph.render();

        // 添加调试日志
        console.log('渲染后的节点数量:', graph.getNodes().length);
        console.log('渲染后的节点列表:', graph.getNodes().map(node => ({
            id: node.get('id'),
            label: node.get('model').label,
            visible: !node.get('visible'),
            parent: node.get('parent')?.get('id')
        })));

        // 确保所有根节点都可见
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

        // 调用 initializeCollapsedState 时传入必要的参数
        initializeCollapsedState(graph, treeData);

        // 处理子节点的显示/隐藏
        const processChildren = (node, isCollapsed) => {
            const nodeModel = node.getModel();
            console.log('处理节点展开/折叠:', {
                nodeId: nodeModel.id,
                label: nodeModel.label,
                isCollapsed,
                hasChildren: nodeModel.children ? nodeModel.children.length : 0
            });

            if (nodeModel.children) {
                nodeModel.children.forEach(childData => {
                    const childNode = graph.findById(childData.id);
                    if (childNode) {
                        // 处理节点显示/隐藏
                        if (isCollapsed) {
                            graph.hideItem(childNode);
                        } else {
                            graph.showItem(childNode);
                        }

                        // 处理边的显示/隐藏
                        graph.getEdges().forEach(edge => {
                            if (edge.getTarget().get('id') === childData.id) {
                                if (isCollapsed) {
                                    graph.hideItem(edge);
                                } else {
                                    graph.showItem(edge);
                                }
                            }
                        });

                        // 如果是折叠操作，递归隐藏所有子节点
                        if (isCollapsed && childData.children) {
                            childData.children.forEach(grandChild => {
                                const grandChildNode = graph.findById(grandChild.id);
                                if (grandChildNode) {
                                    graph.hideItem(grandChildNode);
                                    graph.getEdges().forEach(edge => {
                                        if (edge.getTarget().get('id') === grandChild.id) {
                                            graph.hideItem(edge);
                                        }
                                    });
                                }
                            });
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

            console.log('节点点击事件:', {
                nodeId: model.id,
                label: model.label,
                isLeaf: model.isLeaf,
                isSubdomain: model.isSubdomain,
                targetName,
                currentCollapsed: model.collapsed,
                hasChildren: model.children ? model.children.length : 0
            });

            // 处理删除按钮点击
            if (targetName === 'delete-button' || targetName === 'delete-box') {
                const confirmDelete = confirm('确定要删除这条历史记录吗？');
                if (!confirmDelete) return;

                try {
                    // 获取当前视图状态
                    const zoom = graph.getZoom();
                    const matrix = graph.getGroup().getMatrix();

                    if (model.isLeaf) {
                        // 删除单个页面记录
                        await chrome.history.deleteUrl({ url: model.url });

                        // 更新父节点数据
                        const parentNode = graph.findById(item.get('parent'));
                        if (parentNode) {
                            const parentModel = parentNode.getModel();
                            // 从父节点的children中移除当前节点
                            parentModel.children = parentModel.children.filter(child => child.id !== model.id);
                            // 更新父节点显示的计数
                            const count = parentModel.children.length;
                            const newLabel = parentModel.label.replace(/\(\d+\)/, `(${count})`);
                            graph.updateItem(parentNode, {
                                ...parentModel,
                                label: newLabel
                            });

                            // 如果节点没有子节点了，也删除父节点
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
                        // 删除域名或日期下���所有记录
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
                    const newHistoryItems = await chrome.history.search({
                        text: '',
                        maxResults: 1000,
                        startTime: 0
                    });
                    // 完全替换历史记录数组
                    historyItems = newHistoryItems;

                    // 存当前所有展开节点的ID和它们的父节点ID
                    const expandedNodeIds = new Set();
                    const expandedParentIds = new Set();
                    graph.getNodes().forEach(node => {
                        const nodeModel = node.getModel();
                        if (!nodeModel.collapsed) {
                            expandedNodeIds.add(nodeModel.id);
                            // 如果是展开节点，其父节点也该是展开的
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
                                // 如果点ID在展开集合，或者它是展开节点的父节点，则设置为展开状态
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
                                        // 只有当当前节点折叠或父节点折叠时才隐藏子节点
                                        if (isCurrentNodeCollapsed || parentCollapsed) {
                                            graph.hideItem(childNode);
                                            graph.getEdges().forEach(edge => {
                                                if (edge.getTarget().get('id') === childData.id) {
                                                    graph.hideItem(edge);
                                                }
                                            });
                                        }
                                        // 将父节点的折叠状态传���给子节点
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

                    // 复视图状态
                    if (matrix) {
                        setTimeout(() => {
                            graph.getGroup().setMatrix(matrix);
                            graph.zoomTo(zoom);
                        }, 0);
                    }
                } catch (error) {
                    console.error('Error deleting history:', error);
                    alert('删除历史记录失败');
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

            console.log('开/折叠状态更新:', {
                nodeId: model.id,
                newCollapsedState: collapsed
            });

            // 更新展开/折叠标
            const group = item.getContainer();
            const icon = group.find(element => element.get('name') === 'collapse-text');
            if (icon) {
                icon.attr('text', collapsed ? '+' : '-');
                console.log('图标更新为:', collapsed ? '+' : '-');
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
    };

    try {
        if (typeof G6 === 'undefined') {
            throw new Error('G6 库未能正确加载');
        }

        console.log('开始初始化扩展...');

        // 获取浏览历史
        historyItems = await chrome.history.search({
            text: '',
            maxResults: 1000,
            startTime: 0
        });

        console.log('获取到历史记录数量:', historyItems.length);

        // 初始化视图
        console.log('开始初始化视图...');
        updateView();
        console.log('视图初始化完成');

    } catch (error) {
        console.error('扩展初始化错误:', error);
        // 在页面上显示错误信息
        const container = document.getElementById('container');
        if (container) {
            container.innerHTML = `<div style="color: red; padding: 20px;">
                加载出错: ${error.message}
            </div>`;
        }
    }
}); 