// app.js
// ✅ VERSÃO FINAL: Ordem de Carregamento Corrigida + Admin Ativo

import { initPublicProvider, initWalletSubscriptions, switchToTestnet, openConnectModal } from './js/modules/wallet.js';
import { PresalePage } from './js/pages/PresalePage.js';
import { AdminPage } from './js/pages/AdminPage.js';
import { showWelcomeModal, showToast } from './js/ui-feedback.js';
import { DOMElements, initDOMElements } from './js/dom-elements.js';
import { loadAddresses, ADMIN_WALLET_ADDRESS } from './js/config.js';
import { State } from './js/state.js';

window.openConnectModal = openConnectModal;

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Initializing App...");
    
    // 1. Inicializa referências do DOM
    initDOMElements();

    // 2. Carrega endereços dos contratos
    await loadAddresses();

    // 3. 🔥 CRÍTICO: Inicia conexão pública ANTES de renderizar a página
    // Isso garante que os preços apareçam mesmo sem conectar a carteira
    try { 
        console.log("📡 Connecting to Blockchain...");
        await initPublicProvider(); 
    } catch (e) { 
        console.warn("Public Provider Slow/Failed:", e);
    }

    // 4. Agora sim, renderiza a Pré-venda (com dados)
    if (PresalePage && PresalePage.render) {
        PresalePage.render();
    }

    // 5. Inicia escuta da Carteira (Metamask/Web3Modal)
    initWalletSubscriptions((walletState) => {
        console.log("🔌 Wallet State Change:", walletState);
        
        State.isConnected = walletState.isConnected;
        if (walletState.address) State.userAddress = walletState.address;

        updateHeaderButton(walletState.isConnected);

        // Atualiza UI da Pré-venda
        if (PresalePage && PresalePage.update) {
            PresalePage.update(walletState.isConnected);
        }
        
        // Atualiza UI do Admin (se estiver na tela)
        if (AdminPage && !document.getElementById('admin').classList.contains('hidden')) {
            AdminPage.refreshData();
        }
    });

    // 6. UI Final
    setTimeout(() => showWelcomeModal(), 1500);
    setupGlobalButtons();
});

function setupGlobalButtons() {
    const connectBtn = document.getElementById('connectButtonDesktop');
    if (connectBtn) {
        const newBtn = connectBtn.cloneNode(true);
        connectBtn.parentNode.replaceChild(newBtn, connectBtn);
        newBtn.addEventListener('click', openConnectModal);
    }

    const testnetBtn = document.getElementById('return-to-testnet-btn');
    if (testnetBtn) {
        testnetBtn.addEventListener('click', switchToTestnet);
    }

    // 🔥 Configura Botão Admin
    const adminBtn = document.getElementById('admin-panel-btn');
    if (adminBtn) {
        adminBtn.addEventListener('click', () => {
            const presaleDiv = document.getElementById('presale');
            const adminDiv = document.getElementById('admin');
            
            // Toggle de visibilidade
            if (adminDiv.classList.contains('hidden')) {
                // Abrir Admin
                presaleDiv.classList.add('hidden');
                adminDiv.classList.remove('hidden');
                AdminPage.render();
                adminBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Back to Sale';
            } else {
                // Voltar para Venda
                adminDiv.classList.add('hidden');
                presaleDiv.classList.remove('hidden');
                adminBtn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Admin';
            }
        });
    }
}

function updateHeaderButton(isConnected) {
    const connectBtn = document.getElementById('connectButtonDesktop');
    const adminBtn = document.getElementById('admin-panel-btn');
    
    if (!connectBtn) return;

    if (isConnected && State.userAddress) {
        const shortAddr = `${State.userAddress.substring(0,6)}...${State.userAddress.substring(38)}`;
        
        // Botão Conectado
        connectBtn.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]"></div>
                <span class="font-mono text-sm">${shortAddr}</span>
            </div>
        `;
        connectBtn.className = "wallet-btn wallet-btn-connected bg-zinc-800 text-zinc-200 border border-zinc-600 hover:bg-zinc-700 transition-all";

        // 🔥 CHECK ADMIN: Verifica se a carteira é a do Dono
        if (adminBtn && ADMIN_WALLET_ADDRESS) {
            if (State.userAddress.toLowerCase() === ADMIN_WALLET_ADDRESS.toLowerCase()) {
                console.log("👑 Admin Logged In");
                adminBtn.classList.remove('hidden'); // MOSTRA O BOTÃO
            } else {
                adminBtn.classList.add('hidden'); // ESCONDE SE NÃO FOR
                
                // Se o usuário estava na tela de admin e trocou para conta não-admin, chuta ele
                const adminDiv = document.getElementById('admin');
                if (adminDiv && !adminDiv.classList.contains('hidden')) {
                    adminDiv.classList.add('hidden');
                    document.getElementById('presale').classList.remove('hidden');
                }
            }
        }
        
    } else {
        // Botão Desconectado
        connectBtn.innerHTML = `<i class="fa-solid fa-wallet"></i> <span>Connect Wallet</span>`;
        connectBtn.className = "wallet-btn wallet-btn-disconnected bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 transition-all";
        
        // Esconde Admin ao desconectar
        if (adminBtn) adminBtn.classList.add('hidden');
        const adminDiv = document.getElementById('admin');
        if (adminDiv && !adminDiv.classList.contains('hidden')) {
            adminDiv.classList.add('hidden');
            document.getElementById('presale').classList.remove('hidden');
        }
    }
}