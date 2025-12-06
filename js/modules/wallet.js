// js/modules/wallet.js
// ✅ FINAL VERSION: Async Provider + Auto Network Switch + English Comments

import { createWeb3Modal, defaultConfig } from 'https://esm.sh/@web3modal/ethers@5.1.11?bundle';
import { State } from '../state.js';
import { showToast } from '../ui-feedback.js';
import { addresses, bkcTokenABI, publicSaleABI } from '../config.js';
import { loadUserData } from './data.js';

const ethers = window.ethers; 

// ============================================================
// 1. NETWORK CONFIGURATION (ARBITRUM SEPOLIA - TESTNET)
// ============================================================
const TESTNET_ID_DECIMAL = 421614; 
const TESTNET_ID_HEX = '0x66eee';
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

// Check if network is correct without forcing switch
async function checkNetworkOnly(provider) {
    try {
        const network = await provider.getNetwork();
        return Number(network.chainId) === TESTNET_ID_DECIMAL;
    } catch (e) { return false; }
}

// Force switch to Sepolia (with fallback to add chain)
export async function forceSwitchNetwork() {
    if (!State.web3Provider) return false;
    try {
        const provider = new ethers.BrowserProvider(State.web3Provider);
        await provider.send("wallet_switchEthereumChain", [{ chainId: TESTNET_ID_HEX }]);
        return true;
    } catch (error) {
        // Error 4902: Chain not found in wallet
        if (error.code === 4902 || error.data?.code === 4902 || error.message?.includes("Unrecognized chain")) {
            try {
                 const provider = new ethers.BrowserProvider(State.web3Provider);
                 await provider.send("wallet_addEthereumChain", [{
                    chainId: TESTNET_ID_HEX,
                    chainName: "Arbitrum Sepolia",
                    rpcUrls: [TESTNET_RPC_URL],
                    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                    blockExplorerUrls: ["https://sepolia.arbiscan.io"]
                 }]);
                 return true;
            } catch (addError) {
                 showToast("Failed to add Arbitrum Sepolia. Please add manually.", "error");
                 return false;
            }
        }
        showToast("Please switch to Arbitrum Sepolia manually.", "warning");
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
    } catch (e) { console.warn("Contract init partial failure", e); }
}

// Main Connection Function
async function setupSignerAndLoadData(provider, address) {
    try {
        if (!validateEthereumAddress(address)) return false;

        // Visual State Update
        State.userAddress = address;
        State.isConnected = true; 
        State.provider = provider;

        // Network Check
        const isCorrectNetwork = await checkNetworkOnly(provider);
        
        if (!isCorrectNetwork) {
            console.warn("⚠️ Wrong Network. Data loading paused.");
            return true; 
        }

        // Load Signer
        try {
            State.signer = await provider.getSigner(); 
        } catch(signerError) {
            State.signer = provider; 
        }
        
        instantiateContracts(State.signer);
        
        // Load User Data (Balance, Boosters)
        loadUserData().catch(() => {});

        return true;

    } catch (error) {
        console.error("Setup error:", error);
        return false;
    }
}

// --- Exports ---

// Async Public Provider with Verification
export async function initPublicProvider() {
    try {
        const provider = new ethers.JsonRpcProvider(TESTNET_RPC_URL);
        // Wait for network response to ensure readiness
        await provider.getNetwork(); 
        
        State.publicProvider = provider;
        console.log("✅ Public Provider Ready");
        
        // Instantiate read-only contracts for UI prices
        if (isValidAddress(addresses.publicSale)) {
             State.publicSaleContractPublic = new ethers.Contract(addresses.publicSale, publicSaleABI, provider);
        }
    } catch (e) { 
        console.error("❌ Public provider error:", e); 
        throw e; 
    }
}

export function initWalletSubscriptions(callback) {
    // 1. Initial Check
    if (web3modal.getIsConnected()) {
        const address = web3modal.getAddress();
        const provider = web3modal.getWalletProvider();
        
        if (address && provider) {
            const ethersProvider = new ethers.BrowserProvider(provider, "any");
            State.web3Provider = provider;
            
            // Immediate callback for UI
            callback({ isConnected: true, address: address, isNewConnection: false });
            setupSignerAndLoadData(ethersProvider, address);
        }
    }

    // 2. Event Listeners (Account/Network Change/Disconnect)
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
    // If connected, check network before opening modal
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