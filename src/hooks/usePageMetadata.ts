import React, { useEffect, useState } from 'react'

export interface PageMetadata {
    title: string
    url: string
    favicon: string
}

export const usePageMetadata = () => {
    const [metadata, setMetadata] = useState<PageMetadata | null>(null)

    useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0]
            if (activeTab) {
                setMetadata({
                    title: activeTab.title || '',
                    url: activeTab.url || '',
                    favicon: activeTab.favIconUrl || ''
                })
            }
        })
    }, [])

    return metadata
}
