// app.js

const ethers = window.ethers;

import { DOMElements } from './dom-elements.js';
import { State } from './state.js';
// Adiciona setupMetaMaskListeners
import { connectWallet, disconnectWallet, initPublicProvider, checkInitialConnection, setupMetaMaskListeners } from './modules/wallet.js';
import { showToast, showShareModal } from './ui-feedback.js';
// Importa formatAddress de utils.js
import { formatBigNumber, formatAddress } from './utils.js';
import { sepoliaChainId } from './config.js'; // Importa sepoliaChainId

// Importações das Páginas
import { DashboardPage } from './pages/DashboardPage.js';
import { EarnPage } from './pages/EarnPage.js';
import { StorePage } from './pages/StorePage.js';
import { RewardsPage } from './pages/RewardsPage.js';
import { ActionsPage } from './pages/ActionsPage.js';
import { AboutPage } from './pages/AboutPage.js';
import { AirdropPage } from './pages/AirdropPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { PresalePage } from './pages/PresalePage.js';
import { DaoPage } from './pages/DaoPage.js'; // Importa a nova página DAO


const routes = {
    'dashboard': DashboardPage,
    'earn': EarnPage,
    'store': StorePage,
    'rewards': RewardsPage,
    'actions': ActionsPage,
    'about': AboutPage,
    'airdrop': AirdropPage,
    'admin': AdminPage,
    'presale': PresalePage,
    'dao': DaoPage, // Adiciona a rota DAO
};
let activePageId = 'dashboard';
const ADMIN_WALLET = "0x03aC69873293cD6ddef7625AfC91E3Bd5434562a";

// --- Funções de UI e Navegação ---

function updateConnectionStatus(status, message) {
    const statuses = {
        disconnected: { bg: 'bg-red-500/20', text: 'text-red-400', icon: 'fa-circle' },
        connecting: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: 'fa-spinner fa-spin' },
        connected: { bg: 'bg-green-500/20', text: 'text-green-400', icon: 'fa-circle' },
    };
    const { bg, text, icon } = statuses[status];
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
        statusEl.className = `hidden sm:inline-flex items-center gap-2 py-1.5 px-3 rounded-full text-sm font-medium ${bg} ${text}`;
        statusEl.innerHTML = `<i class="fa-solid ${icon} text-xs"></i><span>${message}</span>`;
    }
}

function navigateTo(targetId) {
    if (!routes[targetId]) {
        console.warn(`Route not found: ${targetId}. Navigating to dashboard.`);
        targetId = 'dashboard'; // Default to dashboard if route is invalid
    }

    // Admin route security check
    if (targetId === 'admin' && (!State.userAddress || State.userAddress.toLowerCase() !== ADMIN_WALLET.toLowerCase())) {
        showToast("Access Denied. You are not an administrator.", "error");
        return; // Prevent navigation
    }

    activePageId = targetId;
    // Hide all sections first
    document.querySelectorAll('main section').forEach(section => {
        if (section) section.classList.add('hidden');
    });
    const targetSection = document.getElementById(targetId);

    // Show the target section or handle error
    if (targetSection) {
         targetSection.classList.remove('hidden');
    } else {
        console.error(`Target section #${targetId} not found! Navigating to dashboard.`);
        activePageId = 'dashboard';
        document.getElementById('dashboard')?.classList.remove('hidden');
        // Update sidebar active link
         document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
         document.querySelector(`.sidebar-link[data-target="dashboard"]`)?.classList.add('active');
         // Render dashboard as fallback
         routes['dashboard']?.render();
         return; // Stop execution if section not found
    }

    // Update sidebar active link
    document.querySelectorAll('.sidebar-link').forEach(l => {
        if(!l.hasAttribute('data-target')) return;
        l.classList.remove('active');
    });
    const activeLink = document.querySelector(`.sidebar-link[data-target="${targetId}"]`);
    if(activeLink) {
        activeLink.classList.add('active');
    }

    // Render page content
    if (routes[targetId] && typeof routes[targetId].render === 'function') {
        routes[targetId].render();
        // Call init for listeners if it exists
        if (typeof routes[targetId].init === 'function') {
            routes[targetId].init();
        }
         // Call update for connection state if it exists
         if (typeof routes[targetId].update === 'function') {
            routes[targetId].update(State.isConnected);
        }
    } else {
        console.warn(`No render function found for route: ${targetId}`);
        // Ensure section is visible even if no render function (for static content sections)
        if (targetSection) targetSection.classList.remove('hidden');
    }
}

function toggleSidebar() {
    DOMElements.sidebar?.classList.toggle('-translate-x-full');
    DOMElements.sidebarBackdrop?.classList.toggle('hidden');
}
function closeSidebar() {
    DOMElements.sidebar?.classList.add('-translate-x-full');
    DOMElements.sidebarBackdrop?.classList.add('hidden');
}

function updateUIState() {
    const adminLinkContainer = document.getElementById('admin-link-container');
    const statUserBalanceEl = document.getElementById('statUserBalance'); // Dashboard balance

    console.log("Updating UI state, isConnected:", State.isConnected, "User Address:", State.userAddress);

    if (State.isConnected && State.userAddress) {
        DOMElements.connectButton?.classList.add('hidden');
        DOMElements.userInfo?.classList.remove('hidden');
        DOMElements.userInfo?.classList.add('flex');
        if (DOMElements.walletAddressEl) {
             // Use imported formatAddress
             DOMElements.walletAddressEl.textContent = formatAddress(State.userAddress);
        }

        const balanceNum = formatBigNumber(State.currentUserBalance);
        const balanceString = `${balanceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $BKC`;

        if (DOMElements.userBalanceEl) DOMElements.userBalanceEl.textContent = balanceString;
        if (statUserBalanceEl) statUserBalanceEl.textContent = balanceString;

        // Ensure Earn tabs elements exist before accessing style
        if (DOMElements.popMiningTab) DOMElements.popMiningTab.style.display = 'block';
        if (DOMElements.validatorSectionTab) DOMElements.validatorSectionTab.style.display = 'block';

        if (adminLinkContainer && State.userAddress.toLowerCase() === ADMIN_WALLET.toLowerCase()) {
            adminLinkContainer.style.display = 'block';
        } else if (adminLinkContainer) {
            adminLinkContainer.style.display = 'none';
        }
        // Use imported formatAddress
        updateConnectionStatus('connected', formatAddress(State.userAddress));
    } else {
        // UI Disconnected
        DOMElements.connectButton?.classList.remove('hidden');
        DOMElements.userInfo?.classList.add('hidden');
        DOMElements.userInfo?.classList.remove('flex');

        if (DOMElements.popMiningTab) DOMElements.popMiningTab.style.display = 'none';
        if (DOMElements.validatorSectionTab) DOMElements.validatorSectionTab.style.display = 'none';
        if (adminLinkContainer) adminLinkContainer.style.display = 'none';

        if (DOMElements.userBalanceEl) DOMElements.userBalanceEl.textContent = '-- $BKC';
        if (statUserBalanceEl) statUserBalanceEl.textContent = '-- $BKC';

        updateConnectionStatus('disconnected', 'Disconnected');
    }

    // Call 'update' or 'render' of the ACTIVE page
    if (routes[activePageId]) {
        if (typeof routes[activePageId].update === 'function') {
            routes[activePageId].update(State.isConnected);
        } else if (typeof routes[activePageId].render === 'function') {
             // Fallback to render if no update function
             routes[activePageId].render();
        }
    } else {
         console.error(`Route handler for ${activePageId} not found during UI update.`);
         navigateTo('dashboard'); // Fallback to dashboard
    }
}


// --- MetaMask Event Handlers ---

async function handleAccountsChanged(accounts) {
    console.log("Handler: accountsChanged", accounts);
    if (accounts.length === 0) {
        // User disconnected all accounts from site
        if (State.isConnected) {
            showToast("Wallet disconnected from site.", "info");
            disconnectWallet();
            updateUIState();
        }
    } else if (!State.isConnected || accounts[0].toLowerCase() !== State.userAddress?.toLowerCase()) {
        // Switched to a different account OR connected first account via MetaMask UI
        showToast("Account changed. Re-connecting...", "info");
        if (State.isConnected) {
            disconnectWallet();
            updateUIState(); // Show disconnected briefly
        }
        await new Promise(resolve => setTimeout(resolve, 100)); // Short delay
        const success = await connectWallet(); // Attempt connection with new account
        updateUIState(); // Update based on connection result
    }
}

function handleDisconnect() {
    console.log("Handler: disconnect event received");
    if (State.isConnected) {
        showToast("Wallet disconnected. Please reconnect.", "warning");
        disconnectWallet();
        updateUIState();
    }
}

function handleChainChanged(chainIdHex) {
     console.log("Handler: chainChanged", chainIdHex);
     const newChainId = BigInt(chainIdHex);
     if (newChainId !== sepoliaChainId) {
         showToast(`Incorrect Network. Please switch back to Sepolia (ID: ${sepoliaChainId}).`, "error");
         if (State.isConnected) {
             disconnectWallet();
             updateUIState();
         }
     } else if (!State.isConnected) {
          showToast("Switched back to Sepolia. Please connect your wallet.", "info");
          // No automatic connection, user needs to click connect
     } else {
          // Correct network, already connected - reload for safety
          showToast("Network corrected. Reloading application...", "info");
          window.location.reload();
     }
}


// --- SETUP PRINCIPAL ---
function setupGlobalListeners() {
    // Ensure elements exist before adding listeners
    DOMElements.menuBtn?.addEventListener('click', toggleSidebar);
    DOMElements.sidebarBackdrop?.addEventListener('click', closeSidebar);

    DOMElements.navLinks?.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;
        if (link.id === 'shareProjectBtn') {
            e.preventDefault();
            showShareModal();
            closeSidebar();
            return;
        }
        if (link.hasAttribute('data-target')) {
            e.preventDefault();
            navigateTo(link.dataset.target);
            closeSidebar();
        }
    });

    DOMElements.connectButton?.addEventListener('click', async () => {
        const success = await connectWallet();
        // updateUIState will be called implicitly by listeners or within connectWallet success
    });

    DOMElements.disconnectButton?.addEventListener('click', () => {
        disconnectWallet();
        updateUIState();
    });

    // Global modal close listener
    document.body.addEventListener('click', (e) => {
        if (e.target.id === 'modal-backdrop' || e.target.closest('.closeModalBtn')) {
             if (DOMElements.modalContainer) DOMElements.modalContainer.innerHTML = '';
        }
    });

    // Earn page tabs listener
    DOMElements.earnTabs?.addEventListener('click', (e) => {
        const button = e.target.closest('.tab-btn');
        if (!button) return;
        const targetId = button.dataset.target;
        const earnSection = document.getElementById('earn');
        if (!earnSection) return;

        earnSection.querySelectorAll('#earn-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        earnSection.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active')); // Hide all
        const targetContent = earnSection.querySelector(`#${targetId}`);
        if(targetContent) targetContent.classList.add('active'); // Show target
    });
}

async function init() {
    console.log("Initializing application...");
    if (typeof ethers === 'undefined') {
        showToast("Ethers library not loaded. Please refresh.", "error");
        document.body.innerHTML = '<div style="color: red; padding: 20px;">Error: Ethers.js not found.</div>';
        return;
    }

    // Setup listeners that don't depend on provider first
    setupGlobalListeners();

    // Initialize public provider and load public data
    await initPublicProvider();

    // Setup MetaMask specific listeners AFTER ensuring window.ethereum exists
    setupMetaMaskListeners(handleAccountsChanged, handleDisconnect, handleChainChanged);

    // Attempt to connect if previously authorized
    const wasConnected = await checkInitialConnection();
    console.log("Initial connection check result:", wasConnected);

    // Initial UI update and navigation
    updateUIState(); // Update based on connection status
    navigateTo(activePageId); // Navigate to default or last active page

    console.log("Application initialized.");
}

// Start the application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}