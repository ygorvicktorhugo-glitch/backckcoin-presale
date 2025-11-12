// pages/StorePage.js
// Gerencia a página "NFT Trading Pool" (Store), permitindo aos usuários
// comprar e vender Booster NFTs usando um AMM.

// --- IMPORTAÇÕES E CONFIGURAÇÕES ---
const ethers = window.ethers;

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
import { loadUserData, loadMyBoostersFromAPI, safeContractCall } from '../modules/data.js';
import { executeBuyBooster, executeSellBooster } from '../modules/transactions.js';
import { formatBigNumber, renderLoading, renderError } from '../utils.js';
import { boosterTiers, addresses } from '../config.js';

// --- ESTADO LOCAL DA PÁGINA (TradeState) ---
// Objeto que rastreia o estado da UI de negociação
const TradeState = {
    tradeDirection: 'buy', // 'buy' (BKC -> NFT) ou 'sell' (NFT -> BKC)
    selectedPoolBoostBips: null, // O 'ativo' selecionado (ex: 5000 para Diamond)
    
    // Dados para o pool selecionado
    buyPrice: 0n,
    sellPrice: 0n,
    netSellPrice: 0n, // Preço de venda líquido (após taxas/descontos)
    userBalanceOfSelectedNFT: 0,
    firstAvailableTokenId: null, // O primeiro tokenId que o usuário POSSUI para VENDER
    firstAvailableTokenIdForBuy: null, // O primeiro tokenId que o POOL POSSUI para COMPRA
    
    // Rastreia o melhor booster do usuário para descontos
    bestBoosterTokenId: 0n, 
    bestBoosterBips: 0n, 
    
    isDataLoading: false,
    isModalOpen: false, // Para o modal de seleção de pool
};

// --- INDEXADOR LEVE (CLIENT-SIDE) ---
/**
 * Encontra o primeiro _tokenId disponível que o contrato AMM (Pool) possui 
 * para um determinado tier (_boostBips).
 * @param {bigint} boostBips - O tier de boost a ser procurado (ex: 5000n)
 * @returns {bigint | null} O primeiro _tokenId encontrado ou null
 */
async function _fetchFirstAvailableTokenIdForBuy(boostBips) {
    if (!State.rewardBoosterContract || !addresses.nftLiquidityPool) return null;

    const poolAddress = addresses.nftLiquidityPool;
    const nftContract = State.rewardBoosterContract;

    try {
        console.log(`[Indexer] Procurando estoque para ${boostBips} bips...`);
        
        // 1. Encontra todos os NFTs transferidos PARA o pool
        const transferInFilter = nftContract.filters.Transfer(null, poolAddress);
        const fromBlock = Math.max(0, (await State.provider.getBlockNumber()) - 100000); 
        const inEvents = await nftContract.queryFilter(transferInFilter, fromBlock, 'latest');
        
        // 2. Encontra todos os NFTs transferidos PARA FORA do pool
        const transferOutFilter = nftContract.filters.Transfer(poolAddress, null);
        const outEvents = await nftContract.queryFilter(transferOutFilter, fromBlock, 'latest');

        // 3. Processa os eventos para saber o "estoque"
        const ownedTokenIds = new Set();
        for (const event of inEvents) {
            ownedTokenIds.add(event.args.tokenId.toString());
        }
        for (const event of outEvents) {
            ownedTokenIds.delete(event.args.tokenId.toString());
        }

        const availableTokenIds = Array.from(ownedTokenIds);
        console.log(`[Indexer] Pool possui ${availableTokenIds.length} NFTs no total.`);

        // 4. Verifica o tier de cada NFT em estoque
        for (const tokenId of availableTokenIds) {
            try {
                const tokenBips = await safeContractCall(nftContract, 'boostBips', [BigInt(tokenId)], 0n);
                if (tokenBips === boostBips) {
                    console.log(`[Indexer] Encontrado: ${tokenId} para ${boostBips} bips.`);
                    return BigInt(tokenId); // Encontramos um!
                }
            } catch (e) {
                // Ignore.
            }
        }
        
        console.log(`[Indexer] Nenhum token de ${boostBips} bips encontrado em estoque.`);
        return null; // Nenhum encontrado

    } catch (err) {
        console.error("Falha no indexador leve:", err);
        return null;
    }
}


// --- RENDERIZAÇÃO DA UI (SWAP BOX) ---
// Funções que constroem o HTML da caixa de negociação.

/**
 * Renderiza a estrutura principal (shell) da Swap Box e do Modal.
 */
async function renderSwapBoxInterface() {
    const el = document.getElementById('store-items-grid');
    if (!el) return;

    // 1. Renderiza a estrutura principal
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

    // 2. Renderiza o conteúdo interno da swap box
    await renderSwapPanels();
    renderExecuteButton();

    // 3. Renderiza o conteúdo do modal (oculto)
    renderPoolSelectorModal();
}

/**
 * Renderiza os painéis "From" e "To" com base na direção da troca.
 */
async function renderSwapPanels() {
    const contentEl = document.getElementById('swap-box-content');
    if (!contentEl) return;

    const selectedTier = boosterTiers.find(t => t.boostBips === TradeState.selectedPoolBoostBips);
    let fromPanelHtml, toPanelHtml;
    const bkcLogoPath = "assets/bkc_logo_3d.png"; 

    if (TradeState.tradeDirection === 'buy') {
        // ========== COMPRA (BKC -> NFT) ==========
        fromPanelHtml = renderPanel({
            label: "You Pay",
            tokenSymbol: "BKC",
            tokenImg: bkcLogoPath,
            amount: TradeState.isDataLoading ? "..." : (TradeState.buyPrice > 0n ? formatBigNumber(TradeState.buyPrice).toFixed(2) : "0.00"),
            balance: `Balance: ${formatBigNumber(State.currentUserBalance).toFixed(2)}`
        });
        
        toPanelHtml = renderPanel({
            label: "You Receive",
            tokenSymbol: selectedTier ? selectedTier.name : "Select Booster",
            tokenImg: selectedTier ? selectedTier.img : null,
            amount: selectedTier ? "1" : "0",
            balance: (selectedTier && TradeState.firstAvailableTokenIdForBuy === null && !TradeState.isDataLoading) ? 'Sold Out' : '',
            isSelector: true
        });

    } else {
        // ========== VENDA (NFT -> BKC) ==========
        fromPanelHtml = renderPanel({
            label: "You Sell",
            tokenSymbol: selectedTier ? selectedTier.name : "Select Booster",
            tokenImg: selectedTier ? selectedTier.img : null,
            amount: selectedTier ? "1" : "0",
            balance: `You have: ${TradeState.userBalanceOfSelectedNFT}`,
            isSelector: true
        });

        // Detalhes do preço de venda (Taxas e Descontos)
        let sellDetails = null;
        if (TradeState.sellPrice > 0n) {
            const gross = formatBigNumber(TradeState.sellPrice).toFixed(2);
            if (TradeState.bestBoosterBips > 0n) {
                sellDetails = `(Gross: ${gross} - ${TradeState.bestBoosterBips / 100}% Booster Discount)`;
            } else {
                const baseTaxBips = State.ecosystemManagerContract ? await safeContractCall(State.ecosystemManagerContract, 'getFee', ["NFT_POOL_TAX_BIPS"], 1000n) : 1000n;
                sellDetails = `(Gross: ${gross} - ${Number(baseTaxBips) / 100}% Base Tax)`;
            }
        }

        toPanelHtml = renderPanel({
            label: "You Receive (Net)",
            tokenSymbol: "BKC",
            tokenImg: bkcLogoPath, 
            amount: TradeState.isDataLoading ? "..." : (TradeState.netSellPrice > 0n ? formatBigNumber(TradeState.netSellPrice).toFixed(2) : "0.00"),
            details: sellDetails
        });
    }

    // Renderiza o HTML final da caixa
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
 * Renderiza o botão principal de execução (Comprar, Vender, Saldo Insuficiente, etc.)
 */
function renderExecuteButton() {
    const buttonEl = document.getElementById('swap-box-button-container');
    if (!buttonEl) return;

    let btnText = "Select a Booster";
    let isDisabled = true;
    let isInsufficientBalance = false; // Flag para saldo insuficiente

    if (TradeState.selectedPoolBoostBips !== null) {
        if (TradeState.tradeDirection === 'buy') {
            
            // **********************************************
            // ### INVERSÃO DE PRIORIDADE DE VERIFICAÇÃO ###
            // Priorizamos o Saldo Insuficiente sobre o Sold Out para mostrar o CTA.
            // **********************************************
            
            if (TradeState.buyPrice === 0n) {
                btnText = "Buy Booster";
                isDisabled = true;
            } 
            // 1. Checa Saldo Insuficiente (Prioridade Máxima)
            else if (TradeState.buyPrice > State.currentUserBalance) {
                btnText = "Insufficient BKC Balance";
                isDisabled = true;
                isInsufficientBalance = true; 
            } 
            // 2. Checa Estoque (Só executa se o saldo for suficiente ou se o cheque acima foi ignorado)
            else if (TradeState.firstAvailableTokenIdForBuy === null) {
                btnText = "Sold Out";
                isDisabled = true;
                isInsufficientBalance = false; // Garante que a flag seja desativada se Sold Out
            }
            // 3. Pronto para Comprar
            else {
                btnText = "Buy Booster";
                isDisabled = false;
            }
        } else {
            // Lógica de Venda
            if (TradeState.userBalanceOfSelectedNFT === 0) {
                btnText = "You have no such Booster";
                isDisabled = true;
            } else if (TradeState.netSellPrice === 0n) {
                btnText = "Sell Booster";
                isDisabled = true;
            } else {
                btnText = "Sell Booster";
                isDisabled = false;
            }
        }
    }

    // --- LÓGICA DE RENDERIZAÇÃO DO BOTÃO ---
    // Se a flag 'isInsufficientBalance' estiver ativa, mostra o link "Buy $BKC"
    if (isInsufficientBalance) {
        const buyBkcLink = addresses.mainLPPairAddress || '#';
        // Ajustamos os estilos inline para garantir a cor e a visibilidade do padrão âmbar
        buttonEl.innerHTML = `
            <a href="${buyBkcLink}" rel="noopener noreferrer" 
               class="execute-trade-btn" 
               style="background: #f59e0b; color: #18181b; text-decoration: none; display: flex; align-items: center; justify-content: center; font-weight: 700; text-shadow: none;">
                <i class="fa-solid fa-shopping-cart mr-2"></i>
                Buy $BKC
            </a>
        `;
    } else {
        // Caso contrário, mostra o botão padrão (habilitado ou desabilitado)
        buttonEl.innerHTML = `
            <button id="execute-trade-btn" class="execute-trade-btn" ${isDisabled ? 'disabled' : ''}>
                ${btnText}
            </button>
        `;
    }
}

/**
 * Função helper para renderizar um painel (From ou To).
 */
function renderPanel({ label, tokenSymbol, tokenImg, amount, balance, details, isSelector = false }) {
    const tokenDisplay = tokenImg 
        ? `<img src="${tokenImg}" alt="${tokenSymbol}" /> ${tokenSymbol}`
        : tokenSymbol;

    const selectorClass = isSelector ? 'is-selector' : '';
    const selectorArrow = isSelector ? '<i class="fa-solid fa-chevron-down"></i>' : '';
    const balanceClass = (balance === 'Sold Out') ? 'swap-balance sold-out' : 'swap-balance';

    return `
        <div class="swap-panel">
            <div class="swap-panel-header">
                <span class="swap-label">${label}</span>
                <span class="${balanceClass}">${balance || ''}</span>
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
 * Renderiza a lista de boosters dentro do modal de seleção.
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

// --- CARREGAMENTO DE DADOS (DATA FETCHING) ---

/**
 * Busca todos os dados necessários para o pool selecionado e atualiza o estado.
 */
async function loadDataForSelectedPool() {
    if (TradeState.selectedPoolBoostBips === null) {
        return; // Não faz nada se nenhum pool estiver selecionado
    }
    
    TradeState.isDataLoading = true;
    TradeState.firstAvailableTokenIdForBuy = null; 
    await renderSwapPanels(); 
    renderExecuteButton(); 

    try {
        const boostBips = TradeState.selectedPoolBoostBips;

        // 1. Carrega os boosters do usuário (necessário para Venda e Desconto)
        await loadMyBoostersFromAPI();

        // 2. Filtra os boosters do usuário para o tier selecionado (para Vender)
        const myTierBoosters = State.myBoosters.filter(b => b.boostBips === boostBips);
        TradeState.userBalanceOfSelectedNFT = myTierBoosters.length;
        TradeState.firstAvailableTokenId = myTierBoosters.length > 0 ? myTierBoosters[0].tokenId : null;

        // 3. Encontra o MELHOR booster do usuário (para Desconto)
        const bestBooster = State.myBoosters.reduce((best, current) => {
            return current.boostBips > best.boostBips ? current : best;
        }, { boostBips: 0n, tokenId: 0n }); 
        
        TradeState.bestBoosterTokenId = bestBooster.tokenId;
        TradeState.bestBoosterBips = bestBooster.boostBips;

        // 4. (INDEXADOR) Encontra um NFT no estoque do pool (para Comprar)
        const tokenIdForBuy = await _fetchFirstAvailableTokenIdForBuy(boostBips);
        TradeState.firstAvailableTokenIdForBuy = tokenIdForBuy;

        // 5. Busca os preços de compra e venda do contrato
        const [buyPrice, sellPrice] = await Promise.all([
            safeContractCall(State.nftBondingCurveContract, 'getBuyPrice', [boostBips], ethers.MaxUint256),
            safeContractCall(State.nftBondingCurveContract, 'getSellPrice', [boostBips], 0n)
        ]);

        TradeState.buyPrice = (buyPrice === ethers.MaxUint256) ? 0n : buyPrice; 
        TradeState.sellPrice = sellPrice;

        // 6. Calcula o preço líquido de venda (com taxas e descontos)
        const TAX_BIPS_KEY = "NFT_POOL_TAX_BIPS";
        const [baseTaxBips, discountBips] = await Promise.all([
            safeContractCall(State.ecosystemManagerContract, 'getFee', [TAX_BIPS_KEY], 1000n),
            safeContractCall(State.ecosystemManagerContract, 'getBoosterDiscount', [TradeState.bestBoosterBips], 0n)
        ]);
        
        const finalTaxBips = (baseTaxBips > discountBips) ? (baseTaxBips - discountBips) : 0n;
        const taxAmount = (sellPrice * finalTaxBips) / 10000n;
        TradeState.netSellPrice = sellPrice - taxAmount;

    } catch (err) {
        console.error("Error loading pool data:", err);
        TradeState.buyPrice = 0n;
        TradeState.sellPrice = 0n;
        TradeState.netSellPrice = 0n;
        TradeState.firstAvailableTokenIdForBuy = null; // Garante que não pode comprar
    } finally {
        TradeState.isDataLoading = false;
        // Re-renderiza tudo com os novos dados
        await renderSwapPanels();
        renderExecuteButton();
    }
}

/**
 * Alterna a visibilidade do modal de seleção.
 */
function toggleModal(isOpen) {
    TradeState.isModalOpen = isOpen;
    const modalEl = document.getElementById('pool-select-modal');
    if (modalEl) {
        modalEl.classList.toggle('open', isOpen);
    }
}

// --- SETUP DE LISTENERS ---
// Configura os listeners de evento para a página.

function setupStorePageListeners() {
    // Usa um listener persistente no elemento principal (delegação de eventos)
    DOMElements.store.addEventListener('click', async (e) => {
        
        // --- Botão de Inverter Direção (Swap) ---
        const swapBtn = e.target.closest('.swap-arrow-btn');
        if (swapBtn) {
            e.preventDefault();
            TradeState.tradeDirection = (TradeState.tradeDirection === 'buy') ? 'sell' : 'buy';
            await renderSwapPanels();
            renderExecuteButton();
            return;
        }

        // --- Abrir Modal de Seleção de Pool ---
        const selectorBtn = e.target.closest('.token-selector-btn.is-selector');
        if (selectorBtn) {
            e.preventDefault();
            toggleModal(true);
            return;
        }

        // --- Fechar Modal de Seleção ---
        const closeBtn = e.target.closest('.pool-modal-close');
        if (closeBtn) {
            e.preventDefault();
            toggleModal(false);
            return;
        }

        // --- Selecionar um Pool do Modal ---
        const poolItemBtn = e.target.closest('.pool-modal-item');
        if (poolItemBtn) {
            e.preventDefault();
            TradeState.selectedPoolBoostBips = BigInt(poolItemBtn.dataset.boostbips);
            toggleModal(false); // Fecha o modal
            await loadDataForSelectedPool(); // Carrega os dados do pool
            return;
        }

        // --- Botão de Executar Negociação ---
        const executeBtn = e.target.closest('#execute-trade-btn');
        if (executeBtn) {
            e.preventDefault();
            
            if (TradeState.tradeDirection === 'buy') {
                // Lógica de Compra
                if (TradeState.firstAvailableTokenIdForBuy === null) {
                    console.error("Tentativa de compra, mas nenhum Token ID está disponível.");
                    return;
                }
                
                const success = await executeBuyBooster(
                    TradeState.selectedPoolBoostBips, 
                    TradeState.buyPrice,
                    TradeState.bestBoosterTokenId,
                    TradeState.firstAvailableTokenIdForBuy, 
                    executeBtn
                );
                if (success) {
                    await loadDataForSelectedPool(); // Recarrega os dados
                }
            } else {
                // Lógica de Venda
                const success = await executeSellBooster(
                    TradeState.firstAvailableTokenId, // O NFT que você está vendendo
                    TradeState.bestBoosterTokenId,  // O NFT que você está usando para o desconto
                    executeBtn
                );
                if (success) {
                    await loadDataForSelectedPool(); // Recarrega os dados
                }
            }
            return;
        }
    });
}

// Inicializa os listeners apenas uma vez
if (!DOMElements.store._listenersInitialized) {
    setupStorePageListeners();
    DOMElements.store._listenersInitialized = true;
}

// --- OBJETO PRINCIPAL DA PÁGINA (StorePage) ---
// Exporta a função 'render' principal que é chamada pelo app.js

export const StorePage = {
    async render(isUpdate = false) {
        // Garante que os contratos necessários estão carregados
        if (!State.ecosystemManagerContract || !State.rewardBoosterContract) {
             const { initEcosystemManager, initRewardBoosterContract } = await import('../modules/contracts.js');
             await initEcosystemManager(State.provider);
             await initRewardBoosterContract(State.provider); 
        }
        
        await renderSwapBoxInterface();
        
        // Carrega dados para o pool padrão ou o último selecionado
        if (TradeState.selectedPoolBoostBips === null && boosterTiers.length > 0) {
            TradeState.selectedPoolBoostBips = boosterTiers[0].boostBips; // Padrão
        }
        await loadDataForSelectedPool();
    }
}