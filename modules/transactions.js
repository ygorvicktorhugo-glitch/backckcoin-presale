// js/modules/transactions.js
// ✅ VERSÃO FINAL MAINNET V1.1: REMOÇÃO DA REFERÊNCIA AO FAUCET_AMOUNT_WEI

const ethers = window.ethers;

import { State } from '../state.js';
import { showToast, closeModal } from '../ui-feedback.js';
// 🔥 FIX: Removido FAUCET_AMOUNT_WEI, pois estamos na Mainnet
import { addresses, nftPoolABI, rentalManagerABI } from '../config.js'; 
import { formatBigNumber } from '../utils.js';
import { loadUserData, getHighestBoosterBoostFromAPI, loadRentalListings } from './data.js';

// --- Tolerance Constants ---
const APPROVAL_TOLERANCE_BIPS = 100n; 
const BIPS_DENOMINATOR = 10000n; 

// 🔥 FIX: Configuração de GÁS explícita (Arbitrum Mainnet EIP-1559)
// Valores padrão para Mainnet (os usuários precisarão de ETH)
const GAS_OPTS = { 
    gasLimit: 800000, 
    maxFeePerGas: ethers.parseUnits("0.05", "gwei"), // Ajuste conservador para Mainnet L2
    maxPriorityFeePerGas: ethers.parseUnits("0.005", "gwei") // Ajuste conservador para Mainnet L2
}; 

// ====================================================================
// CORE SIGNER/RUNNER UTILITY 
// ====================================================================

/**
 * Obtém o Signer priorizando o Signer já armazenado no State.
 */
async function getConnectedSigner() {
    if (!State.isConnected) {
        showToast("Wallet not connected.", "error");
        return null;
    }
    
    // Tenta usar o Signer armazenado (necessário para Smart Accounts/AppKit)
    if (State.signer) {
        return State.signer;
    }

    // Fallback: Forçar a obtenção via BrowserProvider
    if (State.web3Provider) {
        try {
            const provider = new ethers.BrowserProvider(State.web3Provider);
            const signer = await provider.getSigner(); 
            return signer;
        } catch (e) {
            console.error("Signer acquisition failed (Fallback):", e);
        }
    }

    showToast("Wallet signer is unavailable.", "error");
    return null;
}


// ====================================================================
// GENERIC WRAPPERS & UTILITIES
// ====================================================================

/**
 * Generic wrapper to execute a transaction and provide UI feedback.
 */
async function executeTransaction(txPromise, successMessage, failMessage, btnElement) {
    const originalText = btnElement ? btnElement.innerHTML : 'Processing...';
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loader inline-block mr-2"></div> Processing...';
    }

    try {
        const tx = await txPromise;
        
        if (btnElement) btnElement.innerHTML = '<div class="loader inline-block mr-2"></div> Confirming...';
        showToast('Submitting transaction to blockchain...', 'info');
        
        const receipt = await tx.wait();
        
        showToast(successMessage, 'success', receipt.hash);

        await loadUserData(); 
        
        // Mantido para compatibilidade, mas pode ser removido se não for usado na Presale
        if (window.location.hash.includes('rental') || window.location.hash.includes('dashboard')) {
             if (typeof loadRentalListings === 'function') await loadRentalListings(); 
        }
        
        setTimeout(async () => {
            await loadUserData();
            if (typeof loadRentalListings === 'function') await loadRentalListings();
            if (window.updateUIState) window.updateUIState(true);
        }, 3000);

        return true;
    } catch (e) {
        console.error("Transaction Error:", e);
        let reason = 'Transaction rejected or failed.';

        if (e.reason) reason = e.reason;
        else if (e.data && e.data.message) reason = e.data.message;
        else if (e.message) reason = e.message;

        // Mapeamento de erros do Ethers v6
        if (e.code === 'ACTION_REJECTED') reason = 'You rejected the transaction in your wallet.';
        if (reason.includes("execution reverted")) reason = "Execution Reverted (Check Contract State/Input).";
        
        showToast(`${failMessage}: ${reason}`, "error");
        return false;
    } finally {
        if(btnElement) {
            setTimeout(() => {
                if (btnElement) {
                    btnElement.disabled = false;
                    btnElement.innerHTML = originalText;
                }
            }, 1000);
        }
    }
}

/**
 * Ensures approval for ERC20 (Amount) OR ERC721 (TokenID).
 */
async function ensureApproval(tokenContract, spenderAddress, amountOrTokenId, btnElement, purpose) {
    const signer = await getConnectedSigner();
    if (!signer) return false;
    
    const approvedTokenContract = tokenContract.connect(signer);

    if (!spenderAddress || spenderAddress.includes('...')) {
        showToast(`Error: Invalid contract address for ${purpose}.`, "error");
        return false;
    }

    const setBtnLoading = (text) => {
        if(btnElement) {
            btnElement.innerHTML = `<div class="loader inline-block mr-2"></div> ${text}...`;
            btnElement.disabled = true;
        }
    };

    try {
        let isERC721 = false;
        try {
            const fn = tokenContract.interface.getFunction("setApprovalForAll");
            isERC721 = !!fn; 
        } catch (e) {
            isERC721 = false;
        }

        if (!isERC721) {
            // --- ERC20 LOGIC (Tokens) ---
            const requiredAmount = BigInt(amountOrTokenId);
            if (requiredAmount === 0n) return true;
            
            setBtnLoading("Checking Allowance");
            const allowance = await tokenContract.allowance(State.userAddress, spenderAddress); 

            const toleratedAmount = (requiredAmount * (BIPS_DENOMINATOR + APPROVAL_TOLERANCE_BIPS)) / BIPS_DENOMINATOR;

            if (allowance < toleratedAmount) {
                showToast(`Approving ${formatBigNumber(toleratedAmount).toFixed(2)} $BKC for ${purpose}...`, "info");
                setBtnLoading("Approving");

                const approveTx = await approvedTokenContract.approve(spenderAddress, toleratedAmount, GAS_OPTS);
                await approveTx.wait();
                showToast('Approval successful!', "success");
            }
            return true;
        } 
        else {
            // --- ERC721 LOGIC (NFTs) ---
            const tokenId = BigInt(amountOrTokenId);
            setBtnLoading("Checking NFT Approval");
            
            let approvedAddr = ethers.ZeroAddress;
            try { approvedAddr = await tokenContract.getApproved(tokenId); } catch(e) {} 
            
            const isApprovedAll = await tokenContract.isApprovedForAll(State.userAddress, spenderAddress);
            
            if (approvedAddr.toLowerCase() !== spenderAddress.toLowerCase() && !isApprovedAll) {
                showToast(`Approving NFT #${tokenId}...`, "info");
                setBtnLoading("Approving NFT");
                
                const approveTx = await approvedTokenContract.approve(spenderAddress, tokenId, GAS_OPTS);
                await approveTx.wait();
                showToast("NFT Approval successful!", "success");
            }
            return true;
        }

    } catch (e) {
        console.error("Approval Error:", e);
        if(btnElement) btnElement.disabled = false;
        
        let msg = e.reason || e.message || 'Transaction rejected.';
        
        showToast(`Approval Error: ${msg}`, "error");
        return false;
    }
}


// ====================================================================
// 1. RENTAL MARKET TRANSACTIONS (Mantido, mas não usado na Presale)
// ====================================================================

export async function executeListNFT(tokenId, pricePerHourWei, maxDurationHours, btnElement) {
    // ... Lógica mantida ...
    const signer = await getConnectedSigner();
    if (!signer || !addresses.rentalManager) return false;

    const approved = await ensureApproval(State.rewardBoosterContract, addresses.rentalManager, tokenId, btnElement, "Listing NFT");
    if (!approved) return false;

    const rentalContract = new ethers.Contract(addresses.rentalManager, rentalManagerABI, signer); 
    const txPromise = rentalContract.listNFT(BigInt(tokenId), BigInt(pricePerHourWei), BigInt(maxDurationHours), GAS_OPTS);
    
    return await executeTransaction(txPromise, `NFT #${tokenId} listed successfully!`, "Error listing NFT", btnElement);
}

export async function executeRentNFT(tokenId, hoursToRent, totalCostWei, btnElement) {
    // ... Lógica mantida ...
    const signer = await getConnectedSigner();
    if (!signer || !addresses.rentalManager) return false;

    const approved = await ensureApproval(State.bkcTokenContract, addresses.rentalManager, BigInt(totalCostWei), btnElement, "Rental Payment");
    if (!approved) return false;

    const rentalContract = new ethers.Contract(addresses.rentalManager, rentalManagerABI, signer); 
    const txPromise = rentalContract.rentNFT(BigInt(tokenId), BigInt(hoursToRent), GAS_OPTS);

    return await executeTransaction(txPromise, `NFT #${tokenId} rented for ${hoursToRent} hours!`, "Error renting NFT", btnElement);
}

export async function executeWithdrawNFT(tokenId, btnElement) {
    // ... Lógica mantida ...
    const signer = await getConnectedSigner();
    if (!signer || !addresses.rentalManager) return false;

    const rentalContract = new ethers.Contract(addresses.rentalManager, rentalManagerABI, signer); 
    const txPromise = rentalContract.withdrawNFT(BigInt(tokenId), GAS_OPTS);

    return await executeTransaction(txPromise, `NFT #${tokenId} withdrawn!`, "Error withdrawing NFT", btnElement);
}


// ====================================================================
// 2. CORE TRANSACTIONS (Delegation, Unstake, Claims - Mantido)
// ====================================================================

export async function executeDelegation(totalAmount, durationSeconds, boosterIdToSend, btnElement) {
    // ... Lógica mantida ...
    const signer = await getConnectedSigner();
    if (!signer || !addresses.delegationManager) return false;
    
    const totalAmountBigInt = BigInt(totalAmount); 
    const durationBigInt = BigInt(durationSeconds);
    const boosterIdBigInt = BigInt(boosterIdToSend);
    
    try {
        const balance = await State.bkcTokenContract.balanceOf(State.userAddress);
        if (balance < totalAmountBigInt) {
            showToast(`Insufficient balance!`, "error");
            return false;
        }
    } catch(e) { console.warn("Error checking balance", e); }

    const MAX_DURATION = 315360000n; 
    if (durationBigInt > MAX_DURATION) {
        showToast("Invalid duration (Max: 10 Years).", "error");
        return false;
    }

    const approved = await ensureApproval(State.bkcTokenContract, addresses.delegationManager, totalAmountBigInt, btnElement, "Delegation");
    if (!approved) return false;
    
    const delegationContract = State.delegationManagerContract.connect(signer); 
    const delegateTxPromise = delegationContract.delegate(totalAmountBigInt, durationBigInt, boosterIdBigInt, GAS_OPTS);
    
    const success = await executeTransaction(delegateTxPromise, 'Delegation successful!', 'Error delegating tokens', btnElement);
    
    if (success) closeModal();
    return success;
}

export async function executeUnstake(index) {
    // ... Lógica mantida ...
    const signer = await getConnectedSigner();
    if (!signer || !addresses.delegationManager) return false;

    const { tokenId: boosterTokenId } = await getHighestBoosterBoostFromAPI();
    const boosterIdToSend = boosterTokenId ? BigInt(boosterTokenId) : 0n;
    
    const btnElement = document.querySelector(`.unstake-btn[data-index='${index}']`);
    const delegationContract = State.delegationManagerContract.connect(signer); 
    const unstakeTxPromise = delegationContract.unstake(index, boosterIdToSend, GAS_OPTS);
    
    return await executeTransaction(unstakeTxPromise, 'Unstake successful!', 'Error unstaking tokens', btnElement);
}

export async function executeForceUnstake(index) {
    // ... Lógica mantida ...
    const signer = await getConnectedSigner();
    if (!signer || !addresses.delegationManager) return false;

    const { tokenId: boosterTokenId } = await getHighestBoosterBoostFromAPI();
    const boosterIdToSend = boosterTokenId ? BigInt(boosterTokenId) : 0n;
    
    if (!confirm("Are you sure? Force unstaking applies a 50% penalty on your principal.")) return false;
    
    const btnElement = document.querySelector(`.force-unstake-btn[data-index='${index}']`);
    const delegationContract = State.delegationManagerContract.connect(signer); 
    const forceUnstakeTxPromise = delegationContract.forceUnstake(index, boosterIdToSend, GAS_OPTS); 
    
    return await executeTransaction(forceUnstakeTxPromise, 'Force unstake successful!', 'Error performing force unstake', btnElement);
}

export async function executeUniversalClaim(stakingRewards, minerRewards, btnElement) {
    // ... Lógica mantida ...
    const signer = await getConnectedSigner();
    if (!signer || !addresses.delegationManager) return false;
    
    if (stakingRewards === 0n && minerRewards === 0n) {
        showToast("No rewards to claim.", "info");
        return false;
    }
    
    const originalText = btnElement ? btnElement.innerHTML : 'Claiming...';
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loader inline-block"></div> Claiming...';
    }
    
    try {
        const { tokenId: boosterTokenId } = await getHighestBoosterBoostFromAPI();
        const boosterIdToSend = boosterTokenId ? BigInt(boosterTokenId) : 0n;

        if (stakingRewards > 0n) {
            showToast("Claiming rewards...", "info");
            const delegationContract = State.delegationManagerContract.connect(signer); 
            const tx = await delegationContract.claimReward(boosterIdToSend, GAS_OPTS);
            await tx.wait();
            showToast('Reward claimed successfully!', "success");
        }
        
        loadUserData(); 
        return true;
    } catch (e) {
        console.error("Error during claim:", e);
        showToast(`Error: ${e.reason || e.message || 'Transaction rejected.'}`, "error");
        return false;
    } finally {
        if(btnElement) {
            setTimeout(() => {
                if(btnElement) {
                    btnElement.disabled = false;
                    btnElement.innerHTML = originalText;
                }
            }, 1000);
        }
    }
}


// ====================================================================
// 3. BOOSTER STORE TRANSACTIONS (Mantido)
// ====================================================================

export async function executeBuyBooster(poolAddress, price, boosterTokenIdForPStake, btnElement) {
    // ... Lógica mantida ...
    const signer = await getConnectedSigner();
    if (!signer || !poolAddress) return false;
    
    const originalText = btnElement ? btnElement.innerHTML : 'Buy';
    const priceBigInt = BigInt(price);
    
    if (priceBigInt <= 0n) {
        showToast("Price is zero or unavailable.", "error");
        return false;
    }
    if (priceBigInt > State.currentUserBalance) {
         showToast("Insufficient BKC balance.", "error");
         return false;
    }

    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loader inline-block"></div>';
    }
    
    try {
        const approved = await ensureApproval(State.bkcTokenContract, poolAddress, priceBigInt, btnElement, "NFT Purchase");
        if (!approved) {
             if(btnElement) btnElement.innerHTML = originalText;
             return false;
        }

        if (btnElement) btnElement.innerHTML = '<div class="loader inline-block"></div> Buying...';

        const poolContract = new ethers.Contract(poolAddress, nftPoolABI, signer); 
        const boosterIdToSend = BigInt(boosterTokenIdForPStake);

        const buyTxPromise = poolContract.buyNextAvailableNFT(boosterIdToSend, GAS_OPTS);
        return await executeTransaction(buyTxPromise, 'Purchase successful!', 'Error during purchase', btnElement);

    } catch (e) {
        console.error("Error buying booster:", e);
        showToast(`Error: ${e.reason || e.message || 'Transaction rejected.'}`, "error");
        return false;
    } finally {
         if(btnElement) {
             setTimeout(() => {
                 if(btnElement) {
                     btnElement.disabled = false;
                     btnElement.innerHTML = originalText;
                 }
             }, 1000);
         }
    }
}

export async function executeSellBooster(poolAddress, tokenIdToSell, boosterTokenIdForDiscount, btnElement) {
    // ... Lógica mantida ...
    const signer = await getConnectedSigner();
    if (!signer || !poolAddress) return false;
    
    const originalText = btnElement ? btnElement.innerHTML : 'Sell NFT';
    const tokenIdBigInt = BigInt(tokenIdToSell);
    
    if (tokenIdBigInt <= 0n) {
        showToast("No NFT selected.", "error");
        return false;
    }

    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loader inline-block"></div>';
    }

    try {
        const approved = await ensureApproval(State.rewardBoosterContract, poolAddress, tokenIdBigInt, btnElement, "NFT Sale");
        if (!approved) return false;

        if (btnElement) btnElement.innerHTML = '<div class="loader inline-block"></div> Selling...';

        const boosterIdToSend = BigInt(boosterTokenIdForDiscount);
        const minPrice = 0n; 
        
        const poolContract = new ethers.Contract(poolAddress, nftPoolABI, signer); 

        const sellTxPromise = poolContract.sellNFT(tokenIdBigInt, boosterIdToSend, minPrice, GAS_OPTS);
        return await executeTransaction(sellTxPromise, 'Sale successful!', 'Error during sale', btnElement);

    } catch (e) {
        console.error("Error selling booster:", e);
        showToast(`Error: ${e.reason || e.message || 'Transaction rejected.'}`, "error");
        return false;
    } finally {
        if(btnElement) {
             setTimeout(() => {
                 if(btnElement) {
                    btnElement.disabled = false;
                    btnElement.innerHTML = originalText;
                 }
             }, 1000);
        }
    }
}


// ====================================================================
// 4. FAUCET & NOTARY (Removido Faucet Internal, Notary mantido)
// ====================================================================

// Funções de Testnet (Faucet) foram removidas para este DApp de Mainnet.
// executeInternalFaucet is no longer exported.

export async function executeNotarizeDocument(documentURI, boosterId, submitButton) {
    // ... Lógica mantida ...
    const signer = await getConnectedSigner();
    if (!signer || !State.bkcTokenContract || !State.decentralizedNotaryContract) {
        return false;
    }

    const notaryContract = State.decentralizedNotaryContract.connect(signer); 
    const baseFee = State.systemFees?.NOTARY_SERVICE || 0n;
    const notaryAddress = await notaryContract.getAddress(); 
    
    if (baseFee > 0n) {
        const approved = await ensureApproval(State.bkcTokenContract, notaryAddress, baseFee, submitButton, "Notary Fee");
        if (!approved) return false;
    }

    const notarizeTxPromise = notaryContract.notarize(documentURI, BigInt(boosterId), GAS_OPTS);

    return await executeTransaction(notarizeTxPromise, 'Document notarized successfully!', 'Error notarizing document', submitButton);
}