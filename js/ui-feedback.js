// js/ui-feedback.js
// ✅ VERSÃO AJUSTADA: Caminhos de Imagem Corrigidos

import { DOMElements } from './dom-elements.js';

let hasShownWelcomeModal = false; 

export const showToast = (message, type = 'info', txHash = null) => {
    if (!DOMElements.toastContainer) return;
    const explorerBaseUrl = "https://arbiscan.io/tx/"; 

    const definitions = {
        success: { icon: 'fa-check-circle', color: 'bg-green-600', border: 'border-green-400' },
        error: { icon: 'fa-exclamation-triangle', color: 'bg-red-600', border: 'border-red-400' },
        info: { icon: 'fa-info-circle', color: 'bg-blue-600', border: 'border-blue-400' },
        warning: { icon: 'fa-exclamation-circle', color: 'bg-yellow-600', border: 'border-yellow-400' }
    };
    const def = definitions[type] || definitions.info;

    const toast = document.createElement('div');
    toast.className = `flex items-center w-full max-w-xs p-4 text-white rounded-lg shadow-lg transition-all duration-500 ease-out transform translate-x-full opacity-0 ${def.color} border-l-4 ${def.border} mb-3`;

    let content = `
        <div class="flex items-center flex-1">
            <i class="fa-solid ${def.icon} text-xl mr-3"></i>
            <div class="text-sm font-medium leading-tight">${message}</div>
        </div>
    `;

    if (txHash) {
        content += `<a href="${explorerBaseUrl}${txHash}" target="_blank" class="ml-3 text-white/80 hover:text-white"><i class="fa-solid fa-arrow-up-right-from-square text-sm"></i></a>`;
    }
    
    content += `<button class="ml-3 text-white/80 hover:text-white" onclick="this.closest('.shadow-lg').remove()"><i class="fa-solid fa-xmark"></i></button>`;

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
    DOMElements.modalContainer.innerHTML = '';
};

export const openModal = (content, maxWidth = 'max-w-md') => {
    if (!DOMElements.modalContainer) return;
    
    const modalHTML = `
        <div id="modal-backdrop" class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 transition-opacity duration-300">
            <div class="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full ${maxWidth} shadow-2xl relative animate-fade-in-up">
                <button class="absolute top-4 right-4 text-zinc-500 hover:text-white" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
                ${content}
            </div>
        </div>
    `;
    DOMElements.modalContainer.innerHTML = modalHTML;
};

// --- WELCOME MODAL ---

export function showWelcomeModal() {
    const SESSION_KEY = 'presale_welcome_shown_v1';
    if (sessionStorage.getItem(SESSION_KEY)) return;
    if (hasShownWelcomeModal) return;

    hasShownWelcomeModal = true;
    sessionStorage.setItem(SESSION_KEY, 'true');

    const PRESALE_ACTION = "closeModal(); if(window.openConnectModal) window.openConnectModal();"; 

    // 🔥 FIX: Caminhos de imagem ajustados para ./assets/
    const content = `
        <div class="text-center pt-2 pb-4">
            <div class="mb-4 relative w-24 h-24 mx-auto" style="min-height: 80px;">
                <div class="absolute inset-2 flex items-center justify-center">
                    <img id="welcome-logo-bkc" src="./assets/bkc_logo_3d.png" class="w-full h-full object-contain absolute transition-opacity duration-700" style="opacity: 1;" alt="Backcoin">
                    <img id="welcome-logo-arb" src="./assets/icon_arbitrum.svg" class="w-full h-full object-contain absolute transition-opacity duration-700" style="opacity: 0; padding: 10px;" alt="Arbitrum" onerror="this.style.display='none'">
                </div>
            </div>
            
            <h2 class="text-3xl font-black text-white mb-2 uppercase tracking-wide">Welcome to Presale</h2> 
            <p class="text-zinc-300 mb-6 text-sm px-4">Secure your <strong class="text-amber-400">Backcoin Booster NFTs</strong> on <strong>Arbitrum One</strong>.</p>
            
            <button onclick="${PRESALE_ACTION}" class="w-full bg-gradient-to-r from-amber-600 to-yellow-500 text-zinc-900 font-black py-4 rounded-xl text-lg shadow-xl hover:scale-[1.02] transition-transform">
                CONNECT WALLET
            </button>
        </div>
    `;

    openModal(content, 'max-w-sm'); 
    
    // Animação simples de logo
    const bkc = document.getElementById('welcome-logo-bkc');
    const arb = document.getElementById('welcome-logo-arb');
    if (bkc && arb) {
        let showBkc = true;
        setInterval(() => {
            showBkc = !showBkc;
            bkc.style.opacity = showBkc ? '1' : '0';
            arb.style.opacity = showBkc ? '0' : '1';
        }, 2000); 
    }
}

// Expõe funções globais
window.closeModal = closeModal;
window.openModal = openModal;
window.showToast = showToast;