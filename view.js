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
    let faviconCache = new Map();  // 添加 favicon 缓存
    let faviconLoadQueue = [];  // 添加 favicon 加载队列
    let isProcessingFavicons = false;  // 标记是否正在处理 favicon

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

    // 初始化分组选择器
    if (groupBySelect) {
        // 加载保存的分组选择
        try {
            const result = await chrome.storage.local.get('groupBy');
            if (result.groupBy) {
                groupBySelect.value = result.groupBy;
                // 更新排序控件的显示状态
                const sortControls = document.getElementById('sortControls');
                if (sortControls) {
                    sortControls.style.display = result.groupBy === 'domain' ? 'flex' : 'none';
                }
            }
        } catch (error) {
            console.error('Error loading groupBy preference:', error);
        }

        groupBySelect.addEventListener('change', async () => {
            // 更新排序控件的显示状态
            const sortControls = document.getElementById('sortControls');
            if (sortControls) {
                sortControls.style.display = groupBySelect.value === 'domain' ? 'flex' : 'none';
            }
            // 保存分组选择
            try {
                await chrome.storage.local.set({ groupBy: groupBySelect.value });
            } catch (error) {
                console.error('Error saving groupBy preference:', error);
            }
            // 更新视图
            await updateView();
        });
    }

    // 初始排序控件
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
            // 先加载保存的分组选择
            const result = await chrome.storage.local.get('groupBy');
            if (result.groupBy) {
                groupBySelect.value = result.groupBy;
                // 更新排序控件的显示状态
                const sortControls = document.getElementById('sortControls');
                if (sortControls) {
                    sortControls.style.display = result.groupBy === 'domain' ? 'flex' : 'none';
                }
            }

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

            // 先构建基本视图，不等待 favicon
            await updateView(true);

            // 然后异步加载 favicon
            processFaviconQueue();
        } catch (error) {
            const container = document.getElementById('container');
            if (container) {
                container.innerHTML = `<div style="color: red; padding: 20px;">
                    ${t('loadError', { error: error.message })}
                </div>`;
            }
        }
    };

    // 处理 favicon 加载队列
    const processFaviconQueue = async () => {
        if (isProcessingFavicons) return;
        isProcessingFavicons = true;

        while (faviconLoadQueue.length > 0) {
            const batch = faviconLoadQueue.splice(0, 10); // 每次处理10个
            await Promise.all(batch.map(async ({ node, callback }) => {
                try {
                    const faviconUrl = await getFaviconUrl(node);
                    if (faviconUrl && callback) {
                        callback(faviconUrl);
                    }
                } catch (error) {
                    console.error('Error loading favicon:', error);
                }
            }));
            // 短暂延迟，避免阻塞主线程
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        isProcessingFavicons = false;
    };

    // 添加 favicon 加载队列
    const queueFaviconLoad = (node, callback) => {
        faviconLoadQueue.push({ node, callback });
        if (!isProcessingFavicons) {
            processFaviconQueue();
        }
    };

    // 更新界面文本
    async function updateUIText(skipViewUpdate = false) {
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

        // 只有在需要且视图更新
        if (!skipViewUpdate && typeof graph !== 'undefined' && graph !== null) {
            await updateView();
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
            updateView().catch(console.error);
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

        // 如果域名以数字开头查是否为纯数字和点组的IP地址形
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

        // 如果分段数小于等于2，直接返回完整域名
        if (parts.length <= 2) {
            return hostname;
        }

        // 检查最后两部分是否构成特殊顶级域名
        const lastTwoParts = parts.slice(-2).join('.');
        if (specialDomains[lastTwoParts]) {
            // 如果是特殊顶级域名，返回后三部分
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

                // 使用正则表达式处理数字开头的域和IP地址
                const domainMatch = urlStr.match(/^(?:https?:\/\/)?([^\/\s]+)/i);
                if (domainMatch) {
                    hostname = domainMatch[1].toLowerCase().trim();
                    // 移除可能的端口号和空格
                    hostname = hostname.split(':')[0];
                } else {
                    // 果正则表达式匹配失败尝试使用 URL 对象
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

                // 移除可能的端口号和空格
                hostname = hostname.split(':')[0].trim();

                // 如果是 chrome:// 或 edge:// 等特殊协议，直接使用整个域作为根域名
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
                        // 一级域名
                        rootDomain = hostname;
                    } else {
                        // 查是否是特殊域名
                        const lastTwoParts = parts.slice(-2).join('.');
                        if (specialDomains[lastTwoParts]) {
                            // 如果是特殊顶级域名（如 .com.cn），使用最后三部分作为根域名
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

        // 如果有无法解析的 URL，加"其他"分组
        if (otherGroup.totalCount > 0) {
            groups[t('other')] = otherGroup;
        }

        return groups;
    };

    // 按日期分组
    const groupByDate = (items) => {
        const groups = {};

        items.forEach(item => {
            const date = new Date(item.lastVisitTime);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();

            // 使用年份作为第一级分组
            const yearKey = year.toString();
            if (!groups[yearKey]) {
                groups[yearKey] = {
                    year,
                    months: {}
                };
            }

            // 使用月份作为第二级分组
            const monthKey = month.toString().padStart(2, '0');
            if (!groups[yearKey].months[monthKey]) {
                groups[yearKey].months[monthKey] = {
                    month,
                    days: {}
                };
            }

            // 使用日期作为第三级分组
            const dayKey = day.toString().padStart(2, '0');
            if (!groups[yearKey].months[monthKey].days[dayKey]) {
                groups[yearKey].months[monthKey].days[dayKey] = {
                    items: [],
                    domains: {}
                };
            }

            // 提取域名
            let hostname;
            try {
                const urlStr = item.url.toLowerCase();
                const domainMatch = urlStr.match(/^(?:https?:\/\/)?([^\/\s]+)/i);
                if (domainMatch) {
                    hostname = domainMatch[1].toLowerCase().trim();
                    hostname = hostname.split(':')[0]; // 移除端口号
                } else {
                    hostname = 'other';
                }
            } catch (error) {
                hostname = 'other';
            }

            // 按域名分组
            const dayGroup = groups[yearKey].months[monthKey].days[dayKey];
            if (!dayGroup.domains[hostname]) {
                dayGroup.domains[hostname] = [];
            }
            dayGroup.domains[hostname].push(item);
            dayGroup.items.push(item);
        });

        return groups;
    };

    // 检查URL否有有效的favicon（带缓存）
    async function checkFaviconExists(url) {
        if (!url) return false;
        // 如果已经在缓存中，直接返回结果
        if (faviconCache.has(url)) {
            return faviconCache.get(url);
        }

        try {
            const faviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=16`;
            const response = await fetch(faviconUrl);
            const result = response.ok && response.status === 200;
            // 将结果存入缓存
            faviconCache.set(url, result);
            return result;
        } catch (e) {
            faviconCache.set(url, false);
            return false;
        }
    }

    // 批量查favicons
    async function batchCheckFavicons(urls) {
        const uncheckedUrls = urls.filter(url => !faviconCache.has(url));
        const checkPromises = uncheckedUrls.map(async url => {
            const result = await checkFaviconExists(url);
            return { url, result };
        });

        // 使用 Promise.all 并行处理所有请求
        await Promise.all(checkPromises);
    }

    // 统计favicon使用率并选择最佳favicon优化版）
    async function findBestFavicon(node) {
        // 收集所有叶子节点的URL和访问时间
        const collectLeafData = (node) => {
            const urlData = [];
            if (node.isLeaf && node.url) {
                urlData.push({
                    url: node.url,
                    lastVisitTime: node.lastVisitTime || 0
                });
            }
            if (node.children) {
                node.children.forEach(child => {
                    urlData.push(...collectLeafData(child));
                });
            }
            return urlData;
        };

        const leafData = collectLeafData(node);
        if (leafData.length === 0) return null;

        // 批量检查所有 URL 的 favicon
        await batchCheckFavicons(leafData.map(data => data.url));

        // 统计有效的 favicon
        const faviconStats = new Map();
        for (const data of leafData) {
            if (faviconCache.get(data.url)) {
                const key = data.url;
                if (!faviconStats.has(key)) {
                    faviconStats.set(key, {
                        url: data.url,
                        count: 1,
                        lastVisitTime: data.lastVisitTime
                    });
                } else {
                    const stat = faviconStats.get(key);
                    stat.count++;
                    stat.lastVisitTime = Math.max(stat.lastVisitTime, data.lastVisitTime);
                }
            }
        }

        if (faviconStats.size === 0) return null;

        // 选择最佳 favicon
        const sortedStats = Array.from(faviconStats.values()).sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            return b.lastVisitTime - a.lastVisitTime;
        });

        return sortedStats[0].url;
    }

    // 预处理所有节点的 favicon（优化版）
    async function processFavicons(entries) {
        const processedData = [];

        // 收集所有URL
        const allUrls = new Set();
        entries.forEach(([rootDomain, domainData]) => {
            Object.entries(domainData.subdomains).forEach(([subdomain, items]) => {
                items.forEach(item => {
                    allUrls.add(item.url);
                });
            });
        });

        // 批量检查所有 favicon
        await batchCheckFavicons([...allUrls]);

        // 处理每个域名
        for (const [rootDomain, domainData] of entries) {
            // 收集该域名下所有URL和访问时间
            const urlData = [];
            Object.entries(domainData.subdomains).forEach(([subdomain, items]) => {
                items.forEach(item => {
                    if (faviconCache.get(item.url)) {
                        urlData.push({
                            url: item.url,
                            lastVisitTime: item.lastVisitTime || 0
                        });
                    }
                });
            });

            // 选择最佳 favicon
            let bestFaviconUrl = '';
            if (urlData.length > 0) {
                const faviconStats = new Map();
                for (const data of urlData) {
                    const key = data.url;
                    if (!faviconStats.has(key)) {
                        faviconStats.set(key, {
                            url: data.url,
                            count: 1,
                            lastVisitTime: data.lastVisitTime
                        });
                    } else {
                        const stat = faviconStats.get(key);
                        stat.count++;
                        stat.lastVisitTime = Math.max(stat.lastVisitTime, data.lastVisitTime);
                    }
                }

                const sortedStats = Array.from(faviconStats.values()).sort((a, b) => {
                    if (b.count !== a.count) {
                        return b.count - a.count;
                    }
                    return b.lastVisitTime - a.lastVisitTime;
                });

                if (sortedStats.length > 0) {
                    const bestUrl = sortedStats[0].url;
                    if (faviconCache.get(bestUrl)) {
                        bestFaviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(bestUrl)}&size=16`;
                    }
                }
            }

            // 处理子域名
            const subdomains = {};
            for (const [subdomain, items] of Object.entries(domainData.subdomains)) {
                const validItems = items.filter(item => faviconCache.get(item.url));
                let subFaviconUrl = '';

                if (validItems.length > 0) {
                    // 对子域名，直接使用近问的有效URL的favicon
                    const sortedItems = [...validItems].sort((a, b) => b.lastVisitTime - a.lastVisitTime);
                    const bestUrl = sortedItems[0].url;
                    if (faviconCache.get(bestUrl)) {
                        subFaviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(bestUrl)}&size=16`;
                    }
                }

                subdomains[subdomain] = {
                    items,
                    faviconUrl: subFaviconUrl
                };
            }

            // 如果根域名没有找到有效的favicon，尝试使用域名本身
            if (!bestFaviconUrl && rootDomain.includes('://')) {
                bestFaviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=https://${encodeURIComponent(rootDomain)}&size=16`;
            }

            processedData.push({
                rootDomain,
                domainData: {
                    ...domainData,
                    faviconUrl: bestFaviconUrl || (rootDomain.includes('://') ?
                        `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=https://${encodeURIComponent(rootDomain)}&size=16` : ''),
                    subdomains
                }
            });
        }

        return processedData;
    }

    // 获favicon URL的工具函数
    async function getFaviconUrl(node) {
        if (!node) return '';

        // 根节点使用扩展图标
        if (node.id === 'root') {
            return `chrome-extension://${chrome.runtime.id}/icons/icon48.png`;  // 用48x48的图标
        }

        // 如果是叶子节点，使用实际URL
        if (node.isLeaf && node.url) {
            const hasValidFavicon = await checkFaviconExists(node.url);
            if (hasValidFavicon) {
                return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(node.url)}&size=16`;
            }
            return '';
        }

        // 对于非叶子节点，查最佳favicon
        const bestUrl = await findBestFavicon(node);
        if (bestUrl) {
            return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(bestUrl)}&size=16`;
        }

        return '';
    }

    // 构建树形数据
    const buildTreeData = async (groups) => {
        const treeData = {
            id: 'root',
            label: t('title'),
            children: []
        };

        if (groupBySelect.value === 'domain') {
            // 域名分组处理
            const entries = Object.entries(groups);

            // 根据选择的序方进行序
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

            // 待所有 favicon 处理完成
            const processedEntries = await processFavicons(entries);

            // 构建树形数据
            processedEntries.forEach(({ rootDomain, domainData }) => {
                const rootNode = {
                    id: rootDomain,
                    label: `${rootDomain} (${domainData.totalCount})`,
                    children: [],
                    collapsed: true,
                    isRoot: true,
                    faviconUrl: domainData.faviconUrl
                };

                // 对子域名进行排序
                const subdomainEntries = Object.entries(domainData.subdomains);
                subdomainEntries.sort((a, b) => {
                    let result;
                    if (sortBy === 'name') {
                        result = a[0].toLowerCase().localeCompare(b[0].toLowerCase());
                    } else {
                        result = b[1].items.length - a[1].items.length;
                    }
                    return sortDirection === 'desc' ? -result : result;
                });

                subdomainEntries.forEach(([subdomain, data]) => {
                    const items = data.items;
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
                                lastVisitTime: item.lastVisitTime,
                                isLeaf: true
                            });
                        });
                    } else {
                        const subdomainNode = {
                            id: subdomain,
                            label: `${subdomain} (${items.length})`,
                            faviconUrl: data.faviconUrl,
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
                                    lastVisitTime: item.lastVisitTime,
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
        } else {
            // 日期分组处理
            const monthNames = {
                en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                zh: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
            };

            const weekDays = {
                en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
                zh: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
            };

            const lang = getCurrentLanguage().startsWith('zh') ? 'zh' : 'en';

            // 对年份进行排序
            const sortedYears = Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));

            for (const [year, yearData] of sortedYears) {
                // 处理年份节点
                const yearNode = {
                    id: year,
                    label: lang === 'zh' ? `${year}年` : year,
                    children: [],
                    collapsed: true,
                    isDateGroup: true
                };

                // 对月份进行排序
                const sortedMonths = Object.entries(yearData.months).sort((a, b) => b[0].localeCompare(a[0]));

                for (const [monthKey, monthData] of sortedMonths) {
                    const monthNode = {
                        id: `${year}-${monthKey}`,
                        label: monthNames[lang][monthData.month - 1],
                        children: [],
                        collapsed: true,
                        isDateGroup: true
                    };

                    // 对日期进行排序
                    const sortedDays = Object.entries(monthData.days).sort((a, b) => b[0].localeCompare(a[0]));

                    for (const [dayKey, dayData] of sortedDays) {
                        const date = new Date(dayData.items[0].lastVisitTime);
                        const weekDay = weekDays[lang][date.getDay()];
                        const dayNode = {
                            id: `${year}-${monthKey}-${dayKey}`,
                            label: lang === 'zh' ?
                                `${parseInt(dayKey)}日 ${weekDay} (${dayData.items.length})` :
                                `${parseInt(dayKey)} ${weekDay} (${dayData.items.length})`,
                            children: [],
                            collapsed: true,
                            isDateGroup: true
                        };

                        // 对域名进行排序
                        const sortedDomains = Object.entries(dayData.domains).sort((a, b) => {
                            if (a[0] === 'other') return 1;
                            if (b[0] === 'other') return -1;
                            return a[0].localeCompare(b[0]);
                        });

                        // 添加域名节点
                        for (const [domain, items] of sortedDomains) {
                            const domainNode = {
                                id: `${year}-${monthKey}-${dayKey}-${domain}`,
                                label: `${domain} (${items.length})`,
                                children: items.map(item => ({
                                    id: String(item.id),
                                    label: item.title || item.url,
                                    url: item.url,
                                    lastVisitTime: item.lastVisitTime,
                                    isLeaf: true
                                })),
                                collapsed: true,
                                isDomainGroup: true
                            };
                            dayNode.children.push(domainNode);
                        }

                        monthNode.children.push(dayNode);
                    }

                    const monthCount = monthNode.children.reduce((sum, day) => {
                        return sum + day.children.reduce((s, domain) => {
                            return s + domain.children.length;
                        }, 0);
                    }, 0);

                    monthNode.label = `${monthNames[lang][monthData.month - 1]} (${monthCount})`;
                    yearNode.children.push(monthNode);
                }

                const totalCount = yearNode.children.reduce((sum, month) => {
                    return sum + month.children.reduce((s, day) => {
                        return s + day.children.reduce((d, domain) => {
                            return d + domain.children.length;
                        }, 0);
                    }, 0);
                }, 0);

                yearNode.label = lang === 'zh' ?
                    `${year}年 (${totalCount})` :
                    `${year} (${totalCount})`;
                treeData.children.push(yearNode);
            }
        }

        return treeData;
    };

    // 初始折叠态
    const initializeCollapsedState = (graph, treeData) => {
        // 首先确保有节点存在
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
                                // 如果父节点是折叠态，隐藏节点
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
    const updateView = async (skipFavicons = false) => {
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

                // 计算节点宽度：文本宽度 + 右padding + 按钮区 + 图标区域
                const buttonSpace = (!isLeaf && children && children.length) ? 90 : 40;
                const iconSpace = 24; // 所有节点都预留图标空间
                const maxTextWidth = 200; // 限制文本最大宽度
                const minWidth = 150; // 设置最小宽度
                const width = Math.min(Math.max(Math.min(textWidth, maxTextWidth) + 24 + buttonSpace + iconSpace, minWidth), 300);

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

                // 只在亮主题下添加玻璃态高光效果
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

                // 添加默认图标占位
                const iconSize = 16;
                const iconX = 12;
                const iconShape = group.addShape('image', {
                    attrs: {
                        x: iconX,
                        y: height / 2 - iconSize / 2,
                        width: iconSize,
                        height: iconSize,
                        img: cfg.id === 'root' ?
                            `chrome-extension://${chrome.runtime.id}/icons/icon48.png` :
                            (cfg.isLeaf && cfg.url && !cfg.isDateGroup ?
                                `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(cfg.url)}&size=16` :
                                (cfg.faviconUrl && !cfg.isDateGroup && !cfg.isSubdomain ? cfg.faviconUrl : '')),
                        cursor: 'pointer',
                        opacity: cfg.id === 'root' ||
                            (cfg.isLeaf && cfg.url && !cfg.isDateGroup) ||
                            (cfg.faviconUrl && !cfg.isDateGroup && !cfg.isSubdomain) ? 1 : 0
                    },
                    name: 'favicon'
                });

                // 如果不是跳过 favicon 加载且没预处理的 favicon，则加入加载队列
                if (!skipFavicons && cfg.id !== 'root' && !cfg.isDateGroup && !cfg.faviconUrl) {
                    queueFaviconLoad(cfg, (faviconUrl) => {
                        if (iconShape && !iconShape.get('destroyed')) {
                            iconShape.attr('img', faviconUrl);
                            iconShape.attr('opacity', 1);  // 加载成后显示图标
                        }
                    });
                }

                // 绘制文本
                const displayText = cfg.label;
                const maxDisplayWidth = maxTextWidth - 10; // 留出一些空间给省略号
                const truncatedText = textWidth > maxDisplayWidth ?
                    displayText.substring(0, Math.floor(displayText.length * maxDisplayWidth / textWidth)) + '...' :
                    displayText;

                group.addShape('text', {
                    attrs: {
                        text: truncatedText,
                        x: 36,  // 固定文本位置
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

                // 如果文本过长，添加完整文本的title提示
                if (textWidth > maxTextWidth) {
                    group.addShape('text', {
                        attrs: {
                            text: cfg.label,
                            opacity: 0
                        },
                        name: 'title'
                    });
                }

                // 如果不是子节点，加展开/折叠图标
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

                // 添加删除
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
                getWidth: function (d) {
                    // 创建时canvas计算文本宽度
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    context.font = '13px Arial';
                    const textWidth = context.measureText(d.label).width;
                    const buttonSpace = (!d.isLeaf && d.children && d.children.length) ? 90 : 40;
                    const iconSpace = (d.isLeaf || d.isDomainGroup || groupBySelect.value === 'domain') ? 24 : 0; // 只为叶子节点、域名节点和域名分组视图预留图标空间
                    const maxTextWidth = 200; // 限制文本最大宽度
                    const minWidth = 150; // 设置最小宽度
                    return Math.min(Math.max(Math.min(textWidth, maxTextWidth) + 24 + buttonSpace + iconSpace, minWidth), 300);
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

        // 更新排序控件的显示状态
        const sortControls = document.getElementById('sortControls');
        if (sortControls) {
            sortControls.style.display = groupingMethod === 'domain' ? 'flex' : 'none';
        }

        const treeData = await buildTreeData(groups);
        treeDataCache = treeData;  // 存树形数据

        // 加载数据初始化
        graph.data(treeData);
        graph.render();

        // 确保所有根节点都显示
        graph.getNodes().forEach(node => {
            if (!node.get('parent')) {
                graph.showItem(node);
                // 显示连接节点的边
                graph.getEdges().forEach(edge => {
                    if (edge.getSource().get('id') === node.get('id')) {
                        graph.showItem(edge);
                    }
                });
            }
        });

        // 初始化折叠状态
        initializeCollapsedState(graph, treeData);

        // 绑定事件监听器
        bindEventListeners();
    };

    // 绑定事件监听器
    const bindEventListeners = () => {
        // 处理节点点击事件
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
                        await handleLeafNodeDeletion(item, model);
                    } else {
                        await handleNonLeafNodeDeletion(item, model);
                    }

                    // 更新视图状态
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

            // 处理展开/折叠按钮点击
            if (targetName === 'collapse-text' || targetName === 'icon-box') {
                handleNodeCollapse(item, model);
                return;
            }
        });
    };

    // 处理叶子节点删除
    const handleLeafNodeDeletion = async (item, model) => {
        await chrome.history.deleteUrl({ url: model.url });
        const parentNode = graph.findById(item.get('parent'));
        if (parentNode) {
            updateParentAfterDeletion(parentNode, model.id);
        }
        graph.removeItem(item);
    };

    // 处理非叶子节点删除
    const handleNonLeafNodeDeletion = async (item, model) => {
        const deletePromises = [];
        collectUrlsToDelete(model, deletePromises);
        await Promise.all(deletePromises);
        await updateGraphAfterBulkDeletion();
    };

    // 收集要删除的URL
    const collectUrlsToDelete = (node, promises) => {
        if (node.isLeaf && node.url) {
            promises.push(chrome.history.deleteUrl({ url: node.url }));
        }
        if (node.children) {
            node.children.forEach(child => collectUrlsToDelete(child, promises));
        }
    };

    // 更新父节点
    const updateParentAfterDeletion = (parentNode, deletedChildId) => {
        const parentModel = parentNode.getModel();
        parentModel.children = parentModel.children.filter(child => child.id !== deletedChildId);
        const count = parentModel.children.length;
        const newLabel = parentModel.label.replace(/\(\d+\)/, `(${count})`);
        graph.updateItem(parentNode, {
            ...parentModel,
            label: newLabel
        });

        if (count === 0) {
            const grandParentNode = graph.findById(parentNode.get('parent'));
            if (grandParentNode) {
                const grandParentModel = grandParentNode.getModel();
                grandParentModel.children = grandParentModel.children.filter(child => child.id !== parentModel.id);
                graph.updateItem(grandParentNode, grandParentModel);
            }
            graph.removeItem(parentNode);
        }
    };

    // 处理节点显示/隐藏
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

                        // 保持子节点的折叠态
                        if (childNode.getModel().collapsed) {
                            // 如果子节点是折叠状态，确保其子节点持隐藏
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

    // 处理节点折叠
    const handleNodeCollapse = (item, model) => {
        model.collapsed = !model.collapsed;
        const collapsed = model.collapsed;

        // 更新展开/折叠图标
        const group = item.getContainer();
        const icon = group.find(element => element.get('name') === 'collapse-text');
        if (icon) {
            icon.attr('text', collapsed ? '+' : '-');
        }

        // 处理节点显示/隐藏
        processChildren(item, collapsed);

        // 更新节点状态
        graph.updateItem(item, {
            collapsed: collapsed
        });

        // 重新布局
        graph.layout();
    };

    // 更新图形数据
    const updateGraphAfterBulkDeletion = async () => {
        const allHistory = await chrome.history.search({
            text: '',
            maxResults: 100000,
            startTime: 0
        });

        historyItems = allHistory;
        const expandedState = saveExpandedState();
        const groups = groupBySelect.value === 'domain'
            ? groupByDomain(historyItems)
            : groupByDate(historyItems);

        const newTreeData = await buildTreeData(groups);
        restoreExpandedState(newTreeData, expandedState);
        graph.changeData(newTreeData);
    };

    // 保存展开状态
    const saveExpandedState = () => {
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
        return { expandedNodeIds, expandedParentIds };
    };

    // 恢复展开状态
    const restoreExpandedState = (treeData, { expandedNodeIds, expandedParentIds }) => {
        const restoreNode = (node) => {
            if (expandedNodeIds.has(node.id) || expandedParentIds.has(node.id)) {
                node.collapsed = false;
            }
            if (node.children) {
                node.children.forEach(restoreNode);
            }
        };
        if (treeData.children) {
            treeData.children.forEach(restoreNode);
        }
    };

    // 在 DOMContentLoaded 事件处数中，loadHistoryItems 之前添加
    // 初始化搜索功能
    initializeSearch();

    // 修改搜索相关函数
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

    async function performSearch(query) {
        clearSearchHighlights();
        searchResults = [];
        currentSearchIndex = -1;

        if (!query || !treeDataCache) {
            updateSearchInfo();
            return;
        }

        const queryLower = query.toLowerCase();
        const matchedPaths = [];

        // 递归搜索函数
        function searchNode(nodeData, currentPath = []) {
            const label = nodeData.label || '';
            const url = nodeData.url || '';
            const isMatched = label.toLowerCase().includes(queryLower) || url.toLowerCase().includes(queryLower);

            if (isMatched && nodeData.isLeaf) {  // 只匹配叶子节点
                matchedPaths.push([...currentPath, nodeData]);
            }

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

        if (matchedPaths.length === 0) {
            updateSearchInfo();
            return;
        }

        // 展开匹配路径上的所有节点
        matchedPaths.forEach(path => {
            // 第一次展开
            for (let i = 0; i < path.length - 1; i++) {
                const nodeData = path[i];
                const node = graph.findById(nodeData.id);
                if (node) {
                    const model = node.getModel();
                    if (model.collapsed) {
                        model.collapsed = false;
                        graph.updateItem(node, { collapsed: false });

                        // 更新展开/折叠图标
                        const group = node.getContainer();
                        const icon = group.find(element => element.get('name') === 'collapse-text');
                        if (icon) {
                            icon.attr('text', '-');
                        }

                        // 显示子���点和边
                        if (model.children) {
                            model.children.forEach(childData => {
                                const childNode = graph.findById(childData.id);
                                if (childNode) {
                                    graph.showItem(childNode);
                                    graph.getEdges().forEach(edge => {
                                        if (edge.getTarget().get('id') === childData.id) {
                                            graph.showItem(edge);
                                        }
                                    });
                                }
                            });
                        }
                    }
                }
            }
        });

        // 更新布局
        graph.layout();

        // 第二次展开
        matchedPaths.forEach(path => {
            for (let i = 0; i < path.length - 1; i++) {
                const nodeData = path[i];
                const node = graph.findById(nodeData.id);
                if (node) {
                    const model = node.getModel();
                    if (model.collapsed) {
                        model.collapsed = false;
                        graph.updateItem(node, { collapsed: false });

                        // 更新展开/折叠���标
                        const group = node.getContainer();
                        const icon = group.find(element => element.get('name') === 'collapse-text');
                        if (icon) {
                            icon.attr('text', '-');
                        }

                        // 显示子节点和边
                        if (model.children) {
                            model.children.forEach(childData => {
                                const childNode = graph.findById(childData.id);
                                if (childNode) {
                                    graph.showItem(childNode);
                                    graph.getEdges().forEach(edge => {
                                        if (edge.getTarget().get('id') === childData.id) {
                                            graph.showItem(edge);
                                        }
                                    });
                                }
                            });
                        }
                    }
                }
            }
        });

        // 再次更新布局
        graph.layout();

        // 高亮匹配的节点
        searchResults = matchedPaths.map(path => {
            const targetNode = graph.findById(path[path.length - 1].id);
            if (targetNode) {
                // 确保节点可见
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

    function focusSearchResult() {
        const node = searchResults[currentSearchIndex];
        if (!node) return;

        // 清除之前的焦点样式
        clearSearchFocus();

        // 添加新的焦点样式
        const bbox = node.getBBox();
        node.get('group').addShape('rect', {
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

        // 聚焦到当前节点
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
            // 移除所有搜索相关形状
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
        const searchInfo = document.getElementById('searchInfo');
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