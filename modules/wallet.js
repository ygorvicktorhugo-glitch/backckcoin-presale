// modules/wallet.js
// COMPLETE AND ADJUSTED FILE

// --- Import ethers v6 via CDN ESM ---
import { ethers } from 'https://esm.sh/ethers@6.11.1';

// --- NEW IMPORT FOR WEB3MODAL via CDN ESM ---
import { createWeb3Modal, defaultConfig } from 'https://esm.sh/@web3modal/ethers@5.0.3';

import { State } from '../state.js';
import { showToast } from '../ui-feedback.js';
import {
    addresses, sepoliaRpcUrl, sepoliaChainId,
    bkcTokenABI, delegationManagerABI, rewardManagerABI,
    rewardBoosterABI, nftBondingCurveABI, 
    fortuneTigerABI, // Uses the correct ABI (fortuneTigerABI)
    publicSaleABI,
    faucetABI,
    ecosystemManagerABI, // EcosystemManager ABI import
    decentralizedNotaryABI // Notary ABI import
} from '../config.js';
import { loadPublicData, loadUserData } from './data.js';
import { signIn } from './firebase-auth-service.js';

// --- WEB3MODAL CONFIGURATION (Unchanged) ---
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

    // --- BONUS FIX ---
    // Disables WalletConnect's avatar lookup, which causes the 404 error
    // you previously mentioned in your logs.
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
    mobileWallets: [
        'metamask',
        'binance'
    ],
    enableOnramp: false
});

// --- Internal Helper Functions ---

/**
 * Instantiates contracts with the SIGNER (logged-in user).
 * This function is called ONLY after a successful connection.
 */
function instantiateContracts(signerOrProvider) {
    try {
        // Populate State with signed contracts (for transactions)
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
 * Sets up the signer and loads user-specific data.
 * Called by the connection/re-connection logic.
 */
async function setupSignerAndLoadData(provider, address) {
    try {
        State.provider = provider;
        State.signer = await provider.getSigner();
        State.userAddress = address;

        // Authenticate with Firebase (necessary for Airdrop)
        await signIn(State.userAddress); 

        // Instantiate contracts with the signer (for user transactions)
        instantiateContracts(State.signer);
        
        // Load user-specific data (balance, pStake, etc.)
        await loadUserData(); 
        
        State.isConnected = true;
        return true;
    } catch (error) {
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
 */
export async function initPublicProvider() {
     try {
        State.publicProvider = new ethers.JsonRpcProvider(sepoliaRpcUrl);

        // Initialize PUBLIC contracts that TVL (DashboardPage.js) looks for.
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

        // Load public data (e.g., validator list, public info)
        await loadPublicData();
        
        console.log("Public provider and Web3Modal initialized.");
    } catch (e) {
        console.error("Failed to initialize public provider:", e);
        showToast("Could not connect to the blockchain network.", "error");
    }
}

/**
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
                                params: [
                                    {
                                        chainId: expectedChainIdHex,
                                        chainName: sepolia.name,
                                        rpcUrls: [sepolia.rpcUrl],
                                        nativeCurrency: { name: sepolia.currency, symbol: sepolia.currency, decimals: 18 },
                                        blockExplorerUrls: [sepolia.explorerUrl],
                                    },
                                ],
                            });
                            return;
                        } catch (addError) {
                            console.error("Failed to add Sepolia network:", addError);
                            showToast('You must add and connect to the Sepolia network.', 'error');
                            await web3modal.disconnect();
                            return;
                        }
                    }
                    console.error("Failed to switch network:", switchError);
                    showToast('You must be on the Sepolia network to use the dApp.', 'error');
                    await web3modal.disconnect();
                    return;
                }
            }
            // --- End of Network Switching Logic ---

            const ethersProvider = new ethers.BrowserProvider(provider);
            
            // --- FIX for 'Add to Wallet' in NotaryPage ---
            State.web3Provider = provider; 

            // --- FIX for Balance Sync ---
            // We call setupSignerAndLoadData *first*...
            const success = await setupSignerAndLoadData(ethersProvider, address);
            
            if (success) {
                const isNewConnection = !wasPreviouslyConnected;
                wasPreviouslyConnected = true;

                // ...and *then* we call the callback to update the UI
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
            // Disconnected
            console.log("Web3Modal reports disconnection. Clearing app state.");
            
            const wasConnected = State.isConnected; 

            // Clear App State
            State.web3Provider = null; 
            State.provider = null; State.signer = null; State.userAddress = null;
            State.isConnected = false;
            State.currentUserBalance = 0n;
            State.userDelegations = [];
            State.activityHistory = [];
            State.myCertificates = [];
            State.myBoosters = [];
            State.userTotalPStake = 0n;
        
            // Re-instantiate contracts with the PUBLIC provider
            if(State.publicProvider) {
                instantiateContracts(State.publicProvider);
            }
            
            // Call app.js to update UI to "disconnected" state
            callback({ 
                isConnected: false,
                wasConnected: wasConnected 
            });
            wasPreviouslyConnected = false;
        }
    });

    // The old `try/catch` block for `getState()` is removed,
    // as `subscribeState` handles this logic more reliably.
}
// =TERrMII-q_A_p-l-B-K_I-N-G--O-F--C-O-R-R-E-C-T-I-O-N_Z-Z >


/**
 * Opens the connection modal.
 */
export function openConnectModal() {
    web3modal.open();
}

/**
 * Asks Web3Modal to disconnect.
 */
export async function disconnectWallet() {
    console.log("Telling Web3Modal to disconnect...");
    await web3modal.disconnect();
}