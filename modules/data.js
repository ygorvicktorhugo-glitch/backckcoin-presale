// data.js
// ARQUIVO ATUALIZADO: Substituído API_BASE_URL por API_ENDPOINTS e ajustado CORS.

const ethers = window.ethers;

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
import { formatBigNumber, formatPStake } from '../utils.js';
import { addresses, boosterTiers, ipfsGateway } from '../config.js';

// ====================================================================
// !!! CORREÇÃO CRÍTICA !!!
// ENDPOINTS ATUALIZADOS PARA AS NOVAS URLS DO CLOUD RUN / PROJETO AIRDROP SEPARADO
// ESTE OBJETO SUBSTITUIU O 'API_BASE_URL' ANTIGO.
// ====================================================================
export const API_ENDPOINTS = {
    // 1. APIs do Projeto Principal: backchain-backand (NOVAS URLs Cloud Run)
    getHistory: 'https://gethistory-4wvdcuoouq-uc.a.run.app',
    getBoosters: 'https://getboosters-4wvdcuoouq-uc.a.run.app',
    getCertificates: 'https://getcertificates-4wvdcuoouq-uc.a.run.app',
    getSystemData: 'https://getsystemdata-4wvdcuoouq-uc.a.run.app',

    // 2. API Pinata/Upload (Função 'uploadFileToIPFS' - NOVA URL Cloud Run)
    uploadFileToIPFS: 'https://uploadfiletoipfs-4wvdcuoouq-uc.a.run.app', 
    
    // 3. API Airdrop (Projeto SEPARADO: airdropbackchainnew)
    // Usando a URL específica do projeto e endpoint '/claimAirdrop'
    claimAirdrop: 'https://us-central1-airdropbackchainnew.cloudfunctions.net/claimAirdrop'
};


// ====================================================================
// Funções de Segurança e Resiliência (Mantidas)
// ====================================================================

export const safeBalanceOf = async (contract, address) => {
    try {
        return await contract.balanceOf(address);
    } catch (e) {
        if (e.code === 'BAD_DATA' || e.code === 'CALL_EXCEPTION') {
            console.warn(`SafeBalanceOf: Falha ao buscar saldo para ${address}. Assumindo 0n.`, e);
            return 0n;
        }
        throw e;
    }
};

export const safeContractCall = async (contract, method, args = [], fallbackValue = 0n) => {
    try {
        const result = await contract[method](...args);
        return result;
    } catch (e) {
        if (e.code === 'BAD_DATA' || e.code === 'CALL_EXCEPTION') {
            console.warn(`SafeContractCall (${method}): Falha com BAD_DATA/CALL_EXCEPTION. Retornando fallback.`, e);
            if (typeof fallbackValue === 'object' && fallbackValue !== null && !Array.isArray(fallbackValue) && typeof fallbackValue !== 'bigint') {
                 return { ...fallbackValue };
            }
            return fallbackValue;
        }
        console.error(`SafeContractCall (${method}) unexpected error:`, e);
        return fallbackValue;
    }
};

// ====================================================================
// loadSystemDataFromAPI (Busca todas as regras do Hub)
// ====================================================================
export async function loadSystemDataFromAPI() {
    
    if (!State.systemFees) State.systemFees = {};
    if (!State.systemPStakes) State.systemPStakes = {};
    if (!State.boosterDiscounts) State.boosterDiscounts = {};

    try {
        console.log("Loading system rules from API...");
        // !!! CORREÇÃO: Usa o endpoint COMPLETO !!!
        const response = await fetch(API_ENDPOINTS.getSystemData); 
        
        if (!response.ok) {
            throw new Error(`API (getSystemData) Error: ${response.statusText} (${response.status})`);
        }
        const systemData = await response.json(); 

        // Salva as regras no State (usando BigInt para valores monetários/pStake)
        State.systemFees = {};
        for (const key in systemData.fees) {
             State.systemFees[key] = BigInt(systemData.fees[key]);
        }
        
        State.systemPStakes = {};
        for (const key in systemData.pStakeRequirements) {
             State.systemPStakes[key] = BigInt(systemData.pStakeRequirements[key]);
        }
        
        // Descontos são BIPS (Basis Points), podem ser Number
        State.boosterDiscounts = systemData.discounts; 
        
        console.log("System rules loaded and synced to State.");
        return true;

    } catch (e) {
        console.error("CRITICAL Error loading system data from API:", e);
        return false;
    }
}
// ====================================================================


// ====================================================================
// LÓGICA DE DADOS PÚBLICOS E PRIVADOS (Mantida)
// ====================================================================

export async function loadPublicData() {
    // (Esta função permanece inalterada, exceto pela chamada loadSystemDataFromAPI)
    if (!State.publicProvider || !State.bkcTokenContractPublic || !State.delegationManagerContractPublic) return;

    try {
        const publicDelegationContract = State.delegationManagerContractPublic;
        const publicBkcContract = State.bkcTokenContractPublic;

        const [
            totalSupply, 
            validators, 
            MAX_SUPPLY, 
            TGE_SUPPLY,
            delegatedManagerBalance, 
            nftPoolBalance, 
            rewardManagerBalance, 
            actionsManagerBalance
        ] = await Promise.all([
            safeContractCall(publicBkcContract, 'totalSupply', [], 0n), 
            safeContractCall(publicDelegationContract, 'getAllValidators', [], []),
            safeContractCall(publicBkcContract, 'MAX_SUPPLY', [], 0n), 
            safeContractCall(publicBkcContract, 'TGE_SUPPLY', [], 0n), 
            safeBalanceOf(publicBkcContract, addresses.delegationManager), 
            safeBalanceOf(publicBkcContract, addresses.nftBondingCurve), 
            safeBalanceOf(publicBkcContract, addresses.rewardManager), 
            safeBalanceOf(publicBkcContract, addresses.actionsManager)
        ]);

        const MINT_POOL = MAX_SUPPLY > TGE_SUPPLY ? MAX_SUPPLY - TGE_SUPPLY : 0n;
        if (totalSupply === 0n && TGE_SUPPLY > 0n) {
             console.warn("Usando TGE_SUPPLY como estimativa de Total Supply devido à falha na chamada totalSupply().");
        }
        const totalLockedWei = delegatedManagerBalance + nftPoolBalance + rewardManagerBalance + actionsManagerBalance;
        let lockedPercentage = 0;
        if (totalSupply > 0n) {
             lockedPercentage = (Number(totalLockedWei) * 100) / Number(totalSupply);
        }

        if (validators.length === 0) {
            State.allValidatorsData = [];
        } else {
            const validatorDataPromises = validators.map(async (addr) => {
                const fallbackStruct = { isRegistered: false, selfStakeAmount: 0n, totalDelegatedAmount: 0n, totalPStake: 0n };
                const validatorInfo = await safeContractCall(publicDelegationContract, 'validators', [addr], fallbackStruct);
                
                const pStake = validatorInfo.totalPStake; 

                return {
                    addr,
                    pStake, 
                    selfStake: validatorInfo.selfStakeAmount,
                    delegatedStake: validatorInfo.totalDelegatedAmount 
                };
            });
            State.allValidatorsData = await Promise.all(validatorDataPromises);
        }

        const recalculatedTotalPStake = State.allValidatorsData.reduce((acc, val) => acc + val.pStake, 0n);
        State.totalNetworkPStake = recalculatedTotalPStake;
        
        // Chamar o carregamento de dados do sistema (regras)
        await loadSystemDataFromAPI();

    } catch (e) { console.error("Error loading public data", e)}
}

export async function loadUserData() {
    if (!State.signer || !State.userAddress) return;

    try {
        const [balance, delegationsRaw, totalUserPStake] = await Promise.all([
            safeBalanceOf(State.bkcTokenContract, State.userAddress),
            safeContractCall(State.delegationManagerContract, 'getDelegationsOf', [State.userAddress], []),
            safeContractCall(State.delegationManagerContract, 'userTotalPStake', [State.userAddress], 0n)
        ]);

        State.currentUserBalance = balance;
        
        State.userDelegations = delegationsRaw.map((d, index) => ({
            amount: d[0], unlockTime: d[1],
            lockDuration: d[2], validator: d[3], index,
            txHash: null 
        }));
        
        State.userTotalPStake = totalUserPStake;
        
    } catch (e) {
        console.error("Error loading user data:", e);
    }
}

export async function calculateUserTotalRewards() {
    if (!State.delegationManagerContract || !State.rewardManagerContract || !State.userAddress) {
        return { stakingRewards: 0n, minerRewards: 0n, totalRewards: 0n };
    }

    try {
        const delegatorReward = await safeContractCall(State.delegationManagerContract, 'pendingDelegatorRewards', [State.userAddress], 0n);
        const minerRewards = await safeContractCall(State.rewardManagerContract, 'minerRewardsOwed', [State.userAddress], 0n);

        const stakingRewards = delegatorReward;
        return { stakingRewards, minerRewards, totalRewards: stakingRewards + minerRewards };

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
    if (!baseFeeBips) {
         // Fallback LENTO: Chama o contrato
         baseFeeBips = await safeContractCall(State.ecosystemManagerContract, 'getFee', ["CLAIM_REWARD_FEE_BIPS"], 50n); 
    }

    const baseFeePercent = Number(baseFeeBips) / 100;
    
    const boosterData = await getHighestBoosterBoostFromAPI(); 
    
    let discountBips = State.boosterDiscounts?.[boosterData.highestBoost];
    if (!discountBips) {
        // Fallback LENTO: Chama o contrato
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
            console.warn(`Could not fetch metadata for booster #${bestTokenId}:`, e);
        }

        return { highestBoost, boostName: nftName, imageUrl, tokenId: bestTokenId.toString(), efficiency: finalEfficiency };

    } catch (e) {
        console.error("Error processing highest booster:", e);
        return { highestBoost: 0, boostName: 'Error Loading', imageUrl: '', tokenId: null, efficiency: 50 };
    }
}

export async function loadMyCertificatesFromAPI() {
    if (State.myCertificates && State.myCertificates.length > 0) {
        return State.myCertificates;
    }
    
    State.myCertificates = []; 

    if (!State.signer || !State.rewardManagerContract || !State.userAddress) return [];

    try {
        console.log("Loading user certificates from API...");
        const userAddress = State.userAddress;

        // !!! CORREÇÃO: Usa o endpoint COMPLETO !!!
        const response = await fetch(`${API_ENDPOINTS.getCertificates}/${userAddress}`);
        
        if (!response.ok) {
            throw new Error(`API (getCertificates) Error: ${response.statusText} (${response.status})`);
        }
        
        const ownedCertsAPI = await response.json(); 
        
        if (ownedCertsAPI.length === 0) {
            console.log("No certificates found via API.");
            State.myCertificates = [];
            return [];
        }

        const certificateDetails = ownedCertsAPI.map(certData => {
            return {
                tokenId: BigInt(certData.tokenId),
                txHash: null 
            };
        });

        certificateDetails.sort((a, b) => (b.tokenId > a.tokenId ? 1 : -1));

        State.myCertificates = certificateDetails;
        console.log(`Found ${certificateDetails.length} certificates for user via API.`);
        return certificateDetails;

    } catch (e) {
        console.error("CRITICAL Error loading My Certificates from API:", e);
        State.myCertificates = [];
        return []; 
    }
}

export async function loadMyBoostersFromAPI() {
    if (State.myBoosters && State.myBoosters.length > 0) {
        return State.myBoosters;
    }
    State.myBoosters = []; 

    if (!State.signer || !State.rewardBoosterContract || !State.userAddress) return [];

    try {
        console.log("Loading user boosters from API...");
        const userAddress = State.userAddress;
        
        // !!! CORREÇÃO: Usa o endpoint COMPLETO !!!
        const response = await fetch(`${API_ENDPOINTS.getBoosters}/${userAddress}`);
        
        if (!response.ok) {
            throw new Error(`API (getBoosters) Error: ${response.statusText} (${response.status})`);
        }
        
        const ownedTokensAPI = await response.json(); 
        
        if (ownedTokensAPI.length === 0) {
            console.log("No boosters found via API.");
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
        console.log(`Found ${boosterDetails.length} boosters for user via API.`);
        return boosterDetails;

    } catch (e) {
        console.error("CRITICAL Error loading My Boosters from API:", e);
        State.myBoosters = [];
        return []; 
    }
}