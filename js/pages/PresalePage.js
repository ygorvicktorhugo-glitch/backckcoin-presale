// js/pages/PresalePage.js
// ✅ VERSÃO FINAL: Compra Ativa + Preços Dinâmicos + Marketing

const ethers = window.ethers;
import { DOMElements } from '../dom-elements.js';
import { State } from '../state.js';
import { addresses, publicSaleABI, boosterTiers } from '../config.js';
// 🔥 IMPORTANTE: Importa a função de transação
import { executePresaleMint } from '../modules/transactions.js';

// =================================================================
// 1. CONFIGURAÇÃO DE VENDAS
// =================================================================

const PRICE_INCREASE_DATE = new Date("2025-12-31T23:59:59Z").getTime();

function getAdvantages(name, bips) {
    const percent = bips / 100;
    const benefits = [
        `<strong>${percent}% Lifetime Fee Discount</strong> (Save Forever)`, 
        `<strong>+${percent}% Mining Power</strong> (Earn More BKC)`,        
        `🔑 <strong>Access Key</strong>: Unlocks Protocol Features`          
    ];
    if (percent >= 50) { 
        benefits.push("💸 <strong>Passive Income:</strong> Rent this NFT"); 
        benefits.push("👑 <strong>Governance Rights</strong> & Voting");
        benefits.push("🔄 <strong>Instant Liquidity</strong> (Sell to AMM)");
    } 
    else if (percent >= 30) { 
        benefits.push("💸 <strong>Passive Income:</strong> Rent to others"); 
    }
    return benefits;
}

const PRESALE_CONFIG = {
    nftTiers: boosterTiers.map((tier, index) => ({
        ...tier,
        id: index + 1, 
        batchSize: (index + 1) * 15,
        phase2Price: "TBA", 
        advantages: getAdvantages(tier.name, tier.boostBips),
        
        priceInWei: 0n, 
        mintedCount: 0,
        isSoldOut: false,
        isLoaded: false
    })),
    
    translations: {
        en: {
            saleTag: "FAIR LAUNCH PROTOCOL • ZERO TOKEN PRE-SALE",
            saleTitle: "The Only Way In.",
            saleSubtitle: `
                <strong>Why buy a Booster?</strong> Because there is <span class="text-red-500">NO Token Pre-Sale</span>. 
                <br>These NFTs are the <strong>exclusive keys</strong> that unlock <strong>Lifetime Fee Discounts</strong> and boost your <strong>Mining Power</strong>.
                <br>Funds raised here develop the ecosystem. You own the utility: <strong>Use it, Sell it, or Rent it</strong> for passive income.
            `,
            cardPricePhase2: "Price after Dec 31, 2025:",
            cardBtnConnect: "Connect Wallet",
            cardBtnBuy: "Mint Access Key",
            cardBtnSoldOut: "Sold Out",
            cardBtnUnavailable: "Check Network",
            loadingText: "Syncing with Blockchain...",
            anchorBtn: "Secure My Key"
        }
    }
};

let hasRendered = false;

// =================================================================
// 2. FUNÇÕES VISUAIS
// =================================================================

const getHttpUrl = (tier) => {
    let url = tier.realImg || tier.img;
    if (!url) return './assets/bkc_logo_3d.png';
    if (url.startsWith('./')) return url;
    if (!url.endsWith('.png') && !url.endsWith('.json') && !url.endsWith('.jpg')) {
        const filename = `${tier.name.toLowerCase()}_booster.png`; 
        if (!url.endsWith('/')) url += '/';
        return url + filename;
    }
    return url;
};

function getPhase2Price(currentWei) {
    if (currentWei === 0n) return "TBA";
    const nextPriceWei = (currentWei * 150n) / 100n; 
    return parseFloat(ethers.formatUnits(nextPriceWei, 18)).toString() + " ETH";
}

function createCardHTML(tier) {
    const t = PRESALE_CONFIG.translations.en;
    
    let displayPrice = "---";
    let phase2Display = t.cardPricePhase2 + " TBA";

    // Lógica de Exibição do Preço
    if (tier.isLoaded && tier.priceInWei > 0n) {
        displayPrice = parseFloat(ethers.formatUnits(tier.priceInWei, 18)).toString() + " ETH"; 
        
        if (Date.now() < PRICE_INCREASE_DATE) {
            phase2Display = `${t.cardPricePhase2} <span class="text-red-400 font-bold">${getPhase2Price(tier.priceInWei)}</span>`;
        } else {
            phase2Display = `<span class="text-green-400 font-bold">Phase 2 Pricing Active</span>`;
        }

    } else if (tier.isLoaded && tier.priceInWei === 0n) {
        displayPrice = "Sold Out";
    }

    const minted = tier.mintedCount;
    const batchTarget = Math.max(tier.batchSize, 10);
    const progressPercent = Math.max(5, Math.min(100, (minted / batchTarget) * 100));
    
    const imageUrl = getHttpUrl(tier);
    const glowClass = tier.glowColor || "bg-amber-500/10";
    const borderClass = tier.borderColor || "border-zinc-800";
    const textClass = tier.color || "text-white";

    return `
        <div class="bg-presale-bg-card border ${borderClass} rounded-2xl flex flex-col nft-card group overflow-hidden shadow-2xl hover:shadow-amber-500/20 transition-all duration-300 w-full relative transform hover:-translate-y-1" data-tier-id="${tier.id}">
            
            <div class="absolute top-0 right-0 ${glowClass} backdrop-blur-md px-4 py-2 rounded-bl-2xl border-b border-l border-white/10 z-10">
                <span class="font-black ${textClass} text-lg">+${tier.boostBips / 100}% MINING POWER</span>
            </div>

            <div class="w-full h-56 overflow-hidden bg-black/50 relative flex items-center justify-center group-hover:bg-black/40 transition-colors">
                <div class="absolute inset-0 bg-gradient-to-t from-presale-bg-card to-transparent opacity-80"></div>
                <img src="${imageUrl}" alt="${tier.name}" 
                     class="h-4/5 w-auto object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] group-hover:scale-110 transition-transform duration-500" 
                     onerror="this.src='./assets/bkc_logo_3d.png'"/>
                <h3 class="absolute bottom-4 left-4 text-3xl font-black ${textClass} drop-shadow-md tracking-tighter uppercase italic">${tier.name}</h3>
            </div>
            
            <div class="p-5 flex flex-col flex-1 relative">
                <div class="space-y-3 mb-6">
                    <p class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">KEY BENEFITS</p>
                    ${tier.advantages.map(adv => `<div class="flex items-start gap-3 text-sm text-zinc-300 leading-tight"><i class="fa-solid fa-check-circle text-green-500 mt-0.5 flex-shrink-0"></i><span>${adv}</span></div>`).join('')}
                </div>
                
                <div class="w-full mb-6">
                    <div class="flex justify-between text-[10px] font-bold text-zinc-500 uppercase mb-1">
                        <span>Batch Availability</span>
                        <span class="${minted > batchTarget * 0.8 ? 'text-red-500 animate-pulse' : 'text-green-500'}">
                            ${minted} / ${batchTarget} Minted
                        </span>
                    </div>
                    <div class="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                        <div class="bg-gradient-to-r from-amber-600 to-yellow-400 h-2 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)] transition-all duration-1000" style="width: ${progressPercent}%"></div>
                    </div>
                </div>

                <div class="mt-auto bg-black/20 rounded-xl p-4 border border-white/5">
                    <div class="flex justify-between items-end mb-3">
                        <div class="text-left">
                            <div class="text-xs text-zinc-500 mb-0.5">${phase2Display}</div>
                            <div class="text-2xl font-black text-white tracking-tight">${displayPrice}</div>
                        </div>
                        
                        <div class="flex items-center bg-zinc-900 rounded-lg border border-zinc-700">
                            <button class="quantity-minus w-8 h-8 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-l-lg transition-colors">-</button>
                            <input type="number" class="quantity-input w-8 bg-transparent text-center text-sm font-bold text-white focus:outline-none" value="1" min="1" readonly>
                            <button class="quantity-plus w-8 h-8 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-r-lg transition-colors">+</button>
                        </div>
                    </div>

                    <button class="w-full btn-primary font-black py-3 px-4 rounded-lg buy-button uppercase tracking-wide text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-95 transition-all" 
                        data-tier-id="${tier.id}">
                        ${t.cardBtnConnect}
                    </button>
                </div>
            </div>
        </div>
    `;
}

// =================================================================
// 3. LÓGICA DE DADOS (Blockchain Fetch)
// =================================================================

async function fetchAllTierData() {
    const grid = document.getElementById('marketplace-grid');
    if (!grid) return;
    
    if (!addresses.publicSale) {
        console.warn("⚠️ Endereço PublicSale não configurado.");
        renderMarketplace();
        return;
    }

    try {
        const providerToUse = State.signer || State.provider || State.publicProvider;
        if (!providerToUse) { 
            console.warn("⚠️ Nenhum provider disponível.");
            renderMarketplace(); 
            return; 
        }

        console.log("🔍 Conectando ao contrato:", addresses.publicSale);
        const saleContract = new ethers.Contract(addresses.publicSale, publicSaleABI, providerToUse);
        
        const tierIds = PRESALE_CONFIG.nftTiers.map(t => t.id);
        
        const tierResults = await Promise.all(tierIds.map(async (id) => {
            try { return await saleContract.tiers(id); } catch (e) { return null; }
        }));

        tierResults.forEach((data, index) => {
            const tierConfig = PRESALE_CONFIG.nftTiers[index];
            tierConfig.isLoaded = true;
            
            if (data) {
                const price = data.priceInWei ?? data[0]; 
                const minted = data.mintedCount ?? data[2];
                const configured = data.isConfigured ?? data[4];

                console.log(`✅ Tier [${tierConfig.name}] Loaded: Price=${price}, Configured=${configured}`);

                if (configured) {
                    tierConfig.priceInWei = price;
                    tierConfig.mintedCount = Number(minted);
                } else {
                    tierConfig.priceInWei = 0n;
                }
            } else {
                tierConfig.priceInWei = 0n;
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
            button.onclick = () => { if(window.openConnectModal) window.openConnectModal(); };
            return;
        }

        if (!tier.isLoaded || tier.priceInWei === 0n) {
            button.disabled = true;
            const msg = (!tier.isLoaded) ? "Loading..." : t.cardBtnSoldOut;
            button.innerHTML = `<i class='fa-solid fa-ban mr-2'></i> ${msg}`;
            return;
        }

        // --- HABILITADO PARA COMPRA ---
        button.disabled = false;
        button.onclick = null; // Limpa eventos antigos
        
        // 🔥 EVENTO DE COMPRA REAL
        button.onclick = async () => {
             const card = button.closest('.nft-card');
             const qtyInput = card.querySelector('.quantity-input');
             const qty = qtyInput ? parseInt(qtyInput.value) : 1;
             
             console.log(`🚀 Minting Tier ${tierId}, Qty: ${qty}, Price: ${tier.priceInWei}`);
             
             // Chama a função importada do transactions.js que abre a MetaMask
             await executePresaleMint(tierId, qty, tier.priceInWei, button);
        };

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
        // Testnet usa ETH, formatamos para 4 casas decimais
        const fmt = parseFloat(ethers.formatUnits(total, 18)).toFixed(4); 
        btn.innerHTML = `MINT FOR ${fmt} ETH`;
    } 
}

// =================================================================
// 4. EXPORT PRINCIPAL
// =================================================================

export const PresalePage = {
    render: () => {
        const t = PRESALE_CONFIG.translations.en;
        const html = `
            <section id="sale" class="py-16 px-4 min-h-screen">
                
                <div class="text-center mb-16 max-w-4xl mx-auto">
                    <span class="inline-block py-2 px-6 rounded-full bg-amber-500/20 text-amber-400 text-sm font-black tracking-[0.2em] mb-6 border border-amber-500/40 uppercase animate-pulse">
                        ${t.saleTag}
                    </span>
                    <h2 class="text-5xl md:text-7xl font-black text-white mb-6 leading-tight drop-shadow-xl">
                        ${t.saleTitle}
                    </h2>
                    
                    <div class="bg-zinc-900/80 backdrop-blur-sm border border-zinc-700 p-6 rounded-2xl shadow-2xl">
                        <p class="text-lg md:text-xl text-zinc-300 leading-relaxed font-light">
                            ${t.saleSubtitle}
                        </p>
                    </div>
                </div>

                <div id="countdown-container" class="grid grid-cols-4 gap-4 max-w-3xl mx-auto mb-20 text-center">
                    ${['Days', 'Hours', 'Minutes', 'Seconds'].map(unit => `
                        <div class="bg-presale-bg-card border border-zinc-800 rounded-2xl p-4 shadow-lg">
                            <div id="${unit.toLowerCase()}" class="text-4xl md:text-5xl font-black text-white font-mono tracking-tighter">00</div>
                            <div class="text-[10px] text-zinc-500 uppercase font-bold mt-2 tracking-widest">${unit}</div>
                        </div>
                    `).join('')}
                </div>

                <div id="marketplace-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 max-w-[1600px] mx-auto">
                    <div class="col-span-full text-center py-20">
                        <div class="loader mx-auto mb-6 w-16 h-16 border-4"></div>
                        <p class="text-zinc-500 font-mono animate-pulse uppercase tracking-widest">${t.loadingText}</p>
                    </div>
                </div>
                
                <a href="#sale" title="${t.anchorBtn}" class="md:hidden fixed bottom-6 right-6 z-40 bg-amber-500 text-black p-4 rounded-full shadow-2xl shadow-amber-500/50">
                    <i class="fa-solid fa-key text-xl"></i>
                </a>
            </section>
        `;
        
        DOMElements.presale.innerHTML = html;
        hasRendered = true;
        setupCountdown();
        fetchAllTierData();
        
        // Listeners de quantidade
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
    const targetDate = new Date("2025-12-31T23:59:59Z").getTime();
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