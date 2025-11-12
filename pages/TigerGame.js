// pages/TigerGame.js - Versão V9: Lógica de Oráculo Assíncrono V3
// O nome do arquivo permanece o mesmo, mas a lógica interna mudou.

import { State } from '../state.js';
import { loadUserData } from '../modules/data.js';
import { formatBigNumber, formatAddress, formatPStake } from '../utils.js';
import { showToast } from '../ui-feedback.js';
import { addresses } from '../config.js';
import { safeContractCall } from '../modules/data.js';

const ethers = window.ethers;

// ============================================
// I. GAMIFICATION & GAME STATE
// ============================================

const gameState = {
    currentLevel: 1,
    currentXP: 0,
    xpPerLevel: 1000,
    totalActivations: 0, 
    achievements: [
        { id: 'first-activation', name: 'The Miner', desc: 'Complete your first 10 activations.', unlocked: false, requirement: 10 },
        { id: 'hundred-activations', name: 'The Veteran', desc: 'Complete 100 total activations.', unlocked: false, requirement: 100 },
        { id: 'bonus-master', name: 'Bonus Master', desc: 'Unlock the x100 Bonus.', unlocked: false, requirement: 100 },
    ],
    // ✅ CORRIGIDO: Agora rastreia apenas um saldo de pool
    poolBalance: 0n,
    isActivating: false, 
    lastBonus: 0,
};

// ... (Funções de load/save gamestate mantidas) ...

// ============================================
// II. CONFIGURAÇÕES E CONSTANTES
// ============================================

// ✅ CORRIGIDO: Apenas para referência da UI, não mais para IDs de contrato
const PRIZE_TIERS_INFO = [
    { multiplier: 1, chance: '1 in 3 (33.3%)' }, 
    { multiplier: 10, chance: '1 in 10 (10%)' },
    { multiplier: 100, chance: '1 in 100 (1%)' },
];

// ============================================
// III. LÓGICA DE CONTRATO E CÁLCULO
// ============================================

/**
 * ✅ NOVO: Carrega o saldo da Piscina Única
 */
async function loadPoolBalance() {
    // Nota: O State.actionsManagerContract agora deve apontar para o FortunePoolV3
    if (!State.actionsManagerContract) return;
    try {
        const balance = await safeContractCall(
            State.actionsManagerContract, 
            'prizePoolBalance', // Lendo a variável de piscina única
            [], 
            0n
        );
        gameState.poolBalance = balance;
        TigerGamePage.updatePoolDisplay(); 
    } catch (e) {
        console.error("Failed to load pool balance:", e);
    }
}


/**
 * ✅ NOVO: Esta função é chamada pelo OUVINTE DE EVENTOS (em main.js/state.js)
 * quando o evento 'GameFulfilled' é recebido do Oráculo.
 */
function handleGameFulfilled(gameId, user, prizeWon, rolls) {
    // Verifica se o evento é para o usuário atual
    if (user.toLowerCase() !== State.userAddress.toLowerCase()) {
        return;
    }
    
    console.log(`[TigerGame] Recebido resultado do Oráculo para Jogo ${gameId}: Ganhou ${prizeWon}`);
    
    // Determina o multiplicador mais alto
    let highestMultiplier = 0;
    const prizeWonFloat = formatBigNumber(prizeWon);

    if (prizeWonFloat > 0) {
        // Tenta inferir o multiplicador (pode ser impreciso se os multiplicadores mudarem)
        // Uma lógica melhor seria o contrato emitir o tierId vencedor.
        if (prizeWonFloat >= 100) highestMultiplier = 100; // Suposição
        else if (prizeWonFloat >= 10) highestMultiplier = 10; // Suposição
        else if (prizeWonFloat >= 3) highestMultiplier = 3; // Suposição
        else highestMultiplier = 1; // Suposição
    }

    const prizeData = {
        totalPrizeWon: prizeWon,
        highestMultiplier: highestMultiplier,
        rolls: rolls // ex: [1, 7, 52]
    };

    // Inicia a sequência de animação com o resultado
    runActivationSequence(prizeData);
}

// ============================================
// IV. ANIMAÇÕES DE ATIVAÇÃO
// ============================================

async function runActivationSequence(prizeData) {
    const activationArea = document.getElementById('activationArea');
    const activationCore = document.getElementById('activationCore');
    const resultDisplay = document.getElementById('resultDisplay');
    
    if (!activationArea || !activationCore || !resultDisplay) return;

    // 1. Inicia a Ativação (se ainda não estiver ativa)
    // (O estado 'isActivating' é definido em executePurchase)
    resultDisplay.innerHTML = `<h3>ORACLE IS PROCESSING...</h3>`;
    resultDisplay.classList.remove('win', 'lose');
    activationCore.classList.add('activating'); 
    
    // Mostra "Processando" por um momento antes de revelar o resultado
    await new Promise(resolve => setTimeout(resolve, 3000)); 

    // 2. Para a Animação
    activationCore.classList.remove('activating');

    // 3. Mostra o Resultado
    const totalPrizeWonFloat = formatBigNumber(prizeData.totalPrizeWon);
    
    if (prizeData.highestMultiplier > 0) {
        resultDisplay.classList.add('win');
        resultDisplay.innerHTML = `<h3>🎉 BONUS UNLOCKED! x${prizeData.highestMultiplier}! You received ${totalPrizeWonFloat.toLocaleString('en-US', { maximumFractionDigits: 2 })} $BKC!</h3>`;
        activationCore.classList.add('win-pulse');
    } else {
        resultDisplay.classList.add('lose');
        resultDisplay.innerHTML = `<h3>Purchase Registered. No Bonus Unlocked this time.</h3>`;
        activationCore.classList.add('lose-pulse');
    }

    await new Promise(resolve => setTimeout(resolve, 2500)); 
    activationCore.classList.remove('win-pulse', 'lose-pulse');
    resultDisplay.classList.remove('win', 'lose');
    resultDisplay.innerHTML = `<h3>Ready to Activate</h3>`;

    // 4. Feedback final (Toast e Gamificação)
    if (prizeData.totalPrizeWon > 0n) {
        if (prizeData.highestMultiplier > 1) {
            showToast(`🎉 ORACLE RESULT: You unlocked a x${prizeData.highestMultiplier} reward!`, 'success');
        } else {
            showToast(`ORACLE RESULT: You received a 1x stability reward.`, 'info');
        }
    } else {
        showToast('ORACLE RESULT: Purchase registered. Better luck next time!', 'info');
    }
    
    // 5. Atualiza Estado (AGORA, após o resultado)
    gameState.isActivating = false;
    TigerGamePage.updateUIState();
    gameState.totalActivations++;
    TigerGamePage.addXP(100); 
    TigerGamePage.checkAchievements(totalPrizeWonFloat, prizeData.highestMultiplier);
    await loadUserData(); 
    await loadPoolBalance(); 
}

function stopActivationOnError() {
    const activationCore = document.getElementById('activationCore');
    const resultDisplay = document.getElementById('resultDisplay');
    
    if (activationCore) {
        activationCore.classList.remove('activating');
        activationCore.classList.add('lose-pulse');
    }
    if (resultDisplay) {
        resultDisplay.classList.add('lose');
        resultDisplay.innerHTML = '<h3>⚠️ TRANSACTION FAILED!</h3>';
    }
    
    // Reseta o estado
    gameState.isActivating = false;
    TigerGamePage.updateUIState();
}


// ============================================
// V. FUNÇÃO PRINCIPAL DE "COMPRA"
// ============================================

/**
 * ✅ ATUALIZADO: Agora envia a Tx 1 (Participate) e espera
 * que o Oráculo envie o resultado (Tx 2).
 */
async function executePurchase() {
    if (gameState.isActivating) return;
    if (!State.isConnected) {
        showToast("Connect wallet first.", "error");
        return;
    }
    if (!State.ecosystemManagerContract || !State.bkcTokenContract || !State.actionsManagerContract) {
        showToast("Contracts are still loading. Please wait a moment and try again.", "error");
        return;
    }

    const commitInput = document.getElementById('commitInput'); 
    const activateButton = document.getElementById('activateButton'); 
    const amount = parseFloat(commitInput?.value) || 0;

    if (amount <= 0 || isNaN(amount)) {
        showToast("Please enter a valid amount to commit.", "error"); 
        return;
    }
    
    const amountWei = ethers.parseEther(amount.toString());
    
    if (amountWei > State.currentUserBalance) {
        showToast("Insufficient BKC balance for this amount.", "error");
        TigerGamePage.updateUIState();
        return;
    }
    
    // ✅ NOVO: Busca e verifica a taxa do Oráculo (em ETH/BNB)
    const oracleFeeWei = State.systemData.oracleFeeInWei ? BigInt(State.systemData.oracleFeeInWei) : 0n;
    if (oracleFeeWei <= 0n) {
        showToast("Oracle Fee is not set. Please contact support.", "error");
        return;
    }
    const userNativeBalance = State.currentUserNativeBalance || 0n;
    if (userNativeBalance < oracleFeeWei) {
        showToast(`Insufficient native balance. You need at least ${ethers.formatEther(oracleFeeWei)} ETH/BNB to pay the oracle gas fee.`, "error");
        return;
    }


    gameState.isActivating = true;
    if (activateButton) {
        activateButton.disabled = true;
        activateButton.innerHTML = '<div class="loader inline-block"></div> ACTIVATING PURCHASE...'; 
    }

    try {
        // 1. Verificação de pStake (Sem alteração)
        const [ignoredFee, pStakeReq] = await safeContractCall(
            State.ecosystemManagerContract, 
            'getServiceRequirements', 
            ["FORTUNE_POOL_SERVICE"], // Chave do serviço
            [0n, 0n]
        );
        if (State.userTotalPStake < pStakeReq) {
            throw new Error(`PStake requirement failed validation. Required: ${formatPStake(pStakeReq)}`);
        }
        
        // 2. Aprovação (Sem alteração)
        showToast(`Approving ${amount.toFixed(2)} $BKC for activation...`, "info");
        const approveTx = await State.bkcTokenContract.approve(addresses.actionsManager, amountWei);
        await approveTx.wait();
        showToast('Approval successful! Requesting game...', "success");
        
        // 3. Executa a função 'participate' (Tx 1)
        const boosterId = State.userBoosterId || 0n;
        
        // ✅ ATUALIZADO: Envia a taxa do Oráculo (ETH/BNB) como 'value'
        const playTx = await State.actionsManagerContract.participate(
            amountWei, 
            { value: oracleFeeWei }
        );
        
        // A animação de "processando" começa aqui
        const activationArea = document.getElementById('activationArea');
        const activationCore = document.getElementById('activationCore');
        const resultDisplay = document.getElementById('resultDisplay');
        if (activationCore) activationCore.classList.add('activating');
        if (resultDisplay) resultDisplay.innerHTML = `<h3>REQUESTING ORACLE...</h3>`;

        await playTx.wait();
        
        // 4. ✅ ATUALIZADO: Sucesso da Tx 1
        // Não processamos o resultado, apenas confirmamos a requisição.
        showToast("✅ Game Requested! The Oracle is processing your result. (Est. 1-2 min)", "success");
        if (resultDisplay) resultDisplay.innerHTML = `<h3>WAITING FOR ORACLE...</h3>`;
        // O estado 'isActivating' permanece 'true' até o Oráculo responder

    } catch (error) {
        console.error("Activation error:", error);
        let errorMessage = error.reason || error.message || 'Transaction reverted.';
        if (errorMessage.includes("pStake requirement failed")) {
            errorMessage = "Insufficient pStake requirement. Delegate more BKC!";
        } else if (errorMessage.includes("transfer amount exceeds balance")) {
            errorMessage = "Insufficient BKC balance.";
        } else if (errorMessage.includes("Invalid native fee")) {
            errorMessage = "Invalid Oracle Fee. Please refresh the page.";
        }
        showToast(`Activation Failed: ${errorMessage}`, "error");
        stopActivationOnError(); // Reseta a UI
    } 
    // ✅ REMOVIDO: O 'finally' foi removido. O 'isActivating' só é definido como 'false'
    // quando o Oráculo responde (em handleGameFulfilled).
}


// ============================================
// VI. PAGE COMPONENT EXPORT (UI Redesenhada)
// ============================================

export const TigerGamePage = {
    
    render(isActive) {
        if (!isActive) return;

        const pageContainer = document.getElementById('actions');
        if (!pageContainer) {
            console.error("Page container 'actions' not found.");
            return;
        }

        // ✅ CORRIGIDO: HTML simplificado para Piscina Única
        const htmlContent = `
            <div class="tiger-game-wrapper">
                <header class="tiger-header">
                    <div class="header-top">
                        <h1 class="game-title">✨ BKC REWARD GENERATOR</h1>
                        <div class="legacy-badge">
                            <span class="legacy-icon">🛠️</span>
                            <span class="legacy-level">Lvl <span id="currentLevel">${gameState.currentLevel}</span></span>
                        </div>
                    </div>
                    
                    <div class="legacy-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" id="progressFill"></div>
                        </div>
                        <span class="progress-text" id="progressText">${gameState.currentXP} / ${gameState.xpPerLevel} XP</span>
                    </div>

                    <div class="pools-info">
                        <div class="pool-item" title="Chance de 3x, 10x, ou 100x" style="grid-column: span 3; background: rgba(0, 163, 255, 0.05); border-color: var(--tiger-accent-blue);">
                            <span class="pool-label">TOTAL PRIZE POOL</span>
                            <span class="pool-value" id="totalPool" style="color: var(--tiger-accent-blue); font-size: 1.25rem;">0.00</span>
                        </div>
                    </div>
                </header>

                <section class="tiger-game-area activation-area" id="activationArea">
                    <div class="activation-core" id="activationCore">
                        <div class="core-center">
                            <img src="./assets/bkc_logo_3d.png" alt="BKC" />
                        </div>
                        <div class="core-pulse-1"></div>
                        <div class="core-pulse-2"></div>
                    </div>

                    <div class="result-display" id="resultDisplay">
                        <h3>Ready to Activate</h3>
                    </div>
                </section>

                <section class="tiger-control-panel">
                    <div class="wager-section">
                        <label for="commitInput" class="control-label">COMMITMENT AMOUNT</label>
                        <div class="wager-input-group">
                            <input type="number" id="commitInput" class="wager-input" placeholder="0.00" min="0.01" step="any">
                            <span class="currency">$BKC</span>
                        </div>
                        <div class="quick-bets">
                            <button class="quick-bet-btn" data-action="add" data-value="1000">+1K</button>
                            <button class="quick-bet-btn" data-action="add" data-value="100">+100</button>
                            <button class="quick-bet-btn" data-action="add" data-value="10">+10</button>
                            <button class="quick-bet-btn" data-action="add" data-value="1">+1</button>
                            <button class="quick-bet-btn" data-action="add" data-value="0.1">+0.1</button>
                            <button class="quick-bet-btn" data-action="add" data-value="0.01">+0.01</button>
                            <button class="quick-bet-btn reset-btn" data-action="reset">RESET</button>
                        </div>
                    </div>

                    <div class="payout-info">
                        <div class="info-row">
                            <span class="info-label">PSTAKE STATUS</span>
                            <span class="info-value" id="pstakeStatus">
                                <span class="status-icon">...</span> Checking
                            </span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">ORACLE FEE</span>
                            <span class="info-value" id="oracleFeeStatus">
                                <span class="status-icon">...</span> Loading
                            </span>
                        </div>
                    </div>
                </section>

                <section class="tiger-action-bar">
                    <button class="spin-button" id="activateButton">ACTIVATE PURCHASE & MINE</button>
                    <button class="spin-button buy-button" id="buyBkcButton" style="display: none;">BUY $BKC TO START</button>
                    
                    <div class="secondary-actions">
                        <button class="icon-button" id="achievementsBtn" title="Achievements">
                            <i class="fa-solid fa-trophy"></i>
                            <span class="notification-badge" id="achievementBadge" style="display: none;">!</span>
                        </button>
                        <button class="icon-button" id="rulesBtn" title="How it Works"><i class="fa-solid fa-book-open"></i></button>
                    </div>
                </section>

                <div class="modal" id="achievementsModal">...</div>

                <div class="modal" id="rulesModal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2>📋 HOW IT WORKS (V3 ORACLE)</h2>
                            <button class="modal-close" onclick="document.getElementById('rulesModal').classList.remove('active')">✕</button>
                        </div>
                        <div class="modal-body">
                            <div class="rules-content">
                                <h3>Proof of Purchase (PoP) Mining</h3>
                                <p>This is the BKC Reward Generator. It is not a game of chance, but a <strong>mining system</strong>. Each "Activation" is a <strong>purchase</strong> (PoP) that contributes to the system's stability. 90% of your committed amount is processed by the PoP system, generating $BKC rewards for the network and a $BKC bonus (PoP mining) for the prize pool.</p>
                                
                                <h3>Asynchronous Oracle Game</h3>
                                <p>To ensure fair and secure randomness, this game uses a 2-step process:</p>
                                <p><strong>Step 1 (You Pay):</strong> You pay the $BKC amount and a small native gas fee (ETH/BNB) to request a game. Your request is logged on-chain.</p>
                                <p><strong>Step 2 (Oracle Pays):</strong> Our secure backend Oracle (indexer) sees your request, generates a random number, and sends it back to the contract. This triggers the prize calculation and pays out any winnings instantly to your wallet. (Est. 1-2 minutes)</p>
                                
                                <h3>Bonus Reward Tiers</h3>
                                <p>Your game request has a chance to unlock an instant bonus from the **single prize pool**. The system automatically pays out the <strong>highest bonus tier</strong> you unlock:</p>
                                
                                <p><strong>Tier 1 (3x):</strong> 1 in 3 chance (33.3%)</p>
                                <p><strong>Tier 2 (10x):</strong> 1 in 10 chance (10%)</p>
                                <p><strong>Tier 3 (100x):</strong> 1 in 100 chance (1%)</p>
                                <p><em>(Note: Tiers are examples and set by the contract owner)</em></p>
                                
                                <h3>pStake Requirement</h3>
                                <p>You must have sufficient pStake (delegated $BKC$) to participate.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal" id="levelUpModal">...</div>
            </div>
        `;

        const currentTitle = pageContainer.querySelector('.game-title');
        if (!currentTitle || currentTitle.textContent !== '✨ BKC REWARD GENERATOR') {
             pageContainer.innerHTML = htmlContent;
             this.initializeEventListeners();
        }
        
        this.loadPoolBalance();
        this.updateUIState();
    },

    initializeEventListeners() {
        const activateButton = document.getElementById('activateButton');
        const buyBkcButton = document.getElementById('buyBkcButton'); 
        const commitInput = document.getElementById('commitInput');
        const achievementsBtn = document.getElementById('achievementsBtn');
        const rulesBtn = document.getElementById('rulesBtn');

        if (commitInput) {
            commitInput.addEventListener('input', () => this.updateUIState());
        }

        document.querySelectorAll('.quick-bet-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleDecimalBet(e.currentTarget));
        });

        if (activateButton) {
            activateButton.addEventListener('click', executePurchase); 
        }

        if (buyBkcButton) {
            buyBkcButton.addEventListener('click', () => {
                const swapLink = State.systemData.swapLink || addresses.swapLink || '#';
                if(swapLink === '#') {
                    showToast("Swap link is not configured.", "error");
                    return;
                }
                window.open(swapLink, "_blank");
            });
        }

        if (achievementsBtn) {
            achievementsBtn.addEventListener('click', () => this.showAchievements());
        }
        if (rulesBtn) {
            rulesBtn.addEventListener('click', () => this.showRules());
        }
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal') || e.target.classList.contains('modal-close')) {
                    modal.classList.remove('active');
                }
            });
        });
    },

    handleDecimalBet(btnElement) {
        const commitInput = document.getElementById('commitInput');
        if (!commitInput) return;

        const action = btnElement.dataset.action;
        const value = parseFloat(btnElement.dataset.value || 0);
        let currentValue = parseFloat(commitInput.value) || 0;

        if (action === 'reset') {
            currentValue = 0;
        } else if (action === 'add') {
            currentValue = Number((currentValue + value).toFixed(2)); 
        }

        commitInput.value = currentValue > 0 ? currentValue : '';
        this.updateUIState();
    },
    
    loadPoolBalance, 

    // ✅ CORRIGIDO: Atualiza a piscina única
    updatePoolDisplay() {
        const totalPool = document.getElementById('totalPool');
        if (totalPool) totalPool.textContent = formatBigNumber(gameState.poolBalance || 0n).toLocaleString('en-US', { maximumFractionDigits: 2 });
    },
    
    /**
     * ✅ NOVO: Lida com o resultado do Oráculo
     */
    handleGameFulfilled,

    async checkRequirements() {
        const pstakeStatusEl = document.getElementById('pstakeStatus');
        const oracleFeeStatusEl = document.getElementById('oracleFeeStatus');
        const activateButton = document.getElementById('activateButton');
        
        if (!pstakeStatusEl || !oracleFeeStatusEl || !State.ecosystemManagerContract) return false;

        if (!State.isConnected) {
            pstakeStatusEl.innerHTML = '<span class="status-icon error">⚠️</span> Connect Wallet';
            oracleFeeStatusEl.innerHTML = '<span class="status-icon error">⚠️</span> Connect Wallet';
            return false;
        }
        
        pstakeStatusEl.innerHTML = '<span class="status-icon">...</span> Checking';
        oracleFeeStatusEl.innerHTML = '<span class="status-icon">...</span> Checking';
        
        try {
            // 1. Checa pStake
            const [ignoredFee, pStakeReq] = await safeContractCall( 
                State.ecosystemManagerContract, 
                'getServiceRequirements', 
                ["FORTUNE_POOL_SERVICE"], 
                [0n, 0n]
            );
            const meetsPStake = State.userTotalPStake >= pStakeReq;
            
            if (meetsPStake) {
                pstakeStatusEl.innerHTML = '<span class="status-icon">✅</span> Requirement Met';
                pstakeStatusEl.classList.remove('text-red-400');
                pstakeStatusEl.classList.add('text-green-400');
            } else {
                const reqFormatted = formatPStake(pStakeReq);
                pstakeStatusEl.innerHTML = `<span class="status-icon error">❌</span> Min ${reqFormatted} pStake Required`;
                pstakeStatusEl.classList.remove('text-green-400');
                pstakeStatusEl.classList.add('text-red-400');
            }
            
            // 2. Checa Taxa do Oráculo
            const oracleFeeWei = State.systemData.oracleFeeInWei ? BigInt(State.systemData.oracleFeeInWei) : 0n;
            const meetsOracleFee = State.currentUserNativeBalance >= oracleFeeWei;
            
            if (oracleFeeWei > 0n) {
                const feeFormatted = ethers.formatEther(oracleFeeWei);
                if (meetsOracleFee) {
                    oracleFeeStatusEl.innerHTML = `<span class="status-icon">✅</span> ${feeFormatted} ETH/BNB`;
                    oracleFeeStatusEl.classList.remove('text-red-400');
                    oracleFeeStatusEl.classList.add('text-green-400');
                } else {
                    oracleFeeStatusEl.innerHTML = `<span class="status-icon error">❌</span> Need ${feeFormatted} ETH/BNB`;
                    oracleFeeStatusEl.classList.remove('text-green-400');
                    oracleFeeStatusEl.classList.add('text-red-400');
                }
            } else {
                 oracleFeeStatusEl.innerHTML = `<span class="status-icon error">⚠️</span> Not Set`;
                 oracleFeeStatusEl.classList.add('text-red-400');
            }
            
            return (meetsPStake && meetsOracleFee); // Retorna o status geral

        } catch (e) {
            pstakeStatusEl.innerHTML = '<span class="status-icon error">⚠️</span> Error Check';
            oracleFeeStatusEl.innerHTML = '<span class="status-icon error">⚠️</span> Error Check';
            return false;
        }
    },


    // ... (Funções de Gamificação mantidas: addXP, levelUp, updateProgressBar, checkAchievements, etc.) ...
    addXP(amount) {
        gameState.currentXP += amount;
        while (gameState.currentXP >= gameState.xpPerLevel) { this.levelUp(); }
        this.updateProgressBar();
    },
    levelUp() { /* ... */ },
    updateProgressBar() { /* ... */ },
    checkAchievements(prizeWon, multiplier) {
        gameState.achievements.forEach(achievement => {
            if (achievement.unlocked) return;
            let shouldUnlock = false;
            if (achievement.id === 'first-activation' && gameState.totalActivations >= 10) { shouldUnlock = true; } 
            else if (achievement.id === 'hundred-activations' && gameState.totalActivations >= 100) { shouldUnlock = true; } 
            else if (achievement.id === 'bonus-master' && multiplier === 100) { shouldUnlock = true; }
            if (shouldUnlock) { this.unlockAchievement(achievement); }
        });
    },
    unlockAchievement(achievement) { /* ... */ },
    showAchievements() { /* ... */ },
    showRules() {
        const rulesModal = document.getElementById('rulesModal');
        if (rulesModal) {
            rulesModal.classList.add('active');
        }
    },

    // [DEPOIS] Lógica de UI atualizada para lidar com o botão "Comprar"
    async updateUIState() {
        const activateButton = document.getElementById('activateButton');
        const buyBkcButton = document.getElementById('buyBkcButton');
        const commitInput = document.getElementById('commitInput');
        
        if (!activateButton || !buyBkcButton || !commitInput) return;

        // Esconde os dois botões por padrão
        activateButton.style.display = 'none';
        buyBkcButton.style.display = 'none';

        if (!State.isConnected) {
            activateButton.style.display = 'block';
            activateButton.disabled = true;
            activateButton.innerHTML = 'CONNECT WALLET';
            this.checkRequirements(); // Atualiza os status mesmo desconectado
            return;
        }

        if (gameState.isActivating) {
            activateButton.style.display = 'block';
            activateButton.disabled = true;
            activateButton.innerHTML = '<div class="loader inline-block"></div> WAITING FOR ORACLE...';
            return;
        }

        // Se estiver conectado e não estiver ativando, checa saldos e requisitos
        const amount = parseFloat(commitInput.value) || 0;
        let amountWei = 0n;
        try {
            if (amount > 0) amountWei = ethers.parseEther(amount.toString());
        } catch (e) { /* ignora erro de parse */ }

        // Checa todos os requisitos (pStake E taxa do oráculo)
        const meetsAllRequirements = await this.checkRequirements();

        if (amountWei > 0n && amountWei > State.currentUserBalance) {
            // Caso 1: Digitou um valor MAIOR que o saldo
            buyBkcButton.style.display = 'block';
            buyBkcButton.innerHTML = 'INSUFFICIENT $BKC - CLICK TO BUY';
        } else if (amountWei === 0n && State.currentUserBalance === 0n) {
            // Caso 2: Não digitou nada E não tem saldo
            buyBkcButton.style.display = 'block';
            buyBkcButton.innerHTML = 'BUY $BKC TO START';
        } else {
            // Caso 3: Tem saldo suficiente (ou não digitou nada, mas tem saldo)
            activateButton.style.display = 'block';
            activateButton.innerHTML = 'ACTIVATE PURCHASE & MINE';
            // Desabilita se os requisitos (pStake/Taxa) não forem atendidos
            activateButton.disabled = !meetsAllRequirements;
        }
    }
};