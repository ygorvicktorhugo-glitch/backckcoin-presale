// js/modules/transactions.js
// ✅ FINAL VERSION: Robust Retry System (Standard -> Legacy Fallback) + Smart Balance

const ethers = window.ethers;

import { State } from '../state.js';
import { showToast } from '../ui-feedback.js';
import { addresses, publicSaleABI } from '../config.js'; 
import { loadUserData } from './data.js';

// ====================================================================
// HELPERS
// ====================================================================

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

function extractErrorReason(error) {
    if (error.reason) return error.reason;
    if (error.data && error.data.message) return error.data.message;
    if (error.message) {
        // Tenta limpar mensagens sujas da RPC
        const match = error.message.match(/execution reverted: (.*?)"/);
        if (match) return match[1];
        return error.message;
    }
    return "Unknown Blockchain Error";
}

// ====================================================================
// 💰 UI: LOW BALANCE MODAL
// ====================================================================

function showLowBalanceModal(needed, current) {
    const existing = document.getElementById('low-balance-modal');
    if (existing) existing.remove();

    const neededEth = parseFloat(ethers.formatEther(needed)).toFixed(4);
    const currentEth = parseFloat(ethers.formatEther(current)).toFixed(4);
    const userAddr = State.userAddress || "";

    // 1. MAINNET (Link Transak)
    let buyLink = `https://global.transak.com/?network=arbitrum&cryptoCurrencyCode=ETH&walletAddress=${userAddr}&fiatCurrency=USD`; 
    let btnText = "💳 Buy ETH with Card";
    let subText = "Secure purchase via Transak";

    // 2. TESTNET (Link Faucet)
    const chainId = State.provider?._network?.chainId;
    if (chainId && (Number(chainId) === 421614 || Number(chainId) === 11155111)) {
        buyLink = "https://faucet.quicknode.com/arbitrum/sepolia";
        btnText = "🚰 Get Free Testnet ETH";
        subText = "You are on Testnet. Get free tokens.";
    }

    const modalHTML = `
        <div id="low-balance-modal" class="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 fade-in">
            <div class="bg-zinc-900 border border-red-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl relative transform scale-100 transition-all">
                <button onclick="document.getElementById('low-balance-modal').remove()" class="absolute top-4 right-4 text-zinc-500 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
                <div class="text-center">
                    <div class="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20"><i class="fa-solid fa-coins text-3xl text-red-500"></i></div>
                    <h3 class="text-2xl font-black text-white mb-2">Insufficient Funds</h3>
                    <p class="text-zinc-400 text-sm mb-6">Required: <strong>${neededEth} ETH</strong><br>Balance: <span class="text-red-400">${currentEth} ETH</span></p>
                    <a href="${buyLink}" target="_blank" class="flex items-center justify-center gap-3 w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-blue-500/25 mb-3 group">
                        <span class="group-hover:scale-110 transition-transform">${btnText}</span> <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    </a>
                    <p class="text-[10px] text-zinc-600 uppercase tracking-widest">${subText}</p>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// ====================================================================
// ⏳ UI: WAIT FOR TRANSACTION (Recebe a TX já enviada)
// ====================================================================

async function waitForTxConfirmation(tx, successMessage, btnElement) {
    const originalText = btnElement ? btnElement.innerHTML : 'Processing...';
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loader inline-block mr-2"></div> Confirming...';
    }

    try {
        showToast('Transaction sent! Waiting for confirmation...', 'info');
        
        // Aguarda a confirmação do bloco
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showToast(successMessage, 'success', receipt.hash);
            setTimeout(() => { window.location.reload(); }, 2500);
            return true;
        } else {
            throw new Error("Transaction reverted on-chain during confirmation.");
        }

    } catch (e) {
        console.error("❌ Confirmation Error:", e);
        showToast(`Confirmation Failed: ${extractErrorReason(e)}`, "error");
        return false;
    } finally {
        if(btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = originalText;
        }
    }
}

// ====================================================================
// 🔥 MAIN MINT LOGIC (Com Retry System)
// ====================================================================

export async function executePresaleMint(tierId, quantity, pricePerUnitWei, btnElement) {
    const signer = await getConnectedSigner();
    if (!signer) return false;

    if (!addresses.publicSale) {
        showToast("Contract not configured.", "error");
        return false;
    }

    try {
        const totalValue = BigInt(pricePerUnitWei) * BigInt(quantity);
        const saleContract = new ethers.Contract(addresses.publicSale, publicSaleABI, signer);
        
        // 1. CHECAR SALDO
        const buffer = 300000000000000n; // 0.0003 ETH
        const balance = await signer.provider.getBalance(State.userAddress);
        if (balance < (totalValue + buffer)) {
            showLowBalanceModal(totalValue + buffer, balance);
            return false;
        }

        console.log(`🧮 Tier ${tierId}: Validating...`);
        
        // 2. VALIDAÇÃO (Estimate Gas)
        // Se isso falhar, o contrato recusou (erro lógico). Não adianta tentar fallback.
        let estimatedGas;
        try {
            estimatedGas = await saleContract.buyMultipleNFTs.estimateGas(tierId, quantity, { value: totalValue });
            console.log(`⛽ Estimate Valid: ${estimatedGas}`);
        } catch (e) {
            console.error("Validation Failed:", e);
            showToast(`Contract Rejected: ${extractErrorReason(e)}`, "error");
            return false;
        }

        let tx;

        // 3. TENTATIVA 1: ENVIO PADRÃO (EIP-1559)
        // A maioria das vezes funciona. Se a RPC da Arbitrum estiver chata, falha aqui.
        try {
            console.log("🚀 Attempt 1: Standard Send...");
            
            // Removemos gasLimit manual para deixar a MetaMask decidir a melhor estratégia EIP-1559
            tx = await saleContract.buyMultipleNFTs(tierId, quantity, { value: totalValue });
        
        } catch (err1) {
            console.warn("⚠️ Standard Send Failed. Preparing Legacy Fallback...", err1);
            
            // Verificamos se é o erro de RPC maldito (-32603)
            if (err1.message && (err1.message.includes("-32603") || err1.message.includes("Internal JSON-RPC"))) {
                
                // 4. TENTATIVA 2: FALLBACK LEGACY (ROBUSTO)
                // Construímos a transação manualmente e forçamos o modo Legacy (gasPrice)
                try {
                    console.log("🔄 Attempt 2: Force Legacy Mode...");
                    
                    const feeData = await signer.provider.getFeeData();
                    
                    // Buffer de segurança no Gás (+30%)
                    const safeGasLimit = (estimatedGas * 130n) / 100n;

                    // Criamos a transação crua
                    const txData = await saleContract.buyMultipleNFTs.populateTransaction(tierId, quantity, { value: totalValue });
                    
                    // FORÇAMOS LEGACY: Usamos gasPrice e removemos campos EIP-1559 se existirem
                    txData.gasLimit = safeGasLimit;
                    txData.gasPrice = feeData.gasPrice; // Isso força Type 0
                    delete txData.maxFeePerGas;
                    delete txData.maxPriorityFeePerGas;

                    // Envia via Signer (Bypassing contrato wrapper)
                    tx = await signer.sendTransaction(txData);
                    console.log("✅ Legacy Send Success!");

                } catch (err2) {
                    console.error("❌ Both attempts failed.", err2);
                    throw err2; // Desiste
                }
            } else {
                throw err1; // Se não for erro de RPC (ex: usuário rejeitou), lança erro original
            }
        }

        // 5. AGUARDAR CONFIRMAÇÃO
        // Se chegamos aqui, 'tx' existe e foi enviada. Agora só esperamos a UI.
        return await waitForTxConfirmation(
            tx, 
            `Successfully minted ${quantity} Booster(s)!`, 
            btnElement
        );

    } catch (e) {
        console.error("Flow Error:", e);
        let reason = extractErrorReason(e);
        if (reason.includes("user rejected")) reason = "User rejected transaction.";
        showToast(`Error: ${reason}`, "error");
        return false;
    }
}

// ====================================================================
// 👑 ADMIN
// ====================================================================

export async function executeAdminWithdraw(btnElement) {
    const signer = await getConnectedSigner();
    if (!signer) return false;
    try {
        const saleContract = new ethers.Contract(addresses.publicSale, publicSaleABI, signer);
        // Withdraw geralmente é simples, não precisa do fallback complexo
        const tx = await saleContract.withdrawFunds(); 
        return await waitForTxConfirmation(tx, "Funds withdrawn!", btnElement);
    } catch (e) {
        console.error(e);
        return false;
    }
}

// Compatibilidade
export async function executeListNFT() { return false; }
export async function executeRentNFT() { return false; }
export async function executeWithdrawNFT() { return false; }
export async function executeBuyBooster() { return false; }
export async function executeSellBooster() { return false; }
export async function executeNotarizeDocument() { return false; }