let searchResults = [];
let currentSearchIndex = -1;

function initializeSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchPrev = document.getElementById('searchPrev');
    const searchNext = document.getElementById('searchNext');
    const searchInfo = document.getElementById('searchInfo');

    searchInput.addEventListener('input', () => {
        performSearch(searchInput.value);
    });

    searchPrev.addEventListener('click', () => {
        navigateSearch('prev');
    });

    searchNext.addEventListener('click', () => {
        navigateSearch('next');
    });
}

function performSearch(query) {
    // 清除之前的搜索结果
    clearSearchHighlights();
    searchResults = [];
    currentSearchIndex = -1;

    if (!query) {
        updateSearchInfo();
        return;
    }

    const queryLower = query.toLowerCase();

    // 遍历所有节点查找匹配项
    cy.nodes().forEach(node => {
        const title = node.data('title') || '';
        const url = node.data('url') || '';

        if (title.toLowerCase().includes(queryLower) || url.toLowerCase().includes(queryLower)) {
            searchResults.push(node);
            node.addClass('search-highlight');
        }
    });

    updateSearchInfo();

    // 如果有搜索结果，自动跳转到第一个
    if (searchResults.length > 0) {
        currentSearchIndex = 0;
        focusSearchResult();
    }
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

function focusSearchResult() {
    const node = searchResults[currentSearchIndex];
    if (!node) return;

    // 添加焦点样式
    node.addClass('search-focus');

    // 展开到该节点的路径
    let current = node;
    while (current) {
        const parent = current.parent()[0];
        if (parent && parent.isNode()) {
            parent.removeClass('collapsed');
            updateNodeStyle(parent);
            current = parent;
        } else {
            break;
        }
    }

    // 将节点移动到视图中心
    cy.animate({
        fit: {
            eles: node,
            padding: 50
        },
        duration: 500
    });

    updateSearchInfo();
}

function clearSearchHighlights() {
    cy.nodes().removeClass('search-highlight search-focus');
}

function clearSearchFocus() {
    cy.nodes().removeClass('search-focus');
}

function updateSearchInfo() {
    const searchInfo = document.getElementById('searchInfo');
    if (searchResults.length === 0) {
        searchInfo.textContent = '无匹配';
    } else {
        searchInfo.textContent = `${currentSearchIndex + 1}/${searchResults.length}`;
    }
}

// 在初始化时调用
document.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
    initializeSearch();
});

// ... existing code ... 