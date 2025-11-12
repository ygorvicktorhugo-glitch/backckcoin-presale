// scripts/4_manage_rules.ts
import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";

// ######################################################################
// ###               PAINEL DE CONTROLE DE REGRAS                     ###
// ######################################################################
/*
 * Este script agora lê suas regras do arquivo 'rules-config.json'
 * localizado na raiz do seu projeto.
 *
 * COMO USAR:
 * 1. Abra 'rules-config.json'
 * 2. Preencha os valores (como strings) que você deseja alterar.
 * Ex: "NOTARY_SERVICE": "150"
 * 3. Deixe todos os outros campos como "" (string vazia).
 * 4. Rode este script.
 */
// ######################################################################

// Helper function for delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runScript(hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;

  console.log(
    `🚀 (GERENCIAMENTO) Executando script de atualização de regras na rede: ${networkName}`
  );
  console.log(`Usando a conta (Owner/MultiSig): ${deployer.address}`);
  console.log("----------------------------------------------------");

  // --- 1. Carregar Endereço do Cérebro ---
  const addressesFilePath = path.join(
    __dirname,
    "../deployment-addresses.json"
  );
  if (!fs.existsSync(addressesFilePath)) {
    throw new Error("Missing deployment-addresses.json");
  }
  const addresses: { [key: string]: string } = JSON.parse(
    fs.readFileSync(addressesFilePath, "utf8")
  );

  const hubAddress = addresses.ecosystemManager;
  if (!hubAddress) {
    throw new Error("EcosystemManager address not found in JSON.");
  }

  // --- 2. Obter Instância do Cérebro (Hub) ---
  const hub = await ethers.getContractAt(
    "EcosystemManager",
    hubAddress,
    deployer
  );
  console.log(`Conectado ao Cérebro (EcosystemManager) em: ${hubAddress}`);

  // --- 3. ✅ NOVO: Carregar Regras do JSON ---
  const rulesConfigPath = path.join(__dirname, "../rules-config.json"); // Caminho para a raiz
  if (!fs.existsSync(rulesConfigPath)) {
    throw new Error("Arquivo 'rules-config.json' não encontrado na raiz do projeto.");
  }
  const RULES_TO_APPLY = JSON.parse(fs.readFileSync(rulesConfigPath, "utf8"));
  console.log("Arquivo 'rules-config.json' carregado.");


  try {
    // --- 4. Processar Atualizações ---
    console.log("\nIniciando verificação de regras para aplicar...");

    // A. Atualizar Taxas de Serviço (requer parseUnits)
    for (const key of Object.keys(RULES_TO_APPLY.serviceFees)) {
      if (key === "COMMENT") continue;
      const valueStr = (RULES_TO_APPLY.serviceFees as any)[key];
      
      // Só executa se o valor não for uma string vazia
      if (valueStr && valueStr.trim() !== "") {
        console.log(`   -> ATUALIZANDO Taxa de Serviço [${key}] para ${valueStr} BKC...`);
        const valueWei = ethers.parseUnits(valueStr, 18); // Converte string para Wei
        const tx = await hub.setFee(key, valueWei);
        await tx.wait();
        console.log("   ✅ SUCESSO.");
        await sleep(1000);
      }
    }

    // B. Atualizar pStake Mínimo (requer BigInt)
    for (const key of Object.keys(RULES_TO_APPLY.pStakeMinimums)) {
      if (key === "COMMENT") continue;
      const valueStr = (RULES_TO_APPLY.pStakeMinimums as any)[key];
      
      if (valueStr && valueStr.trim() !== "") {
        console.log(`   -> ATUALIZANDO pStake Mínimo [${key}] para ${valueStr}...`);
        const valueBigInt = BigInt(valueStr); // Converte string para BigInt
        const tx = await hub.setPStakeMinimum(key, valueBigInt);
        await tx.wait();
        console.log("   ✅ SUCESSO.");
        await sleep(1000);
      }
    }

    // C. Atualizar Taxas de Staking (usa setFee, requer BigInt)
    for (const key of Object.keys(RULES_TO_APPLY.stakingFees)) {
      if (key === "COMMENT") continue;
      const valueStr = (RULES_TO_APPLY.stakingFees as any)[key];
      
      if (valueStr && valueStr.trim() !== "") {
        console.log(`   -> ATUALIZANDO Taxa de Staking [${key}] para ${valueStr} BIPS...`);
        const valueBigInt = BigInt(valueStr);
        const tx = await hub.setFee(key, valueBigInt);
        await tx.wait();
        console.log("   ✅ SUCESSO.");
        await sleep(1000);
      }
    }
    
    // D. Atualizar Impostos do AMM (usa setFee, requer BigInt)
    for (const key of Object.keys(RULES_TO_APPLY.ammTaxFees)) {
      if (key === "COMMENT") continue;
      const valueStr = (RULES_TO_APPLY.ammTaxFees as any)[key];
      
      if (valueStr && valueStr.trim() !== "") {
        console.log(`   -> ATUALIZANDO Imposto do AMM [${key}] para ${valueStr} BIPS...`);
        const valueBigInt = BigInt(valueStr);
        const tx = await hub.setFee(key, valueBigInt);
        await tx.wait();
        console.log("   ✅ SUCESSO.");
        await sleep(1000);
      }
    }

    // E. Atualizar Descontos de Booster
    for (const key of Object.keys(RULES_TO_APPLY.boosterDiscounts)) {
      if (key === "COMMENT") continue;
      const valueStr = (RULES_TO_APPLY.boosterDiscounts as any)[key];
      
      if (valueStr && valueStr.trim() !== "") {
        console.log(`   -> ATUALIZANDO Desconto de Booster [${key} Bips] para ${valueStr} BIPS...`);
        const keyBigInt = BigInt(key);
        const valueBigInt = BigInt(valueStr);
        const tx = await hub.setBoosterDiscount(keyBigInt, valueBigInt);
        await tx.wait();
        console.log("   ✅ SUCESSO.");
        await sleep(1000);
      }
    }

    // F. Atualizar Distribuição da Mineração
    for (const key of Object.keys(RULES_TO_APPLY.miningDistribution)) {
      if (key === "COMMENT") continue;
      const valueStr = (RULES_TO_APPLY.miningDistribution as any)[key];
      
      if (valueStr && valueStr.trim() !== "") {
        console.log(`   -> ATUALIZANDO Distribuição de Mineração [${key}] para ${valueStr} BIPS...`);
        const valueBigInt = BigInt(valueStr);
        const tx = await hub.setMiningDistributionBips(key, valueBigInt);
        await tx.wait();
        console.log("   ✅ SUCESSO.");
        await sleep(1000);
      }
    }

    // G. Atualizar Bônus de Mineração
    for (const key of Object.keys(RULES_TO_APPLY.miningBonuses)) {
      if (key === "COMMENT") continue;
      const valueStr = (RULES_TO_APPLY.miningBonuses as any)[key];
      
      if (valueStr && valueStr.trim() !== "") {
        console.log(`   -> ATUALIZANDO Bônus de Mineração [${key}] para ${valueStr} BIPS...`);
        const valueBigInt = BigInt(valueStr);
        const tx = await hub.setMiningBonusBips(key, valueBigInt);
        await tx.wait();
        console.log("   ✅ SUCESSO.");
        await sleep(1000);
      }
    }

    console.log("\n----------------------------------------------------");
    console.log("🎉🎉🎉 ATUALIZAÇÃO DE REGRAS CONCLUÍDA! 🎉🎉🎉");
    console.log("Todas as alterações solicitadas do 'rules-config.json' foram aplicadas no Cérebro (EcosystemManager).");
  
  } catch (error: any) {
    console.error(
      "\n❌ Falha grave durante a atualização de regras:",
      error.message
    );
    process.exit(1);
  }
}

// Bloco de entrada para execução standalone
if (require.main === module) {
  runScript(require("hardhat")).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}