// js/pages/PresalePage.js
// ✅ VERSÃO IPFS READY: Renderiza imagens do Pinata corretamente

const ethers = window.ethers;
import { DOMElements } from '../dom-elements.js';
import { State } from '../state.js';
import { addresses, publicSaleABI, boosterTiers } from '../config.js';

// Configuração Visual baseada no config.js
const PRESALE_CONFIG = {
    countdownDate: "2025-12-01T00:00:00Z",
    
    // Mesclamos os dados visuais do config.js (boosterTiers) com IDs e vantagens
    nftTiers: boosterTiers.map((tier, index) => ({
        ...tier,
        id: index, // Assume ordem 0=Diamond, 1=Platinum...
        batchSize: (index + 1) * 10, // 10, 20, 30...
        phase2Price: "TBA", 
        // Vantagens baseadas no nome
        advantages: getAdvantages(tier.name, tier.boostBips),
        
        priceInWei: 0n, 
        mintedCount: 0,
        isSoldOut: false,
        isLoaded: false
    })),
    
    translations: {
        en: {
            saleTag: "BATCH 1: 50% DISCOUNT",
            saleTitle: "Choose Your Power",
            saleTimerTitle: "Time Remaining Until Phase 2 Price Increase:",
            cardPricePhase2: "Phase 2 Price:",
            cardBtnConnect: "Connect Wallet",
            cardBtnBuy: "Acquire Now",
            cardBtnSoldOut: "Sold Out",
            cardBtnUnavailable: "Unavailable",
            loadingText: "Syncing with Blockchain...",
            anchorBtn: "Secure Your NFT"
        }
    }
};

// Helper para gerar vantagens dinamicamente
function getAdvantages(name, bips) {
    const percent = bips / 100;
    const base = [`${percent}% Max Reward Boost`];
    if (percent >= 30) base.push("Fee Reduction & Liquidity Access");
    if (percent >= 50) base.push("Priority Access & Governance");
    else base.push("Standard Ecosystem Access");
    return base;
}

let hasRendered = false;

// --- CORE FUNCTIONS ---

const getHttpUrl = (tier) => {
    // 1. Tenta usar a imagem real do IPFS (realImg)
    let url = tier.realImg || tier.img;
    
    if (!url) return './assets/bkc_logo_3d.png';
    if (url.startsWith('./')) return url;

    // Lógica para links IPFS de pasta
    // Se o link termina com um hash (sem extensão), assumimos que é uma pasta
    // e tentamos anexar o nome do arquivo padrão: "nome_booster.png"
    if (!url.endsWith('.png') && !url.endsWith('.json') && !url.endsWith('.jpg')) {
        const filename = `${tier.name.toLowerCase()}_booster.png`; 
        // ex: .../QmHash/diamond_booster.png
        if (!url.endsWith('/')) url += '/';
        return url + filename;
    }

    return url;
};

function createCardHTML(tier) {
    const t = PRESALE_CONFIG.translations.en;
    
    let displayPrice = "---";
    if (tier.isLoaded && tier.priceInWei > 0n) {
        displayPrice = parseFloat(ethers.formatUnits(tier.priceInWei, 18)).toString() + " BNB";
    } else if (tier.isLoaded && tier.priceInWei === 0n) {
        displayPrice = "Sold Out";
    }

    const minted = tier.mintedCount;
    const batchTarget = Math.max(tier.batchSize, 10);
    const progressPercent = Math.max(5, Math.min(100, (minted / batchTarget) * 100));

    // Resolve a URL da imagem usando o helper inteligente
    const imageUrl = getHttpUrl(tier);

    return `
        <div class="bg-presale-bg-card border border-presale-border rounded-xl flex flex-col nft-card group overflow-hidden shadow-xl hover:shadow-amber-500/20 transition-all duration-300 w-full" data-tier-id="${tier.id}">
            
            <div class="w-full h-48 overflow-hidden bg-black relative">
                <img src="${imageUrl}" alt="${tier.name}" 
                     class="w-full h-full object-contain p-4 group-hover:scale-110 transition-all duration-500" 
                     onerror="this.src='./assets/bkc_logo_3d.png'"/>
                     
                <div class="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex items-end p-4">
                    <h3 class="text-3xl font-black ${tier.color} drop-shadow-md">${tier.name}</h3>
                </div>
            </div>
            
            <div class="p-5 flex flex-col flex-1">
                <div class="flex justify-between items-center mb-4">
                    <span class="text-sm text-zinc-400">Boost Power</span>
                    <span class="text-2xl font-bold text-white">+${tier.boostBips / 100}%</span>
                </div>

                <div class="space-y-2 mb-6 min-h-[80px]">
                    ${tier.advantages.slice(0, 3).map(adv => `
                        <div class="flex items-start gap-2 text-xs text-zinc-300">
                            <i class="fa-solid fa-check text-green-500 mt-0.5"></i>
                            <span>${adv}</span>
                        </div>
                    `).join('')}
                </div>
                
                <div class="w-full mb-4">
                    <div class="flex justify-between text-[10px] font-bold text-zinc-500 uppercase mb-1">
                        <span>Batch Progress</span>
                        <span class="text-amber-500">${minted} / ${batchTarget}</span>
                    </div>
                    <div class="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                        <div class="bg-amber-500 h-1.5 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]" style="width: ${progressPercent}%"></div>
                    </div>
                </div>

                <div class="bg-black/40 rounded-lg p-3 text-center mb-4 border border-white/5">
                    <div class="text-xs text-zinc-500 line-through mb-1">${t.cardPricePhase2} ${tier.phase2Price}</div>
                    <div class="text-2xl font-bold text-white">${displayPrice}</div>
                </div>

                <div class="mt-auto">
                    <div class="flex items-center justify-between bg-zinc-900 rounded-lg p-1 mb-3 border border-zinc-800">
                        <button class="quantity-btn w-8 h-8 flex items-center justify-center hover:bg-zinc-800 rounded quantity-minus">-</button>
                        <input type="number" class="quantity-input bg-transparent text-center w-12 font-bold text-white" value="1" min="1">
                        <button class="quantity-btn w-8 h-8 flex items-center justify-center hover:bg-zinc-800 rounded quantity-plus">+</button>
                    </div>

                    <button class="w-full btn-primary font-bold py-3 px-4 rounded-lg buy-button uppercase tracking-wide text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed" 
                        data-tier-id="${tier.id}">
                        ${t.cardBtnConnect}
                    </button>
                </div>
            </div>
        </div>
    `;
}

// 🔥 FETCH REAL DATA ONLY
async function fetchAllTierData() {
    const grid = document.getElementById('marketplace-grid');
    if (!grid) return;
    
    if (!addresses.publicSale) {
        renderMarketplace();
        return;
    }

    try {
        if (!State.provider) { renderMarketplace(); return; }

        const saleContract = new ethers.Contract(addresses.publicSale, publicSaleABI, State.provider);
        const tierIds = PRESALE_CONFIG.nftTiers.map(t => t.id);
        
        // Mapeia IDs: O contrato usa 1=Diamond, 2=Platinum? Ou 0=Diamond?
        // Assumindo 1-based no contrato para segurança, ou ajuste conforme seu contrato PublicSale.sol
        // Se no contrato Diamond é ID 1, usamos id+1.
        const tierResults = await Promise.all(tierIds.map(id => saleContract.tiers(id + 1).catch(e => null)));

        tierResults.forEach((data, index) => {
            const tierConfig = PRESALE_CONFIG.nftTiers[index];
            tierConfig.isLoaded = true; 
            
            if (data) {
                tierConfig.priceInWei = data.priceInWei;
                tierConfig.mintedCount = Number(data.mintedCount);
                if (data.priceInWei === 0n) tierConfig.isSoldOut = true;
            } else {
                tierConfig.isSoldOut = true;
            }
        });

        renderMarketplace();
        
    } catch (error) {
        console.error("Fetch Error:", error);
        renderMarketplace();
    }
}

function renderMarketplace() {
    const grid = document.getElementById('marketplace-grid');
    if (!grid) return;
    grid.innerHTML = PRESALE_CONFIG.nftTiers.map(createCardHTML).join('');
    updateBuyButtonsState(State.isConnected);
}

function updateBuyButtonsState(isConnected) {
    const t = PRESALE_CONFIG.translations.en;
    document.querySelectorAll('.buy-button').forEach(button => {
        const tierId = button.dataset.tierId;
        const tier = PRESALE_CONFIG.nftTiers.find(i => i.id == tierId);
        
        if (!isConnected) {
            button.disabled = false;
            button.innerHTML = `<i class='fa-solid fa-wallet mr-2'></i> ${t.cardBtnConnect}`;
            return;
        }

        if (!tier.isLoaded || tier.priceInWei === 0n || tier.isSoldOut) {
            button.disabled = true;
            const msg = (!tier.isLoaded || !addresses.publicSale) ? t.cardBtnUnavailable : t.cardBtnSoldOut;
            button.innerHTML = `<i class='fa-solid fa-ban mr-2'></i> ${msg}`;
            return;
        }

        button.disabled = false;
        const card = button.closest('.nft-card');
        if(card) updateTotalPrice(card);
    });
}

function updateTotalPrice(card) {
    const qtyInput = card.querySelector('.quantity-input');
    const btn = card.querySelector('.buy-button');
    if(!qtyInput || !btn) return;

    const tierId = btn.dataset.tierId;
    const tier = PRESALE_CONFIG.nftTiers.find(t => t.id == tierId);
    if(!tier) return;

    const qty = parseInt(qtyInput.value) || 1;
    
    if(tier.priceInWei > 0n) {
        const total = tier.priceInWei * BigInt(qty);
        const fmt = parseFloat(ethers.formatUnits(total, 18)).toString();
        btn.innerHTML = `BUY FOR ${fmt} BNB`;
    } 
}

export const PresalePage = {
    render: () => {
        const t = PRESALE_CONFIG.translations.en;
        const html = `
            <section id="sale" class="py-12 px-4">
                <div class="text-center mb-12">
                    <span class="inline-block py-1 px-3 rounded-full bg-amber-500/10 text-amber-500 text-xs font-bold tracking-widest mb-4 border border-amber-500/20">${t.saleTag}</span>
                    <h2 class="text-4xl md:text-5xl font-black text-white mb-4">${t.saleTitle}</h2>
                    <p class="text-zinc-400">${t.saleTimerTitle}</p>
                </div>

                <div id="countdown-container" class="grid grid-cols-4 gap-4 max-w-2xl mx-auto mb-16 text-center">
                    ${['Days', 'Hours', 'Minutes', 'Seconds'].map(unit => `
                        <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                            <div id="${unit.toLowerCase()}" class="text-3xl font-bold text-white font-mono">00</div>
                            <div class="text-xs text-zinc-500 uppercase mt-1">${unit}</div>
                        </div>
                    `).join('')}
                </div>

                <div id="marketplace-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
                    <div class="col-span-full text-center py-20">
                        <div class="loader mx-auto mb-4"></div>
                        <p class="text-zinc-500 animate-pulse">${t.loadingText}</p>
                    </div>
                </div>
            </section>
        `;
        
        DOMElements.presale.innerHTML = html;
        hasRendered = true;
        setupCountdown();
        fetchAllTierData();
        
        const grid = document.getElementById('marketplace-grid');
        if(grid) {
            grid.addEventListener('click', e => {
                if(e.target.classList.contains('quantity-plus')) {
                    const input = e.target.previousElementSibling;
                    input.value = parseInt(input.value) + 1;
                    const card = e.target.closest('.nft-card');
                    if(State.isConnected) updateTotalPrice(card);
                }
                if(e.target.classList.contains('quantity-minus')) {
                    const input = e.target.nextElementSibling;
                    if(parseInt(input.value) > 1) input.value = parseInt(input.value) - 1;
                    const card = e.target.closest('.nft-card');
                    if(State.isConnected) updateTotalPrice(card);
                }
            });
        }
    },

    update: (isConnected) => {
        if (!hasRendered) return;
        updateBuyButtonsState(isConnected);
    }
};

function setupCountdown() {
    const targetDate = new Date("2025-12-01T00:00:00Z").getTime();
    setInterval(() => {
        const now = new Date().getTime();
        const distance = targetDate - now;
        if (distance > 0) {
            document.getElementById('days').innerText = String(Math.floor(distance / (1000 * 60 * 60 * 24))).padStart(2, '0');
            document.getElementById('hours').innerText = String(Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))).padStart(2, '0');
            document.getElementById('minutes').innerText = String(Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
            document.getElementById('seconds').innerText = String(Math.floor((distance % (1000 * 60)) / 1000).toString()).padStart(2, '0');
        }
    }, 1000);
}