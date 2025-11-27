// pages/FortunePool.js
// ✅ VERSÃO FINAL V8.0: Wizard Interativo (Passo a Passo) + Correção de Endereço

import { State } from '../state.js';
import { loadUserData, safeContractCall, API_ENDPOINTS } from '../modules/data.js';
import { formatBigNumber } from '../utils.js';
import { showToast } from '../ui-feedback.js';
import { addresses } from '../config.js';

const ethers = window.ethers;

// --- ESTADO DO JOGO ---
let gameState = {
    step: 0, // 0=Intro, 1=Tier1, 2=Tier2, 3=Tier3, 4=Betting
    isSpinning: false,
    gameId: 0,
    pollInterval: null,
    spinInterval: null,
    
    guesses: [0, 0, 0], // [Tier1, Tier2, Tier3]
    isCumulative: false,
    
    currentLevel: 1,
    currentXP: 0,
    xpPerLevel: 1000,
    totalActivations: 0
};

// Load Local Data
try {
    const local = localStorage.getItem('bkc_fortune_data_v8');
    if (local) {
        const parsed = JSON.parse(local);
        gameState.currentLevel = parsed.currentLevel || 1;
        gameState.currentXP = parsed.currentXP || 0;
        gameState.totalActivations = parsed.totalActivations || 0;
    }
} catch (e) {}

function saveProgress() {
    localStorage.setItem('bkc_fortune_data_v8', JSON.stringify({
        currentLevel: gameState.currentLevel,
        currentXP: gameState.currentXP,
        totalActivations: gameState.totalActivations
    }));
    updateGamificationUI();
}

// ============================================
// 1. RENDERIZAÇÃO DINÂMICA (WIZARD)
// ============================================

function renderStep() {
    const container = document.getElementById('game-interaction-area');
    if (!container) return;

    container.classList.remove('animate-fadeIn');
    void container.offsetWidth; // Trigger reflow
    container.classList.add('animate-fadeIn');

    // --- STEP 0: INTRO ---
    if (gameState.step === 0) {
        container.innerHTML = `
            <div class="text-center py-6">
                <h2 class="text-2xl font-bold text-white mb-2">Choose your Destiny</h2>
                <p class="text-zinc-400 text-sm mb-8">Predict the Oracle's numbers to win up to 100x.</p>
                
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto">
                    <button id="btn-random-all" class="bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 p-6 rounded-xl border border-white/10 shadow-lg group transition-all hover:-translate-y-1">
                        <div class="text-4xl mb-2 group-hover:scale-110 transition-transform">🎲</div>
                        <h3 class="font-bold text-white">Quick Random</h3>
                        <p class="text-[10px] text-purple-200 mt-1">Let the universe decide</p>
                    </button>

                    <button id="btn-manual-pick" class="bg-zinc-800 hover:bg-zinc-700 p-6 rounded-xl border border-zinc-600 hover:border-amber-500 shadow-lg group transition-all hover:-translate-y-1">
                        <div class="text-4xl mb-2 group-hover:scale-110 transition-transform">👆</div>
                        <h3 class="font-bold text-white">Manual Pick</h3>
                        <p class="text-[10px] text-zinc-400 mt-1">Select your lucky numbers</p>
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('btn-random-all').onclick = () => {
            gameState.guesses = [
                Math.floor(Math.random() * 3) + 1,
                Math.floor(Math.random() * 10) + 1,
                Math.floor(Math.random() * 100) + 1
            ];
            gameState.step = 4; // Pula para aposta
            renderStep();
        };
        document.getElementById('btn-manual-pick').onclick = () => {
            gameState.step = 1;
            renderStep();
        };
    }

    // --- STEP 1: BRONZE TIER (1-3) ---
    else if (gameState.step === 1) {
        container.innerHTML = `
            <div class="text-center">
                <div class="text-amber-500 text-xs font-bold tracking-widest uppercase mb-2">Step 1 of 3</div>
                <h2 class="text-xl font-bold text-white mb-6">Pick the <span class="text-amber-500">Bronze</span> Number</h2>
                
                <div class="flex justify-center gap-4 mb-8">
                    ${[1, 2, 3].map(num => `
                        <button class="w-20 h-24 bg-zinc-800 border-2 border-zinc-700 hover:border-amber-500 rounded-xl text-3xl font-black text-white hover:bg-zinc-700 transition-all hover:-translate-y-1 shadow-lg step-pick-btn" data-val="${num}">
                            ${num}
                        </button>
                    `).join('')}
                </div>
                <p class="text-xs text-zinc-500">1 in 3 Chance • 3x Reward</p>
            </div>
        `;
        attachStepListeners(1);
    }

    // --- STEP 2: SILVER TIER (1-10) ---
    else if (gameState.step === 2) {
        container.innerHTML = `
            <div class="text-center">
                <div class="text-gray-400 text-xs font-bold tracking-widest uppercase mb-2">Step 2 of 3</div>
                <h2 class="text-xl font-bold text-white mb-6">Pick the <span class="text-gray-300">Silver</span> Number</h2>
                
                <div class="grid grid-cols-5 gap-3 max-w-xs mx-auto mb-8">
                    ${Array.from({length: 10}, (_, i) => i + 1).map(num => `
                        <button class="aspect-square bg-zinc-800 border border-zinc-700 hover:border-gray-300 rounded-lg text-lg font-bold text-white hover:bg-zinc-700 transition-all step-pick-btn" data-val="${num}">
                            ${num}
                        </button>
                    `).join('')}
                </div>
                <p class="text-xs text-zinc-500">1 in 10 Chance • 10x Reward</p>
            </div>
        `;
        attachStepListeners(2);
    }

    // --- STEP 3: MASTER TIER (1-100) ---
    else if (gameState.step === 3) {
        container.innerHTML = `
            <div class="text-center">
                <div class="text-yellow-400 text-xs font-bold tracking-widest uppercase mb-2">Final Step</div>
                <h2 class="text-xl font-bold text-white mb-6">Pick the <span class="text-yellow-400">Master Prize</span></h2>
                
                <div class="max-w-xs mx-auto mb-8 relative">
                    <input type="number" id="master-input" min="1" max="100" class="w-full bg-black/50 border-2 border-yellow-500/50 rounded-2xl text-center text-5xl font-black text-white py-6 outline-none focus:border-yellow-400 transition-colors" placeholder="?">
                    <p class="text-xs text-zinc-400 mt-2">Type a number between 1 - 100</p>
                    
                    <button id="random-master" class="mt-4 text-yellow-500 text-xs font-bold uppercase hover:text-white flex items-center justify-center gap-2 mx-auto">
                        <i class="fa-solid fa-shuffle"></i> Pick Random
                    </button>
                </div>
                
                <button id="confirm-master" class="bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-3 px-8 rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                    CONFIRM SELECTION
                </button>
            </div>
        `;
        
        const input = document.getElementById('master-input');
        const btn = document.getElementById('confirm-master');
        
        input.oninput = () => {
            let val = parseInt(input.value);
            if (val > 100) input.value = 100;
            if (val < 1 && input.value !== "") input.value = 1;
            btn.disabled = !input.value;
        };

        document.getElementById('random-master').onclick = () => {
            input.value = Math.floor(Math.random() * 100) + 1;
            btn.disabled = false;
        };

        btn.onclick = () => {
            gameState.guesses[2] = parseInt(input.value);
            gameState.step = 4;
            renderStep();
        };
    }

    // --- STEP 4: BETTING (FINAL) ---
    else if (gameState.step === 4) {
        renderBettingScreen(container);
    }
}

function attachStepListeners(stepIndex) {
    document.querySelectorAll('.step-pick-btn').forEach(btn => {
        btn.onclick = () => {
            const val = parseInt(btn.dataset.val);
            gameState.guesses[stepIndex - 1] = val;
            gameState.step++;
            renderStep();
        };
    });
}

function renderBettingScreen(container) {
    container.innerHTML = `
        <div class="text-center">
            <div class="flex justify-between items-center mb-6 bg-zinc-800/50 rounded-xl p-2">
                <button onclick="FortunePoolPage.reset()" class="text-xs text-zinc-500 hover:text-white px-3"><i class="fa-solid fa-arrow-left"></i> Reset Picks</button>
                <div class="flex gap-2">
                    <div class="w-8 h-8 rounded bg-amber-900/30 border border-amber-500/50 flex items-center justify-center text-amber-500 font-bold text-sm">${gameState.guesses[0]}</div>
                    <div class="w-8 h-8 rounded bg-gray-800/50 border border-gray-500/50 flex items-center justify-center text-gray-300 font-bold text-sm">${gameState.guesses[1]}</div>
                    <div class="w-8 h-8 rounded bg-yellow-900/30 border border-yellow-500/50 flex items-center justify-center text-yellow-400 font-bold text-sm">${gameState.guesses[2]}</div>
                </div>
            </div>

            <div id="slot-display-area" class="hidden mb-6">
                <div class="grid grid-cols-3 gap-2">
                    <div id="res-slot-1" class="bg-zinc-900 rounded-lg p-4 text-2xl font-mono font-bold text-zinc-500">?</div>
                    <div id="res-slot-2" class="bg-zinc-900 rounded-lg p-4 text-2xl font-mono font-bold text-zinc-500">?</div>
                    <div id="res-slot-3" class="bg-zinc-900 rounded-lg p-4 text-2xl font-mono font-bold text-zinc-500">?</div>
                </div>
            </div>

            <div id="bet-controls">
                <h3 class="text-white font-bold mb-4">Place your Bet</h3>
                
                <div class="bg-black/60 p-2 rounded-xl border border-zinc-700/50 mb-4 flex items-center gap-2">
                    <input type="number" id="commitInput" class="w-full bg-transparent p-3 text-white font-mono text-xl font-bold outline-none placeholder-zinc-700 text-center" placeholder="Amount">
                    <span class="text-zinc-500 font-bold pr-4">BKC</span>
                </div>

                <div class="flex justify-center gap-2 mb-6">
                    <button class="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1 rounded transition" onclick="document.getElementById('commitInput').value=10; handleInput()">10</button>
                    <button class="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1 rounded transition" onclick="document.getElementById('commitInput').value=50; handleInput()">50</button>
                    <button class="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1 rounded transition" onclick="document.getElementById('commitInput').value=100; handleInput()">100</button>
                </div>

                <div class="flex justify-center mb-6">
                    <div class="bg-zinc-900 p-1 rounded-lg flex items-center gap-3 border border-zinc-700 cursor-pointer" onclick="toggleMode()">
                        <div class="w-10 h-6 bg-zinc-700 rounded-full relative transition-colors duration-300" id="modeToggleBg">
                            <div class="w-4 h-4 bg-white rounded-full absolute top-1 left-1 transition-transform duration-300" id="modeToggleCircle"></div>
                        </div>
                        <span id="modeLabel" class="text-xs text-zinc-400 font-bold">Standard Mode (1x Fee)</span>
                    </div>
                </div>

                <button id="activateButton" class="w-full bg-zinc-700 text-zinc-400 font-bold py-4 rounded-xl cursor-not-allowed transition-all" disabled>
                    ENTER AMOUNT
                </button>
            </div>
            
            <div id="game-status-msg" class="mt-4 text-sm font-bold text-amber-400 hidden"></div>
        </div>
    `;

    document.getElementById('commitInput').addEventListener('input', handleInput);
    document.getElementById('activateButton').addEventListener('click', executePurchase);
}

// --- HELPERS INTERNOS ---

function handleInput() {
    const input = document.getElementById('commitInput');
    const btn = document.getElementById('activateButton');
    const val = parseFloat(input.value);

    if (val > 0) {
        btn.disabled = false;
        btn.className = "w-full bg-gradient-to-b from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-black font-black py-4 rounded-xl shadow-lg shadow-amber-900/20 transform transition hover:-translate-y-0.5 text-lg tracking-wide";
        btn.innerHTML = `SPIN & WIN <i class="fa-solid fa-play ml-2"></i>`;
    } else {
        btn.disabled = true;
        btn.className = "w-full bg-zinc-700 text-zinc-400 font-bold py-4 rounded-xl cursor-not-allowed";
        btn.innerHTML = "ENTER AMOUNT";
    }
}

function toggleMode() {
    gameState.isCumulative = !gameState.isCumulative;
    const bg = document.getElementById('modeToggleBg');
    const circle = document.getElementById('modeToggleCircle');
    const label = document.getElementById('modeLabel');

    if (gameState.isCumulative) {
        bg.classList.remove('bg-zinc-700'); bg.classList.add('bg-purple-600');
        circle.style.transform = 'translateX(16px)';
        label.innerHTML = '<span class="text-purple-400">Cumulative Mode (5x Fee)</span>';
    } else {
        bg.classList.remove('bg-purple-600'); bg.classList.add('bg-zinc-700');
        circle.style.transform = 'translateX(0px)';
        label.innerHTML = '<span class="text-zinc-400">Standard Mode (1x Fee)</span>';
    }
    FortunePoolPage.checkReqs();
}

// ============================================
// 2. LÓGICA DE JOGO (ANIMAÇÃO & ORACLE)
// ============================================

function startResultAnimation() {
    const display = document.getElementById('slot-display-area');
    const controls = document.getElementById('bet-controls');
    const msg = document.getElementById('game-status-msg');
    
    if(display) display.classList.remove('hidden');
    if(controls) controls.classList.add('opacity-50', 'pointer-events-none');
    if(msg) { msg.classList.remove('hidden'); msg.innerText = "ORACLE IS ROLLING..."; }

    gameState.isSpinning = true;
    
    if (gameState.spinInterval) clearInterval(gameState.spinInterval);
    gameState.spinInterval = setInterval(() => {
        const s1 = document.getElementById('res-slot-1');
        const s2 = document.getElementById('res-slot-2');
        const s3 = document.getElementById('res-slot-3');
        if(s1) {
            s1.innerText = Math.floor(Math.random() * 3) + 1;
            s2.innerText = Math.floor(Math.random() * 10) + 1;
            s3.innerText = Math.floor(Math.random() * 100) + 1;
        }
    }, 80);
}

function stopResultAnimation(rolls, prizeWon) {
    clearInterval(gameState.spinInterval);
    clearInterval(gameState.pollInterval);
    gameState.isSpinning = false;

    const els = [
        document.getElementById('res-slot-1'),
        document.getElementById('res-slot-2'),
        document.getElementById('res-slot-3')
    ];

    if(!els[0]) return;

    rolls.forEach((val, idx) => {
        setTimeout(() => {
            const el = els[idx];
            el.innerText = val;
            
            // Verifica Vitória Localmente
            if (val === gameState.guesses[idx]) {
                el.classList.remove('bg-zinc-900', 'text-zinc-500');
                el.classList.add('bg-green-500', 'text-white', 'shadow-lg', 'scale-110');
            } else {
                el.classList.remove('text-zinc-500');
                el.classList.add('text-red-400');
            }
        }, idx * 600);
    });

    setTimeout(() => {
        const msg = document.getElementById('game-status-msg');
        const prizeFloat = parseFloat(formatBigNumber(BigInt(prizeWon)));
        
        if (prizeWon > 0n) {
            msg.innerHTML = `<span class="text-green-400 text-xl">🎉 YOU WON ${prizeFloat.toFixed(2)} BKC!</span>`;
            showToast(`WINNER! +${prizeFloat} BKC`, "success");
            addXP(200);
        } else {
            msg.innerHTML = `<span class="text-zinc-400">No match this time. Try again!</span>`;
            addXP(20);
        }

        // Reset UI após 3s
        setTimeout(() => {
            const controls = document.getElementById('bet-controls');
            if(controls) controls.classList.remove('opacity-50', 'pointer-events-none');
            const btn = document.getElementById('activateButton');
            if(btn) {
                btn.disabled = false;
                btn.innerHTML = `PLAY AGAIN <i class="fa-solid fa-rotate-right ml-2"></i>`;
                btn.classList.remove('cursor-not-allowed');
            }
            FortunePoolPage.loadHistory();
            loadUserData(true);
        }, 3000);

    }, 2000);
}

// ============================================
// 3. TRANSAÇÃO
// ============================================

async function executePurchase() {
    if (!State.isConnected) return showToast("Connect wallet first.", "error");
    const input = document.getElementById('commitInput');
    const amount = parseFloat(input?.value) || 0;
    if (amount <= 0) return;

    const amountWei = ethers.parseEther(amount.toString());
    if (amountWei > State.currentUserBalance) return showToast("Insufficient Balance.", "error");

    // Oracle Fee
    let fee = State.systemData?.oracleFeeInWei ? BigInt(State.systemData.oracleFeeInWei) : 0n;
    if (gameState.isCumulative) fee = fee * 5n;

    const btn = document.getElementById('activateButton');
    btn.disabled = true;
    btn.innerHTML = '<div class="loader inline-block"></div> WAITING...';

    try {
        // Approve
        const allowance = await State.bkcTokenContract.allowance(State.userAddress, addresses.fortunePool);
        if (allowance < amountWei) {
            const tx = await State.bkcTokenContract.approve(addresses.fortunePool, amountWei);
            await tx.wait();
        }

        // Play
        const tx = await State.actionsManagerContract.participate(
            amountWei,
            gameState.guesses,
            gameState.isCumulative,
            { value: fee }
        );
        
        btn.innerHTML = "MINING...";
        await tx.wait();

        // Animation & Polling
        startResultAnimation();
        
        const currentCounter = await safeContractCall(State.actionsManagerContract, 'gameCounter', [], 0, 2, true);
        checkGameResultLoop(Number(currentCounter));

    } catch (e) {
        console.error(e);
        showToast("Transaction failed.", "error");
        btn.disabled = false;
        btn.innerHTML = "TRY AGAIN";
    }
}

async function checkGameResultLoop(gameId) {
    let attempts = 0;
    if (gameState.pollInterval) clearInterval(gameState.pollInterval);

    gameState.pollInterval = setInterval(async () => {
        attempts++;
        if (attempts > 60) {
            clearInterval(gameState.pollInterval);
            showToast("Oracle slow. Check history.", "info");
            stopResultAnimation([0,0,0], 0n);
            return;
        }

        try {
            const result = await safeContractCall(State.actionsManagerContract, 'gameResults', [gameId], null, 2, true);
            if (result && result.length === 3 && Number(result[0]) !== 0) {
                clearInterval(gameState.pollInterval);
                
                let visualPrize = 0n;
                let wins = 0;
                if (Number(result[0]) === gameState.guesses[0]) wins++;
                if (Number(result[1]) === gameState.guesses[1]) wins++;
                if (Number(result[2]) === gameState.guesses[2]) wins++;
                
                if (wins > 0) visualPrize = 1n; // Trigger win effect
                
                stopResultAnimation([Number(result[0]), Number(result[1]), Number(result[2])], visualPrize);
            }
        } catch (e) {}
    }, 3000);
}

// ============================================
// 4. GAMIFICATION & EXPORT
// ============================================

function updateGamificationUI() {
    const lvlEl = document.getElementById('currentLevel');
    const progFillEl = document.getElementById('progressFill');
    if (lvlEl) lvlEl.textContent = gameState.currentLevel;
    if (progFillEl) {
        const percentage = Math.min((gameState.currentXP / gameState.xpPerLevel) * 100, 100);
        progFillEl.style.width = `${percentage}%`;
    }
}

export const FortunePoolPage = {
    reset: () => {
        gameState.step = 0;
        gameState.guesses = [0,0,0];
        renderStep();
    },

    loadPoolBalance: async () => {
        if (!State.actionsManagerContractPublic) return;
        try {
            const balance = await safeContractCall(State.actionsManagerContractPublic, 'prizePoolBalance', [], 0n, 2, true);
            const el = document.getElementById('totalPool');
            if (el) el.innerText = formatBigNumber(balance).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' BKC';
        } catch {}
    },

    checkReqs: async () => {
        if(!State.isConnected) return;
        let fee = State.systemData?.oracleFeeInWei ? BigInt(State.systemData.oracleFeeInWei) : 0n;
        if (gameState.isCumulative) fee = fee * 5n;
        const el = document.getElementById('oracleFeeStatus');
        if(el) el.innerText = `FEE: ${ethers.formatEther(fee)} ETH`;
    },

    loadHistory: async () => {
        const list = document.getElementById('gameHistoryList');
        if(!list || !State.isConnected) return;
        try {
            const res = await fetch(`${API_ENDPOINTS.getHistory}/${State.userAddress}`);
            const data = await res.json();
            const games = data.filter(a => a.type === 'GameResult' || a.type === 'GameRequested');
            
            // Processamento simplificado para tabela
            const uniqueGames = [];
            const ids = new Set();
            
            for (const g of games) {
                const id = g.details.gameId;
                if(!ids.has(id)) {
                    ids.add(id);
                    uniqueGames.push({
                        id, 
                        win: g.type === 'GameResult' ? g.details.isWin : false,
                        amount: g.details.amount || '0',
                        time: g.timestamp
                    });
                }
            }

            list.innerHTML = uniqueGames.slice(0,5).map(g => `
                <tr class="border-b border-zinc-800/50">
                    <td class="py-2 text-zinc-500 text-xs">#${g.id}</td>
                    <td class="text-center"><span class="${g.win ? 'text-green-400' : 'text-red-400'} font-bold text-xs">${g.win ? 'WIN' : 'LOSS'}</span></td>
                    <td class="text-right text-white text-xs">${formatBigNumber(BigInt(g.amount)).toFixed(2)}</td>
                </tr>
            `).join('');
        } catch {}
    },

    render(isActive) {
        if (!isActive) return;
        const container = document.getElementById('actions');
        
        // Debug Address
        console.log("Fortune Pool Address:", addresses.fortunePool);
        if (!addresses.fortunePool) {
            container.innerHTML = `<div class="text-center text-red-500 mt-10">Error: Fortune Pool address not found in config.</div>`;
            return;
        }

        container.innerHTML = `
            <div class="fortune-pool-wrapper max-w-2xl mx-auto py-8 animate-fadeIn">
                <header class="flex justify-between items-end border-b border-zinc-800 pb-4 mb-6">
                    <div>
                        <h1 class="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-600 italic">FORTUNE POOL</h1>
                        <div class="text-xs text-zinc-500 font-mono">PRIZE POOL: <span id="totalPool" class="text-green-400 font-bold">Loading...</span></div>
                    </div>
                    <div class="text-right">
                        <div class="text-xs font-bold text-amber-500">LVL <span id="currentLevel">1</span></div>
                        <div class="w-32 h-2 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                            <div id="progressFill" class="h-full bg-amber-500 w-0"></div>
                        </div>
                    </div>
                </header>

                <div class="bg-black/40 border border-zinc-800 p-6 rounded-3xl shadow-2xl relative overflow-hidden min-h-[400px] flex flex-col justify-center">
                    <div id="game-interaction-area">
                        </div>
                </div>

                <div class="flex justify-between text-[10px] text-zinc-500 font-mono mt-4 px-4">
                    <span>Status: Operational</span>
                    <span id="oracleFeeStatus">Fee: ...</span>
                </div>

                <div class="mt-8">
                    <h4 class="text-zinc-500 text-xs font-bold uppercase mb-2 ml-2">Recent Activity</h4>
                    <div class="bg-zinc-900/50 rounded-xl overflow-hidden">
                        <table class="w-full">
                            <tbody id="gameHistoryList"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        gameState.step = 0;
        renderStep();
        this.loadPoolBalance();
        this.checkReqs();
        this.loadHistory();
        updateGamificationUI();
    }
};