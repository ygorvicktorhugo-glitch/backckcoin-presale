// js/modules/data.js
// ✅ VERSÃO ROBUSTA: Ignora erros de rede e foca na Presale

const ethers = window.ethers;

import { State } from '../state.js';
import { addresses, boosterTiers } from '../config.js'; 

// ====================================================================
// CONSTANTS & UTILITIES
// ====================================================================
const API_TIMEOUT_MS = 5000;
const CONTRACT_READ_CACHE_MS = 10000;
const OWNERSHIP_CACHE_MS = 30000;

// Mapa de Cache RPC
const contractReadCache = new Map(); 
const ownershipCache = new Map();

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') throw new Error('API request timed out.');
        throw error;
    }
}

export const API_ENDPOINTS = {
    getBoosters: 'https://getboosters-4wvdcuoouq-uc.a.run.app'
};

// ====================================================================
// SAFETY FUNCTIONS (RPC Protection)
// ====================================================================

function isRateLimitError(e) {
    return (
        e?.error?.code === 429 || e?.code === 429 || 
        (e.message && (e.message.includes("429") || e.message.includes("Too Many Requests")))
    );
}

// Verifica se é erro de troca de rede (para ignorar)
function isNetworkError(e) {
    return (e.code === 'NETWORK_ERROR' || e.message?.includes('network changed') || e.code === 'SERVER_ERROR');
}

function getContractInstance(address, abi, fallbackStateContract) {
    if (fallbackStateContract) return fallbackStateContract;
    if (!address || !State.publicProvider) return null;
    try {
        return new ethers.Contract(address, abi, State.publicProvider);
    } catch (e) {
        return null;
    }
}

export const safeContractCall = async (contract, method, args = [], fallbackValue = 0n, retries = 2, forceRefresh = false) => {
    if (!contract) return fallbackValue;
    
    const contractAddr = contract.target || contract.address;
    const serializedArgs = JSON.stringify(args, (key, value) => typeof value === 'bigint' ? value.toString() : value);
    const cacheKey = `${contractAddr}-${method}-${serializedArgs}`;
    const now = Date.now();

    const cacheableMethods = ['tiers', 'ownerOf', 'balanceOf', 'totalSupply', 'getTierInfo'];
    
    if (!forceRefresh && cacheableMethods.includes(method)) {
        const cached = contractReadCache.get(cacheKey);
        if (cached && (now - cached.timestamp < CONTRACT_READ_CACHE_MS)) {
            return cached.value;
        }
    }

    try {
        const result = await contract[method](...args);
        if (cacheableMethods.includes(method)) {
            contractReadCache.set(cacheKey, { value: result, timestamp: now });
        }
        return result;

    } catch (e) {
        // 🔥 FIX: Se a rede mudou, retorna fallback silenciosamente (sem logar erro)
        if (isNetworkError(e)) return fallbackValue;

        if (isRateLimitError(e) && retries > 0) {
            await wait(1000 + Math.floor(Math.random() * 2000));
            return safeContractCall(contract, method, args, fallbackValue, retries - 1, forceRefresh);
        }
        return fallbackValue;
    }
};

export const safeBalanceOf = async (contract, address, forceRefresh = false) => 
    safeContractCall(contract, 'balanceOf', [address], 0n, 2, forceRefresh);

// ====================================================================
// 1. PRESALE DATA (Tiers Info)
// ====================================================================

export async function loadPresaleData(forceRefresh = false) {
    // Tenta usar provider público se o signer não estiver pronto
    const contractToUse = State.publicSaleContract || 
                          getContractInstance(addresses.publicSale, ['function tiers(uint256) view returns (uint256,uint64,uint64,uint16,bool)'], null);

    if (!contractToUse) return;
    
    // IDs (Assumindo 1-based conforme o contrato)
    const tierIds = [1, 2, 3, 4, 5, 6, 7]; 
    const presaleData = [];

    for (const id of tierIds) {
        try {
            const tierInfo = await safeContractCall(contractToUse, 'tiers', [id], null, 2, forceRefresh);
            
            if (tierInfo) {
                // Ethers v6 retorna Result array-like ou Object
                // Acesso seguro: .priceInWei ou [0]
                const price = tierInfo.priceInWei ?? tierInfo[0];
                const maxSupply = tierInfo.maxSupply ?? tierInfo[1];
                const minted = tierInfo.mintedCount ?? tierInfo[2];
                const boost = tierInfo.boostBips ?? tierInfo[3];
                const configured = tierInfo.isConfigured ?? tierInfo[4];

                if (configured) {
                    presaleData.push({
                        id: id, // ID do contrato
                        price: price,
                        maxSupply: maxSupply,
                        minted: minted,
                        boostBips: boost,
                        soldOut: Number(minted) >= Number(maxSupply)
                    });
                }
            }
        } catch (e) {
            // Ignora erro individual de tier
        }
    }

    State.presaleTiers = presaleData;
    return presaleData;
}

export async function loadPublicData() {
    await loadPresaleData();
}

// ====================================================================
// 2. USER DATA (Balanço & Inventário)
// ====================================================================

export async function loadUserData(forceRefresh = false) {
    if (!State.isConnected || !State.userAddress) return;

    try {
        // 1. Saldo Nativo (ETH)
        if (State.provider) {
            try {
                const nativeBalance = await State.provider.getBalance(State.userAddress);
                State.currentUserNativeBalance = nativeBalance;
            } catch (e) {
                if (!isNetworkError(e)) console.warn("ETH balance fetch failed");
            }
        }

        // 2. Saldo BKC (Opcional)
        if (State.bkcTokenContract) {
            const balance = await safeBalanceOf(State.bkcTokenContract, State.userAddress, forceRefresh);
            State.currentUserBalance = balance;
        }

        // 3. Meus Boosters
        await loadMyBoostersFromAPI(forceRefresh);

    } catch (e) { 
        if (!isNetworkError(e)) console.error("Error loading user data:", e); 
    }
}

// ====================================================================
// 3. BOOSTER INVENTORY (Ghost Buster V2)
// ====================================================================

export async function loadMyBoostersFromAPI(forceRefresh = false) {
    if (!State.userAddress) return [];

    try {
        const response = await fetchWithTimeout(`${API_ENDPOINTS.getBoosters}/${State.userAddress}`, 5000);
        if (!response.ok) throw new Error(`API Error`);
        
        let ownedTokensAPI = await response.json(); 
        
        // Validação On-Chain
        const minABI = ["function ownerOf(uint256) view returns (address)"];
        const contract = getContractInstance(addresses.rewardBoosterNFT, minABI, State.rewardBoosterContractPublic);

        if (contract && ownedTokensAPI.length > 0) {
            const checks = await Promise.all(ownedTokensAPI.map(async (token) => {
                const id = BigInt(token.tokenId);
                const cacheKey = `ownerOf-${id}`;
                const now = Date.now();

                if (!forceRefresh && ownershipCache.has(cacheKey)) {
                    const cachedData = ownershipCache.get(cacheKey);
                    if (now - cachedData.timestamp < OWNERSHIP_CACHE_MS) {
                        if (cachedData.owner.toLowerCase() === State.userAddress.toLowerCase()) {
                            return { tokenId: id, boostBips: Number(token.boostBips || 0) };
                        }
                        return null; 
                    }
                }

                try {
                    const owner = await contract.ownerOf(id);
                    ownershipCache.set(cacheKey, { owner, timestamp: now });

                    if (owner.toLowerCase() === State.userAddress.toLowerCase()) {
                        return { tokenId: id, boostBips: Number(token.boostBips || 0) };
                    }
                    return null; 
                } catch(e) {
                    if (isNetworkError(e)) return null; // Ignora erro de rede
                    // Se der erro de rate limit, confia na API temporariamente
                    if(isRateLimitError(e)) {
                        return { tokenId: id, boostBips: Number(token.boostBips || 0) };
                    }
                    return null;
                }
            }));
            State.myBoosters = checks.filter(t => t !== null);
        } else {
            State.myBoosters = ownedTokensAPI.map(tokenData => ({
                tokenId: BigInt(tokenData.tokenId),
                boostBips: Number(tokenData.boostBips || 0)
            }));
        }
        
        return State.myBoosters;

    } catch (e) { 
        return []; 
    }
}