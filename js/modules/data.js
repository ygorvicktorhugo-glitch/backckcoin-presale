// js/modules/data.js
// ✅ VERSÃO PRESALE LITE V1.0: Focado em Venda Pública e Inventário

const ethers = window.ethers;

import { State } from '../state.js';
import { addresses, boosterTiers } from '../config.js'; // Certifique-se que publicSaleABI está no config ou use a interface mínima abaixo

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

// Endpoints reduzidos para o necessário
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

function getContractInstance(address, abi, fallbackStateContract) {
    if (fallbackStateContract) return fallbackStateContract;
    if (!address || !State.publicProvider) return null;
    try {
        return new ethers.Contract(address, abi, State.publicProvider);
    } catch (e) {
        console.warn("Failed to create lazy contract instance", e);
        return null;
    }
}

export const safeContractCall = async (contract, method, args = [], fallbackValue = 0n, retries = 2, forceRefresh = false) => {
    if (!contract) return fallbackValue;
    
    const contractAddr = contract.target || contract.address;
    const serializedArgs = JSON.stringify(args, (key, value) => typeof value === 'bigint' ? value.toString() : value);
    const cacheKey = `${contractAddr}-${method}-${serializedArgs}`;
    const now = Date.now();

    const cacheableMethods = ['tiers', 'ownerOf', 'balanceOf', 'totalSupply'];
    
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
        if (isRateLimitError(e) && retries > 0) {
            await wait(1500 + Math.floor(Math.random() * 2000));
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

/**
 * Carrega informações dos Tiers da Venda Pública (Preço, Supply, Mintados).
 * Assume que existem Tiers de ID 1, 2, 3 (padrão do contrato).
 */
export async function loadPresaleData(forceRefresh = false) {
    if (!State.publicSaleContractPublic && !State.publicSaleContract) return;
    
    // Usa o contrato público ou o signer se disponível
    const contract = State.publicSaleContractPublic || State.publicSaleContract;
    
    // IDs dos Tiers esperados (ajuste conforme sua config real no PublicSale.sol)
    // Se o contrato tiver IDs dinâmicos, precisaríamos de uma lógica diferente, 
    // mas geralmente são fixos (1=Comum, 2=Raro, 3=Lendário).
    const tierIds = [1, 2, 3]; 
    const presaleData = [];

    for (const id of tierIds) {
        try {
            // Struct Tier: priceInWei, maxSupply, mintedCount, boostBips, isConfigured
            const tierInfo = await safeContractCall(contract, 'tiers', [id], null, 2, forceRefresh);
            
            if (tierInfo && tierInfo.isConfigured) {
                presaleData.push({
                    id: id,
                    price: tierInfo.priceInWei,
                    maxSupply: tierInfo.maxSupply,
                    minted: tierInfo.mintedCount,
                    boostBips: tierInfo.boostBips,
                    soldOut: tierInfo.mintedCount >= tierInfo.maxSupply
                });
            }
        } catch (e) {
            console.warn(`Error fetching tier ${id}`, e);
        }
    }

    State.presaleTiers = presaleData;
    return presaleData;
}

export async function loadPublicData() {
    // Carrega apenas dados da Presale. Removemos SystemData e TotalSupply desnecessários.
    await loadPresaleData();
}

// ====================================================================
// 2. USER DATA (Balanço & Inventário)
// ====================================================================

export async function loadUserData(forceRefresh = false) {
    if (!State.isConnected || !State.userAddress) return;

    try {
        // 1. Saldo Nativo (ETH) - CRÍTICO para comprar na Presale
        if (State.provider) {
            const nativeBalance = await State.provider.getBalance(State.userAddress);
            State.currentUserNativeBalance = nativeBalance;
        }

        // 2. Saldo BKC (Opcional, apenas visual)
        if (State.bkcTokenContract) {
            const balance = await safeBalanceOf(State.bkcTokenContract, State.userAddress, forceRefresh);
            State.currentUserBalance = balance;
        }

        // 3. Carrega Meus Boosters (Para mostrar após a compra)
        await loadMyBoostersFromAPI(forceRefresh);

    } catch (e) { console.error("Error loading user data:", e); }
}

// ====================================================================
// 3. BOOSTER INVENTORY (Ghost Buster V2 - Mantido)
// ====================================================================

export async function loadMyBoostersFromAPI(forceRefresh = false) {
    if (!State.userAddress) return [];

    try {
        // 1. Pega lista da API
        const response = await fetchWithTimeout(`${API_ENDPOINTS.getBoosters}/${State.userAddress}`, 5000);
        if (!response.ok) throw new Error(`API Error`);
        
        let ownedTokensAPI = await response.json(); 
        
        // 2. Validação "Ghost Buster" (Confirma on-chain se ainda é dono)
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