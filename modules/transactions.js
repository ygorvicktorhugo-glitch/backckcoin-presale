// modules/transactions.js

const ethers = window.ethers;

import { State } from '../state.js';
import { showToast, closeModal } from '../ui-feedback.js';
import { addresses, FAUCET_AMOUNT_WEI } from '../config.js';
import { formatBigNumber } from '../utils.js';
import { loadUserData, getHighestBoosterBoostFromAPI, safeContractCall } from './data.js';

// --- Tolerance Constants ---
const APPROVAL_TOLERANCE_BIPS = 100; // 1% in BIPS
const BIPS_DENOMINATOR = 10000;

/**
 * Generic wrapper to execute a transaction and provide UI feedback.
 * @param {Promise} txPromise - The promise returned by the contract function call.
 * @param {string} successMessage - Message to show on success.
 * @param {string} failMessage - Message to show on failure.
 * @param {HTMLElement} btnElement - The button element to show loading/disabled states.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function executeTransaction(txPromise, successMessage, failMessage, btnElement) {
    if (!btnElement) {
        console.warn("Transaction executed without a button element for feedback.");
    }

    const originalText = btnElement ? btnElement.innerHTML : 'Processing...';
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loader inline-block mr-2"></div> Processing...';
    }

    try {
        const tx = await txPromise;
        if (btnElement) btnElement.innerHTML = '<div class="loader inline-block mr-2"></div> Awaiting Confirmation...';
        showToast('Submitting transaction...', 'info');
        
        const receipt = await tx.wait();
        showToast(successMessage, 'success', receipt.hash);

        // Reload user data after a successful transaction
        setTimeout(loadUserData, 1500); // Delay to allow state propagation

        return true;
    } catch (e) {
        console.error("Transaction Error:", e);
        let reason = 'Transaction rejected or failed.';

        // Extract detailed error reason
        if (e.reason) {
            reason = e.reason;
        } else if (e.data && e.data.message) {
             reason = e.data.message;
        } else if (e.message) {
             reason = e.message;
        }

        // Handle common error codes
        if (e.code === 'ACTION_REJECTED') reason = 'Transaction rejected by user.';
        if (e.code === 'INSUFFICIENT_FUNDS') reason = 'Insufficient ETH for gas fees.';

        // Handle contract-specific reverts
        if (reason.includes("Notary: Insufficient pStake")) {
             reason = "You don't meet the minimum pStake requirement.";
        }

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
 * Ensures the user has approved a specific amount of BKC tokens for a spender.
 * @param {string} spenderAddress - The contract address to approve.
 * @param {BigInt} requiredAmount - The amount of tokens required.
 * @param {HTMLElement} btnElement - The button for UI feedback.
 * @param {string} purpose - A description for the toast message (e.g., "Delegation").
 * @returns {Promise<boolean>} - True if approval is met or successful, false otherwise.
 */
async function ensureApproval(spenderAddress, requiredAmount, btnElement, purpose) {
    if (!State.signer) return false;

    // Calculate amount with tolerance to avoid failures from small price fluctuations
    const toleratedAmount = (requiredAmount * BigInt(BIPS_DENOMINATOR + APPROVAL_TOLERANCE_BIPS)) / BigInt(BIPS_DENOMINATOR);

    const originalText = btnElement ? btnElement.innerHTML : null;
    const setBtnLoading = (text) => {
        if(btnElement) {
            btnElement.innerHTML = `<div class="loader inline-block mr-2"></div> ${text}...`;
            btnElement.disabled = true;
        }
    };
    const resetBtn = () => {
         if(btnElement && originalText) {
             btnElement.innerHTML = originalText;
         }
    };

    try {
        setBtnLoading("Checking allowance");
        const allowance = await State.bkcTokenContract.allowance(State.userAddress, spenderAddress);

        if (allowance < toleratedAmount) {
            showToast(`Approving ${formatBigNumber(toleratedAmount).toFixed(2)} $BKC for ${purpose}...`, "info");
            setBtnLoading("Approving");

            const approveTx = await State.bkcTokenContract.approve(spenderAddress, toleratedAmount);
            await approveTx.wait();
            showToast('Approval successful!', "success");
        }
        return true;
    } catch (e) {
        console.error("Approval Error:", e);
        showToast(`Approval Error: ${e.reason || e.message || 'Transaction rejected.'}`, "error");
        resetBtn();
        return false;
    }
}


// --- DELEGATION / UNSTAKE ---

export async function executeDelegation(validatorAddr, totalAmount, durationSeconds, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");
    
    const approved = await ensureApproval(addresses.delegationManager, totalAmount, btnElement, "Delegation");
    if (!approved) return false;
    
    const delegateTxPromise = State.delegationManagerContract.delegate(validatorAddr, totalAmount, BigInt(durationSeconds));
    const success = await executeTransaction(delegateTxPromise, 'Delegation successful!', 'Error delegating tokens', btnElement);
    
    if (success) closeModal();
    return success;
}

export async function executeUnstake(index) {
    if (!State.signer) return showToast("Wallet not connected.", "error");
    
    const btnElement = document.querySelector(`.unstake-btn[data-index='${index}']`)
    const unstakeTxPromise = State.delegationManagerContract.unstake(index);
    
    return await executeTransaction(
        unstakeTxPromise,
        'Unstake successful!',
        'Error unstaking tokens',
        btnElement
    );
}

export async function executeForceUnstake(index) {
    if (!State.signer) return showToast("Wallet not connected.", "error");

    // Get booster ID for penalty discount
    const { tokenId: boosterTokenId } = await getHighestBoosterBoostFromAPI();
    const boosterIdToSend = boosterTokenId ? BigInt(boosterTokenId) : 0n;
    
    if (!confirm("Are you sure? This action will incur a penalty (which may be reduced by your Booster NFT).")) return false;
    
    const btnElement = document.querySelector(`.force-unstake-btn[data-index='${index}']`)
    
    // Pass the boosterIdToSend as the second argument for the discount
    const forceUnstakeTxPromise = State.delegationManagerContract.forceUnstake(index, boosterIdToSend); 
    
    return await executeTransaction(
        forceUnstakeTxPromise,
        'Force unstake successful!',
        'Error performing force unstake',
        btnElement
    );
}


// --- VALIDATOR ---

export async function payValidatorFee(feeAmount, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");
    
    const approved = await ensureApproval(addresses.delegationManager, feeAmount, btnElement, "Validator Fee");
    if (!approved) return false;
    
    const payTxPromise = State.delegationManagerContract.payRegistrationFee();
    
    return await executeTransaction(payTxPromise, 'Fee paid successfully!', 'Error paying validator fee', btnElement);
}

export async function registerValidator(stakeAmount, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");
    
    const approved = await ensureApproval(addresses.delegationManager, stakeAmount, btnElement, "Validator Stake");
    if (!approved) return false;
    
    const registerTxPromise = State.delegationManagerContract.registerValidator(State.userAddress);
    
    return await executeTransaction(registerTxPromise, 'Validator registered!', 'Error registering validator', btnElement);
}


// --- POP MINING / CERTIFICATES ---

export async function createVestingCertificate(recipientAddress, amount, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");
    if (!ethers.isAddress(recipientAddress)) return showToast('Invalid beneficiary address.', 'error');
    if (amount <= 0n) return showToast('Invalid amount.', 'error');
    if (amount > State.currentUserBalance) return showToast("Insufficient $BKC balance.", "error");
    
    const approved = await ensureApproval(addresses.rewardManager, amount, btnElement, "PoP Mining Purchase");
    if (!approved) return false;
    
    const createTxPromise = State.rewardManagerContract.createVestingCertificate(recipientAddress, amount);
    const success = await executeTransaction(createTxPromise, 'PoP Mining completed successfully!', 'Error executing PoP Mining', btnElement);
    
    if (success) {
        // Clear inputs only if the transaction is successful
        const recipientInput = document.getElementById('recipientAddressInput');
        const amountInput = document.getElementById('certificateAmountInput');
        if(recipientInput) recipientInput.value = '';
        if(amountInput) amountInput.value = '';
    }
    return success;
}

export async function executeWithdraw(tokenId, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");

    // Get booster ID for penalty discount
    const { tokenId: boosterTokenId } = await getHighestBoosterBoostFromAPI();
    const boosterIdToSend = boosterTokenId ? BigInt(boosterTokenId) : 0n;

    // Pass the boosterIdToSend as the second argument for the discount
    const withdrawTxPromise = State.rewardManagerContract.withdraw(tokenId, boosterIdToSend); 
    
    return await executeTransaction(withdrawTxPromise, 'Withdrawal successful!', 'Error during withdrawal', btnElement);
}


// --- REWARD CLAIMS ---

export async function executeUniversalClaim(stakingRewards, minerRewards, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");
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
        let txHashes = [];
        if (stakingRewards > 0n) {
            showToast("Claiming staking rewards...", "info");
            const tx = await State.delegationManagerContract.claimDelegatorReward();
            const receipt = await tx.wait();
            txHashes.push(receipt.hash);
        }
        if (minerRewards > 0n) {
            showToast("Claiming PoP Mining rewards...", "info");
            const tx = await State.rewardManagerContract.claimMinerRewards();
            const receipt = await tx.wait();
            txHashes.push(receipt.hash);
        }
        
        const successMessage = txHashes.length > 1 ? 'All rewards claimed successfully!' : 'Reward claimed successfully!';
        showToast(successMessage, "success", txHashes[0] || null);
        loadUserData(); // Reload data after claim
        return true;
    } catch (e) {
        console.error("Error during universal claim:", e);
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


// --- BOOSTER STORE ---

export async function executeBuyBooster(boostBips, price, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");
    
    const originalText = btnElement ? btnElement.innerHTML : 'Buy';
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loader inline-block"></div>';
    }
    
    try {
        const priceWei = BigInt(price);
        
        // Ensure approval for the purchase amount
        const approved = await ensureApproval(addresses.nftBondingCurve, priceWei, btnElement, "NFT Purchase");
        if (!approved) return false;

        if (btnElement) btnElement.innerHTML = '<div class="loader inline-block"></div> Buying...';

        // Get booster ID for pStake check (if any)
        const { tokenId: boosterTokenId } = await getHighestBoosterBoostFromAPI();
        const boosterIdToSend = boosterTokenId ? BigInt(boosterTokenId) : 0n;

        showToast("Submitting buy transaction...", "info");

        // =================================================================
        // --- CORRECTED FUNCTION CALL ---
        // Call the new `buyNextAvailableNFT` function which takes 2 arguments:
        // 1. boostBips
        // 2. boosterTokenId (for pStake check)
        const buyTxPromise = State.nftBondingCurveContract.buyNextAvailableNFT(
            boostBips,
            boosterIdToSend 
        );
        // =================================================================

        const success = await executeTransaction(buyTxPromise, 'Purchase successful!', 'Error during purchase', btnElement);

        if (success) {
            console.log("Purchase successful.");
        }
        return success;
    } catch (e) {
        console.error("Error buying booster:", e);
        showToast(`Error: ${e.message || 'Transaction rejected.'}`, "error");
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

export async function executeSellBooster(tokenId, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");
    
    const originalText = btnElement ? btnElement.innerHTML : 'Sell NFT';
    let tokenIdBigInt;
    
    try {
        tokenIdBigInt = BigInt(tokenId);
    } catch {
        showToast("Invalid Token ID provided.", "error");
        return false;
    }

    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loader inline-block"></div>';
    }

    try {
        // 1. Approve the Pool contract to take the NFT
        showToast(`Approving transfer of NFT #${tokenId}...`, "info");
        const approveTx = await State.rewardBoosterContract.approve(addresses.nftBondingCurve, tokenIdBigInt);
        await approveTx.wait();
        showToast("NFT approved successfully!", "success");

        if (btnElement) btnElement.innerHTML = '<div class="loader inline-block"></div> Selling...';
        showToast("Submitting sell transaction...", "info");

        // 2. Get booster ID for pStake check and potential tax discount
        const { tokenId: boosterTokenId } = await getHighestBoosterBoostFromAPI();
        const boosterIdToSend = boosterTokenId ? BigInt(boosterTokenId) : 0n;

        // 3. Call sellNFT, passing both the token to sell and the booster to use for discounts
        const sellTxPromise = State.nftBondingCurveContract.sellNFT(tokenIdBigInt, boosterIdToSend);

        const success = await executeTransaction(sellTxPromise, 'Sale successful!', 'Error during sale', btnElement);
        return success;

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


// --- FAUCET CLAIM ---

export async function executeFaucetClaim(btnElement) {
    if (!State.signer || !State.faucetContract) {
        showToast("Wallet not connected or Faucet not configured.", "error");
        return false;
    }
    
    const claimTxPromise = State.faucetContract.claim();
    const faucetAmount = formatBigNumber(FAUCET_AMOUNT_WEI);
    
    return await executeTransaction(
        claimTxPromise,
        `Successfully claimed ${faucetAmount} $BKC!`,
        'Error claiming tokens',
        btnElement
    );
}


// --- NOTARY ---

/**
 * Executes the transaction to notarize a document.
 * @param {string} documentURI - The 'ipfs://...' URI of the document.
 * @param {string} description - The user-provided description (max 256 chars).
 * @param {BigInt} boosterId - The user's Booster NFT ID (0n if none).
 * @param {HTMLElement} submitButton - The submit button for loading feedback.
 * @returns {Promise<boolean>} - True if the transaction is successful.
 */
export async function executeNotarizeDocument(documentURI, description, boosterId, submitButton) {
    if (!State.signer || !State.bkcTokenContract || !State.decentralizedNotaryContract) {
        showToast("Wallet not connected or contracts not loaded.", "error");
        return false;
    }

    // 1. Fetch the Base Fee (undiscounted)
    const baseFee = State.notaryFee; 
    if (typeof baseFee === 'undefined') {
        showToast("Notary base fee not loaded. Please refresh.", "error");
        return false;
    }

    // 2. Ensure Approval for the base fee
    const notaryAddress = await State.decentralizedNotaryContract.getAddress();
    if (baseFee > 0n) {
        const approved = await ensureApproval(notaryAddress, baseFee, submitButton, "Notary Fee");
        if (!approved) return false;
    }

    // 3. Execute the Notarization
    const notarizeTxPromise = State.decentralizedNotaryContract.notarizeDocument(
        documentURI,
        description,
        boosterId
    );

    const success = await executeTransaction(
        notarizeTxPromise,
        'Document notarized successfully!',
        'Error notarizing document',
        submitButton
    );

    return success;
}