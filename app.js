// app.js
// FIXED: Active polling for wallet initialization, cleanup on navigation

import { inject } from 'https://esm.sh/@vercel/analytics';

// Only inject Vercel Analytics if NOT on localhost
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    inject();
}

const ethers = window.ethers;

import { DOMElements } from './dom-elements.js';
import { State } from './state.js';
import { initPublicProvider, subscribeToWalletChanges, disconnectWallet, openConnectModal } from './modules/wallet.js';
import { showToast, showShareModal, showWelcomeModal } from './ui-feedback.js';
import { formatBigNumber } from './utils.js'; 
import { loadAddresses } from './config.js'; 

// Page imports
import { DashboardPage } from './pages/DashboardPage.js';
import { EarnPage } from './pages/EarnPage.js';
import { StorePage } from './pages/StorePage.js';
import { RewardsPage } from './pages/RewardsPage.js';
import { TigerGamePage } from './pages/TigerGame.js'; 
import { AboutPage } from './pages/AboutPage.js';
import { AirdropPage } from './pages/AirdropPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { PresalePage } from './pages/PresalePage.js';
import { DaoPage } from './pages/DaoPage.js';
import { FaucetPage } from './pages/FaucetPage.js';
import { TokenomicsPage } from './pages/TokenomicsPage.js';
import { NotaryPage } from './pages/NotaryPage.js';

// ============================================================================
// FORMATTING FUNCTIONS
// ============================================================================

/**
 * Format wallet address to 0x + 2 chars... + 3 chars
 */
function formatAddress(addr) {
    if (!addr || addr.length < 42) return '...';
    return `${addr.slice(0, 2)}...${addr.slice(-3)}`; 
}

/**
 * Format balance (in Wei) to M (Millions) or B (Billions)
 */
function formatLargeBalance(bigNum) {
    const num = formatBigNumber(bigNum);
    
    if (num >= 1_000_000_000) {
        return (num / 1_000_000_000).toFixed(2) + 'B';
    }
    if (num >= 1_000_000) {
        return (num / 1_000_000).toFixed(2) + 'M';
    }
    if (num >= 10_000) {
        return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================================
// ROUTE CONFIGURATION
// ============================================================================

const routes = {
    'dashboard': DashboardPage,
    'earn': EarnPage,
    'store': StorePage,
    'rewards': RewardsPage,
    'actions': TigerGamePage,
    'notary': NotaryPage,
    'airdrop': AirdropPage,
    'dao': DaoPage,
    'tokenomics': TokenomicsPage,
    'faucet': FaucetPage,
    'about': AboutPage,
    'admin': AdminPage,
    'presale': PresalePage,
};

let activePageId = 'dashboard';
const ADMIN_WALLET = '0x03aC69873293cD6ddef7625AfC91E3Bd5434562a';

// FIXED: Track active page cleanup function
let currentPageCleanup = null;

// ============================================================================
// WALLET STATE CHANGE HANDLER
// ============================================================================

function onWalletStateChange(changes) {
    const { isConnected, address, isNewConnection, wasConnected } = changes;
    console.log("Wallet State Changed:", changes);

    updateUIState();
    
    if (isConnected && isNewConnection) {
        showToast(`Connected: ${formatAddress(address)}`, "success");
    } else if (!isConnected && wasConnected) {
        showToast("Wallet disconnected.", "info");
    }
}

// ============================================================================
// NAVIGATION
// ============================================================================

/**
 * Navigate to a specific page
 * FIXED: Added cleanup for previous page
 */
function navigateTo(pageId) {
    const pageContainer = document.querySelector('main > div.container');
    const navItems = document.querySelectorAll('.sidebar-link');

    if (!pageContainer || !navItems.length) {
        console.error("DOM elements for navigation not found.");
        return;
    }

    // FIXED: Call cleanup function for previous page
    if (currentPageCleanup && typeof currentPageCleanup === 'function') {
        console.log(`Cleaning up previous page: ${activePageId}`);
        currentPageCleanup();
        currentPageCleanup = null;
    }

    // Hide all pages
    Array.from(pageContainer.children).forEach(child => {
        if (child.tagName === 'SECTION') {
            child.classList.add('hidden');
            child.classList.remove('active');
        }
    });

    // Remove active state from nav items
    navItems.forEach(item => {
        item.classList.remove('active');
        item.classList.add('text-zinc-400', 'hover:text-white', 'hover:bg-zinc-700');
    });

    // Show target page
    const targetPage = document.getElementById(pageId);
    if (targetPage && routes[pageId]) {
        targetPage.classList.remove('hidden');
        targetPage.classList.add('active');
        activePageId = pageId;

        // Mark nav item as active
        const activeNavItem = document.querySelector(`.sidebar-link[data-target="${pageId}"]`);
        if (activeNavItem) {
            activeNavItem.classList.add('active');
        }

        // Render page and get cleanup function if available
        if (routes[pageId]) {
            if (typeof routes[pageId].render === 'function') {
                routes[pageId].render(true);
            }
            
            // FIXED: Store cleanup function if page provides one
            if (typeof routes[pageId].cleanup === 'function') {
                currentPageCleanup = routes[pageId].cleanup;
            }
        }
        
    } else {
        console.error(`Page ID '${pageId}' not found or route not defined.`);
        navigateTo('dashboard');
    }
}
window.navigateTo = navigateTo;

// ============================================================================
// UI STATE UPDATE
// ============================================================================

/**
 * Update all UI elements based on global State
 */
function updateUIState() {
    const adminLinkContainer = document.getElementById('admin-link-container');
    const statUserBalanceEl = document.getElementById('statUserBalance');

    // Header elements
    const connectButtonDesktop = document.getElementById('connectButtonDesktop');
    const connectButtonMobile = document.getElementById('connectButtonMobile');
    const mobileAppDisplay = document.getElementById('mobileAppDisplay');

    // Tabs
    const popMiningTab = document.getElementById('pop-mining-tab');
    const validatorSectionTab = document.getElementById('validator-section-tab');

    // Helper to check elements
    const checkElement = (el, name) => { 
        if (!el) console.warn(`Element ${name} not found in DOM during UI update.`); 
        return el; 
    };

    if (State.isConnected && State.userAddress) {
        // Connected state
        const balanceString = formatLargeBalance(State.currentUserBalance);

        // Update connect buttons to show balance
        checkElement(connectButtonDesktop, 'connectButtonDesktop').textContent = `${balanceString} $BKC`;
        checkElement(connectButtonMobile, 'connectButtonMobile').textContent = `${balanceString} $BKC`;

        // Restore mobile title
        const mobileDisplayEl = checkElement(mobileAppDisplay, 'mobileAppDisplay');
        if (mobileDisplayEl) { 
            mobileDisplayEl.textContent = 'Backcoin.org'; 
            mobileDisplayEl.classList.add('text-amber-400'); 
            mobileDisplayEl.classList.remove('text-white'); 
        }

        // Update context elements
        const fullBalanceNum = formatBigNumber(State.currentUserBalance);
        if (statUserBalanceEl) {
            statUserBalanceEl.textContent = fullBalanceNum.toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            });
        }
        
        if (popMiningTab) popMiningTab.style.display = 'block';
        if (validatorSectionTab) validatorSectionTab.style.display = 'block';
        
        if (adminLinkContainer) { 
            adminLinkContainer.style.display = (State.userAddress.toLowerCase() === ADMIN_WALLET.toLowerCase()) ? 'block' : 'none'; 
        }
        
    } else {
        // Disconnected state
        checkElement(connectButtonDesktop, 'connectButtonDesktop').textContent = "Connect";
        checkElement(connectButtonMobile, 'connectButtonMobile').textContent = "Connect";
        
        const mobileDisplayEl = checkElement(mobileAppDisplay, 'mobileAppDisplay');
        if (mobileDisplayEl) { 
            mobileDisplayEl.textContent = 'Backcoin.org'; 
            mobileDisplayEl.classList.add('text-amber-400'); 
            mobileDisplayEl.classList.remove('text-white'); 
        }

        if (popMiningTab) popMiningTab.style.display = 'none';
        if (validatorSectionTab) validatorSectionTab.style.display = 'none';
        if (adminLinkContainer) adminLinkContainer.style.display = 'none';
        if (statUserBalanceEl) statUserBalanceEl.textContent = '--';
    }

    // Trigger re-render of active page
    navigateTo(activePageId); 
}

// ============================================================================
// GLOBAL EVENT LISTENERS
// ============================================================================

function setupGlobalListeners() {
    const navItems = document.querySelectorAll('.sidebar-link');
    const menuButton = document.getElementById('menu-btn');
    const sidebar = document.getElementById('sidebar');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const connectButton = document.getElementById('connectButtonDesktop');
    const connectButtonMobile = document.getElementById('connectButtonMobile');
    const shareButton = document.getElementById('shareProjectBtn');

    // 1. Sidebar navigation
    if (navItems.length > 0) {
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const pageId = item.dataset.target;
                if (pageId) {
                    navigateTo(pageId);
                    // Close mobile sidebar
                    if (sidebar.classList.contains('translate-x-0')) {
                        sidebar.classList.remove('translate-x-0');
                        sidebar.classList.add('-translate-x-full');
                        sidebarBackdrop.classList.add('hidden');
                    }
                }
            });
        });
    } else {
        console.warn("No sidebar navigation items found.");
    }
    
    // 2. Connect buttons
    if (connectButton) {
        connectButton.addEventListener('click', openConnectModal);
    }
    if (connectButtonMobile) {
        connectButtonMobile.addEventListener('click', openConnectModal);
    }
    
    // 3. Share button
    if (shareButton) {
        shareButton.addEventListener('click', () => {
            showShareModal(State.userAddress);
        });
    }

    // 4. Mobile menu button
    if (menuButton && sidebar && sidebarBackdrop) {
        menuButton.addEventListener('click', () => {
            sidebar.classList.toggle('-translate-x-full');
            sidebar.classList.toggle('translate-x-0');
            sidebarBackdrop.classList.toggle('hidden');
        });
        sidebarBackdrop.addEventListener('click', () => {
            sidebar.classList.add('-translate-x-full');
            sidebar.classList.remove('translate-x-0');
            sidebarBackdrop.classList.add('hidden');
        });
    }

    // 5. Global tab switching logic
    document.body.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.tab-btn');
        
        if (!tabButton) return; 
        if (tabButton.classList.contains('active')) return; 
        
        e.preventDefault();
        
        const targetId = tabButton.dataset.target;
        const targetContent = document.getElementById(targetId);
        
        if (!targetContent) {
            console.warn(`Tab content (targetId: '${targetId}') not found.`);
            return;
        }

        const nav = tabButton.closest('nav');
        if (nav) {
            nav.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        }
        
        tabButton.classList.add('active');

        const contentHost = targetContent.parentElement;
        if (contentHost) {
            Array.from(contentHost.children).forEach(child => {
                if (child.classList.contains('tab-content')) {
                    child.classList.add('hidden'); 
                    child.classList.remove('active');
                }
            });
        }
        
        targetContent.classList.remove('hidden');
        targetContent.classList.add('active');
    });

    console.log("Global listeners attached.");
}

// ============================================================================
// APPLICATION INITIALIZATION
// ============================================================================

/**
 * FIXED: Active polling instead of fixed timeout
 */
window.addEventListener('load', async () => {
    console.log("Window 'load' event fired. Starting initialization...");

    try {
        // Load contract addresses
        const addressesLoaded = await loadAddresses(); 
        
        if (!addressesLoaded) {
            console.error("Failed to load addresses. Application cannot continue.");
            return; 
        }
        console.log("Addresses loaded successfully.");
    
    } catch (error) {
        console.error("Critical failure loading addresses:", error);
        document.body.innerHTML = `<div style="color: red; padding: 20px; font-family: sans-serif; font-size: 1.2rem; background: #222; border: 1px solid red; margin: 20px;">
            <b>Error:</b> Could not load <code>deployment-addresses.json</code>.
            <br><br><b>Solution:</b> Verify the file exists in project root and refresh the page.
            <br><br><small>${error.message}</small></div>`;
        return;
    }
    
    setupGlobalListeners();

    // 1. Initialize public provider
    await initPublicProvider(); 

    // 2. Subscribe to wallet changes (includes auto-reconnect logic)
    subscribeToWalletChanges(onWalletStateChange);

    // FIXED: Active polling for wallet initialization
    console.log("Waiting for wallet initialization (max 5s)...");
    const maxWaitTime = 5000;
    const startTime = Date.now();
    let lastCheck = Date.now();
    
    while (!window.walletInitialized && (Date.now() - startTime < maxWaitTime)) {
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Log progress every 1s
        if (Date.now() - lastCheck > 1000) {
            console.log(`⏳ Still waiting... (${Math.round((Date.now() - startTime) / 1000)}s)`);
            lastCheck = Date.now();
        }
    }
    
    if (window.walletInitialized) {
        console.log("✅ Wallet initialized successfully!");
        console.log("🔍 DEBUG - State after init:", {
            isConnected: State.isConnected,
            address: State.userAddress,
            balance: State.currentUserBalance?.toString()
        });
        
        // CRITICAL FIX: Force UI update after initialization
        updateUIState();
        
        // EXTRA FIX: Force re-render of dashboard after 500ms to ensure UI catches up
        setTimeout(() => {
            console.log("🔄 Final UI sync...");
            updateUIState();
            navigateTo(activePageId);
        }, 500);
    } else {
        console.log("⏱️ Wallet initialization timeout.");
        
        // FALLBACK: Check if we have a saved session but failed to reconnect
        const hasLocalStorage = Object.keys(localStorage).some(key => 
            key.includes('wc@2') || key.includes('W3M') || key.includes('WALLETCONNECT')
        );
        
        if (hasLocalStorage) {
            console.log("⚠️ Found saved session but auto-reconnect failed!");
            
            // Show manual reconnect toast
            showToast("Reconnection failed. Click 'Connect' to restore session.", "warning");
            
            // Auto-open modal after 2s
            setTimeout(() => {
                console.log("🔄 Auto-opening connect modal...");
                openConnectModal();
            }, 2000);
        }
    }
    
    // 3. Show welcome modal
    showWelcomeModal();

    // 4. Navigate to default page
    navigateTo(activePageId); 

    console.log("Application initialized.");
});

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================

window.openConnectModal = openConnectModal;
window.disconnectWallet = disconnectWallet;
window.updateUIState = updateUIState;