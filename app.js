// js/app.js
// ✅ VERSÃO FINAL LANDPAGE V3.4: Remoção da importação de showShareModal e correção de referência.

const inject = window.inject || (() => { console.warn("Dev Mode: Analytics disabled."); });
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    try { inject(); } catch (e) { console.error("Analytics Error:", e); }
}

const ethers = window.ethers;

import { DOMElements } from './dom-elements.js';
import { State } from './state.js';
import { initPublicProvider, initWalletSubscriptions, openConnectModal, switchToTestnet } from './modules/wallet.js'; 
// 🔥 CORREÇÃO: showShareModal removida do ui-feedback.js, removemos a importação aqui.
import { showToast, showWelcomeModal, openModal } from './ui-feedback.js'; 
import { formatBigNumber } from './utils.js'; 
import { loadAddresses, publicSaleABI, addresses } from './config.js'; 
import { safeContractCall } from './modules/data.js'; 

// ============================================================================
// 1. PRESALE STATE & LÓGICA DE VENDA (Embutida)
// ============================================================================

const ARBITRUM_MAINNET_ID_DECIMAL = 42161; 

const PresaleState = {
    tiers: [],
    isLoading: true,
    userNFTCount: 0,
    selectedTierId: 0,
    quantity: 1,
    isWhitelisted: false,
    isWhitelistEnabled: false,
    priceInWei: 0n,
    totalCostInWei: 0n
};

let dataLoadTimeout = null; 
let logoAnimationInterval = null; 

// --- ANIMAÇÃO DE LOADING ---

function renderAnimatedLoader() {
    return `
        <div class="max-w-4xl mx-auto py-16 text-center animate-fadeIn">
            <h1 class="text-4xl font-extrabold text-white mb-2 tracking-tight">Initializing Protocol</h1>
            <p class="text-zinc-400 mb-8">Securing connection to Arbitrum One...</p>
            
            <div class="relative w-24 h-24 mx-auto mb-6">
                <div class="absolute inset-0 border-4 border-cyan-500/30 rounded-full animate-pulse-slow"></div>

                <div id="loader-logo-container" class="absolute inset-2 flex items-center justify-center">
                    <img id="logo-bkc" src="./assets/bkc_logo_3d.png" class="w-full h-full object-contain absolute transition-opacity duration-500 opacity-100" alt="Backcoin Logo">
                    <img id="logo-arb" src="./assets/icon_arbitrum.svg" class="w-full h-full object-contain absolute transition-opacity duration-500 opacity-0" alt="Arbitrum Logo">
                </div>
            </div>
            
            <div id="loading-msg" class="text-sm font-mono text-zinc-500">Loading modules...</div>
        </div>
    `;
}

// Inicializa a animação de troca de logo
function startLogoCycleAnimation() {
    if (logoAnimationInterval) clearInterval(logoAnimationInterval);
    
    const messages = [
        "Securing connection to Mainnet...",
        "Validating NFT contract addresses...",
        "Fetching Presale tier information...",
        "Checking Whitelist status...",
        "Synchronization complete."
    ];
    let messageIndex = 0;
    
    logoAnimationInterval = setInterval(() => {
        const bkc = document.getElementById('logo-bkc');
        const arb = document.getElementById('logo-arb');
        const msg = document.getElementById('loading-msg');
        
        if (!bkc || !arb) return;

        // Troca Logos
        if (bkc.style.opacity === '1') {
            bkc.style.opacity = '0';
            arb.style.opacity = '1';
        } else {
            bkc.style.opacity = '1';
            arb.style.opacity = '0';
        }

        // Atualiza Mensagem
        if (msg && messageIndex < messages.length - 1) {
            messageIndex++;
            msg.textContent = messages[messageIndex];
        }
        
        // Se a carga de dados terminar, paramos o timer de mensagens
        if (PresaleState.isLoading === false) {
             clearInterval(logoAnimationInterval);
             if (msg) msg.textContent = messages[messages.length - 1];
        }

    }, 1500); 
    return logoAnimationInterval;
}


/**
 * Wrapper para executar a transação de compra de NFT (payable).
 */
async function executeBuyPresaleNFT(tierId, quantity, totalCostWei, btnElement) {
    const signer = State.signer;
    if (!signer || !addresses.presaleContract) {
        showToast("Wallet not connected or Presale contract unavailable.", "error");
        return false;
    }
    
    if (State.provider.getNetwork().chainId !== BigInt(ARBITRUM_MAINNET_ID_DECIMAL)) {
        showToast("Please switch to Arbitrum Mainnet.", "warning");
        return false;
    }

    const originalText = btnElement ? btnElement.innerHTML : 'Processing...';
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loader inline-block mr-2"></div> Processing...';
    }
    
    try {
        const presaleContract = new ethers.Contract(addresses.presaleContract, publicSaleABI, signer); 
        
        const txOptions = {
            value: totalCostWei.toString(),
            gasLimit: 600000 
        };
        
        let txPromise;
        if (quantity === 1) {
            txPromise = presaleContract.buyNFT(BigInt(tierId), txOptions);
        } else {
            txPromise = presaleContract.buyMultipleNFTs(BigInt(tierId), BigInt(quantity), txOptions);
        }

        const tx = await txPromise;
        
        if (btnElement) btnElement.innerHTML = '<div class="loader inline-block mr-2"></div> Confirming...';
        showToast('Submitting transaction to blockchain...', 'info');
        
        const receipt = await tx.wait();
        
        showToast(`Purchase successful! Received ${quantity} NFT(s).`, 'success', receipt.hash);

        await loadPresaleDataDebounced(true); 

        return true;
    } catch (e) {
        console.error("Presale Transaction Error:", e);
        let reason = 'Transaction rejected or failed.';
        
        if (e.reason) reason = e.reason;
        else if (e.message) reason = e.message;

        if (e.code === 'ACTION_REJECTED') reason = 'You rejected the transaction.';
        if (reason.includes("execution reverted")) reason = "Execution Reverted (Check supply/whitelist/funds).";
        
        showToast(`Purchase Failed: ${reason}`, "error");
        return false;
    } finally {
        if(btnElement) {
            setTimeout(() => {
                btnElement.disabled = false;
                btnElement.innerHTML = originalText;
            }, 1000);
        }
    }
}


// Função de Fetching de Dados
async function loadPresaleData() {
    PresaleState.isLoading = true;
    const contractAddress = addresses.presaleContract;
    const provider = State.publicProvider;
    
    try {
        const contract = new ethers.Contract(contractAddress, publicSaleABI, provider);
        
        // 1. Checagem de Whitelist & Saldo de NFT
        const [isWhitelistEnabled, isWhitelisted, userNFTCount] = await Promise.all([
            safeContractCall(contract, 'isWhitelistEnabled', [], false),
            State.userAddress ? safeContractCall(contract, 'isWhitelisted', [State.userAddress], false) : Promise.resolve(false),
            State.userAddress ? safeContractCall(contract, 'balanceOf', [State.userAddress], 0n) : Promise.resolve(0n)
        ]);
        
        PresaleState.isWhitelistEnabled = isWhitelistEnabled;
        PresaleState.isWhitelisted = isWhitelisted;
        PresaleState.userNFTCount = Number(userNFTCount);

        // 2. Carregar Tiers (Assumindo que há 3 tiers: 1, 2, 3)
        const tierPromises = [1, 2, 3].map(id => 
            safeContractCall(contract, 'getTierInfo', [BigInt(id)], null)
        );
        
        const tierResults = await Promise.all(tierPromises);
        
        PresaleState.tiers = tierResults.map((result, index) => {
            if (!result) return null;
            const [price, maxSupply, mintedCount, boostBips, isConfigured] = result; 
            return {
                id: index + 1,
                priceInWei: price,
                maxSupply: Number(maxSupply),
                mintedCount: Number(mintedCount),
                boostBips: Number(boostBips),
                isConfigured: isConfigured,
                name: `Tier ${index + 1} (+${Number(boostBips) / 100}%)`,
                priceETH: formatBigNumber(price).toFixed(6)
            };
        }).filter(t => t && t.isConfigured);
        
        if (PresaleState.tiers.length > 0 && PresaleState.selectedTierId === 0) {
            PresaleState.selectedTierId = PresaleState.tiers[0].id;
        }

    } catch (e) {
        console.error("Failed to load presale data:", e);
    } finally {
        PresaleState.isLoading = false;
        calculateCost();
        updatePresaleUI();
    }
}

/**
 * Funcao Debounced que chama loadPresaleData.
 */
async function loadPresaleDataDebounced(immediate = false) {
    if (dataLoadTimeout) clearTimeout(dataLoadTimeout);
    
    if (immediate) {
         return loadPresaleData();
    }

    dataLoadTimeout = setTimeout(loadPresaleData, 500); 
}


function calculateCost() {
    const tier = PresaleState.tiers.find(t => t.id === PresaleState.selectedTierId);
    if (tier) {
        PresaleState.priceInWei = tier.priceInWei;
        PresaleState.totalCostInWei = tier.priceInWei * BigInt(PresaleState.quantity);
    } else {
        PresaleState.priceInWei = 0n;
        PresaleState.totalCostInWei = 0n;
    }
}

function renderTierSelector(tier) {
    const isSoldOut = tier.mintedCount >= tier.maxSupply;
    const isSelected = tier.id === PresaleState.selectedTierId;
    
    return `
        <div class="tier-card p-4 rounded-xl border-2 transition-all cursor-pointer ${isSelected ? 'border-amber-500 bg-amber-900/20 shadow-lg' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'}" data-tier-id="${tier.id}">
            <h4 class="text-lg font-bold ${isSelected ? 'text-white' : 'text-zinc-300'}">${tier.name}</h4>
            <p class="text-zinc-400 text-sm mb-2">Boost: +${tier.boostBips / 100}%</p>
            <p class="text-xl font-extrabold flex items-center gap-2 ${isSoldOut ? 'text-red-500' : 'text-amber-400'}">
                ${isSoldOut ? 'SOLD OUT' : `${tier.priceETH} ETH`}
            </p>
            <p class="text-xs text-zinc-500 mt-1">${tier.mintedCount}/${tier.maxSupply} Minted</p>
        </div>
    `;
}

function getButtonState() {
    if (PresaleState.isLoading || !PresaleState.selectedTierId) return 'disabled';
    if (!State.isConnected) return 'disabled';
    if (PresaleState.isWhitelistEnabled && !PresaleState.isWhitelisted) return 'disabled';
    
    const tier = PresaleState.tiers.find(t => t.id === PresaleState.selectedTierId);
    if (!tier || tier.mintedCount >= tier.maxSupply) return 'disabled';
    if (PresaleState.totalCostInWei <= 0n) return 'disabled';
    
    return '';
}

function getButtonText() {
    if (PresaleState.isLoading) return 'Loading...';
    if (!State.isConnected) return 'Connect Wallet to Buy';
    if (PresaleState.isWhitelistEnabled && !PresaleState.isWhitelisted) return 'Not Whitelisted';
    
    const tier = PresaleState.tiers.find(t => t.id === PresaleState.selectedTierId);
    if (!tier) return 'Select Tier';
    if (tier.mintedCount >= tier.maxSupply) return 'SOLD OUT';
    
    return `BUY ${PresaleState.quantity} NFT(s)`;
}

function setupPresaleListeners(root) {
    root.removeEventListener('click', handlePresaleClick); 
    root.removeEventListener('input', handlePresaleInput);

    root.addEventListener('click', handlePresaleClick);
    root.addEventListener('input', handlePresaleInput);
}

function handlePresaleClick(e) {
    const card = e.target.closest('.tier-card');
    if (card) {
        const newTierId = Number(card.dataset.tierId);
        PresaleState.selectedTierId = newTierId;
        calculateCost();
        updatePresaleUI();
        return;
    }
    
    const buyButton = document.getElementById('buy-nft-btn');
    if (e.target === buyButton && !buyButton.disabled) {
        e.preventDefault();
        if (!State.isConnected) {
            window.openConnectModal();
            return;
        }
        
        const tierId = PresaleState.selectedTierId;
        const quantity = PresaleState.quantity;
        const cost = PresaleState.totalCostInWei;
        
        executeBuyPresaleNFT(tierId, quantity, cost, buyButton);
    }
}

function handlePresaleInput(e) {
    const quantityInput = document.getElementById('quantity-input');
    if (e.target === quantityInput) {
        const newQuantity = Math.max(1, parseInt(e.target.value) || 1);
        PresaleState.quantity = newQuantity;
        e.target.value = newQuantity; // Força o mínimo de 1
        calculateCost();
        updatePresaleUI();
    }
}


function updatePresaleUI() {
    const root = document.getElementById('presale');
    if (!root) return;
    
    if (PresaleState.isLoading || PresaleState.tiers.length === 0) {
        let message = 'NFT Presale Tiers are not yet active.';
        
        if (PresaleState.isLoading) {
            // Renderiza o novo loader animado
            root.innerHTML = renderAnimatedLoader();
            startLogoCycleAnimation();
        } else {
             // Caso contrário, mostra a mensagem de tiers indisponíveis (sem animação)
             root.innerHTML = `
                <div class="max-w-4xl mx-auto py-8 text-center">
                    <h1 class="text-4xl font-extrabold text-white mb-2">Backcoin Presale</h1>
                    <p class="text-zinc-400 mb-8">Secure your Backcoin Boosters on Arbitrum One.</p>
                    <p class="text-zinc-400 mb-8">${message}</p>
                    <button onclick="window.openConnectModal()" class="wallet-btn wallet-btn-disconnected text-base py-3 px-6 mt-8">
                        Connect Wallet
                    </button>
                </div>
             `;
        }
        setupPresaleListeners(root);
        return;
    }

    const selectedTier = PresaleState.tiers.find(t => t.id === PresaleState.selectedTierId);
    
    // Alertas de estado
    let alertMessage = '';
    if (PresaleState.isWhitelistEnabled && !PresaleState.isWhitelisted) {
        alertMessage = `<div class="bg-red-900/30 text-red-400 border border-red-800 p-3 rounded-lg mb-4"><i class="fa-solid fa-lock mr-2"></i> Whitelist is enabled. Your address is not whitelisted.</div>`;
    }

    root.innerHTML = `
        <div class="max-w-4xl mx-auto py-8">
            <h1 class="text-4xl font-extrabold text-white mb-2 tracking-tight">NFT Presale (Mainnet)</h1>
            <p class="text-zinc-400 mb-8">Secure your Backcoin Boosters on Arbitrum One. Payment required in ETH.</p>

            ${alertMessage}

            <div class="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 shadow-xl">
                <h3 class="text-2xl font-bold mb-4">Select Your Tier</h3>
                <div id="tier-selection" class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    ${PresaleState.tiers.map(renderTierSelector).join('')}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                    <div class="col-span-1">
                        <label class="block text-sm font-medium text-zinc-400 mb-2">Quantity</label>
                        <input type="number" id="quantity-input" min="1" max="10" value="${PresaleState.quantity}" class="form-input bg-zinc-800/70 border-zinc-700 focus:border-amber-500">
                    </div>
                    
                    <div class="col-span-2">
                        <label class="block text-sm font-medium text-zinc-400 mb-2">Total Cost</label>
                        <div class="bg-zinc-800/70 p-3 rounded-lg flex justify-between items-center border border-zinc-700">
                            <span class="text-2xl font-bold text-white">${formatBigNumber(PresaleState.totalCostInWei).toFixed(6)}</span>
                            <span class="text-xl text-zinc-400">ETH</span>
                        </div>
                    </div>
                </div>

                <button id="buy-nft-btn" class="btn-primary w-full py-4 mt-6 text-xl rounded-xl font-bold transition-all" ${getButtonState()}>
                    ${getButtonText()}
                </button>
            </div>
            
            <div class="mt-6 text-center text-zinc-500/80 text-sm">
                You own: ${PresaleState.userNFTCount} Booster NFT(s)
            </div>
        </div>
    `;
    setupPresaleListeners(root);
}

const PresalePage = {
    async render(isNewPage) {
        if (isNewPage) {
            PresaleState.selectedTierId = 0;
            PresaleState.quantity = 1;
        }
        await loadPresaleDataDebounced(true); 
    },
    async update(isConnected, forceUpdate = false) {
        if (isConnected || forceUpdate) {
            await loadPresaleDataDebounced(true); 
        }
        updatePresaleUI();
    }
};


// ============================================================================
// 3. CORE DAPP LOGIC & UTILITIES
// ============================================================================

const ADMIN_WALLET = '0x03aC69873293cD6ddef7625AfC91E3Bd5434562a'; 

// --- FORMATTING HELPERS ---
function formatAddress(addr) {
    if (!addr || addr.length < 42) return '...';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`; 
}

function formatLargeBalance(bigNum) {
    if (!bigNum) return "0.00";
    const num = formatBigNumber(bigNum);
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
    if (num >= 10_000) return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================================
// 4. UI STATE MANAGEMENT (ESCOPO CORRIGIDO)
// ============================================================================

const BASE_BTN_CLASSES = "wallet-btn text-xs font-mono text-center max-w-fit whitespace-nowrap relative font-bold py-2 px-4 rounded-md transition-colors";

function updateUIState(forcePageUpdate = false) {
    const connectButtonDesktop = document.getElementById('connectButtonDesktop');
    
    let currentAddress = State.userAddress; 
    
    if (State.isConnected && currentAddress) {
        const balanceString = formatLargeBalance(State.currentUserBalance);
        const shortAddress = formatAddress(currentAddress);
        
        const btnContent = `
            <div class="status-dot"></div>
            <span>${shortAddress}</span>
            <div class="balance-pill">
                ${balanceString} BKC
            </div>
        `;

        if (connectButtonDesktop) {
            connectButtonDesktop.innerHTML = btnContent;
            connectButtonDesktop.className = BASE_BTN_CLASSES + " wallet-btn-connected";
        }
        
    } else {
        const defaultText = `<i class="fa-solid fa-plug"></i> Connect Wallet`;
        
        if (connectButtonDesktop) {
            connectButtonDesktop.innerHTML = defaultText;
            connectButtonDesktop.className = BASE_BTN_CLASSES + " wallet-btn-disconnected";
        }
    }

    if (PresalePage && typeof PresalePage.update === 'function') {
        PresalePage.update(State.isConnected, forcePageUpdate);
    }
}

// FUNÇÃO CHAVE (NO ESCOPO GLOBAL)
function onWalletStateChange(changes) {
    const { isConnected, address, isNewConnection, wasConnected } = changes;
    const shouldForceUpdate = isNewConnection || (isConnected !== wasConnected);
    
    State.isConnected = isConnected;
    if(address) State.userAddress = address;

    updateUIState(shouldForceUpdate); 
    
    if (isConnected && isNewConnection) showToast(`Connected: ${formatAddress(address)}`, "success");
    else if (!isConnected && wasConnected) showToast("Wallet disconnected.", "info");
}

// --- FUNÇÃO SHARE MODAL (Incorporada ao app.js) ---
function showShareModal(userAddress) {
    const projectUrl = window.location.origin;
    const content = `<div class="p-6 text-center text-zinc-300">
                        <i class="fa-solid fa-share-nodes text-4xl mb-4 text-zinc-500"></i>
                        <h3 class="text-xl font-bold text-white mb-2">Share Project</h3>
                        <p class="mb-4 text-sm">Share the link to the Backcoin Presale!</p>
                        <div class="bg-black/50 p-3 rounded-lg break-all font-mono text-xs text-zinc-400 select-all border border-zinc-700">
                            ${projectUrl}
                        </div>
                     </div>`;
    openModal(content);
}

// ============================================================================
// 5. EVENT LISTENERS
// ============================================================================

function setupGlobalListeners() {
    const connectButton = document.getElementById('connectButtonDesktop');
    const shareButton = document.getElementById('shareProjectBtn');
    const returnToTestnetBtn = document.getElementById('return-to-testnet-btn');
    
    if (connectButton) connectButton.addEventListener('click', () => openConnectModal());
    
    // 🔥 CORREÇÃO: Chama a função local showShareModal
    if (shareButton) shareButton.addEventListener('click', () => showShareModal(State.userAddress));
    
    if (returnToTestnetBtn) {
        returnToTestnetBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await switchToTestnet();
        });
    }
}

// ============================================================================
// 6. MAIN INITIALIZATION
// ============================================================================

window.addEventListener('load', async () => {
    console.log("🚀 App Initializing...");

    try {
        const addressesLoaded = await loadAddresses(); 
        if (!addressesLoaded) throw new Error("Failed to load contract addresses");
    } catch (error) {
        console.error("❌ Critical Initialization Error:", error);
        showToast("Initialization failed. Please refresh.", "error");
        
        if (document.getElementById('presale')) {
            document.getElementById('presale').innerHTML = `
                <div class="max-w-4xl mx-auto py-8 text-center">
                    <h1 class="text-4xl font-extrabold text-red-500 mb-2">CRITICAL ERROR</h1>
                    <p class="text-zinc-400 mb-8">Failed to load required contract configurations. (Check deployment-addresses.json syntax/existence).</p>
                </div>
            `;
        }
        return;
    }
    
    setupGlobalListeners();

    await initPublicProvider(); 
    initWalletSubscriptions(onWalletStateChange); 
    
    showWelcomeModal(); // Chama o modal de boas-vindas
    
    const preloader = document.getElementById('preloader');
    if(preloader) preloader.style.display = 'none';
    
    if (PresalePage && typeof PresalePage.render === 'function') {
        PresalePage.render(true); 
    }

    console.log("✅ Mainnet Presale Landpage Ready.");
});

window.openConnectModal = openConnectModal;