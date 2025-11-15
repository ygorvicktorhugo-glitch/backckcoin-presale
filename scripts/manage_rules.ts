// scripts/manage_rules.ts
import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";

// ######################################################################
// ###               PAINEL DE CONTROLE DE REGRAS                     ###
// ######################################################################

// Helper function for delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DESCRIPTION_KEYS = ["DESCRIPTION", "COMMENT"]; // Chaves a ignorar

/**
 * Função auxiliar robusta para processar cada categoria de regra.
 * Garante que apenas chaves válidas sejam passadas para o contrato.
 */
async function processRuleCategory(
    hub: any, 
    rules: any, 
    setter: (key: string | bigint, value: bigint) => Promise<any>, 
    converter: (value: string) => bigint,
    description: string,
    isBoosterDiscount: boolean = false
) {
    for (const ruleKey of Object.keys(rules)) {
        // Ignora chaves de comentário (case-insensitive)
        if (DESCRIPTION_KEYS.includes(ruleKey.toUpperCase())) continue;

        const valueStr = rules[ruleKey];
        if (valueStr && valueStr.trim() !== "") {
            try {
                // Para descontos de booster, a chave também é um BigInt (o boostBips)
                const keyForContract = isBoosterDiscount ? converter(ruleKey) : ruleKey;
                const valueBigInt = converter(valueStr);
                
                console.log(`   -> ATUALIZANDO ${description} [${ruleKey}] para ${valueStr}...`);
                
                // Chamada da função setter
                const tx = await setter(keyForContract, valueBigInt);
                await tx.wait();
                
                console.log("   ✅ SUCESSO.");
                await sleep(1000);
            } catch (e: any) {
                 console.error(`   ❌ ERRO ao aplicar regra [${ruleKey}]: ${e.message}`);
                 // Lançamos o erro para parar a execução e notificar
                 throw new Error(`Falha na atualização da regra ${ruleKey}: ${e.message}`);
            }
        }
    }
}

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

  // --- 3. Carregar Regras do JSON ---
  const rulesConfigPath = path.join(__dirname, "../rules-config.json"); 
  if (!fs.existsSync(rulesConfigPath)) {
    throw new Error("Arquivo 'rules-config.json' não encontrado na raiz do projeto.");
  }
  const RULES_TO_APPLY = JSON.parse(fs.readFileSync(rulesConfigPath, "utf8"));
  console.log("Arquivo 'rules-config.json' carregado.");


  try {
    // --- 4. Processar Atualizações ---
    console.log("\nIniciando verificação de regras para aplicar...");

    // Conversores de valor (para garantir que a tipagem esteja correta)
    const weiConverter = (value: string) => {
        if (!/^\d+(\.\d+)?$/.test(value) && value !== "0") {
            throw new Error(`Valor não numérico ('${value}') para conversão Wei.`);
        }
        return ethers.parseUnits(value, 18);
    };
    const bigIntConverter = (value: string) => BigInt(value);
    
    // A. Taxas de Serviço (Valor em Wei) - Chama setServiceFee no contrato [cite: 83]
    await processRuleCategory(hub, RULES_TO_APPLY.serviceFees, hub.setServiceFee, weiConverter, "Taxa de Serviço (BKC)");

    // B. pStake Mínimo (Valor BigInt) - Chama setPStakeMinimum no contrato [cite: 84]
    await processRuleCategory(hub, RULES_TO_APPLY.pStakeMinimums, hub.setPStakeMinimum, bigIntConverter, "pStake Mínimo");

    // C. Taxas de Staking (Valor em BIPS) - Chama setServiceFee [cite: 83]
    await processRuleCategory(hub, RULES_TO_APPLY.stakingFees, hub.setServiceFee, bigIntConverter, "Taxa de Staking (BIPS)");
    
    // D. Impostos do AMM (Valor em BIPS) - Chama setServiceFee [cite: 83]
    await processRuleCategory(hub, RULES_TO_APPLY.ammTaxFees, hub.setServiceFee, bigIntConverter, "Imposto do AMM (BIPS)");

    // E. Descontos de Booster (Chave e Valor em BIPS) - Chama setBoosterDiscount [cite: 85]
    await processRuleCategory(hub, RULES_TO_APPLY.boosterDiscounts, hub.setBoosterDiscount, bigIntConverter, "Desconto de Booster (BIPS)", true);

    // F. Distribuição da Mineração (Valor em BIPS) - Chama setMiningDistributionBips [cite: 86]
    await processRuleCategory(hub, RULES_TO_APPLY.miningDistribution, hub.setMiningDistributionBips, bigIntConverter, "Distribuição de Mineração (BIPS)");

    // G. Bônus de Mineração (Valor em BIPS) - Chama setMiningBonusBips [cite: 87]
    await processRuleCategory(hub, RULES_TO_APPLY.miningBonuses, hub.setMiningBonusBips, bigIntConverter, "Bônus de Mineração (BIPS)");


    console.log("\n----------------------------------------------------");
    console.log("🎉🎉🎉 ATUALIZAÇÃO DE REGRAS CONCLUÍDA! 🎉🎉🎉");
  
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