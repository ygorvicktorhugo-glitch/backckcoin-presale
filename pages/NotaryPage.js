// pages/NotaryPage.js
// ✅ VERSÃO FINAL V6.0: Layout Coluna Dupla + Exportação + Tratamento de Erro RPC

import { addresses } from '../config.js'; 
import { State } from '../state.js';
import { formatBigNumber, formatPStake, renderLoading, renderError, renderNoData, ipfsGateway } from '../utils.js';
import { safeContractCall, API_ENDPOINTS, loadPublicData, loadUserData } from '../modules/data.js'; 
import { showToast } from '../ui-feedback.js';
import { executeNotarizeDocument } from '../modules/transactions.js';

// --- Constantes ---
const BLOCKCHAIN_EXPLORER_TX_URL = "https://sepolia.etherscan.io/tx/";
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// --- Estado Local ---
let currentFileToUpload = null;
let currentUploadedIPFS_URI = null; 
let notaryButtonState = 'initial'; 
let pageContainer = null; 
let lastNotaryDataFetch = 0;
let rpcErrorCount = 0; // Contador de erros para fallback visual

// =========================================================================
// 1. RENDERIZAÇÃO VISUAL (LAYOUT ORIGINAL)
// =========================================================================

function renderNotaryPageLayout() {
    const container = document.getElementById('notary');
    if (!container) return;
    pageContainer = container; 

    if (container.querySelector('#notary-main-box')) return; 

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 animate-fadeIn">
            <div>
                <h1 class="text-3xl md:text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 font-display">
                    Decentralized Notary
                </h1>
                <p class="text-zinc-400 mt-2 max-w-xl text-sm leading-relaxed">
                    Certify documents permanently on the blockchain. Generate immutable proof of existence timestamped by the network.
                </p>
            </div>
            <div class="px-4 py-2 rounded-full bg-zinc-900 border border-green-500/30 text-xs font-mono text-green-400 flex items-center gap-2 shadow-lg shadow-green-900/10">
                <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> Service Active
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fadeIn animation-delay-200">

            <div class="lg:col-span-8 space-y-6">
                
                <div class="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 shadow-lg">
                    <div class="relative flex justify-between items-center z-10">
                        <div class="absolute top-1/2 left-0 w-full h-1 bg-zinc-800 -z-10 rounded-full"></div>
                        <div id="progress-line" class="absolute top-1/2 left-0 h-1 bg-blue-600 -z-10 rounded-full transition-all duration-500 w-0"></div>

                        <div id="step-indicator-1" class="step-bubble active relative group cursor-pointer" onclick="updateNotaryStep(1)">
                            <div class="w-12 h-12 rounded-full flex items-center justify-center bg-zinc-900 border-2 border-blue-500 text-white font-bold transition-all duration-300 shadow-lg shadow-blue-500/20 group-hover:scale-110">
                                <i class="fa-solid fa-cloud-arrow-up"></i>
                            </div>
                            <span class="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-blue-400 uppercase tracking-wider whitespace-nowrap">Upload</span>
                        </div>

                        <div id="step-indicator-2" class="step-bubble relative group cursor-not-allowed">
                            <div class="w-12 h-12 rounded-full flex items-center justify-center bg-zinc-900 border-2 border-zinc-700 text-zinc-500 font-bold transition-all duration-300 group-hover:border-zinc-600">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </div>
                            <span class="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-zinc-600 uppercase tracking-wider whitespace-nowrap">Details</span>
                        </div>

                        <div id="step-indicator-3" class="step-bubble relative group cursor-not-allowed">
                            <div class="w-12 h-12 rounded-full flex items-center justify-center bg-zinc-900 border-2 border-zinc-700 text-zinc-500 font-bold transition-all duration-300 group-hover:border-zinc-600">
                                <i class="fa-solid fa-fingerprint"></i>
                            </div>
                            <span class="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-zinc-600 uppercase tracking-wider whitespace-nowrap">Mint</span>
                        </div>
                    </div>
                </div>

                <div id="notary-main-box" class="bg-zinc-900/40 border border-zinc-700/50 rounded-2xl p-8 shadow-xl relative overflow-hidden min-h-[400px] flex flex-col">
                    <div id="notary-step-content" class="flex-1 flex flex-col justify-center">
                        ${renderLoading("Initializing notary steps...")}
                    </div>
                    
                    <div class="mt-6">
                        <button id="notarize-submit-btn" class="w-full bg-zinc-800 text-zinc-500 font-bold py-4 rounded-xl cursor-not-allowed transition-all flex items-center justify-center gap-3" disabled>
                            Waiting for file selection...
                        </button>
                    </div>
                </div>
            </div>

            <div class="lg:col-span-4 space-y-6">
                
                <div id="notary-user-status-box" class="bg-sidebar border border-zinc-800 rounded-2xl p-6 shadow-xl transition-all duration-500">
                    <h3 class="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <i class="fa-solid fa-wallet"></i> Requirements Check
                    </h3>
                    
                    <div id="notary-user-status" class="space-y-4">
                         <div class="flex flex-col items-center justify-center py-8 text-zinc-500">
                            <div class="loader mb-3"></div>
                            <span class="text-xs">Connecting...</span>
                         </div>
                    </div>
                </div>

                <div class="bg-gradient-to-br from-zinc-900 to-black border border-zinc-800 rounded-2xl p-6">
                    <h3 class="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Protocol Stats</h3>
                    <div id="notary-stats-container" class="space-y-3">
                        ${renderLoading("Loading stats...")}
                    </div>
                </div>
            </div>
        </div>

        <div class="mt-16 pt-10 border-t border-zinc-800 animate-fadeIn animation-delay-500">
            <h2 class="text-xl font-bold text-white mb-6">
                <i class="fa-solid fa-clock-rotate-left text-zinc-500 mr-2"></i> My Notarized Documents (<span id="notary-doc-count">0</span>)
            </h2>
            
            <div id="my-notarized-documents" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                ${renderLoading("Loading your documents...")}
            </div>
        </div>
    `;

    initNotaryListeners();
    updateNotaryStep(1); 
}

// =========================================================================
// 2. CONTROLE DE UI
// =========================================================================

function updateNotaryStep(step) {
    const content = document.getElementById('notary-step-content');
    if (!content) return;

    // Atualiza indicadores
    document.querySelectorAll('.step-bubble').forEach(el => {
        const stepNumber = parseInt(el.id.split('-').pop());
        el.classList.remove('active', 'completed');
        if (stepNumber < step) {
            el.classList.add('completed');
        } else if (stepNumber === step) {
            el.classList.add('active');
        }
    });

    // Atualiza linha de progresso
    const progressLine = document.getElementById('progress-line');
    if (progressLine) {
        if (step === 1) progressLine.style.width = '0%';
        if (step === 2) progressLine.style.width = '50%';
        if (step === 3) progressLine.style.width = '100%';
    }

    // Renderiza conteúdo
    if (step === 1) {
        content.innerHTML = `
            <h3 class="text-white text-xl font-bold mb-4">Step 1: Upload Document</h3>
            <p class="text-zinc-400 mb-6">Select the file you wish to notarize. This file will be hashed and the hash will be stored on-chain.</p>
            <input type="file" id="notary-file-input" class="w-full text-sm text-zinc-300
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-600 file:text-white
                hover:file:bg-blue-500 cursor-pointer transition-colors"
                accept=".pdf,.doc,.docx,.jpg,.png,.txt,.zip"
            />
            <p class="text-zinc-500 text-xs mt-3">Max size: 50MB. Supported formats: PDF, DOC, JPG, PNG, TXT, ZIP.</p>
        `;
        document.getElementById('notary-file-input')?.addEventListener('change', handleFileSelection);

    } else if (step === 2) {
        content.innerHTML = `
            <h3 class="text-white text-xl font-bold mb-4">Step 2: Add Details</h3>
            <p class="text-zinc-400 mb-6">Provide an optional description for your document.</p>
            <textarea id="notary-user-description" rows="4" class="w-full p-4 bg-zinc-800 rounded-lg border border-zinc-700 text-white placeholder-zinc-500 focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., Contract for the sale of the asset X...">${document.getElementById('notary-user-description')?.value || ''}</textarea>
            <div class="mt-4 flex justify-between items-center">
                <button id="notary-back-to-file-btn" class="text-zinc-400 hover:text-white transition-colors text-sm">
                    <i class="fa-solid fa-arrow-left mr-2"></i> Change File
                </button>
                <button id="notary-review-btn" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-xl transition-all">
                    Review & Mint
                </button>
            </div>
        `;
        document.getElementById('notary-back-to-file-btn')?.addEventListener('click', () => updateNotaryStep(1));
        document.getElementById('notary-review-btn')?.addEventListener('click', handleReview);

    } else if (step === 3) {
        content.innerHTML = `
            <h3 class="text-white text-xl font-bold mb-4">Step 3: Final Review</h3>
            <p class="text-zinc-400 mb-6">Confirm details before certifying.</p>
            
            <div class="bg-zinc-800/70 p-4 rounded-xl border border-zinc-700">
                <div class="flex justify-between border-b border-zinc-700 pb-2 mb-2">
                    <span class="text-zinc-400">File Name:</span>
                    <span id="notary-summary-filename" class="text-white font-semibold">${currentFileToUpload ? currentFileToUpload.name : 'N/A'}</span>
                </div>
                <div class="border-b border-zinc-700 pb-2 mb-2">
                    <span class="text-zinc-400 block mb-1">Description:</span>
                    <span id="notary-summary-description" class="text-sm text-zinc-300 italic block">${document.getElementById('notary-user-description')?.value || 'No description provided.'}</span>
                </div>
                <div class="flex justify-between pt-2">
                    <span class="text-zinc-400">Service Fee:</span>
                    <span id="notary-summary-fee" class="text-green-400 font-bold">
                        ${State.notaryFee !== undefined ? formatBigNumber(State.notaryFee) + ' BKC' : 'Loading...'}
                    </span>
                </div>
            </div>

            <button id="notary-change-file-btn" class="text-zinc-400 hover:text-white transition-colors text-sm mt-4">
                 <i class="fa-solid fa-arrow-left mr-2"></i> Change File
            </button>
        `;
        document.getElementById('notary-change-file-btn')?.addEventListener('click', () => updateNotaryStep(1));
    }
    updateNotaryUserStatus();
}

function updateNotaryUserStatus() {
    const userStatusEl = document.getElementById('notary-user-status');
    const submitBtn = document.getElementById('notarize-submit-btn'); 
    
    if (!userStatusEl || !submitBtn) return;

    if (!State.isConnected) {
        userStatusEl.innerHTML = `
            <div class="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 text-center col-span-1 md:col-span-2">
                <i class="fa-solid fa-wallet text-2xl text-zinc-600 mb-2"></i>
                <p class="text-sm text-zinc-500">Connect your wallet to see requirements and begin notarization.</p>
            </div>`;
        
        submitBtn.className = "w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-3";
        submitBtn.innerHTML = `<i class="fa-solid fa-plug"></i> Connect Wallet`;
        submitBtn.disabled = false; 
        submitBtn.onclick = window.openConnectModal;
        return; 
    } else {
        submitBtn.onclick = null;
    }

    const userPStake = State.userTotalPStake || 0n;
    const reqPStake = State.notaryMinPStake || 0n; 
    const userBalance = State.currentUserBalance || 0n;
    const baseFee = State.notaryFee || 0n; 
    
    let finalFee = baseFee;
    
    const requirementsLoaded = reqPStake > 0n && finalFee > 0n;
    const hasPStake = userPStake >= reqPStake; 
    const hasBalance = userBalance >= finalFee;
    
    // Tratamento de erro visual para falha de RPC
    const pStakeDisplay = requirementsLoaded ? `${formatPStake(userPStake)} / ${formatPStake(reqPStake)}` : (rpcErrorCount > 2 ? '<span class="text-red-500">Net Error</span>' : 'Loading...');
    const feeDisplay = requirementsLoaded ? `${formatBigNumber(finalFee)} BKC` : (rpcErrorCount > 2 ? '<span class="text-red-500">Net Error</span>' : 'Loading...');

    userStatusEl.innerHTML = `
        <div class="flex flex-col p-3 bg-zinc-900/50 rounded-xl border ${requirementsLoaded ? (hasPStake ? 'border-green-500/20' : 'border-red-500/20') : 'border-zinc-700'}">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-6 h-6 rounded-full flex items-center justify-center ${requirementsLoaded ? (hasPStake ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500') : 'bg-zinc-700 text-zinc-500'}">
                        <i class="fa-solid ${requirementsLoaded ? (hasPStake ? 'fa-check' : 'fa-xmark') : 'fa-circle-notch animate-spin'} text-xs"></i>
                    </div>
                    <div>
                        <p class="text-[10px] text-zinc-500 uppercase font-bold">Min. pStake</p>
                        <p class="text-xs font-mono ${hasPStake ? 'text-white' : 'text-red-400'}">${pStakeDisplay}</p>
                    </div>
                </div>
            </div>
            ${!hasPStake && requirementsLoaded ? `<button id="delegate-now-btn" class="mt-3 text-[10px] bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded transition-colors self-end">Get Stake</button>` : ''}
        </div>

        <div class="flex flex-col p-3 bg-zinc-900/50 rounded-xl border ${requirementsLoaded ? (hasBalance ? 'border-green-500/20' : 'border-red-500/20') : 'border-zinc-700'}">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-6 h-6 rounded-full flex items-center justify-center ${requirementsLoaded ? (hasBalance ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500') : 'bg-zinc-700 text-zinc-500'}">
                        <i class="fa-solid ${requirementsLoaded ? (hasBalance ? 'fa-check' : 'fa-xmark') : 'fa-circle-notch animate-spin'} text-xs"></i>
                    </div>
                    <div>
                        <p class="text-[10px] text-zinc-500 uppercase font-bold">Service Fee</p>
                        <p class="text-xs font-mono ${hasBalance ? 'text-white' : 'text-red-400'}">${feeDisplay}</p>
                    </div>
                </div>
            </div>
            ${!hasBalance && requirementsLoaded ? `<a href="${addresses.bkcDexPoolAddress}" target="_blank" class="mt-3 text-[10px] bg-amber-600 hover:bg-amber-500 text-white px-2 py-1 rounded transition-colors self-end">Buy BKC</a>` : ''}
        </div>
    `;

    const statsEl = document.getElementById('notary-stats-container');
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="flex justify-between items-center text-sm">
                <span class="text-zinc-400">Service Fee</span>
                <span class="font-mono text-white">${feeDisplay}</span>
            </div>
            <div class="h-px bg-zinc-800 w-full my-2"></div>
            <div class="flex justify-between items-center text-sm">
                <span class="text-zinc-400">Min. pStake</span>
                <span class="font-mono text-purple-400">${pStakeDisplay}</span>
            </div>
        `;
    }

    // Lógica do Botão Principal
    const isReviewStep = document.querySelector('#step-indicator-3')?.classList.contains('active');
    const isDetailsStep = document.querySelector('#step-indicator-2')?.classList.contains('active');

    if (notaryButtonState === 'initial' || currentFileToUpload === null) {
        submitBtn.className = "w-full bg-zinc-800 text-zinc-500 font-bold py-4 rounded-xl cursor-not-allowed flex items-center justify-center gap-3";
        submitBtn.innerHTML = `Waiting for file selection...`;
        submitBtn.disabled = true;
    } else if (notaryButtonState === 'signing' || notaryButtonState === 'notarizing') {
        submitBtn.className = "w-full bg-zinc-800 text-white font-bold py-4 rounded-xl cursor-wait flex items-center justify-center gap-2";
        submitBtn.innerHTML = `<div class="loader-sm inline-block"></div> Processing...`;
        submitBtn.disabled = true;
    } else if (isDetailsStep) {
        submitBtn.className = "w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-3";
        submitBtn.innerHTML = `Go to Final Review <i class="fa-solid fa-arrow-right ml-2"></i>`;
        submitBtn.disabled = false;
        submitBtn.onclick = handleReview;

    } else if (isReviewStep) {
        const requirementsMet = hasPStake && hasBalance && requirementsLoaded;
        
        if (currentUploadedIPFS_URI) {
            if (requirementsMet) {
                submitBtn.className = "w-full bg-gradient-to-r from-blue-600 to-purple-700 hover:from-blue-500 hover:to-purple-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2";
                submitBtn.innerHTML = `<i class="fa-solid fa-fingerprint"></i> Mint Notary NFT`;
                submitBtn.disabled = false;
                submitBtn.onclick = handleNotarize;
            } else {
                submitBtn.className = "w-full bg-zinc-800 text-zinc-500 font-bold py-4 rounded-xl cursor-not-allowed flex items-center justify-center gap-2";
                submitBtn.innerHTML = `<i class="fa-solid fa-lock"></i> Requirements not met`;
                submitBtn.disabled = true;
                submitBtn.onclick = null;
            }
        } else {
            submitBtn.className = "w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2";
            submitBtn.innerHTML = `<i class="fa-solid fa-signature"></i> Sign & Upload Document`;
            submitBtn.disabled = false;
            submitBtn.onclick = handleSignAndUpload;
        }
    } else {
        submitBtn.disabled = true;
        submitBtn.className = "w-full bg-zinc-800 text-zinc-500 font-bold py-4 rounded-xl cursor-not-allowed flex items-center justify-center gap-3";
        submitBtn.innerHTML = `Waiting for step completion...`;
    }
}


// =========================================================================
// 3. CARREGAMENTO DE DADOS (CARTEIRA E CONTRATO)
// =========================================================================

async function loadNotaryPublicData() {
    const now = Date.now();
    
    // Se o erro de RPC for persistente, não tenta novamente por um tempo
    if (rpcErrorCount > 5 && now - lastNotaryDataFetch < 30000) return;

    if (now - lastNotaryDataFetch < 60000 && State.notaryFee !== undefined && State.notaryFee !== 0n) {
        updateNotaryUserStatus();
        return;
    }

    // Usa a instância PÚBLICA (ReadOnly)
    const hubContract = State.ecosystemManagerContractPublic || State.ecosystemManagerContract;

    if (!hubContract) {
         await loadPublicData();
         if (!State.ecosystemManagerContractPublic && !State.ecosystemManagerContract) return;
    }
    
    lastNotaryDataFetch = now;

    try {
        console.log("📥 loadNotaryPublicData: Fetching from Blockchain (Hash Manual)...");
        
        // 🚨 HASH MANUAL PARA GARANTIR COMPATIBILIDADE COM O CONTRATO
        const serviceKeyHash = ethers.id("NOTARY_SERVICE"); 

        const [baseFee, pStakeRequirement] = await safeContractCall(
            hubContract || State.ecosystemManagerContractPublic, 
            'getServiceRequirements', 
            [serviceKeyHash], 
            [0n, 0n], 
            2, // Menos retries para não saturar
            true
        );
        
        if (baseFee > 0n || pStakeRequirement > 0n) {
            State.notaryMinPStake = pStakeRequirement;
            State.notaryFee = baseFee;
            rpcErrorCount = 0; // Reset de erro se sucesso
            console.log(`✅ loadNotaryPublicData: Success! Fee: ${baseFee}`);
        } else {
            // Se retornou 0, pode ser erro de RPC silencioso ou contrato não configurado
            console.warn("⚠️ loadNotaryPublicData: Returned 0. Check RPC or Contract Config.");
        }

    } catch(e) {
        console.error("❌ loadNotaryPublicData: Error fetching requirements.", e);
        rpcErrorCount++;
    }
    
    updateNotaryUserStatus();
}

// =========================================================================
// 4. HANDLERS DE EVENTOS
// =========================================================================

function initNotaryListeners() {
    const fileInput = document.getElementById('notary-file-input');
    if (fileInput) {
        fileInput.removeEventListener('change', handleFileSelection);
        fileInput.addEventListener('change', handleFileSelection);
    }
}

function handleFileSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    event.target.value = null; 

    if (file.size > MAX_FILE_SIZE_BYTES) {
        showToast(`File size exceeds the 50MB limit.`, 'error');
        currentFileToUpload = null;
        currentUploadedIPFS_URI = null;
        return;
    }

    currentUploadedIPFS_URI = null;
    currentFileToUpload = file;
    
    updateNotaryStep(2);
}

function handleReview() {
    if (!currentFileToUpload) return;
    updateNotaryStep(3);
}

async function handleSignAndUpload(event) {
    const btn = event.currentTarget;
    if (!currentFileToUpload) return;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<div class="loader-sm inline-block"></div> Signing Hash & Uploading...`;
    notaryButtonState = 'signing';
    updateNotaryUserStatus();

    try {
        const file = currentFileToUpload;
        const description = document.getElementById('notary-user-description')?.value || '';

        // 1. Sign
        const signer = await State.provider.getSigner();
        const signature = await signer.signMessage(`Sign hash for Notary: ${file.name}`);
        
        // 2. Upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('signature', signature);
        formData.append('address', State.userAddress);
        formData.append('description', description);

        const response = await fetch(API_ENDPOINTS.uploadFileToIPFS, { method: 'POST', body: formData });
        
        if (!response.ok) throw new Error("Upload failed");
        
        const result = await response.json();
        currentUploadedIPFS_URI = result.ipfsUri; 
        
        showToast("Document hash signed and uploaded successfully! Ready to Mint NFT.", "success");

        // 3. Atualiza estado e TENTA MINTAR SE POSSÍVEL
        notaryButtonState = 'upload_ready'; 
        updateNotaryUserStatus(); 

        const requirementsLoaded = State.notaryMinPStake > 0n && State.notaryFee > 0n;
        const hasPStake = State.userTotalPStake >= State.notaryMinPStake;
        const hasBalance = State.currentUserBalance >= State.notaryFee;

        if (requirementsLoaded && hasPStake && hasBalance) {
             setTimeout(() => handleNotarize(btn), 500); 
        }
        
    } catch (error) {
        console.error("Upload/Sign Error:", error);
        showToast(`Notarization failed: ${error.message}`, "error");
        btn.disabled = false;
        btn.innerHTML = originalText;
        notaryButtonState = 'upload_ready'; 
        updateNotaryUserStatus();
    }
}

async function handleNotarize(event) {
    const btn = event.currentTarget;
    if (!currentUploadedIPFS_URI) return;

    notaryButtonState = 'notarizing';
    updateNotaryUserStatus();

    const boosterId = State.bestBooster?.tokenId || 0n;
    
    const success = await executeNotarizeDocument(currentUploadedIPFS_URI, boosterId, btn);
    
    if (success) {
        currentFileToUpload = null;
        currentUploadedIPFS_URI = null;
        notaryButtonState = 'initial'; 
        
        await loadUserData(true);
        renderMyNotarizedDocuments();
        updateNotaryStep(1);
    } else {
        notaryButtonState = currentUploadedIPFS_URI ? 'upload_ready' : 'initial';
        updateNotaryUserStatus();
    }
}

function renderMyNotarizedDocuments() {
    const container = document.getElementById('my-notarized-documents');
    const countEl = document.getElementById('notary-doc-count');
    if (container && countEl) {
        container.innerHTML = renderNoData("You have not notarized any documents yet.");
        countEl.innerText = "0";
    }
}

// =========================================================================
// 5. EXPORT
// =========================================================================

export const NotaryPage = {
    async render(isActive) {
        if (!isActive) return;

        renderNotaryPageLayout();
        
        // Tenta carregar os requisitos com hash manual
        await loadNotaryPublicData();
        
        if (State.isConnected) {
             await loadUserData(true); 
             renderMyNotarizedDocuments();
        }
        
        updateNotaryUserStatus();
        
        if (isActive) {
            updateNotaryStep(1);
            notaryButtonState = 'initial'; 
            currentFileToUpload = null;
            currentUploadedIPFS_URI = null;
        }
    },
    
    update() {
        loadNotaryPublicData(); 
        if (State.isConnected) {
            loadUserData();
        }
        updateNotaryUserStatus();
    }
};