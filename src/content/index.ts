chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_PAGE_CONTENT') {
        const contentItems: any[] = [];

        // 1. 智能识别正文容器 (Readability 启发式逻辑)
        const getMainContainer = (): HTMLElement => {
            const selectors = [
                'article', 'main', '[role="main"]',
                '.post-content', '.article-content', '.content-body',
                '.topic-content', '.entry-content', '#js_content'
            ];

            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el instanceof HTMLElement && el.innerText.length > 300) return el;
            }

            const allDivs = Array.from(document.querySelectorAll('div, section'));
            let bestContainer = document.body;
            let maxPCount = 0;

            allDivs.forEach(div => {
                const pCount = div.querySelectorAll('p').length;
                if (pCount > maxPCount) {
                    maxPCount = pCount;
                    bestContainer = div as HTMLElement;
                }
            });

            return bestContainer;
        };

        const container = getMainContainer();

        // 2. 图片源解析增强
        const resolveImageUrl = (img: HTMLImageElement): string | null => {
            const attributes = ['data-original', 'data-src', 'data-actualsrc', 'src', 'srcset'];
            for (const attr of attributes) {
                const val = img.getAttribute(attr);
                if (val) {
                    const firstUrl = val.split(' ')[0].trim();
                    if (firstUrl.startsWith('http')) return firstUrl;
                    if (firstUrl.startsWith('//')) return 'https:' + firstUrl;
                }
            }
            return null;
        };

        // 3. 表格解析逻辑
        const parseTable = (tableEl: HTMLTableElement) => {
            const rows: any[][] = [];
            let maxCols = 0;

            const trs = Array.from(tableEl.querySelectorAll('tr'));
            trs.forEach(tr => {
                const cells = Array.from(tr.querySelectorAll('td, th')) as HTMLElement[];
                if (cells.length > maxCols) maxCols = cells.length;

                const rowData = cells.map(cell => {
                    return {
                        text: cell.innerText.trim(),
                        bold: cell.tagName.toLowerCase() === 'th' || cell.style.fontWeight === 'bold'
                    };
                });
                rows.push(rowData);
            });

            if (rows.length > 0) {
                contentItems.push({
                    type: 'table',
                    table_width: maxCols,
                    rows: rows
                });
            }
        };

        // 4. 深度优先遍历 (DFS) 解析器
        const parseNode = (node: Node) => {
            let shouldSkipChildren = false;

            if (node instanceof HTMLElement) {
                const tag = node.tagName.toLowerCase();
                const style = window.getComputedStyle(node);

                if (style.display === 'none' || style.visibility === 'hidden' ||
                    ['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript', 'iframe'].includes(tag)) {
                    return;
                }

                // 5. 噪声过滤器 (Noise Filter)
                const isNoise = (element: HTMLElement): boolean => {
                    const id = element.id.toLowerCase();
                    const className = element.className.toLowerCase(); // element.className might be SVGAnimatedString if svgs are traversed, but here we check HTMLElement

                    // 关键词黑名单
                    const noiseKeywords = [
                        'comment', 'reply', 'footer', 'header', 'nav', 'sidebar',
                        'recommend', 'related', 'advert', 'promo', 'copyright',
                        'share', 'social', 'tags', 'author-info', 'login-modal',
                        'csdn-side-toolbar', 'template-box', 'blog_footer_bottom',
                        'post_comment', 'post_related', 'reward-user', 'praise'
                    ];

                    // 检查 ID 和 Class
                    if (noiseKeywords.some(kw => id.includes(kw) || (typeof className === 'string' && className.includes(kw)))) {
                        return true;
                    }

                    return false;
                };

                if (isNoise(node)) {
                    return;
                }

                // 处理块级元素断句标记 (进入时)
                const isBlock = ['p', 'div', 'section', 'article', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'table', 'tr'].includes(tag);
                if (isBlock) {
                    contentItems.push({ type: 'break' });
                }

                if (tag === 'table' && node instanceof HTMLTableElement) {
                    parseTable(node);
                    shouldSkipChildren = true; // 表格已单独处理，跳过子节点
                }

                if (['h1', 'h2', 'h3'].includes(tag)) {
                    contentItems.push({ type: 'heading', level: parseInt(tag[1]), value: node.innerText.trim() });
                    shouldSkipChildren = true;
                }
                if (tag === 'blockquote') {
                    contentItems.push({ type: 'quote', value: node.innerText.trim() });
                    shouldSkipChildren = true;
                }
                if (tag === 'li') {
                    // LI 作为文本容器处理，但不跳过子节点，以便提取加粗等格式？
                    // 简化处理：直接取 innerText，但丢失内部格式。
                    // 为了 Rich Text，最好不跳过。但 Notion List Item 是 Block。
                    // 如果不跳过，LI 内部文本会被解析为 Paragraph。
                    // 这里的逻辑是 push 'list_item'，如果不跳过，后续文本会怎样？
                    // 原逻辑： push list_item 并 return (即跳过子节点)。
                    // 为了保真，我们保持原逻辑：直接取值。
                    contentItems.push({ type: 'list_item', value: node.innerText.trim() });
                    shouldSkipChildren = true;
                }
                if (tag === 'img' && node instanceof HTMLImageElement) {
                    const src = resolveImageUrl(node);
                    if (src) contentItems.push({ type: 'image', value: src });
                    shouldSkipChildren = true;
                }
            }

            if (!shouldSkipChildren) {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent;
                    if (text && text.trim().length > 0) {
                        let isBold = false;
                        let link = null;
                        let parent = node.parentElement;

                        while (parent && parent !== container) {
                            const pTag = parent.tagName.toLowerCase();
                            if (['strong', 'b'].includes(pTag)) isBold = true;
                            if (pTag === 'a' && !link) {
                                const href = (parent as HTMLAnchorElement).href;
                                if (href && href.startsWith('http')) link = href;
                            }
                            parent = parent.parentElement;
                        }

                        const last = contentItems[contentItems.length - 1];
                        if (last && last.type === 'paragraph') {
                            last.rich_text.push({ text, bold: isBold, link });
                        } else {
                            contentItems.push({
                                type: 'paragraph',
                                rich_text: [{ text, bold: isBold, link }]
                            });
                        }
                    }
                }

                node.childNodes.forEach(parseNode);
            }

            // 处理块级元素断句标记 (离开时)
            if (node instanceof HTMLElement) {
                const tag = node.tagName.toLowerCase();
                const isBlock = ['p', 'div', 'section', 'article', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'table', 'tr'].includes(tag);
                if (isBlock) {
                    contentItems.push({ type: 'break' });
                }
            }
        };

        parseNode(container);

        const finalContent = contentItems.filter(item => item.type !== 'break');
        sendResponse({ contentItems: finalContent });
    }
    return true;
});
