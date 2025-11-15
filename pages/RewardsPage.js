// pages/RewardsPage.js

const ethers = window.ethers;

import { DOMElements } from '../dom-elements.js'; 
import { State } from '../state.js';
import { 
    calculateUserTotalRewards, 
    calculateClaimDetails,
    getHighestBoosterBoostFromAPI, 
    safeContractCall 
} from '../modules/data.js'; 
import { executeUniversalClaim } from '../modules/transactions.js'; 
import { 
    formatBigNumber, 
    renderLoading, 
    renderNoData, 
    renderError 
} from '../utils.js';
import { addresses } from '../config.js'; 


// --- FUNÇÕES DE RENDERIZAÇÃO PRINCIPAL ---

/**
 * Renderiza o painel principal de recompensas e reivindicação.
 */
async function renderClaimPanel() {
    const el = document.getElementById('rewards-details-content');
    const rewardsPanel = document.getElementById('claimable-rewards-panel');

    if (!el || !rewardsPanel) return;

    if (!State.isConnected) {
        rewardsPanel.classList.add('hidden');
        return;
    }
    
    rewardsPanel.classList.remove('hidden');
    renderLoading(el);

    try {
        // 1. Calcular Detalhes da Reivindicação (Net/Fee)
        const claimDetails = await calculateClaimDetails();
        const { totalRewards, netClaimAmount, feeAmount, discountPercent, basePenaltyPercent } = claimDetails;

        // 2. Calcular Recompensas Brutas Separadas
        const totalGrossRewards = await calculateUserTotalRewards();
        
        // 3. Obter Detalhes do Desconto (para exibição)
        const efficiencyData = await getHighestBoosterBoostFromAPI();
        const baseFeeAmount = (totalRewards * BigInt(Math.round(basePenaltyPercent * 100))) / 10000n;
        
        // O valor real economizado
        const calculatedDiscountAmount = baseFeeAmount > feeAmount 
            ? baseFeeAmount - feeAmount 
            : 0n;

        // Renderiza o painel de recompensas
        el.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                <div class="bg-main border border-border-color rounded-lg p-4">
                    <p class="text-zinc-400 text-sm">Staking Rewards (Delegator)</p>
                    <p class="text-2xl font-bold text-purple-400">${formatBigNumber(totalGrossRewards.stakingRewards).toFixed(4)} $BKC</p>
                </div>
                 <div class="bg-main border border-border-color rounded-lg p-4">
                    <p class="text-zinc-400 text-sm">Validator Rewards (Miner)</p>
                    <p class="text-2xl font-bold text-blue-400">${formatBigNumber(totalGrossRewards.minerRewards).toFixed(4)} $BKC</p>
                </div>
            </div>

            <div class="space-y-3 p-4 bg-main border border-border-color rounded-lg">
                <div class="flex justify-between items-center text-sm">
                    <span class="text-zinc-400">Total Claimable (Gross):</span>
                    <span class="font-bold text-amber-400">${formatBigNumber(totalRewards).toFixed(4)} $BKC</span>
                </div>
                
                <div class="flex justify-between items-center text-sm ${discountPercent > 0 ? 'line-through text-red-500/70' : 'text-zinc-400'}">
                    <span class="text-zinc-400">Base Fee (${basePenaltyPercent.toFixed(2)}%):</span>
                    <span>-${formatBigNumber(baseFeeAmount).toFixed(4)} $BKC</span>
                </div>
                
                ${discountPercent > 0 ? 
                    `<div class="flex justify-between font-semibold text-green-400">
                        <span>Booster Discount (${efficiencyData.highestBoost / 100}%):</span>
                        <span>+${formatBigNumber(calculatedDiscountAmount).toFixed(4)} $BKC</span>
                     </div>` : 
                    `<div class="flex justify-between text-zinc-400">
                        <span>Booster Discount:</span>
                        <span>0.00%</span>
                    </div>`
                }

                <div class="flex justify-between font-bold text-xl pt-3 border-t border-border-color/50">
                    <span>Net Amount to Receive:</span>
                    <span class="${netClaimAmount > 0n ? 'text-white' : 'text-zinc-500'}">${formatBigNumber(netClaimAmount).toFixed(4)} $BKC</span>
                </div>
            </div>

            <p class="text-xs text-zinc-500 mt-4">Fees are sent to the Delegator Pool to benefit all pStake holders.</p>

            <button id="claimAllRewardsBtn" class="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-3 px-4 rounded-md text-lg transition-opacity mt-5 ${totalRewards === 0n ? 'btn-disabled' : ''}" ${totalRewards === 0n ? 'disabled' : ''}>
                 <i class="fa-solid fa-gift mr-2"></i> Claim All Rewards Now
            </button>
        `;

        // Adicionar listener de Claim
        document.getElementById('claimAllRewardsBtn')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const { stakingRewards, minerRewards } = totalGrossRewards;
            const success = await executeUniversalClaim(stakingRewards, minerRewards, btn);
            if (success) {
                // Força o re-render após a reivindicação
                await RewardsPage.render(true);
            }
        });

    } catch (error) {
        console.error("Error rendering rewards panel:", error);
        renderError(el, "Failed to load rewards data.");
    }
}


export const RewardsPage = {
    hasInitializedListeners: false, 

    async render(isUpdate = false) {
        const contentWrapper = document.getElementById('rewards');
        if (!contentWrapper) return;
        
        // Remove ou ajusta o bloco de Certificados no HTML
        const certsSection = document.getElementById('certificates-list-container');
        const certsTitle = contentWrapper.querySelector('h2:last-of-type'); // Assuming the h2 is the last one
        
        if (certsSection && certsTitle && certsTitle.textContent.includes('Vesting Certificates')) {
            // Remove o conteúdo e mostra a mensagem de descontinuação
            certsSection.innerHTML = `
                <div class="p-8 bg-sidebar/50 border border-red-500/50 rounded-xl text-center">
                    <i class="fa-solid fa-file-excel text-4xl text-red-400 mb-3"></i>
                    <h3 class="text-xl font-bold">Vesting Certificates Descontinuados</h3>
                    <p class="text-zinc-400 mt-2">O sistema de Certificados de Vesting foi removido do protocolo.</p>
                </div>
            `;
        }

        if (!State.isConnected) {
            const el = document.getElementById('rewards-details-content');
            if (el) renderNoData(el, "Connect your wallet to view your rewards and status.");
            return;
        }

        await renderClaimPanel();
    },
};