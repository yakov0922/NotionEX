# NotionEX 项目核心上下文 (Project Context) - v2.1

## 1. 项目愿景 (Vision)
NotionEX 是一个生产级的浏览器插件，专注于提供“像素级还原”的 Notion 网页采集体验。
核心目标：**排版顺序一致**、**富文本样式保留**、**结构化表格同步**、**正文精准识别**。

## 2. 核心采集逻辑 (The Extraction Engine)

### 2.1 顺序与结构 (Sequential Order)
- **DFS 遍历引擎**：禁止先提文字后提图片。采用深度优先搜索遍历 DOM，按网页显示的物理顺序将内容转化为有序 Blocks 数组。
- **格式保留技术**：采集时同步识别 `strong`, `b`, `i`, `em`, `a`, `h1-h6`, `li`, `blockquote`, `table` 等标签。
- **结构化表格支持**：精准识别 `table`, `tr`, `td`, `th`，将其物理行列结构映射至 Notion Table Block，确保数据不位移。
- **链接清洗**：严格过滤非 `http/https` 协议链接，防止 API 报错。

### 2.2 正文容器识别 (Smart Context)
- **智能选择器列表**：优先识别 `article`, `main`, `.content`, `.article`, `#post` 等容器。
- **降噪处理**：自动剔除 `nav`, `footer`, `script`, `style` 以及视觉上隐藏的元素。

### 2.3 图片可靠性 (Image Robustness)
- **多级源溯源**：处理 lazy-load，按优先级检查 `data-src`, `data-original`, `srcset` 等属性。
- **URL 规范化**：自动补全协议相对路径（`//`），确保图片地址对 Notion API 合法。

## 3. 视觉规范 (UI Standard)
- **Notion Native**：1:1 复刻官方 Web Clipper。
- **CSS-Only**：放弃 Tailwind，使用原生 CSS 以彻底解决样式污染和编译报错。

## 4. 同步引擎 (Sync Engine)
- **分片段追加**：严格遵守 Notion API 的 2000 字符段落限制。
- **分页处理**：超过 100 Block 时自动启动追加模式（append children）。
