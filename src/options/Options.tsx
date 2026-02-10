import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Settings, Save, Key, ExternalLink, CheckCircle2 } from 'lucide-react';

const Options: React.FC = () => {
    const [token, setToken] = useState('');
    const [status, setStatus] = useState('');

    useEffect(() => {
        chrome.storage.local.get('notion_token', (result) => {
            if (result.notion_token) {
                setToken(result.notion_token);
            }
        });

        // 设置网页标题
        document.title = "NotionEX 设置";
    }, []);

    const saveOptions = () => {
        if (!token.trim()) {
            setStatus('请输入有效的 Token');
            return;
        }

        chrome.storage.local.set({ notion_token: token.trim() }, () => {
            setStatus('保存成功！');
            setTimeout(() => setStatus(''), 2000);
        });
    };

    return (
        <div className="glass-window" style={{ width: '480px', height: 'auto', minHeight: '400px', padding: '0', margin: 'auto' }}>
            <header className="macos-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ background: 'var(--macos-blue)', padding: '6px', borderRadius: '8px', color: 'white' }}>
                        <Settings size={18} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '15px', fontWeight: '700', margin: 0 }}>NotionEX 设置</h1>
                        <p style={{ fontSize: '11px', color: 'var(--macos-secondary)', margin: 0 }}>配置您的 NotionIntegration</p>
                    </div>
                </div>
            </header>

            <main className="macos-content" style={{ flex: 1 }}>
                <div className="macos-property">
                    <label className="macos-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Key size={14} />
                        Notion Integration Token
                    </label>
                    <input
                        type="password"
                        className="macos-input"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="secret_..."
                        style={{ fontFamily: 'monospace' }}
                    />
                    <p style={{ fontSize: '12px', color: 'var(--macos-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
                        请粘贴您的 Notion Internal Integration Token。
                        <br />
                        <a
                            href="https://www.notion.so/my-integrations"
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--macos-blue)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                            <ExternalLink size={10} /> 获取 Token
                        </a>
                        {' | '}
                        <a
                            href="https://developers.notion.com/docs/create-a-notion-integration#step-2-share-a-database-with-your-integration"
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--macos-blue)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                            <ExternalLink size={10} /> 别忘了分享数据库给 integration
                        </a>
                    </p>
                </div>

                {status && (
                    <div style={{
                        marginTop: '10px',
                        padding: '10px',
                        borderRadius: '8px',
                        background: status.includes('成功') ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)',
                        color: status.includes('成功') ? '#34c759' : '#ff3b30',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontWeight: '500'
                    }}>
                        {status.includes('成功') && <CheckCircle2 size={16} />}
                        {status}
                    </div>
                )}
            </main>

            <footer className="macos-footer">
                <button
                    className="macos-btn-primary"
                    onClick={saveOptions}
                >
                    <Save size={18} />
                    <span>保存配置</span>
                </button>
            </footer>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Options />
    </React.StrictMode>
);
