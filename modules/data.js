// modules/data.js
// ✅ FINAL VERSION: Anti-Throttling Agressivo + Jitter Backoff + Smart Caching

const ethers = window.ethers;

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
import { formatBigNumber, formatPStake } from '../utils.js';
import { addresses, boosterTiers, ipfsGateway } from '../config.js';

// ====================================================================
// CONSTANTES E UTILITÁRIOS
// ====================================================================
const API_TIMEOUT_MS = 15000; 
const CACHE_DURATION_MS = 120000; // 2 minutos de cache para dados de sistema

// Cache em memória para dados de sistema
let systemDataCache = null;
let systemDataCacheTime = 0;

// Cache simples para chamadas de contrato imutáveis (ex: URI, Fees estáticas)
const contractReadCache = new Map();

// Função auxiliar para "dormir" (esperar)
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executa um fetch com um tempo limite.
 */
async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error('API request timed out.');
        }
        throw error;
    }
}

// ====================================================================
// ENDPOINTS DE API
// ====================================================================
export const API_ENDPOINTS = {
    getHistory: 'https://gethistory-4wvdcuoouq-uc.a.run.app',
    getBoosters: 'https://getboosters-4wvdcuoouq-uc.a.run.app',
    getSystemData: 'https://getsystemdata-4wvdcuoouq-uc.a.run.app',
    getNotaryHistory: 'https://getnotaryhistory-4wvdcuoouq-uc.a.run.app',
    uploadFileToIPFS: 'https://uploadfiletoipfs-4wvdcuoouq-uc.a.run.app',   
    claimAirdrop: 'https://us-central1-airdropbackchainnew.cloudfunctions.net/claimAirdrop'
};

// ====================================================================
// Funções de Segurança e Resiliência (COM RETRY & JITTER)
// ====================================================================

export const safeBalanceOf = async (contract, address) => {
    try {
        return await contract.balanceOf(address);
    } catch (e) {
        // Verifica Erro 429 (Rate Limit)
        if (isRateLimitError(e)) {
            console.warn("⚠️ Rate limited on balanceOf. Retrying in 5s...");
            await wait(5000);
            try {
                return await contract.balanceOf(address);
            } catch (retryError) {
                console.warn("❌ Balance fetch failed after retry. Returning 0n.");
                return 0n; // Falha segura
            }
        }
        if (e.code === 'BAD_DATA' || e.code === 'CALL_EXCEPTION') {
            return 0n;
        }
        throw e;
    }
};

// Função auxiliar para detectar erro 429 de várias fontes
function isRateLimitError(e) {
    return (
        e?.error?.code === 429 || 
        e?.code === 429 || 
        (e.message && (
            e.message.includes("429") || 
            e.message.includes("Too Many Requests") || 
            e.message.includes("compute units") ||
            e.message.includes("limit reached")
        ))
    );
}

// Função Genérica com Retry Inteligente e Jitter
export const safeContractCall = async (contract, method, args = [], fallbackValue = 0n, retries = 2) => {
    // Chave de Cache simples baseada no contrato + método + argumentos
    // Útil apenas para dados que não mudam a cada segundo dentro da mesma sessão
    const cacheKey = `${contract.target || contract.address}:${method}:${JSON.stringify(args)}`;
    
    // Se for uma chamada "estática" conhecida (ex: getFee, tokenURI), tenta usar cache de memória curto (10s)
    if (method === 'tokenURI' || method.startsWith('getFee')) {
        const cached = contractReadCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < 10000)) {
            return cached.value;
        }
    }

    try {
        const result = await contract[method](...args);
        
        // Salva no cache se for sucesso
        if (method === 'tokenURI' || method.startsWith('getFee')) {
            contractReadCache.set(cacheKey, { value: result, timestamp: Date.now() });
        }
        
        return result;
    } catch (e) {
        // DETECÇÃO DO ERRO 429 COM JITTER (Aleatoriedade no tempo de espera)
        if (isRateLimitError(e) && retries > 0) {
            // Espera entre 10s e 15s para evitar "thundering herd" (todos tentando de novo ao mesmo tempo)
            const jitter = Math.floor(Math.random() * 5000); 
            const delayTime = 10000 + jitter; 
            
            console.warn(`⚠️ Rate limit hit on ${method}. Retrying in ${delayTime/1000}s... (${retries} left)`);
            await wait(delayTime);
            return safeContractCall(contract, method, args, fallbackValue, retries - 1);
        }

        if (e.code === 'BAD_DATA' || e.code === 'CALL_EXCEPTION') {
            console.warn(`⚠️ SafeContractCall (${method}): Falha técnica/revert. Retornando fallback.`);
            
            // Retorna objeto vazio se o fallback for objeto, para evitar crash por referência
            if (typeof fallbackValue === 'object' && fallbackValue !== null && !Array.isArray(fallbackValue) && typeof fallbackValue !== 'bigint') {
                 return { ...fallbackValue };
            }
            return fallbackValue;
        }
        
        console.error(`❌ SafeContractCall (${method}) unexpected error:`, e);
        return fallbackValue;
    }
};

// ====================================================================
// CARREGAMENTO DE DADOS
// ====================================================================

export async function loadSystemDataFromAPI() {
    if (!State.systemFees) State.systemFees = {};
    if (!State.systemPStakes) State.systemPStakes = {};
    if (!State.boosterDiscounts) State.boosterDiscounts = {};

    const now = Date.now();
    // Cache: Se carregou há menos de 2 minutos, usa o cache
    if (systemDataCache && (now - systemDataCacheTime < CACHE_DURATION_MS)) {
        console.log("♻️ Using cached system data.");
        applySystemDataToState(systemDataCache);
        return true;
    }

    try {
        console.log("🌐 Loading system rules from API...");
        const response = await fetchWithTimeout(API_ENDPOINTS.getSystemData, API_TIMEOUT_MS); 
        
        if (!response.ok) {
            throw new Error(`API (getSystemData) Error: ${response.statusText} (${response.status})`);
        }
        const systemData = await response.json(); 

        applySystemDataToState(systemData);
        
        systemDataCache = systemData;
        systemDataCacheTime = now;
        
        console.log("✅ System rules loaded.");
        return true;

    } catch (e) {
        console.error("❌ CRITICAL Error loading system data from API:", e.message);
        return false;
    }
}

function applySystemDataToState(systemData) {
    State.systemFees = {};
    for (const key in systemData.fees) {
         State.systemFees[key] = BigInt(systemData.fees[key]);
    }
    
    State.systemPStakes = {};
    for (const key in systemData.pStakeRequirements) {
         State.systemPStakes[key] = BigInt(systemData.pStakeRequirements[key]);
    }
    
    State.boosterDiscounts = systemData.discounts; 
    
    if (systemData.oracleFeeInWei) {
         State.systemData = State.systemData || {};
         State.systemData.oracleFeeInWei = BigInt(systemData.oracleFeeInWei);
    }
}

export async function loadPublicData() {
    if (!State.publicProvider || !State.bkcTokenContractPublic || !State.delegationManagerContractPublic) return;

    try {
        // SEQUENCIAL COM PAUSAS (Throttling Manual)
        const publicBkc = State.bkcTokenContractPublic;
        const publicDelegation = State.delegationManagerContractPublic;

        await safeContractCall(publicBkc, 'totalSupply', [], 0n);
        
        await wait(300); // Pausa aumentada para 300ms
        
        await safeContractCall(publicBkc, 'MAX_SUPPLY', [], 0n);
        
        await wait(300);
        
        await safeContractCall(publicBkc, 'TGE_SUPPLY', [], 0n);
        
        State.allValidatorsData = []; 

        const totalPStake = await safeContractCall(publicDelegation, 'totalNetworkPStake', [], 0n);
        State.totalNetworkPStake = totalPStake;
        
        await loadSystemDataFromAPI();
        
        if (window.updateUIState) {
            window.updateUIState();
        }

    } catch (e) { 
        console.error("Error loading public data", e)
    }
}

export async function loadUserData() {
    if (!State.isConnected || !State.userAddress) return;

    try {
        // SEQUENCIAL ESTRATÉGICO
        const balance = await safeBalanceOf(State.bkcTokenContract, State.userAddress);
        State.currentUserBalance = balance;

        await wait(300); 

        const delegationsRaw = await safeContractCall(State.delegationManagerContract, 'getDelegationsOf', [State.userAddress], []);
        
        State.userDelegations = delegationsRaw.map((d, index) => ({
            amount: d[0], 
            unlockTime: d[1],
            lockDuration: d[2], 
            index,
            txHash: null 
        }));
        
        await wait(300); 

        const totalUserPStake = await safeContractCall(State.delegationManagerContract, 'userTotalPStake', [State.userAddress], 0n);
        State.userTotalPStake = totalUserPStake;

        if (State.provider) {
            // Balanço Nativo (ETH) é rápido, não precisa de tanta pausa
            const nativeBalance = await State.provider.getBalance(State.userAddress);
            State.currentUserNativeBalance = nativeBalance;
        }

        await loadMyBoostersFromAPI();
        
    } catch (e) {
        console.error("Error loading user data:", e);
    }
}

export async function calculateUserTotalRewards() {
    if (!State.isConnected || !State.delegationManagerContract) {
        return { stakingRewards: 0n, minerRewards: 0n, totalRewards: 0n };
    }

    try {
        const stakingRewards = await safeContractCall(State.delegationManagerContract, 'pendingRewards', [State.userAddress], 0n);
        const minerRewards = 0n; 
        const totalRewards = stakingRewards + minerRewards;

        return { stakingRewards, minerRewards, totalRewards };

    } catch (e) {
        console.error("Error in calculateUserTotalRewards:", e);
        return { stakingRewards: 0n, minerRewards: 0n, totalRewards: 0n };
    }
}

export async function calculateClaimDetails() {
    if (!State.delegationManagerContract || !State.ecosystemManagerContract || !State.userAddress) {
        return { netClaimAmount: 0n, feeAmount: 0n, discountPercent: 0, totalRewards: 0n, basePenaltyPercent: 0 };
    }
    
    const { totalRewards } = await calculateUserTotalRewards();
    if (totalRewards === 0n) {
        return { netClaimAmount: 0n, feeAmount: 0n, discountPercent: 0, totalRewards: 0n, basePenaltyPercent: 0 };
    }
    
    let baseFeeBips = State.systemFees?.CLAIM_REWARD_FEE_BIPS;
    // Fallback para contrato apenas se API falhar, com cache de leitura
    if (!baseFeeBips) {
         baseFeeBips = await safeContractCall(State.ecosystemManagerContract, 'getFee', ["CLAIM_REWARD_FEE_BIPS"], 50n); 
    }

    const baseFeePercent = Number(baseFeeBips) / 100;
    const boosterData = await getHighestBoosterBoostFromAPI(); 
    
    let discountBips = State.boosterDiscounts?.[boosterData.highestBoost];
    if (!discountBips) {
        discountBips = await safeContractCall(State.ecosystemManagerContract, 'getBoosterDiscount', [BigInt(boosterData.highestBoost)], 0n);
    } else {
        discountBips = BigInt(discountBips);
    }
    
    const discountPercent = Number(discountBips) / 100;
    const finalFeeBips = baseFeeBips > discountBips ? baseFeeBips - discountBips : 0n;
    const finalFeeAmount = (totalRewards * finalFeeBips) / 10000n;
    const netClaimAmount = totalRewards - finalFeeAmount;
    
    return { 
        netClaimAmount, 
        feeAmount: finalFeeAmount, 
        discountPercent, 
        totalRewards, 
        basePenaltyPercent: baseFeePercent 
    };
}

export async function getHighestBoosterBoostFromAPI() {
    if (!State.rewardBoosterContract || !State.userAddress) {
        return { highestBoost: 0, boostName: 'None', imageUrl: '', tokenId: null, efficiency: 50 };
    }

    await loadMyBoostersFromAPI();

    if (!State.myBoosters || State.myBoosters.length === 0) {
        return { highestBoost: 0, boostName: 'None', imageUrl: '', tokenId: null, efficiency: 50 };
    }

    try {
        const highestBooster = State.myBoosters.reduce((max, booster) => booster.boostBips > max.boostBips ? booster : max, State.myBoosters[0]);

        const highestBoost = highestBooster.boostBips;
        const bestTokenId = highestBooster.tokenId;
        const boostPercent = highestBoost / 100;
        const finalEfficiency = Math.min(50 + boostPercent, 100); 

        const tier = boosterTiers.find(t => t.boostBips === highestBoost);
        let imageUrl = tier?.img || '';
        let nftName = tier?.name ? `${tier.name} Booster` : 'Booster NFT';

        // OTIMIZAÇÃO: TokenURI é pesado. Só carrega se a imagem padrão não existir.
        if (!imageUrl) {
            try {
                const tokenURI = await safeContractCall(State.rewardBoosterContract, 'tokenURI', [bestTokenId], '');
                if (tokenURI) {
                    const metadataResponse = await fetch(tokenURI.replace("ipfs://", ipfsGateway));
                    if (metadataResponse.ok) {
                        const metadata = await metadataResponse.json();
                        imageUrl = metadata.image ? metadata.image.replace("ipfs://", ipfsGateway) : imageUrl;
                        nftName = metadata.name || nftName;
                    }
                }
            } catch (e) {
                console.warn(`Could not fetch metadata for booster #${bestTokenId}, using fallback.`);
            }
        }

        return { highestBoost, boostName: nftName, imageUrl, tokenId: bestTokenId.toString(), efficiency: finalEfficiency };

    } catch (e) {
        console.error("Error processing highest booster:", e);
        return { highestBoost: 0, boostName: 'Error Loading', imageUrl: '', tokenId: null, efficiency: 50 };
    }
}

export async function loadMyBoostersFromAPI() {
    if (State.myBoosters && State.myBoosters.length > 0) {
        return State.myBoosters;
    }
    State.myBoosters = []; 

    if (!State.rewardBoosterContract || !State.userAddress) return [];

    try {
        console.log("🚀 Loading user boosters from API...");
        const userAddress = State.userAddress;
        
        // Timeout de 5s para a API
        const response = await fetchWithTimeout(`${API_ENDPOINTS.getBoosters}/${userAddress}`, 5000);
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        const ownedTokensAPI = await response.json(); 
        
        if (ownedTokensAPI.length === 0) {
            console.log("ℹ️ No boosters found via API.");
            State.myBoosters = [];
            return [];
        }

        const boosterDetails = ownedTokensAPI.map(tokenData => {
            return {
                tokenId: BigInt(tokenData.tokenId),
                boostBips: Number(tokenData.boostBips || 0), 
                txHash: null,
                acquisitionTime: tokenData.mintedAt || null
            };
        });

        State.myBoosters = boosterDetails;
        return boosterDetails;

    } catch (e) {
        console.warn("⚠️ Error loading My Boosters from API (Using empty list):", e.message);
        State.myBoosters = [];
        return []; 
    }
}