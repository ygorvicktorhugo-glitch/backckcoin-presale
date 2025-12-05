// js/utils.js
// ✅ VERSÃO FINAL: Formatação Robusta + Renderização Otimizada

const ethers = window.ethers;

// Gateway IPFS Padrão
export const ipfsGateway = "https://ipfs.io/ipfs/";

// =======================================================
// FORMATAÇÃO DE DADOS (BigInt / Address)
// =======================================================

// Formata BigInt para número float (ex: saldo) com precisão configurável
export const formatBigNumber = (value, decimals = 18) => {
    if (value === null || typeof value === 'undefined') return 0;
    
    // Se já for number/string, tenta converter direto
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value);

    try {
        // Safe BigInt Check
        const bigValue = BigInt(value); 
        return parseFloat(ethers.formatUnits(bigValue, decimals));
    } catch (e) {
        return 0;
    }
};

// Formata endereço (0x123...abcd)
export const formatAddress = (address) => {
    if (!address || typeof address !== 'string' || !address.startsWith('0x')) return "...";
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

// Formata números grandes com sufixos (1k, 1M, 1B)
export const formatCompactNumber = (number) => {
    try {
        const num = Number(number);
        return new Intl.NumberFormat('en-US', {
            notation: "compact",
            maximumFractionDigits: 1
        }).format(num);
    } catch (e) {
        return "0";
    }
};

// =======================================================
// RENDERIZAÇÃO DE COMPONENTES (HTML Strings)
// =======================================================

export const renderLoading = (text = "Loading...") => {
    return `<div class="flex items-center justify-center p-4 text-zinc-400"><div class="loader inline-block mr-2"></div> ${text}</div>`;
};

export const renderError = (message = "An error occurred.") => {
    return `<div class="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-center text-red-400 text-sm">${message}</div>`;
};

export const renderNoData = (message = "No data available.") => {
    return `<div class="text-center p-8 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-lg col-span-full">
                <i class="fa-regular fa-folder-open text-2xl text-zinc-600 mb-2"></i>
                <p class="text-zinc-500 italic text-sm">${message}</p>
            </div>`;
};