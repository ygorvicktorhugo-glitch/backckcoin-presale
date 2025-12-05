// js/modules/wallet.js
// ✅ VERSÃO FINAL MAINNET V1.2: Isolamento de Cache e Redirecionamento Otimizado

import { createWeb3Modal, defaultConfig } from 'https://esm.sh/@web3modal/ethers@5.1.11?bundle';

import { State } from '../state.js';
import { showToast } from '../ui-feedback.js';
import {
    addresses, bkcTokenABI, delegationManagerABI, 
    rewardBoosterABI, actionsManagerABI, 
    publicSaleABI, faucetABI, ecosystemManagerABI,
    decentralizedNotaryABI, rentalManagerABI
} from '../config.js';

import { loadPublicData, loadUserData } from './data.js';
const ethers = window.ethers; 

// ============================================================================
// 1. CONFIGURAÇÃO DE REDES & CONSTANTES
// ============================================================================

// --- Arbitrum Mainnet (Rede Principal do DApp) ---
const ARBITRUM_MAINNET_ID_DECIMAL = 42161;
const ARBITRUM_MAINNET_ID_HEX = '0xa4b1'; // 42161 em Hex
const ARBITRUM_MAINNET_RPC_URL = 'https://arb1.arbitrum.io/rpc'; 

// --- Configuração de Isolamento (Evita conflito com Testnet App) ---
const STORAGE_PREFIX = 'presale_v1_'; 

let balancePollingInterval = null;
let CURRENT_POLLING_MS = 5000; 

// ============================================================================
// 2. WEB3MODAL SETUP
// ============================================================================
const WALLETCONNECT_PROJECT_ID = 'cd4bdedee7a7e909ebd3df8bbc502aed';

// Configuração da Mainnet para o Web3Modal
const arbitrumMainnetConfig = {
    chainId: ARBITRUM_MAINNET_ID_DECIMAL,
    name: 'Arbitrum One',
    currency: 'ETH',
    explorerUrl: 'https://arbiscan.io',
    rpcUrl: ARBITRUM_MAINNET_RPC_URL 
};

const metadata = {
    name: 'Backcoin Presale', 
    description: 'NFT Presale & Ecosystem Access',
    url: window.location.origin,
    icons: [window.location.origin + '/assets/bkc_logo_3d.png']
};

const ethersConfig = defaultConfig({
    metadata,
    enableEIP6963: true,      
    enableInjected: true,     
    enableCoinbase: false,    
    rpcUrl: ARBITRUM_MAINNET_RPC_URL,
    defaultChainId: ARBITRUM_MAINNET_ID_DECIMAL,
    enableEmail: true, 
    enableEns: false,
    auth: {
        email: true,
        showWallets: true,
        walletFeatures: true
    }
});

const web3modal = createWeb3Modal({
    ethersConfig,
    chains: [arbitrumMainnetConfig], 
    projectId: WALLETCONNECT_PROJECT_ID,
    enableAnalytics: true,    
    themeMode: 'dark',
    themeVariables: {
        '--w3m-accent': '#f59e0b', 
        '--w3m-border-radius-master': '1px',
        '--w3m-z-index': 100
    }
});

// ============================================================================
// 3. UI FORCER
// ============================================================================

function startUIEnforcer(address) {
    if (!address) return;
    State.userAddress = address;
}

function stopUIEnforcer() {
    // Limpeza (Placeholder)
}

// ============================================================================
// 4. LÓGICA CORE
// ============================================================================

function validateEthereumAddress(address) {
    if (!address) return false;
    try { return ethers.isAddress(address); } catch { return false; }
}

function isValidAddress(addr) {
    return addr && addr !== ethers.ZeroAddress && !addr.startsWith('0x...');
}

// 🔥 FIX: Usa chave prefixada para não ler saldo da Testnet
function loadCachedBalance(address) {
    if (!address) return;
    const cached = localStorage.getItem(`${STORAGE_PREFIX}balance_${address.toLowerCase()}`);
    if (cached) {
        try {
            State.currentUserBalance = BigInt(cached);
            if (window.updateUIState) window.updateUIState();
        } catch (e) { }
    }
}

function instantiateContracts(signerOrProvider) {
    try {
        if (isValidAddress(addresses.bkcToken)) State.bkcTokenContract = new ethers.Contract(addresses.bkcToken, bkcTokenABI, signerOrProvider);
        if (isValidAddress(addresses.delegationManager)) State.delegationManagerContract = new ethers.Contract(addresses.delegationManager, delegationManagerABI, signerOrProvider);
        if (isValidAddress(addresses.rewardBoosterNFT)) State.rewardBoosterContract = new ethers.Contract(addresses.rewardBoosterNFT, rewardBoosterABI, signerOrProvider);
        if (isValidAddress(addresses.publicSale)) State.publicSaleContract = new ethers.Contract(addresses.publicSale, publicSaleABI, signerOrProvider);
        if (isValidAddress(addresses.faucet)) State.faucetContract = new ethers.Contract(addresses.faucet, faucetABI, signerOrProvider);
        if (isValidAddress(addresses.rentalManager)) State.rentalManagerContract = new ethers.Contract(addresses.rentalManager, rentalManagerABI, signerOrProvider);
        if (isValidAddress(addresses.actionsManager)) State.actionsManagerContract = new ethers.Contract(addresses.actionsManager, actionsManagerABI, signerOrProvider);
        if (isValidAddress(addresses.decentralizedNotary)) State.decentralizedNotaryContract = new ethers.Contract(addresses.decentralizedNotary, decentralizedNotaryABI, signerOrProvider);
        if (isValidAddress(addresses.ecosystemManager)) State.ecosystemManagerContract = new ethers.Contract(addresses.ecosystemManager, ecosystemManagerABI, signerOrProvider);
    } catch (e) { console.warn("Contract init partial failure"); }
}

function startBalancePolling() {
    if (balancePollingInterval) clearInterval(balancePollingInterval);
    if (!State.bkcTokenContractPublic || !State.userAddress) return;
    
    checkBalance(); 
    let currentPollingMS = 5000;
    balancePollingInterval = setInterval(checkBalance, currentPollingMS); 
}

async function checkBalance() {
    if (document.hidden) return; 
    try {
        if (!State.isConnected || !State.userAddress) return;

        const newBalance = await State.bkcTokenContractPublic.balanceOf(State.userAddress);
        
        if (newBalance !== State.currentUserBalance) {
            State.currentUserBalance = newBalance;
            // 🔥 FIX: Salva cache isolado
            localStorage.setItem(`${STORAGE_PREFIX}balance_${State.userAddress.toLowerCase()}`, newBalance.toString());
            if (window.updateUIState) window.updateUIState(true);
        }
    } catch (error) { 
        // Fallback para 0
        if (State.currentUserBalance !== 0n) {
             State.currentUserBalance = 0n;
             if (window.updateUIState) window.updateUIState(true);
        }
    }
}

// Garante que o usuário está na Arbitrum Mainnet
async function ensureNetwork(provider) {
    try {
        const network = await provider.getNetwork();
        if (Number(network.chainId) === ARBITRUM_MAINNET_ID_DECIMAL) return true;
        
        try {
            await provider.send("wallet_switchEthereumChain", [{ chainId: ARBITRUM_MAINNET_ID_HEX }]);
            return true;
        } catch (switchError) { 
            return true; 
        }
    } catch (e) { 
        return true; 
    }
}

async function setupSignerAndLoadData(provider, address) {
    try {
        if (!validateEthereumAddress(address)) return false;

        await ensureNetwork(provider);

        State.provider = provider;
        
        try {
            State.signer = await provider.getSigner(); 
        } catch(signerError) {
            State.signer = provider; 
            console.warn(`Could not get standard Signer. Using Provider as read-only. Warning: ${signerError.message}`);
        }
        
        State.userAddress = address;
        State.isConnected = true; 

        loadCachedBalance(address);
        instantiateContracts(State.signer);
        
        try { signIn(State.userAddress); } catch (e) { }

        loadUserData().then(() => {
            if (window.updateUIState) window.updateUIState(true);
        }).catch(() => {});

        startBalancePolling();
        
        return true;

    } catch (error) {
        console.error("Setup warning:", error);
        if (address) return true;
        return false;
    }
}

// ============================================================================
// 5. EXPORTS
// ============================================================================

export async function initPublicProvider() {
    try {
        // Inicializa provedor público (Leitura sem carteira)
        State.publicProvider = new ethers.JsonRpcProvider(ARBITRUM_MAINNET_RPC_URL);

        if (isValidAddress(addresses.bkcToken)) State.bkcTokenContractPublic = new ethers.Contract(addresses.bkcToken, bkcTokenABI, State.publicProvider);
        if (isValidAddress(addresses.delegationManager)) State.delegationManagerContractPublic = new ethers.Contract(addresses.delegationManager, delegationManagerABI, State.publicProvider);
        if (isValidAddress(addresses.faucet)) State.faucetContractPublic = new ethers.Contract(addresses.faucet, faucetABI, State.publicProvider);
        if (isValidAddress(addresses.rentalManager)) State.rentalManagerContractPublic = new ethers.Contract(addresses.rentalManager, rentalManagerABI, State.publicProvider);
        if (isValidAddress(addresses.ecosystemManager)) State.ecosystemManagerContractPublic = new ethers.Contract(addresses.ecosystemManager, ecosystemManagerABI, State.publicProvider);
        if (isValidAddress(addresses.actionsManager)) State.actionsManagerContractPublic = new ethers.Contract(addresses.actionsManager, actionsManagerABI, State.publicProvider);
        
        // 🔥 Carrega dados da Landpage imediatamente
        loadPublicData().then(() => {
             if (window.updateUIState) window.updateUIState();
        });
    } catch (e) { console.error("Public provider error:", e); }
}

export function initWalletSubscriptions(callback) {
    let currentAddress = web3modal.getAddress();
    
    if (web3modal.getIsConnected() && currentAddress) {
        const walletProvider = web3modal.getWalletProvider();
        if (walletProvider) {
            const ethersProvider = new ethers.BrowserProvider(walletProvider);
            State.web3Provider = walletProvider;
            
            callback({ isConnected: true, address: currentAddress, isNewConnection: false });
            setupSignerAndLoadData(ethersProvider, currentAddress);
        }
    }

    const handler = async ({ provider, address, chainId, isConnected }) => {
        try {
            if (isConnected) {
                let activeAddress = address || web3modal.getAddress();
                if (!activeAddress && provider) {
                    try {
                        const tempProvider = new ethers.BrowserProvider(provider);
                        const signer = await tempProvider.getSigner();
                        activeAddress = await signer.getAddress();
                    } catch(e) {}
                }

                if (activeAddress) {
                    const ethersProvider = new ethers.BrowserProvider(provider);
                    State.web3Provider = provider; 

                    callback({ isConnected: true, address: activeAddress, chainId, isNewConnection: true });
                    await setupSignerAndLoadData(ethersProvider, activeAddress);

                } else {
                    if (balancePollingInterval) clearInterval(balancePollingInterval);
                    State.isConnected = false;
                    State.userAddress = null;
                    State.signer = null;
                    stopUIEnforcer();
                    callback({ isConnected: false });
                }
            } else {
                if (balancePollingInterval) clearInterval(balancePollingInterval);
                State.isConnected = false;
                State.userAddress = null;
                State.signer = null;
                stopUIEnforcer();
                callback({ isConnected: false });
            }
        } catch (err) { }
    };
    
    web3modal.subscribeProvider(handler);
}

// 🔥 FIX: Redirecionamento limpo para a Home (Testnet) sem tentar mudar a rede na wallet
export async function switchToTestnet() {
    // 1. Feedback visual
    showToast("Redirecting to Main Ecosystem (Testnet)...", "info");
    
    // 2. Limpeza de estado local
    if (balancePollingInterval) clearInterval(balancePollingInterval);
    State.isConnected = false;
    
    // 3. Redirecionamento forçado para a raiz (Home/Testnet)
    setTimeout(() => {
        window.location.href = 'https://backcoin.org';
    }, 1000);
    
    return true;
}

export function openConnectModal() { web3modal.open(); }
export async function disconnectWallet() { await web3modal.disconnect(); }