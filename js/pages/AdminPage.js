// js/pages/AdminPage.js
// ✅ VERSÃO PRESALE ADMIN: Controle Financeiro e Estoque de NFTs

const ethers = window.ethers;
import { addresses, publicSaleABI } from '../config.js'; 
import { showToast } from '../ui-feedback.js';
import { renderLoading, renderError, formatAddress } from '../utils.js';
import { State } from '../state.js';

// Carteira autorizada a ver o painel (Segurança visual apenas, o contrato bloqueia as txs)
const ADMIN_WALLET = "0x03aC69873293cD6ddef7625AfC91E3Bd5434562a";

// Mapeamento visual dos IDs
const TIER_NAMES = {
    1: "Diamond",
    2: "Platinum",
    3: "Gold",
    4: "Silver",
    5: "Bronze",
    6: "Iron",
    7: "Crystal"
};

let adminState = {
    contractBalance: "0.0",
    totalRevenue: "0.0",
    totalSold: 0,
    tiersData: []
};

// =================================================================
// 1. DATA LOADING (Blockchain)
// =================================================================

const loadAdminData = async () => {
    const adminContent = document.getElementById('admin-content-wrapper');
    if (!adminContent) return;

    // Loader inicial
    adminContent.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64">
            <div class="loader w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 mb-4"></div>
            <p class="text-zinc-400 animate-pulse">Syncing Sales Data from Blockchain...</p>
        </div>
    `;

    try {
        if (!addresses.publicSale) throw new Error("Contract address not configured.");
        
        // Usa Provider Público para leitura (rápido) ou Signer se disponível
        const provider = State.provider || State.publicProvider;
        if (!provider) throw new Error("No provider available.");

        const saleContract = new ethers.Contract(addresses.publicSale, publicSaleABI, provider);

        // 1. Busca Saldo do Contrato (Disponível para saque)
        const balanceWei = await provider.getBalance(addresses.publicSale);
        adminState.contractBalance = ethers.formatEther(balanceWei);

        // 2. Busca Dados de Vendas por Tier (1 a 7)
        const tierIds = [1, 2, 3, 4, 5, 6, 7];
        const tiersPromises = tierIds.map(id => saleContract.tiers(id));
        const results = await Promise.all(tiersPromises);

        let totalRevWei = 0n;
        let totalSold = 0;
        const parsedTiers = [];

        results.forEach((data, index) => {
            const id = index + 1;
            // Ethers v6: Acessa por propriedade ou índice
            const price = data.priceInWei ?? data[0];
            const maxSupply = data.maxSupply ?? data[1];
            const minted = data.mintedCount ?? data[2];
            
            const revenue = price * BigInt(minted);
            totalRevWei += revenue;
            totalSold += Number(minted);

            parsedTiers.push({
                id: id,
                name: TIER_NAMES[id] || `Tier ${id}`,
                price: ethers.formatEther(price),
                minted: Number(minted),
                maxSupply: Number(maxSupply),
                revenue: ethers.formatEther(revenue)
            });
        });

        adminState.tiersData = parsedTiers;
        adminState.totalRevenue = ethers.formatEther(totalRevWei);
        adminState.totalSold = totalSold;

        renderAdminPanel();

    } catch (error) {
        console.error("Admin Load Error:", error);
        adminContent.innerHTML = `
            <div class="p-8 text-center border border-red-900/50 bg-red-900/20 rounded-xl">
                <i class="fa-solid fa-triangle-exclamation text-3xl text-red-500 mb-3"></i>
                <p class="text-red-300">Failed to load admin data.</p>
                <p class="text-xs text-red-400 mt-2 font-mono">${error.message}</p>
                <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-white text-sm">Retry</button>
            </div>
        `;
    }
};

// =================================================================
// 2. ACTIONS (Withdraw)
// =================================================================

const handleWithdraw = async (btn) => {
    if (!State.signer) {
        showToast("Please connect the Admin Wallet.", "error");
        return;
    }

    if (!confirm("Confirm withdrawal of ALL funds to the Treasury Wallet?")) return;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="loader inline-block w-4 h-4 mr-2"></div> Processing...';

    try {
        const saleContract = new ethers.Contract(addresses.publicSale, publicSaleABI, State.signer);
        
        // Chama withdrawFunds() do contrato
        // ABI necessária: function withdrawFunds() external
        // Nota: Se sua ABI importada não tiver withdrawFunds, adicione-a manualmente aqui
        const tx = await saleContract.withdrawFunds();
        
        showToast("Withdrawal submitted...", "info");
        await tx.wait();
        
        showToast("Funds withdrawn successfully!", "success");
        loadAdminData(); // Atualiza saldo na tela

    } catch (error) {
        console.error("Withdraw Error:", error);
        showToast("Withdrawal failed. See console.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

// =================================================================
// 3. RENDER UI
// =================================================================

const renderAdminPanel = () => {
    const container = document.getElementById('admin-content-wrapper');
    if (!container) return;

    // HTML da Tabela de Tiers
    const tableRows = adminState.tiersData.map(tier => {
        const percent = tier.maxSupply > 0 ? ((tier.minted / tier.maxSupply) * 100).toFixed(1) : 0;
        // Cor baseada na performance de vendas
        const progressColor = percent > 80 ? 'bg-green-500' : (percent > 40 ? 'bg-amber-500' : 'bg-zinc-600');

        return `
            <tr class="border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                <td class="p-4 font-bold text-white flex items-center gap-3">
                    <span class="w-2 h-2 rounded-full ${tier.minted > 0 ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-zinc-600'}"></span>
                    ${tier.name}
                </td>
                <td class="p-4 text-zinc-300 font-mono">${tier.price} ETH</td>
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <span class="text-sm font-bold text-white w-16 text-right">${tier.minted}</span>
                        <div class="flex-1 h-2 bg-zinc-700 rounded-full w-24 overflow-hidden">
                            <div class="${progressColor} h-full" style="width: ${Math.max(5, percent)}%"></div>
                        </div>
                    </div>
                </td>
                <td class="p-4 text-right font-mono font-bold text-amber-400">
                    ${parseFloat(tier.revenue).toFixed(4)} ETH
                </td>
            </tr>
        `;
    }).join('');

    // HTML Principal
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div class="bg-zinc-900 border border-amber-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div class="absolute top-0 right-0 p-4 opacity-10">
                    <i class="fa-brands fa-ethereum text-9xl text-amber-500"></i>
                </div>
                
                <h3 class="text-zinc-400 text-sm font-bold uppercase tracking-widest mb-1">Contract Balance</h3>
                <div class="text-4xl font-black text-white mb-6 font-mono tracking-tight">
                    ${parseFloat(adminState.contractBalance).toFixed(4)} <span class="text-lg text-zinc-500">ETH</span>
                </div>

                <button id="btn-withdraw" class="w-full py-3 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-black uppercase tracking-wide rounded-lg shadow-lg transform active:scale-95 transition-all">
                    <i class="fa-solid fa-money-bill-transfer mr-2"></i> Withdraw to Treasury
                </button>
                <p class="text-xs text-center text-zinc-500 mt-3">Funds will be sent to the configured Treasury Wallet.</p>
            </div>

            <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-center">
                <div class="mb-6">
                    <h3 class="text-zinc-400 text-sm font-bold uppercase tracking-widest mb-1">Total Revenue</h3>
                    <div class="text-3xl font-bold text-green-400 font-mono">
                        ${parseFloat(adminState.totalRevenue).toFixed(4)} ETH
                    </div>
                </div>
                <div>
                    <h3 class="text-zinc-400 text-sm font-bold uppercase tracking-widest mb-1">Total NFTs Sold</h3>
                    <div class="text-3xl font-bold text-white font-mono">
                        ${adminState.totalSold} <span class="text-sm text-zinc-500 font-sans">Units</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg">
            <div class="p-5 border-b border-zinc-800 flex justify-between items-center bg-black/20">
                <h2 class="text-xl font-bold text-white"><i class="fa-solid fa-chart-pie mr-2 text-amber-500"></i> Sales by Tier</h2>
                <button onclick="AdminPage.refreshData()" class="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-1 px-3 rounded transition-colors">
                    <i class="fa-solid fa-rotate mr-1"></i> Refresh
                </button>
            </div>
            
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-zinc-950 text-xs text-zinc-500 uppercase tracking-wider">
                            <th class="p-4 font-medium">Tier Name</th>
                            <th class="p-4 font-medium">Price</th>
                            <th class="p-4 font-medium">Sold / Supply</th>
                            <th class="p-4 font-medium text-right">Revenue</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-800">
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Listeners
    document.getElementById('btn-withdraw')?.addEventListener('click', (e) => handleWithdraw(e.target));
};

// =================================================================
// 4. EXPORT
// =================================================================

export const AdminPage = {
    render() {
        const adminContainer = document.getElementById('admin');
        if (!adminContainer) return;

        // Verifica se é o admin (Opcional: o contrato bloqueia, mas isso esconde a UI)
        if (!State.userAddress || State.userAddress.toLowerCase() !== ADMIN_WALLET.toLowerCase()) {
            adminContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center min-h-[50vh] text-center">
                    <i class="fa-solid fa-lock text-6xl text-zinc-700 mb-4"></i>
                    <h2 class="text-2xl font-bold text-white mb-2">Access Restricted</h2>
                    <p class="text-zinc-500 max-w-md">This dashboard is only available to the contract administrator wallet.</p>
                    <p class="text-zinc-600 font-mono text-xs mt-4 bg-zinc-900 p-2 rounded">${ADMIN_WALLET}</p>
                </div>
            `;
            return;
        }

        adminContainer.innerHTML = `<div id="admin-content-wrapper" class="max-w-6xl mx-auto py-10 px-4"></div>`;
        loadAdminData();
    },

    refreshData() {
        console.log("Refreshing Admin Data...");
        loadAdminData();
    }
};