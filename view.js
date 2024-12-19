document.addEventListener('DOMContentLoaded', async () => {
    const groupBySelect = document.getElementById('groupBy');
    const themeToggle = document.getElementById('themeToggle');
    let graph = null;
    let isDarkTheme = false;
    let historyItems = [];

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

        // 如果是IP地址，直接返回完整地址
        if (ipv4Regex.test(hostname) || ipv6Regex.test(hostname)) {
            return hostname;
        }

        const parts = hostname.split('.');
        if (parts.length <= 2) return hostname;

        // 处理特殊情况如 co.uk, com.cn 等
        const specialTlds = ['co.uk', 'com.cn', 'org.cn', 'net.cn'];
        const lastTwoParts = parts.slice(-2).join('.');
        if (specialTlds.includes(lastTwoParts)) {
            return parts.slice(-3).join('.');
        }
        return parts.slice(-2).join('.');
    };

    // 按域名分组
    const groupByDomain = (items) => {
        const groups = {};
        items.forEach(item => {
            try {
                const url = new URL(item.url);
                const hostname = url.hostname;
                const rootDomain = getRootDomain(hostname);

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
            } catch (e) {
                console.error('Invalid URL:', item.url);
            }
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
        } else {
            Object.entries(groups).forEach(([rootDomain, domainData]) => {
                const rootNode = {
                    id: rootDomain,
                    label: `${rootDomain} (${domainData.totalCount})`,
                    children: [],
                    collapsed: true,
                    isRoot: true
                };

                Object.entries(domainData.subdomains).forEach(([subdomain, items]) => {
                    const subdomainNode = {
                        id: subdomain,
                        label: `${subdomain} (${items.length})`,
                        children: items.map(item => ({
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

        return treeData;
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

                // 计算节点宽度：文本宽度 + 左右padding + 按钮区域 + 图标区域（如果有）
                const buttonSpace = (!isLeaf && children && children.length) ? 100 : 40; // 展开按钮+删除按钮(增加间距) 或 只有删除按钮
                const iconSpace = isLeaf && cfg.url ? 24 : 0; // 如果是叶子节点且有URL，添加图标空间
                const width = Math.min(Math.max(textWidth + 24 + buttonSpace + iconSpace, 180), 400); // 最小180px，最大400px

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

                // 绘制文本
                if (isLeaf && cfg.url) {
                    // 添加网站图标
                    const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(cfg.url).hostname}&sz=16`;
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

                    // 绘制标题
                    group.addShape('text', {
                        attrs: {
                            text: cfg.label,
                            x: 36, // 图标宽度 + 间距
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
                } else {
                    // 非叶子节点只显示文本
                    group.addShape('text', {
                        attrs: {
                            text: cfg.label,
                            x: 12,
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
                }

                // 如果不是叶子节点，添加展开/折叠图标
                if (!isLeaf && children && children.length) {
                    const iconBox = group.addShape('circle', {
                        attrs: {
                            x: width - 60,
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
                            x: width - 60,
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

        // 创建图实例
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
                    const buttonSpace = (!d.isLeaf && d.children && d.children.length) ? 100 : 40; // 增加按钮区域空间
                    const iconSpace = d.isLeaf && d.url ? 24 : 0;
                    return Math.min(Math.max(textWidth + 24 + buttonSpace + iconSpace, 180), 400);
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
        console.log('构建的树形数据:', {
            rootId: treeData.id,
            rootLabel: treeData.label,
            childrenCount: treeData.children.length,
            children: treeData.children.map(child => ({
                id: child.id,
                label: child.label,
                isSubdomain: child.isSubdomain,
                hasChildren: child.children.length,
                collapsed: child.collapsed
            }))
        });

        // 初始化折叠状态
        const initializeCollapsedState = () => {
            const hideNode = (rootNode) => {
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
                                graph.hideItem(childNode);
                                // 隐藏连接到这个节点的边
                                graph.getEdges().forEach(edge => {
                                    if (edge.getTarget().get('id') === childData.id) {
                                        graph.hideItem(edge);
                                    }
                                });
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
                if (rootNode && rootData.collapsed) {
                    hideNode(rootNode);
                }
            });
        };

        // 加载数据并初始化
        graph.data(treeData);
        graph.render();
        initializeCollapsedState();

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

                        // 更新父节点的数据
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
                        // 删除域名或日期下的所有记录
                        const deletePromises = [];
                        const collectUrlsToDelete = (node) => {
                            if (node.isLeaf && node.url) {
                                deletePromises.push(chrome.history.deleteUrl({ url: node.url }));
                            } else if (node.children) {
                                node.children.forEach(collectUrlsToDelete);
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
                        const removeNodeAndChildren = (node) => {
                            if (node.children) {
                                node.children.forEach(child => {
                                    const childNode = graph.findById(child.id);
                                    if (childNode) {
                                        removeNodeAndChildren(childNode.getModel());
                                        graph.removeItem(childNode);
                                    }
                                });
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
                    historyItems.length = 0;
                    newHistoryItems.forEach(item => historyItems.push(item));

                    // 重新构建数据并更新图
                    const groupingMethod = groupBySelect.value;
                    const groups = groupingMethod === 'domain'
                        ? groupByDomain(historyItems)
                        : groupByDate(historyItems);

                    const newTreeData = buildTreeData(groups);
                    graph.changeData(newTreeData);

                    // 恢复所有节点的折叠状态
                    newTreeData.children.forEach(groupNode => {
                        if (groupNode.collapsed) {
                            const node = graph.findById(groupNode.id);
                            if (node) {
                                const hideChildren = (parentNode) => {
                                    const model = parentNode.getModel();
                                    if (model.children) {
                                        model.children.forEach(childData => {
                                            const childNode = graph.findById(childData.id);
                                            if (childNode) {
                                                graph.hideItem(childNode);
                                                const edges = childNode.getEdges();
                                                edges.forEach(edge => graph.hideItem(edge));
                                            }
                                        });
                                    }
                                };
                                hideChildren(node);
                            }
                        }
                    });

                    // 恢复视图状态
                    if (matrix) {
                        graph.getGroup().setMatrix(matrix);
                        graph.zoomTo(zoom);
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

            console.log('展开/折叠状态更新:', {
                nodeId: model.id,
                newCollapsedState: collapsed
            });

            // 更新展开/折叠图标
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