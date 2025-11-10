// pages/StorePage.js

const ethers = window.ethers;

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
import { loadUserData, loadMyBoostersFromAPI, safeContractCall } from '../modules/data.js';
import { executeBuyBooster, executeSellBooster } from '../modules/transactions.js';
import { formatBigNumber, renderLoading, renderError } from '../utils.js';
import { boosterTiers, addresses } from '../config.js'; // [MODIFICADO] Importa 'addresses'

// --- Page State (Refactored for Swap Box Layout) ---
const TradeState = {
    tradeDirection: 'buy', // 'buy' (BKC -> NFT) or 'sell' (NFT -> BKC)
    selectedPoolBoostBips: null, // The 'asset' (e.g., 5000 for Diamond)
    
    // Data for the selected pool
    buyPrice: 0n,
    sellPrice: 0n,
    netSellPrice: 0n, // Sell price after tax
    userBalanceOfSelectedNFT: 0,
    firstAvailableTokenId: null, // The first tokenId user owns of this type
    
    // [MODIFICADO] Adicionado para rastrear o melhor booster
    bestBoosterTokenId: 0n, // O ID do melhor booster do usuário
    bestBoosterBips: 0n, // O valor (BIPS) desse booster
    
    isDataLoading: false,
    isModalOpen: false, // For pool selection
};

/**
 * Main render function.
 * This creates the simple, centered swap box.
 */
async function renderSwapBoxInterface() {
    const el = document.getElementById('store-items-grid');
    if (!el) return;

    // 1. Render the main shell
    el.innerHTML = `
        <div class="swap-box-container">
            <div class="swap-box-header">
                <h3>Trade Boosters</h3>
                <p>Swap BKC for NFT Boosters, or vice-versa.</p>
            </div>
            
            <div id="swap-box-content">
                </div>

            <div id="swap-box-button-container">
                </div>
        </div>

        <div id="pool-select-modal" class="pool-modal ${TradeState.isModalOpen ? 'open' : ''}">
            <div class="pool-modal-content">
                <div class="pool-modal-header">
                    <h4>Select an Asset</h4>
                    <button class="pool-modal-close">&times;</button>
                </div>
                <div id="pool-modal-list">
                    </div>
            </div>
        </div>
    `;

    // 2. Render the inner content of the swap box
    await renderSwapPanels();
    renderExecuteButton();

    // 3. Render the modal content (hidden by default)
    renderPoolSelectorModal();
}

/**
 * Renders the "From" and "To" panels inside the swap box
 * based on the current tradeDirection.
 */
async function renderSwapPanels() {
    const contentEl = document.getElementById('swap-box-content');
    if (!contentEl) return;

    // Get the name/img of the selected asset
    const selectedTier = boosterTiers.find(t => t.boostBips === TradeState.selectedPoolBoostBips);
    
    let fromPanelHtml, toPanelHtml;

    // =================================================================
    // ### AJUSTE DO LOGO ###
    // O caminho foi alterado para o seu novo logo 3D.
    const bkcLogoPath = "assets/bkc_logo_3d.png"; //
    // =================================================================

    if (TradeState.tradeDirection === 'buy') {
        // ========== BUY (BKC -> NFT) ==========
        fromPanelHtml = renderPanel({
            label: "You Pay",
            tokenSymbol: "BKC",
            tokenImg: bkcLogoPath, // <-- Caminho ajustado
            amount: TradeState.isDataLoading ? "..." : (TradeState.buyPrice > 0n ? formatBigNumber(TradeState.buyPrice).toFixed(2) : "0.00"),
            balance: `Balance: ${formatBigNumber(State.currentUserBalance).toFixed(2)}`
        });
        
        toPanelHtml = renderPanel({
            label: "You Receive",
            tokenSymbol: selectedTier ? selectedTier.name : "Select Booster",
            tokenImg: selectedTier ? selectedTier.img : null,
            amount: selectedTier ? "1" : "0",
            isSelector: true
        });

    } else {
        // ========== SELL (NFT -> BKC) ==========
        fromPanelHtml = renderPanel({
            label: "You Sell",
            tokenSymbol: selectedTier ? selectedTier.name : "Select Booster",
            tokenImg: selectedTier ? selectedTier.img : null,
            amount: selectedTier ? "1" : "0",
            balance: `You have: ${TradeState.userBalanceOfSelectedNFT}`,
            isSelector: true
        });

        // [MODIFICADO] O 'details' agora mostra o preço bruto vs. o desconto do booster
        let sellDetails = null;
        if (TradeState.sellPrice > 0n) {
            const gross = formatBigNumber(TradeState.sellPrice).toFixed(2);
            if (TradeState.bestBoosterBips > 0n) {
                sellDetails = `(Gross: ${gross} - ${TradeState.bestBoosterBips / 100}% Booster Discount)`;
            } else {
                sellDetails = `(Gross: ${gross} - 10% Base Tax)`;
            }
        }

        toPanelHtml = renderPanel({
            label: "You Receive (Net)",
            tokenSymbol: "BKC",
            tokenImg: bkcLogoPath, // <-- Caminho ajustado
            amount: TradeState.isDataLoading ? "..." : (TradeState.netSellPrice > 0n ? formatBigNumber(TradeState.netSellPrice).toFixed(2) : "0.00"),
            details: sellDetails // Mostra o novo 'details'
        });
    }

    // Render the swap box with the two panels and the swap button
    contentEl.innerHTML = `
        ${fromPanelHtml}
        <div class="swap-arrow-button-wrapper">
            <button class="swap-arrow-btn">
                <i class="fa-solid fa-arrow-down"></i>
            </button>
        </div>
        ${toPanelHtml}
    `;
}

/**
 * Renders the main "Execute" button at the bottom.
 */
function renderExecuteButton() {
    const buttonEl = document.getElementById('swap-box-button-container');
    if (!buttonEl) return;

    let btnText = "Select a Booster";
    let isDisabled = true;

    if (TradeState.selectedPoolBoostBips !== null) {
        if (TradeState.tradeDirection === 'buy') {
            btnText = "Buy Booster";
            isDisabled = TradeState.buyPrice === 0n || TradeState.buyPrice > State.currentUserBalance;
        } else {
            btnText = "Sell Booster";
            isDisabled = TradeState.userBalanceOfSelectedNFT === 0 || TradeState.netSellPrice === 0n;
        }
    }

    buttonEl.innerHTML = `
        <button id="execute-trade-btn" class="execute-trade-btn" ${isDisabled ? 'disabled' : ''}>
            ${btnText}
        </button>
    `;
}

/**
 * Helper function to generate HTML for a single panel (From or To).
 */
function renderPanel({ label, tokenSymbol, tokenImg, amount, balance, details, isSelector = false }) {
    const tokenDisplay = tokenImg 
        ? `<img src="${tokenImg}" alt="${tokenSymbol}" /> ${tokenSymbol}`
        : tokenSymbol;

    const selectorClass = isSelector ? 'is-selector' : '';
    const selectorArrow = isSelector ? '<i class="fa-solid fa-chevron-down"></i>' : '';

    return `
        <div class="swap-panel">
            <div class="swap-panel-header">
                <span class="swap-label">${label}</span>
                <span class="swap-balance">${balance || ''}</span>
            </div>
            <div class="swap-panel-main">
                <div class="swap-amount">${amount}</div>
                <button class="token-selector-btn ${selectorClass}" ${!isSelector ? 'disabled' : ''}>
                    ${tokenDisplay}
                    ${selectorArrow}
                </button>
            </div>
            ${details ? `<div class="swap-panel-details">${details}</div>` : ''}
        </div>
    `;
}

/**
 * Renders the list of booster tiers inside the modal.
 */
function renderPoolSelectorModal() {
    const modalListEl = document.getElementById('pool-modal-list');
    if (!modalListEl) return;

    modalListEl.innerHTML = boosterTiers.map(tier => `
        <button class="pool-modal-item" data-boostbips="${tier.boostBips}">
            <img src="${tier.img}" alt="${tier.name}" />
            <div class="pool-modal-info">
                <h4>${tier.name}</h4>
                <span>+${tier.boostBips / 100}% Efficiency</span>
            </div>
        </button>
    `).join('');
}

/**
 * Fetches all necessary data for the selected pool and updates the state.
 */
async function loadDataForSelectedPool() {
    if (TradeState.selectedPoolBoostBips === null) {
        return; // Do nothing if no pool is selected
    }
    
    TradeState.isDataLoading = true;
    await renderSwapPanels(); // Show "..." loading state

    try {
        const boostBips = TradeState.selectedPoolBoostBips;

        // 1. Load user's boosters (needed for sell-side AND discount)
        await loadMyBoostersFromAPI();

        // 2. Filter for the selected tier (NFTs to SELL)
        const myTierBoosters = State.myBoosters.filter(b => b.boostBips === boostBips);
        TradeState.userBalanceOfSelectedNFT = myTierBoosters.length;
        TradeState.firstAvailableTokenId = myTierBoosters.length > 0 ? myTierBoosters[0].tokenId : null;

        // 3. [MODIFICADO] Encontra o MELHOR booster do usuário para o DESCONTO
        const bestBooster = State.myBoosters.reduce((best, current) => {
            return current.boostBips > best.boostBips ? current : best;
        }, { boostBips: 0n, tokenId: 0n }); // Default se não tiver boosters
        
        TradeState.bestBoosterTokenId = bestBooster.tokenId;
        TradeState.bestBoosterBips = bestBooster.boostBips;


        // 4. Get prices from the contract
        const [buyPrice, sellPrice] = await Promise.all([
            safeContractCall(State.nftBondingCurveContract, 'getBuyPrice', [boostBips], ethers.MaxUint256),
            safeContractCall(State.nftBondingCurveContract, 'getSellPrice', [boostBips], 0n)
        ]);

        TradeState.buyPrice = (buyPrice === ethers.MaxUint256) ? 0n : buyPrice;
        TradeState.sellPrice = sellPrice;

        // 5. [MODIFICADO] Calcula o Net Sell Price LENDO as taxas e descontos do CONTRATO
        // Chaves do '7_configure_fees.ts'
        const TAX_BIPS_KEY = "NFT_POOL_TAX_BIPS";
        
        // Pega a taxa base (1000) e o desconto do hub
        const [baseTaxBips, discountBips] = await Promise.all([
            safeContractCall(State.ecosystemManagerContract, 'getFee', [TAX_BIPS_KEY], 1000n),
            safeContractCall(State.ecosystemManagerContract, 'getBoosterDiscount', [TradeState.bestBoosterBips], 0n)
        ]);
        
        // Calcula a taxa final (Taxa Base - Desconto)
        const finalTaxBips = (baseTaxBips > discountBips) ? (baseTaxBips - discountBips) : 0n;
        const taxAmount = (sellPrice * finalTaxBips) / 10000n;
        TradeState.netSellPrice = sellPrice - taxAmount;
        
        // [ANTES] Estava hardcodado assim:
        // const TAX_BIPS = 1000n; // 10%
        // const taxAmount = (sellPrice * TAX_BIPS) / 10000n;
        // TradeState.netSellPrice = sellPrice - taxAmount;

    } catch (err) {
        console.error("Error loading pool data:", err);
        // showToast("Error loading pool data.", "error"); // showToast may not be available here
        TradeState.buyPrice = 0n;
        TradeState.sellPrice = 0n;
        TradeState.netSellPrice = 0n;
    } finally {
        TradeState.isDataLoading = false;
        // Re-render all components with the new data
        await renderSwapPanels();
        renderExecuteButton();
    }
}

/**
 * Toggles the modal's visibility.
 */
function toggleModal(isOpen) {
    TradeState.isModalOpen = isOpen;
    const modalEl = document.getElementById('pool-select-modal');
    if (modalEl) {
        modalEl.classList.toggle('open', isOpen);
    }
}

// --- LISTENERS ---

function setupStorePageListeners() {
    // Use a persistent listener on the main store element
    DOMElements.store.addEventListener('click', async (e) => {
        
        // --- Swap Direction Button ---
        const swapBtn = e.target.closest('.swap-arrow-btn');
        if (swapBtn) {
            e.preventDefault();
            TradeState.tradeDirection = (TradeState.tradeDirection === 'buy') ? 'sell' : 'buy';
            await renderSwapPanels();
            renderExecuteButton();
            return;
        }

        // --- Open Pool Selector Modal ---
        const selectorBtn = e.target.closest('.token-selector-btn.is-selector');
        if (selectorBtn) {
            e.preventDefault();
            toggleModal(true);
            return;
        }

        // --- Close Pool Selector Modal ---
        const closeBtn = e.target.closest('.pool-modal-close');
        if (closeBtn) {
            e.preventDefault();
            toggleModal(false);
            return;
        }

        // --- Select a Pool from Modal ---
        const poolItemBtn = e.target.closest('.pool-modal-item');
        if (poolItemBtn) {
            e.preventDefault();
            TradeState.selectedPoolBoostBips = BigInt(poolItemBtn.dataset.boostbips);
            toggleModal(false); // Close modal
            await loadDataForSelectedPool(); // Load data and re-render
            return;
        }

        // --- Execute Trade Button ---
        const executeBtn = e.target.closest('#execute-trade-btn');
        if (executeBtn) {
            e.preventDefault();
            
            if (TradeState.tradeDirection === 'buy') {
                // [MODIFICADO] Passa o ID do booster para a compra (para o pStake check)
                const success = await executeBuyBooster(
                    TradeState.selectedPoolBoostBips, 
                    TradeState.buyPrice,
                    TradeState.bestBoosterTokenId, // Passa o booster para o pStake
                    executeBtn
                );
                if (success) {
                    await loadDataForSelectedPool(); // Reload data
                }
            } else {
                // [MODIFICADO] Passa o ID do booster para o DESCONTO
                const success = await executeSellBooster(
                    TradeState.firstAvailableTokenId, // O NFT que você está vendendo
                    TradeState.bestBoosterTokenId,  // O NFT que você está usando para o desconto
                    executeBtn
                );
                if (success) {
                    await loadDataForSelectedPool(); // Reload data
                }
            }
            return;
        }
    });
}

// Initialize listeners only once
if (!DOMElements.store._listenersInitialized) {
    setupStorePageListeners();
    DOMElements.store._listenersInitialized = true;
}

// Export the main render function
export const StorePage = {
    async render(isUpdate = false) {
        // [MODIFICADO] Precisamos garantir que o hub (EcosystemManager) esteja carregado
        // para ler as taxas.
        if (!State.ecosystemManagerContract) {
             const { initEcosystemManager } = await import('../modules/contracts.js');
             await initEcosystemManager(State.provider);
        }
        
        await renderSwapBoxInterface();
        
        // Load data for the default or previously selected pool
        if (TradeState.selectedPoolBoostBips === null && boosterTiers.length > 0) {
            TradeState.selectedPoolBoostBips = boosterTiers[0].boostBips; // Default to first
        }
        await loadDataForSelectedPool();
    }
}