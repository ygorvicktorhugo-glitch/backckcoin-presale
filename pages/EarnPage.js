// pages/EarnPage.js
// GERENCIA A PÁGINA "EARN", COM O MODAL DE DELEGAÇÃO REESTRUTURADO
// E MODAIS DE TOOLTIP CLICÁVEIS.

const ethers = window.ethers;

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
import { loadUserData, loadPublicData, safeContractCall } from '../modules/data.js';
import { executeDelegation, payValidatorFee, registerValidator, createVestingCertificate } from '../modules/transactions.js';
import { formatBigNumber, formatAddress, formatPStake, renderLoading, renderError, renderNoData } from '../utils.js';
import { openModal, showToast } from '../ui-feedback.js';
import { addresses } from '../config.js';

// --- ESTADO E CONSTANTES DO MÓDULO ---
let currentDelegateValidator = null;
const ONE_DAY_IN_SECONDS = 86400;
const MINING_SERVICE_KEY = "VESTING_SERVICE"; // Chave correta para PoP Mining

// Constantes de distribuição (baseadas no MiningManager.sol)
const TREASURY_BIPS = 1000;   // 10%
const VALIDATOR_BIPS = 1500;  // 15%
const DELEGATOR_BIPS = 7500;  // 75%
const VESTING_BONUS_BIPS = 1000; // 10% do bônus base

let currentScarcityRate = 1.0; // Padrão 1:1


// --- UTILS E LÓGICA DE MINERAÇÃO ---

function setAmountUtil(elementId, percentage) {
    const input = document.getElementById(elementId);
    // Garante que o saldo do usuário (um BigInt) exista
    if (State.currentUserBalance !== null && State.currentUserBalance !== undefined && input) {
        const amount = (State.currentUserBalance * BigInt(Math.floor(percentage * 10000))) / 10000n;
        input.value = ethers.formatUnits(amount, 18);
        
        // Dispara o evento 'input' para atualizar os previews
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
// Expõe as funções globalmente para os botões 'onclick'
window.setDelegateAmount = (p) => setAmountUtil('delegateAmountInput', p);
window.setCertificateAmount = (p) => setAmountUtil('certificateAmountInput', p);


// ✅ *** NOVO HELPER PARA MODAIS DE TOOLTIP ***
function openTooltipModal(id) {
    let title = "Information";
    let message = "No information found for this topic.";

    const tooltips = {
        // Tooltips do Modal de Delegação
        'delegate-amount': {
            title: "Amount to Delegate",
            message: "This is the total amount of $BKC you want to lock (stake). This amount will be transferred from your wallet into the secure Delegation contract."
        },
        'delegate-multiplier': {
            title: "Time Multiplier (Lock Duration)",
            message: "This is the most important factor for maximizing your rewards! The longer you lock your $BKC, the higher your 'pStake' (Power Stake) multiplier. A 10-year lock (3650 days) gives you a 3650x multiplier on your amount."
        },
        'delegate-pstake': {
            title: "What is pStake?",
            message: "pStake (Power Stake) is your earning power in the ecosystem. It determines your share of all network rewards (from PoP Mining, fees, etc.).\n\n<strong>Formula:</strong>\nYour pStake = (Amount Delegated) x (Lock Duration in Days).\n\nMaximize both to earn the most!"
        },
        // Tooltips do PoP Mining
        'bonus': {
            title: "Recipient Bonus (Vesting)",
            message: "This bonus is minted and added directly to your Vesting Certificate NFT, increasing its total value. It vests along with the principal amount."
        },
        'miner': {
            title: "Validator Pool (15%)",
            message: "This share of the minted tokens is sent to the Delegation Manager and distributed to all active Validators as a reward for securing the network."
        },
        'delegator': {
            title: "Delegator Pool (75%)",
            message: "This is the largest share, sent to the Delegation Manager and distributed to all users who are delegating (staking) their $BKC."
        },
        'treasury': {
            title: "Treasury Share (10%)",
            message: "This share is sent directly to the protocol's Treasury wallet to fund operations, development, and marketing."
        }
    };

    if (tooltips[id]) {
        title = tooltips[id].title;
        message = tooltips[id].message;
    }

    const content = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="xl font-bold text-white">${title}</h3>
            <button class="closeModalBtn text-zinc-400 hover:text-white text-2xl">&times;</button>
        </div>
        <p class="text-sm text-zinc-300" style="white-space: pre-wrap;">${message}</p>
        <button class="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2 px-4 rounded-md transition-colors mt-6 closeModalBtn">
            Got it
        </button>
    `;
    openModal(content);
}


// ✅ *** BUG DE CÁLCULO DO PSTAKE CORRIGIDO ***
function updateDelegationFeedback() {
    const amountInput = document.getElementById('delegateAmountInput');
    const durationSlider = document.getElementById('delegateDurationSlider');
    const pStakeEl = document.getElementById('modalPStakeEl');
    const netEl = document.getElementById('modalNetAmountEl');
    const bonusTextEl = document.getElementById('durationBonusText');

    if (!amountInput || !durationSlider || !pStakeEl || !netEl || !bonusTextEl) return;

    const amountStr = amountInput.value || '0';
    const durationDays = parseInt(durationSlider.value, 10);
    
    let amountWei = 0n;
    try {
        // Converte o valor de ether (ex: "10") para wei (BigInt)
        amountWei = ethers.parseEther(amountStr);
        if (amountWei < 0n) amountWei = 0n;
    } catch {
        amountWei = 0n; // Se o input for inválido (ex: "1.2.3")
    }

    const netAmountWei = amountWei; // (Taxa é 0)
    
    // ✅ CORREÇÃO: O cálculo de pStake é (Amount * LockDays)
    // Para evitar números decimais em JS, usamos BigInt
    // pStake = (amountWei * durationDays) / 1e18
    const durationBigInt = BigInt(durationDays);
    const etherDivisor = 1_000_000_000_000_000_000n; // 1e18
    
    // Multiplica primeiro, depois divide
    const pStake = (netAmountWei * durationBigInt) / etherDivisor;

    netEl.textContent = `${ethers.formatUnits(netAmountWei, 18)} $BKC`;
    pStakeEl.textContent = formatPStake(pStake); // formatPStake espera um BigInt
    bonusTextEl.textContent = `x${durationDays} Day Multiplier`;

    // Incentivo visual para durações longas
    if (durationDays > 3000) { // ~8+ anos
         bonusTextEl.className = 'text-sm font-bold text-green-400 mt-1';
    } else if (durationDays > 1000) { // ~3+ anos
         bonusTextEl.className = 'text-sm font-bold text-amber-400 mt-1';
    } else {
         bonusTextEl.className = 'text-sm font-bold text-zinc-400 mt-1';
    }
}

async function loadScarcityRate() {
    try {
        if (!State.miningManagerContractPublic) {
            console.warn("loadScarcityRate: MiningManagerContractPublic not loaded. Using 1:1 fallback.");
            currentScarcityRate = 1.0; // 1:1 ratio
            return;
        }
        const totalMintForOneToken = await safeContractCall(
            State.miningManagerContractPublic, 
            'getMintAmount', 
            [ethers.parseEther('1')], 
            ethers.parseEther('1') // Fallback 1:1
        );
        currentScarcityRate = Number(ethers.formatUnits(totalMintForOneToken, 18));
    } catch (e) {
        console.warn("Failed to fetch Mint Rate from MM. Using 1:1 as fallback.", e);
        currentScarcityRate = 1.0; 
    }
}

function updateMiningDistribution() {
    const amountInput = document.getElementById('certificateAmountInput');
    const outputEl = document.getElementById('mining-distribution-details');
    const scarcityEl = document.getElementById('currentScarcityRateDisplay');

    if (!amountInput || !outputEl || !scarcityEl) return;

    scarcityEl.textContent = `${(currentScarcityRate * 100).toFixed(0)}% (1:${currentScarcityRate.toFixed(2)})`;
    
    const amountStr = amountInput.value || '0';
    let purchaseAmount = 0;
    try {
        purchaseAmount = parseFloat(amountStr);
        if (isNaN(purchaseAmount) || purchaseAmount < 0) purchaseAmount = 0;
    } catch(e) { purchaseAmount = 0; }
    
    if (purchaseAmount === 0) {
         outputEl.innerHTML = `<p class="text-xs text-zinc-500 text-center py-2">Enter an amount above zero to view distribution estimates.</p>`;
         return;
    }

    const totalMintAmount = purchaseAmount * currentScarcityRate;

    // Distribuição (Valores do MiningManager.sol)
    const treasuryAmount = totalMintAmount * (TREASURY_BIPS / 10000);   // 10%
    const validatorAmount = totalMintAmount * (VALIDATOR_BIPS / 10000);  // 15%
    const delegatorAmount = totalMintAmount * (DELEGATOR_BIPS / 10000);  // 75%
    
    const totalPoolShares = treasuryAmount + validatorAmount + delegatorAmount;
    const baseBonusAmount = totalMintAmount - totalPoolShares; 
    
    const recipientBonus = baseBonusAmount * (VESTING_BONUS_BIPS / 10000); 
    
    const finalVestingAmount = purchaseAmount + recipientBonus;
    
    outputEl.innerHTML = `
        <div class="space-y-3">
            <div class="flex justify-between items-center bg-green-900/40 p-2 rounded">
                <span class="font-bold text-green-400">Total Vesting Amount (NFT):</span>
                <span class="font-bold text-lg text-green-400">${finalVestingAmount.toFixed(4)} $BKC</span>
            </div>
            
            <div class="flex justify-between items-center">
                <span class="text-zinc-400 flex items-center">
                    <i class="fa-solid fa-plus-circle text-amber-400 mr-1"></i> Recipient Bonus (Vesting):
                    <button class="tooltip-btn" data-tooltip-id="bonus">
                        <i class="fa-solid fa-circle-question text-zinc-500 ml-1 text-xs"></i>
                    </button>
                </span>
                <span class="font-semibold text-amber-400">+ ${recipientBonus.toFixed(4)} $BKC</span>
            </div>
            
            <div class="border-t border-border-color pt-2">
                <span class="text-xs text-zinc-400">Network Mint Distribution (Total: ${totalMintAmount.toFixed(4)} $BKC)</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-zinc-400 flex items-center">
                    <i class="fa-solid fa-user-shield text-purple-400 mr-1"></i> Validator Pool (15%):
                    <button class="tooltip-btn" data-tooltip-id="miner">
                        <i class="fa-solid fa-circle-question text-zinc-500 ml-1 text-xs"></i>
                    </button>
                </span>
                <span class="font-semibold text-purple-400">${validatorAmount.toFixed(4)} $BKC</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-zinc-400 flex items-center">
                    <i class="fa-solid fa-coins text-cyan-400 mr-1"></i> Delegator Pool (75%):
                    <button class="tooltip-btn" data-tooltip-id="delegator">
                        <i class="fa-solid fa-circle-question text-zinc-500 ml-1 text-xs"></i>
                    </button>
                </span>
                <span class="font-semibold text-cyan-400">${delegatorAmount.toFixed(4)} $BKC</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-zinc-400 flex items-center">
                    <i class="fa-solid fa-vault text-blue-400 mr-1"></i> Treasury Share (10%):
                    <button class="tooltip-btn" data-tooltip-id="treasury">
                        <i class="fa-solid fa-circle-question text-zinc-500 ml-1 text-xs"></i>
                    </button>
                </span>
                <span class="font-semibold text-blue-400">${treasuryAmount.toFixed(4)} $BKC</span>
            </div>
        </div>
    `;
}

// --- RENDERIZAÇÃO DOS PAINÉIS DA PÁGINA ---

function renderValidatorsList() {
    const listEl = document.getElementById('validatorsList');
    if (!listEl) return;

    if (State.currentUserBalance === 0n) {
        const buyBkcLink = addresses.bkcDexPoolAddress || '#';
        listEl.innerHTML = `
            <div class="col-span-1 lg:col-span-3">
                <div class="text-center p-6 border border-red-500/50 bg-red-500/10 rounded-lg space-y-3 max-w-2xl mx-auto">
                    <i class="fa-solid fa-circle-exclamation text-4xl text-red-400"></i>
                    <h3 class="xl font-bold">Insufficient Balance</h3>
                    <p class="text-zinc-300">You need $BKC in your wallet to delegate to a validator.</p>
                    <a href="${buyBkcLink}" target="_blank" rel="noopener noreferrer" class="inline-block bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2.5 px-6 rounded-lg text-md mt-4 shadow-lg hover:shadow-xl transition-all">
                        <i class="fa-solid fa-shopping-cart mr-2"></i> Buy $BKC
                    </a>
                </div>
            </div>
        `;
        return; 
    }
    
    if (!State.allValidatorsData) {
        listEl.innerHTML = renderLoading(listEl);
        return;
    }

    if (State.allValidatorsData.length === 0) {
        listEl.innerHTML = renderNoData(listEl, "No active validators on the network.");
        return;
    }

    const sortedData = [...State.allValidatorsData].sort((a, b) => {
        if (b.pStake > a.pStake) return 1;
        if (b.pStake < a.pStake) return -1;
        return 0;
    });

    const generateValidatorHtml = (validator) => {
        const { addr, pStake, selfStake, totalDelegatedAmount } = validator;
        return `
            <div class="bg-sidebar border border-border-color rounded-xl p-6 flex flex-col h-full">
                <div class="flex items-center gap-3 border-b border-border-color pb-3 mb-3">
                    <i class="fa-solid fa-user-shield text-xl text-zinc-500"></i>
                    <p class="font-mono text-zinc-400 text-sm break-all">${formatAddress(addr)}</p>
                </div>
                <div class="flex-1 space-y-2 text-sm">
                    <div class="flex justify-between items-center"><span class="text-zinc-400">Total pStake:</span><span class="font-bold text-lg text-purple-400">${formatPStake(pStake)}</span></div>
                    <div class="border-t border-border-color my-2 pt-2">
                        <div class="flex justify-between"><span class="text-zinc-400">Self-Staked:</span><span class="font-semibold">${formatBigNumber(selfStake).toFixed(2)} $BKC</span></div>
                        <div class="flex justify-between"><span class="text-zinc-400">Delegated:</span><span class="font-semibold">${formatBigNumber(totalDelegatedAmount).toFixed(2)} $BKC</span></div>
                    </div>
                </div>
                <button class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2 px-4 rounded-md transition-colors w-full mt-4 delegate-btn" data-validator="${addr}">Delegate</button>
            </div>`;
    };

    listEl.innerHTML = sortedData.map(generateValidatorHtml).join('');
}

// ✅ *** MODAL REDESENHADO ***
function openDelegateModal(validatorAddr) {
    if (!State.isConnected) return showToast("Please connect your wallet first.", "error");
    currentDelegateValidator = validatorAddr;
    
    const minLockDays = 1; 
    const maxLockDays = 3650; // 10 years
    const defaultLockDays = 1825; // 5 years

    const balanceFormatted = formatBigNumber(State.currentUserBalance).toFixed(2);

    const content = `
        <h3 class="text-2xl font-bold mb-2 text-white">Delegate & Maximize pStake</h3>
        <p class="text-sm text-zinc-400 mb-4">To Validator: <span class="font-mono text-xs py-1 px-2 rounded-md bg-zinc-900/50">${formatAddress(validatorAddr)}</span></p>
        
        <div class="bg-main border border-border-color rounded-xl p-5 mb-5">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <div class="space-y-4">
                    <div>
                        <label for="delegateAmountInput" class="block text-sm font-medium text-zinc-300 mb-1">
                            Amount to Delegate
                            <button class="tooltip-btn" data-tooltip-id="delegate-amount">
                                <i class="fa-solid fa-circle-question text-zinc-500 ml-1 text-xs"></i>
                            </button>
                        </label>
                        <div class="relative">
                            <input type="number" id="delegateAmountInput" class="form-input w-full text-2xl font-bold bg-main border-border-color focus:ring-amber-500 focus:border-amber-500 pr-16" placeholder="0.00">
                            <span class="absolute right-3 top-3 text-zinc-400 font-bold">$BKC</span>
                        </div>
                        <div class="flex justify-between items-center mt-1">
                            <span class="text-xs text-zinc-400">Balance: ${balanceFormatted}</span>
                            <div class="flex gap-1">
                                <button class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-0.5 px-2" onclick="setDelegateAmount(0.25)">25%</button>
                                <button class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-0.5 px-2" onclick="setDelegateAmount(0.30)">30%</button>
                                <button class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-0.5 px-2" onclick="setDelegateAmount(0.75)">75%</button>
                                <button class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-0.5 px-2" onclick="setDelegateAmount(1.00)">100%</button>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <label for="delegateDurationSlider" class="block text-sm font-medium text-zinc-300 mb-1">
                            Time Multiplier (Lock Duration)
                            <button class="tooltip-btn" data-tooltip-id="delegate-multiplier">
                                <i class="fa-solid fa-circle-question text-zinc-500 ml-1 text-xs"></i>
                            </button>
                        </label>
                        <input type="range" id="delegateDurationSlider" min="${minLockDays}" max="${maxLockDays}" value="${defaultLockDays}" class="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500">
                        <div class="flex justify-between text-xs text-zinc-400 mt-1">
                            <span>1 day</span>
                            <span>10 years</span>
                        </div>
                    </div>
                </div>

                <div class="flex flex-col items-center justify-center bg-sidebar rounded-lg p-4 text-center border border-purple-500/30">
                    <span class="text-sm text-zinc-400 uppercase tracking-wider">You Will Earn</span>
                    <div class="my-2">
                        <span id="modalPStakeEl" class="text-5xl font-extrabold text-purple-400">0</span>
                    </div>
                    <span class="text-2xl font-bold text-zinc-300 flex items-center">
                        pStake
                        <button class="tooltip-btn ml-2" data-tooltip-id="delegate-pstake">
                            <i class="fa-solid fa-circle-question text-zinc-500 text-base"></i>
                        </button>
                    </span>
                    <span id="durationBonusText" class="text-sm font-bold text-amber-400 mt-1">x${defaultLockDays} Day Multiplier</span>
                </div>
            </div>
        </div>

        <div class="p-3 bg-main border border-border-color rounded space-y-2 text-sm mb-5">
            <div class="flex justify-between items-center"><span class="text-zinc-400">Delegation Fee (Free):</span><span class="font-bold text-green-400 font-mono">0.00 $BKC</span></div>
            <div class="flex justify-between items-center"><span class="text-zinc-400">Net Amount to Delegate:</span><span id="modalNetAmountEl" class="font-bold text-zinc-200 font-mono">0.00 $BKC</span></div>
        </div>

        <div class="flex gap-3">
            <button class="bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-3 px-5 rounded-md transition-colors closeModalBtn" id="closeModalBtn">Cancel</button>
            <button id="confirmDelegateBtn" class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-3 px-5 rounded-md transition-colors flex-1">
                Stake & Earn pStake
            </button>
        </div>
    `;
    
    openModal(content);
    
    // Anexa listeners aos novos elementos do modal
    document.getElementById('delegateAmountInput').addEventListener('input', updateDelegationFeedback);
    document.getElementById('delegateDurationSlider').addEventListener('input', updateDelegationFeedback);
    
    // Inicializa os valores
    updateDelegationFeedback();
}

async function renderPopMiningPanel() {
    await loadScarcityRate(); 

    const el = document.getElementById('pop-mining-content');
    
    if (!el || !State.isConnected || !State.ecosystemManagerContract) {
        if(el) {
            el.innerHTML = renderNoData(el, 'Connect wallet and wait for contracts to load.');
        } 
        return;
    }

    renderLoading(el);
    
    const buyBkcLink = addresses.bkcDexPoolAddress || '#'; 

    const minBalance = ethers.parseEther("1");
    if (State.currentUserBalance < minBalance) {
        el.innerHTML = `<div class="p-8 text-center">
            <div class="text-center p-6 border border-red-500/50 bg-red-500/10 rounded-lg space-y-3">
                <i class="fa-solid fa-circle-exclamation text-4xl text-red-400"></i>
                <h3 class="xl font-bold">Insufficient Balance</h3>
                <p class="text-zinc-300">You need at least 1 $BKC to execute PoP Mining.</p>
                <a href="${buyBkcLink}" target="_blank" rel="noopener noreferrer" class="inline-block bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2.5 px-6 rounded-lg text-md mt-4 shadow-lg hover:shadow-xl transition-all">
                    <i class="fa-solid fa-shopping-cart mr-2"></i> Buy $BKC
                </a>
            </div>
        </div>`;
        return;
    }
    
    let serviceFee = 0n;
    let minPStake = 0n;
    let feeDisplay = "0.00 $BKC";

    try {
        const [fee, pStake] = await safeContractCall(
            State.ecosystemManagerContract, 
            'getServiceRequirements', 
            [MINING_SERVICE_KEY], 
            [0n, 0n]
        );
        serviceFee = fee;
        minPStake = pStake;
        feeDisplay = formatBigNumber(serviceFee).toFixed(4) + " $BKC";

    } catch(e) {
        console.warn("Could not load service requirements from Hub:", e);
        renderError(el, "Failed to load mining requirements.");
        return;
    }
    
    el.innerHTML = `
        <div class="p-6 md:p-8">
            <div class="flex flex-col md:flex-row items-center gap-6 md:gap-8">
                <div class="text-center flex-shrink-0">
                    <div class="w-28 h-28 bg-amber-500/10 rounded-full flex items-center justify-center border-2 border-amber-500/30">
                        <i class="fa-solid fa-gem text-5xl text-amber-400"></i>
                    </div>
                    <h2 class="2xl font-bold mt-4">PoP Mining</h2>
                    <p class="text-sm text-zinc-400">Create Vesting Certificates</p>
                </div>
                <div class="w-full flex-1 space-y-6">
                    
                    <h3 class="lg font-bold">1. Certificate Recipient</h3>
                    <div class="bg-main border border-border-color p-4 rounded-lg">
                         <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" value="" id="autoPopToggle" class="sr-only peer" checked>
                            <div class="w-11 h-6 bg-zinc-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                            <span class="ms-3 text-sm font-medium text-zinc-300" id="recipientModeLabel">Auto PoP (To My Wallet)</span>
                        </label>

                        <div id="recipientAddressGroup" class="mt-3" style="display: none;">
                            <p class="text-sm text-zinc-400 mb-2">Recipient Address:</p>
                            <input type="text" id="recipientAddressInput" class="form-input font-mono text-xs" placeholder="0x..." value="${State.userAddress || ''}">
                        </div>
                    </div>

                    <div>
                        <h3 class="lg font-bold">2. Purchase Amount ($BKC)</h3>
                        <p class="text-sm text-zinc-400 mb-2">Your Balance: <span id="distributorBkcBalance" class="font-bold text-amber-400">${formatBigNumber(State.currentUserBalance).toFixed(2)} $BKC</span></p>
                        <input type="number" id="certificateAmountInput" class="form-input" placeholder="e.g., 5000">
                        <div class="flex gap-2 mt-2">
                            <button onclick="setCertificateAmount(0.25)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">25%</button>
                            <button onclick="setCertificateAmount(0.30)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">30%</button>
                            <button onclick="setCertificateAmount(0.75)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">75%</button>
                            <button onclick="setCertificateAmount(1.00)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">100%</button>
                        </div>
                    </div>
                    
                    <div class="p-3 bg-main border border-border-color rounded space-y-2 text-sm">
                        <h3 class="font-bold mb-2">Mining Distribution Estimate</h3>
                        
                        <div class="flex justify-between items-center text-xs font-bold bg-zinc-700/50 p-1 rounded">
                            <span class="text-zinc-300">Current Mint Ratio:</span>
                            <span class="text-amber-400" id="currentScarcityRateDisplay">100% (1:1)</span>
                        </div>

                        <div id="mining-distribution-details" class="pt-2">
                            <p class="text-xs text-zinc-500 text-center py-2">Enter an amount above zero to view distribution estimates.</p>
                        </div>

                        <div class="border-t border-border-color pt-2 mt-2 space-y-1">
                            <div class="flex justify-between items-center"><span class="text-zinc-400">Required Min pStake:</span><span class="font-bold text-purple-400">${formatPStake(minPStake)}</span></div>
                            <div class="flex justify-between items-center"><span class="text-zinc-400">Service Fee:</span><span class="font-bold text-green-400">${feeDisplay}</span></div>
                            <p class="text-xs text-zinc-500"><i class="fa-solid fa-gas-pump mr-1"></i> Gas/Tx Fee will also apply.</p>
                        </div>
                    </div>

                    <button id="createCertificateBtn" class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-3 px-4 rounded-md transition-colors w-full text-lg">
                        <i class="fa-solid fa-person-digging mr-2"></i>Execute Mining & Create Certificate
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('autoPopToggle').addEventListener('change', (e) => {
        const isAuto = e.target.checked;
        const inputGroup = document.getElementById('recipientAddressGroup');
        const inputEl = document.getElementById('recipientAddressInput');
        const labelEl = document.getElementById('recipientModeLabel');
        if (isAuto) {
            inputGroup.style.display = 'none';
            inputEl.value = State.userAddress; 
            labelEl.textContent = 'Auto PoP (To My Wallet)';
        } else {
            inputGroup.style.display = 'block';
            inputEl.value = ''; 
            labelEl.textContent = 'Mining for Another (Manual)';
        }
    });
    document.getElementById('certificateAmountInput').addEventListener('input', updateMiningDistribution);
    updateMiningDistribution();
}

async function renderValidatorPayFeePanel(feeAmount, el) {
    el.innerHTML = `
        <div class="bg-sidebar border border-border-color rounded-xl overflow-hidden">
            <div class="p-6 md:p-8">
                <div class="flex flex-col md:flex-row items-center gap-6 md:gap-8">
                    <div class="text-center flex-shrink-0">
                        <div class="w-28 h-28 bg-blue-500/10 rounded-full flex items-center justify-center border-2 border-blue-500/30">
                            <i class="fa-solid fa-money-bill-wave text-5xl text-blue-400"></i>
                        </div>
                        <h2 class="2xl font-bold mt-4">Become a Validator</h2>
                        <p class="text-sm text-zinc-400">Step 1 of 2</p>
                    </div>
                    <div class="w-full flex-1 space-y-4">
                        <h3 class="xl font-bold">Pay Registration Fee</h3>
                        <p class="text-sm text-zinc-400">This one-time fee of <span class="font-bold text-amber-400">${formatBigNumber(feeAmount).toFixed(8)} $BKC</span> is sent to the protocol treasury to enable your validator registration.</p>
                        <button id="payFeeBtn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-md transition-colors w-full text-lg">
                            <i class="fa-solid fa-money-bill-wave mr-2"></i>Approve & Pay Fee
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function renderValidatorRegisterPanel(stakeAmount, el) {
     el.innerHTML = `
        <div class="bg-sidebar border border-border-color rounded-xl overflow-hidden">
            <div class="p-6 md:p-8">
                <div class="flex flex-col md:flex-row items-center gap-6 md:gap-8">
                    <div class="text-center flex-shrink-0">
                        <div class="w-28 h-28 bg-green-500/10 rounded-full flex items-center justify-center border-2 border-green-500/30">
                            <i class="fa-solid fa-shield-heart text-5xl text-green-400"></i>
                        </div>
                        <h2 class="2xl font-bold mt-4">Become a Validator</h2>
                        <p class="text-sm text-zinc-400">Step 2 of 2</p>
                    </div>
                    <div class="w-full flex-1 space-y-4">
                        <h3 class="xl font-bold">Self-Stake & Register</h3>
                        <p class="text-sm text-zinc-400">Your fee is paid. Now, lock <span class="font-bold text-amber-400">${formatBigNumber(stakeAmount).toFixed(8)} $BKC</span> as self-stake to finalize your registration. This amount will be locked for 5 years.</p>
                        <button id="registerValidatorBtn" class="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-md transition-colors w-full text-lg">
                            <i class="fa-solid fa-lock mr-2"></i>Approve & Register Validator
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function renderValidatorPanel() {
    const el = document.getElementById('validator-content');
    
    if (!el || !State.isConnected || !State.delegationManagerContract || !State.ecosystemManagerContract) {
        if(el) {
            el.innerHTML = renderNoData(el, 'Connect wallet and wait for contracts to load.');
        }
        return;
    }

    renderLoading(el);
    
    const buyBkcLink = addresses.bkcDexPoolAddress || '#';

    try {
        const fallbackValidatorStruct = { isRegistered: false, selfStakeAmount: 0n, totalDelegatedAmount: 0n };
        const validatorInfo = await safeContractCall(State.delegationManagerContract, 'validators', [State.userAddress], fallbackValidatorStruct);
        
        let minValidatorStakeWei = await safeContractCall(State.delegationManagerContract, 'getMinValidatorStake', [], 0n); 
        const stakeAmount = minValidatorStakeWei;
        
        if (validatorInfo.isRegistered) {
            el.innerHTML = `<div class="bg-sidebar border border-border-color rounded-xl p-8 text-center"><i class="fa-solid fa-shield-halved text-5xl text-green-400 mb-4"></i><h2 class="2xl font-bold">You are a Registered Validator</h2><p class="text-zinc-400 mt-1">Thank you for helping secure the Backchain network.</p></div>`;
            return;
        }

        if (stakeAmount === 0n) {
            renderError(el, `Failed to load validator stake amount. The network supply is likely zero or not configured.`);
            return;
        }

        const hasPaid = await safeContractCall(State.delegationManagerContract, 'hasPaidRegistrationFee', [State.userAddress], false);
        const requiredAmount = hasPaid ? stakeAmount : stakeAmount * 2n; 

        if (State.currentUserBalance < requiredAmount) {
             el.innerHTML = `<div class="bg-sidebar border border-border-color rounded-xl p-8 text-center">
                <div class="text-center p-6 border border-red-500/50 bg-red-500/10 rounded-lg space-y-3">
                    <i class="fa-solid fa-circle-exclamation text-4xl text-red-400"></i>
                    <h3 class="xl font-bold">Insufficient Balance</h3>
                    <p class="text-zinc-300">You need ${formatBigNumber(requiredAmount).toFixed(2)} $BKC to become a validator (Fee + Self-Stake).</p>
                    <a href="${buyBkcLink}" target="_blank" rel="noopener noreferrer" class="inline-block bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2.5 px-6 rounded-lg text-md mt-4 shadow-lg hover:shadow-xl transition-all">
                        <i class="fa-solid fa-shopping-cart mr-2"></i> Buy $BKC
                    </a>
                </div>
            </div>`;
        } else {
            if (!hasPaid) {
               await renderValidatorPayFeePanel(stakeAmount, el);
            } else {
               await renderValidatorRegisterPanel(stakeAmount, el);
            }
        }
    } catch (e) {
        console.error("CRITICAL ERROR in renderValidatorPanel:", e);
        renderError(el, `Failed to Load Validator Panel: ${e.reason || e.message}`);
    }
}

// --- SETUP DE LISTENERS ---

function setupEarnPageListeners() {
    DOMElements.earn.addEventListener('click', async (e) => {
        const target = e.target.closest('button') || e.target.closest('a');
        if (!target) return;
        
        // ✅ NOVO: Botão de Tooltip (Modal)
        if (target.classList.contains('tooltip-btn')) {
            e.preventDefault();
            const tooltipId = target.dataset.tooltipId;
            openTooltipModal(tooltipId); // Chama a nova função helper
            return;
        }

        // 1. ABRIR MODAL DE DELEGAÇÃO
        if (target.classList.contains('delegate-btn') || target.classList.contains('delegate-link')) {
            e.preventDefault();
            const validatorAddr = target.dataset.validator;
            openDelegateModal(validatorAddr);
            return;
        }
        
        // 2. CONFIRMAR DELEGAÇÃO (Dentro do Modal)
        if (target.id === 'confirmDelegateBtn') {
            e.preventDefault();
            const amountStr = document.getElementById('delegateAmountInput').value;
            const durationDays = document.getElementById('delegateDurationSlider').value;
            
            if (!amountStr || parseFloat(amountStr) <= 0) return showToast('Invalid amount.', 'error');
            if (!currentDelegateValidator) return showToast('Validator address not found.', 'error');

            const totalAmount = ethers.parseEther(amountStr);
            const durationSeconds = parseInt(durationDays) * ONE_DAY_IN_SECONDS;
            
            const success = await executeDelegation(currentDelegateValidator, totalAmount, durationSeconds, target);
            if (success) {
                await loadPublicData(); 
                await loadUserData(); 
                await EarnPage.render(true); 
            }
            return;
        }

        // 3. CRIAR CERTIFICADO (POP MINING)
        if (target.id === 'createCertificateBtn') {
            e.preventDefault();
            const isAuto = document.getElementById('autoPopToggle')?.checked ?? true;
            const recipientAddress = isAuto 
                ? State.userAddress 
                : document.getElementById('recipientAddressInput').value;

            const amountStr = document.getElementById('certificateAmountInput').value;
            const amount = ethers.parseEther(amountStr || '0');
            const targetBtn = e.target;
            
            if (!isAuto) {
                try {
                    ethers.getAddress(recipientAddress);
                } catch {
                    return showToast('Please enter a valid recipient address.', 'error');
                }
            }
            if (amount <= 0n) return showToast('Amount must be greater than zero.', 'error');

            const success = await createVestingCertificate(recipientAddress, amount, targetBtn);
            if (success) {
                await loadUserData(); 
                await renderPopMiningPanel(); 
            }
            return;
        }
        
        // 4. PAGAR TAXA DE VALIDADOR (ETAPA 1)
        if (target.id === 'payFeeBtn') {
            e.preventDefault();
            let feeAmount = await safeContractCall(State.delegationManagerContract, 'getMinValidatorStake', [], 0n);
            const success = await payValidatorFee(feeAmount, target);
            if (success) await renderValidatorPanel(); 
            return;
        }
        
        // 5. REGISTRAR VALIDADOR (ETAPA 2)
        if (target.id === 'registerValidatorBtn') {
            e.preventDefault();
            let stakeAmount = await safeContractCall(State.delegationManagerContract, 'getMinValidatorStake', [], 0n);
            const success = await registerValidator(stakeAmount, target);
            if (success) {
                await loadPublicData();
                await loadUserData();
                await renderValidatorPanel(); 
            }
            return;
        }
    });
}

if (!DOMElements.earn._listenersInitialized) {
    setupEarnPageListeners();
    DOMElements.earn._listenersInitialized = true;
}


// --- OBJETO PRINCIPAL DA PÁGINA (EarnPage) ---

export const EarnPage = {
    activeTab: 'delegate',
    
    // ✅ *** BUG DA ABA EM BRANCO CORRIGIDO ***
    async setActiveTab(tabId) {
        this.activeTab = tabId;
        
        // Atualiza botões
        const tabButtons = DOMElements.earn.querySelectorAll('.tab-btn');
        if (tabButtons.length > 0) {
            tabButtons.forEach(btn => {
                const isThisBtnActive = btn.dataset.tab === tabId;
                btn.classList.toggle('active', isThisBtnActive);
                btn.classList.toggle('border-amber-500', isThisBtnActive);
                btn.classList.toggle('text-amber-500', isThisBtnActive);
                btn.classList.toggle('border-transparent', !isThisBtnActive);
                btn.classList.toggle('text-zinc-400', !isThisBtnActive);
                btn.classList.toggle('hover:text-zinc-200', !isThisBtnActive);
                btn.classList.toggle('hover:border-zinc-300', !isThisBtnActive);
            });
        }

        // Atualiza conteúdo
        DOMElements.earn.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('hidden', content.id !== `${tabId}-content`);
        });

        // ✅ CORREÇÃO: Renderiza o conteúdo da aba recém-ativada
        // (Isso impede que as abas fiquem em branco)
        if (State.isConnected) {
            // Mostra loaders antes de carregar
            const contentEl = document.getElementById(`${tabId}-content`);
            if (contentEl) renderLoading(contentEl);

            switch (tabId) {
                case 'delegate':
                    await renderValidatorsList();
                    break;
                case 'pop-mining':
                    await renderPopMiningPanel();
                    break;
                case 'validator':
                    await renderValidatorPanel();
                    break;
            }
        }
    },

    async render(isUpdate = false) {
        
        if (!isUpdate || !DOMElements.earn.querySelector('.tab-content')) {
            DOMElements.earn.innerHTML = `
                <div class="container max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
                    <h1 class="text-3xl font-bold text-white mb-8">Earn Rewards</h1>
                    
                    <div class="border-b border-border-color mb-8">
                        <nav class="-mb-px flex space-x-8" aria-label="Tabs">
                            <button class="tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm" data-tab="delegate">
                                Delegate (pStake)
                            </button>
                            <button class="tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm" data-tab="pop-mining">
                                PoP Mining
                            </button>
                            <button class="tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm" data-tab="validator">
                                Become a Validator
                            </button>
                        </nav>
                    </div>

                    <div>
                        <div id="delegate-content" class="tab-content">
                            <p class="text-zinc-400 max-w-2xl mb-6">Select an active validator to delegate (stake) your $BKC. This increases your pStake, making you eligible for ecosystem rewards and services.</p>
                            <div id="validatorsList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                </div>
                        </div>
                        <div id="pop-mining-content" class="tab-content hidden">
                            </div>
                        <div id="validator-content" class="tab-content hidden">
                            </div>
                    </div>
                </div>
            `;
            
            DOMElements.earn.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.setActiveTab(e.currentTarget.dataset.tab);
                });
            });
        }

        const popMiningContent = document.getElementById('pop-mining-content');
        const validatorContent = document.getElementById('validator-content');
        const validatorsList = document.getElementById('validatorsList');

        const createConnectCard = (title, message, iconClass) => {
            return `
                <div class="col-span-1 lg:col-span-3">
                    <div class="bg-sidebar border border-border-color rounded-xl p-8 text-center flex flex-col items-center max-w-2xl mx-auto">
                        <i class="fa-solid ${iconClass} text-5xl text-zinc-600 mb-6"></i>
                        <h3 class="text-2xl font-bold mb-3">${title}</h3>
                        <p class="text-zinc-400 max-w-sm mb-8">${message}</p>
                        <button 
                            onclick="window.openConnectModal()" 
                            class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-3 px-6 rounded-md transition-colors text-lg">
                            <i class="fa-solid fa-plug mr-2"></i>
                            Connect Wallet
                        </button>
                    </div>
                </div>
            `;
        };

        // --- Estado: Desconectado ---
        if (!State.isConnected) {
            if(validatorsList) validatorsList.innerHTML = createConnectCard('Connect to Delegate', 'You need to connect your wallet to view the list of validators and start delegating your $BKC.', 'fa-wallet');
            if(popMiningContent) popMiningContent.innerHTML = createConnectCard('Connect for PoP Mining', 'Connect your wallet to access the Proof-of-Purchase Mining (PoP) panel and create Vesting Certificates.', 'fa-gem');
            if(validatorContent) validatorContent.innerHTML = createConnectCard('Connect to Manage Validator', 'Connect your wallet to check your registration status or to become a network validator.', 'fa-user-shield');
            // Define a aba 'delegate' como ativa visualmente, mesmo desconectado
            this.setActiveTab('delegate');
            return;
        }
        
        // --- Estado: Conectado ---
        try {
            // Mostra o loader para a aba ativa
            if (this.activeTab === 'delegate' && validatorsList) renderLoading(validatorsList);
            if (this.activeTab === 'pop-mining' && popMiningContent) renderLoading(popMiningContent);
            if (this.activeTab === 'validator' && validatorContent) renderLoading(validatorContent);

            // Sempre carrega os dados
            await Promise.all([
                loadPublicData(),
                loadUserData()
            ]);

        } catch (e) {
            console.error("Error loading initial EarnPage data", e);
            if(validatorsList) renderError(validatorsList, "Failed to load validator data.");
            if(popMiningContent) renderError(popMiningContent, "Failed to load mining data.");
            if(validatorContent) renderError(validatorContent, "Failed to load validator data.");
            return; 
        }
        
        // Renderiza a aba ativa
        await this.setActiveTab(this.activeTab);
    }
};