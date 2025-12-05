// hardhat.config.cts
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades"; 
import "dotenv/config";
import "@nomicfoundation/hardhat-verify";

// --- CONFIGURAÇÃO DE CHAVES ---

// 1. Chave Alchemy (Prioridade para .env, fallback para a chave fornecida)
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "OXcpAI1M17gLgjZJJ8VC3";

// 2. Chave Privada (Necessária para assinar transações)
// Certifique-se de que sua conta tem saldo (ETH) na rede que vai usar.
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

// 3. Chave da Arbiscan (Para verificar o código fonte na blockchain)
const ARBISCAN_API_KEY = process.env.ARBISCAN_API_KEY || ""; 

if (!PRIVATE_KEY) {
  console.warn("⚠️ AVISO: PRIVATE_KEY não encontrada no arquivo .env. O deploy irá falhar se tentar executar.");
}

const config: HardhatUserConfig = {
  // Configurações do Compilador Solidity
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // Otimização padrão para contratos médios/grandes
      },
      viaIR: true, // CRÍTICO: Necessário para evitar erro "Stack too deep" no EcosystemManager
    },
  },

  // Configuração das Redes
  networks: {
    hardhat: {
      chainId: 31337,
    },
    
    // 🟢 TESTNET: Arbitrum Sepolia (Chain ID: 421614)
    arbitrumSepolia: {
      url: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 421614,
    },

    // 🔴 MAINNET: Arbitrum One (Chain ID: 42161)
    arbitrumOne: {
      url: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 42161,
    },
  },

  // Configuração para Verificação (npx hardhat verify)
  etherscan: {
    apiKey: {
      arbitrumOne: ARBISCAN_API_KEY,
      arbitrumSepolia: ARBISCAN_API_KEY,
    },
    // Configurações personalizadas para garantir que o Hardhat encontre a API da Arbitrum
    customChains: [
      {
        network: "arbitrumOne",
        chainId: 42161,
        urls: {
          apiURL: "https://api.arbiscan.io/api",
          browserURL: "https://arbiscan.io/",
        },
      },
      {
        network: "arbitrumSepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api-sepolia.arbiscan.io/api",
          browserURL: "https://sepolia.arbiscan.io/",
        },
      },
    ],
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  
  sourcify: {
    enabled: true
  }
};

export default config;