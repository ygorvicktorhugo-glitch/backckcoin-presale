// js/modules/transactions.js
// ✅ VERSÃO FORCE GAS: Ignora estimativa para forçar abertura da wallet

const ethers = window.ethers;

import { State } from '../state.js';
import { showToast } from '../ui-feedback.js';
import { addresses, publicSaleABI } from '../config.js'; 
import { loadUserData } from './data.js';

// --- Configuração de Gás Manual ---
// Usamos um limite alto para evitar falha na estimativa
const GAS_OPTS = { 
    gasLimit: 3000000 // 3 Milhões de gás (suficiente para mintar vários NFTs)
}; 

async function getConnectedSigner() {
    if (!State.isConnected) {
        showToast("Wallet not connected.", "error");
        return null;
    }
    if (State.signer) return State.signer;
    
    if (State.web3Provider) {
        try {
            const provider = new ethers.BrowserProvider(State.web3Provider);
            return await provider.getSigner(); 
        } catch (e) { console.error(e); }
    }
    return null;
}

async function executeTransaction(txPromise, successMessage, failMessage, btnElement) {
    const originalText = btnElement ? btnElement.innerHTML : 'Processing...';
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loader inline-block mr-2"></div> Wallet...';
    }

    try {
        // Aguarda a assinatura da transação
        const tx = await txPromise;
        
        if (btnElement) btnElement.innerHTML = '<div class="loader inline-block mr-2"></div> Confirming...';
        showToast('Transaction submitted...', 'info');
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showToast(successMessage, 'success', receipt.hash);
            setTimeout(() => {
                loadUserData();
                if (window.updateUIState) window.updateUIState(true);
            }, 2000);
            return true;
        } else {
            throw new Error("Transaction reverted on-chain.");
        }

    } catch (e) {
        console.error("Transaction Error:", e);
        let reason = 'Transaction failed.';

        if (e.code === 'ACTION_REJECTED') reason = 'You rejected the transaction.';
        else if (e.info && e.info.error) reason = e.info.error.message; // Erro detalhado do Ethers v6
        
        showToast(`${failMessage}`, "error");
        return false;
    } finally {
        if(btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = originalText;
        }
    }
}

export async function executePresaleMint(tierId, quantity, pricePerUnitWei, btnElement) {
    const signer = await getConnectedSigner();
    if (!signer) return false;

    try {
        const totalValue = BigInt(pricePerUnitWei) * BigInt(quantity);
        const saleContract = new ethers.Contract(addresses.publicSale, publicSaleABI, signer);

        console.log(`📝 Sending Mint Tx: Tier ${tierId}, Qty ${quantity}, Value ${totalValue}`);

        // Chama a função COM o limite de gás forçado
        // Isso impede que o RPC tente estimar e falhe antes de abrir a carteira
        const txPromise = saleContract.buyMultipleNFTs(tierId, quantity, {
            value: totalValue,
            ...GAS_OPTS 
        });

        return await executeTransaction(
            txPromise, 
            `Successfully minted ${quantity} Booster(s)!`, 
            "Minting Failed", 
            btnElement
        );

    } catch (e) {
        console.error("Mint Logic Error:", e);
        showToast("Error initiating transaction.", "error");
        return false;
    }
}

// Exports vazios para compatibilidade
export async function executeListNFT() { return false; }
export async function executeRentNFT() { return false; }
export async function executeWithdrawNFT() { return false; }
export async function executeBuyBooster() { return false; }
export async function executeSellBooster() { return false; }
export async function executeNotarizeDocument() { return false; }