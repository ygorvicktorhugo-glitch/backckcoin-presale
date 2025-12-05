// js/config.js
// ✅ VERSÃO PRESALE PRODUCTION: Links IPFS configurados

// Gateway IPFS (Pinata)
export const ipfsGateway = "https://white-defensive-eel-240.mypinata.cloud/ipfs/";
export const mainnetRpcUrl = "https://arb1.arbitrum.io/rpc";

// ============================================================================
// 1. ENDEREÇOS (Carregados Dinamicamente)
// ============================================================================
export const addresses = {
    publicSale: null,  // Preenchido pelo loadAddresses
    bkcToken: null,
    rewardBoosterNFT: null
};

export async function loadAddresses() {
    try {
        const response = await fetch('./deployment-addresses.json');
        if (!response.ok) {
            console.warn("⚠️ deployment-addresses.json not found.");
            return false;
        }
        const data = await response.json();

        // Mapeamento
        if (data.presaleNFTContract) addresses.publicSale = data.presaleNFTContract;
        if (data.bkcToken) addresses.bkcToken = data.bkcToken;
        if (data.rewardBoosterNFT) addresses.rewardBoosterNFT = data.rewardBoosterNFT;

        console.log("✅ Addresses loaded:", addresses);
        return true;
    } catch (error) {
        console.error("❌ Failed to load addresses:", error);
        return false;
    }
}

// ============================================================================
// 2. DADOS DOS TIERS (IPFS)
// ============================================================================
// Nota: 'img' aponta para metadata (json), 'realImg' aponta para a pasta da imagem.
// O PresalePage.js vai adicionar o nome do arquivo (ex: diamond_booster.png) automaticamente.

export const boosterTiers = [
    { name: "Diamond", boostBips: 7000, color: "text-cyan-400", img: `${ipfsGateway}bafybeicgip72jcqgsirlrhn3tq5cc226vmko6etnndzl6nlhqrktfikafq/diamond_booster.json`, realImg: `${ipfsGateway}bafybeicgip72jcqgsirlrhn3tq5cc226vmko6etnndzl6nlhqrktfikafq`, borderColor: "border-cyan-400/50", glowColor: "bg-cyan-500/10" },
    { name: "Platinum", boostBips: 6000, color: "text-gray-300", img: `${ipfsGateway}bafybeigc2wgkccckhnjotejve7qyxa2o2z4fsgswfmsxyrbp5ncpc7plei/platinum_booster.json`, realImg: `${ipfsGateway}bafybeigc2wgkccckhnjotejve7qyxa2o2z4fsgswfmsxyrbp5ncpc7plei`, borderColor: "border-gray-300/50", glowColor: "bg-gray-400/10" },
    { name: "Gold", boostBips: 5000, color: "text-amber-400", img: `${ipfsGateway}bafybeifponccrbicg2pcjrn2hrfoqgc77xhm2r4ld7hdpw6cxxkbsckf44/gold_booster.json`, realImg: `${ipfsGateway}bafybeifponccrbicg2pcjrn2hrfoqgc77xhm2r4ld7hdpw6cxxkbsckf44`, borderColor: "border-amber-400/50", glowColor: "bg-amber-500/10" },
    { name: "Silver", boostBips: 4000, color: "text-gray-400", img: `${ipfsGateway}bafybeihvi2inujm5zpi7tl667g4srq273536pjkglwyrtbwmgnskmu7jg4/silver_booster.json`, realImg: `${ipfsGateway}bafybeihvi2inujm5zpi7tl667g4srq273536pjkglwyrtbwmgnskmu7jg4`, borderColor: "border-gray-400/50", glowColor: "bg-gray-500/10" },
    { name: "Bronze", boostBips: 3000, color: "text-yellow-600", img: `${ipfsGateway}bafybeiclqidb67rt3tchhjpsib62s624li7j2bpxnr6b5w5mfp4tomhu7m/bronze_booster.json`, realImg: `${ipfsGateway}bafybeiclqidb67rt3tchhjpsib62s624li7j2bpxnr6b5w5mfp4tomhu7m`, borderColor: "border-yellow-600/50", glowColor: "bg-yellow-600/10" },
    { name: "Iron", boostBips: 2000, color: "text-slate-500", img: `${ipfsGateway}bafybeiaxhv3ere2hyto4dlb5xqn46ehfglxqf3yzehpy4tvdnifyzpp4wu/iron_booster.json`, realImg: `${ipfsGateway}bafybeiaxhv3ere2hyto4dlb5xqn46ehfglxqf3yzehpy4tvdnifyzpp4wu`, borderColor: "border-slate-500/50", glowColor: "bg-slate-600/10" },
    { name: "Crystal", boostBips: 1000, color: "text-indigo-300", img: `${ipfsGateway}bafybeib6nacggrhgcp72xksbhsqcofg3lzhfb576kuebj5ioxpk2id5m7u/crystal_booster.json`, realImg: `${ipfsGateway}bafybeib6nacggrhgcp72xksbhsqcofg3lzhfb576kuebj5ioxpk2id5m7u`, borderColor: "border-indigo-300/50", glowColor: "bg-indigo-300/10" }
];

// ============================================================================
// 3. ABIs
// ============================================================================

export const publicSaleABI = [
    "function tiers(uint256) view returns (uint256 priceInWei, uint64 maxSupply, uint64 mintedCount, uint16 boostBips, bool isConfigured)",
    "function buyMultipleNFTs(uint256 _tierId, uint256 _quantity) payable",
    "function buyNFT(uint256 _tierId) payable"
];

// Placeholders
export const bkcTokenABI = ["function balanceOf(address) view returns (uint256)"];
export const rewardBoosterABI = ["function ownerOf(uint256) view returns (address)"];
export const delegationManagerABI = [];
export const rentalManagerABI = [];
export const actionsManagerABI = [];
export const decentralizedNotaryABI = [];
export const ecosystemManagerABI = [];
export const faucetABI = [];
export const nftPoolABI = [];