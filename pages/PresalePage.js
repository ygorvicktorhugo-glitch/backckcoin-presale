// js/pages/PresalePage.js
// ✅ VERSÃO FINAL MAINNET V1.0: Lógica de Pré-Venda (Venda em ETH)

const ethers = window.ethers;

import { State } from '../state.js';
import { showToast, closeModal } from '../ui-feedback.js';
import { formatBigNumber } from '../utils.js';
import { addresses, publicSaleABI } from '../config.js'; 
import { safeContractCall } from '../modules/data.js';

// --- ESTADO LOCAL ---
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

// --- CONFIGURAÇÕES DE REDE ---
const ARBITRUM_MAINNET_ID_DECIMAL = 42161; // ID da Mainnet

// ====================================================================
// 1. LÓGICA DE TRANSAÇÃO (NOVA FUNÇÃO DE COMPRA)
// ====================================================================

/**
 * Wrapper para executar a transação de compra de NFT (payable).
 * Requer ETH anexado (msg.value) e não exige aprovação prévia.
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
            value: totalCostWei.toString(), // Envia o ETH necessário
            gasLimit: 600000 // Limite de gás conservador para Mainnet L2
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

        // Atualiza dados após sucesso
        await loadPresaleData(); 
        if (window.updateUIState) window.updateUIState(true);

        return true;
    } catch (e) {
        console.error("Presale Transaction Error:", e);
        let reason = 'Transaction rejected or failed.';
        
        if (e.reason) reason = e.reason;
        else if (e.message) reason = e.message;

        if (e.code === 'ACTION_REJECTED') reason = 'You rejected the transaction.';
        if (reason.includes("execution reverted")) reason = "Execution Reverted (Check supply/whitelist).";
        if (reason.includes("Insufficient funds")) reason = "Insufficient ETH balance for transaction + gas.";
        
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


// ====================================================================
// 2. FETCH DE DADOS
// ====================================================================

async function loadPresaleData() {
    PresaleState.isLoading = true;
    const contractAddress = addresses.presaleContract;
    const provider = State.publicProvider;
    
    if (!contractAddress || !provider) return;

    try {
        const contract = new ethers.Contract(contractAddress, publicSaleABI, provider);
        
        // 1. Checagem de Whitelist
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
        
        // 3. Atualizar Estado Selecionado
        if (PresaleState.tiers.length > 0 && PresaleState.selectedTierId === 0) {
            PresaleState.selectedTierId = PresaleState.tiers[0].id;
        }

    } catch (e) {
        console.error("Failed to load presale data:", e);
        showToast("Error loading presale data.", "error");
    } finally {
        PresaleState.isLoading = false;
        updatePresaleUI();
    }
}

// ====================================================================
// 3. RENDERIZAÇÃO E UI
// ====================================================================

function calculateCost() {
    const tier = PresaleState.tiers.find(t => t.id === PresaleState.selectedTierId);
    if (tier) {
        PresaleState.priceInWei = tier.priceInWei;
        PresaleState.totalCostInWei = tier.priceInWei * BigInt(PresaleState.quantity);
    } else {
        PresaleState.priceInWei = 0n;
        PresaleState.totalCostInWei = 0n;
    }
    updatePresaleUI();
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

function updatePresaleUI() {
    const root = document.getElementById('presale');
    if (!root) return;

    if (PresaleState.isLoading) {
        root.innerHTML = `<div class="text-center py-10"><div class="loader mx-auto mb-4"></div><p class="text-zinc-400">Loading Presale Data...</p></div>`;
        return;
    }

    const selectedTier = PresaleState.tiers.find(t => t.id === PresaleState.selectedTierId);
    
    // Alertas de estado
    let alertMessage = '';
    if (PresaleState.isWhitelistEnabled && !PresaleState.isWhitelisted) {
        alertMessage = `<div class="bg-red-900/30 text-red-400 border border-red-800 p-3 rounded-lg mb-4"><i class="fa-solid fa-lock mr-2"></i> Whitelist is enabled. Your address is not whitelisted.</div>`;
    } else if (!selectedTier) {
        alertMessage = `<div class="bg-amber-900/30 text-amber-400 border border-amber-800 p-3 rounded-lg mb-4"><i class="fa-solid fa-triangle-exclamation mr-2"></i> No active tiers available.</div>`;
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
                        <input type="number" id="quantity-input" min="1" max="10" value="${PresaleState.quantity}" class="form-input bg-zinc-800/70 border-zinc-700 focus:border-amber-500" ${PresaleState.isLoading ? 'disabled' : ''}>
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
            
            <div class="mt-6 text-center text-zinc-500 text-sm">
                You own: ${PresaleState.userNFTCount} Booster NFT(s)
            </div>
        </div>
    `;
    setupPresaleListeners();
}

function getButtonState() {
    if (PresaleState.isLoading || !PresaleState.selectedTierId) return 'disabled';
    if (!State.isConnected) return 'disabled';
    if (PresaleState.isWhitelistEnabled && !PresaleState.isWhitelisted) return 'disabled';
    
    const tier = PresaleState.tiers.find(t => t.id === PresaleState.selectedTierId);
    if (!tier || tier.mintedCount >= tier.maxSupply) return 'disabled';
    if (PresaleState.totalCostInWei <= 0n) return 'disabled';
    
    // A checagem final de ETH é feita na carteira
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

// ====================================================================
// 4. LISTENERS
// ====================================================================

function setupPresaleListeners() {
    const selectionEl = document.getElementById('tier-selection');
    if (selectionEl) {
        selectionEl.addEventListener('click', (e) => {
            const card = e.target.closest('.tier-card');
            if (card) {
                const newTierId = Number(card.dataset.tierId);
                PresaleState.selectedTierId = newTierId;
                calculateCost();
            }
        });
    }

    const quantityInput = document.getElementById('quantity-input');
    if (quantityInput) {
        quantityInput.addEventListener('input', (e) => {
            const newQuantity = Math.max(1, parseInt(e.target.value) || 1);
            PresaleState.quantity = newQuantity;
            e.target.value = newQuantity; // Força o mínimo de 1
            calculateCost();
        });
    }
    
    const buyButton = document.getElementById('buy-nft-btn');
    if (buyButton && !buyButton.disabled) {
        buyButton.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!State.isConnected) {
                window.openConnectModal();
                return;
            }
            
            const tierId = PresaleState.selectedTierId;
            const quantity = PresaleState.quantity;
            const cost = PresaleState.totalCostInWei;
            
            await executeBuyPresaleNFT(tierId, quantity, cost, buyButton);
        });
    }
}


// ====================================================================
// 5. EXPORT
// ====================================================================

export const PresalePage = {
    async render(isNewPage) {
        if (isNewPage) {
            PresaleState.selectedTierId = 0; // Reset para garantir a seleção
        }
        await loadPresaleData();
    },
    async update() {
        if (!document.hidden && document.getElementById('presale').classList.contains('active')) {
            await loadPresaleData();
        }
    }
};