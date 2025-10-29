// modules/wallet.js

const ethers = window.ethers;

// --- NOVA IMPORTAÇÃO DO WEB3MODAL via CDN ESM (AJUSTADA) ---
// Mudado de 5.0.3 para @latest para corrigir o erro 404 Not Found do esm.sh
import { createWeb3Modal, defaultConfig } from 'https://esm.sh/@web3modal/ethers@latest';

import { State } from '../state.js';
import { showToast } from '../ui-feedback.js';
// REMOVIDO: formatAddress (não é mais usado aqui)
import {
    addresses, sepoliaRpcUrl, sepoliaChainId,
    bkcTokenABI, delegationManagerABI, rewardManagerABI,
    rewardBoosterABI, nftBondingCurveABI, actionsManagerABI, publicSaleABI,
    faucetABI,
    decentralizedNotaryABI // <--- IMPORTA O ABI DO NOTARY
} from '../config.js';
import { loadPublicData, loadUserData } from './data.js';
import { signIn } from './firebase-auth-service.js';

// --- CONFIGURAÇÃO DO WEB3MODAL ---
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
    enableCoinbase: true,
    rpcUrl: sepoliaRpcUrl,
    defaultChainId: Number(sepoliaChainId)
});

const featuredWallets = [
    { name: 'MetaMask', id: 'metamask' },
    { name: 'Binance Wallet', id: 'binance' },
    { name: 'WalletConnect', id: 'walletConnect' }
];

const web3modal = createWeb3Modal({
    ethersConfig,
    chains: [sepolia],
    projectId: WALLETCONNECT_PROJECT_ID,
    enableAnalytics: false,
    themeMode: 'dark',
    themeVariables: {
        '--w3m-accent': '#f59e0b',
        '--w3m-color-mix': '#3f3f46',
        '--w3m-color-mix-strength': 20,
        '--w3m-font-family': 'Inter, sans-serif',
        '--w3m-border-radius-master': '0.375rem',
        '--w3m-z-index': 100
    },
    featuredWalletIds: featuredWallets.map(w => w.id),
    mobileWallets: [
        'metamask',
        'binance'
    ],
    enableOnramp: false
});

let wasPreviouslyConnected = web3modal.getIsConnected();

// --- Funções Auxiliares Internas ---

function instantiateContracts(signerOrProvider) {
    console.log("Instantiating contracts with:", signerOrProvider);
    try {
        if (addresses.bkcToken)
            State.bkcTokenContract = new ethers.Contract(addresses.bkcToken, bkcTokenABI, signerOrProvider);
        if (addresses.delegationManager)
            State.delegationManagerContract = new ethers.Contract(addresses.delegationManager, delegationManagerABI, signerOrProvider);
        if (addresses.rewardManager)
            State.rewardManagerContract = new ethers.Contract(addresses.rewardManager, rewardManagerABI, signerOrProvider);
        if (addresses.actionsManager)
            State.actionsManagerContract = new ethers.Contract(addresses.actionsManager, actionsManagerABI, signerOrProvider);
        if (addresses.rewardBoosterNFT) {
            State.rewardBoosterContract = new ethers.Contract(addresses.rewardBoosterNFT, rewardBoosterABI, signerOrProvider);
        }
        if (addresses.nftBondingCurve) {
            State.nftBondingCurveContract = new ethers.Contract(addresses.nftBondingCurve, nftBondingCurveABI, signerOrProvider);
        }
         if (addresses.publicSale) {
             State.publicSaleContract = new ethers.Contract(addresses.publicSale, publicSaleABI, signerOrProvider);
         }
         if (addresses.faucet && addresses.faucet !== "0x0000000000000000000000000000000000000000") {
             State.faucetContract = new ethers.Contract(addresses.faucet, faucetABI, signerOrProvider);
         }

        // --- Instanciação do Contrato DescentralizedNotary ---
        if (addresses.decentralizedNotary && addresses.decentralizedNotary !== "0x0000000000000000000000000000000000000000") {
            console.log("Instantiating DecentralizedNotary...");
            State.decentralizedNotaryContract = new ethers.Contract(
                addresses.decentralizedNotary,
                decentralizedNotaryABI,
                signerOrProvider
            );
            console.log("DecentralizedNotary instance:", State.decentralizedNotaryContract);
        } else {
             console.warn("Decentralized Notary address not set or is placeholder in config.js");
        }
        // --- Fim da Instanciação do Contrato ---

        console.log("Contracts instantiated:", State);

    } catch (e) {
         console.error("Error instantiating contracts:", e);
         showToast("Error setting up contracts. Check console.", "error");
    }
}

async function setupSignerAndLoadData(provider, address) {
    try {
        State.provider = provider;
        State.signer = await provider.getSigner();
        
        // --- INÍCIO DA CORREÇÃO ---
        // Força o endereço para minúsculas ANTES de salvá-lo no State.
        const normalizedAddress = address.toLowerCase();
        State.userAddress = normalizedAddress; // <-- MUDANÇA (salva o endereço minúsculo)
        // --- FIM DA CORREÇÃO ---

        // --- CORREÇÃO: Autentica no Firebase usando a CARTEIRA como ID primário ---
        await signIn(State.userAddress); // <-- MUDANÇA (agora passa o endereço minúsculo)
        // --- FIM DA CORREÇÃO ---

        instantiateContracts(State.signer); // Instancia com o signer
        await loadUserData();
        State.isConnected = true;
        return true;
    } catch (error) {
         console.error("Error during setupSignerAndLoadData:", error);
         if (error.code === 'ACTION_REJECTED') { showToast("Operation rejected by user.", "info"); }
         else if (error.message.includes("Firebase")) { showToast("Firebase authentication failed.", "error"); }
         else { showToast(`Connection failed: ${error.message || 'Unknown error'}`, "error"); }
         return false;
    }
}


// --- Funções Exportadas ---

export async function initPublicProvider() {
     try {
        State.publicProvider = new ethers.JsonRpcProvider(sepoliaRpcUrl);
        instantiateContracts(State.publicProvider); // Instancia com o provider público
        await loadPublicData();
        console.log("Public provider initialized. Contracts instantiated with public provider.");
    } catch (e) {
        console.error("Failed to initialize public provider:", e);
        showToast("Could not connect to the blockchain network.", "error");
    }
}

// --- LÓGICA DE TRATAMENTO DE CONEXÃO (sem alterações aqui) ---

async function handleProviderChange(state, callback) {
    const { provider, address, chainId, isConnected } = state;
    console.log("Handling Provider Change:", { isConnected, address, chainId });

    if (isConnected) {
        const providerToUse = provider || await web3modal.getWalletProvider();
        if (!providerToUse) {
            console.error("Connected, but failed to get wallet provider.");
            await web3modal.disconnect();
            return;
        }

        if (chainId !== Number(sepoliaChainId)) {
            showToast(`Wrong network. Switching to Sepolia...`, 'info');
            const expectedChainIdHex = '0x' + (Number(sepoliaChainId)).toString(16);
            try {
                await providerToUse.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: expectedChainIdHex }],
                });
                return;
            } catch (switchError) {
                if (switchError.code === 4902) {
                    showToast('Sepolia network not found. Adding it...', 'info');
                    try {
                        await providerToUse.request({
                            method: 'wallet_addEthereumChain',
                            params: [ { chainId: expectedChainIdHex, chainName: sepolia.name, rpcUrls: [sepolia.rpcUrl], nativeCurrency: { name: sepolia.currency, symbol: sepolia.currency, decimals: 18, }, blockExplorerUrls: [sepolia.explorerUrl], }, ],
                        });
                        return;
                    } catch (addError) {
                        console.error("Failed to add Sepolia network:", addError);
                        showToast('Please add and switch to the Sepolia network manually.', 'error');
                        await web3modal.disconnect();
                        return;
                    }
                }
                console.error("Failed to switch network:", switchError);
                 if (switchError.code !== 4001) {
                      showToast('Failed to switch network. Please do it manually.', 'error');
                 } else {
                     showToast('Network switch rejected by user.', 'info');
                 }
                await web3modal.disconnect();
                return;
            }
        }

        // Se chainId correto, continua
        const ethersProvider = new ethers.BrowserProvider(providerToUse);
        const success = await setupSignerAndLoadData(ethersProvider, address);

        if (success) {
            callback({ isConnected: true, address, chainId, isNewConnection: !wasPreviouslyConnected });
            wasPreviouslyConnected = true;
        } else {
            await web3modal.disconnect();
        }

    } else {
        // Desconectado
        console.log("Web3Modal reports disconnection. Clearing app state.");
        const wasConnected = State.isConnected;

        State.provider = null; State.signer = null; State.userAddress = null;
        State.isConnected = false;
        State.currentUserBalance = 0n;
        State.userDelegations = [];
        State.activityHistory = [];
        State.myCertificates = [];
        State.myBoosters = [];
        State.userTotalPStake = 0n;

        // Reinstancia contrator com provider público ao desconectar
        if(State.publicProvider) {
            instantiateContracts(State.publicProvider);
             console.log("Contracts re-instantiated with public provider after disconnect.");
        } else {
             console.error("Public provider not available during disconnect cleanup!");
        }

        callback({ isConnected: false, wasConnected: wasConnected });
        wasPreviouslyConnected = false;
    }
}


export async function initializeWalletState(callback) {
    // 1. Assina as mudanças FUTURAS
    web3modal.subscribeProvider(async (state) => {
        await handleProviderChange(state, callback);
    });

    // 2. VERIFICA O ESTADO ATUAL
    const currentState = web3modal.getState();
    wasPreviouslyConnected = currentState.isConnected;

    if (currentState.isConnected) {
        console.log("Running initial connection check (Web3Modal state is connected)...");
        try {
            const provider = await web3modal.getWalletProvider();
            if (provider) {
                await handleProviderChange(
                    { ...currentState, provider: provider },
                    callback
                );
            } else {
                console.warn("Initial state is connected, but no provider found. Disconnecting.");
                await web3modal.disconnect();
                // Chama o handler explicitamente para limpar o estado do app
                 await handleProviderChange({ isConnected: false, provider: null, address: null, chainId: null }, callback);
            }
        } catch (e) {
            console.error("Error during initial wallet check (Web3Modal):", e);
            await handleProviderChange({ isConnected: false, provider: null, address: null, chainId: null }, callback);
        }

    } else if (window.ethereum && window.ethereum.isMetaMask) { // Verifica se é MetaMask
        console.log("Web3Modal state is disconnected. Forcing check with window.ethereum (MetaMask)...");
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts && accounts.length > 0) {
                console.log("Forced check successful. Found account:", accounts[0]);
                const ethersProvider = new ethers.BrowserProvider(window.ethereum);
                const network = await ethersProvider.getNetwork();
                const userAddress = ethers.getAddress(accounts[0]);
                wasPreviouslyConnected = true;

                await handleProviderChange(
                    { isConnected: true, provider: window.ethereum, address: userAddress, chainId: Number(network.chainId) },
                    callback
                );
            } else {
                console.log("Forced check failed (no accounts). Initial state: Not connected.");
                 // Garante que o estado desconectado seja propagado se o app iniciou antes
                 if (State.isConnected) {
                      await handleProviderChange({ isConnected: false, provider: null, address: null, chainId: null }, callback);
                 }
            }
        } catch (e) {
            console.error("Error during forced check with window.ethereum:", e);
             await handleProviderChange({ isConnected: false, provider: null, address: null, chainId: null }, callback);
        }

    } else {
        console.log("Initial check: Not connected (no Web3Modal connection or MetaMask).");
         // Garante que o estado desconectado seja propagado
         if (State.isConnected) {
             await handleProviderChange({ isConnected: false, provider: null, address: null, chainId: null }, callback);
         }
    }
}


export function openConnectModal() {
    web3modal.open();
}

export async function disconnectWallet() {
    console.log("Telling Web3Modal to disconnect...");
    await web3modal.disconnect();
}