// pages/FaucetPage.js
// ✅ VERSÃO FINAL V2.0: "Visual Impact" - Loading Animado + UX Premium

import { addresses, FAUCET_AMOUNT_WEI } from '../config.js';
import { State } from '../state.js';
import { formatBigNumber, formatAddress, renderError } from '../utils.js';
import { safeBalanceOf } from '../modules/data.js';
import { executeFaucetClaim } from '../modules/transactions.js';
import { showToast } from '../ui-feedback.js';

const ethers = window.ethers;

// --- CSS FX (INJEÇÃO) ---
const style = document.createElement('style');
style.innerHTML = `
    @keyframes pulseLogo {
        0% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.2)); }
        50% { transform: scale(1.1); filter: drop-shadow(0 0 25px rgba(16, 185, 129, 0.5)); }
        100% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.2)); }
    }
    .faucet-logo-anim { animation: pulseLogo 2s infinite ease-in-out; }
    
    .glass-card {
        background: rgba(15, 15, 20, 0.7);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.05);
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4);
    }
    .step-number {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    }
`;
document.head.appendChild(style);

// --- ESTADO LOCAL ---
let faucetState = {
    ethBalance: null,
    faucetBKCBalance: null,
    isLoading: false, 
    lastFetch: 0,
    loadingInterval: null // Para rodar as mensagens
};

// --- COMPONENTES VISUAIS ---

function renderLoadingScreen() {
    return `
        <div class="flex flex-col items-center justify-center py-32 animate-fadeIn">
            <img src="assets/bkc_logo_3d.png" class="w-24 h-24 mb-8 faucet-logo-anim" alt="Loading...">
            <div class="text-xl font-bold text-white mb-2 tracking-widest" id="faucet-loading-text">CONNECTING...</div>
            <div class="w-64 h-1 bg-zinc-800 rounded-full overflow-hidden mt-4">
                <div class="h-full bg-green-500 animate-progressBar"></div>
            </div>
        </div>
    `;
}

function startLoadingMessages() {
    const msgs = [
        "CONNECTING TO SEPOLIA...",
        "VERIFYING WALLET BALANCE...",
        "CHECKING FAUCET LIQUIDITY...",
        "PREPARING $BKC DROP..."
    ];
    let idx = 0;
    if (faucetState.loadingInterval) clearInterval(faucetState.loadingInterval);
    
    faucetState.loadingInterval = setInterval(() => {
        const el = document.getElementById('faucet-loading-text');
        if (el) {
            el.innerText = msgs[idx % msgs.length];
            idx++;
        }
    }, 1500);
}

function renderStepCard({ step, title, contentHTML, actionHTML = '', status = 'normal' }) {
    const borderClass = status === 'error' ? 'border-red-500/30' : 'border-zinc-700/50';
    
    return `
        <div class="glass-card rounded-2xl p-6 mb-6 border ${borderClass} transition-all hover:border-zinc-600">
            <div class="flex items-start gap-4">
                <div class="flex-shrink-0 w-10 h-10 rounded-xl step-number flex items-center justify-center font-bold text-lg shadow-lg">
                    ${step}
                </div>
                <div class="flex-1">
                    <h3 class="text-xl font-bold text-white mb-3">${title}</h3>
                    <div class="text-zinc-400 text-sm leading-relaxed mb-4">
                        ${contentHTML}
                    </div>
                    ${actionHTML}
                </div>
            </div>
        </div>
    `;
}

function renderWalletHeader(ethBalance) {
    const ethFormatted = ethBalance !== null ? Number(ethers.formatEther(ethBalance)).toFixed(4) : '0.0000';
    const hasGas = ethBalance > 0n;

    return `
        <div class="flex flex-col md:flex-row justify-between items-center bg-zinc-900/50 rounded-xl p-4 px-6 mb-8 border border-zinc-800">
            <div class="flex items-center gap-3 mb-3 md:mb-0">
                <div class="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
                    <i class="fa-solid fa-wallet"></i>
                </div>
                <div>
                    <div class="text-[10px] text-zinc-500 uppercase font-bold">CONNECTED WALLET</div>
                    <div class="font-mono text-white text-sm">${formatAddress(State.userAddress)}</div>
                </div>
            </div>
            
            <div class="flex items-center gap-4">
                <div class="text-right">
                    <div class="text-[10px] text-zinc-500 uppercase font-bold">GAS BALANCE (ETH)</div>
                    <div class="font-mono text-sm ${hasGas ? 'text-green-400' : 'text-red-400'} font-bold">
                        ${ethFormatted} ETH
                    </div>
                </div>
                ${!hasGas ? '<div class="px-3 py-1 bg-red-500/10 text-red-400 text-xs rounded-lg border border-red-500/20">Gas Required</div>' : ''}
            </div>
        </div>
    `;
}

function renderContent() {
    const hasGas = (faucetState.ethBalance || 0n) > 0n;
    const bkcAmount = formatBigNumber(FAUCET_AMOUNT_WEI);
    const faucetHasFunds = (faucetState.faucetBKCBalance || 0n) >= FAUCET_AMOUNT_WEI;

    let html = `
        <div class="max-w-2xl mx-auto animate-fadeIn">
            <div class="text-center mb-10">
                <h1 class="text-4xl font-black text-white mb-2 tracking-tight">TESTNET FAUCET</h1>
                <p class="text-zinc-400">Get free <span class="text-green-400 font-bold">$BKC</span> tokens to explore the ecosystem.</p>
            </div>

            ${renderWalletHeader(faucetState.ethBalance)}
    `;

    // PASSO 1: GAS (ETH)
    if (!hasGas) {
        html += renderStepCard({
            step: '1',
            title: 'Get Sepolia ETH (Gas)',
            status: 'error',
            contentHTML: `You need a small amount of Sepolia ETH to pay for transaction fees. This is free and required by the blockchain network.`,
            actionHTML: `
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                    <button onclick="navigator.clipboard.writeText('${State.userAddress}'); showToast('Address copied!', 'success')" class="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-lg text-sm border border-zinc-700 transition-colors">
                        <i class="fa-regular fa-copy mr-2"></i> Copy Address
                    </button>
                    <a href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg text-sm text-center shadow-lg shadow-blue-900/20 transition-all">
                        Go to ETH Faucet <i class="fa-solid fa-arrow-up-right-from-square ml-2"></i>
                    </a>
                </div>
            `
        });
    }

    // PASSO 2: CLAIM BKC
    let claimBtn = '';
    if (!faucetHasFunds) {
        claimBtn = `<button disabled class="w-full bg-zinc-800 text-zinc-500 font-bold py-4 rounded-xl cursor-not-allowed border border-zinc-700">Faucet Empty (Try later)</button>`;
    } else if (!hasGas) {
        claimBtn = `<button disabled class="w-full bg-zinc-800 text-zinc-500 font-bold py-4 rounded-xl cursor-not-allowed border border-zinc-700">Waiting for Gas...</button>`;
    } else {
        claimBtn = `
            <button id="claimFaucetBtn" class="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black py-4 rounded-xl shadow-lg shadow-green-900/20 transform transition hover:-translate-y-1 active:scale-95 text-lg tracking-wide">
                CLAIM ${bkcAmount} $BKC
            </button>
        `;
    }

    html += renderStepCard({
        step: hasGas ? '1' : '2',
        title: 'Claim Test Tokens',
        contentHTML: `Mint <strong>${bkcAmount} $BKC</strong> instantly to your wallet. You can use these tokens to stake, play, or test the notary service.`,
        actionHTML: claimBtn
    });

    html += `
        <div class="mt-8 text-center">
            <p class="text-xs text-zinc-600 font-mono">
                Faucet Contract: <a href="https://sepolia.etherscan.io/address/${addresses.faucet}" target="_blank" class="hover:text-green-400 transition-colors underline">${formatAddress(addresses.faucet)}</a>
            </p>
        </div>
        </div>
    `;

    return html;
}

// --- LÓGICA PRINCIPAL ---

export const FaucetPage = {
    async render(isNewPage) {
        const container = document.getElementById('faucet');
        if (!container) return;
        
        if (!container.querySelector('#faucet-content-wrapper')) {
             container.innerHTML = `<div id="faucet-content-wrapper" class="container mx-auto max-w-7xl py-8 min-h-[60vh]"></div>`;
        }
        const wrapper = document.getElementById('faucet-content-wrapper');

        // 1. Desconectado
        if (!State.isConnected) {
            wrapper.innerHTML = `
                <div class="text-center py-32 animate-fadeIn">
                    <div class="mb-6 inline-block p-6 rounded-full bg-zinc-900 border border-zinc-800">
                        <i class="fa-solid fa-wallet text-4xl text-zinc-500"></i>
                    </div>
                    <h2 class="text-2xl font-bold text-white mb-2">Wallet Disconnected</h2>
                    <p class="text-zinc-400 mb-8">Please connect to claim tokens.</p>
                    <button onclick="window.openConnectModal()" class="bg-white text-black font-bold py-3 px-8 rounded-full hover:scale-105 transition-transform">Connect Wallet</button>
                </div>
            `;
            return;
        }

        // 2. Loading
        const now = Date.now();
        if ((faucetState.ethBalance === null) && (!faucetState.isLoading && (now - faucetState.lastFetch > 5000))) {
            faucetState.isLoading = true;
            faucetState.lastFetch = now;
            wrapper.innerHTML = renderLoadingScreen();
            startLoadingMessages();

            try {
                // Fetch Paralelo
                const [ethBal, faucetBal] = await Promise.all([
                    State.provider.getBalance(State.userAddress).catch(() => 0n),
                    safeBalanceOf(State.bkcTokenContractPublic, addresses.faucet)
                ]);
                
                faucetState.ethBalance = ethBal;
                faucetState.faucetBKCBalance = faucetBal;
                
                // Pequeno delay para apreciar a animação (UX)
                setTimeout(() => {
                    faucetState.isLoading = false;
                    clearInterval(faucetState.loadingInterval);
                    wrapper.innerHTML = renderContent();
                    this.attachListeners();
                }, 1500);

            } catch (e) {
                console.error(e);
                faucetState.isLoading = false;
                wrapper.innerHTML = renderError("Failed to load faucet data.");
            }
        } else if (!faucetState.isLoading) {
            // Renderiza direto se já tem dados
            wrapper.innerHTML = renderContent();
            this.attachListeners();
        }
    },

    attachListeners() {
        const btn = document.getElementById('claimFaucetBtn');
        if (btn) {
            // Remove clones antigos para evitar duplo click
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', async () => {
                const success = await executeFaucetClaim(newBtn);
                if (success) {
                    // Refresh após sucesso
                    setTimeout(() => {
                        faucetState = { ethBalance: null, faucetBKCBalance: null, isLoading: false, lastFetch: 0 };
                        this.render(true);
                    }, 2000);
                }
            });
        }
    },

    update() {
        const container = document.getElementById('faucet');
        if (container && !container.classList.contains('hidden')) {
             this.render(false);
        }
    }
};