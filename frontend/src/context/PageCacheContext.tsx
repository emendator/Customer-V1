import React, { createContext, useContext, useRef, useCallback, type ReactNode } from 'react';

/**
 * 页面缓存 Context —— 在页面间切换时保留上一次的页面数据，
 * 切回时不重新请求 API，避免 AI 模式下白白消耗 Token。
 *
 * 用法：在页面组件中调用 savePageData(path, data) 保存状态，
 * 用 getPageData(path) 获取上次保存的状态。
 */
interface PageCacheContextType {
    savePageData: (pageKey: string, data: any) => void;
    getPageData: (pageKey: string) => any;
}

const PageCacheContext = createContext<PageCacheContextType | undefined>(undefined);

export const usePageCache = (): PageCacheContextType => {
    const context = useContext(PageCacheContext);
    if (!context) {
        throw new Error('usePageCache must be used within a PageCacheProvider');
    }
    return context;
};

export const PageCacheProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // 使用 useRef 保证跨渲染周期数据不丢失
    const cacheRef = useRef<Record<string, any>>({});

    const savePageData = useCallback((pageKey: string, data: any) => {
        cacheRef.current[pageKey] = data;
    }, []);

    const getPageData = useCallback((pageKey: string) => {
        return cacheRef.current[pageKey];
    }, []);

    return (
        <PageCacheContext.Provider value={{ savePageData, getPageData }}>
            {children}
        </PageCacheContext.Provider>
    );
};
