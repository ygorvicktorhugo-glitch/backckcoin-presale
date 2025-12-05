// js/modules/wallet.js
// ✅ VERSÃO TESTNET (Arbitrum Sepolia) - Com Correção de UI

import { createWeb3Modal, defaultConfig } from 'https://esm.sh/@web3modal/ethers@5.1.11?bundle';
import { State } from '../state.js';
import { showToast } from '../ui-feedback.js';
import { addresses, bkcTokenABI, publicSaleABI } from '../config.js';
import { loadUserData } from './data.js';

const ethers = window.ethers; 

// ============================================================
// 1. CONFIGURAÇÃO DA REDE (ARBITRUM SEPOLIA - TESTNET)
// ============================================================
const TESTNET_ID_DECIMAL = 421614; // Arbitrum Sepolia ID
const TESTNET_ID_HEX = '0x66eee';  // 421614 em Hex
const TESTNET_RPC_URL = 'https://sepolia-rollup.arbitrum.io/rpc'; 

// --- Web3Modal Setup ---
const WALLETCONNECT_PROJECT_ID = 'cd4bdedee7a7e909ebd3df8bbc502aed';

const arbitrumSepoliaConfig = {
    chainId: TESTNET_ID_DECIMAL,
    name: 'Arbitrum Sepolia',
    currency: 'ETH',
    explorerUrl: 'https://sepolia.arbiscan.io',
    rpcUrl: TESTNET_RPC_URL 
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
    rpcUrl: TESTNET_RPC_URL,
    defaultChainId: TESTNET_ID_DECIMAL,
});

const web3modal = createWeb3Modal({
    ethersConfig,
    chains: [arbitrumSepoliaConfig], 
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

// Apenas verifica se a rede está certa, não força troca (evita loop)
async function checkNetworkOnly(provider) {
    try {
        const network = await provider.getNetwork();
        return Number(network.chainId) === TESTNET_ID_DECIMAL;
    } catch (e) { return false; }
}

// Força a troca manualmente (chamado pelo botão se necessário)
export async function forceSwitchNetwork() {
    if (!State.web3Provider) return false;
    try {
        const provider = new ethers.BrowserProvider(State.web3Provider);
        await provider.send("wallet_switchEthereumChain", [{ chainId: TESTNET_ID_HEX }]);
        return true;
    } catch (error) {
        // Se a rede não existir, tenta adicionar (opcional, mas bom para testnet)
        try {
             await provider.send("wallet_addEthereumChain", [{
                chainId: TESTNET_ID_HEX,
                chainName: "Arbitrum Sepolia",
                rpcUrls: [TESTNET_RPC_URL],
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                blockExplorerUrls: ["https://sepolia.arbiscan.io"]
             }]);
             return true;
        } catch (addError) {
             showToast("Please switch to Arbitrum Sepolia manually.", "warning");
             return false;
        }
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

// Função Principal de Conexão
async function setupSignerAndLoadData(provider, address) {
    try {
        if (!validateEthereumAddress(address)) return false;

        // 🔥 FIX CRÍTICO: Atualiza o State IMEDIATAMENTE para o botão mudar
        State.userAddress = address;
        State.isConnected = true; 

        // Agora verificamos a rede
        const isCorrectNetwork = await checkNetworkOnly(provider);
        State.provider = provider;
        
        if (!isCorrectNetwork) {
            // Se rede errada: O botão já vai mostrar o endereço (por causa das linhas acima),
            // mas paramos de carregar dados para não dar erro de contrato.
            console.warn("Wrong Network - Data loading paused until switch.");
            return false; 
        }

        // Se rede certa: Carrega Signer e Dados
        try {
            State.signer = await provider.getSigner(); 
        } catch(signerError) {
            State.signer = provider; 
        }
        
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
        State.publicProvider = new ethers.JsonRpcProvider(TESTNET_RPC_URL);
    } catch (e) { console.error("Public provider error:", e); }
}

export function initWalletSubscriptions(callback) {
    // 1. Checagem Inicial Rápida (Sincroniza botão ao carregar página)
    if (web3modal.getIsConnected()) {
        const address = web3modal.getAddress();
        const provider = web3modal.getWalletProvider();
        
        if (address && provider) {
            const ethersProvider = new ethers.BrowserProvider(provider, "any");
            State.web3Provider = provider;
            
            // 🔥 Dispara callback imediatamente para app.js atualizar o botão
            callback({ isConnected: true, address: address, isNewConnection: false });
            setupSignerAndLoadData(ethersProvider, address);
        }
    }

    // 2. Listener de Eventos (Mudanças de conta/rede)
    const handler = async ({ provider, address, isConnected }) => {
        if (isConnected && provider) {
            const ethersProvider = new ethers.BrowserProvider(provider, "any");
            State.web3Provider = provider;
            
            const currentAddr = address || await ethersProvider.getSigner().then(s => s.getAddress()).catch(() => null);
            
            if (currentAddr) {
                callback({ isConnected: true, address: currentAddr, isNewConnection: true });
                await setupSignerAndLoadData(ethersProvider, currentAddr);
            }
        } else {
            // Desconectou
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
    // Se já estiver conectado, verifica se a rede está certa
    if (State.isConnected && State.web3Provider) {
        const provider = new ethers.BrowserProvider(State.web3Provider);
        const isCorrect = await checkNetworkOnly(provider);
        if (!isCorrect) {
            // Se estiver na rede errada, o clique no botão força a troca
            await forceSwitchNetwork();
            return;
        }
    }
    // Se não estiver conectado, abre o modal
    web3modal.open(); 
}

export async function disconnectWallet() { await web3modal.disconnect(); }