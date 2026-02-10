import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Save, Check, FileText, ChevronRight, Loader2, AlertCircle, Key, ExternalLink, ArrowLeft, Plus, Trash2, Building2, Pencil, GripVertical, X } from 'lucide-react';

interface Database {
    id: string;
    title: string;
    titleKey: string;
}

interface Workspace {
    id: string;
    name: string;
    token: string;
}

interface ContentItem {
    type: string;
    rich_text?: any[];
    value?: string;
    level?: number;
    rows?: any[][];
    table_width?: number;
}

type ViewState = 'main' | 'settings' | 'success';

const App: React.FC = () => {
    const { t } = useTranslation();
    const [view, setView] = useState<ViewState>('main');
    const [title, setTitle] = useState('');

    // Multi-workspace state
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');

    const [databases, setDatabases] = useState<Database[]>([]);
    const [selectedDatabase, setSelectedDatabase] = useState('');

    const [saving, setSaving] = useState(false);
    const [lastUrl, setLastUrl] = useState('');
    const [error, setError] = useState('');

    // Settings form state
    const [newWorkspaceName, setNewWorkspaceName] = useState('');
    const [newWorkspaceToken, setNewWorkspaceToken] = useState('');
    const [verifyingToken, setVerifyingToken] = useState(false);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editToken, setEditToken] = useState('');

    // DnD state
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    useEffect(() => {
        // 1. 获取当前标签页标题
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.title) {
                setTitle(tabs[0].title);
            }
        });

        // 2. 初始化：迁移数据 & 加载工作空间
        const init = async () => {
            try {
                const result = await chrome.storage.local.get(['notion_token', 'notion_workspaces', 'last_workspace_id']);

                let currentWorkspaces: Workspace[] = result.notion_workspaces || [];

                // 数据迁移: 如果有旧 token 但没有 workspaces，进行迁移
                if (result.notion_token && currentWorkspaces.length === 0) {
                    const migratedWorkspace: Workspace = {
                        id: crypto.randomUUID(),
                        name: t('init.defaultWorkspace'),
                        token: result.notion_token
                    };
                    currentWorkspaces = [migratedWorkspace];
                    await chrome.storage.local.set({
                        notion_workspaces: currentWorkspaces,
                        notion_token: '' // 清除旧 token 防止重复迁移
                    });
                }

                setWorkspaces(currentWorkspaces);

                if (currentWorkspaces.length > 0) {
                    const lastId = result.last_workspace_id;
                    const targetId = currentWorkspaces.find(w => w.id === lastId) ? lastId : currentWorkspaces[0].id;
                    setSelectedWorkspaceId(targetId);
                    await fetchDatabases(currentWorkspaces.find(w => w.id === targetId)!.token);
                }

            } catch (err) {
                console.error('Failed to init:', err);
                setError(t('error.initFailed'));
            }
        };

        init();
    }, [t]);

    const fetchDatabases = async (apiToken: string) => {
        try {
            setError('');
            // Don't clear databases immediately to avoid flash if switching between valid workspaces
            // setDatabases([]); 
            // setSelectedDatabase('');

            const response = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filter: {
                        value: 'database',
                        property: 'object'
                    },
                    sort: {
                        direction: 'descending',
                        timestamp: 'last_edited_time'
                    }
                })
            });

            if (!response.ok) {
                if (response.status === 401) throw new Error(t('error.tokenInvalid'));
                throw new Error(t('error.fetchFailed'));
            }

            const data = await response.json();
            const dbs = data.results.map((db: any) => {
                const titlePropEntry = Object.entries(db.properties).find(([_, prop]: [string, any]) => prop.type === 'title');
                const titleKey = titlePropEntry ? titlePropEntry[0] : 'Name';

                return {
                    id: db.id,
                    title: db.title?.[0]?.plain_text || 'Untitled Database',
                    titleKey
                };
            });

            setDatabases(dbs);
            if (dbs.length > 0) setSelectedDatabase(dbs[0].id);
        } catch (err: any) {
            console.error(err);
            setError(err.message || t('error.fetchFailedPermission'));
            setDatabases([]);
            setSelectedDatabase('');
        }
    };

    const handleWorkspaceChange = async (workspaceId: string) => {
        setSelectedWorkspaceId(workspaceId);
        chrome.storage.local.set({ last_workspace_id: workspaceId });

        const workspace = workspaces.find(w => w.id === workspaceId);
        if (workspace) {
            await fetchDatabases(workspace.token);
        }
    };

    const handleAddWorkspace = async () => {
        if (!newWorkspaceToken.trim()) {
            setError(t('error.tokenEmpty'));
            return;
        }

        setVerifyingToken(true);
        setError('');

        try {
            const token = newWorkspaceToken.trim();
            // 简单验证 Token 是否对应有效的 Notion 用户/Bot
            const response = await fetch('https://api.notion.com/v1/users/me', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Notion-Version': '2022-06-28'
                }
            });

            if (!response.ok) {
                throw new Error(t('error.tokenCheck'));
            }

            const userData = await response.json();
            const botName = userData.name || 'New Workspace';
            const name = newWorkspaceName.trim() || botName;

            const newWorkspace: Workspace = {
                id: crypto.randomUUID(),
                name,
                token
            };

            const updatedWorkspaces = [...workspaces, newWorkspace];
            await chrome.storage.local.set({ notion_workspaces: updatedWorkspaces });

            setWorkspaces(updatedWorkspaces);
            setNewWorkspaceName('');
            setNewWorkspaceToken('');

            if (workspaces.length === 0) {
                setSelectedWorkspaceId(newWorkspace.id);
                chrome.storage.local.set({ last_workspace_id: newWorkspace.id });
                await fetchDatabases(newWorkspace.token);
            }

        } catch (err: any) {
            setError(err.message || t('error.addFailed'));
        } finally {
            setVerifyingToken(false);
        }
    };

    const handleDeleteWorkspace = async (id: string) => {
        if (!confirm(t('confirm.deleteWorkspace'))) return;

        const updatedWorkspaces = workspaces.filter(w => w.id !== id);
        await chrome.storage.local.set({ notion_workspaces: updatedWorkspaces });
        setWorkspaces(updatedWorkspaces);

        if (selectedWorkspaceId === id) {
            if (updatedWorkspaces.length > 0) {
                handleWorkspaceChange(updatedWorkspaces[0].id);
            } else {
                setSelectedWorkspaceId('');
                setDatabases([]);
            }
        }
    };

    // Edit Logic
    const startEditing = (w: Workspace) => {
        setEditingId(w.id);
        setEditName(w.name);
        setEditToken(w.token);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditName('');
        setEditToken('');
    };

    const saveEditing = async () => {
        if (!editToken.trim()) {
            setError(t('error.tokenEmpty'));
            return;
        }

        const updatedWorkspaces = workspaces.map(w => {
            if (w.id === editingId) {
                return { ...w, name: editName, token: editToken };
            }
            return w;
        });

        await chrome.storage.local.set({ notion_workspaces: updatedWorkspaces });
        setWorkspaces(updatedWorkspaces);

        // If we edited the currently selected workspace, refresh databases
        if (selectedWorkspaceId === editingId) {
            await fetchDatabases(editToken);
        }

        setEditingId(null);
    };

    // Drag and Drop Logic
    const handleSort = async () => {
        if (dragItem.current !== null && dragOverItem.current !== null) {
            const _workspaces = [...workspaces];
            const draggedItemContent = _workspaces.splice(dragItem.current, 1)[0];
            _workspaces.splice(dragOverItem.current, 0, draggedItemContent);

            dragItem.current = null;
            dragOverItem.current = null;

            setWorkspaces(_workspaces);
            await chrome.storage.local.set({ notion_workspaces: _workspaces });
        }
    };

    const convertToBlock = (item: ContentItem) => {
        switch (item.type) {
            case 'heading':
                const level = item.level || 1;
                const type = `heading_${level}` as 'heading_1' | 'heading_2' | 'heading_3';
                if (level > 3) return {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: [{ type: 'text', text: { content: item.value || '' }, annotations: { bold: true } }]
                    }
                };
                return {
                    object: 'block',
                    type,
                    [type]: {
                        rich_text: [{ type: 'text', text: { content: item.value || '' } }]
                    }
                };
            case 'paragraph':
                return {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: item.rich_text?.map((t: any) => ({
                            type: 'text',
                            text: { content: t.text, link: t.link ? { url: t.link } : null },
                            annotations: { bold: t.bold }
                        })) || []
                    }
                };
            case 'image':
                return {
                    object: 'block',
                    type: 'image',
                    image: {
                        type: 'external',
                        external: { url: item.value }
                    }
                };
            case 'list_item':
                return {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: {
                        rich_text: [{ type: 'text', text: { content: item.value || '' } }]
                    }
                };
            case 'quote':
                return {
                    object: 'block',
                    type: 'quote',
                    quote: {
                        rich_text: [{ type: 'text', text: { content: item.value || '' } }]
                    }
                };
            case 'table':
                if (!item.rows || item.rows.length === 0) return null;
                return {
                    object: 'block',
                    type: 'table',
                    table: {
                        table_width: item.table_width || 2,
                        has_column_header: true,
                        has_row_header: false,
                        children: item.rows.map(row => ({
                            type: 'table_row',
                            table_row: {
                                cells: row.map((cell: any) => ([{
                                    type: 'text',
                                    text: { content: cell.text || '' },
                                    annotations: { bold: cell.bold }
                                }]))
                            }
                        }))
                    }
                };
            case 'break':
                return {
                    object: 'block',
                    type: 'divider',
                    divider: {}
                };
            default:
                return null;
        }
    };

    const handleSave = async () => {
        const workspace = workspaces.find(w => w.id === selectedWorkspaceId);
        const selectedDb = databases.find(db => db.id === selectedDatabase);

        if (!selectedDb || !workspace) return;
        setSaving(true);
        setError('');

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) throw new Error(t('error.getPageFailed'));

            const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_CONTENT' });
            if (!response || !response.contentItems) throw new Error(t('error.extractFailed'));

            const children = response.contentItems
                .map(convertToBlock)
                .filter(Boolean);

            const res = await fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${workspace.token}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    parent: { database_id: selectedDatabase },
                    properties: {
                        [selectedDb.titleKey]: {
                            title: [{ text: { content: title } }]
                        }
                    },
                    children: [
                        { // 插入原文链接
                            object: 'block',
                            type: 'callout',
                            callout: {
                                rich_text: [{ type: 'text', text: { content: `${t('notion.originalLink')}: ${tab.url}` } }],
                                icon: { emoji: '🔗' }
                            }
                        },
                        { object: 'block', type: 'divider', divider: {} },
                        ...children
                    ].slice(0, 100)
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || t('error.saveFailed'));
            }

            const data = await res.json();
            setLastUrl(data.url);
            setView('success');
        } catch (err: any) {
            console.error(err);
            if (err.message && err.message.includes('Receiving end does not exist')) {
                setError(t('error.connectFailed'));
            } else {
                setError(err.message || t('error.saveRetry'));
            }
        } finally {
            setSaving(false);
        }
    };

    if (view === 'success') {
        return (
            <div className="ambient-bg">
                <div className="glass-window">
                    <div className="spatial-success">
                        <div className="success-icon-wrapper">
                            <div className="success-icon-glow"></div>
                            <div style={{
                                background: 'var(--macos-blue)',
                                width: '64px',
                                height: '64px',
                                borderRadius: '22px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                border: '4px solid rgba(255,255,255,0.2)'
                            }}>
                                <Check size={32} />
                            </div>
                        </div>
                        <h2 className="success-title">{t('success.title')}</h2>
                        <p className="success-subtitle">{t('success.subtitle')}</p>

                        {lastUrl && (
                            <a href={lastUrl} target="_blank" rel="noreferrer" className="spatial-link-btn">
                                <div style={{ background: 'rgba(0,122,255,0.1)', padding: '8px', borderRadius: '10px', color: 'var(--macos-blue)' }}>
                                    <FileText size={18} />
                                </div>
                                <span style={{ flex: 1, textAlign: 'left', fontSize: '14px' }}>{t('success.openPage')}</span>
                                <ChevronRight size={16} style={{ opacity: 0.5 }} />
                            </a>
                        )}

                        <button
                            className="spatial-close-btn"
                            onClick={() => { setView('main'); }}
                        >
                            {t('success.back')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'settings') {
        return (
            <div className="ambient-bg">
                <div className="glass-window">
                    <header className="macos-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                onClick={() => {
                                    setView('main');
                                    // 可以在这里刷新一下 Main View 的数据
                                    if (selectedWorkspaceId) {
                                        const w = workspaces.find(w => w.id === selectedWorkspaceId);
                                        if (w) fetchDatabases(w.token);
                                    }
                                }}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--macos-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '4px',
                                    borderRadius: '50%',
                                }}
                                className="icon-btn-hover"
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <h1 style={{ fontSize: '15px', fontWeight: '700', margin: 0 }}>{t('settings.title')}</h1>
                        </div>
                    </header>

                    <main className="macos-content" style={{ gap: '16px' }}>
                        {error && (
                            <div style={{
                                padding: '10px',
                                background: 'rgba(255, 59, 48, 0.1)',
                                border: '1px solid rgba(255, 59, 48, 0.2)',
                                borderRadius: '10px',
                                color: '#ff3b30',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <AlertCircle size={14} />
                                {error}
                            </div>
                        )}

                        {/* 工作空间列表 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label className="macos-label">{t('settings.addedList')}</label>
                            {workspaces.map((w, index) => (
                                <div
                                    key={w.id}
                                    draggable={editingId === null} // 编辑时禁用拖拽
                                    onDragStart={(e) => {
                                        dragItem.current = index;
                                        // 添加拖拽时的样式
                                        e.currentTarget.style.opacity = '0.5';
                                    }}
                                    onDragEnter={(e) => {
                                        dragOverItem.current = index;
                                    }}
                                    onDragEnd={(e) => {
                                        e.currentTarget.style.opacity = '1';
                                        handleSort();
                                    }}
                                    onDragOver={(e) => e.preventDefault()}
                                    style={{
                                        background: 'rgba(255,255,255,0.5)',
                                        padding: '10px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px',
                                        border: '1px solid rgba(0,0,0,0.05)',
                                        cursor: editingId === null ? 'grab' : 'default',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    {editingId === w.id ? (
                                        // 编辑模式
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                            <input
                                                className="macos-input"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                placeholder={t('settings.workspaceNamePlaceholder')}
                                                autoFocus
                                            />
                                            <div style={{ position: 'relative' }}>
                                                <Key size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--macos-secondary)' }} />
                                                <input
                                                    type="password"
                                                    className="macos-input"
                                                    style={{ paddingLeft: '32px', fontFamily: 'monospace' }}
                                                    value={editToken}
                                                    onChange={(e) => setEditToken(e.target.value)}
                                                    placeholder="Token"
                                                />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                <button
                                                    onClick={cancelEditing}
                                                    className="icon-btn-hover"
                                                    style={{ padding: '6px', color: '#ff3b30', border: 'none', background: 'transparent', cursor: 'pointer', opacity: 0.7 }}
                                                    title={t('settings.cancel')}
                                                >
                                                    <X size={16} />
                                                </button>
                                                <button
                                                    onClick={saveEditing}
                                                    className="icon-btn-hover"
                                                    style={{ padding: '6px', color: '#34c759', border: 'none', background: 'transparent', cursor: 'pointer', opacity: 0.7 }}
                                                    title={t('settings.save')}
                                                >
                                                    <Check size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        // 浏览模式
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <GripVertical size={14} style={{ color: 'var(--macos-secondary)', cursor: 'grab' }} />
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '13px', fontWeight: '500' }}>{w.name}</span>
                                                    </div>
                                                    <span style={{ fontSize: '10px', color: 'var(--macos-secondary)' }}>
                                                        {w.token.slice(0, 8)}...{w.token.slice(-4)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <button
                                                    onClick={() => startEditing(w)}
                                                    className="icon-btn-hover"
                                                    style={{ padding: '6px', color: 'var(--macos-primary)', opacity: 0.7, border: 'none', background: 'transparent', cursor: 'pointer' }}
                                                    title={t('settings.edit')}
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteWorkspace(w.id)}
                                                    className="icon-btn-hover"
                                                    style={{ padding: '6px', color: '#ff3b30', opacity: 0.7, border: 'none', background: 'transparent', cursor: 'pointer' }}
                                                    title={t('settings.delete')}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {workspaces.length === 0 && (
                                <div style={{ fontSize: '12px', color: 'var(--macos-secondary)', padding: '8px', textAlign: 'center' }}>
                                    {t('settings.noWorkspaces')}
                                </div>
                            )}
                        </div>

                        {/* 添加新空间 */}
                        <div className="macos-divide-line"></div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <label className="macos-label">{t('settings.addNew')}</label>
                            <input
                                className="macos-input"
                                value={newWorkspaceName}
                                onChange={(e) => setNewWorkspaceName(e.target.value)}
                                placeholder={t('settings.newNamePlaceholder')}
                            />
                            <div style={{ position: 'relative' }}>
                                <Key size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--macos-secondary)' }} />
                                <input
                                    type="password"
                                    className="macos-input"
                                    style={{ paddingLeft: '32px', fontFamily: 'monospace' }}
                                    value={newWorkspaceToken}
                                    onChange={(e) => setNewWorkspaceToken(e.target.value)}
                                    placeholder="secret_..."
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <a
                                    href="https://www.notion.so/my-integrations"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="macos-link"
                                    style={{ fontSize: '12px', color: 'var(--macos-blue)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', marginRight: 'auto' }}
                                >
                                    <ExternalLink size={12} /> {t('settings.getToken')}
                                </a>

                                <button
                                    className="macos-btn-primary"
                                    onClick={handleAddWorkspace}
                                    disabled={verifyingToken || !newWorkspaceToken}
                                    style={{ padding: '6px 12px', fontSize: '12px' }}
                                >
                                    {verifyingToken ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                                    <span>{t('settings.add')}</span>
                                </button>
                            </div>
                        </div>

                    </main>
                </div>
            </div>
        );
    }

    // 渲染主界面 (Main View)
    return (
        <div className="ambient-bg">
            <div className="glass-window">
                <header className="macos-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: 'var(--macos-blue)', padding: '6px', borderRadius: '8px', color: 'white' }}>
                            <FileText size={18} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: '15px', fontWeight: '700', margin: 0 }}>NotionEX</h1>
                            <p style={{ fontSize: '11px', color: 'var(--macos-secondary)', margin: 0 }}>{t('main.subtitle')}</p>
                        </div>
                    </div>
                    <button
                        className="spatial-close-btn"
                        style={{ padding: '8px', cursor: 'pointer' }}
                        onClick={() => {
                            setNewWorkspaceName('');
                            setNewWorkspaceToken('');
                            setError('');
                            setView('settings');
                        }}
                        title={t('main.settingsTooltip')}
                    >
                        <Settings size={18} />
                    </button>
                </header>

                <main className="macos-content">
                    {error && (
                        <div style={{
                            padding: '10px',
                            background: 'rgba(255, 59, 48, 0.1)',
                            border: '1px solid rgba(255, 59, 48, 0.2)',
                            borderRadius: '10px',
                            color: '#ff3b30',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <AlertCircle size={14} />
                            {error}
                        </div>
                    )}

                    <div className="macos-property">
                        <label className="macos-label">{t('main.pageTitle')}</label>
                        <input
                            className="macos-input"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={t('main.titlePlaceholder')}
                        />
                    </div>

                    {/* 工作空间选择器 */}
                    <div className="macos-property">
                        <label className="macos-label">{t('main.workspace')}</label>
                        {workspaces.length > 0 ? (
                            <select
                                className="macos-select"
                                value={selectedWorkspaceId}
                                onChange={(e) => handleWorkspaceChange(e.target.value)}
                            >
                                {workspaces.map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                            </select>
                        ) : (
                            <div
                                className="macos-select"
                                style={{ color: 'var(--macos-secondary)', fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                onClick={() => setView('settings')}
                            >
                                <span>{t('main.configureFirst')}</span>
                                <ChevronRight size={14} />
                            </div>
                        )}
                    </div>

                    {/* 数据库选择器 */}
                    <div className="macos-property">
                        <label className="macos-label">{t('main.saveLocation')}</label>
                        {databases.length > 0 ? (
                            <select
                                className="macos-select"
                                value={selectedDatabase}
                                onChange={(e) => setSelectedDatabase(e.target.value)}
                            >
                                {databases.map(db => (
                                    <option key={db.id} value={db.id}>{db.title}</option>
                                ))}
                            </select>
                        ) : (
                            <div
                                className="macos-select"
                                style={{ color: 'var(--macos-secondary)', fontStyle: 'italic' }}
                            >
                                {workspaces.length === 0 ? t('main.configureFirst') : t('error.fetchFailed')}
                            </div>
                        )}
                    </div>
                </main>

                <footer className="macos-footer">
                    <button
                        className="macos-btn-primary"
                        onClick={handleSave}
                        disabled={saving || !selectedWorkspaceId || databases.length === 0}
                        style={{ opacity: (saving || !selectedWorkspaceId || databases.length === 0) ? 0.6 : 1 }}
                    >
                        {saving ? (
                            <>
                                <Loader2 className="animate-spin" size={18} />
                                <span>{t('main.saving')}</span>
                            </>
                        ) : (
                            <>
                                <Save size={18} />
                                <span>{t('main.saveButton')}</span>
                            </>
                        )}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default App;
