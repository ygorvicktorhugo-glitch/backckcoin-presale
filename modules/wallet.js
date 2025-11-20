// modules/wallet.js
// ✅ VERSÃO FINAL: Saldo Instantâneo (Cache) + Loop Seguro (60s) + Redução de Ruído

import { ethers } from 'https://esm.sh/ethers@6.11.1';
import { createWeb3Modal, defaultConfig } from 'https://esm.sh/@web3modal/ethers@5.0.3';

import { State } from '../state.js';
import { showToast } from '../ui-feedback.js';
import {
    addresses, sepoliaRpcUrl, sepoliaChainId,
    bkcTokenABI, delegationManagerABI, 
    rewardBoosterABI, nftPoolABI, 
    actionsManagerABI, 
    publicSaleABI,
    faucetABI,
    ecosystemManagerABI,
    decentralizedNotaryABI
} from '../config.js';
import { loadPublicData, loadUserData } from './data.js';
import { signIn } from './firebase-auth-service.js';

// ============================================================================
// GLOBAL STATE
// ============================================================================
let balancePollingInterval = null;
let hasForcedInitialDisconnect = false; 

// ============================================================================
// WEB3MODAL CONFIGURATION
// ============================================================================
const WALLETCONNECT_PROJECT_ID = 'cd4bdedee7a7e909ebd3df8bbc502aed';

const sepolia = {
    chainId: Number(sepoliaChainId),
    name: 'Sepolia',
    currency: 'ETH',
    explorerUrl: 'https://sepolia.etherscan.io',
    rpcUrl: sepoliaRpcUrl
};

const metadata = {
    name: 'Backchain dApp',
    description: 'Backchain - Decentralized Actions & Staking',
    url: window.location.origin,
    icons: [window.location.origin + '/assets/bkc_logo_3d.png']
};

const ethersConfig = defaultConfig({
    metadata,
    enableEIP6963: true,
    enableInjected: true,
    enableCoinbase: false, // Desativado para reduzir chamadas extras
    rpcUrl: sepoliaRpcUrl,
    defaultChainId: Number(sepoliaChainId),
    enableWeb3Js: false, // Evita conflito com web3.js legado
    enableEns: false // ✅ Tenta desativar busca de nomes para evitar erro 404
});

const web3modal = createWeb3Modal({
    ethersConfig,
    chains: [sepolia],
    projectId: WALLETCONNECT_PROJECT_ID,
    enableAnalytics: false,
    themeMode: 'dark',
    themeVariables: {
        '--w3m-accent': '#f59e0b',
        '--w3m-z-index': 100
    }
});

// ============================================================================
// HELPERS & VALIDAÇÃO
// ============================================================================

function validateEthereumAddress(address) {
    if (!address) return false;
    try { return ethers.isAddress(address); } catch { return false; }
}

function isValidAddress(addr) {
    return addr && addr !== ethers.ZeroAddress && !addr.startsWith('0x...');
}

/**
 * ✅ UX PREMIUM: Carrega saldo do cache visualmente antes de conectar na blockchain.
 * Isso evita o "susto" do saldo zerado enquanto carrega.
 */
function loadCachedBalance(address) {
    const cached = localStorage.getItem(`balance_${address.toLowerCase()}`);
    if (cached) {
        try {
            const balanceBigInt = BigInt(cached);
            State.currentUserBalance = balanceBigInt;
            if (window.updateUIState) window.updateUIState();
            console.log("⚡ Cached balance loaded instantly.");
        } catch (e) { console.warn("Cache invalid"); }
    }
}

function instantiateContracts(signerOrProvider) {
    try {
        if (isValidAddress(addresses.bkcToken))
            State.bkcTokenContract = new ethers.Contract(addresses.bkcToken, bkcTokenABI, signerOrProvider);
        if (isValidAddress(addresses.delegationManager))
            State.delegationManagerContract = new ethers.Contract(addresses.delegationManager, delegationManagerABI, signerOrProvider);
        if (isValidAddress(addresses.actionsManager))
            State.actionsManagerContract = new ethers.Contract(addresses.actionsManager, actionsManagerABI, signerOrProvider);
        if (isValidAddress(addresses.rewardBoosterNFT))
            State.rewardBoosterContract = new ethers.Contract(addresses.rewardBoosterNFT, rewardBoosterABI, signerOrProvider);
        if (isValidAddress(addresses.publicSale))
            State.publicSaleContract = new ethers.Contract(addresses.publicSale, publicSaleABI, signerOrProvider);
        if (isValidAddress(addresses.faucet))
            State.faucetContract = new ethers.Contract(addresses.faucet, faucetABI, signerOrProvider);
        if (isValidAddress(addresses.ecosystemManager))
            State.ecosystemManagerContract = new ethers.Contract(addresses.ecosystemManager, ecosystemManagerABI, signerOrProvider);
        if (isValidAddress(addresses.decentralizedNotary))
            State.decentralizedNotaryContract = new ethers.Contract(addresses.decentralizedNotary, decentralizedNotaryABI, signerOrProvider);
    } catch (e) {
        console.error("Error instantiating contracts:", e);
    }
}

/**
 * ✅ POLLING LEVE: Consulta apenas o saldo a cada 60 segundos.
 */
function startBalancePolling() {
    // Limpa intervalo anterior
    if (balancePollingInterval) {
        clearInterval(balancePollingInterval);
        balancePollingInterval = null;
    }

    if (!State.bkcTokenContractPublic || !State.userAddress) return;

    console.log('Starting balance polling (every 60s)...');
    
    let lastBalance = State.currentUserBalance;

    // Intervalo de 60 segundos (1 Minuto)
    balancePollingInterval = setInterval(async () => {
        try {
            if (!State.isConnected || !State.userAddress) {
                clearInterval(balancePollingInterval);
                return;
            }

            // Chamada leve apenas para verificar saldo
            const newBalance = await State.bkcTokenContractPublic.balanceOf(State.userAddress);
            
            if (newBalance !== lastBalance) {
                console.log(`Balance update: ${ethers.formatUnits(newBalance, 18)}`);
                lastBalance = newBalance;
                State.currentUserBalance = newBalance;
                
                // Atualiza cache para a próxima visita
                localStorage.setItem(`balance_${State.userAddress.toLowerCase()}`, newBalance.toString());
                
                if (window.updateUIState) window.updateUIState();
            }
        } catch (error) {
            // Silencia erros de rede no polling para não poluir o console
        }
    }, 60000); 
}

async function setupSignerAndLoadData(provider, address) {
    try {
        if (!validateEthereumAddress(address)) throw new Error('INVALID_ADDRESS');

        State.provider = provider;
        State.signer = await provider.getSigner();
        State.userAddress = address;

        // 1. Mostra o cache IMEDIATAMENTE (Sem delay)
        loadCachedBalance(address);

        try { await signIn(State.userAddress); } catch (e) { console.warn('Firebase auth warning:', e); }

        instantiateContracts(State.signer);
        
        // 2. Busca o dado real da blockchain IMEDIATAMENTE (Requisição Inicial)
        await loadUserData(); 
        
        // Atualiza cache com o dado fresco
        if (State.currentUserBalance) {
            localStorage.setItem(`balance_${address.toLowerCase()}`, State.currentUserBalance.toString());
        }

        // 3. Inicia o Loop Lento (A cada 1 minuto)
        startBalancePolling();
        
        State.isConnected = true;
        return true;
    } catch (error) {
        console.error("Setup error:", error);
        showToast(`Connection error: ${error.message}`, "error");
        return false;
    }
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

export async function initPublicProvider() {
    try {
        State.publicProvider = new ethers.JsonRpcProvider(sepoliaRpcUrl);

        if (isValidAddress(addresses.bkcToken))
            State.bkcTokenContractPublic = new ethers.Contract(addresses.bkcToken, bkcTokenABI, State.publicProvider);
        if (isValidAddress(addresses.delegationManager))
            State.delegationManagerContractPublic = new ethers.Contract(addresses.delegationManager, delegationManagerABI, State.publicProvider);
        if (isValidAddress(addresses.faucet))
            State.faucetContractPublic = new ethers.Contract(addresses.faucet, faucetABI, State.publicProvider);
        
        // Carrega dados globais UMA VEZ no início
        await loadPublicData();
        
        console.log("Public provider initialized.");
    } catch (e) {
        console.error("Public provider error:", e);
    }
}

export function initWalletSubscriptions(callback) {
    let wasPreviouslyConnected = web3modal.getIsConnected(); 
    let isHandlingChange = false;

    // Limpeza de estado para evitar sessões fantasmas
    if (wasPreviouslyConnected && !hasForcedInitialDisconnect) {
        try { web3modal.disconnect(); } catch (e) {}
        wasPreviouslyConnected = false;
        hasForcedInitialDisconnect = true; 
    }

    const handler = async ({ provider, address, chainId, isConnected }) => {
        if (isHandlingChange) return;
        isHandlingChange = true;
        
        if (isConnected) {
            // Verificação de Rede
            if (chainId !== Number(sepoliaChainId)) {
                showToast(`Wrong network. Switch to Sepolia.`, 'error');
                try {
                    await provider.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x' + (Number(sepoliaChainId)).toString(16) }],
                    });
                } catch (e) {}
                isHandlingChange = false;
                return;
            }

            const ethersProvider = new ethers.BrowserProvider(provider);
            State.web3Provider = provider; 

            const success = await setupSignerAndLoadData(ethersProvider, address);
            
            if (success) {
                const isNewConnection = !wasPreviouslyConnected;
                wasPreviouslyConnected = true;
                callback({ isConnected: true, address, chainId, isNewConnection });
            } else {
                await web3modal.disconnect();
            }

        } else {
            // Desconexão
            if (balancePollingInterval) clearInterval(balancePollingInterval);
            State.isConnected = false;
            State.userAddress = null;
            State.signer = null;
            State.currentUserBalance = 0n;
            
            callback({ isConnected: false, wasConnected: wasConnected });
            wasPreviouslyConnected = false;
            balancePollingInterval = null;
        }
        isHandlingChange = false; 
    };
    
    web3modal.subscribeProvider(handler);
    callback({ isConnected: false, wasConnected: wasPreviouslyConnected });
}

export function openConnectModal() { web3modal.open(); }

export async function disconnectWallet() {
    if (balancePollingInterval) clearInterval(balancePollingInterval);
    await web3modal.disconnect();
}