// modules/wallet.js

const ethers = window.ethers;

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
// CORREÇÃO: Importa renderLoading de utils.js, não de ui-feedback.js
import { showToast, openModal } from '../ui-feedback.js';
import { formatBigNumber, formatAddress, renderLoading } from '../utils.js'; // <= renderLoading importado aqui
import {
    addresses, sepoliaRpcUrl, sepoliaChainId,
    bkcTokenABI, delegationManagerABI, rewardManagerABI,
    rewardBoosterABI, nftBondingCurveABI, actionsManagerABI, publicSaleABI
} from '../config.js';
import { loadPublicData, loadUserData } from './data.js';
import { signIn } from './firebase-auth-service.js';

// --- Funções Auxiliares Internas ---

function updateConnectionStatusUI(status, message) {
    const statuses = {
        disconnected: { bg: 'bg-red-500/20', text: 'text-red-400', icon: 'fa-circle' },
        connecting: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: 'fa-spinner fa-spin' },
        connected: { bg: 'bg-green-500/20', text: 'text-green-400', icon: 'fa-circle' },
    };
    const { bg, text, icon } = statuses[status];
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
        statusEl.className = `hidden sm:inline-flex items-center gap-2 py-1.5 px-3 rounded-full text-sm font-medium ${bg} ${text}`;
        statusEl.innerHTML = `<i class="fa-solid ${icon} text-xs"></i><span>${message}</span>`;
    }
}

function instantiateContracts(signerOrProvider) {
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
    } catch (e) {
         console.error("Error instantiating contracts:", e);
         showToast("Error setting up contracts. Check console.", "error");
    }
}

async function setupSignerAndLoadData() {
    try {
        if (!State.provider) {
             console.error("Provider not initialized before setting up signer.");
             showToast("Connection error. Please try connecting again.", "error");
             disconnectWallet();
             return false;
        }
        State.signer = await State.provider.getSigner();
        State.userAddress = await State.signer.getAddress();

        await signIn(State.userAddress);

        instantiateContracts(State.signer);
        await loadUserData();
        State.isConnected = true;
        updateConnectionStatusUI('connected', formatAddress(State.userAddress));
        return true;
    } catch (error) {
         console.error("Error during setupSignerAndLoadData:", error);
         if (error.code === 'ACTION_REJECTED') { showToast("Operation rejected by user.", "info"); }
         else if (error.message.includes("Firebase")) { showToast("Firebase authentication failed.", "error"); }
         else { showToast(`Connection failed: ${error.message || 'Unknown error'}`, "error"); }
         disconnectWallet();
         return false;
    }
}


// --- Funções Exportadas ---

export async function initPublicProvider() {
     try {
        State.publicProvider = new ethers.JsonRpcProvider(sepoliaRpcUrl);
        instantiateContracts(State.publicProvider);
        await loadPublicData();
        // Não configura listeners aqui, faz no app.js init
    } catch (e) {
        console.error("Failed to initialize public provider:", e);
        showToast("Could not connect to the blockchain network.", "error");
    }
}

export async function checkInitialConnection() {
    if (typeof window.ethereum === 'undefined' || !window.ethereum.isMetaMask) {
        console.log("MetaMask not detected.");
        return false;
    }
    try {
        State.provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await State.provider.send("eth_accounts", []);
        if (accounts.length > 0) {
            console.log("Existing connection found. Auto-connecting...");
            const network = await State.provider.getNetwork();
            if (network.chainId !== sepoliaChainId) {
                showToast('Wrong Network. Please switch to Sepolia in MetaMask.', 'error');
                 disconnectWallet();
                return false;
            }
            return await setupSignerAndLoadData();
        }
        console.log("No existing authorized accounts found.");
        return false;
    } catch (error) {
        console.error("Could not check initial connection:", error);
        disconnectWallet();
        return false;
    }
}

export async function connectWallet() {
    if (typeof window.ethereum === 'undefined' || !window.ethereum.isMetaMask) {
         const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
         const message = isMobile
            ? 'Please use the browser inside your MetaMask app or another Web3 enabled browser.'
            : 'Please install the MetaMask extension to connect your wallet.';
        openModal('MetaMask Not Detected', `<p class="text-center">${message}</p>`, 'Install MetaMask', 'https://metamask.io/download/');
        return false;
    }

    if (DOMElements.connectButton.disabled) return false;

    DOMElements.connectButton.disabled = true;
    const tempLoaderSpan = document.createElement('span');
    tempLoaderSpan.classList.add('inline-block'); // Garante layout
    renderLoading(tempLoaderSpan); // Usa a função importada de utils.js
    DOMElements.connectButton.innerHTML = '';
    DOMElements.connectButton.appendChild(tempLoaderSpan);
    updateConnectionStatusUI('connecting', 'Connecting...');

    try {
        State.provider = new ethers.BrowserProvider(window.ethereum);
        await State.provider.send("eth_requestAccounts", []);

        const network = await State.provider.getNetwork();
        if (network.chainId !== sepoliaChainId) {
            showToast('Switching network to Sepolia...', 'info');
            try {
                await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${sepoliaChainId.toString(16)}` }] });
                await new Promise(resolve => setTimeout(resolve, 1000));
                State.provider = new ethers.BrowserProvider(window.ethereum);
            } catch (switchError) {
                 if (switchError.code === 4001) { showToast('Network switch rejected.', 'error'); }
                 else { showToast('Failed to switch network. Please do it manually.', 'error'); }
                disconnectWallet();
                return false;
            }
        }

        const success = await setupSignerAndLoadData();
        if(success) {
            showToast('Wallet connected successfully!', 'success');
        }
        return success;

    } catch (error) {
        console.error('Error connecting wallet:', error);
         if (error.code === 4001) { showToast('Connection request rejected.', 'info'); }
         else if (error.code === -32002) { showToast('Connection request already pending. Check MetaMask.', 'info'); }
         else { showToast(`Error connecting: ${error.message || 'Unknown error.'}`, 'error'); }
        disconnectWallet();
        return false;
    } finally {
        DOMElements.connectButton.disabled = false;
        DOMElements.connectButton.innerHTML = '<i class="fa-solid fa-wallet mr-2"></i>Connect Wallet';
    }
}

export function disconnectWallet() {
    console.log("Disconnecting wallet state...");
    State.provider = null; State.signer = null; State.userAddress = null;
    State.isConnected = false;
    State.currentUserBalance = 0n;
    State.userDelegations = [];
    State.activityHistory = [];
    State.myCertificates = [];
    State.myBoosters = [];
    State.userTotalPStake = 0n;

    if(State.publicProvider) {
        instantiateContracts(State.publicProvider);
    } else {
         console.warn("Public provider not available during disconnect.");
    }
    updateConnectionStatusUI('disconnected', 'Disconnected');
}


export function setupMetaMaskListeners(
    handleAccountsChanged,
    handleDisconnect,
    handleChainChanged
) {
     if (window.ethereum && window.ethereum.isMetaMask) {
         console.log("Setting up MetaMask listeners...");
         window.ethereum.on('accountsChanged', (accounts) => {
             console.log('MetaMask event: accountsChanged', accounts);
             handleAccountsChanged(accounts);
         });
         window.ethereum.on('disconnect', (error) => {
             console.error('MetaMask event: disconnect', error);
             handleDisconnect();
         });
         window.ethereum.on('chainChanged', (chainIdHex) => {
             console.log('MetaMask event: chainChanged', chainIdHex);
             handleChainChanged(chainIdHex);
         });
     } else {
          console.warn("Cannot set up MetaMask listeners: window.ethereum is not available or not MetaMask.");
     }
}