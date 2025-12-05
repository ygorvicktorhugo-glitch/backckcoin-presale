// app.js
// ✅ VERSÃO CORRIGIDA: Caminhos de Importação e Inicialização Segura

import { initPublicProvider, initWalletSubscriptions, switchToTestnet, openConnectModal } from './js/modules/wallet.js';
import { PresalePage } from './js/pages/PresalePage.js';
import { showWelcomeModal, showToast } from './js/ui-feedback.js';
import { DOMElements, initDOMElements } from './js/dom-elements.js';
import { loadAddresses } from './js/config.js';

// Expor globalmente para o HTML poder chamar (ex: onclick="openConnectModal()")
window.openConnectModal = openConnectModal;

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Initializing Presale App...");
    
    // 1. Inicializa referências do DOM
    initDOMElements();

    // 2. Carrega endereços do JSON (deployment-addresses.json na raiz)
    await loadAddresses();

    // 3. Renderiza a Interface da Pré-venda IMEDIATAMENTE
    // Isso garante que o usuário veja os cards (mesmo que "Unavailable") antes de conectar
    if (PresalePage && PresalePage.render) {
        PresalePage.render();
    }

    // 4. Tenta iniciar provedores públicos (para ler preços do blockchain sem carteira)
    try {
        await initPublicProvider();
    } catch (e) {
        console.warn("Public provider failed or slow:", e);
    }

    // 5. Configura a Carteira (Web3Modal)
    initWalletSubscriptions((walletState) => {
        // Atualiza a página quando conecta/desconecta
        if (PresalePage && PresalePage.update) {
            PresalePage.update(walletState.isConnected);
        }
        updateHeaderButton(walletState.isConnected);
    });

    // 6. Modal de Boas-vindas (com pequeno delay para garantir que o CSS carregou)
    setTimeout(() => showWelcomeModal(), 1000);

    // 7. Configura botões globais (Header)
    const connectBtn = document.getElementById('connectButtonDesktop');
    if (connectBtn) connectBtn.addEventListener('click', openConnectModal);
    
    const testnetBtn = document.getElementById('return-to-testnet-btn');
    if (testnetBtn) testnetBtn.addEventListener('click', switchToTestnet);
});

// Helper para atualizar o botão do Header
import { State } from './js/state.js';
function updateHeaderButton(isConnected) {
    const connectBtn = document.getElementById('connectButtonDesktop');
    if (!connectBtn) return;

    if (isConnected && State.userAddress) {
        const shortAddr = `${State.userAddress.substring(0,6)}...${State.userAddress.substring(38)}`;
        connectBtn.innerHTML = `<i class="fa-solid fa-user-check text-green-400"></i> <span>${shortAddr}</span>`;
        connectBtn.classList.remove('wallet-btn-disconnected');
        connectBtn.classList.add('wallet-btn-connected');
    } else {
        connectBtn.innerHTML = `<i class="fa-solid fa-wallet"></i> <span>Connect Wallet</span>`;
        connectBtn.classList.add('wallet-btn-disconnected');
        connectBtn.classList.remove('wallet-btn-connected');
    }
}