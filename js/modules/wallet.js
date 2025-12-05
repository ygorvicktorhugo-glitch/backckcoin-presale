// js/modules/wallet.js
// ✅ VERSÃO SINC: Garante que a UI atualize ao carregar

import { createWeb3Modal, defaultConfig } from 'https://esm.sh/@web3modal/ethers@5.1.11?bundle';
import { State } from '../state.js';
import { showToast } from '../ui-feedback.js';
import { addresses, bkcTokenABI, publicSaleABI } from '../config.js';
import { loadUserData } from './data.js';

const ethers = window.ethers; 

// --- Configuração da Rede (Arbitrum One) ---
const ARBITRUM_MAINNET_ID_DECIMAL = 42161;
const ARBITRUM_MAINNET_RPC_URL = 'https://arb1.arbitrum.io/rpc'; 

// --- Web3Modal Setup ---
const WALLETCONNECT_PROJECT_ID = 'cd4bdedee7a7e909ebd3df8bbc502aed';

const arbitrumMainnetConfig = {
    chainId: ARBITRUM_MAINNET_ID_DECIMAL,
    name: 'Arbitrum One',
    currency: 'ETH',
    explorerUrl: 'https://arbiscan.io',
    rpcUrl: ARBITRUM_MAINNET_RPC_URL 
};

const metadata = {
    name: 'Backcoin Presale', 
    description: 'NFT Presale Access',
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
});

const web3modal = createWeb3Modal({
    ethersConfig,
    chains: [arbitrumMainnetConfig], 
    projectId: WALLETCONNECT_PROJECT_ID,
    themeMode: 'dark',
    themeVariables: { '--w3m-accent': '#f59e0b' }
});

// --- Helpers ---

function validateEthereumAddress(address) {
    if (!address) return false;
    try { return ethers.isAddress(address); } catch { return false; }
}

function isValidAddress(addr) {
    return addr && addr !== ethers.ZeroAddress && !addr.startsWith('0x...');
}

async function checkNetworkOnly(provider) {
    try {
        const network = await provider.getNetwork();
        return Number(network.chainId) === ARBITRUM_MAINNET_ID_DECIMAL;
    } catch (e) { return false; }
}

export async function forceSwitchNetwork() {
    if (!State.web3Provider) return false;
    try {
        const provider = new ethers.BrowserProvider(State.web3Provider);
        await provider.send("wallet_switchEthereumChain", [{ chainId: '0xa4b1' }]); // 42161 hex
        return true;
    } catch (error) {
        showToast("Please switch to Arbitrum One manually.", "warning");
        return false;
    }
}

function instantiateContracts(signerOrProvider) {
    try {
        if (isValidAddress(addresses.bkcToken)) {
            State.bkcTokenContract = new ethers.Contract(addresses.bkcToken, bkcTokenABI, signerOrProvider);
        }
        if (isValidAddress(addresses.publicSale)) {
            State.publicSaleContract = new ethers.Contract(addresses.publicSale, publicSaleABI, signerOrProvider);
        }
    } catch (e) { }
}

async function setupSignerAndLoadData(provider, address) {
    try {
        if (!validateEthereumAddress(address)) return false;

        const isCorrectNetwork = await checkNetworkOnly(provider);
        
        State.provider = provider;
        State.userAddress = address;
        
        if (!isCorrectNetwork) {
            State.isConnected = true; // Visualmente conectado
            // showToast("Wrong Network. Please switch to Arbitrum.", "warning");
            return false; 
        }

        try {
            State.signer = await provider.getSigner(); 
        } catch(signerError) {
            State.signer = provider; 
        }
        
        State.isConnected = true; 
        instantiateContracts(State.signer);
        
        loadUserData().catch(() => {});

        return true;

    } catch (error) {
        console.error("Setup error:", error);
        return false;
    }
}

// --- Exports ---

export async function initPublicProvider() {
    try {
        State.publicProvider = new ethers.JsonRpcProvider(ARBITRUM_MAINNET_RPC_URL);
    } catch (e) { console.error("Public provider error:", e); }
}

export function initWalletSubscriptions(callback) {
    // 1. Checagem Inicial (Executa IMEDIATAMENTE se já estiver conectado)
    if (web3modal.getIsConnected()) {
        const address = web3modal.getAddress();
        const provider = web3modal.getWalletProvider();
        
        if (address && provider) {
            const ethersProvider = new ethers.BrowserProvider(provider, "any");
            State.web3Provider = provider;
            State.userAddress = address;
            State.isConnected = true;

            // 🔥 DISPARA CALLBACK PARA ATUALIZAR O BOTÃO AGORA
            callback({ isConnected: true, address: address, isNewConnection: false });
            setupSignerAndLoadData(ethersProvider, address);
        }
    }

    // 2. Listener para mudanças futuras
    const handler = async ({ provider, address, isConnected }) => {
        if (isConnected && provider) {
            const ethersProvider = new ethers.BrowserProvider(provider, "any");
            State.web3Provider = provider;
            
            const currentAddr = address || await ethersProvider.getSigner().then(s => s.getAddress()).catch(() => null);
            
            if (currentAddr) {
                // 🔥 DISPARA CALLBACK
                callback({ isConnected: true, address: currentAddr, isNewConnection: true });
                await setupSignerAndLoadData(ethersProvider, currentAddr);
            }
        } else {
            State.isConnected = false;
            State.userAddress = null;
            callback({ isConnected: false });
        }
    };
    
    web3modal.subscribeProvider(handler);
}

export async function switchToTestnet() {
    showToast("Redirecting to Main Ecosystem...", "info");
    State.isConnected = false;
    setTimeout(() => { window.location.href = 'https://backcoin.org'; }, 1000);
    return true;
}

export async function openConnectModal() { 
    if (State.isConnected && State.web3Provider) {
        const provider = new ethers.BrowserProvider(State.web3Provider);
        const isCorrect = await checkNetworkOnly(provider);
        if (!isCorrect) {
            await forceSwitchNetwork();
            return;
        }
    }
    web3modal.open(); 
}

export async function disconnectWallet() { await web3modal.disconnect(); }