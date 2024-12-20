const i18n = {
    'zh': {
        'browserHistory': '浏览历史',
        'groupByDomain': '按域名分组',
        'groupByDate': '按日期分组',
        'darkMode': '深色模式',
        'lightMode': '浅色模式',
        'search': '搜索',
        'prev': '上一个',
        'next': '下一个',
        'noMatch': '无匹配',
        'confirmDelete': '确定要删除这条历史记录吗？',
        'deleteError': '删除历史记录失败',
        'loadError': '加载出错',
        'other': '其他'
    },
    'en': {
        'browserHistory': 'Browser History',
        'groupByDomain': 'Group by Domain',
        'groupByDate': 'Group by Date',
        'darkMode': 'Dark Mode',
        'lightMode': 'Light Mode',
        'search': 'Search',
        'prev': 'Previous',
        'next': 'Next',
        'noMatch': 'No Match',
        'confirmDelete': 'Are you sure you want to delete this history record?',
        'deleteError': 'Failed to delete history record',
        'loadError': 'Loading Error',
        'other': 'Others'
    },
    'ja': {
        'browserHistory': 'ブラウザ履歴',
        'groupByDomain': 'ドメインでグループ化',
        'groupByDate': '日付でグループ化',
        'darkMode': 'ダークモード',
        'lightMode': 'ライトモード',
        'search': '検索',
        'prev': '前へ',
        'next': '次へ',
        'noMatch': '一致なし',
        'confirmDelete': 'この履歴を削除してもよろしいですか？',
        'deleteError': '履歴の削除に失敗しました',
        'loadError': '読み込みエラー',
        'other': 'その他'
    }
};

// 获取用户语言
function getUserLanguage() {
    const lang = navigator.language.toLowerCase().split('-')[0];
    return i18n[lang] ? lang : 'en';  // 如果没有对应的语言包，默认使用英语
}

// 获取翻译文本
function t(key) {
    const lang = getUserLanguage();
    return i18n[lang][key] || i18n['en'][key] || key;
}

// 导出函数
export { getUserLanguage, t }; 