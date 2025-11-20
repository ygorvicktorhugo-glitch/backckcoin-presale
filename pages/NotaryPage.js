// pages/NotaryPage.js
// ✅ VERSÃO FINAL: Cache Inteligente + UX de Upload Refinada + Integração IPFS

import { addresses } from '../config.js'; 
import { State } from '../state.js';
import { formatBigNumber, formatPStake, renderLoading, renderError, renderNoData, ipfsGateway } from '../utils.js';
import { safeContractCall, API_ENDPOINTS, loadPublicData, loadUserData } from '../modules/data.js'; 
import { showToast } from '../ui-feedback.js';
import { executeNotarizeDocument } from '../modules/transactions.js';

// --- Constants ---
const BLOCKCHAIN_EXPLORER_TX_URL = "https://sepolia.etherscan.io/tx/";
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB Limits

// --- State Variables ---
let currentFileToUpload = null;
let currentUploadedIPFS_URI = null; 
let notaryButtonState = 'initial'; 
let pageContainer = null; 
let lastNotaryDataFetch = 0; // 🕒 CACHE TIMESTAMP

// =========================================================================
// 1. RENDERIZAÇÃO VISUAL
// =========================================================================

function renderNotaryPageLayout() {
    const container = document.getElementById('notary');
    if (!container) return;
    pageContainer = container; 

    // OTIMIZAÇÃO: Se o HTML já existe, não recria (preserva inputs do usuário ao navegar)
    if (container.querySelector('#notary-main-box')) return;

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
                <h1 class="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
                    Decentralized Notary
                </h1>
                <p class="text-zinc-400 mt-1 max-w-2xl">
                    Immutable proof of existence. Mint any file as a permanent, timestamped NFT on the Backchain.
                </p>
            </div>
            <div id="service-status-badge" class="px-4 py-2 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-mono text-zinc-400 flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> System Online
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">

            <div class="lg:col-span-8 space-y-6">
                
                <div class="bg-zinc-900/50 border border-zinc-700/50 rounded-2xl p-4 shadow-lg backdrop-blur-sm">
                    <div class="flex justify-between items-center relative">
                        <div class="absolute top-1/2 left-0 w-full h-1 bg-zinc-800 -z-10 rounded-full"></div>
                        <div id="progress-line" class="absolute top-1/2 left-0 h-1 bg-blue-600 -z-10 rounded-full transition-all duration-500 w-0"></div>

                        <div id="step-indicator-1" class="step-bubble active">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-800 border-2 border-blue-500 text-white font-bold transition-all duration-300 shadow-[0_0_15px_rgba(59,130,246,0.5)]">1</div>
                            <span class="mt-2 text-xs font-semibold text-blue-400">Details</span>
                        </div>
                        <div id="step-indicator-2" class="step-bubble">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-800 border-2 border-zinc-600 text-zinc-500 font-bold transition-all duration-300">2</div>
                            <span class="mt-2 text-xs font-semibold text-zinc-500">Upload</span>
                        </div>
                        <div id="step-indicator-3" class="step-bubble">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-800 border-2 border-zinc-600 text-zinc-500 font-bold transition-all duration-300">3</div>
                            <span class="mt-2 text-xs font-semibold text-zinc-500">Mint</span>
                        </div>
                    </div>
                </div>

                <div id="notary-main-box" class="bg-sidebar border border-border-color rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden group">
                    <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-purple-600 to-amber-500 opacity-50"></div>
                    
                    <div id="notary-step-1" class="step-content transition-opacity duration-300">
                        <h2 class="text-2xl font-bold mb-2 text-white">Describe Your Document</h2>
                        <p class="text-sm text-zinc-400 mb-6">This text will be permanently engraved in the NFT metadata. Be precise.</p>
                        
                        <div class="relative">
                            <textarea id="notary-user-description" 
                                rows="5" 
                                class="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl p-4 text-base text-zinc-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder-zinc-600 resize-none" 
                                placeholder="Example: 'Copyright registration for Project Alpha v1.0 source code' or 'Scan of my property deed'."
                            ></textarea>
                            <div class="absolute bottom-3 right-3 text-xs font-mono text-zinc-500 bg-zinc-800/80 px-2 py-1 rounded-md">
                                <span id="notary-description-counter">0</span> / 256
                            </div>
                        </div>
                        
                        <button id="notary-step-1-btn" class="w-full mt-8 group relative flex justify-center py-4 px-4 border border-transparent text-base font-bold rounded-xl text-white bg-zinc-700 hover:bg-zinc-600 focus:outline-none transition-all duration-200 btn-disabled cursor-not-allowed overflow-hidden">
                            <span class="relative z-10 flex items-center gap-2">
                                Next Step <i class="fa-solid fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
                            </span>
                        </button>
                    </div>

                    <div id="notary-step-2" class="hidden step-content">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-2xl font-bold text-white">Archive File</h2>
                            <button id="notary-step-back-1" class="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors px-3 py-1 rounded-lg hover:bg-zinc-800">
                                <i class="fa-solid fa-arrow-left"></i> Back
                            </button>
                        </div>
                        
                        <div class="w-full">
                            <label id="notary-file-dropzone" for="notary-file-upload" 
                                class="relative flex flex-col items-center justify-center w-full h-64 border-2 border-zinc-700 border-dashed rounded-2xl cursor-pointer bg-zinc-900/30 hover:bg-zinc-900/80 hover:border-blue-500/50 transition-all duration-300 group">
                                
                                <div id="notary-upload-prompt" class="flex flex-col items-center justify-center pt-5 pb-6 text-center pointer-events-none z-10">
                                    <div class="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg">
                                        <i class="fa-solid fa-cloud-arrow-up text-3xl text-blue-500"></i>
                                    </div>
                                    <p class="mb-2 text-lg text-zinc-300"><span class="font-bold text-blue-400">Click to upload</span> or drag and drop</p>
                                    <p class="text-xs text-zinc-500 font-mono">PDF, PNG, JPG, MP3, MP4 (Max 50MB)</p>
                                </div>

                                <div id="notary-upload-status" class="hidden absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/95 rounded-2xl z-20"></div>
                            </label>
                            <input id="notary-file-upload" type="file" class="hidden" />
                        </div>
                    </div>

                    <div id="notary-step-3" class="hidden step-content">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-2xl font-bold text-white">Final Confirmation</h2>
                            <button id="notary-step-back-2" class="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors px-3 py-1 rounded-lg hover:bg-zinc-800">
                                <i class="fa-solid fa-arrow-left"></i> Change File
                            </button>
                        </div>
                        
                        <div class="bg-zinc-900/80 border border-zinc-700 rounded-xl p-6 mb-8">
                            <div class="flex items-start gap-4">
                                <div class="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                    <i class="fa-solid fa-file-contract text-blue-400 text-xl"></i>
                                </div>
                                <div>
                                    <h3 class="text-sm font-mono text-zinc-500 uppercase tracking-wider mb-1">File Name</h3>
                                    <p id="notary-summary-filename" class="text-white font-bold text-lg truncate max-w-[250px] md:max-w-md">...</p>
                                </div>
                            </div>
                            <div class="border-t border-zinc-700/50 my-4"></div>
                            <div>
                                <h3 class="text-sm font-mono text-zinc-500 uppercase tracking-wider mb-1">Description to be Minted</h3>
                                <p id="notary-summary-description" class="text-zinc-300 italic text-sm leading-relaxed">...</p>
                            </div>
                        </div>

                        <input type="hidden" id="notary-document-uri">
                        
                        <a id="notarize-submit-btn" href="#" class="w-full block text-center bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 transition-all transform hover:-translate-y-0.5 text-lg btn-disabled opacity-50 cursor-not-allowed">
                            <span class="flex items-center justify-center gap-2">
                                <i class="fa-solid fa-fingerprint"></i> Authenticate & Mint NFT
                            </span>
                        </a>
                        <p class="text-xs text-center text-zinc-500 mt-4">
                            <i class="fa-solid fa-shield-halved mr-1"></i> Secured by Backchain Consensus
                        </p>
                    </div>

                </div>
            </div>

            <div class="lg:col-span-4 space-y-6">
                
                <div id="notary-user-status-box" class="bg-sidebar border border-border-color rounded-2xl p-6 shadow-xl transition-colors duration-300">
                    <div class="flex items-center gap-3 mb-6">
                        <div class="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                            <i class="fa-solid fa-user-astronaut text-zinc-400"></i>
                        </div>
                        <h2 class="text-lg font-bold">My Status</h2>
                    </div>
                    
                    <div id="notary-user-status" class="space-y-5">
                         <div class="text-center p-6 bg-zinc-900/50 rounded-xl border border-zinc-800">
                            <div class="loader inline-block mb-2"></div>
                            <p class="text-xs text-zinc-500">Checking wallet...</p>
                         </div>
                    </div>
                </div>

                <div class="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
                    <h3 class="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">System Requirements</h3>
                    <div id="notary-stats-container" class="space-y-3">
                        <div class="animate-pulse flex space-x-4">
                            <div class="flex-1 space-y-2 py-1">
                                <div class="h-2 bg-zinc-800 rounded w-3/4"></div>
                                <div class="h-2 bg-zinc-800 rounded"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="mt-16 pt-10 border-t border-zinc-800">
            <div class="flex items-center justify-between mb-8">
                <h2 class="text-2xl font-bold flex items-center gap-3">
                    <i class="fa-solid fa-clock-rotate-left text-zinc-500"></i> My Registered Documents
                </h2>
                <button id="refresh-docs-btn" class="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                    <i class="fa-solid fa-rotate mr-1"></i> Refresh
                </button>
            </div>
            
            <div id="my-notarized-documents" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                 </div>
        </div>
    `;

    setTimeout(() => {
        document.getElementById('refresh-docs-btn')?.addEventListener('click', () => renderMyNotarizedDocuments());
    }, 0);
}

// =========================================================================
// 2. LÓGICA DE UI & NAVEGAÇÃO
// =========================================================================

function updateNotaryStep(targetStep) {
    const progressLine = document.getElementById('progress-line');
    
    [1, 2, 3].forEach(step => {
        const el = document.getElementById(`notary-step-${step}`);
        const ind = document.getElementById(`step-indicator-${step}`);
        if(!el || !ind) return;

        const bubble = ind.querySelector('div');
        const text = ind.querySelector('span');

        el.classList.add('hidden');
        
        if (bubble) {
            bubble.className = "w-10 h-10 rounded-full flex items-center justify-center bg-zinc-800 border-2 border-zinc-600 text-zinc-500 font-bold transition-all duration-300";
            bubble.innerHTML = step;
        }
        if (text) text.className = "mt-2 text-xs font-semibold text-zinc-500";
    });

    const targetPanel = document.getElementById(`notary-step-${targetStep}`);
    if (targetPanel) {
        targetPanel.classList.remove('hidden');
        targetPanel.classList.remove('opacity-0');
        targetPanel.classList.add('opacity-100');
    }

    if (progressLine) {
        if (targetStep === 1) progressLine.style.width = '0%';
        if (targetStep === 2) progressLine.style.width = '50%';
        if (targetStep === 3) progressLine.style.width = '100%';
    }

    for (let i = 1; i <= 3; i++) {
        const ind = document.getElementById(`step-indicator-${i}`);
        if(!ind) continue;
        const bubble = ind.querySelector('div');
        const text = ind.querySelector('span');
        
        if (i < targetStep) {
            bubble.className = "w-10 h-10 rounded-full flex items-center justify-center bg-blue-900 border-2 border-blue-600 text-blue-200 font-bold transition-all duration-300";
            bubble.innerHTML = '<i class="fa-solid fa-check"></i>';
            text.classList.add('text-blue-500');
        } else if (i === targetStep) {
            bubble.className = "w-10 h-10 rounded-full flex items-center justify-center bg-zinc-800 border-2 border-blue-500 text-white font-bold transition-all duration-300 shadow-[0_0_15px_rgba(59,130,246,0.5)] transform scale-110";
            text.className = "mt-2 text-xs font-bold text-white";
        }
    }
}

// =========================================================================
// 3. LÓGICA DE DADOS & STATUS
// =========================================================================

async function loadNotaryPublicData() {
    // 🕒 CACHE: Anti-Loop Check
    const now = Date.now();
    if (now - lastNotaryDataFetch < 60000 && State.notaryFee !== undefined) {
        renderRequirementsWidget();
        return true;
    }

    if (!State.ecosystemManagerContract) {
        document.getElementById('notary-stats-container').innerHTML = renderError("Contract not linked.");
        return false;
    }

    try {
        lastNotaryDataFetch = now; 

        const [baseFee, pStakeRequirement] = await safeContractCall(
            State.ecosystemManagerContract,
            'getServiceRequirements',
            ["NOTARY_SERVICE"], 
            [0n, 0n] 
        );

        State.notaryMinPStake = pStakeRequirement;
        State.notaryFee = baseFee; 
        
        renderRequirementsWidget();
        return true;

    } catch (e) {
        console.error("⚠️ Error loading notary data (using fallbacks):", e);
        
        // Fallback Seguro
        if(State.notaryFee === undefined) {
            State.notaryFee = 500000000000000000n; // 0.5 BKC
            State.notaryMinPStake = 500000000000000000000n; // 500 pStake
        }
        
        renderRequirementsWidget();
        return false;
    }
}

function renderRequirementsWidget() {
    const statsEl = document.getElementById('notary-stats-container');
    if (!statsEl) return;

    const fee = State.notaryFee || 0n;
    const pStake = State.notaryMinPStake || 0n;

    statsEl.innerHTML = `
        <div class="flex justify-between items-center p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
            <span class="text-zinc-400 text-sm">Fee</span>
            <span class="font-mono font-bold text-amber-400">${formatBigNumber(fee)} $BKC</span>
        </div>
        <div class="flex justify-between items-center p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
            <span class="text-zinc-400 text-sm">Min pStake</span>
            <span class="font-mono font-bold text-purple-400">${formatPStake(pStake)}</span>
        </div>
    `;
}

function updateNotaryUserStatus() {
    const userStatusEl = document.getElementById('notary-user-status');
    const userStatusBoxEl = document.getElementById('notary-user-status-box');
    const submitBtn = document.getElementById('notarize-submit-btn'); 
    
    if (!userStatusEl || !submitBtn) return;

    if (!State.isConnected) {
        userStatusEl.innerHTML = `<div class="flex flex-col items-center justify-center py-4 text-zinc-500"><i class="fa-solid fa-wallet text-3xl mb-2 opacity-50"></i><span>Wallet not connected</span></div>`;
        submitBtn.classList.add('btn-disabled', 'opacity-50', 'cursor-not-allowed');
        submitBtn.href = '#';
        return;
    }

    if (typeof State.notaryMinPStake === 'undefined') {
        userStatusEl.innerHTML = `
            <div class="text-xs text-amber-500 mb-2">Loading rules...</div>
            <button onclick="window.location.reload()" class="text-xs underline">Retry Connection</button>
        `;
        return;
    }

    const userPStake = State.userTotalPStake || 0n;
    const reqPStake = State.notaryMinPStake || 0n;
    const userBalance = State.currentUserBalance || 0n;
    const baseFee = State.notaryFee || 0n;
    const boosterBips = State.userBoosterBips || 0n; 
    
    let discount = 0n;
    let finalFee = baseFee;
    let discountPercent = "0%";

    if (boosterBips > 0n && baseFee > 0n) {
        discount = (baseFee * boosterBips) / 10000n; 
        finalFee = (baseFee > discount) ? baseFee - discount : 0n;
        discountPercent = `${(Number(boosterBips) / 100).toFixed(0)}%`; 
    }

    const hasPStake = userPStake >= reqPStake;
    const hasBalance = userBalance >= finalFee;

    if (hasPStake && hasBalance) {
        userStatusBoxEl.className = "bg-sidebar border border-green-500/30 rounded-2xl p-6 shadow-[0_0_20px_rgba(34,197,94,0.1)] transition-all duration-500";
    } else {
        userStatusBoxEl.className = "bg-sidebar border border-red-500/20 rounded-2xl p-6 shadow-none transition-all duration-500";
    }

    userStatusEl.innerHTML = `
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full flex items-center justify-center ${hasPStake ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">
                    <i class="fa-solid ${hasPStake ? 'fa-check' : 'fa-xmark'}"></i>
                </div>
                <div>
                    <p class="text-xs text-zinc-400 uppercase font-bold">Power Stake</p>
                    <p class="text-sm font-mono text-white">${formatPStake(userPStake)} / ${formatPStake(reqPStake)}</p>
                </div>
            </div>
            ${!hasPStake ? `<a href="#" id="delegate-now-btn" class="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded-md transition-colors">Delegate</a>` : ''}
        </div>
        <div class="h-px bg-zinc-800 w-full"></div>
        <div class="space-y-2">
             <div class="flex justify-between text-xs text-zinc-400">
                <span>Base Fee</span>
                <span>${formatBigNumber(baseFee)} BKC</span>
             </div>
             <div class="flex justify-between text-xs text-cyan-400">
                <span>Booster Discount (${discountPercent})</span>
                <span>- ${formatBigNumber(discount)} BKC</span>
             </div>
             <div class="flex justify-between text-sm font-bold text-white pt-1 border-t border-zinc-800/50">
                <span>Final Cost</span>
                <span class="${hasBalance ? 'text-green-400' : 'text-red-400'}">${formatBigNumber(finalFee)} BKC</span>
             </div>
        </div>
        <div class="flex items-center gap-2 text-xs justify-end mt-1">
            <span class="text-zinc-500">Available:</span>
            <span class="${hasBalance ? 'text-zinc-300' : 'text-red-400 font-bold'}">${formatBigNumber(userBalance)} BKC</span>
            ${!hasBalance ? `<a href="${addresses.bkcDexPoolAddress}" target="_blank" class="text-amber-500 hover:text-amber-400 ml-1 underline">Buy</a>` : ''}
        </div>
    `;

    if (notaryButtonState === 'notarizing' || notaryButtonState === 'uploading' || notaryButtonState === 'signing') return;

    if (!hasPStake) {
        setSubmitButtonState(submitBtn, 'disabled', 'Insufficient pStake');
    } else if (!hasBalance) {
        setSubmitButtonState(submitBtn, 'disabled', 'Insufficient Balance');
    } else {
        if (notaryButtonState === 'file_ready') {
             setSubmitButtonState(submitBtn, 'active', '<i class="fa-solid fa-signature mr-2"></i> Sign & Upload');
        } else if (notaryButtonState === 'upload_ready') {
             setSubmitButtonState(submitBtn, 'success', '<i class="fa-solid fa-gavel mr-2"></i> Confirm on Blockchain');
        }
    }
}

function setSubmitButtonState(btn, state, text) {
    btn.className = "w-full block text-center py-4 px-6 rounded-xl shadow-lg transition-all transform text-lg font-bold flex items-center justify-center gap-2";
    
    if (state === 'disabled') {
        btn.classList.add('bg-zinc-700', 'text-zinc-400', 'cursor-not-allowed', 'opacity-50');
        btn.innerHTML = `<i class="fa-solid fa-lock"></i> ${text}`;
    } else if (state === 'active') {
        btn.classList.add('bg-blue-600', 'hover:bg-blue-500', 'text-white', 'hover:-translate-y-0.5', 'shadow-blue-900/20');
        btn.innerHTML = text;
    } else if (state === 'success') {
        btn.classList.add('bg-green-600', 'hover:bg-green-500', 'text-white', 'hover:-translate-y-0.5', 'shadow-green-900/20');
        btn.innerHTML = text;
    } else if (state === 'loading') {
        btn.classList.add('bg-zinc-600', 'text-white', 'cursor-wait');
        btn.innerHTML = `<div class="loader-sm inline-block mr-2"></div> ${text}`;
    }
}

// =========================================================================
// 4. DOCUMENTOS & UPLOAD
// =========================================================================

async function renderMyNotarizedDocuments() {
    const docsEl = document.getElementById('my-notarized-documents');
    if (!docsEl || !State.userAddress) return;

    // Evita sobrepor conteúdo se já tiver algo e não for loading
    if (docsEl.children.length > 0 && !docsEl.innerHTML.includes('loader')) {
        // Opcional: Remover isso se quiser forçar refresh sempre que render for chamado
    }

    docsEl.innerHTML = renderLoading("Scanning blockchain history...");

    try {
        const response = await fetch(`${API_ENDPOINTS.getNotaryHistory}/${State.userAddress}`);
        if (!response.ok) throw new Error("API Error");
        const documents = await response.json();

        if (documents.length === 0) {
            docsEl.innerHTML = renderNoData("No documents found.");
            return;
        }
        
        let html = '';
        for (const doc of documents) {
            const explorerLink = `${BLOCKCHAIN_EXPLORER_TX_URL}${doc.txHash}`;
            const metaLink = doc.metadataURI.replace('ipfs://', ipfsGateway);

            html += `
                <div class="group bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 rounded-xl overflow-hidden transition-all duration-300 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]">
                    <div class="h-32 bg-zinc-800 flex items-center justify-center relative overflow-hidden">
                        <i class="fa-solid fa-file-contract text-4xl text-zinc-600 group-hover:scale-110 transition-transform duration-500"></i>
                        <div class="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent opacity-60"></div>
                        <div class="absolute bottom-2 right-2">
                            <span class="bg-zinc-950/80 text-blue-400 text-[10px] px-2 py-1 rounded backdrop-blur-sm font-mono border border-blue-500/20">#${doc.tokenId}</span>
                        </div>
                    </div>
                    <div class="p-4">
                        <div class="flex justify-between items-start mb-2">
                            <h3 class="font-bold text-white text-sm truncate pr-2">Document #${doc.tokenId}</h3>
                            <a href="${explorerLink}" target="_blank" class="text-zinc-500 hover:text-blue-400 transition-colors" title="View Transaction">
                                <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i>
                            </a>
                        </div>
                        <div class="flex gap-2 mt-4">
                            <a href="${metaLink}" target="_blank" class="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-xs py-2 rounded-lg text-center transition-colors border border-zinc-700">
                                Metadata
                            </a>
                            <button class="add-to-wallet-btn flex-1 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 text-xs py-2 rounded-lg border border-blue-500/20 transition-colors" data-address="${addresses.decentralizedNotary}" data-tokenid="${doc.tokenId}">
                                Wallet +
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        docsEl.innerHTML = html;

    } catch (e) {
        docsEl.innerHTML = renderError("Failed to load history.");
    }
}

async function handleFileUpload(file) {
    const statusEl = document.getElementById('notary-upload-status');
    const promptEl = document.getElementById('notary-upload-prompt');
    const dropzone = document.getElementById('notary-file-dropzone');
    
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
         showToast("File is too large (Max 50MB)", "error");
         return;
    }

    currentFileToUpload = file;
    
    promptEl.classList.add('hidden');
    statusEl.classList.remove('hidden');
    dropzone.classList.add('border-blue-500', 'bg-blue-500/5');
    dropzone.classList.remove('border-zinc-700');

    statusEl.innerHTML = `
        <div class="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-3 animate-bounce-short">
            <i class="fa-solid fa-check text-2xl text-green-500"></i>
        </div>
        <p class="text-white font-bold text-lg">${file.name}</p>
        <p class="text-zinc-500 text-sm font-mono mt-1">${(file.size / 1024 / 1024).toFixed(2)} MB</p>
        <p class="text-blue-400 text-xs mt-4 font-bold uppercase tracking-wider">Ready to Certify</p>
    `;

    document.getElementById('notary-summary-filename').innerText = file.name;
    document.getElementById('notary-summary-description').innerText = document.getElementById('notary-user-description').value || "(No description)";

    notaryButtonState = 'file_ready';
    
    setTimeout(() => {
        updateNotaryStep(3);
        updateNotaryUserStatus();
    }, 800);
}

// =========================================================================
// 5. INITIALIZATION
// =========================================================================

function initNotaryListeners() {
    setTimeout(() => {
        const fileInput = document.getElementById('notary-file-upload');
        const dropzone = document.getElementById('notary-file-dropzone');
        const step1Btn = document.getElementById('notary-step-1-btn');
        const descInput = document.getElementById('notary-user-description');
        const descCounter = document.getElementById('notary-description-counter');

        // Validação Step 1
        if (step1Btn && descInput) {
            const validate = () => {
                const len = descInput.value.length;
                if (descCounter) descCounter.innerText = len;
                
                if (len > 0 && len <= 256) {
                    step1Btn.classList.remove('btn-disabled', 'bg-zinc-700', 'cursor-not-allowed', 'opacity-50');
                    step1Btn.classList.add('bg-blue-600', 'hover:bg-blue-500', 'cursor-pointer', 'shadow-lg');
                } else {
                    step1Btn.classList.add('btn-disabled', 'bg-zinc-700', 'cursor-not-allowed', 'opacity-50');
                    step1Btn.classList.remove('bg-blue-600', 'hover:bg-blue-500', 'cursor-pointer', 'shadow-lg');
                }
            };

            // Clona para limpar listeners antigos
            const newBtn = step1Btn.cloneNode(true);
            step1Btn.parentNode.replaceChild(newBtn, step1Btn);
            
            const newInput = descInput.cloneNode(true);
            descInput.parentNode.replaceChild(newInput, descInput);

            newInput.addEventListener('input', validate);
            validate(); 

            newBtn.addEventListener('click', () => {
                if (!newBtn.classList.contains('btn-disabled')) updateNotaryStep(2);
            });
        }

        // Drag & Drop
        if (dropzone && fileInput) {
            const highlight = (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('border-blue-500', 'bg-zinc-800'); };
            const unhighlight = (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('border-blue-500', 'bg-zinc-800'); };

            ['dragenter', 'dragover'].forEach(evt => dropzone.addEventListener(evt, highlight, false));
            ['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, unhighlight, false));

            dropzone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                if (dt.files && dt.files.length > 0) handleFileUpload(dt.files[0]);
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) handleFileUpload(e.target.files[0]);
            });
        }

        // Navegação interna
        document.getElementById('notary-step-back-1')?.addEventListener('click', () => updateNotaryStep(1));
        document.getElementById('notary-step-back-2')?.addEventListener('click', () => {
            currentFileToUpload = null;
            notaryButtonState = 'initial';
            const statusEl = document.getElementById('notary-upload-status');
            const promptEl = document.getElementById('notary-upload-prompt');
            const dz = document.getElementById('notary-file-dropzone');
            if (statusEl) statusEl.classList.add('hidden');
            if (promptEl) promptEl.classList.remove('hidden');
            if (dz) dz.classList.remove('border-blue-500', 'bg-blue-500/5');
            updateNotaryStep(2);
        });

        // Botão Principal de Submit
        const submitBtn = document.getElementById('notarize-submit-btn');
        if (submitBtn) {
            const newSubmit = submitBtn.cloneNode(true);
            submitBtn.parentNode.replaceChild(newSubmit, submitBtn);
            
            newSubmit.addEventListener('click', async (e) => {
                e.preventDefault();
                if (newSubmit.classList.contains('btn-disabled')) return;

                if (notaryButtonState === 'file_ready') {
                    setSubmitButtonState(newSubmit, 'loading', 'Signing & Uploading...');
                    notaryButtonState = 'signing';

                    try {
                        const signer = await State.provider.getSigner();
                        const signature = await signer.signMessage("I am signing to authenticate my file for notarization on Backchain.");
                        
                        const formData = new FormData();
                        formData.append('file', currentFileToUpload);
                        formData.append('signature', signature);
                        formData.append('address', State.userAddress);
                        formData.append('description', document.getElementById('notary-user-description').value);

                        const response = await fetch(API_ENDPOINTS.uploadFileToIPFS, { method: 'POST', body: formData });
                        if (!response.ok) throw new Error("Upload Failed");
                        
                        const result = await response.json();
                        currentUploadedIPFS_URI = result.ipfsUri;
                        
                        notaryButtonState = 'upload_ready';
                        updateNotaryUserStatus(); 
                        showToast("File Archived on IPFS!", "success");

                    } catch (err) {
                        console.error(err);
                        showToast("Upload Failed: " + err.message, "error");
                        notaryButtonState = 'file_ready';
                        updateNotaryUserStatus();
                    }
                    return;
                }

                if (notaryButtonState === 'upload_ready') {
                    setSubmitButtonState(newSubmit, 'loading', 'Confirming Transaction...');
                    notaryButtonState = 'notarizing';

                    const boosterId = State.userBoosterId || 0n;
                    const success = await executeNotarizeDocument(currentUploadedIPFS_URI, boosterId, newSubmit);
                    
                    if (success) {
                        showToast("Success! Document Minted.", "success");
                        setTimeout(() => {
                             document.getElementById('notary-user-description').value = "";
                             currentFileToUpload = null;
                             notaryButtonState = 'initial';
                             renderMyNotarizedDocuments();
                             updateNotaryStep(1);
                        }, 2000);
                    } else {
                        notaryButtonState = 'upload_ready';
                        updateNotaryUserStatus();
                    }
                }
            });
        }

        pageContainer?.addEventListener('click', (e) => {
             if (e.target.closest('#delegate-now-btn')) {
                 e.preventDefault();
                 document.querySelector('.sidebar-link[data-target="mine"]')?.click();
             }
        });

    }, 300);
}

// =========================================================================
// 6. EXPORT
// =========================================================================

export const NotaryPage = {
    async render(isNewPage) {
        renderNotaryPageLayout();
        
        // Carrega dados gerais se for a primeira vez
        if (isNewPage && !State.userAddress) {
             await loadPublicData();
        }
        
        // Carrega dados específicos (com cache)
        await loadNotaryPublicData();

        if (State.isConnected) {
             if(!State.currentUserBalance) await loadUserData();
             
             updateNotaryUserStatus();
             renderMyNotarizedDocuments();
        } else {
             updateNotaryUserStatus(); 
        }
        
        initNotaryListeners();
        
        if(isNewPage) updateNotaryStep(1);
    },
    
    update() {
        updateNotaryUserStatus();
    }
};