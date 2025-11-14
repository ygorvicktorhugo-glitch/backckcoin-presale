// scripts/3_verify_contracts.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";
import { ethers } from "ethers";

// Helper function for delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tenta verificar um contrato no Etherscan (ou similar).
 */
async function attemptVerification(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  contractAddress: string,
  constructorArguments: any[],
  contractPath?: string
) {
  try {
    console.log(`   -> Verificando ${contractName} em ${contractAddress}...`);
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: constructorArguments,
      ...(contractPath && { contract: contractPath }), // Caminho opcional
    });
    console.log("   ✅ Verificado com sucesso!");
  } catch (error: any) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log("   ⚠️  Contrato já verificado.");
    } else {
      console.error(`   ❌ FALHA na verificação (${contractName}): ${error.message}`);
    }
  }
  await sleep(5000); // Pausa de 5 segundos para não sobrecarregar a API
}

export async function runScript(hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;

  console.log(`🚀 (FASE 3) Iniciando verificação de contratos na rede: ${networkName}`);
  console.log(`Usando a conta: ${deployer.address}`);
  console.log("----------------------------------------------------");

  if (networkName === "localhost" || networkName === "hardhat") {
    console.log("⚠️  Verificação pulada. Só é possível verificar em redes públicas.");
    return;
  }

  // --- 1. Carregar Endereços ---
  const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");
  if (!fs.existsSync(addressesFilePath)) {
    throw new Error("Missing deployment-addresses.json");
  }
  const addresses: { [key: string]: string } = JSON.parse(
    fs.readFileSync(addressesFilePath, "utf8")
  );

  // --- 2. Verificar Contratos UUPS (Proxies) ---
  // ✅ CORREÇÃO: Os argumentos do construtor (constructorArguments) para
  // contratos UUPS/Initializable são '[]' (vazios), pois eles usam
  // a função 'initialize' em vez de um 'constructor' para definir o estado.
  
  console.log("=== Verificando Contratos UUPS (Proxies) ===");

  await attemptVerification(
    hre, "EcosystemManager", addresses.ecosystemManager, 
    [], // <-- CORRIGIDO
    "contracts/EcosystemManager.sol:EcosystemManager"
  );
  await attemptVerification(
    hre, "MiningManager", addresses.miningManager, 
    [], // <-- CORRIGIDO
    "contracts/MiningManager.sol:MiningManager"
  );
  await attemptVerification(
    hre, "DelegationManager", addresses.delegationManager, 
    [], // <-- CORRIGIDO
    "contracts/DelegationManager.sol:DelegationManager"
  );
  await attemptVerification(
    hre, "RewardManager", addresses.rewardManager, 
    [], // <-- CORRIGIDO
    "contracts/RewardManager.sol:RewardManager"
  );
  await attemptVerification(
    hre, "DecentralizedNotary", addresses.decentralizedNotary, 
    [], // <-- CORRIGIDO
    "contracts/DecentralizedNotary.sol:DecentralizedNotary"
  );
  
  // ✅ CORREÇÃO: Caminho do contrato atualizado para FortunePoolV3
  await attemptVerification(
    hre, "FortunePoolV3", addresses.fortunePool, 
    [], // <-- CORRIGIDO
    "contracts/FortunePoolV3.sol:FortunePoolV3" // <-- CORRIGIDO
  );
  
  await attemptVerification(
    hre, "NFTLiquidityPool", addresses.nftLiquidityPool, 
    [], // <-- CORRIGIDO
    "contracts/NFTLiquidityPool.sol:NFTLiquidityPool"
  );

  // --- 3. Verificar Contratos Normais (Standard) ---
  
  console.log("\n=== Verificando Contratos Normais (Standard) ===");

  // BKCToken
  await attemptVerification(
    hre, "BKCToken", addresses.bkcToken,
    [], // <-- CORRIGIDO
    "contracts/BKCToken.sol:BKCToken"
  );

  // RewardBoosterNFT
  await attemptVerification(
    hre, "RewardBoosterNFT", addresses.rewardBoosterNFT,
    [], // <-- CORRIGIDO
    "contracts/RewardBoosterNFT.sol:RewardBoosterNFT"
  );

  // PublicSale
  await attemptVerification(
    hre, "PublicSale", addresses.publicSale,
    [], // <-- CORRIGIDO
    "contracts/PublicSale.sol:PublicSale"
  );

  console.log("\n🎉🎉🎉 VERIFICAÇÃO DE CONTRATOS CONCLUÍDA! 🎉🎉🎉");
}

// Bloco de entrada para execução standalone
if (require.main === module) {
  runScript(require("hardhat")).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}