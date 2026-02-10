import { Client } from '@notionhq/client'

export const createNotionClient = (token: string) => {
    return new Client({ auth: token })
}

export const storage = {
    getToken: async (): Promise<string | null> => {
        const res = await chrome.storage.local.get('notion_token') as { notion_token?: string }
        return res.notion_token || null
    },
    setToken: async (token: string): Promise<void> => {
        await chrome.storage.local.set({ 'notion_token': token })
    },
    clearToken: async (): Promise<void> => {
        await chrome.storage.local.remove('notion_token')
    }
}
