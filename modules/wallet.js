// js/modules/wallet.js
// ✅ VERSÃO FINAL MAINNET V1.1: Redirecionamento para backcoin.org corrigido

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
// 1. CONFIGURAÇÃO DE REDES (Mainnet e Testnet)
// ============================================================================

// --- Arbitrum Mainnet (Rede Principal do DApp) ---
const ARBITRUM_MAINNET_ID_DECIMAL = 42161;
const ARBITRUM_MAINNET_ID_HEX = '0xa4b1'; // 42161 em Hex
const ARBITRUM_MAINNET_RPC_URL = 'https://arb1.arbitrum.io/rpc'; 

// --- Arbitrum Sepolia (Rede de Retorno) ---
const ARBITRUM_SEPOLIA_ID_DECIMAL = 421614;
const ARBITRUM_SEPOLIA_ID_HEX = '0x66eee'; 
const ARBITRUM_SEPOLIA_RPC_URL = 'https://sepolia.arbitrum.io/rpc'; // Use seu RPC Sepolia preferido

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
    name: 'Backcoin Presale', // Nome ajustado para a Pré-Venda
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
    chains: [arbitrumMainnetConfig], // Apenas Mainnet na inicialização
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

function loadCachedBalance(address) {
    if (!address) return;
    const cached = localStorage.getItem(`balance_${address.toLowerCase()}`);
    if (cached) {
        try {
            State.currentUserBalance = BigInt(cached);
            if (window.updateUIState) window.updateUIState();
        } catch (e) { }
    }
}

function instantiateContracts(signerOrProvider) {
    try {
        // NOTA: Contratos devem ser ajustados para a Mainnet no config.js
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

        // Assumindo que o token BKC existe na Mainnet
        const newBalance = await State.bkcTokenContractPublic.balanceOf(State.userAddress);
        
        if (newBalance !== State.currentUserBalance) {
            State.currentUserBalance = newBalance;
            localStorage.setItem(`balance_${State.userAddress.toLowerCase()}`, newBalance.toString());
            if (window.updateUIState) window.updateUIState(true);
        }
    } catch (error) { 
        // Fallback para 0 em caso de erro de RPC
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
            // Permite continuar mesmo se o switch falhar (pode ser read-only)
            return true; 
        }
    } catch (e) { 
        // Permite continuar
        return true; 
    }
}

async function setupSignerAndLoadData(provider, address) {
    try {
        if (!validateEthereumAddress(address)) return false;

        await ensureNetwork(provider);

        State.provider = provider;
        
        // Garante que State.signer nunca seja nulo.
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
        State.publicProvider = new ethers.JsonRpcProvider(ARBITRUM_MAINNET_RPC_URL);

        if (isValidAddress(addresses.bkcToken)) State.bkcTokenContractPublic = new ethers.Contract(addresses.bkcToken, bkcTokenABI, State.publicProvider);
        if (isValidAddress(addresses.delegationManager)) State.delegationManagerContractPublic = new ethers.Contract(addresses.delegationManager, delegationManagerABI, State.publicProvider);
        if (isValidAddress(addresses.faucet)) State.faucetContractPublic = new ethers.Contract(addresses.faucet, faucetABI, State.publicProvider);
        if (isValidAddress(addresses.rentalManager)) State.rentalManagerContractPublic = new ethers.Contract(addresses.rentalManager, rentalManagerABI, State.publicProvider);
        if (isValidAddress(addresses.ecosystemManager)) State.ecosystemManagerContractPublic = new ethers.Contract(addresses.ecosystemManager, ecosystemManagerABI, State.publicProvider);
        if (isValidAddress(addresses.actionsManager)) State.actionsManagerContractPublic = new ethers.Contract(addresses.actionsManager, actionsManagerABI, State.publicProvider);
        
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
            
            // Callback IMEDIATO
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

export async function switchToTestnet() {
    if (!State.isConnected || !State.web3Provider) {
        showToast("Connect your wallet first.", "warning");
        return false;
    }
    
    try {
        const provider = new ethers.BrowserProvider(State.web3Provider);
        
        // 1. Tenta trocar de rede (pode falhar se a rede não estiver adicionada)
        await provider.send("wallet_switchEthereumChain", [{ chainId: ARBITRUM_SEPOLIA_ID_HEX }]);
        
    } catch (switchError) {
        if (switchError.code === 4902 || switchError.code === -32603) { // Rede não existe
            try {
                // 2. Se falhar na troca, tenta adicionar a rede
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: ARBITRUM_SEPOLIA_ID_HEX,
                        chainName: 'Arbitrum Sepolia',
                        rpcUrls: [ARBITRUM_SEPOLIA_RPC_URL],
                        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                        blockExplorerUrls: ['https://sepolia.arbiscan.io/']
                    }]
                });
            } catch (addError) {
                showToast("Failed to switch/add Arbitrum Sepolia Testnet. Please add it manually.", "error");
                return false;
            }
        } else {
             showToast("Failed to switch network: Permission denied or wallet rejected.", "error");
             return false;
        }
    }
    
    // 3. Redireciona para o DApp da Testnet - AJUSTE APLICADO AQUI
    showToast("Redirecting to Backcoin Testnet DApp...", "info");
    
    // 🔥 CORREÇÃO: Redireciona para a URL principal do projeto, conforme solicitado.
    window.location.href = 'https://backcoin.org';
    
    return true;
}


export function openConnectModal() { web3modal.open(); }
export async function disconnectWallet() { await web3modal.disconnect(); }