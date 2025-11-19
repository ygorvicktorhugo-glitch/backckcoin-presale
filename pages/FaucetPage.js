// pages/FaucetPage.js

const ethers = window.ethers;

import { State } from '../state.js';
import { addresses, FAUCET_AMOUNT_WEI } from '../config.js';
import { showToast } from '../ui-feedback.js';
import { executeFaucetClaim } from '../modules/transactions.js';
import { formatBigNumber, renderLoading, renderError, renderNoData, formatAddress } from '../utils.js';
import { safeBalanceOf, safeContractCall } from '../modules/data.js';

let faucetState = {
    ethBalance: null,
    faucetBKCBalance: null,
    isLoading: false, // Adicionando estado de loading para evitar chamadas múltiplas
};

// --- Função Auxiliar: Copiar para Clipboard ---
function copyToClipboard(text, buttonElement) {
    if (!buttonElement || buttonElement.disabled) return;
    navigator.clipboard.writeText(text).then(() => {
        const originalHTML = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i class="fa-solid fa-check mr-2"></i> Copied!';
        buttonElement.disabled = true;
        setTimeout(() => {
            if (buttonElement) {
                // Ensure the button element still exists before updating
                const buttonToUpdate = document.getElementById(buttonElement.id);
                if (buttonToUpdate) {
                    buttonToUpdate.innerHTML = originalHTML;
                    buttonToUpdate.disabled = false;
                }
            }
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        showToast('Failed to copy address.', 'error');
    });
}

// --- Função Auxiliar: Renderizar Card de Passo (Genérico) ---
function renderStepCard({ title, status, icon, contentHTML, actionHTML = '', customClass = '' }) {
    // Classes de status ajustadas para melhor alinhamento visual
    const statusStyles = {
        required: { border: 'border-red-500',    bg: 'bg-red-900/30',    text: 'text-red-400',    iconBg: 'bg-red-500/20' },
        active:   { border: 'border-green-500',   bg: 'bg-green-900/30',   text: 'text-green-400',  iconBg: 'bg-green-500/20' },
        error:    { border: 'border-amber-500',     bg: 'bg-amber-900/30',    text: 'text-amber-400',    iconBg: 'bg-amber-500/20' },
        complete: { border: 'border-zinc-700',   bg: 'bg-zinc-800/50',  text: 'text-zinc-400',   iconBg: 'bg-zinc-700/50' }
    };
    const styles = statusStyles[status] || statusStyles.complete; // Default para 'complete' (cinza)

    return `
        <div class="step-card border ${styles.border}/50 ${styles.bg} rounded-xl shadow-xl hover:shadow-2xl transition-shadow duration-300 mb-6 overflow-hidden ${customClass}">
            <div class="flex items-center gap-4 p-4 border-b ${styles.border}/50">
                <i class="fa-solid ${icon} text-2xl ${styles.text} flex-shrink-0"></i>
                <h3 class="text-xl font-bold text-white flex-1">${title}</h3>
            </div>
            <div class="p-5">
                <div class="prose prose-sm prose-invert max-w-none text-zinc-300 mb-4 prose-p:my-2">
                    ${contentHTML}
                </div>
                ${actionHTML}
            </div>
        </div>
    `;
}

// --- Funções de Componente de Tela ---

function renderWalletInfo(walletAddress, ethBalance) {
    const ethFormatted = ethBalance ? ethers.formatEther(ethBalance) : '0.00';
    return `
        <div class="bg-sidebar p-4 rounded-xl text-sm mb-6 border border-border-color shadow-lg">
            <p class="text-zinc-400">Your Wallet:</p>
            <p class="font-mono text-white break-all">${walletAddress}</p>
            <p class="text-zinc-400 mt-2">Sepolia ETH Balance (Gas):</p>
            <p class="font-bold text-lg ${ethBalance > 0n ? 'text-green-400' : 'text-red-400'}">${Number(ethFormatted).toFixed(4)} ETH</p>
        </div>
    `;
}


function renderScreen_MissingETH() {
    return `
        <div class="max-w-xl mx-auto">
            ${renderWalletInfo(State.userAddress, faucetState.ethBalance)}
            
            ${renderStepCard({
                title: 'Step 1: Get Sepolia ETH (Gas)',
                status: 'required',
                icon: 'fa-gas-pump', 
                contentHTML: `
                    <p>Your wallet requires Sepolia ETH to pay for transaction fees (gas) before we can send you $BKC.</p>
                    <p class="mt-3 text-sm font-semibold text-white">Follow these 3 actions to get Sepolia ETH:</p>
                    <ol class="list-decimal list-inside text-zinc-300 ml-4 space-y-2 mt-2 text-sm">
                        <li>Action 1: Copy your wallet address.</li>
                        <li>Action 2: Click the button to go to the Sepolia ETH Faucet.</li>
                        <li>Action 3: Paste your address into the Faucet and claim your ETH.</li>
                    </ol>
                `,
                actionHTML: `
                    <button id="copyAddressBtnStep1" class="mt-4 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors text-sm">
                        <i class="fa-solid fa-copy mr-2"></i> Copy Your Address (Action 1)
                    </button>
                    <a href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noopener noreferrer" class="mt-3 w-full inline-block text-center bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2 px-4 rounded-md transition-colors text-sm shadow-md">
                        <i class="fa-solid fa-cloud mr-2"></i> Go to ETH Faucet (Action 2)
                    </a>
                    <p class="text-xs text-zinc-500 mt-4 italic text-center">After receiving ETH, please refresh this page (F5) to proceed to the next step.</p>
                `
            })}
        </div>
    `;
}


function renderScreen_ReadyToClaim() {
    // FAUCET_AMOUNT_WEI é o valor ajustado de 100 BKC
    const bkcClaimAmountFormatted = formatBigNumber(FAUCET_AMOUNT_WEI);
    const faucetHasEnoughBKC = faucetState.faucetBKCBalance >= FAUCET_AMOUNT_WEI;

    let claimStatus = 'active'; // Default
    let content = `<p class="text-lg">You are ready to claim ${bkcClaimAmountFormatted.toFixed(2)} $BKC per claim.</p><p class="text-xs text-zinc-400">This action can be performed multiple times to facilitate network testing.</p>`;
    let actionHTML = `
        <button id="claimFaucetBtn" class="w-full font-bold py-3 px-6 rounded-lg text-lg transition-colors shadow-lg hover:shadow-xl bg-green-500 hover:bg-green-600 text-zinc-900">
            <i class="fa-solid fa-gift mr-2"></i> Claim ${bkcClaimAmountFormatted.toFixed(2)} $BKC
        </button>
    `;

    if (!faucetHasEnoughBKC) {
        claimStatus = 'error';
        content = `<p class="text-lg text-center">Faucet Empty! The faucet currently has insufficient $BKC. Please try again later.</p>
                   <p class="text-sm text-zinc-400 text-center mt-2">Faucet Balance: ${formatBigNumber(faucetState.faucetBKCBalance).toFixed(2)} $BKC</p>`;
        actionHTML = `<button disabled class="w-full font-bold py-3 px-6 rounded-lg text-lg btn-disabled bg-zinc-700 text-zinc-500 shadow-md">Faucet Empty</button>`;
    }

    return `
        <div class="max-w-xl mx-auto">
            ${renderWalletInfo(State.userAddress, faucetState.ethBalance)}
            
            ${renderStepCard({
                title: 'Step 2: Claim Your $BKC Tokens',
                status: claimStatus,
                icon: 'fa-hand-holding-dollar', 
                contentHTML: content,
                actionHTML: actionHTML
            })}
        </div>
    `;
}

function renderScreen_Disconnected() {
    return `
        <div class="max-w-xl mx-auto text-center py-20">
            <i class="fa-solid fa-plug-circle-exclamation text-6xl text-red-500 mb-6"></i>
            <h3 class="text-2xl font-bold text-white mb-3">Connect Your Wallet to Access the Testnet Faucet</h3>
            <p class="text-zinc-400 mb-6">
                Please connect your wallet on the Sepolia Testnet to verify your address and claim free $BKC tokens for testing.
            </p>
            <button onclick="window.openConnectModal()" class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-3 px-8 rounded-lg text-lg transition-all shadow-lg hover:shadow-amber-500/20">
                <i class="fa-solid fa-wallet mr-2"></i> Connect Wallet
            </button>
        </div>
    `;
}

// --- Função Principal de Renderização ---
async function renderFaucetContent() {
    const container = document.getElementById('faucet-content-wrapper');
    if (!container) return;

    // 1. VERIFICAÇÃO DE CONEXÃO
    if (!State.isConnected || !State.userAddress || !State.provider) { 
        container.innerHTML = renderScreen_Disconnected(); 
        return; 
    }
    
    // 2. Verificações de Configuração
    // Nota: O State.faucetContractPublic é inicializado em wallet.js
    if (!addresses.faucet || addresses.faucet.startsWith('0x...') || !State.faucetContractPublic || !State.bkcTokenContractPublic) {
        return renderError(container, 'Faucet contract is not configured or instantiated correctly in the dApp.');
    }


    // 3. Carregamento dos Dados
    // Verifica se os dados necessários para o render já foram buscados
    if (faucetState.ethBalance === null || faucetState.faucetBKCBalance === null) {
        if (!faucetState.isLoading) {
            faucetState.isLoading = true;
            container.innerHTML = `<div class="max-w-xl mx-auto text-center py-20"><div class="loader inline-block !w-8 !h-8"></div><p class="text-zinc-400 mt-4 text-lg">Loading faucet status...</p></div>`;
            console.log("FAUCET: Starting data fetch...");
            try {
                // Usamos a instância pública (State.publicProvider e State.bkcTokenContractPublic) para leitura
                const [ethBal, faucetBal] = await Promise.all([
                    State.publicProvider.getBalance(State.userAddress), // Usando publicProvider
                    safeBalanceOf(State.bkcTokenContractPublic, addresses.faucet) // Usando public contract
                ]);
                faucetState.ethBalance = ethBal;
                faucetState.faucetBKCBalance = faucetBal;
            } catch (e) {
                console.error("FAUCET: Critical error during data fetch.", e);
                return renderError(container, `Could not load faucet data. Check the configured Faucet address on Sepolia.`);
            }
            faucetState.isLoading = false;
        } else {
            return;
        }
    }

    // 4. Determinação da Tela (Conectado)
    let screenContent = '';
    const needsSepoliaETH = faucetState.ethBalance === 0n;

    if (needsSepoliaETH) {
        screenContent = renderScreen_MissingETH();
    } else { 
        screenContent = renderScreen_ReadyToClaim();
    }

    // 5. Renderização Final da Estrutura
    container.innerHTML = `
        <div class="max-w-2xl mx-auto">
            <div class="text-center mb-10">
                <i class="fa-solid fa-faucet-drip text-6xl text-cyan-400 mb-4"></i>
                <h2 class="text-3xl font-bold text-white mb-2">Sepolia Testnet Faucet</h2>
                <p class="text-zinc-400">Get free $BKC tokens to test the Backchain dApp in 2 simple steps.</p>
            </div>

            ${screenContent}

            <div class="mt-10 pt-6 border-t border-border-color text-center text-xs text-zinc-500 space-y-2">
                 <p><strong class="text-zinc-400">Your Address:</strong> <span class="font-mono">${State.userAddress ? formatAddress(State.userAddress) : 'N/A'}</span></p>
                 <p><strong class="text-zinc-400">Faucet Contract:</strong> <a href="https://sepolia.etherscan.io/address/${addresses.faucet}" target="_blank" class="font-mono text-blue-500 hover:text-blue-400 hover:underline ml-1">${formatAddress(addresses.faucet)} <i class="fa-solid fa-arrow-up-right-from-square text-xs ml-1"></i></a></p>
                 <p><strong class="text-zinc-400">$BKC Token Contract:</strong> <a href="https://sepolia.etherscan.io/token/${addresses.bkcToken}" target="_blank" class="font-mono text-blue-500 hover:text-blue-400 hover:underline ml-1">${formatAddress(addresses.bkcToken)} <i class="fa-solid fa-arrow-up-right-from-square text-xs ml-1"></i></a></p>
            </div>
        </div>
    `;

    // 6. Re-adiciona Listeners de Cópia e Claim
    const copyBtnElement = document.getElementById('copyAddressBtnStep1');
    if (copyBtnElement && State.userAddress) {
        copyBtnElement.addEventListener('click', (e) => {
            copyToClipboard(State.userAddress, e.currentTarget);
        });
    }

    const claimBtnElement = document.getElementById('claimFaucetBtn');
    if (claimBtnElement && !claimBtnElement._listenerAttached) {
         claimBtnElement.addEventListener('click', FaucetPage.claimHandler);
         claimBtnElement._listenerAttached = true;
    }
}

// --- Objeto Exportado da Página ---
export const FaucetPage = {
    async render() {
        const faucetContainer = document.getElementById('faucet');
        if (!faucetContainer) return;
        
        // 1. Renderiza o wrapper da página
        faucetContainer.innerHTML = `<div id="faucet-content-wrapper" class="container mx-auto max-w-7xl py-8"></div>`;

        // 2. Reseta o estado apenas se estiver desconectado ou se não houve conexão anterior, 
        // caso contrário, chamamos renderContent que fará as checagens
        if (!State.isConnected) {
            faucetState = { ethBalance: null, faucetBKCBalance: null, isLoading: false };
        }
        
        // 3. Renderiza o conteúdo (que agora fará a busca de dados ou a tela de desconexão)
        await renderFaucetContent();
    },
    async claimHandler(e) {
        const claimBtn = e.currentTarget;
        if (claimBtn && !claimBtn.disabled) {
            const success = await executeFaucetClaim(claimBtn);
            if (success) {
                // Força re-renderização completa após delay para refletir o novo saldo de BKC
                setTimeout(async () => { 
                    // Limpa o estado para forçar o recarregamento dos saldos do Faucet
                    faucetState = { ethBalance: null, faucetBKCBalance: null, isLoading: false };
                    await FaucetPage.render(); 
                }, 2500);
            }
        }
    },
    update(isConnected) {
        const faucetContainer = document.getElementById('faucet');
        const isVisible = faucetContainer && !faucetContainer.classList.contains('hidden');
        if (isVisible) {
             // Chamado quando o estado da carteira muda (ex: conectou/desconectou)
             FaucetPage.render();
        }
    }
};