// pages/networkstaking.js
// ✅ VERSÃO FINAL BLINDADA: Cache de Dados + Anti-Loop + UI Otimizada

const ethers = window.ethers;

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
import { 
    formatBigNumber, 
    formatPStake, 
    renderLoading, 
    renderError,
    renderNoData,
    renderPaginatedList
} from '../utils.js';
import { 
    loadPublicData, 
    loadUserData, 
    calculateUserTotalRewards 
} from '../modules/data.js';
import { 
    executeDelegation, 
    executeUnstake, 
    executeForceUnstake, 
    executeUniversalClaim 
} from '../modules/transactions.js';
import { showToast, startCountdownTimers, openModal, closeModal } from '../ui-feedback.js';

// --- Estado Local ---
let isStakingLoading = false;
let lastStakingFetch = 0; // Cache de tempo
let delegationCurrentPage = 1;

// =========================================================================
// 1. RENDERIZAÇÃO VISUAL
// =========================================================================

function renderEarnLayout() {
    const container = document.getElementById('mine');
    if (!container) return;
    
    // Se já existe o conteúdo principal, não recria para evitar piscar
    if (container.querySelector('#earn-main-content')) return;

    container.innerHTML = `
        <div id="earn-main-content" class="container mx-auto max-w-7xl py-8 px-4">
            
            <div class="mb-10 text-center md:text-left">
                <h1 class="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-2">
                    Network Staking
                </h1>
                <p class="text-zinc-400 text-lg max-w-2xl">
                    Delegate your $BKC to secure the network and earn passive rewards. 
                    Longer lock periods generate more <span class="text-purple-400 font-bold">pStake</span> and higher APY.
                </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div class="bg-zinc-900/50 border border-zinc-700 p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                    <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <i class="fa-solid fa-globe text-6xl text-purple-500"></i>
                    </div>
                    <p class="text-zinc-400 text-sm font-bold uppercase tracking-wider">Total Network Staked</p>
                    <p class="text-3xl font-mono text-white mt-2" id="earn-total-network-pstake">--</p>
                </div>

                <div class="bg-zinc-900/50 border border-zinc-700 p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                     <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <i class="fa-solid fa-user-shield text-6xl text-blue-500"></i>
                    </div>
                    <p class="text-zinc-400 text-sm font-bold uppercase tracking-wider">My Total pStake</p>
                    <p class="text-3xl font-mono text-white mt-2" id="earn-my-pstake">--</p>
                </div>

                <div class="bg-zinc-900/50 border border-zinc-700 p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                     <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <i class="fa-solid fa-gift text-6xl text-amber-500"></i>
                    </div>
                    <p class="text-zinc-400 text-sm font-bold uppercase tracking-wider">Claimable Rewards</p>
                    <div class="flex items-center gap-3 mt-2">
                        <p class="text-3xl font-mono text-amber-400" id="earn-my-rewards">--</p>
                        <button id="earn-claim-btn" class="bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold py-1.5 px-3 rounded-lg border border-amber-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                            Claim
                        </button>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                <div class="lg:col-span-5">
                    <div class="bg-sidebar border border-border-color rounded-2xl p-6 shadow-xl sticky top-24">
                        <h2 class="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <i class="fa-solid fa-plus-circle text-purple-400"></i> New Delegation
                        </h2>

                        <div class="space-y-6">
                            <div>
                                <label class="block text-sm font-medium text-zinc-300 mb-2">Amount to Stake ($BKC)</label>
                                <div class="relative">
                                    <input type="number" id="staking-amount-input" placeholder="0.00" class="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors font-mono">
                                    <div class="absolute right-2 top-2 flex gap-1">
                                        <button class="stake-perc-btn text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white px-2 py-2 rounded transition-colors" data-perc="25">25%</button>
                                        <button class="stake-perc-btn text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white px-2 py-2 rounded transition-colors" data-perc="50">50%</button>
                                        <button class="stake-perc-btn text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white px-2 py-2 rounded transition-colors" data-perc="100">Max</button>
                                    </div>
                                </div>
                                <p class="text-xs text-zinc-500 mt-2 text-right">Available: <span id="staking-balance-display" class="text-white">--</span> $BKC</p>
                            </div>

                            <div>
                                <label class="flex justify-between text-sm font-medium text-zinc-300 mb-2">
                                    <span>Lock Duration</span>
                                    <span id="staking-duration-display" class="text-purple-400 font-bold">365 days</span>
                                </label>
                                <input type="range" id="staking-duration-slider" min="1" max="3650" value="365" class="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500">
                                <div class="flex justify-between text-xs text-zinc-500 mt-2">
                                    <span>1 Day</span>
                                    <span>10 Years</span>
                                </div>
                            </div>

                            <div class="bg-zinc-900/50 rounded-xl p-4 space-y-2 border border-zinc-800">
                                <div class="flex justify-between text-sm">
                                    <span class="text-zinc-400">Staking Fee (0.5%):</span>
                                    <span class="text-white font-mono" id="staking-fee-display">0.00</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-zinc-400">Net Staked:</span>
                                    <span class="text-white font-mono" id="staking-net-display">0.00</span>
                                </div>
                                <div class="border-t border-zinc-800 pt-2 flex justify-between items-center">
                                    <span class="text-zinc-400 text-sm">Projected pStake:</span>
                                    <span class="text-purple-400 font-bold text-lg font-mono" id="staking-pstake-display">0</span>
                                </div>
                            </div>

                            <button id="confirm-stake-btn" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none">
                                Confirm Delegation
                            </button>
                        </div>
                    </div>
                </div>

                <div class="lg:col-span-7">
                    <div class="bg-sidebar border border-border-color rounded-2xl p-6 shadow-xl min-h-[500px]">
                        <h2 class="text-xl font-bold text-white mb-6 flex items-center justify-between">
                            <span class="flex items-center gap-2"><i class="fa-solid fa-list-ul text-zinc-400"></i> Active Delegations</span>
                            <button id="refresh-delegations-btn" class="text-sm text-blue-400 hover:text-blue-300"><i class="fa-solid fa-rotate"></i></button>
                        </h2>
                        
                        <div id="my-delegations-container" class="space-y-4">
                             </div>
                    </div>
                </div>

            </div>
        </div>
    `;
    
    setupStakingListeners();
}

// =========================================================================
// 2. LÓGICA DE DADOS (SAFE)
// =========================================================================

async function updateStakingData(forceRefresh = false) {
    if (!State.isConnected) {
        resetStakingUI();
        return;
    }

    const now = Date.now();
    // 🕒 Cache de 1 minuto para dados gerais, a menos que forçado
    // O loadUserData já tem sua própria proteção interna, mas essa protege a lógica de UI
    if (!forceRefresh && isStakingLoading && (now - lastStakingFetch < 60000)) return;
    
    isStakingLoading = true;
    lastStakingFetch = now;

    try {
        // 1. Dados Públicos
        if (!State.totalNetworkPStake || State.totalNetworkPStake === 0n) {
            await loadPublicData(); 
        }
        const netPStakeEl = document.getElementById('earn-total-network-pstake');
        if(netPStakeEl) netPStakeEl.textContent = formatPStake(State.totalNetworkPStake);

        // 2. Dados do Usuário
        if (State.currentUserBalance === 0n) await loadUserData(); 
        
        const balDisplay = document.getElementById('staking-balance-display');
        const myPStakeDisplay = document.getElementById('earn-my-pstake');
        
        if(balDisplay) balDisplay.textContent = formatBigNumber(State.currentUserBalance).toFixed(2);
        if(myPStakeDisplay) myPStakeDisplay.textContent = formatPStake(State.userTotalPStake);

        // 3. Recompensas (Claimable)
        const { stakingRewards, minerRewards } = await calculateUserTotalRewards();
        const totalRewards = stakingRewards + minerRewards;
        
        const rewardsEl = document.getElementById('earn-my-rewards');
        const claimBtn = document.getElementById('earn-claim-btn');
        
        if (rewardsEl) rewardsEl.textContent = `${formatBigNumber(totalRewards).toFixed(4)}`;
        
        if (claimBtn) {
            if (totalRewards > 0n) {
                claimBtn.disabled = false;
                claimBtn.onclick = () => handleClaimRewards(stakingRewards, minerRewards, claimBtn);
            } else {
                claimBtn.disabled = true;
            }
        }

        // 4. Lista de Delegações
        renderDelegationsList();

    } catch (error) {
        console.error("Staking Data Error:", error);
    } finally {
        isStakingLoading = false;
    }
}

function resetStakingUI() {
    const setTxt = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
    setTxt('earn-total-network-pstake', '--');
    setTxt('earn-my-pstake', '--');
    setTxt('earn-my-rewards', '--');
    setTxt('staking-balance-display', '--');
    
    const container = document.getElementById('my-delegations-container');
    if(container) container.innerHTML = renderNoData("Connect wallet to view delegations.");
}

// =========================================================================
// 3. LISTA DE DELEGAÇÕES
// =========================================================================

function renderDelegationsList() {
    const container = document.getElementById('my-delegations-container');
    if (!container) return;

    const delegations = State.userDelegations || [];

    if (delegations.length === 0) {
        container.innerHTML = renderNoData("You have no active delegations.");
        return;
    }

    renderPaginatedList(
        delegations, 
        container, 
        (d) => {
            const amountFormatted = formatBigNumber(d.amount).toFixed(2);
            const pStake = calculatePStake(d.amount, d.lockDuration);
            
            const unlockTimestamp = Number(d.unlockTime);
            const nowSeconds = Math.floor(Date.now() / 1000);
            const isLocked = unlockTimestamp > nowSeconds;
            const unlockDate = new Date(unlockTimestamp * 1000).toLocaleDateString();

            return `
                <div class="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4 delegation-card">
                    <div class="text-center sm:text-left">
                        <p class="text-white font-bold text-lg">${amountFormatted} <span class="text-zinc-500 text-sm">$BKC</span></p>
                        <p class="text-purple-400 text-sm font-mono">${formatPStake(pStake)} pStake</p>
                    </div>
                    
                    <div class="text-center">
                        <div class="countdown-timer text-sm font-mono text-zinc-300 bg-zinc-800 px-3 py-1 rounded-md" data-unlock-time="${unlockTimestamp}" data-index="${d.index}">
                            ${isLocked ? 'Calculating...' : '<span class="text-green-400">Unlocked</span>'}
                        </div>
                        <p class="text-xs text-zinc-600 mt-1">Unlock: ${unlockDate}</p>
                    </div>

                    <div class="flex gap-2">
                        ${isLocked ? 
                            `<button class="bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/30 p-2 rounded-lg transition-colors text-xs force-unstake-btn" data-index="${d.index}" title="Force Unstake (Penalty Applies)">
                                <i class="fa-solid fa-lock"></i> Force
                            </button>` : ''
                        }
                        <button class="${isLocked ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600 text-zinc-900'} font-bold py-2 px-4 rounded-lg text-sm transition-colors unstake-btn" 
                                data-index="${d.index}" ${isLocked ? 'disabled' : ''}>
                            Unstake
                        </button>
                    </div>
                </div>
            `;
        },
        5, // Itens por página
        delegationCurrentPage,
        (newPage) => { delegationCurrentPage = newPage; renderDelegationsList(); }
    );

    const timers = container.querySelectorAll('.countdown-timer');
    if (timers.length > 0) startCountdownTimers(Array.from(timers));

    container.querySelectorAll('.unstake-btn').forEach(btn => {
        btn.addEventListener('click', () => handleUnstake(btn.dataset.index, false));
    });
    container.querySelectorAll('.force-unstake-btn').forEach(btn => {
        btn.addEventListener('click', () => handleUnstake(btn.dataset.index, true));
    });
}

function calculatePStake(amount, duration) {
    try {
        const amountBig = BigInt(amount);
        const durationBig = BigInt(duration);
        const daySeconds = 86400n;
        const divisor = 10n**18n;
        return (amountBig * (durationBig / daySeconds)) / divisor;
    } catch { return 0n; }
}

// =========================================================================
// 4. INTERAÇÃO (LISTENERS & HANDLERS)
// =========================================================================

function setupStakingListeners() {
    const amountInput = document.getElementById('staking-amount-input');
    const durationSlider = document.getElementById('staking-duration-slider');
    const confirmBtn = document.getElementById('confirm-stake-btn');
    const refreshBtn = document.getElementById('refresh-delegations-btn');

    const updateSimulation = () => {
        const amountVal = amountInput.value;
        const durationVal = durationSlider.value;
        document.getElementById('staking-duration-display').textContent = `${durationVal} days`;

        if (!amountVal || amountVal <= 0) {
            document.getElementById('staking-fee-display').textContent = "0.00";
            document.getElementById('staking-net-display').textContent = "0.00";
            document.getElementById('staking-pstake-display').textContent = "0";
            confirmBtn.disabled = true;
            return;
        }

        try {
            const amountWei = ethers.parseUnits(amountVal, 18);
            // Simulação de Fee (0.5%)
            const feeWei = (amountWei * 50n) / 10000n;
            const netWei = amountWei - feeWei;
            
            // Simulação de pStake
            const pStake = calculatePStake(netWei, durationVal * 86400);

            document.getElementById('staking-fee-display').textContent = formatBigNumber(feeWei).toFixed(4);
            document.getElementById('staking-net-display').textContent = formatBigNumber(netWei).toFixed(4);
            document.getElementById('staking-pstake-display').textContent = formatPStake(pStake);
            
            if (amountWei > State.currentUserBalance) {
                confirmBtn.disabled = true;
                amountInput.classList.add('border-red-500');
            } else {
                confirmBtn.disabled = false;
                amountInput.classList.remove('border-red-500');
            }
        } catch (e) {
            confirmBtn.disabled = true;
        }
    };

    if(amountInput && durationSlider) {
        amountInput.addEventListener('input', updateSimulation);
        durationSlider.addEventListener('input', updateSimulation);
        
        document.querySelectorAll('.stake-perc-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const perc = parseInt(btn.dataset.perc);
                const bal = State.currentUserBalance || 0n;
                const amount = (bal * BigInt(perc)) / 100n;
                amountInput.value = ethers.formatUnits(amount, 18);
                updateSimulation();
            });
        });

        confirmBtn.addEventListener('click', async () => {
            const amountWei = ethers.parseUnits(amountInput.value, 18);
            const durationSec = parseInt(durationSlider.value) * 86400;
            
            confirmBtn.innerHTML = `<div class="loader inline-block mr-2"></div> Sending...`;
            confirmBtn.disabled = true;

            const success = await executeDelegation(amountWei, durationSec, 0, confirmBtn);
            
            if (success) {
                amountInput.value = "";
                updateSimulation();
                updateStakingData(true); 
            } else {
                confirmBtn.innerHTML = "Confirm Delegation";
                confirmBtn.disabled = false;
            }
        });
    }

    if(refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            const icon = refreshBtn.querySelector('i');
            icon.classList.add('fa-spin');
            updateStakingData(true).then(() => icon.classList.remove('fa-spin'));
        });
    }
}

async function handleUnstake(index, isForce) {
    const success = isForce 
        ? await executeForceUnstake(Number(index))
        : await executeUnstake(Number(index));
    
    if (success) updateStakingData(true);
}

async function handleClaimRewards(stakingRewards, minerRewards, btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="loader inline-block"></div>`;
    const success = await executeUniversalClaim(stakingRewards, minerRewards, btn);
    if (success) {
        showToast("Rewards claimed!", "success");
        updateStakingData(true);
    } else {
        btn.disabled = false;
        btn.innerHTML = "Claim";
    }
}

// =========================================================================
// 5. EXPORTAÇÃO
// =========================================================================

export const EarnPage = {
    async render(isNewPage) {
        renderEarnLayout();
        
        if (State.isConnected) {
            // Se for navegação nova, carrega. Se não, respeita o cache
            await updateStakingData(isNewPage); 
        } else {
            resetStakingUI();
        }
    },
    
    update() {
        // Chamado pelo State Observer
        updateStakingData();
    }
};