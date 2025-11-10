// scripts/7_configure_fees.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";
import { ethers } from "ethers";

// --- REMOVIDA A CORREÇÃO ESM (fileURLToPath) ---

// Helper function for delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const CONFIG_DELAY_MS = 1500; // 1.5-second delay

// ######################################################################
// ###               CONFIGURAÇÃO MANUAL DO JOGO E FUNDOS              ###
// ######################################################################

// ====================================================================
// =================== INÍCIO DA MODIFICAÇÃO (3 Pools, BIPS) ===================
// ====================================================================

// --- Modelo: 3 Pools, "Highest Prize Wins", "BIPS" ---
// --- Orçamento Total de Liquidez: 2.000.000 BKC ---
const LIQUIDITY_CONFIG = [
    // Pool 0: O Empate (1x) com 50% de chance.
    // Recebe a vasta maioria da liquidez (89.5%) como "colchão".
    { 
        poolId: 0, 
        multiplierBips: 10000, // 1x = 10000 BIPS
        chanceDenominator: 2, // 1 em 2 = 50% de chance
        bipsContribution: 9000, // Recebe 90% do financiamento (para manter o pool sempre cheio)
        amount: ethers.parseEther("1790000") // 1.79M BKC
    },
    // Pool 1: Jackpot 5x (Chance 5%)
    // Teto Megasena: 5.000 BKC (Cobre aposta de 1000)
    { 
        poolId: 1, 
        multiplierBips: 50000, // 5x = 50000 BIPS
        chanceDenominator: 20, // 1 em 20 = 5% de chance
        bipsContribution: 700, // Recebe 7% do financiamento
        amount: ethers.parseEther("10000") // 10K BKC
    },
    // Pool 2: Jackpot 100x (Chance 0.1%)
    // Teto Megasena: 100.000 BKC (Cobre aposta de 1000)
    { 
        poolId: 2, 
        multiplierBips: 1000000, // 100x = 1,000,000 BIPS
        chanceDenominator: 1000, // 1 em 1000 = 0.1% de chance
        bipsContribution: 300, // Recebe 3% do financiamento
        amount: ethers.parseEther("200000") // 200K BKC
    }
    // O Pool 3 não é definido. O contrato definirá activePoolCount = 3
];
// Total BIPS = 9000 + 700 + 300 = 10000 (100%)
// Total Liquidez = 1.79M + 10K + 200K = 2.000.000 BKC
const TOTAL_INITIAL_LIQUIDITY = LIQUIDITY_CONFIG.reduce((sum, pool) => sum + pool.amount, 0n);

// ==================================================================
// =================== FIM DA MODIFICAÇÃO ===========================
// ==================================================================


// --- CONFIGURAÇÃO DE SERVIÇOS (TAXAS) ---
const SERVICE_SETTINGS = {
  // --- DecentralizedNotary ---
  NOTARY_FEE: ethers.parseUnits("100", 18), // 100 BKC
  NOTARY_SERVICE_PSTAKE: 10000, // Requer 10,000 pStake

  // --- TIGER GAME SERVICE ---
  TIGER_GAME_SERVICE_FEE: 0, 
  TIGER_GAME_SERVICE_PSTAKE: 10000, // Requer 10,000 pStake

  // --- Taxas do DelegationManager ---
  UNSTAKE_FEE_BIPS: 100, // 1%
  FORCE_UNSTAKE_PENALTY_BIPS: 5000, // 50%
  
  // ======================================================
  // ### MODIFICAÇÃO DA TAXA DE CLAIM (AJUSTADA) ###
  // ======================================================
  CLAIM_REWARD_FEE_BIPS: 2000, // Antes era 50 (0.5%), agora é 2000 (20%)
  // ======================================================

  // --- NFTLiquidityPool ---
  NFT_POOL_ACCESS_PSTAKE: 10000, // Requer 10,000 pStake
  NFT_POOL_TAX_BIPS: 1000, // 10%
  NFT_POOL_TAX_TREASURY_SHARE_BIPS: 4000, // 40% da taxa
  NFT_POOL_TAX_DELEGATOR_SHARE_BIPS: 4000, // 40% da taxa
  NFT_POOL_TAX_LIQUIDITY_SHARE_BIPS: 2000, // 20% da taxa
};
// ######################################################################

// A FUNÇÃO PRINCIPAL É AGORA EXPORTADA
export async function runScript(hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;

  console.log(`🚀 (Passo 7/8) Configurando Game, Liquidez e Regras do Sistema na rede: ${networkName}`);
  console.log(`Usando a conta: ${deployer.address}`);
  console.log("----------------------------------------------------");

  // --- 1. Carregar Endereços ---
  // __dirname agora funciona nativamente (CommonJS)
  const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");
  if (!fs.existsSync(addressesFilePath)) {
    console.error("❌ Erro: 'deployment-addresses.json' não encontrado.");
    throw new Error("Missing deployment-addresses.json");
  }
  const addresses: { [key: string]: string } = JSON.parse(fs.readFileSync(addressesFilePath, "utf8"));

  if (!addresses.ecosystemManager || !addresses.fortuneTiger || !addresses.bkcToken) {
      console.error("❌ Erro: 'ecosystemManager', 'fortuneTiger', ou 'bkcToken' não encontrado.");
      throw new Error("Missing ecosystemManager, fortuneTiger, or bkcToken address in JSON.");
  }

  // --- 2. Obter Instâncias dos Contratos ---
  const ecosystemManager = await ethers.getContractAt(
    "EcosystemManager",
    addresses.ecosystemManager,
    deployer
  );
  const fortuneTiger = await ethers.getContractAt(
    "FortuneTiger",
    addresses.fortuneTiger,
    deployer
  );
  const bkcToken = await ethers.getContractAt(
    "BKCToken",
    addresses.bkcToken,
    deployer
  );


  try {
    // ##############################################################
    // --- PARTE A: CONFIGURAÇÃO E LIQUIDEZ DO TIGER GAME ---
    // ##############################################################
    console.log("\n--- Parte A: Configuração e Liquidez do Tiger Game ---");

    // 2a. Aprovando BKC para o FortuneTiger (para a liquidez inicial)
    console.log(`1. Aprovando ${ethers.formatEther(TOTAL_INITIAL_LIQUIDITY)} $BKC para o FortuneTiger...`);
    let tx = await bkcToken.approve(addresses.fortuneTiger, TOTAL_INITIAL_LIQUIDITY);
    await tx.wait();
    console.log("   ✅ Aprovação do BKC bem-sucedida.");

    // 2b. Configurando as Piscinas (Multiplicadores, Chances e Contribuição)
    console.log("\n2. Configurando as 3 piscinas de prêmios (Lógica 'Highest Prize Wins')...");
    
    // Garante que a ordem está correta para os IDs (0, 1, 2)
    const sortedConfig = LIQUIDITY_CONFIG.sort((a, b) => a.poolId - b.poolId);

    // [DEPOIS] Mapeia para os novos nomes de BIPS
    const multipliersBips = sortedConfig.map(c => c.multiplierBips);
    const denominators = sortedConfig.map(c => c.chanceDenominator);
    const bips = sortedConfig.map(c => c.bipsContribution);

    // [DEPOIS] Chama a função setPools com o array de BIPS
    tx = await fortuneTiger.setPools(multipliersBips, denominators, bips);
    await tx.wait();
    console.log(`   ✅ setPools (Regras de Sorteio e Contribuição) concluído. Pools ativas: ${multipliersBips.length}`);


    // 2c. Adicionando Liquidez Inicial Pool por Pool
    console.log(`\n3. Adicionando liquidez inicial às ${sortedConfig.length} piscinas...`);
    for (const pool of sortedConfig) { // Usa a config ordenada (agora com 3 pools)
        tx = await fortuneTiger.addInitialLiquidity(pool.poolId, pool.amount);
        await tx.wait();
        // [DEPOIS] Exibe o multiplicador em BIPS
        console.log(`   ✅ Pool x${pool.multiplierBips / 10000} (ID ${pool.poolId}) financiada com ${ethers.formatEther(pool.amount)} $BKC.`);
    }
    console.log(`   Total de liquidez adicionada: ${ethers.formatEther(TOTAL_INITIAL_LIQUIDITY)} $BKC.`);
    console.log("----------------------------------------------------");


    // ##############################################################
    // --- PARTE B: CONFIGURAÇÃO DE TAXAS DO HUB ---
    // ##############################################################
    console.log("\n--- Parte B: Configuração de Taxas do Hub (Regras Atualizadas) ---");
    console.log("Configurando todas as taxas do sistema e mínimos de pStake...");
    // (Esta seção permanece inalterada)

    // Notary
    await setService(
      ecosystemManager,
      "NOTARY_SERVICE",
      SERVICE_SETTINGS.NOTARY_FEE,
      SERVICE_SETTINGS.NOTARY_SERVICE_PSTAKE
    );

    // TIGER GAME SERVICE 
    await setService(
        ecosystemManager,
        "TIGER_GAME_SERVICE",
        SERVICE_SETTINGS.TIGER_GAME_SERVICE_FEE, 
        SERVICE_SETTINGS.TIGER_GAME_SERVICE_PSTAKE
    );
    
    // Taxas do DelegationManager
    await setFee(ecosystemManager, "UNSTAKE_FEE_BIPS", SERVICE_SETTINGS.UNSTAKE_FEE_BIPS);
    await setFee(ecosystemManager, "FORCE_UNSTAKE_PENALTY_BIPS", SERVICE_SETTINGS.FORCE_UNSTAKE_PENALTY_BIPS);
    await setFee(ecosystemManager, "CLAIM_REWARD_FEE_BIPS", SERVICE_SETTINGS.CLAIM_REWARD_FEE_BIPS);
    
    // NFTLiquidityPool
    await setService(
      ecosystemManager,
      "NFT_POOL_ACCESS",
      0, // Taxa de acesso é 0, apenas checa pStake
      SERVICE_SETTINGS.NFT_POOL_ACCESS_PSTAKE
    );
    await setFee(ecosystemManager, "NFT_POOL_TAX_BIPS", SERVICE_SETTINGS.NFT_POOL_TAX_BIPS);
    await setFee(ecosystemManager, "NFT_POOL_TAX_TREASURY_SHARE_BIPS", SERVICE_SETTINGS.NFT_POOL_TAX_TREASURY_SHARE_BIPS);
    await setFee(ecosystemManager, "NFT_POOL_TAX_DELEGATOR_SHARE_BIPS", SERVICE_SETTINGS.NFT_POOL_TAX_DELEGATOR_SHARE_BIPS);
    await setFee(ecosystemManager, "NFT_POOL_TAX_LIQUIDITY_SHARE_BIPS", SERVICE_SETTINGS.NFT_POOL_TAX_LIQUIDITY_SHARE_BIPS);

    console.log("\n✅ Todas as regras do sistema foram configuradas no Hub.");
    console.log("----------------------------------------------------");
    
  } catch (error: any) {
    console.error("❌ Falha na configuração das taxas (Passo 7):", error.message);
    throw error;
  }

  console.log("\n🎉🎉🎉 CONFIGURAÇÃO DO TIGER GAME E REGRAS CONCLUÍDA! 🎉🎉🎉");
  console.log("O sistema está pronto para a venda.");
  console.log("\nPróximo passo: Execute '8_add_liquidity.ts'");
}

// --- Funções Auxiliares (Não Modificadas) ---

async function setFee(manager: any, key: string, value: number | bigint) {
  try {
    // Usando getFunction para compatibilidade com ethers v6
    const tx = await manager.getFunction("setFee")(key, value);
    await tx.wait();
    console.log(`   -> Taxa definida: ${key} = ${value.toString()}`);
    await sleep(CONFIG_DELAY_MS / 2); 
  } catch (e: any) {
    throw e; 
  }
}

async function setPStake(manager: any, key: string, value: number) {
  try {
    // Usando getFunction para compatibilidade com ethers v6
    const tx = await manager.getFunction("setPStakeMinimum")(key, value);
    await tx.wait();
    console.log(`   -> pStake definido: ${key} = ${value}`);
    await sleep(CONFIG_DELAY_MS / 2);
  } catch (e: any) {
    throw e;
  }
}

// Simplificado: A chave de serviço agora é usada para taxa e pStake
async function setService(manager: any, serviceKey: string, feeValue: number | bigint, pStakeValue: number) {
    console.log(`\nConfigurando Serviço: ${serviceKey}...`);
    await setFee(manager, serviceKey, feeValue);
    await setPStake(manager, serviceKey, pStakeValue);
}

// ====================================================================
// =================== Bloco de execução standalone ==================
// ====================================================================
// (Bloco 'if (require.main === module)' mantido para execução individual)
if (require.main === module) {
  console.log("Executando 7_configure_fees.ts como script standalone...");
  // Importação dinâmica mantida, pois é CJS
  import("hardhat").then(hre => {
    runScript(hre)
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  });
}