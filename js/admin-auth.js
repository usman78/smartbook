/**
 * Admin Authentication Script
 * This script runs immediately when included in an admin page to verify
 * that the user has a valid admin session. If not, it redirects to login.
 */

(function () {
    const adminToken = localStorage.getItem('adminToken');
    const adminUserStr = localStorage.getItem('adminUser');

    // Simple frontend route protection
    if (!adminToken || !adminUserStr) {
        window.location.href = 'admin_login.html?redirect=' + encodeURIComponent(window.location.pathname);
        return; // Stop execution
    }

    // Attempt to parse the user data
    try {
        window.adminUser = JSON.parse(adminUserStr);
    } catch (e) {
        console.error("Session data corrupted. Logging out.");
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        window.location.href = 'admin_login.html';
        return;
    }

    // Populate the admin name if the element exists
    document.addEventListener('DOMContentLoaded', () => {
        const adminNameEl = document.getElementById('adminName');
        if (adminNameEl && window.adminUser && window.adminUser.name) {
            adminNameEl.textContent = window.adminUser.name;
        }

        // Default implementation to set current date if the element exists
        const currentDateDisplay = document.getElementById('currentDateDisplay');
        if (currentDateDisplay) {
            const today = new Date();
            const options = { month: 'short', day: 'numeric', year: 'numeric' };
            currentDateDisplay.textContent = today.toLocaleDateString('en-US', options);
        }
    });
})();

/**
 * Global logout function for admin pages
 */
window.logout = function () {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    window.location.href = 'admin_login.html';
};
