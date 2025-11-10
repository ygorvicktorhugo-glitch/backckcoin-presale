// pages/TigerGame.js - Versão V8: Foco em 3 Pools e "Comprar BKC"

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
    poolBalances: {}, 
    isActivating: false, 
    lastBonus: 0,
};

// ... (Funções de load/save gamestate mantidas) ...

// ============================================
// II. CONFIGURAÇÕES E CONSTANTES
// ============================================

// Configuração de 3 Pools (Baseado no novo contrato flexível)
const PRIZE_POOLS_CONFIG = [
    { poolId: 0, multiplier: 1, chance: '1 in 2 (50%)', style: 'bg-blue-800 border-blue-500/50' }, 
    { poolId: 1, multiplier: 5, chance: '1 in 20 (5%)', style: 'bg-yellow-800 border-yellow-500/50' },
    { poolId: 2, multiplier: 100, chance: '1 in 1000 (0.1%)', style: 'bg-red-800 border-red-500/50' },
];

// ============================================
// III. LÓGICA DE CONTRATO E CÁLCULO
// ============================================

async function loadPoolBalances() {
    if (!State.actionsManagerContract) return;
    try {
        const activePools = await safeContractCall(State.actionsManagerContract, 'activePoolCount', [], 3); // Default 3
        
        gameState.poolBalances = {}; 
        
        for (let i = 0; i < activePools; i++) {
            const poolConfig = PRIZE_POOLS_CONFIG.find(p => p.poolId === i);
            if (!poolConfig) continue;

            const poolInfo = await safeContractCall(
                State.actionsManagerContract, 
                'prizePools', 
                [i], 
                [0n, 0n, 0n, 0n] // [multiplierBips, chanceDenominator, balance, contributionShareBips]
            );
            gameState.poolBalances[poolConfig.multiplier] = poolInfo[2]; 
        }
        TigerGamePage.updatePoolDisplay(); 
        // [DEPOIS] Removida chamada para updatePayoutDisplay()
    } catch (e) {
        console.error("Failed to load pool balances:", e);
    }
}

// [DEPOIS] Função calculatePrizePotentials removida, pois a UI foi simplificada

// Lógica de resultado atualizada para "Highest Prize Wins"
async function processGameResult(receipt, amountWagered) {
    const abi = ["event GamePlayed(address indexed user, uint256 amountWagered, uint256 totalPrizeWon)"];
    const iface = new ethers.Interface(abi);
    
    let totalPrizeWon = 0n;
    let highestMultiplier = 0; 

    for (const log of receipt.logs) {
        try {
            const parsedLog = iface.parseLog(log);
            if (parsedLog && parsedLog.name === "GamePlayed") {
                totalPrizeWon = parsedLog.args.totalPrizeWon;
                const prizeFloat = formatBigNumber(totalPrizeWon);
                const wagerFloat = formatBigNumber(amountWagered);
                
                if (prizeFloat > 0 && wagerFloat > 0) {
                    const calculatedMultiplier = prizeFloat / wagerFloat;
                    if (calculatedMultiplier >= 95) highestMultiplier = 100; 
                    else if (calculatedMultiplier >= 4.8) highestMultiplier = 5; 
                    else if (calculatedMultiplier >= 0.95) highestMultiplier = 1; 
                }
                break; 
            }
        } catch (e) { /* Ignora logs */ }
    }
    return { totalPrizeWon, highestMultiplier };
}


// ============================================
// IV. ANIMAÇÕES DE ATIVAÇÃO
// ============================================

async function runActivationSequence(prizeWon) {
    const activationArea = document.getElementById('activationArea');
    const activationCore = document.getElementById('activationCore');
    const resultDisplay = document.getElementById('resultDisplay');
    
    if (!activationArea || !activationCore || !resultDisplay) return;

    // 1. Inicia a Ativação
    resultDisplay.innerHTML = `<h3>ACTIVATING PURCHASE...</h3>`;
    resultDisplay.classList.remove('win', 'lose');
    activationCore.classList.add('activating'); 
    await new Promise(resolve => setTimeout(resolve, 3000)); 

    // 2. Para a Animação
    activationCore.classList.remove('activating');

    // 3. Mostra o Resultado
    const totalPrizeWonFloat = formatBigNumber(prizeWon.totalPrizeWon);
    
    if (prizeWon.highestMultiplier > 0) {
        resultDisplay.classList.add('win');
        resultDisplay.innerHTML = `<h3>🎉 BONUS UNLOCKED! x${prizeWon.highestMultiplier}! You received ${totalPrizeWonFloat.toLocaleString('en-US', { maximumFractionDigits: 2 })} $BKC!</h3>`;
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
    if (prizeWon.totalPrizeWon > 0n) {
        if (prizeWon.highestMultiplier > 1) {
            showToast(`🎉 BONUS! You unlocked a x${prizeWon.highestMultiplier} reward!`, 'success');
        } else {
            showToast(`Purchase complete. You received a 1x stability reward.`, 'info');
        }
    } else {
        showToast('Purchase registered. Better luck on the next bonus!', 'info');
    }
    
    // 5. Atualiza Estado
    gameState.totalActivations++;
    TigerGamePage.addXP(100); 
    TigerGamePage.checkAchievements(totalPrizeWonFloat, prizeWon.highestMultiplier);
    await loadUserData(); 
    await loadPoolBalances(); 
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
}


// ============================================
// V. FUNÇÃO PRINCIPAL DE "COMPRA"
// ============================================

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
    
    // [DEPOIS] Lógica de verificação de saldo movida para updateUIState, mas mantemos uma
    // verificação final aqui por segurança.
    if (amountWei > State.currentUserBalance) {
        showToast("Insufficient BKC balance for this amount.", "error");
        TigerGamePage.updateUIState(); // Força a UI a mostrar o botão "Comprar"
        return;
    }

    gameState.isActivating = true;
    if (activateButton) {
        activateButton.disabled = true;
        activateButton.innerHTML = '<div class="loader inline-block"></div> ACTIVATING PURCHASE...'; 
    }

    try {
        // 1. Verificação de pStake
        const [ignoredFee, pStakeReq] = await safeContractCall(
            State.ecosystemManagerContract, 
            'getServiceRequirements', 
            ["TIGER_GAME_SERVICE"], 
            [0n, 0n]
        );
        if (State.userTotalPStake < pStakeReq) {
            throw new Error(`PStake requirement failed validation. Required: ${formatPStake(pStakeReq)}`);
        }
        
        // 2. Aprovação
        showToast(`Approving ${amount.toFixed(2)} $BKC for activation...`, "info");
        const approveTx = await State.bkcTokenContract.approve(addresses.actionsManager, amountWei);
        await approveTx.wait();
        showToast('Approval successful! Registering purchase...', "success");
        
        // 3. Executa a função play
        const boosterId = State.userBoosterId || 0n;
        const playTx = await State.actionsManagerContract.play(amountWei, boosterId);
        const receipt = await playTx.wait();
        
        // 4. Processa o resultado
        const prizeWon = await processGameResult(receipt, amountWei);
        
        // 5. Inicia a animação
        await runActivationSequence(prizeWon); 

    } catch (error) {
        console.error("Activation error:", error);
        let errorMessage = error.reason || error.message || 'Transaction reverted.';
        if (errorMessage.includes("pStake requirement failed")) {
            errorMessage = "Insufficient pStake requirement. Delegate more BKC!";
        } else if (errorMessage.includes("transfer amount exceeds balance")) {
            errorMessage = "Insufficient BKC balance.";
        }
        showToast(`Activation Failed: ${errorMessage}`, "error");
        stopActivationOnError();
    } finally {
        gameState.isActivating = false;
        // [DEPOIS] updateUIState irá re-verificar saldos e pStake
        TigerGamePage.updateUIState(); 
        // [DEPOIS] Removida chamada para updatePayoutDisplay()
    }
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

        // 1. CÓDIGO HTML (Redesenhado)
        
        // [DEPOIS] Removido prizePotentialsHTML

        // [DEPOIS] HTML de 3 Pools
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
                        <div class="pool-item" title="1x Reward Pool: 50% chance">
                            <span class="pool-label">x1 Bonus Pool</span>
                            <span class="pool-value" id="pool1">0.00</span>
                        </div>
                        <div class="pool-item" title="5x Reward Pool: 5% chance">
                            <span class="pool-label">x5 Bonus Pool</span>
                            <span class="pool-value" id="pool5">0.00</span>
                        </div>
                        <div class="pool-item" title="100x Reward Pool: 0.1% chance">
                            <span class="pool-label">x100 Bonus Pool</span>
                            <span class="pool-value" id="pool100">0.00</span>
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
                            <h2>📋 HOW IT WORKS</h2>
                            <button class="modal-close" onclick="document.getElementById('rulesModal').classList.remove('active')">✕</button>
                        </div>
                        <div class="modal-body">
                            <div class="rules-content">
                                <h3>Proof of Purchase (PoP) Mining</h3>
                                <p>This is the BKC Reward Generator. It is not a game of chance, but a <strong>mining system</strong>. Your goal is to generate ecosystem fees, which strengthens the entire BKC network.</p>
                                <p>Each "Activation" is a <strong>purchase</strong> (PoP) that contributes to the system's stability. 90% of your committed amount enters the reward pools, and 10% is distributed as fees to the Treasury and Delegators.</p>
                                
                                <h3>Bonus Reward Tiers</h3>
                                <p>As a reward for participating, your purchase has a chance to unlock an instant bonus, paid from the reward pools. The system automatically pays out the <strong>highest bonus tier</strong> you unlock:</p>
                                
                                <p><strong>x1 Bonus Pool:</strong> 1 in 2 chance (50%). You receive 1x your committed amount back.</p>
                                <p><strong>x5 Bonus Pool:</strong> 1 in 20 chance (5%). You receive 5x your committed amount.</p>
                                <p><strong>x100 Bonus Pool:</strong> 1 in 1000 chance (0.1%). You receive 100x your committed amount.</p>
                                <p><em>If you do not unlock any bonus, your purchase is complete, and the full 90% remains in the pools to fund future rewards.</em></p>

                                <h3>Sustainability Cap</h3>
                                <p>To ensure the system is always sustainable, all bonus payouts are capped at 50% of the corresponding pool's liquidity. (e.g., if the 100x pool has 200k $BKC$, the max bonus is 100k $BKC$).</p>
                                
                                <h3>pStake Requirement</h3>
                                <p>You must have sufficient pStake (delegated $BKC$) to participate in the Reward Generator.</p>
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
        
        this.loadPoolBalances();
        this.updateUIState();
    },

    initializeEventListeners() {
        const activateButton = document.getElementById('activateButton');
        const buyBkcButton = document.getElementById('buyBkcButton'); // [DEPOIS] Novo botão
        const commitInput = document.getElementById('commitInput');
        const achievementsBtn = document.getElementById('achievementsBtn');
        const rulesBtn = document.getElementById('rulesBtn');

        if (commitInput) {
            // [DEPOIS] Input agora também chama updateUIState para checar o saldo
            commitInput.addEventListener('input', () => this.updateUIState());
        }

        document.querySelectorAll('.quick-bet-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleDecimalBet(e.currentTarget));
        });

        if (activateButton) {
            activateButton.addEventListener('click', executePurchase); 
        }

        // [DEPOIS] Adiciona listener para o botão de comprar
        if (buyBkcButton) {
            buyBkcButton.addEventListener('click', () => {
                //
                const bkcTokenAddress = addresses.bkcToken; 
                if (!bkcTokenAddress) {
                    showToast("BKC Token address not found in config.", "error");
                    return;
                }
                // Link genérico da PancakeSwap que pré-seleciona o BKC como token de "saída" (compra)
                const dexLink = `https://pancakeswap.finance/swap?outputCurrency=${bkcTokenAddress}`;
                window.open(dexLink, "_blank");
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
        
        // [DEPOIS] Removida chamada para updatePayoutDisplay()
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
        this.updateUIState(); // [DEPOIS] Chama updateUIState para checar o saldo
    },
    
    loadPoolBalances, 

    // [DEPOIS] Atualizado para os novos IDs de 3 pools
    updatePoolDisplay() {
        const pool1 = document.getElementById('pool1');
        const pool5 = document.getElementById('pool5');
        const pool100 = document.getElementById('pool100');

        if (pool1) pool1.textContent = formatBigNumber(gameState.poolBalances[1] || 0n).toLocaleString('en-US', { maximumFractionDigits: 2 });
        if (pool5) pool5.textContent = formatBigNumber(gameState.poolBalances[5] || 0n).toLocaleString('en-US', { maximumFractionDigits: 2 });
        if (pool100) pool100.textContent = formatBigNumber(gameState.poolBalances[100] || 0n).toLocaleString('en-US', { maximumFractionDigits: 2 });
    },
    
    async checkPStakeStatus() {
        const pstakeStatusEl = document.getElementById('pstakeStatus');
        const activateButton = document.getElementById('activateButton');
        if (!pstakeStatusEl || !State.ecosystemManagerContract) return false;

        if (!State.isConnected) {
            pstakeStatusEl.innerHTML = '<span class="status-icon error">⚠️</span> Connect Wallet';
            return false;
        }
        
        pstakeStatusEl.innerHTML = '<span class="status-icon">...</span> Checking';
        
        try {
            const [ignoredFee, pStakeReq] = await safeContractCall( 
                State.ecosystemManagerContract, 
                'getServiceRequirements', 
                ["TIGER_GAME_SERVICE"], 
                [0n, 0n]
            );
            
            const meetsPStake = State.userTotalPStake >= pStakeReq;
            
            if (meetsPStake) {
                pstakeStatusEl.innerHTML = '<span class="status-icon">✅</span> Requirement Met';
                pstakeStatusEl.classList.remove('text-red-400');
                pstakeStatusEl.classList.add('text-green-400');
                return true; // [DEPOIS] Retorna true se o pStake for atendido
            } else {
                const reqFormatted = formatPStake(pStakeReq);
                pstakeStatusEl.innerHTML = `<span class="status-icon error">❌</span> Min ${reqFormatted} pStake Required`;
                pstakeStatusEl.classList.remove('text-green-400');
                pstakeStatusEl.classList.add('text-red-400');
                return false; // [DEPOIS] Retorna false
            }
        } catch (e) {
            pstakeStatusEl.innerHTML = '<span class="status-icon error">⚠️</span> Error Check';
            return false; // [DEPOIS] Retorna false
        }
    },

    // [DEPOIS] Função removida
    // updatePayoutDisplay() { ... }

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
            return;
        }

        if (gameState.isActivating) {
            activateButton.style.display = 'block';
            activateButton.disabled = true;
            activateButton.innerHTML = '<div class="loader inline-block"></div> ACTIVATING PURCHASE...';
            return;
        }

        // Se estiver conectado e não estiver ativando, checa saldos
        const amount = parseFloat(commitInput.value) || 0;
        let amountWei = 0n;
        try {
            if (amount > 0) amountWei = ethers.parseEther(amount.toString());
        } catch (e) { /* ignora erro de parse */ }

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
            // Agora, verifica o pStake para habilitar/desabilitar o botão de ativar
            const meetsPStake = await this.checkPStakeStatus();
            activateButton.disabled = !meetsPStake;
        }
    }
};