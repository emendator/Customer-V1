import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
    toggleTheme: () => void;
}

const STORAGE_KEY = 'sca_theme';

function getInitialTheme(): ThemeMode {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    // 产品默认深色（深海墨蓝 + 靛蓝/琥珀光晕更出效果）
    return 'dark';
}

// Apply before first paint to avoid a flash of the wrong theme.
const initialTheme = getInitialTheme();
if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = initialTheme;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: initialTheme,
    setTheme: () => {},
    toggleTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<ThemeMode>(initialTheme);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem(STORAGE_KEY, theme);
    }, [theme]);

    const setTheme = useCallback((next: ThemeMode) => setThemeState(next), []);
    const toggleTheme = useCallback(() => {
        setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
