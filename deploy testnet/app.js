// app.js
// ✅ VERSÃO TESTNET SINC: Atualização de UI Forçada

import { initPublicProvider, initWalletSubscriptions, switchToTestnet, openConnectModal } from './js/modules/wallet.js';
import { PresalePage } from './js/pages/PresalePage.js';
import { showWelcomeModal, showToast } from './js/ui-feedback.js';
import { DOMElements, initDOMElements } from './js/dom-elements.js';
import { loadAddresses } from './js/config.js';
import { State } from './js/state.js';

window.openConnectModal = openConnectModal;

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Initializing App (Testnet Mode)...");
    
    // 1. Inicializa o DOM
    initDOMElements();

    // 2. Carrega endereços
    await loadAddresses();

    // 3. Renderiza a página (mesmo sem dados ainda)
    if (PresalePage && PresalePage.render) {
        PresalePage.render();
    }

    // 4. Inicia Provider Público (para ver preços sem conectar)
    try { await initPublicProvider(); } catch (e) { }

    // 5. Configura Listeners da Carteira
    initWalletSubscriptions((walletState) => {
        console.log("🔌 Wallet Update:", walletState);
        
        // Atualiza Estado Global
        State.isConnected = walletState.isConnected;
        if (walletState.address) {
            State.userAddress = walletState.address;
        }

        // 🔥 FORÇA ATUALIZAÇÃO DO BOTÃO
        updateHeaderButton(walletState.isConnected);

        // Atualiza Cards de Venda
        if (PresalePage && PresalePage.update) {
            PresalePage.update(walletState.isConnected);
        }
    });

    // 6. Configurações Finais
    setTimeout(() => showWelcomeModal(), 1500);
    setupGlobalButtons();
});

function setupGlobalButtons() {
    const connectBtn = document.getElementById('connectButtonDesktop');
    if (connectBtn) {
        // Remove clones anteriores para garantir evento limpo
        const newBtn = connectBtn.cloneNode(true);
        connectBtn.parentNode.replaceChild(newBtn, connectBtn);
        newBtn.addEventListener('click', openConnectModal);
    }

    const testnetBtn = document.getElementById('return-to-testnet-btn');
    if (testnetBtn) {
        testnetBtn.addEventListener('click', switchToTestnet);
    }
}

// Helper Robusto para atualizar o botão
function updateHeaderButton(isConnected) {
    const connectBtn = document.getElementById('connectButtonDesktop');
    if (!connectBtn) return;

    // Lógica: Se estiver conectado E tivermos um endereço
    if (isConnected && State.userAddress) {
        const shortAddr = `${State.userAddress.substring(0,6)}...${State.userAddress.substring(38)}`;
        
        console.log("✅ Updating Button to CONNECTED state:", shortAddr);

        // Conteúdo do Botão
        connectBtn.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]"></div>
                <span class="font-mono text-sm">${shortAddr}</span>
            </div>
        `;
        
        // Limpa classes antigas e aplica estilo de conectado
        connectBtn.className = "wallet-btn wallet-btn-connected bg-zinc-800 text-zinc-200 border border-zinc-600 hover:bg-zinc-700 transition-all";
        
    } else {
        console.log("Example: Button Reset to DISCONNECTED");

        // Conteúdo do Botão
        connectBtn.innerHTML = `<i class="fa-solid fa-wallet"></i> <span>Connect Wallet</span>`;
        
        // Limpa classes antigas e aplica estilo de desconectado
        connectBtn.className = "wallet-btn wallet-btn-disconnected bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 transition-all";
    }
}