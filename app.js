// js/app.js
// ✅ VERSÃO FINAL: UI Debounce (requestAnimationFrame) + Roteamento Inteligente + Inicialização Robusta

// ============================================================================
// 1. ANALYTICS & GLOBAL IMPORTS
// ============================================================================

// Vercel Analytics Injection (Safe Check)
const inject = window.inject || (() => { console.warn("Dev Mode: Analytics disabled."); });
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    try { inject(); } catch (e) { console.error("Analytics Error:", e); }
}

const ethers = window.ethers; // Assumes Ethers.js loaded via CDN/Script

import { DOMElements } from './dom-elements.js';
import { State } from './state.js';
import { initPublicProvider, initWalletSubscriptions, disconnectWallet, openConnectModal } from './modules/wallet.js';
import { showToast, showShareModal, showWelcomeModal } from './ui-feedback.js';
import { formatBigNumber } from './utils.js'; 
import { loadAddresses } from './config.js'; 

// Page Imports
import { DashboardPage } from './pages/DashboardPage.js';
import { EarnPage } from './pages/networkstaking.js'; 
import { StorePage } from './pages/StorePage.js';
import { RewardsPage } from './pages/RewardsPage.js';
import { FortunePoolPage } from './pages/FortunePool.js'; 
import { AboutPage } from './pages/AboutPage.js';
import { AirdropPage } from './pages/AirdropPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { PresalePage } from './pages/PresalePage.js';
import { FaucetPage } from './pages/FaucetPage.js';
import { TokenomicsPage } from './pages/TokenomicsPage.js';
import { NotaryPage } from './pages/NotaryPage.js';

// ============================================================================
// 2. CONFIGURATION & STATE
// ============================================================================

const ADMIN_WALLET = '0x03aC69873293cD6ddef7625AfC91E3Bd5434562a'; 
let activePageId = 'dashboard';
let currentPageCleanup = null;
let uiUpdatePending = false; // Flag para o requestAnimationFrame

const routes = {
    'dashboard': DashboardPage,
    'mine': EarnPage, 
    'store': StorePage,
    'rewards': RewardsPage,
    'actions': FortunePoolPage, 
    'notary': NotaryPage,
    'airdrop': AirdropPage,
    'tokenomics': TokenomicsPage,
    'faucet': FaucetPage,
    'about': AboutPage,
    'admin': AdminPage,
    'presale': PresalePage,
};

// ============================================================================
// 3. FORMATTING HELPERS
// ============================================================================

function formatAddress(addr) {
    if (!addr || addr.length < 42) return '...';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`; 
}

function formatLargeBalance(bigNum) {
    const num = formatBigNumber(bigNum);
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
    if (num >= 10_000) return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================================
// 4. NAVIGATION ENGINE (SMART ROUTING)
// ============================================================================

function navigateTo(pageId, forceUpdate = false) {
    const pageContainer = document.querySelector('main > div.container');
    const navItems = document.querySelectorAll('.sidebar-link');

    if (!pageContainer) return;

    // Se já estamos na página e não é forçado, apenas atualiza dados internos (se houver método update)
    if (activePageId === pageId && !forceUpdate) {
        if (routes[pageId] && typeof routes[pageId].update === 'function') {
            routes[pageId].update();
            return;
        }
    }

    // Cleanup da página anterior
    if (currentPageCleanup && typeof currentPageCleanup === 'function') {
        currentPageCleanup();
        currentPageCleanup = null;
    }

    // Esconde todas as seções
    Array.from(pageContainer.children).forEach(child => {
        if (child.tagName === 'SECTION') {
            child.classList.add('hidden');
            child.classList.remove('active');
        }
    });

    // Atualiza Menu Lateral
    navItems.forEach(item => {
        item.classList.remove('active');
        item.classList.add('text-zinc-400', 'hover:text-white', 'hover:bg-zinc-700');
    });

    // Mostra página alvo
    const targetPage = document.getElementById(pageId);
    if (targetPage && routes[pageId]) {
        targetPage.classList.remove('hidden');
        targetPage.classList.add('active');
        
        const isNewPage = activePageId !== pageId;
        activePageId = pageId;

        // Highlight no menu
        const activeNavItem = document.querySelector(`.sidebar-link[data-target="${pageId}"]`);
        if (activeNavItem) {
            activeNavItem.classList.remove('text-zinc-400', 'hover:text-white', 'hover:bg-zinc-700');
            activeNavItem.classList.add('active');
        }

        // Renderiza a página
        if (routes[pageId] && typeof routes[pageId].render === 'function') {
            // Passa flag isNewPage para que a página decida se recria DOM ou só busca dados
            routes[pageId].render(isNewPage || forceUpdate);
        }
        
        // Registra novo cleanup
        if (typeof routes[pageId].cleanup === 'function') {
            currentPageCleanup = routes[pageId].cleanup;
        }
        
        // Scroll to top on new page
        if (isNewPage) window.scrollTo(0,0);

    } else {
        console.warn(`Route '${pageId}' not found, redirecting to dashboard.`);
        navigateTo('dashboard');
    }
}
window.navigateTo = navigateTo;

// ============================================================================
// 5. UI STATE MANAGEMENT (DEBOUNCED)
// ============================================================================

function updateUIState(forcePageUpdate = false) {
    // OTIMIZAÇÃO: Se já existe uma atualização agendada para este frame, ignora.
    if (uiUpdatePending) return;

    uiUpdatePending = true;

    requestAnimationFrame(() => {
        performUIUpdate(forcePageUpdate);
        uiUpdatePending = false;
    });
}

function performUIUpdate(forcePageUpdate) {
    const adminLinkContainer = document.getElementById('admin-link-container');
    const statUserBalanceEl = document.getElementById('statUserBalance');
    const connectButtonDesktop = document.getElementById('connectButtonDesktop');
    const connectButtonMobile = document.getElementById('connectButtonMobile');
    const mobileAppDisplay = document.getElementById('mobileAppDisplay');
    
    const safeEl = (id) => document.getElementById(id);

    if (State.isConnected && State.userAddress) {
        // --- ESTADO CONECTADO ---
        const balanceString = formatLargeBalance(State.currentUserBalance);
        
        if(connectButtonDesktop) connectButtonDesktop.textContent = `${balanceString} $BKC`;
        if(connectButtonMobile) connectButtonMobile.textContent = `${balanceString} $BKC`;
        
        if (mobileAppDisplay) { 
            mobileAppDisplay.textContent = 'Backcoin.org'; 
            mobileAppDisplay.classList.add('text-amber-400'); 
            mobileAppDisplay.classList.remove('text-white'); 
        }
        
        if (statUserBalanceEl) {
            statUserBalanceEl.textContent = formatBigNumber(State.currentUserBalance).toLocaleString('en-US', { 
                minimumFractionDigits: 2, maximumFractionDigits: 2 
            });
        }

        if (adminLinkContainer) { 
            adminLinkContainer.style.display = (State.userAddress.toLowerCase() === ADMIN_WALLET.toLowerCase()) ? 'block' : 'none'; 
        }
        
    } else {
        // --- ESTADO DESCONECTADO ---
        if(connectButtonDesktop) connectButtonDesktop.textContent = "Connect";
        if(connectButtonMobile) connectButtonMobile.textContent = "Connect";
        
        if (mobileAppDisplay) { 
            mobileAppDisplay.textContent = 'Backcoin.org'; 
            mobileAppDisplay.classList.add('text-amber-400'); 
            mobileAppDisplay.classList.remove('text-white'); 
        }
        
        if (adminLinkContainer) adminLinkContainer.style.display = 'none';
        if (statUserBalanceEl) statUserBalanceEl.textContent = '--';
    }

    // Atualiza a página ativa
    navigateTo(activePageId, forcePageUpdate); 
}

function onWalletStateChange(changes) {
    const { isConnected, address, isNewConnection, wasConnected } = changes;
    
    // Log limpo
    // console.log("Wallet State:", changes);

    updateUIState(true); 
    
    if (isConnected && isNewConnection) {
        showToast(`Connected: ${formatAddress(address)}`, "success");
    } else if (!isConnected && wasConnected) {
        showToast("Wallet disconnected.", "info");
    }
}

// ============================================================================
// 6. EVENT LISTENERS & COMPONENTS
// ============================================================================

function initTestnetBanner() {
    const banner = document.getElementById('testnet-banner');
    const closeButton = document.getElementById('close-testnet-banner');
    const HIDE_STORAGE_KEY = 'hideTestnetBanner';
    const AUTO_HIDE_DELAY_MS = 30000; 

    if (!banner || !closeButton) return;

    const closeBanner = (animate = true) => {
        if (animate) {
            banner.style.transform = 'translateY(100%)'; 
            setTimeout(() => banner.remove(), 500);
        } else {
            banner.remove();
        }
        localStorage.setItem(HIDE_STORAGE_KEY, 'true');
    };

    if (localStorage.getItem(HIDE_STORAGE_KEY) === 'true') {
        banner.remove();
        return;
    }

    // Exibe
    banner.style.transform = 'translateY(0)'; 
    
    // Eventos
    closeButton.addEventListener('click', () => closeBanner(true));
    setTimeout(() => { if (document.body.contains(banner)) closeBanner(true); }, AUTO_HIDE_DELAY_MS);
}

function setupGlobalListeners() {
    const navItems = document.querySelectorAll('.sidebar-link');
    const menuButton = document.getElementById('menu-btn');
    const sidebar = document.getElementById('sidebar');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const connectButton = document.getElementById('connectButtonDesktop');
    const connectButtonMobile = document.getElementById('connectButtonMobile');
    const shareButton = document.getElementById('shareProjectBtn');
    
    // Inicializa Banner Isolado
    initTestnetBanner();

    // Navegação Lateral
    if (navItems.length > 0) {
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault(); // Previne comportamento padrão de <a>
                const pageId = item.dataset.target;
                if (pageId) {
                    navigateTo(pageId, false); 
                    // Fecha sidebar no mobile ao clicar
                    if (sidebar && sidebar.classList.contains('translate-x-0')) {
                        sidebar.classList.remove('translate-x-0');
                        sidebar.classList.add('-translate-x-full');
                        if(sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
                    }
                }
            });
        });
    }
    
    if (connectButton) connectButton.addEventListener('click', openConnectModal);
    if (connectButtonMobile) connectButtonMobile.addEventListener('click', openConnectModal);
    if (shareButton) shareButton.addEventListener('click', () => showShareModal(State.userAddress));

    // Menu Mobile Toggle
    if (menuButton && sidebar && sidebarBackdrop) {
        menuButton.addEventListener('click', () => {
            const isOpen = sidebar.classList.contains('translate-x-0');
            if (isOpen) {
                sidebar.classList.add('-translate-x-full');
                sidebar.classList.remove('translate-x-0');
                sidebarBackdrop.classList.add('hidden');
            } else {
                sidebar.classList.remove('-translate-x-full');
                sidebar.classList.add('translate-x-0');
                sidebarBackdrop.classList.remove('hidden');
            }
        });
        
        sidebarBackdrop.addEventListener('click', () => {
            sidebar.classList.add('-translate-x-full');
            sidebar.classList.remove('translate-x-0');
            sidebarBackdrop.classList.add('hidden');
        });
    }
}

// ============================================================================
// 7. MAIN INITIALIZATION
// ============================================================================

window.addEventListener('load', async () => {
    console.log("🚀 App Initializing...");

    // Pre-load critical DOM elements
    if (!DOMElements.earn) {
        DOMElements.earn = document.getElementById('mine'); 
    }

    try {
        const addressesLoaded = await loadAddresses(); 
        if (!addressesLoaded) throw new Error("Failed to load contract addresses");
    } catch (error) {
        console.error("❌ Critical Initialization Error:", error);
        showToast("Failed to initialize app. Please refresh.", "error");
        return;
    }
    
    setupGlobalListeners();

    // Inicializa Providers e Wallet
    await initPublicProvider(); 
    initWalletSubscriptions(onWalletStateChange);
    
    showWelcomeModal();
    
    // Remove loader de entrada (se houver)
    const preloader = document.getElementById('preloader');
    if(preloader) preloader.style.display = 'none';

    console.log("✅ App Ready.");
});

// Expose global functions for HTML interaction
window.EarnPage = EarnPage; 
window.openConnectModal = openConnectModal;
window.disconnectWallet = disconnectWallet;
window.updateUIState = updateUIState;