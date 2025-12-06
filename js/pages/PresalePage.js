// js/pages/PresalePage.js
// ✅ FINAL VERSION: English UI + Correct IPFS Images + Clickable Cards

const ethers = window.ethers;
import { DOMElements } from '../dom-elements.js';
import { State } from '../state.js';
import { addresses, publicSaleABI, boosterTiers } from '../config.js';
// 🔥 Imports transaction logic
import { executePresaleMint } from '../modules/transactions.js';

// =================================================================
// 1. TIER DATA & IMAGES (From provided JSONs)
// =================================================================

const TIER_IMAGES = {
    "Diamond": "https://white-defensive-eel-240.mypinata.cloud/ipfs/bafybeicgip72jcqgsirlrhn3tq5cc226vmko6etnndzl6nlhqrktfikafq",
    "Platinum": "https://white-defensive-eel-240.mypinata.cloud/ipfs/bafybeigc2wgkccckhnjotejve7qyxa2o2z4fsgswfmsxyrbp5ncpc7plei",
    "Gold": "https://white-defensive-eel-240.mypinata.cloud/ipfs/bafybeifponccrbicg2pcjrn2hrfoqgc77xhm2r4ld7hdpw6cxxkbsckf44",
    "Silver": "https://white-defensive-eel-240.mypinata.cloud/ipfs/bafybeihvi2inujm5zpi7tl667g4srq273536pjkglwyrtbwmgnskmu7jg4",
    "Bronze": "https://white-defensive-eel-240.mypinata.cloud/ipfs/bafybeiclqidb67rt3tchhjpsib62s624li7j2bpxnr6b5w5mfp4tomhu7m",
    "Iron": "https://white-defensive-eel-240.mypinata.cloud/ipfs/bafybeiaxhv3ere2hyto4dlb5xqn46ehfglxqf3yzehpy4tvdnifyzpp4wu",
    "Crystal": "https://white-defensive-eel-240.mypinata.cloud/ipfs/bafybeib6nacggrhgcp72xksbhsqcofg3lzhfb576kuebj5ioxpk2id5m7u"
};

const PRICE_INCREASE_DATE = new Date("2025-12-31T23:59:59Z").getTime();

function getAdvantages(name, bips) {
    const percent = bips / 100;
    const benefits = [
        `<strong>${percent}% Mining Power</strong> (Earn More BKC)`,        
        `<strong>${percent}% Fee Discount</strong> (Lifetime)`, 
        `🔑 <strong>Access Key</strong>: Protocol Features`          
    ];
    if (percent >= 50) { 
        benefits.push("💸 <strong>Passive Income:</strong> Rent & Governance"); 
    } 
    return benefits;
}

const PRESALE_CONFIG = {
    nftTiers: boosterTiers.map((tier, index) => ({
        ...tier,
        id: index + 1, 
        batchSize: (index + 1) * 15, // Example batch logic
        phase2Price: "TBA", 
        advantages: getAdvantages(tier.name, tier.boostBips),
        realImg: TIER_IMAGES[tier.name] || tier.img, 
        
        priceInWei: 0n, 
        mintedCount: 0,
        isSoldOut: false,
        isLoaded: false
    })),
    
    translations: {
        en: {
            saleTag: "FAIR LAUNCH PROTOCOL • NO TOKEN PRESALE",
            saleTitle: "The Only Way In.",
            saleSubtitle: `
                <strong>Why buy a Booster?</strong> Because there is <span class="text-red-500">NO Token Pre-Sale</span>. 
                <br>These NFTs are your <strong>Mining Rigs</strong>. They define your earning power.
            `,
            cardPricePhase2: "Next Price:",
            cardBtnConnect: "CONNECT WALLET",
            cardBtnBuy: "MINT ACCESS KEY",
            cardBtnSoldOut: "SOLD OUT",
            loadingText: "SYNCING BLOCKCHAIN DATA..."
        }
    }
};

let hasRendered = false;

// =================================================================
// 2. VISUAL FUNCTIONS
// =================================================================

function getPhase2Price(currentWei) {
    if (currentWei === 0n) return "TBA";
    const nextPriceWei = (currentWei * 150n) / 100n; 
    return parseFloat(ethers.formatUnits(nextPriceWei, 18)).toString() + " ETH";
}

function createCardHTML(tier) {
    const t = PRESALE_CONFIG.translations.en;
    
    let displayPrice = "---";
    let phase2Display = "";

    // Price Display Logic
    if (tier.isLoaded && tier.priceInWei > 0n) {
        displayPrice = parseFloat(ethers.formatUnits(tier.priceInWei, 18)).toString() + " ETH"; 
        phase2Display = `<span class="text-zinc-500 text-[10px] uppercase">Next: ${getPhase2Price(tier.priceInWei)}</span>`;
    } else if (tier.isLoaded && tier.priceInWei === 0n) {
        displayPrice = "Sold Out";
    }

    const minted = tier.mintedCount;
    const batchTarget = Math.max(tier.batchSize, 10);
    const progressPercent = Math.max(5, Math.min(100, (minted / batchTarget) * 100));
    
    const glowClass = tier.glowColor || "bg-amber-500/10";
    const borderClass = tier.borderColor || "border-zinc-800";
    const textClass = tier.color || "text-white";
    const imageUrl = tier.realImg; 

    // The whole card is clickable via "onclick"
    return `
        <div class="nft-card group relative flex flex-col w-full 
                    bg-presale-bg-card border ${borderClass} rounded-2xl 
                    shadow-xl hover:shadow-amber-500/30 transition-all duration-300 
                    transform hover:-translate-y-2 cursor-pointer overflow-hidden" 
             data-tier-id="${tier.id}"
             onclick="handleCardClick(event, '${tier.id}')">
            
            <div class="absolute top-0 right-0 z-20 bg-amber-500 text-black font-black text-xs px-3 py-1 rounded-bl-xl shadow-lg">
                +${tier.boostBips / 100}% BOOST
            </div>

            <div class="w-full h-64 bg-black/50 relative flex items-center justify-center overflow-hidden p-4 group-hover:bg-amber-500/5 transition-colors">
                 <div class="absolute inset-0 bg-gradient-to-b from-transparent to-presale-bg-card opacity-90"></div>
                 <img src="${imageUrl}" alt="${tier.name}" 
                      class="h-full w-auto object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.15)] group-hover:scale-110 group-hover:drop-shadow-[0_0_30px_rgba(245,158,11,0.4)] transition-transform duration-500 ease-out"
                      onerror="this.src='./assets/bkc_logo_3d.png'"/>
            </div>
            
            <div class="px-5 pb-5 flex flex-col flex-1 relative z-10">
                <h3 class="text-3xl font-black ${textClass} uppercase italic mb-1 tracking-tighter">${tier.name}</h3>
                
                <div class="space-y-2 mb-4 min-h-[80px]">
                    ${tier.advantages.map(adv => `
                        <div class="flex items-start gap-2 text-xs text-zinc-300">
                            <i class="fa-solid fa-bolt text-amber-500 mt-0.5"></i>
                            <span>${adv}</span>
                        </div>
                    `).join('')}
                </div>

                <div class="w-full mb-4">
                    <div class="flex justify-between text-[10px] font-bold text-zinc-500 uppercase mb-1">
                        <span>Minted</span>
                        <span class="${minted > batchTarget * 0.9 ? 'text-red-500 animate-pulse' : 'text-green-500'}">
                            ${minted} / ${batchTarget}
                        </span>
                    </div>
                    <div class="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                        <div class="bg-gradient-to-r from-amber-600 to-yellow-400 h-full rounded-full transition-all duration-1000" style="width: ${progressPercent}%"></div>
                    </div>
                </div>

                <div class="mt-auto bg-black/40 rounded-xl p-3 border border-white/5 backdrop-blur-sm">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <div class="text-2xl font-black text-white tracking-tight">${displayPrice}</div>
                            ${phase2Display}
                        </div>
                        
                        <div class="flex items-center bg-zinc-900 rounded-lg border border-zinc-700 h-10" onclick="event.stopPropagation()">
                            <button class="quantity-minus w-8 h-full text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-l-lg transition-colors text-lg font-bold">-</button>
                            <input type="number" class="quantity-input w-10 bg-transparent text-center text-white font-bold focus:outline-none" value="1" min="1" readonly>
                            <button class="quantity-plus w-8 h-full text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-r-lg transition-colors text-lg font-bold">+</button>
                        </div>
                    </div>

                    <button class="buy-button w-full py-4 rounded-lg font-black text-sm uppercase tracking-widest shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2
                                   bg-amber-500 hover:bg-amber-400 text-black border border-amber-400
                                   disabled:bg-zinc-800 disabled:text-zinc-500 disabled:border-zinc-700 disabled:cursor-not-allowed" 
                        data-tier-id="${tier.id}">
                        ${t.cardBtnConnect}
                    </button>
                </div>
            </div>
        </div>
    `;
}

// =================================================================
// 3. DATA LOGIC (Blockchain Fetch)
// =================================================================

async function fetchAllTierData() {
    if (!addresses.publicSale) {
        console.warn("⚠️ Contract Address Missing");
        renderMarketplace();
        return;
    }

    try {
        const providerToUse = State.signer || State.provider || State.publicProvider;
        if (!providerToUse) { renderMarketplace(); return; }

        const saleContract = new ethers.Contract(addresses.publicSale, publicSaleABI, providerToUse);
        const tierIds = PRESALE_CONFIG.nftTiers.map(t => t.id);
        
        // Parallel Fetch
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

                if (configured) {
                    tierConfig.priceInWei = price;
                    tierConfig.mintedCount = Number(minted);
                }
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
    
    // Global click handler for the Card
    window.handleCardClick = (event, tierId) => {
        const btn = document.querySelector(`button.buy-button[data-tier-id="${tierId}"]`);
        if(btn && !btn.disabled) {
            btn.click();
        }
    };

    updateBuyButtonsState(State.isConnected);
}

function updateBuyButtonsState(isConnected) {
    const t = PRESALE_CONFIG.translations.en;
    document.querySelectorAll('.buy-button').forEach(button => {
        const tierId = button.dataset.tierId;
        const tier = PRESALE_CONFIG.nftTiers.find(i => i.id == tierId);
        
        // Reset base classes
        button.className = "buy-button w-full py-4 rounded-lg font-black text-sm uppercase tracking-widest shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2";

        if (!isConnected) {
            button.disabled = false;
            button.innerHTML = `<i class='fa-solid fa-wallet'></i> ${t.cardBtnConnect}`;
            button.classList.add("bg-zinc-800", "text-white", "hover:bg-zinc-700", "border-zinc-600");
            button.onclick = (e) => { 
                e.stopPropagation(); 
                if(window.openConnectModal) window.openConnectModal(); 
            };
            return;
        }

        if (!tier.isLoaded || tier.priceInWei === 0n) {
            button.disabled = true;
            const msg = (!tier.isLoaded) ? "Loading..." : t.cardBtnSoldOut;
            button.innerHTML = `<i class='fa-solid fa-ban'></i> ${msg}`;
            button.classList.add("bg-zinc-900", "text-zinc-600", "border-zinc-800", "cursor-not-allowed");
            return;
        }

        // --- ENABLED FOR MINTING ---
        button.disabled = false;
        
        // Strong "Call to Action" Style
        button.classList.add("bg-amber-500", "text-black", "hover:bg-amber-400", "hover:shadow-amber-500/50", "border-amber-400");
        
        button.onclick = null; // Clear old events
        button.onclick = async (e) => {
             e.stopPropagation(); // Prevent bubbling
             const card = button.closest('.nft-card');
             const qtyInput = card.querySelector('.quantity-input');
             const qty = qtyInput ? parseInt(qtyInput.value) : 1;
             
             // Calls the transaction logic (which handles gas + refresh)
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
    if(!tier || tier.priceInWei === 0n) return;

    const qty = parseInt(qtyInput.value) || 1;
    const total = tier.priceInWei * BigInt(qty);
    const fmt = parseFloat(ethers.formatUnits(total, 18)).toFixed(4); 
    
    // Dynamic Button Text
    btn.innerHTML = `MINT NOW <span class="bg-black/20 px-2 py-0.5 rounded text-xs ml-1">${fmt} ETH</span>`;
}

// =================================================================
// 4. MAIN EXPORT
// =================================================================

export const PresalePage = {
    render: () => {
        const t = PRESALE_CONFIG.translations.en;
        const html = `
            <section id="sale" class="py-20 px-4 min-h-screen relative overflow-hidden">
                <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-amber-500/10 blur-[120px] rounded-full pointer-events-none"></div>

                <div class="text-center mb-16 max-w-5xl mx-auto relative z-10">
                    <span class="inline-block py-2 px-6 rounded-full bg-amber-500/10 text-amber-400 text-xs font-black tracking-[0.3em] mb-6 border border-amber-500/20 uppercase">
                        ${t.saleTag}
                    </span>
                    <h2 class="text-5xl md:text-7xl font-black text-white mb-6 leading-none tracking-tighter drop-shadow-2xl">
                        THE ONLY WAY IN.
                    </h2>
                    
                    <div class="bg-zinc-900/50 backdrop-blur-md border border-white/5 p-8 rounded-3xl shadow-2xl max-w-3xl mx-auto">
                        <p class="text-lg text-zinc-300 font-light leading-relaxed">
                            ${t.saleSubtitle}
                        </p>
                    </div>
                </div>

                <div id="countdown-container" class="grid grid-cols-4 gap-3 max-w-2xl mx-auto mb-20">
                    ${['Days', 'Hours', 'Minutes', 'Seconds'].map(unit => `
                        <div class="bg-zinc-900/80 border border-zinc-800/50 rounded-xl p-3 text-center backdrop-blur-sm">
                            <div id="${unit.toLowerCase()}" class="text-3xl md:text-4xl font-black text-amber-500 font-mono">00</div>
                            <div class="text-[9px] text-zinc-500 uppercase font-bold tracking-widest mt-1">${unit}</div>
                        </div>
                    `).join('')}
                </div>

                <div id="marketplace-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-[1600px] mx-auto relative z-10 px-4 pb-20">
                    <div class="col-span-full text-center py-20">
                        <div class="loader mx-auto mb-6 w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"></div>
                        <p class="text-zinc-500 font-mono animate-pulse uppercase tracking-widest text-xs">${t.loadingText}</p>
                    </div>
                </div>
            </section>
        `;
        
        DOMElements.presale.innerHTML = html;
        hasRendered = true;
        setupCountdown();
        fetchAllTierData();
        
        // Listeners for Quantity (Delegation)
        const grid = document.getElementById('marketplace-grid');
        if(grid) {
            grid.addEventListener('click', e => {
                // Prevent bubbling when clicking +/-
                if(e.target.closest('.quantity-plus') || e.target.closest('.quantity-minus') || e.target.closest('.quantity-input')) {
                    e.stopPropagation();
                }

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