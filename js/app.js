/* SmartBook Global Logic */

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initNavigation();
});

/**
 * Theme Management
 */
function initTheme() {
    const isDark = localStorage.getItem('theme') === 'dark' || 
                   (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark');
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

/**
 * Handle Navigation & Common UI
 */
function initNavigation() {
    // Shared navigation logic can go here
    console.log('SmartBook UI Initialized');
}
