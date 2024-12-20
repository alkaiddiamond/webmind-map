const i18n = {
    'zh': {
        title: '浏览历史思维导图',
        groupByDomain: '按域名分组',
        groupByDate: '按日期分组',
        toggleTheme: '切换主题',
        searchPlaceholder: '搜索URL或标题，按回车执行...',
        searchButton: '搜索',
        prevMatch: '上一个匹配项',
        nextMatch: '下一个匹配项',
        noMatch: '无匹配',
        matchCount: '{current}/{total}',
        deleteConfirm: '确定要删除这条历史记录吗？',
        deleteError: '删除历史记录失败',
        loadError: '加载出错: {error}',
        other: '其他',
        language: '语言'
    },
    'en': {
        title: 'Browsing History Mind Map',
        groupByDomain: 'Group by Domain',
        groupByDate: 'Group by Date',
        toggleTheme: 'Toggle Theme',
        searchPlaceholder: 'Search URL or title, press Enter...',
        searchButton: 'Search',
        prevMatch: 'Previous Match',
        nextMatch: 'Next Match',
        noMatch: 'No Match',
        matchCount: '{current}/{total}',
        deleteConfirm: 'Are you sure to delete this history record?',
        deleteError: 'Failed to delete history record',
        loadError: 'Loading Error: {error}',
        other: 'Others',
        language: 'Language'
    }
};

// 获取系统语言
function getSystemLanguage() {
    const lang = navigator.language.toLowerCase();
    return lang.startsWith('zh') ? 'zh' : 'en';
}

// 当前语言
let currentLanguage = getSystemLanguage();

// 获取翻译文本
function t(key, params = {}) {
    let text = i18n[currentLanguage]?.[key] || i18n['en'][key] || key;

    // 替换参数
    Object.entries(params).forEach(([key, value]) => {
        text = text.replace(`{${key}}`, value);
    });

    return text;
}

// 切换语言
function setLanguage(lang) {
    if (i18n[lang]) {
        currentLanguage = lang;
        // 触发自定义事件
        window.dispatchEvent(new CustomEvent('languageChanged'));
    }
}

// 获取当前语言
function getCurrentLanguage() {
    return currentLanguage;
}

// 获取所有可用语言
function getAvailableLanguages() {
    return Object.keys(i18n);
}

// 将函数添加到全局作用域
window.t = t;
window.setLanguage = setLanguage;
window.getCurrentLanguage = getCurrentLanguage;
window.getAvailableLanguages = getAvailableLanguages; 