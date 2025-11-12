// modules/wallet.js
<<<<<<< HEAD
// FIXED: Race conditions, validation, polling fallback

import { ethers } from 'https://esm.sh/ethers@6.11.1';
=======
// COMPLETE AND ADJUSTED FILE

// --- Import ethers v6 via CDN ESM ---
import { ethers } from 'https://esm.sh/ethers@6.11.1';

// --- NEW IMPORT FOR WEB3MODAL via CDN ESM ---
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
import { createWeb3Modal, defaultConfig } from 'https://esm.sh/@web3modal/ethers@5.0.3';

import { State } from '../state.js';
import { showToast } from '../ui-feedback.js';
import {
    addresses, sepoliaRpcUrl, sepoliaChainId,
    bkcTokenABI, delegationManagerABI, rewardManagerABI,
    rewardBoosterABI, nftBondingCurveABI, 
<<<<<<< HEAD
    fortuneTigerABI,
    publicSaleABI,
    faucetABI,
    ecosystemManagerABI,
    decentralizedNotaryABI
=======
    fortuneTigerABI, // Uses the correct ABI (fortuneTigerABI)
    publicSaleABI,
    faucetABI,
    ecosystemManagerABI, // EcosystemManager ABI import
    decentralizedNotaryABI // Notary ABI import
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
} from '../config.js';
import { loadPublicData, loadUserData } from './data.js';
import { signIn } from './firebase-auth-service.js';

<<<<<<< HEAD
// ============================================================================
// GLOBAL STATE FOR WALLET INITIALIZATION
// ============================================================================
window.walletInitialized = false;
let balancePollingInterval = null;

// ============================================================================
// WEB3MODAL CONFIGURATION
// ============================================================================
=======
// --- WEB3MODAL CONFIGURATION (Unchanged) ---
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
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
<<<<<<< HEAD
=======

    // --- BONUS FIX ---
    // Disables WalletConnect's avatar lookup, which causes the 404 error
    // you previously mentioned in your logs.
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
    enableAvatar: false,
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
    mobileWallets: ['metamask', 'binance'],
    enableOnramp: false
});

<<<<<<< HEAD
// ============================================================================
// INTERNAL HELPER FUNCTIONS
// ============================================================================

/**
 * FIXED: Added address validation
 */
function validateEthereumAddress(address) {
    if (!address) return false;
    try {
        return ethers.isAddress(address);
    } catch {
        return false;
    }
}

/**
 * Instantiate contracts with signer or provider
 */
function instantiateContracts(signerOrProvider) {
    try {
=======
// --- Internal Helper Functions ---

/**
 * Instantiates contracts with the SIGNER (logged-in user).
 * This function is called ONLY after a successful connection.
 */
function instantiateContracts(signerOrProvider) {
    try {
        // Populate State with signed contracts (for transactions)
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
        if (addresses.bkcToken)
            State.bkcTokenContract = new ethers.Contract(addresses.bkcToken, bkcTokenABI, signerOrProvider);
        if (addresses.delegationManager)
            State.delegationManagerContract = new ethers.Contract(addresses.delegationManager, delegationManagerABI, signerOrProvider);
        if (addresses.rewardManager)
            State.rewardManagerContract = new ethers.Contract(addresses.rewardManager, rewardManagerABI, signerOrProvider);
        
        // --- FIX: Use correct address 'fortuneTiger' and 'fortuneTigerABI' ---
        if (addresses.fortuneTiger)
            State.actionsManagerContract = new ethers.Contract(addresses.fortuneTiger, fortuneTigerABI, signerOrProvider);
        
        if (addresses.rewardBoosterNFT) {
            State.rewardBoosterContract = new ethers.Contract(addresses.rewardBoosterNFT, rewardBoosterABI, signerOrProvider);
        }
        if (addresses.nftBondingCurve) {
            State.nftBondingCurveContract = new ethers.Contract(addresses.nftBondingCurve, nftBondingCurveABI, signerOrProvider);
        }
        if (addresses.publicSale) {
            State.publicSaleContract = new ethers.Contract(addresses.publicSale, publicSaleABI, signerOrProvider);
        }
        if (addresses.faucet && !addresses.faucet.startsWith('0x...')) {
            State.faucetContract = new ethers.Contract(addresses.faucet, faucetABI, signerOrProvider);
        }
        if (addresses.ecosystemManager) {
            State.ecosystemManagerContract = new ethers.Contract(addresses.ecosystemManager, ecosystemManagerABI, signerOrProvider);
        }
        if (addresses.decentralizedNotary) {
            State.decentralizedNotaryContract = new ethers.Contract(addresses.decentralizedNotary, decentralizedNotaryABI, signerOrProvider);
        }
    } catch (e) {
        console.error("Error instantiating contracts:", e);
        showToast("Error setting up contracts. Check console.", "error");
    }
}

/**
<<<<<<< HEAD
 * FIXED: Polling fallback for balance updates (replaces unreliable event listener)
 */
function startBalancePolling() {
    // Stop any existing polling
    if (balancePollingInterval) {
        clearInterval(balancePollingInterval);
        balancePollingInterval = null;
    }

    if (!State.bkcTokenContractPublic || !State.userAddress) return;

    console.log('Starting balance polling (every 5s)...');
    
    let lastBalance = State.currentUserBalance;

    balancePollingInterval = setInterval(async () => {
        try {
            if (!State.isConnected || !State.userAddress) {
                clearInterval(balancePollingInterval);
                balancePollingInterval = null;
                return;
            }

            const newBalance = await State.bkcTokenContractPublic.balanceOf(State.userAddress);
            
            if (newBalance !== lastBalance) {
                console.log(`Balance changed: ${ethers.formatUnits(lastBalance, 18)} → ${ethers.formatUnits(newBalance, 18)}`);
                lastBalance = newBalance;
                State.currentUserBalance = newBalance;
                
                // Trigger UI update
                if (window.updateUIState) {
                    window.updateUIState();
                }
            }
        } catch (error) {
            console.warn('Balance polling error:', error);
        }
    }, 5000); // Poll every 5 seconds
}

/**
 * FIXED: Better error handling with specific error types
=======
 * Sets up the signer and loads user-specific data.
 * Called by the connection/re-connection logic.
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
 */
async function setupSignerAndLoadData(provider, address) {
    try {
        console.log("🔧 Setting up wallet for:", address);
        
        // Validate address
        if (!validateEthereumAddress(address)) {
            throw new Error('INVALID_ADDRESS');
        }

        State.provider = provider;
        State.signer = await provider.getSigner();
        State.userAddress = address;

<<<<<<< HEAD
        // Firebase authentication
        try {
            await signIn(State.userAddress);
        } catch (firebaseError) {
            console.error('Firebase auth failed:', firebaseError);
            throw new Error('FIREBASE_AUTH_FAILED');
        }

        // Instantiate contracts with signer
        instantiateContracts(State.signer);
        
        // Load user data
=======
        // Authenticate with Firebase (necessary for Airdrop)
        await signIn(State.userAddress); 

        // Instantiate contracts with the signer (for user transactions)
        instantiateContracts(State.signer);
        
        // Load user-specific data (balance, pStake, etc.)
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
        await loadUserData(); 
        
        // Start balance polling
        startBalancePolling();
        
        State.isConnected = true;
        window.walletInitialized = true;
        
        console.log("✅ Wallet connected successfully!");
        
        return true;
    } catch (error) {
<<<<<<< HEAD
        console.error("❌ Connection error:", error);
        
        // Specific error messages
        if (error.message === 'INVALID_ADDRESS') {
            showToast("Invalid wallet address.", "error");
        } else if (error.message === 'FIREBASE_AUTH_FAILED') {
            showToast("Authentication failed. Please try again.", "error");
        } else if (error.code === 'ACTION_REJECTED') {
            showToast("Operation rejected by user.", "info");
        } else if (error.code === 'NETWORK_ERROR') {
            showToast("Network error. Please check your connection.", "error");
        } else {
            showToast(`Connection failed: ${error.message || 'Unknown error'}`, "error");
        }
        
        return false;
    }
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Initialize public provider for non-authenticated data
=======
         console.error("Error during setupSignerAndLoadData:", error);
         if (error.code === 'ACTION_REJECTED') { showToast("Operation rejected by user.", "info"); }
         else if (error.message && error.message.includes("Firebase")) { showToast("Firebase authentication failed.", "error"); }
         else { showToast(`Connection failed: ${error.message || 'Unknown error'}`, "error"); }
         return false;
    }
}


// --- Exported Functions ---

/**
 * Initializes the PUBLIC provider (for non-logged-in data like TVL and validators).
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
 */
export async function initPublicProvider() {
    try {
        State.publicProvider = new ethers.JsonRpcProvider(sepoliaRpcUrl);

<<<<<<< HEAD
=======
        // Initialize PUBLIC contracts that TVL (DashboardPage.js) looks for.
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
        if (addresses.bkcToken)
            State.bkcTokenContractPublic = new ethers.Contract(addresses.bkcToken, bkcTokenABI, State.publicProvider);
        if (addresses.delegationManager)
            State.delegationManagerContractPublic = new ethers.Contract(addresses.delegationManager, delegationManagerABI, State.publicProvider);
        if (addresses.rewardManager)
            State.rewardManagerContractPublic = new ethers.Contract(addresses.rewardManager, rewardManagerABI, State.publicProvider);
        
        // --- FIX: Use correct address 'fortuneTiger' and 'fortuneTigerABI' ---
        if (addresses.fortuneTiger)
            State.actionsManagerContractPublic = new ethers.Contract(addresses.fortuneTiger, fortuneTigerABI, State.publicProvider);
        
        if (addresses.nftBondingCurve) {
            State.nftBondingCurveContractPublic = new ethers.Contract(addresses.nftBondingCurve, nftBondingCurveABI, State.publicProvider);
        }
         if (addresses.ecosystemManager) {
            State.ecosystemManagerContract = new ethers.Contract(addresses.ecosystemManager, ecosystemManagerABI, State.publicProvider);
         }

<<<<<<< HEAD
=======
        // Load public data (e.g., validator list, public info)
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
        await loadPublicData();
        
        console.log("Public provider initialized.");
    } catch (e) {
        console.error("Failed to initialize public provider:", e);
        showToast("Could not connect to the blockchain network.", "error");
    }
}

/**
<<<<<<< HEAD
 * FIXED: Active polling for wallet initialization instead of fixed timeout
 */
export async function subscribeToWalletChanges(callback) {
    let wasPreviouslyConnected = web3modal.getIsConnected(); 

    const handler = async ({ provider, address, chainId, isConnected }) => {
        console.log("Web3Modal State Change:", { isConnected, address, chainId });

        if (isConnected) {
            // Network validation
=======
 * Subscribes to Web3Modal state changes and handles connection logic.
 * @param {function} callback - The function in app.js that will handle UI updates.
 */
export function subscribeToWalletChanges(callback) {
    
    let wasPreviouslyConnected = web3modal.getIsConnected();
    let isInitialized = false; // Flag to prevent duplicate events on load

    // =================================================================
    // ### START OF CORRECTION for page load connection ###
    //
    // We use `subscribeState` to get the *immediate* status on page load,
    // solving the "flicker" or "Connect" button bug.
    // =================================================================

    // Listener 1: Captures the initial connection state on page load
    const unsubscribeState = web3modal.subscribeState(async (state) => {
        // We only want this to run ONCE on page load
        if (isInitialized) return; 

        const { isConnected, address, chainId } = state;
        console.log("Web3Modal Initial State Check (subscribeState):", { isConnected, address, chainId });

        // Check if the state has a valid saved connection
        if (isConnected && address && chainId) {
            isInitialized = true; // Mark as initialized
            
            const provider = web3modal.getWalletProvider();
            
            if (provider && chainId === Number(sepoliaChainId)) {
                console.log("Found saved session. Setting up signer...");
                const ethersProvider = new ethers.BrowserProvider(provider);
                State.web3Provider = provider; // Save the raw provider
                
                // Set up signer and load user balance
                const success = await setupSignerAndLoadData(ethersProvider, address);
                
                if (success) {
                    wasPreviouslyConnected = true;
                    // **CALLS APP.JS** to update UI to "connected"
                    callback({ isConnected: true, address, chainId, isNewConnection: false });
                } else {
                    // Setup failed (e.g., Firebase)
                    await web3modal.disconnect();
                }
            } else if (provider && chainId !== Number(sepoliaChainId)) {
                // Connected, but on wrong chain. `subscribeProvider` (below) will handle the switch.
                console.log("Connected, but on wrong chain. Waiting for provider swap...");
            } else if (!provider) {
                 // Modal state is out of sync (says connected but has no provider)
                 isInitialized = true; // Mark as initialized
                 console.log("No provider found despite connected state. Rendering disconnected.");
                 callback({ isConnected: false, wasConnected: false });
            }
        } else if (!isConnected && !isInitialized) {
            // No saved session, render the page as disconnected
            isInitialized = true; // Mark as initialized
            console.log("No saved session found. Rendering disconnected state.");
            // **CALLS APP.JS** to update UI to "disconnected"
            callback({ isConnected: false, wasConnected: false });
        }
    });

    // Listener 2: Handles ACTIVE connections and disconnections (when the user clicks)
    const unsubscribeProvider = web3modal.subscribeProvider(async ({ provider, address, chainId, isConnected }) => {
        
        // Ignore the first event if `subscribeState` (above) already handled it
        if (!isInitialized) {
            console.warn("subscribeProvider fired before subscribeState. Relying on Provider...");
            isInitialized = true; 
        }

        console.log("Web3Modal Provider Change (Active Event):", { isConnected, address, chainId });

        if (isConnected) {
            
            // --- Network Switching Logic (Unchanged) ---
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
            if (chainId !== Number(sepoliaChainId)) {
                showToast(`Wrong network. Switching to Sepolia...`, 'error');
                const expectedChainIdHex = '0x' + (Number(sepoliaChainId)).toString(16);

                try {
                    await provider.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: expectedChainIdHex }],
                    });
                    return;
                } catch (switchError) {
                    if (switchError.code === 4902) {
                        showToast('Sepolia network not found. Adding...', 'info');
                        try {
                            await provider.request({
                                method: 'wallet_addEthereumChain',
                                params: [{
                                    chainId: expectedChainIdHex,
                                    chainName: sepolia.name,
                                    rpcUrls: [sepolia.rpcUrl],
                                    nativeCurrency: { name: sepolia.currency, symbol: sepolia.currency, decimals: 18 },
                                    blockExplorerUrls: [sepolia.explorerUrl],
                                }],
                            });
                            return;
                        } catch (addError) {
                            console.error("Failed to add Sepolia network:", addError);
<<<<<<< HEAD
                            showToast('You need to add and connect to Sepolia network.', 'error');
=======
                            showToast('You must add and connect to the Sepolia network.', 'error');
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
                            await web3modal.disconnect();
                            return;
                        }
                    }
                    console.error("Failed to switch network:", switchError);
<<<<<<< HEAD
                    showToast('You need to be on Sepolia network to use the dApp.', 'error');
=======
                    showToast('You must be on the Sepolia network to use the dApp.', 'error');
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
                    await web3modal.disconnect();
                    return;
                }
            }
<<<<<<< HEAD

            // Setup signer and load data
            const ethersProvider = new ethers.BrowserProvider(provider);
=======
            // --- End of Network Switching Logic ---

            const ethersProvider = new ethers.BrowserProvider(provider);
            
            // --- FIX for 'Add to Wallet' in NotaryPage ---
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
            State.web3Provider = provider; 

            // --- FIX for Balance Sync ---
            // We call setupSignerAndLoadData *first*...
            const success = await setupSignerAndLoadData(ethersProvider, address);
            
            if (success) {
                const isNewConnection = !wasPreviouslyConnected;
                wasPreviouslyConnected = true;

<<<<<<< HEAD
=======
                // ...and *then* we call the callback to update the UI
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
                callback({ 
                    isConnected: true, 
                    address, 
                    chainId,
                    isNewConnection 
                });
            } else {
                await web3modal.disconnect();
            }

        } else {
 HEAD
            // Disconnection handler
            console.log("Web3Modal reports disconnection. Clearing app state.");
            
            const wasConnected = State.isConnected;

            // Stop polling
            if (balancePollingInterval) {
                clearInterval(balancePollingInterval);
                balancePollingInterval = null;
            }

            // Clear state
            // Disconnected
            console.log("Web3Modal reports disconnection. Clearing app state.");
            
            const wasConnected = State.isConnected; 

            // Clear App State
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
            State.web3Provider = null; 
            State.provider = null;
            State.signer = null;
            State.userAddress = null;
            State.isConnected = false;
            State.currentUserBalance = 0n;
            State.userDelegations = [];
            State.activityHistory = [];
            State.myCertificates = [];
            State.myBoosters = [];
            State.userTotalPStake = 0n;
<<<<<<< HEAD
            window.walletInitialized = false;

            // Reinitialize contracts with public provider
=======
        
            // Re-instantiate contracts with the PUBLIC provider
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
            if(State.publicProvider) {
                instantiateContracts(State.publicProvider);
            }
            
<<<<<<< HEAD
            callback({ 
                isConnected: false,
                wasConnected: wasConnected
=======
            // Call app.js to update UI to "disconnected" state
            callback({ 
                isConnected: false,
                wasConnected: wasConnected 
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
            });
            wasPreviouslyConnected = false;
        }
    };
    
    // Attach handler for future events
    web3modal.subscribeProvider(handler);

<<<<<<< HEAD
    // ============================================================================
    // CRITICAL FIX: Force clean slate on page load
    // ============================================================================
    console.log("🧹 Forcing clean disconnect on page load...");
    
    try {
        // Clear Web3Modal state
        await web3modal.disconnect();
        
        // Clear our internal state
        State.web3Provider = null;
        State.provider = null;
        State.signer = null;
        State.userAddress = null;
        State.isConnected = false;
        State.currentUserBalance = 0n;
        window.walletInitialized = false;
        
        console.log("✅ Clean slate established. User must reconnect manually.");
    } catch (e) {
        console.log("ℹ️ No existing connection to clear:", e.message);
    }
=======
    // The old `try/catch` block for `getState()` is removed,
    // as `subscribeState` handles this logic more reliably.
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
}
// =TERrMII-q_A_p-l-B-K_I-N-G--O-F--C-O-R-R-E-C-T-I-O-N_Z-Z >

/**
<<<<<<< HEAD
 * Open connection modal
=======
 * Opens the connection modal.
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
 */
export function openConnectModal() {
    web3modal.open();
}

/**
<<<<<<< HEAD
 * Disconnect wallet
=======
 * Asks Web3Modal to disconnect.
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
 */
export async function disconnectWallet() {
    console.log("Disconnecting wallet...");
    
    // Stop polling
    if (balancePollingInterval) {
        clearInterval(balancePollingInterval);
        balancePollingInterval = null;
    }
    
    await web3modal.disconnect();
}