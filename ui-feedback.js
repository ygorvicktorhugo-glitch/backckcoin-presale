// js/ui-feedback.js
// ✅ VERSÃO FINAL LANDPAGE V3.5: Anel CSS Removido do Modal Welcome

import { DOMElements } from './dom-elements.js';
import { State } from './state.js';

// Variáveis de estado e timer simplificadas
let hasShownWelcomeModal = false; 

// --- BASIC UI FUNCTIONS (Toast & Modal) ---

export const showToast = (message, type = 'info', txHash = null) => {
    if (!DOMElements.toastContainer) return;

    // Ajustado para Mainnet Arbiscan (Arbitrum One ID: 42161)
    const explorerBaseUrl = "https://arbiscan.io/tx/"; 

    const definitions = {
        success: { icon: 'fa-check-circle', color: 'bg-green-600', border: 'border-green-400' },
        error: { icon: 'fa-exclamation-triangle', color: 'bg-red-600', border: 'border-red-400' },
        info: { icon: 'fa-info-circle', color: 'bg-blue-600', border: 'border-blue-400' },
        warning: { icon: 'fa-exclamation-circle', color: 'bg-yellow-600', border: 'border-yellow-400' }
    };
    const def = definitions[type] || definitions.info;

    const toast = document.createElement('div');
    toast.className = `flex items-center w-full max-w-xs p-4 text-white rounded-lg shadow-lg transition-all duration-500 ease-out 
                       transform translate-x-full opacity-0 
                       ${def.color} border-l-4 ${def.border} mb-3`;

    let content = `
        <div class="flex items-center flex-1">
            <i class="fa-solid ${def.icon} text-xl mr-3"></i>
            <div class="text-sm font-medium leading-tight">${message}</div>
        </div>
    `;

    if (txHash) {
        // Link correto para Arbiscan (Arbitrum One)
        const explorerUrl = `${explorerBaseUrl}${txHash}`;
        content += `<a href="${explorerUrl}" target="_blank" title="View on Arbiscan" class="ml-3 flex-shrink-0 text-white/80 hover:text-white transition-colors">
                        <i class="fa-solid fa-arrow-up-right-from-square text-sm"></i>
                      </a>`;
    }
    
    content += `<button class="ml-3 text-white/80 hover:text-white transition-colors focus:outline-none" onclick="this.closest('.shadow-lg').remove()">
                    <i class="fa-solid fa-xmark text-lg"></i>
                </button>`;

    toast.innerHTML = content;
    DOMElements.toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0'); 
        toast.classList.add('translate-x-0', 'opacity-100'); 
    });

    setTimeout(() => { 
        toast.classList.remove('translate-x-0', 'opacity-100');
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 500);
    }, 5000);
};

export const closeModal = () => { 
    if (!DOMElements.modalContainer) return;
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) {
        const content = document.getElementById('modal-content');
        if (content) {
            content.classList.remove('animate-fade-in-up');
        }
        backdrop.classList.remove('opacity-100'); 
        backdrop.classList.add('opacity-0');
        setTimeout(() => {
            DOMElements.modalContainer.innerHTML = '';
        }, 300); 
    }
};

export const openModal = (content, maxWidth = 'max-w-md', allowCloseOnBackdrop = true) => {
    if (!DOMElements.modalContainer) return;
    
    // Simplificando estilos embutidos
    const style = 
        '<style>' +
            '@keyframes fade-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }' +
            '.animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; }' +
            '.pulse-gold { animation: pulse-gold 2s infinite; }' +
            '@keyframes pulse-gold { 0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); } 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); } }' +
        '</style>';

    const modalHTML = `
        <div id="modal-backdrop" class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 transition-opacity duration-300 opacity-0">
            <div id="modal-content" class="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full ${maxWidth} shadow-2xl animate-fade-in-up max-h-[90vh] overflow-y-auto relative">
                <button class="closeModalBtn absolute top-4 right-4 text-zinc-500 hover:text-white text-xl transition-colors focus:outline-none"><i class="fa-solid fa-xmark"></i></button>
                ${content}
            </div>
        </div>
        ${style}
    `;
    
    DOMElements.modalContainer.innerHTML = modalHTML;

    requestAnimationFrame(() => {
        const backdrop = document.getElementById('modal-backdrop');
        if (backdrop) backdrop.classList.remove('opacity-0');
        if (backdrop) backdrop.classList.add('opacity-100');
    });

    document.getElementById('modal-backdrop')?.addEventListener('click', e => {
        if (allowCloseOnBackdrop && e.target.id === 'modal-backdrop') {
            closeModal();
        }
    });

    document.getElementById('modal-content')?.querySelectorAll('.closeModalBtn').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });
};

// --- WELCOME MODAL (Final Landpage Version) ---

export function showWelcomeModal() {
    if (hasShownWelcomeModal) return;
    hasShownWelcomeModal = true;

    // 🔥 CTA ÚNICO: Fecha o modal atual e abre o modal de conexão
    const PRESALE_ACTION = "closeModal(); window.openConnectModal();"; 

    const content = `
        <div class="text-center pt-2 pb-4">
            
            <div class="mb-4 relative w-24 h-24 mx-auto" style="min-height: 80px;">
                <div id="welcome-logo-container" class="absolute inset-2 flex items-center justify-center">
                    <img id="welcome-logo-bkc" src="./assets/bkc_logo_3d.png" class="w-full h-full object-contain absolute transition-opacity duration-700" style="opacity: 1;" alt="Backcoin Logo">
                    <img id="welcome-logo-arb" src="./assets/arbitrum.svg" class="w-full h-full object-contain absolute transition-opacity duration-700" style="opacity: 0; padding: 10px;" alt="Arbitrum Logo">
                </div>
            </div>
            
            <h2 class="text-3xl font-black text-white mb-2 uppercase tracking-wide">
                Welcome to the Mainnet Presale
            </h2> 
            
            <p class="text-zinc-300 mb-6 text-sm leading-relaxed px-4">
                This is the exclusive event for the <strong class="text-amber-400">Backcoin Booster NFTs</strong>, deployed on <strong>Arbitrum One</strong>.
            </p>
            
            <div class="bg-zinc-800/70 border border-zinc-700 p-4 rounded-xl text-left mb-6">
                <h4 class="font-bold text-lg text-white mb-2"><i class="fa-solid fa-star-of-life mr-2 text-cyan-400"></i> Why Buy a Booster?</h4>
                <ul class="text-zinc-300 text-sm space-y-2 list-disc list-inside">
                    <li><strong class="text-amber-400">Governance & Utility:</strong> Provides governance rights and staking power in the core DApp.</li>
                    <li><strong class="text-amber-400">Fair Launch Policy:</strong> The project runs with <strong class="text-green-500">ZERO developer token allocation</strong>.</li>
                    <li><strong class="text-green-500">No Pre-Sale of Tokens:</strong> We sell utility NFTs, <strong class="text-red-400">not BKC tokens</strong>. No initial purchase/sale of BKC by the team.</li>
                    <li><strong class="text-amber-400">Mainnet Readiness:</strong> Secure your asset directly on the Arbitrum One Mainnet.</li>
                </ul>
            </div>
            
            <button onclick="${PRESALE_ACTION}" class="group relative w-full bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 bg-[length:200%_auto] hover:bg-right transition-all duration-500 text-zinc-900 font-black py-4 px-5 rounded-xl text-lg shadow-xl shadow-amber-500/30 border border-yellow-400/50 flex items-center justify-center gap-3 overflow-hidden transform hover:scale-[1.02]">
                <div class="absolute inset-0 bg-white/10 group-hover:bg-transparent transition-colors"></div>
                <i class="fa-solid fa-wallet text-xl animate-pulse"></i> 
                <span class="text-lg z-10">CONNECT & VIEW TIERS</span>
            </button>
            
            <div class="mt-6 text-[10px] text-zinc-600 uppercase tracking-widest">
                Backcoin Protocol on Arbitrum One
            </div>
        </div>
    `;

    openModal(content, 'max-w-sm', true); 
    
    // --- LÓGICA DA ANIMAÇÃO ---
    const bkc = document.getElementById('welcome-logo-bkc');
    const arb = document.getElementById('welcome-logo-arb');
    
    if (bkc && arb) {
        let isBkcVisible = true;
        // Inicia o ciclo da logo
        setInterval(() => {
            if (isBkcVisible) {
                bkc.style.opacity = '0';
                arb.style.opacity = '1';
            } else {
                bkc.style.opacity = '1';
                arb.style.opacity = '0';
            }
            isBkcVisible = !isBkcVisible;
        }, 1500); // Troca a cada 1.5 segundos
    }
}

// 🔥 CORREÇÃO: Expondo funções ao escopo global para o HTML
window.closeModal = closeModal;
window.openModal = openModal;
window.showToast = showToast;