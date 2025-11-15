// pages/EarnPage.js

const ethers = window.ethers;

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
import { loadUserData, loadPublicData, safeContractCall } from '../modules/data.js';
import { executeDelegation, payValidatorFee, registerValidator } from '../modules/transactions.js';
import { formatBigNumber, formatAddress, formatPStake, renderLoading, renderError, renderNoData } from '../utils.js';
import { openModal, showToast, closeModal } from '../ui-feedback.js';
import { addresses } from '../config.js';

// --- ESTADO E CONSTANTES DO MÓDULO ---
let currentDelegateValidator = null;
const ONE_DAY_IN_SECONDS = 86400;

// --- UTILS E LÓGICA DE STAKING ---

function setAmountUtil(elementId, percentage) {
    const input = document.getElementById(elementId);
    if (State.currentUserBalance !== null && State.currentUserBalance !== undefined && input) {
        // Correção para BigInts grandes
        const percentageBips = BigInt(Math.floor(percentage * 10000));
        const amount = (State.currentUserBalance * percentageBips) / 10000n;
        input.value = ethers.formatUnits(amount, 18);
        
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
window.setDelegateAmount = (p) => setAmountUtil('delegateAmountInput', p);

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
        amountWei = ethers.parseEther(amountStr);
        if (amountWei < 0n) amountWei = 0n;
    } catch {
        amountWei = 0n;
    }

    const netAmountWei = amountWei; 
    
    const durationBigInt = BigInt(durationDays);
    const etherDivisor = 1_000_000_000_000_000_000n;
    
    // Cálculo do pStake: (amount * duration_days) / 1e18
    const pStake = (netAmountWei * durationBigInt) / etherDivisor;

    netEl.textContent = `${ethers.formatUnits(netAmountWei, 18)} $BKC`;
    pStakeEl.textContent = formatPStake(pStake); 
    bonusTextEl.textContent = `x${durationDays} Day Multiplier`;

    if (durationDays > 3000) { 
         bonusTextEl.className = 'text-sm font-bold text-green-400 mt-1';
    } else if (durationDays > 1000) { 
         bonusTextEl.className = 'text-sm font-bold text-amber-400 mt-1';
    } else {
         bonusTextEl.className = 'text-sm font-bold text-zinc-400 mt-1';
    }
}


// --- RENDERIZAÇÃO DOS PAINÉIS DA PÁGINA ---

function renderValidatorsList() {
    const listEl = document.getElementById('validatorsList');
    if (!listEl) return;

    // Adiciona log de rastreamento
    console.log("TRACE: 4. Entering renderValidatorsList");

    // 1. Caso de Falha Crítica ou Contratos Não Carregados (Estado 1)
    if (State.isConnected && (!State.delegationManagerContract)) {
        listEl.innerHTML = renderError(listEl, "Contracts failed to load. Check your connection or refresh the page.");
        return;
    }

    // 2. Caso de Saldo Zero ou Desconectado (Estado 2)
    if (!State.isConnected || State.currentUserBalance === 0n) {
        // Se desconectado, o render principal da página já tratou o estado (Connect Card)
        // Se saldo é zero, renderiza card de compra/saldo insuficiente
        if(State.isConnected) {
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
        }
        return; 
    }
    
    // 3. Caso Dados Não Prontos (Estado de Loading)
    // Se State.allValidatorsData for 'null' ou 'undefined' (ainda carregando)
    if (!Array.isArray(State.allValidatorsData)) {
        listEl.innerHTML = renderLoading(listEl);
        console.log("TRACE: 4.1. Loading (Data is not array).");
        return;
    }

    // 4. Caso de NENHUM VALIDADOR ATIVO (Ajuste para o seu cenário)
    if (State.allValidatorsData.length === 0) {
        listEl.innerHTML = renderNoData(listEl, "No active validators on the network. Be the first by clicking the 'Become a Validator' tab.");
        console.log("TRACE: 4.2. Rendered No Data.");
        return;
    }

    // 5. Caso de Sucesso
    const sortedData = [...State.allValidatorsData].sort((a, b) => {
        // b.pStake e a.pStake são BigInts, a comparação direta é segura
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
                    <p class="font-mono text-zinc-400 text-sm break-all" title="${addr}">${formatAddress(addr)}</p>
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
    console.log("TRACE: 4.3. Rendered Validator List.");
}

function openDelegateModal(validatorAddr) {
    if (!State.isConnected) return showToast("Please connect your wallet first.", "error");
    
    // VERIFICAÇÃO ADICIONAL DE SALDO
    if (State.currentUserBalance === 0n) return showToast("Your $BKC balance is zero.", "error");
    
    currentDelegateValidator = validatorAddr;
    
    // ... (restante do código do modal mantido)
    const minLockDays = 1; 
    const maxLockDays = 3650;
    const defaultLockDays = 1825;

    const balanceFormatted = formatBigNumber(State.currentUserBalance).toFixed(2);

    const content = `
        <h3 class="text-2xl font-bold mb-2 text-white">Delegate & Maximize pStake</h3>
        <p class="text-sm text-zinc-400 mb-4">To Validator: <span class="font-mono text-xs py-1 px-2 rounded-md bg-zinc-900/50" title="${validatorAddr}">${formatAddress(validatorAddr)}</span></p>
        
        <div class="bg-main border border-border-color rounded-xl p-5 mb-5">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <div class="space-y-4">
                    <div>
                        <label for="delegateAmountInput" class="block text-sm font-medium text-zinc-300 mb-1">
                            Amount to Delegate
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
    
    // Anexa listener de confirmação de transação no modal
    document.getElementById('confirmDelegateBtn').addEventListener('click', async (e) => {
        e.preventDefault();
        const amountInput = document.getElementById('delegateAmountInput');
        const durationSlider = document.getElementById('delegateDurationSlider');

        const amountStr = amountInput.value;
        const durationDays = durationSlider.value;
        
        if (!amountStr || parseFloat(amountStr) <= 0) return showToast('Invalid amount.', "error");
        if (!currentDelegateValidator) return showToast('Validator address not found.', "error");

        const totalAmount = ethers.parseEther(amountStr);
        const durationSeconds = parseInt(durationDays) * ONE_DAY_IN_SECONDS;
        
        const success = await executeDelegation(currentDelegateValidator, totalAmount, durationSeconds, e.currentTarget);
        if (success) {
            closeModal(); 
            // Garante que o estado seja atualizado após a transação
            await loadPublicData(); 
            await loadUserData(); 
            await EarnPage.render(true); 
        }
    });

    // Inicializa os valores
    updateDelegationFeedback();
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
                        <p class="text-sm text-zinc-400">Step 1 of 2: Pay Fee</p>
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
                        <p class="text-sm text-zinc-400">Step 2 of 2: Self-Stake</p>
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
    
    console.log("TRACE: 5. Entering renderValidatorPanel");
    
    // 1. Verificação de Conexão e Contratos
    if (!el) return;
    if (!State.isConnected || !State.delegationManagerContract || !State.ecosystemManagerContract) {
        // Se desconectado, o render principal da página já colocou o 'Connect Card'
        return;
    }

    // Coloca o loading ANTES do bloco try
    renderLoading(el);
    
    const buyBkcLink = addresses.bkcDexPoolAddress || '#';

    try {
        console.log("TRACE: 5.1. Calling DM.validators() and DM.getMinValidatorStake().");
        const fallbackValidatorStruct = { isRegistered: false, selfStakeAmount: 0n, totalDelegatedAmount: 0n };
        const validatorInfo = await safeContractCall(State.delegationManagerContract, 'validators', [State.userAddress], fallbackValidatorStruct);
        
        let minValidatorStakeWei = await safeContractCall(State.delegationManagerContract, 'getMinValidatorStake', [], 0n); 
        
        console.log(`TRACE: 5.2. Results: isRegistered=${validatorInfo.isRegistered}, minStake=${minValidatorStakeWei}.`);
        const stakeAmount = minValidatorStakeWei;
        
        // 2. Estado: Validador Registrado
        if (validatorInfo.isRegistered) {
            el.innerHTML = `<div class="bg-sidebar border border-border-color rounded-xl p-8 text-center"><i class="fa-solid fa-shield-halved text-5xl text-green-400 mb-4"></i><h2 class="2xl font-bold">You are a Registered Validator</h2><p class="text-zinc-400 mt-1">Thank yourself for helping secure the Backchain network.</p></div>`;
            return;
        }

        // 3. Estado: Stake Mínimo Não Definido
        if (stakeAmount === 0n) {
            renderError(el, `Failed to calculate the minimum validator stake. The network supply is likely zero or not configured.`);
            return;
        }

        const hasPaid = await safeContractCall(State.delegationManagerContract, 'hasPaidRegistrationFee', [State.userAddress], false);
        console.log(`TRACE: 5.3. hasPaidRegistrationFee=${hasPaid}.`);
        
        // Stake Mínimo é necessário para a taxa E para o self-stake
        const requiredAmount = hasPaid ? stakeAmount : stakeAmount * 2n; 

        // 4. Estado: Saldo Insuficiente
        if (State.currentUserBalance < requiredAmount) {
             el.innerHTML = `<div class="bg-sidebar border border-border-color rounded-xl p-8 text-center">
                <div class="text-center p-6 border border-red-500/50 bg-red-500/10 rounded-lg space-y-3">
                    <i class="fa-solid fa-circle-exclamation text-4xl text-red-400"></i>
                    <h3 class="xl font-bold">Insufficient Balance</h3>
                    <p class="text-zinc-300">You need ${formatBigNumber(requiredAmount).toFixed(2)} $BKC (Fee + Self-Stake) to become a validator.</p>
                    <a href="${buyBkcLink}" target="_blank" rel="noopener noreferrer" class="inline-block bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2.5 px-6 rounded-lg text-md mt-4 shadow-lg hover:shadow-xl transition-all">
                        <i class="fa-solid fa-shopping-cart mr-2"></i> Buy $BKC
                    </a>
                </div>
            </div>`;
        } else {
            // 5. Estado: Pronto para pagar a taxa (Etapa 1) ou registrar (Etapa 2)
            if (!hasPaid) {
               await renderValidatorPayFeePanel(stakeAmount, el);
               console.log("TRACE: 5.4. Rendered Pay Fee Panel (Step 1).");
            } else {
               await renderValidatorRegisterPanel(stakeAmount, el);
               console.log("TRACE: 5.4. Rendered Register Validator Panel (Step 2).");
            }
        }
    } catch (e) {
        // AJUSTE CRÍTICO: Captura e mostra o erro exato do contrato
        console.error("CRITICAL ERROR in renderValidatorPanel:", e);
        const errorMessage = e.reason || e.message || 'Unknown Contract Error. Check console logs for details.';
        renderError(el, `Failed to Load Validator Panel: ${errorMessage}`);
    }
}

// --- SETUP DE LISTENERS ---

function setupEarnPageListeners() {
    DOMElements.earn.addEventListener('click', async (e) => {
        const target = e.target.closest('button') || e.target.closest('a');
        if (!target) return;
        
        // 1. ABRIR MODAL DE DELEGAÇÃO
        if (target.classList.contains('delegate-btn') || target.classList.contains('delegate-link')) {
            e.preventDefault();
            const validatorAddr = target.dataset.validator;
            openDelegateModal(validatorAddr);
            return;
        }
        
        // 2. PAGAR TAXA DE VALIDADOR (ETAPA 1)
        if (target.id === 'payFeeBtn') {
            e.preventDefault();
            console.log("TRACE: ACTION: Attempting to Pay Validator Fee.");
            // Recalcula o fee para evitar race conditions
            let feeAmount = await safeContractCall(State.delegationManagerContract, 'getMinValidatorStake', [], 0n);
            const success = await payValidatorFee(feeAmount, target);
            if (success) {
                 console.log("TRACE: ACTION: Pay Fee Success. Reloading Validator tab.");
                 // Força um re-render na aba Validator (passa para Step 2)
                 await EarnPage.setActiveTab('validator'); 
            }
            return;
        }
        
        // 3. REGISTRAR VALIDADOR (ETAPA 2)
        if (target.id === 'registerValidatorBtn') {
            e.preventDefault();
            console.log("TRACE: ACTION: Attempting to Register Validator.");
            
            const validatorAddress = State.userAddress; 
            const success = await registerValidator(validatorAddress, target);
            
            if (success) {
                console.log("TRACE: ACTION: Register Success. Reloading Earn page.");
                // Atualiza dados públicos e do usuário
                await loadPublicData(); 
                await loadUserData();
                // Força um re-render na aba Validator (passa para estado 'Registrado')
                await EarnPage.setActiveTab('validator'); 
            }
            return;
        }
    });
}

// A verificação de inicialização garante que listeners não sejam duplicados
if (!DOMElements.earn?._listenersInitialized) {
    setupEarnPageListeners();
    DOMElements.earn._listenersInitialized = true;
}


// --- OBJETO PRINCIPAL DA PÁGINA (EarnPage) ---

export const EarnPage = {
    activeTab: 'delegate',
    
    async setActiveTab(tabId) {
        this.activeTab = tabId;
        
        // 1. Atualiza botões (visual)
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

        // 2. Atualiza conteúdo (display)
        DOMElements.earn.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('hidden', content.id !== `${tabId}-content`);
        });

        // 3. Renderiza o conteúdo da aba selecionada (com verificação de conexão)
        const contentEl = document.getElementById(`${tabId}-content`);
        
        if (contentEl && !State.isConnected) {
            // Se desconectado, o render principal da página já colocou o 'Connect Card'
            return; 
        }

        // Coloca o loading (será substituído pelo render final ou pelo renderError)
        if (contentEl) renderLoading(contentEl); 

        switch (tabId) {
            case 'delegate':
                await renderValidatorsList();
                break;
            case 'validator':
                await renderValidatorPanel();
                break;
        }
    },

    async render(isUpdate = false) {
        
        console.log(`TRACE: 1. EarnPage.render called (isUpdate: ${isUpdate}).`);
        
        // --- 1. Renderização do HTML Base (Se necessário) ---
        if (!isUpdate || !DOMElements.earn.querySelector('.tab-content')) {
            // Renderiza o HTML base, APENAS com as abas Delegate e Validator
            DOMElements.earn.innerHTML = `
                <div class="container max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
                    <h1 class="text-3xl font-bold text-white mb-8">Earn Rewards</h1>
                    
                    <div class="border-b border-border-color mb-8">
                        <nav id="earn-tabs" class="-mb-px flex gap-6" aria-label="Tabs">
                            <button class="tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm" data-tab="delegate">
                                Delegate (pStake)
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
                        <div id="validator-content" class="tab-content hidden">
                            </div>
                    </div>
                </div>
            `;
            
            // Anexa os listeners de mudança de aba LOCALMENTE
            DOMElements.earn.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.setActiveTab(e.currentTarget.dataset.tab);
                });
            });
        }

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

        // --- 2. Estado: Desconectado (Renderiza Connect Cards) ---
        if (!State.isConnected) {
            console.log("TRACE: 2. Not connected. Rendering Connect Cards.");
            if(validatorsList) validatorsList.innerHTML = createConnectCard('Connect to Delegate', 'You need to connect your wallet to view the list of validators and start delegating your $BKC.', 'fa-wallet');
            const validatorContent = document.getElementById('validator-content');
            if(validatorContent) validatorContent.innerHTML = createConnectCard('Connect to Manage Validator', 'Connect your wallet to check your registration status or to become a network validator.', 'fa-user-shield');
            
            this.setActiveTab('delegate');
            return;
        }
        
        // --- 3. Estado: Conectado (Carrega e Renderiza) ---
        try {
            console.log("TRACE: 3. Connected. Calling loadPublicData and loadUserData.");
            // Tenta carregar os dados
            await Promise.all([
                loadPublicData(),
                loadUserData()
            ]);
            console.log("TRACE: 3.1. Data loaded successfully.");

        } catch (e) {
            // TRATAMENTO DE ERRO CRÍTICO NA CARGA DE DADOS
            console.error("Error loading initial EarnPage data", e);
            const errorMsg = `Critical Data Load Error: ${e.message || 'Unknown RPC/Contract error.'}`;

            // Renderiza o erro em ambas as abas
            if(validatorsList) renderError(validatorsList, errorMsg);
            const validatorContent = document.getElementById('validator-content');
            if(validatorContent) renderError(validatorContent, errorMsg);
            
            console.log("TRACE: 3.2. Data load FAILED. Rendering error message on screen.");
            // Tenta renderizar a aba ativa para expor o erro
            await this.setActiveTab(this.activeTab);
            return; 
        }
        
        // Renderiza a aba ativa
        console.log("TRACE: 4. Calling setActiveTab to render content.");
        await this.setActiveTab(this.activeTab);
    }
};