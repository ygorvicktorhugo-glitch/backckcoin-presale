// pages/EarnPage.js
// Gerencia a página "Earn", permitindo aos usuários delegar (pStake),
// executar PoP Mining e gerenciar o status de validador.

// --- IMPORTAÇÕES E CONFIGURAÇÕES GLOBAIS ---
// Importa bibliotecas, módulos de estado, transações,
// utils e o arquivo de configuração de endereços.

const ethers = window.ethers;

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
import { loadUserData, loadPublicData, safeContractCall } from '../modules/data.js';
import { executeDelegation, payValidatorFee, registerValidator, createVestingCertificate } from '../modules/transactions.js';
import { formatBigNumber, formatAddress, formatPStake, renderLoading, renderError, renderNoData } from '../utils.js';
import { openModal, showToast } from '../ui-feedback.js';
import { addresses } from '../config.js';

// --- ESTADO E CONSTANTES DO MÓDULO ---
// Variáveis de estado locais e constantes usadas pela página "Earn".

let currentDelegateValidator = null;
const ONE_DAY_IN_SECONDS = 86400;
const MINING_SERVICE_KEY = "POP_MINING_SERVICE"; 

// Constantes de distribuição do RewardManager.sol
const RECIPIENT_BONUS_BIPS = 1000; 
const TREASURY_SHARE_BIPS = 1000; 
const MINER_SHARE_BIPS = 1500;     
const DELEGATOR_SHARE_BIPS = 6500; 

let currentScarcityRate = 0; 


// --- UTILS E LÓGICA DE MINERAÇÃO ---
// Funções de ajuda para a UI. 'setAmountUtil' preenche inputs com
// percentuais do saldo. 'updateDelegationFeedback' e 'updateMiningDistribution'
// atualizam os painéis de estimativa em tempo real.

function setAmountUtil(elementId, percentage) {
    const input = document.getElementById(elementId);
    if (State.currentUserBalance > 0n && input) {
        const amount = (State.currentUserBalance * BigInt(Math.floor(percentage * 10000))) / 10000n;
        input.value = ethers.formatUnits(amount, 18);
        
        if (elementId === 'delegateAmountInput') updateDelegationFeedback();
        if (elementId === 'certificateAmountInput') updateMiningDistribution();
    }
}
window.setDelegateAmount = (p) => setAmountUtil('delegateAmountInput', p);
window.setCertificateAmount = (p) => setAmountUtil('certificateAmountInput', p);

function updateDelegationFeedback() {
    const amountInput = document.getElementById('delegateAmountInput');
    const durationSlider = document.getElementById('delegateDurationSlider');
    const pStakeEl = document.getElementById('modalPStakeEl');
    const netEl = document.getElementById('modalNetAmountEl');

    if (!amountInput || !durationSlider || !pStakeEl || !netEl) return;

    const amountStr = amountInput.value || '0';
    const durationDays = parseInt(durationSlider.value, 10);
    
    let amount = 0;
    try {
        amount = parseFloat(amountStr);
        if (isNaN(amount) || amount < 0) amount = 0;
    } catch(e) { amount = 0; }
    
    const netAmount = amount; 
    const pStake = netAmount * durationDays;

    netEl.textContent = `${netAmount.toFixed(4)} $BKC`;
    pStakeEl.textContent = formatPStake(pStake.toFixed(0));
}

/**
 * Tenta buscar a taxa de cunhagem (Scarcity Rate) do RewardManager.
 * Usa 99.99% como fallback em caso de escassez extrema ou falha na leitura.
 */
async function loadScarcityRate() {
    try {
        if (!State.rewardManagerContract) {
            console.warn("loadScarcityRate: RewardManagerContract não está pronto. Usando fallback.");
            currentScarcityRate = 0.9999;
            return;
        }

        const totalMintForOneToken = await safeContractCall(
            State.rewardManagerContract, 
            'getMintRate', 
            [ethers.parseEther('1')], 
            ethers.parseEther('0.5') // Fallback 50%
        );

        let rate = Number(ethers.formatUnits(totalMintForOneToken, 18));
        
        // Lógica de escassez extrema (99.99%)
        if (rate >= 0.9999 || rate >= 1.0) { 
            currentScarcityRate = 0.9999;
        } else if (rate <= 0 || rate > 1.5) { 
            currentScarcityRate = 0.5; // Fallback se houver erro
        } else {
            currentScarcityRate = rate;
        }

    } catch (e) {
        console.warn("Falha ao buscar Scarcity Rate do RM. Usando 99.99% como fallback para alta escassez.", e);
        currentScarcityRate = 0.9999; 
    }
}


/**
 * Atualiza o painel de distribuição de mineração com base no input do usuário.
 */
function updateMiningDistribution() {
    const amountInput = document.getElementById('certificateAmountInput');
    const outputEl = document.getElementById('mining-distribution-details');
    const scarcityEl = document.getElementById('currentScarcityRateDisplay');

    if (!amountInput || !outputEl || !scarcityEl) return;

    // Exibição da Taxa
    scarcityEl.textContent = (currentScarcityRate === 0.9999) ? 
        `99.99%` : 
        `${(currentScarcityRate * 100).toFixed(2)}%`;
    
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

    // 1. Cunhagem Total Estimada (Total Mint Amount)
    const totalMintAmount = purchaseAmount * currentScarcityRate;

    // 2. Distribuição
    const recipientBonus = totalMintAmount * (RECIPIENT_BONUS_BIPS / 10000); 
    const minerReward = totalMintAmount * (MINER_SHARE_BIPS / 10000);       
    const delegatorPool = totalMintAmount * (DELEGATOR_SHARE_BIPS / 10000); 
    const treasuryShare = totalMintAmount * (TREASURY_SHARE_BIPS / 10000); 
    
    const finalVestingAmount = purchaseAmount + recipientBonus;
    
    // 3. Renderização
    outputEl.innerHTML = `
        <div class="space-y-3">
            <div class="flex justify-between items-center bg-green-900/40 p-2 rounded">
                <span class="font-bold text-green-400">Total Vesting Amount (NFT):</span>
                <span class="font-bold text-lg text-green-400">${finalVestingAmount.toFixed(4)} $BKC</span>
            </div>
            
            <div class="flex justify-between items-center">
                <span class="text-zinc-400"><i class="fa-solid fa-plus-circle text-amber-400 mr-1"></i> Recipient Bonus (10% of Mint):</span>
                <span class="font-semibold text-amber-400">+ ${recipientBonus.toFixed(4)} $BKC 
                    <i class="fa-solid fa-circle-question text-zinc-500 ml-1 cursor-pointer" data-info-id="bonus"></i>
                </span>
            </div>
            <div class="flex justify-between items-center border-t border-border-color pt-2">
                <span class="text-zinc-400"><i class="fa-solid fa-user-shield text-purple-400 mr-1"></i> Miner Reward (15% of Mint):</span>
                <span class="font-semibold text-purple-400">${minerReward.toFixed(4)} $BKC
                    <i class="fa-solid fa-circle-question text-zinc-500 ml-1 cursor-pointer" data-info-id="miner"></i>
                </span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-zinc-400"><i class="fa-solid fa-coins text-cyan-400 mr-1"></i> Delegator Pool (65% of Mint):</span>
                <span class="font-semibold text-cyan-400">${delegatorPool.toFixed(4)} $BKC
                    <i class="fa-solid fa-circle-question text-zinc-500 ml-1 cursor-pointer" data-info-id="delegator"></i>
                </span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-zinc-400"><i class="fa-solid fa-vault text-blue-400 mr-1"></i> Treasury Share (10% of Mint):</span>
                <span class="font-semibold text-blue-400">${treasuryShare.toFixed(4)} $BKC
                    <i class="fa-solid fa-circle-question text-zinc-500 ml-1 cursor-pointer" data-info-id="treasury"></i>
                </span>
            </div>
        </div>
    `;
}

// --- RENDERIZAÇÃO DOS PAINÉIS DA PÁGINA ---
// Funções responsáveis por construir o HTML de cada
// componente principal e modal da página "Earn".

/**
 * Renderiza a lista de validadores na aba "Delegate".
 * Se o usuário estiver conectado mas com saldo zero, mostra um card "Buy $BKC".
 */
function renderValidatorsList() {
    const listEl = document.getElementById('validatorsList');
    if (!listEl) return;

    // Se estiver conectado mas com saldo zero, mostra o card "Buy $BKC".
    if (State.currentUserBalance === 0n) {
        const buyBkcLink = addresses.mainLPPairAddress || '#';
        
        listEl.innerHTML = `
            <div class="col-span-1 lg:col-span-2">
                <div class="text-center p-6 border border-red-500/50 bg-red-500/10 rounded-lg space-y-3 max-w-2xl mx-auto">
                    <i class="fa-solid fa-circle-exclamation text-4xl text-red-400"></i>
                    <h3 class="xl font-bold">Insufficient Balance</h3>
                    <p class="text-zinc-300">You need $BKC in your wallet to delegate to a validator.</p>
                    
                    <a href="${buyBkcLink}" rel="noopener noreferrer" class="inline-block bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2.5 px-6 rounded-lg text-md mt-4 shadow-lg hover:shadow-xl transition-all">
                        <i class="fa-solid fa-shopping-cart mr-2"></i> Buy $BKC
                    </a>
                </div>
            </div>
        `;
        return; // Para a execução aqui
    }

    // Se o saldo for > 0, continua a lógica original...
    
    if (!State.allValidatorsData) {
        listEl.innerHTML = renderLoading(listEl);
        return;
    }

    if (State.allValidatorsData.length === 0) {
        listEl.innerHTML = renderNoData(listEl, "No active validators on the network.");
        return;
    }

    // Ordena os validadores por pStake (maior primeiro)
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

/**
 * Abre o modal para o usuário inserir valor e duração da delegação.
 */
function openDelegateModal(validatorAddr) {
    if (!State.isConnected) return showToast("Please connect your wallet first.", "error");
    currentDelegateValidator = validatorAddr;
    
    const minLockDays = 1; 
    const maxLockDays = 3650; 
    const defaultLockDays = 1825; 

    const balanceFormatted = formatBigNumber(State.currentUserBalance).toFixed(2);
    const buyBkcLink = addresses.mainLPPairAddress || '#';

    const content = `
        <h3 class_broker.md="xl font-bold mb-4">Delegate to Validator</h3>
        <p class="text-sm text-zinc-400 mb-2">To: <span class="font-mono bg-zinc-900/50 text-zinc-400 text-xs py-1 px-2 rounded-md">${formatAddress(validatorAddr)}</span></p>
        
        <div class="flex justify-between items-center mb-4">
            <p class="text-sm text-zinc-400">Your balance: <span class="font-bold">${balanceFormatted}</span> $BKC</p>
            
            <a href="${buyBkcLink}" rel="noopener noreferrer" class="text-xs bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-1 px-3 rounded-md transition-colors">
                <i class="fa-solid fa-shopping-cart mr-1"></i> Buy $BKC
            </a>
        </div>
        <div class="space-y-4">
            <div>
                <label for="delegateAmountInput" class="block text-sm font-medium text-zinc-400 mb-2">Amount to Delegate ($BKC)</label>
                <input type="number" id="delegateAmountInput" class="form-input" placeholder="0.00" step="0.01">
                <div class="flex gap-2 mt-2">
                    <button onclick="setDelegateAmount(0.25)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">25%</button>
                    <button onclick="setDelegateAmount(0.50)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">50%</button>
                    <button onclick="setDelegateAmount(0.75)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">75%</button>
                    <button onclick="setDelegateAmount(1.00)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">100%</button>
                </div>
            </div>
            <div>
                <label for="delegateDurationSlider" class="block text-sm font-medium text-zinc-400 mb-2">Lock Duration: <span id="delegateDurationLabel" class="font-bold text-amber-400">${defaultLockDays} days</span></label>
                <input type="range" id="delegateDurationSlider" min="${minLockDays}" max="${maxLockDays}" value="${defaultLockDays}" class="w-full">
            </div>
            <div class="p-3 bg-main border border-border-color rounded space-y-2 text-sm">
                <div class="flex justify-between items-center"><span class="text-zinc-400">Delegation Fee:</span><span class="font-bold text-green-400 font-mono">0.00 $BKC (FREE)</span></div>
                <div class="flex justify-between items-center"><span class="text-zinc-400">Net Delegate Amount:</span><span id="modalNetAmountEl" class="font-bold text-green-400 font-mono">0.00 $BKC</span></div>
                <div class="border-t border-border-color my-1"></div>
                <div class="flex justify-between items-center"><span class="text-zinc-400">Estimated pStake:</span><span id="modalPStakeEl" class="font-bold text-purple-400 text-lg font-mono">0</span></div>
            </div>
            <div class="flex gap-3">
                <button id="confirmDelegateBtn" class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2 px-4 rounded-md transition-colors flex-1">Confirm Delegation</button>
                <button class="bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-2 px-4 rounded-md transition-colors closeModalBtn" id="closeModalBtn">Cancel</button>
            </div>
        </div>
    `;
    openModal(content);
    document.getElementById('delegateAmountInput').addEventListener('input', updateDelegationFeedback);
    document.getElementById('delegateDurationSlider').addEventListener('input', (e) => {
        const days = parseInt(e.target.value);
        document.getElementById('delegateDurationLabel').textContent = `${days} days`;
        updateDelegationFeedback();
    });
    updateDelegationFeedback();
}

/**
 * Renderiza o painel de PoP Mining (criação de Certificados).
 */
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
    
    const buyBkcLink = addresses.mainLPPairAddress || '#';

    // Verifica se o usuário tem o saldo mínimo (1 BKC) para mineração
    const minBalance = ethers.parseEther("1");
    if (State.currentUserBalance < minBalance) {
        el.innerHTML = `<div class="p-8 text-center">
            <div class="text-center p-6 border border-red-500/50 bg-red-500/10 rounded-lg space-y-3">
                <i class="fa-solid fa-circle-exclamation text-4xl text-red-400"></i>
                <h3 class="xl font-bold">Insufficient Balance</h3>
                <p class="text-zinc-300">You need at least 1 $BKC to execute PoP Mining.</p>
                
                <a href="${buyBkcLink}" rel="noopener noreferrer" class="inline-block bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2.5 px-6 rounded-lg text-md mt-4 shadow-lg hover:shadow-xl transition-all">
                    <i class="fa-solid fa-shopping-cart mr-2"></i> Buy $BKC
                </a>
            </div>
        </div>`;
        return;
    }
    
    // 1. Obter Requisitos do Hub
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
    
    // 2. Montar o painel
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
                            <button onclick="setCertificateAmount(0.50)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">50%</button>
                            <button onclick="setCertificateAmount(0.75)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">75%</button>
                            <button onclick="setCertificateAmount(1.00)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">100%</button>
                        </div>
                    </div>
                    
                    <div class="p-3 bg-main border border-border-color rounded space-y-2 text-sm">
                        <h3 class="font-bold mb-2">Mining Distribution Estimate</h3>
                        
                        <div class="flex justify-between items-center text-xs font-bold bg-zinc-700/50 p-1 rounded">
                            <span class="text-zinc-300">Current Scarcity Rate (Mint Factor):</span>
                            <span class="text-amber-400" id="currentScarcityRateDisplay">~${(currentScarcityRate * 100).toFixed(2)}%</span>
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
    
    // 3. Configurar listeners de interação
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

/**
 * Renderiza o painel "Etapa 1: Pagar Taxa" para se tornar validador.
 */
function renderValidatorPayFeePanel(feeAmount, el) {
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

/**
 * Renderiza o painel "Etapa 2: Registrar" para se tornar validador.
 */
function renderValidatorRegisterPanel(stakeAmount, el) {
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

/**
 * Renderiza a aba "Become a Validator", verificando o estado do usuário
 * (já é validador, precisa pagar taxa, precisa registrar, ou saldo insuficiente).
 */
async function renderValidatorPanel() {
    const el = document.getElementById('validator-content-wrapper');
    
    if (!el || !State.isConnected || !State.delegationManagerContract || !State.ecosystemManagerContract) {
        if(el) {
            el.innerHTML = renderNoData(el, 'Connect wallet and wait for contracts to load.');
        }
        return;
    }

    renderLoading(el);
    
    const buyBkcLink = addresses.mainLPPairAddress || '#';

    try {
        const fallbackValidatorStruct = { isRegistered: false, selfStakeAmount: 0n, totalDelegatedAmount: 0n };
        const validatorInfo = await safeContractCall(State.delegationManagerContract, 'validators', [State.userAddress], fallbackValidatorStruct);
        
        let minValidatorStakeWei = await safeContractCall(State.delegationManagerContract, 'getMinValidatorStake', [], 0n); 
        const stakeAmount = minValidatorStakeWei;
        
        // 1. Usuário já é validador
        if (validatorInfo.isRegistered) {
            el.innerHTML = `<div class="bg-sidebar border border-border-color rounded-xl p-8 text-center"><i class="fa-solid fa-shield-halved text-5xl text-green-400 mb-4"></i><h2 class="2xl font-bold">You are a Registered Validator</h2><p class="text-zinc-400 mt-1">Thank you for helping secure the Backchain network.</p></div>`;
            return;
        }

        if (stakeAmount === 0n) {
            renderError(el, `Failed to load validator stake amount. The network supply is likely zero or not configured.`);
            return;
        }

        // 2. Verificar se já pagou a taxa
        const hasPaid = await safeContractCall(State.delegationManagerContract, 'hasPaidRegistrationFee', [State.userAddress], false);
        const requiredAmount = hasPaid ? stakeAmount : stakeAmount * 2n; // Se não pagou, precisa do dobro (taxa + stake)

        // 3. Saldo insuficiente
        if (State.currentUserBalance < requiredAmount) {
             el.innerHTML = `<div class="bg-sidebar border border-border-color rounded-xl p-8 text-center">
                <div class="text-center p-6 border border-red-500/50 bg-red-500/10 rounded-lg space-y-3">
                    <i class="fa-solid fa-circle-exclamation text-4xl text-red-400"></i>
                    <h3 class="xl font-bold">Insufficient Balance</h3>
                    <p class="text-zinc-300">You need ${formatBigNumber(requiredAmount).toFixed(2)} $BKC to become a validator (Fee + Self-Stake).</p>
                    
                    <a href="${buyBkcLink}" rel="noopener noreferrer" class="inline-block bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2.5 px-6 rounded-lg text-md mt-4 shadow-lg hover:shadow-xl transition-all">
                        <i class="fa-solid fa-shopping-cart mr-2"></i> Buy $BKC
                    </a>
                </div>
            </div>`;
        } else {
            // 4. Saldo suficiente, renderiza a etapa correta
            if (!hasPaid) {
               renderValidatorPayFeePanel(stakeAmount, el); // Etapa 1
            } else {
               renderValidatorRegisterPanel(stakeAmount, el); // Etapa 2
            }
        }
    } catch (e) {
        console.error("CRITICAL ERROR in renderValidatorPanel:", e);
        renderError(el, `Failed to Load Validator Panel: ${e.reason || e.message}`);
    }
}

// --- SETUP DE LISTENERS ---
// Configura o listener principal da página 'Earn' (DOMElements.earn).
// Ele usa delegação de eventos para gerenciar todos os cliques
// (abrir modal, confirmar transações, tooltips de ajuda).

function setupEarnPageListeners() {
    DOMElements.earn.addEventListener('click', async (e) => {
        // Usa closest() para delegação de eventos
        const target = e.target.closest('button') || e.target.closest('a') || e.target.closest('.fa-circle-question');
        if (!target) return;
        
        // Tooltips de ajuda (PoP Mining)
        if (target.classList.contains('fa-circle-question')) {
            const infoId = target.dataset.infoId;
            let title = "";
            let message = "";
            
            switch(infoId) {
                case 'bonus':
                    title = "Recipient Bonus (10%)";
                    message = "This portion is immediately added to your Certificado de Vesting NFT, increasing its final value. It is locked for 5 years.";
                    break;
                case 'miner':
                    title = "Miner Reward (15%)";
                    message = "This amount goes to the current block validator (the miner) as a reward for processing your PoP transaction. It is added to their claimable rewards.";
                    break;
                case 'delegator':
                    title = "Delegator Pool (65%)";
                    message = "This is the largest share, distributed back into the Delegation Manager's reward pool to be paid out to all staking delegators over time.";
                    break;
                case 'treasury':
                    title = "Treasury Share (10%)";
                    message = "This amount is permanently transferred to the protocol's Treasury Wallet, used for ecosystem development, grants, and operational costs.";
                    break;
            }
            if (title) {
                 alert(`${title}:\n${message}`);
            }
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
                await loadPublicData(); // Atualiza dados públicos (lista de validadores)
                await loadUserData(); // Atualiza dados do usuário (saldo, delegações)
                await EarnPage.render(true); // Re-renderiza a página
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
                await loadUserData(); // Atualiza saldo e certificados
                await renderPopMiningPanel(); // Re-renderiza o painel de mineração
            }
            return;
        }
        
        // 4. PAGAR TAXA DE VALIDADOR (ETAPA 1)
        if (target.id === 'payFeeBtn') {
            e.preventDefault();
            let feeAmount = await safeContractCall(State.delegationManagerContract, 'getMinValidatorStake', [], 0n);
            const success = await payValidatorFee(feeAmount, target);
            if (success) await renderValidatorPanel(); // Avança para a Etapa 2
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
                await renderValidatorPanel(); // Mostra o painel "Você é um validador"
            }
            return;
        }
    });
}

// Inicializa os Listeners apenas na primeira vez que a página é carregada
if (!DOMElements.earn._listenersInitialized) {
    setupEarnPageListeners();
    DOMElements.earn._listenersInitialized = true;
}


// --- OBJETO PRINCIPAL DA PÁGINA (EarnPage) ---
// Define o objeto 'EarnPage' que será usado pelo app.js.
// Contém a função 'render', que é o ponto de entrada principal
// para desenhar o conteúdo da página com base no estado (conectado/desconectado).

export const EarnPage = {
    async render(isUpdate = false) {
        const popMiningContent = document.getElementById('pop-mining-content');
        const validatorContent = document.getElementById('validator-content-wrapper');
        const validatorsList = document.getElementById('validatorsList');

        // Função de ajuda interna para o card "Conectar"
        const createConnectCard = (title, message, iconClass) => {
            return `
                <div class="col-span-1 lg:col-span-2">
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
        // Mostra cards interativos pedindo para conectar
        if (!State.isConnected) {
            
            if(validatorsList) {
                validatorsList.innerHTML = createConnectCard(
                    'Connect to Delegate',
                    'You need to connect your wallet to view the list of validators and start delegating your $BKC.',
                    'fa-wallet' // Ícone para delegação
                );
            }
            
            if(popMiningContent) {
                popMiningContent.innerHTML = createConnectCard(
                    'Connect for PoP Mining',
                    'Connect your wallet to access the Proof-of-Purchase Mining (PoP) panel and create Vesting Certificates.',
                    'fa-gem' // Ícone para mineração
                );
            }
            
            if(validatorContent) {
                validatorContent.innerHTML = createConnectCard(
                    'Connect to Manage Validator',
                    'Connect your wallet to check your registration status or to become a network validator.',
                    'fa-user-shield' // Ícone para validador
                );
            }

            return; // Interrompe a renderização
        }
        
        // --- Estado: Conectado ---
        // Renderiza os painéis com os dados do usuário e da rede
        
        if(validatorsList) renderValidatorsList();
        
        if(popMiningContent) await renderPopMiningPanel();
        
        if(validatorContent) await renderValidatorPanel();
    }
};