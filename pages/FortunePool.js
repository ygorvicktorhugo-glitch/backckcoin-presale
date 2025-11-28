// js/pages/FortunePool.js
// ✅ VERSÃO FINAL V11.7: "Greed Edition" - Realtime Profit Calc + Aggressive Upsell + Oracle Integration

import { State } from '../state.js';
import { loadUserData, safeContractCall, API_ENDPOINTS, loadSystemDataFromAPI } from '../modules/data.js';
import { formatBigNumber } from '../utils.js';
import { showToast } from '../ui-feedback.js';
import { addresses } from '../config.js';

const ethers = window.ethers;

// --- CSS FX ---
const style = document.createElement('style');
style.innerHTML = `
    .glass-panel {
        background: rgba(10, 10, 12, 0.9);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 193, 7, 0.15);
        box-shadow: 0 0 40px rgba(0, 0, 0, 0.9);
    }
    @keyframes coinPulse {
        0% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.3)); }
        50% { transform: scale(1.1); filter: drop-shadow(0 0 25px rgba(245, 158, 11, 0.6)); }
        100% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.3)); }
    }
    .bkc-anim { animation: coinPulse 2s infinite ease-in-out; }
    
    .progress-track { background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden; height: 8px; margin-top: 10px; }
    .progress-fill { 
        height: 100%; 
        background: linear-gradient(90deg, #f59e0b, #fbbf24); 
        width: 0%; 
        transition: width 0.5s ease-out;
        box-shadow: 0 0 15px #f59e0b;
    }
    
    .guess-box {
        background: rgba(59, 130, 246, 0.05);
        border: 1px solid rgba(59, 130, 246, 0.3);
        color: #60a5fa;
        box-shadow: inset 0 0 10px rgba(59, 130, 246, 0.05);
    }
    
    .slot-box {
        background: linear-gradient(180deg, #18181b 0%, #09090b 100%);
        border: 1px solid #3f3f46;
        color: #52525b;
        box-shadow: inset 0 0 20px #000;
        position: relative;
    }
    
    .tier-label {
        font-size: 9px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;
        text-align: center; display: block; margin-bottom: 4px; opacity: 0.8;
    }

    /* PROFIT LABELS */
    .profit-tag {
        font-family: monospace; font-size: 10px; font-weight: bold;
        text-align: center; padding: 4px; border-radius: 6px;
        background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1);
        transition: all 0.3s;
    }
    .profit-active {
        background: rgba(16, 185, 129, 0.1); border-color: #10b981; color: #10b981;
        box-shadow: 0 0 10px rgba(16, 185, 129, 0.2);
    }

    @keyframes spinBlur { 0% { filter: blur(0); transform: translateY(0); } 50% { filter: blur(6px); transform: translateY(-3px); } 100% { filter: blur(0); transform: translateY(0); } }
    .slot-spinning { animation: spinBlur 0.1s infinite; color: #71717a !important; text-shadow: 0 0 5px rgba(255,255,255,0.2); }
    
    .slot-hit { 
        border-color: #10b981 !important; color: #fff !important; 
        background: rgba(16, 185, 129, 0.2) !important;
        text-shadow: 0 0 20px #10b981; transform: scale(1.05); z-index: 10;
    }
    .slot-miss { border-color: #ef4444 !important; color: #ef4444 !important; opacity: 0.4; }
    
    .btn-action { background: linear-gradient(to bottom, #fbbf24, #d97706); color: black; font-weight: 900; letter-spacing: 1px; }
    .btn-action:hover { filter: brightness(1.1); transform: translateY(-1px); }
    .btn-action:disabled { background: #333; color: #666; cursor: not-allowed; transform: none; filter: none; }

    .hidden-force { display: none !important; }
    
    .btn-x { background: #000; border: 1px solid #333; }
    .btn-tg { background: #229ED9; }
    .btn-wa { background: #25D366; }

    /* MODE TOGGLE STYLES */
    .mode-locked { opacity: 0.6; filter: grayscale(1); pointer-events: none; border: 1px dashed #555 !important; }
    .mode-unlocked { opacity: 1; filter: grayscale(0); pointer-events: auto; border: 1px solid #a855f7 !important; }
    
    .mode-container {
        transition: all 0.3s ease;
        background: linear-gradient(90deg, #18181b 0%, #27272a 100%);
    }
    .mode-container:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(168, 85, 247, 0.15); }
    
    .mode-active-cumulative { 
        background: linear-gradient(135deg, rgba(147, 51, 234, 0.2) 0%, rgba(79, 70, 229, 0.3) 100%) !important;
        border-color: #d8b4fe !important;
        box-shadow: 0 0 25px rgba(168, 85, 247, 0.4);
    }
`;
document.head.appendChild(style);

// --- ESTADO ---
let gameState = {
    step: 0, isSpinning: false, gameId: 0, pollInterval: null, spinInterval: null,
    guesses: [0, 0, 0], isCumulative: false, betAmount: 0, lastWinAmount: 0,
    currentLevel: 1, currentXP: 0, xpPerLevel: 1000, systemReady: false
};

// Load Data
try {
    const local = localStorage.getItem('bkc_fortune_v11');
    if (local) { const p = JSON.parse(local); gameState.currentLevel = p.lvl || 1; gameState.currentXP = p.xp || 0; }
} catch (e) {}

function saveProgress() { localStorage.setItem('bkc_fortune_v11', JSON.stringify({ lvl: gameState.currentLevel, xp: gameState.currentXP })); updateGamificationUI(); }
function addXP(amount) { gameState.currentXP += amount; if (gameState.currentXP >= gameState.xpPerLevel) { gameState.currentLevel++; gameState.currentXP -= gameState.xpPerLevel; showToast(`🆙 LEVEL UP! LVL ${gameState.currentLevel}`, "success"); } saveProgress(); }

// ============================================
// 1. RENDERIZAÇÃO
// ============================================

function renderStep() {
    const container = document.getElementById('game-interaction-area');
    if (!container) return;
    container.style.opacity = '0';
    setTimeout(() => { container.innerHTML = ''; buildStepHTML(container); container.style.opacity = '1'; }, 200);
}

function buildStepHTML(container) {
    if (gameState.step === 0) {
        container.innerHTML = `
            <div class="text-center py-6">
                <img src="assets/bkc_logo_3d.png" class="w-24 h-24 mx-auto mb-6 bkc-anim" alt="Backcoin">
                <h2 class="text-4xl font-black text-white mb-2 uppercase tracking-tighter">Fortune Pool</h2>
                <p class="text-amber-500/80 text-sm mb-10 font-bold tracking-widest">PROOF OF PURCHASE MINING</p>
                <div class="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                    <button id="btn-random-all" class="glass-panel p-5 rounded-2xl hover:border-amber-500 transition-all group">
                        <div class="text-3xl mb-2">🎲</div><div class="font-bold text-white text-sm">QUICK LUCK</div>
                    </button>
                    <button id="btn-manual-pick" class="glass-panel p-5 rounded-2xl hover:border-amber-500 transition-all group">
                        <div class="text-3xl mb-2">🧠</div><div class="font-bold text-white text-sm">STRATEGY</div>
                    </button>
                </div>
            </div>`;
        document.getElementById('btn-random-all').onclick = () => { gameState.guesses = [rand(3), rand(10), rand(100)]; gameState.step = 4; renderStep(); };
        document.getElementById('btn-manual-pick').onclick = () => { gameState.step = 1; renderStep(); };
    }
    else if (gameState.step >= 1 && gameState.step <= 3) {
        const tiers = [{ max: 3, name: "BRONZE", reward: "2x" }, { max: 10, name: "SILVER", reward: "5x" }, { max: 100, name: "GOLD", reward: "100x" }];
        const t = tiers[gameState.step - 1];
        let grid = t.max <= 10 
            ? `<div class="flex flex-wrap justify-center gap-3 mb-8">${Array.from({length: t.max},(_,i)=>i+1).map(n=>`<button class="w-14 h-14 glass-panel rounded-xl font-bold text-xl text-white hover:bg-amber-500 hover:text-black transition-all step-pick-btn" data-val="${n}">${n}</button>`).join('')}</div>`
            : `<div class="max-w-xs mx-auto mb-8"><input type="number" id="master-input" class="w-full bg-black/50 border border-amber-500/30 rounded-xl text-center text-5xl py-6 text-white font-bold outline-none focus:border-amber-500" placeholder="?"><button id="confirm-master" class="w-full mt-4 btn-action py-3 rounded-xl shadow-lg" disabled>LOCK NUMBER</button></div>`;
        container.innerHTML = `<div class="text-center pt-4"><div class="text-amber-500 text-xs font-bold tracking-widest mb-2">STEP ${gameState.step}/3</div><h2 class="text-2xl font-black text-white mb-1">PICK ${t.name}</h2><p class="text-zinc-500 text-xs mb-8">Win Multiplier: <span class="text-white font-bold">${t.reward}</span></p>${grid}</div>`;
        if(t.max<=10) document.querySelectorAll('.step-pick-btn').forEach(b => b.onclick = () => { gameState.guesses[gameState.step-1] = parseInt(b.dataset.val); gameState.step++; renderStep(); });
        else { const i = document.getElementById('master-input'); const b = document.getElementById('confirm-master'); i.oninput = () => b.disabled = !i.value; b.onclick = () => { gameState.guesses[2] = parseInt(i.value); gameState.step = 4; renderStep(); }; }
    }
    else if (gameState.step === 4) {
        renderBettingScreen(container);
    }
}

function rand(max) { return Math.floor(Math.random() * max) + 1; }

function renderBettingScreen(container) {
    container.innerHTML = `
        <div class="text-center relative h-full flex flex-col justify-between" style="min-height: 430px;">
            
            <div class="absolute top-0 right-0">
                <button id="btn-reset" class="text-[10px] text-zinc-500 hover:text-white uppercase tracking-wider flex items-center gap-1 bg-zinc-900/50 px-3 py-1 rounded-lg border border-zinc-800"><i class="fa-solid fa-rotate-left"></i> Reset</button>
            </div>

            <div class="mt-8">
                <div class="grid grid-cols-3 gap-3 mb-2 px-2">
                    <span class="tier-label text-amber-600">Bronze (2x)</span>
                    <span class="tier-label text-zinc-400">Silver (5x)</span>
                    <span class="tier-label text-yellow-400">Gold (100x)</span>
                </div>

                <div class="grid grid-cols-3 gap-3 mb-3 px-2 relative z-10">
                    ${gameState.guesses.map(g => `
                        <div class="guess-box rounded-xl h-10 flex items-center justify-center font-bold text-lg shadow-lg relative">
                            ${g}
                            <div class="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-blue-500/50"><i class="fa-solid fa-arrow-down"></i></div>
                        </div>`).join('')}
                </div>

                <div class="grid grid-cols-3 gap-3 mb-3 px-2 relative z-10">
                    ${[1,2,3].map(i => `<div id="slot-${i}" class="slot-box rounded-2xl h-20 flex items-center justify-center text-4xl font-black transition-all duration-500">?</div>`).join('')}
                </div>

                <div class="grid grid-cols-3 gap-3 mb-2 px-2">
                    <div id="win-pot-1" class="profit-tag text-zinc-600">---</div>
                    <div id="win-pot-2" class="profit-tag text-zinc-600">---</div>
                    <div id="win-pot-3" class="profit-tag text-zinc-600">---</div>
                </div>
            </div>

            <div id="status-area" class="hidden-force flex-col items-center justify-center h-48 animate-fadeIn mt-4">
                <img src="assets/bkc_logo_3d.png" class="w-12 h-12 mb-3 bkc-anim" alt="Mining...">
                <div class="text-sm text-white font-bold mb-1" id="status-title">PROCESSING...</div>
                <div class="text-[10px] text-amber-500 font-mono mb-2 uppercase tracking-widest" id="status-text">INITIALIZING...</div>
                <div class="progress-track w-full max-w-xs mx-auto"><div id="progress-bar" class="progress-fill"></div></div>
            </div>

            <div id="controls-area" class="bg-zinc-900/50 p-4 rounded-3xl border border-zinc-800 transition-opacity duration-500 mt-2">
                <div class="flex items-center justify-between mb-4 bg-black/40 rounded-xl p-2 px-4 border border-zinc-700/50">
                    <span class="text-zinc-500 text-xs font-bold">BET AMOUNT</span>
                    <div class="flex items-center">
                        <input type="number" id="bet-input" class="bg-transparent text-right text-white font-mono text-xl font-bold w-24 outline-none" placeholder="0">
                        <span class="text-amber-500 font-bold text-xs ml-2">BKC</span>
                    </div>
                </div>
                
                <div class="flex justify-between gap-2 mb-4">
                    ${[10, 50, 100].map(a => `<button class="quick-bet flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold py-2 rounded-lg transition-colors" data-amt="${a}">${a}</button>`).join('')}
                </div>

                <div class="mb-4">
                    <div id="mode-toggle" class="mode-container mode-locked p-3 rounded-xl border border-zinc-700 flex items-center justify-between cursor-pointer group">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center border border-white/5 text-xl" id="mode-icon">
                                🔒
                            </div>
                            <div class="text-left">
                                <div class="text-xs font-bold text-zinc-500 transition-colors uppercase" id="mode-title">Combo Locked</div>
                                <div class="text-[9px] text-zinc-600" id="mode-desc">Place bet to unlock perks</div>
                            </div>
                        </div>
                        <div class="text-xs font-black text-zinc-700" id="mode-badge">LOCKED</div>
                    </div>
                </div>

                <button id="btn-spin" class="w-full btn-action py-4 rounded-xl shadow-lg shadow-amber-900/20 text-sm disabled:opacity-50" disabled>
                    ENTER AMOUNT
                </button>
            </div>
        </div>

        <div id="result-overlay" class="absolute inset-0 z-50 hidden flex-col items-center justify-center glass-panel rounded-3xl bg-black/95"></div>
    `;

    document.getElementById('btn-reset').onclick = () => { gameState.step = 0; renderStep(); };
    const inp = document.getElementById('bet-input');
    const btn = document.getElementById('btn-spin');
    
    const validate = () => {
        const val = parseFloat(inp.value);
        gameState.betAmount = val || 0;
        
        const toggle = document.getElementById('mode-toggle');
        const title = document.getElementById('mode-title');
        const desc = document.getElementById('mode-desc');
        const icon = document.getElementById('mode-icon');
        const badge = document.getElementById('mode-badge');

        // --- REALTIME PROFIT CALCULATION ---
        const pot1 = document.getElementById('win-pot-1');
        const pot2 = document.getElementById('win-pot-2');
        const pot3 = document.getElementById('win-pot-3');

        if (val > 0) {
            // Update Potential Wins
            pot1.innerText = `+ ${(val * 2).toLocaleString()} BKC`;
            pot1.classList.add('profit-active');
            pot2.innerText = `+ ${(val * 5).toLocaleString()} BKC`;
            pot2.classList.add('profit-active');
            pot3.innerText = `+ ${(val * 100).toLocaleString()} BKC`;
            pot3.classList.add('profit-active');

            // Unlock Toggle
            toggle.classList.remove('mode-locked');
            toggle.classList.add('mode-unlocked');
            
            if (!gameState.isCumulative) {
                title.innerText = "🔥 ACTIVATE COMBO WINNINGS";
                title.className = "text-xs font-black text-white";
                desc.innerText = "Click to enable multi-win (High Risk)";
                icon.innerHTML = "🚀";
                badge.innerText = "OFF";
                badge.className = "text-xs font-bold text-zinc-500";
            }

            btn.disabled = false;
            btn.innerText = "SPIN TO WIN";
        } else {
            // Reset
            pot1.innerText = "---"; pot1.classList.remove('profit-active');
            pot2.innerText = "---"; pot2.classList.remove('profit-active');
            pot3.innerText = "---"; pot3.classList.remove('profit-active');

            // Lock Toggle
            toggle.classList.add('mode-locked');
            toggle.classList.remove('mode-unlocked', 'god-mode-active');
            gameState.isCumulative = false;
            
            title.innerText = "Combo Locked";
            title.className = "text-xs font-bold text-zinc-500 uppercase";
            desc.innerText = "Place bet to unlock perks";
            icon.innerHTML = "🔒";
            badge.innerText = "LOCKED";

            btn.disabled = true;
            btn.innerText = "ENTER AMOUNT";
        }
        
        if (!gameState.systemReady) { btn.disabled = true; btn.innerText = "NETWORK ERROR"; }
    };

    inp.oninput = validate;
    document.querySelectorAll('.quick-bet').forEach(b => b.onclick = () => { inp.value = b.dataset.amt; validate(); });
    document.getElementById('mode-toggle').onclick = toggleMode;
    btn.onclick = executeTransaction;
    
    validate();
}

function toggleMode() {
    const inp = document.getElementById('bet-input');
    if (parseFloat(inp.value) <= 0) return; 

    gameState.isCumulative = !gameState.isCumulative;
    const container = document.getElementById('mode-toggle');
    const title = document.getElementById('mode-title');
    const desc = document.getElementById('mode-desc');
    const icon = document.getElementById('mode-icon');
    const badge = document.getElementById('mode-badge');

    if(gameState.isCumulative) {
        container.classList.add('god-mode-active');
        title.innerText = "⚡ COMBO MODE ACTIVE";
        title.className = "text-xs font-black text-white drop-shadow-md";
        desc.innerText = "Stacking wins enabled. 5x Fee applied.";
        desc.className = "text-[9px] text-purple-100";
        icon.innerHTML = "💎";
        badge.innerText = "ON";
        badge.className = "text-xs font-black text-white bg-purple-500 px-2 py-1 rounded";
    } else {
        container.classList.remove('god-mode-active');
        title.innerText = "🔥 ACTIVATE COMBO WINNINGS";
        title.className = "text-xs font-black text-white";
        desc.innerText = "Click to enable multi-win (High Risk)";
        desc.className = "text-[10px] text-zinc-400";
        icon.innerHTML = "🚀";
        badge.innerText = "OFF";
        badge.className = "text-xs font-bold text-zinc-500";
    }
    FortunePoolPage.checkReqs();
}

// ============================================
// 2. ORACLE & ANIMATIONS
// ============================================

function startSpinning() {
    gameState.isSpinning = true;
    const controls = document.getElementById('controls-area');
    const status = document.getElementById('status-area');
    controls.classList.add('hidden-force'); 
    status.classList.remove('hidden-force');
    status.classList.add('flex'); 

    [1,2,3].forEach(i => {
        const el = document.getElementById(`slot-${i}`);
        el.innerText = '?';
        el.className = "slot-box rounded-2xl h-20 flex items-center justify-center text-4xl font-black slot-spinning";
    });
    gameState.spinInterval = setInterval(() => {
        if(document.getElementById('slot-1')) document.getElementById('slot-1').innerText = rand(3);
        if(document.getElementById('slot-2')) document.getElementById('slot-2').innerText = rand(10);
        if(document.getElementById('slot-3')) document.getElementById('slot-3').innerText = rand(100);
    }, 50);

    updateProgressBar(10, "MINING TRANSACTION..."); 
}

function updateProgressBar(percent, text) {
    const bar = document.getElementById('progress-bar');
    const txt = document.getElementById('status-text');
    if(bar) bar.style.width = `${percent}%`;
    if(txt) txt.innerText = text;
}

async function stopSpinning(rolls, winAmount) {
    clearInterval(gameState.spinInterval);
    clearInterval(gameState.pollInterval);
    updateProgressBar(100, "REVEALING DESTINY...");
    
    gameState.lastWinAmount = parseFloat(formatBigNumber(BigInt(winAmount)));
    const wait = ms => new Promise(r => setTimeout(r, ms));

    const reveal = async (i) => {
        const el = document.getElementById(`slot-${i+1}`);
        if(!el) return;
        el.classList.remove('slot-spinning');
        el.innerText = rolls[i];
        if (rolls[i] === gameState.guesses[i]) el.classList.add('slot-hit');
        else el.classList.add('slot-miss');
    };

    await wait(500); await reveal(0);
    await wait(1000); await reveal(1);
    await wait(1000); await reveal(2);
    await wait(1500);

    showResultOverlay(winAmount > 0n);
}

function showResultOverlay(isWin) {
    const overlay = document.getElementById('result-overlay');
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    const marketingText = `Discover Backcoin ($BKC)! A revolutionary crypto ecosystem independent of speculation. The next BTC! I just won ${gameState.lastWinAmount.toFixed(2)} $BKC. #BKC #AIRDROP #PROOFOFPURCHASE`;
    const url = "https://backcoin.org"; 
    const encText = encodeURIComponent(marketingText);

    window.copyForInsta = () => {
        navigator.clipboard.writeText(marketingText + " " + url).then(() => {
            showToast("Text copied! Paste in Instagram.", "success");
            setTimeout(() => window.open("https://instagram.com", "_blank"), 1000);
        });
    };

    if (isWin) {
        overlay.innerHTML = `
            <div class="text-center p-6 w-full animate-fadeIn">
                <div class="text-6xl mb-4">🏆</div>
                <h2 class="text-4xl font-black text-amber-400 italic mb-2 drop-shadow-lg">BIG WIN!</h2>
                <div class="text-6xl font-mono font-bold text-white mb-6">${gameState.lastWinAmount.toFixed(2)} <span class="text-xl text-zinc-500">BKC</span></div>
                <p class="text-[10px] text-zinc-400 mb-3 uppercase tracking-widest">SHARE THE REVOLUTION</p>
                <div class="flex gap-2 mb-6 max-w-xs mx-auto">
                    <a href="https://twitter.com/intent/tweet?text=${encText}&url=${encodeURIComponent(url)}" target="_blank" class="flex-1 btn-x border border-zinc-700 py-3 rounded-xl text-white hover:scale-105 transition flex items-center justify-center"><i class="fa-brands fa-x-twitter"></i></a>
                    <a href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encText}" target="_blank" class="flex-1 btn-tg py-3 rounded-xl text-white hover:scale-105 transition flex items-center justify-center"><i class="fa-brands fa-telegram"></i></a>
                    <button onclick="window.copyForInsta()" class="flex-1 bg-gradient-to-tr from-yellow-500 via-red-500 to-purple-500 py-3 rounded-xl text-white hover:scale-105 transition flex items-center justify-center"><i class="fa-brands fa-instagram"></i></button>
                </div>
                <button id="btn-collect" class="bg-white text-black font-black py-4 px-10 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:scale-105 transition-transform">COLLECT & REPLAY</button>
            </div>`;
        addXP(500);
    } else {
        overlay.innerHTML = `
            <div class="text-center p-6 w-full animate-fadeIn">
                <div class="text-6xl mb-4 grayscale opacity-50">💔</div>
                <h2 class="text-2xl font-bold text-zinc-300 mb-2">NOT THIS TIME</h2>
                <p class="text-zinc-500 mb-8 text-sm">The Oracle is independent.<br>Proof of Purchase generated.</p>
                <button id="btn-collect" class="bg-zinc-800 text-white font-bold py-3 px-8 rounded-xl border border-zinc-600 hover:bg-zinc-700">TRY AGAIN</button>
            </div>`;
        addXP(50);
    }

    document.getElementById('btn-collect').onclick = () => {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
        document.getElementById('status-area').classList.add('hidden-force');
        document.getElementById('status-area').classList.remove('flex');
        document.getElementById('controls-area').classList.remove('hidden-force');
        document.getElementById('progress-bar').classList.remove('finish');
        document.getElementById('progress-bar').style.width = '0%';
        [1,2,3].forEach(i => {
            const el = document.getElementById(`slot-${i}`);
            el.className = "slot-box rounded-2xl h-20 flex items-center justify-center text-4xl font-black text-zinc-700 transition-all";
            el.innerText = "?";
            el.classList.remove('slot-hit', 'slot-miss');
        });
        FortunePoolPage.loadHistory();
        loadUserData(true);
    };
}

async function executeTransaction() {
    if (!State.isConnected) return showToast("Connect wallet", "error");
    if (!gameState.systemReady) { showToast("System Offline", "error"); FortunePoolPage.checkReqs(); return; }
    if (gameState.betAmount <= 0) return;

    const btn = document.getElementById('btn-spin');
    const amountWei = ethers.parseEther(gameState.betAmount.toString());
    
    if (amountWei > State.currentUserBalance) return showToast("Insufficient Balance", "error");

    let fee = State.systemData?.oracleFeeInWei ? BigInt(State.systemData.oracleFeeInWei) : 0n;
    if (gameState.isCumulative) fee = fee * 5n;

    btn.disabled = true;
    
    try {
        const allowance = await State.bkcTokenContract.allowance(State.userAddress, addresses.fortunePool);
        if (allowance < amountWei) {
            btn.innerHTML = `<div class="loader inline-block"></div> APPROVING...`;
            const tx = await State.bkcTokenContract.approve(addresses.fortunePool, ethers.MaxUint256);
            await tx.wait();
        }

        btn.innerHTML = `<div class="loader inline-block"></div> CONFIRMING...`;
        const tx = await State.actionsManagerContract.participate(amountWei, gameState.guesses, gameState.isCumulative, { value: fee });
        
        startSpinning(); 
        await tx.wait();

        updateProgressBar(40, "BLOCK MINED. WAITING ORACLE...");
        
        const ctr = await safeContractCall(State.actionsManagerContract, 'gameCounter', [], 0, 2, true);
        waitForOracle(Number(ctr));

    } catch (e) {
        console.error(e);
        btn.disabled = false;
        btn.innerText = "START MINING";
        showToast("Transaction Failed", "error");
        document.getElementById('status-area').classList.add('hidden-force');
        document.getElementById('controls-area').classList.remove('hidden-force');
    }
}

async function waitForOracle(gameId) {
    let attempts = 0;
    let progress = 40;
    if (gameState.pollInterval) clearInterval(gameState.pollInterval);

    gameState.pollInterval = setInterval(async () => {
        attempts++;
        progress += 2; 
        if(progress > 95) progress = 95;
        updateProgressBar(progress, "ORACLE CONSENSUS...");

        if (attempts > 60) {
            clearInterval(gameState.pollInterval);
            stopSpinning([0,0,0], 0n);
            showToast("Oracle delay.", "info");
            return;
        }

        try {
            const p1 = safeContractCall(State.actionsManagerContract, 'gameResults', [gameId, 0], 0n, 0, true);
            const p2 = safeContractCall(State.actionsManagerContract, 'gameResults', [gameId, 1], 0n, 0, true);
            const p3 = safeContractCall(State.actionsManagerContract, 'gameResults', [gameId, 2], 0n, 0, true);
            const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

            if (Number(r1) !== 0) {
                clearInterval(gameState.pollInterval);
                const rolls = [Number(r1), Number(r2), Number(r3)];
                
                let win = 0n;
                if(rolls[0] === gameState.guesses[0] || rolls[1] === gameState.guesses[1] || rolls[2] === gameState.guesses[2]) {
                    let mult = 0;
                    if(rolls[0]===gameState.guesses[0]) mult=2; 
                    if(rolls[1]===gameState.guesses[1]) mult= gameState.isCumulative ? mult+5 : Math.max(mult, 5); 
                    if(rolls[2]===gameState.guesses[2]) mult= gameState.isCumulative ? mult+100 : Math.max(mult, 100); 
                    win = ethers.parseEther((gameState.betAmount * mult).toString());
                }
                
                stopSpinning(rolls, win);
            }
        } catch (e) {}
    }, 2000);
}

// ... Boilerplate ...
function updateGamificationUI() { const el = document.getElementById('currentLevel'); if (el) el.innerText = gameState.currentLevel; }

export const FortunePoolPage = {
    loadPoolBalance: async () => { /* ... */ },
    checkReqs: async () => {
        const el = document.getElementById('oracleFeeStatus');
        if(!State.isConnected) { if(el) el.innerHTML = `<span class="text-zinc-500">Connect Wallet</span>`; return; }
        
        if (!State.systemData || !State.systemData.oracleFeeInWei) await loadSystemDataFromAPI();

        let fee = State.systemData?.oracleFeeInWei ? BigInt(State.systemData.oracleFeeInWei) : 0n;
        if (fee === 0n) {
            gameState.systemReady = false;
            if(el) el.innerHTML = `<span class="text-red-500 cursor-pointer font-bold" onclick="FortunePoolPage.checkReqs()">⚠️ OFFLINE</span>`;
            const btn = document.getElementById('btn-spin');
            if(btn) { btn.disabled = true; btn.innerText = "SYSTEM OFFLINE"; }
        } else {
            gameState.systemReady = true;
            if (gameState.isCumulative) fee = fee * 5n;
            if(el) el.innerText = `FEE: ${ethers.formatEther(fee)} ETH`;
            const inp = document.getElementById('bet-input');
            if(inp && parseFloat(inp.value) > 0) {
                const btn = document.getElementById('btn-spin');
                if(btn) { btn.disabled = false; btn.innerText = "SPIN TO WIN"; }
            }
        }
    },
    loadHistory: async () => {
        const list = document.getElementById('gameHistoryList');
        if(!list || !State.isConnected) return;
        try {
            const res = await fetch(`${API_ENDPOINTS.getHistory}/${State.userAddress}`);
            const data = await res.json();
            const games = data.filter(a => a.type === 'GameResult' || a.type === 'GameRequested');
            const uniqueGames = []; const ids = new Set();
            for (const g of games) {
                const id = g.details.gameId;
                if(!ids.has(id)) { ids.add(id); uniqueGames.push({ id, win: g.type === 'GameResult' ? g.details.isWin : false, amount: g.details.amount || '0', time: g.timestamp }); }
            }
            list.innerHTML = uniqueGames.slice(0,5).map(g => `
                <tr class="border-b border-zinc-800/50">
                    <td class="py-2 text-zinc-500 text-xs">#${g.id}</td>
                    <td class="text-center"><span class="${g.win ? 'text-green-400' : 'text-red-400'} font-bold text-xs">${g.win ? 'WIN' : 'LOSS'}</span></td>
                    <td class="text-right text-white text-xs">${formatBigNumber(BigInt(g.amount)).toFixed(2)}</td>
                </tr>`).join('');
        } catch {}
    },
    render(isActive) {
        if (!isActive) return;
        const container = document.getElementById('actions');
        if (!addresses.fortunePool) { container.innerHTML = "Error Config"; return; }
        
        container.innerHTML = `
            <div class="fortune-pool-wrapper max-w-2xl mx-auto py-8 animate-fadeIn">
                <header class="flex justify-between items-end border-b border-zinc-800 pb-4 mb-6">
                    <div><h1 class="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-600 italic">FORTUNE POOL</h1></div>
                    <div class="text-right"><div class="text-xs font-bold text-amber-500">LVL <span id="currentLevel">1</span></div></div>
                </header>
                <div class="glass-panel p-1 rounded-3xl relative overflow-hidden min-h-[450px] flex flex-col justify-center bg-black/40">
                    <div id="game-interaction-area" class="p-4 transition-opacity duration-300"></div>
                </div>
                <div class="flex justify-between text-[10px] text-zinc-500 font-mono mt-4 px-4"><span>System: Online</span><span id="oracleFeeStatus">Checking...</span></div>
                <div class="mt-8"><h4 class="text-zinc-500 text-xs font-bold uppercase mb-2 ml-2">Recent Activity</h4><div class="bg-zinc-900/50 rounded-xl overflow-hidden"><table class="w-full"><tbody id="gameHistoryList"></tbody></table></div></div>
            </div>`;
        
        gameState.step = 0; renderStep(); this.checkReqs(); this.loadHistory(); updateGamificationUI();
    }
};

window.FortunePoolPage = FortunePoolPage;