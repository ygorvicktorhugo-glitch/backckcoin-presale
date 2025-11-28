// scripts/manage_rules.ts
import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";

// ######################################################################
// ###               RULES CONTROL PANEL SCRIPT (FINAL)             ###
// ######################################################################

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DESCRIPTION_KEYS = ["DESCRIPTION", "COMMENT"];

/**
 * Robust helper function to process each rule category.
 */
async function processRuleCategory(
    hub: any, 
    rules: any, 
    setter: (key: string | bigint, value: bigint) => Promise<any>, 
    converter: (value: string) => bigint,
    description: string,
    isBoosterDiscount: boolean = false
) {
    if (!rules) {
        console.log(`   -> Skipping category ${description} (not found in rules-config.json)`);
        return;
    }
    
    for (const ruleKey of Object.keys(rules)) {
        if (DESCRIPTION_KEYS.includes(ruleKey.toUpperCase())) continue;

        const valueStr = rules[ruleKey];
        if (valueStr && valueStr.trim() !== "") {
            try {
                const valueBigInt = converter(valueStr);
                
                let finalKey: string | bigint;
                
                if (isBoosterDiscount) {
                    // Chave Numérica Direta
                    finalKey = converter(ruleKey); 
                } else {
                    // Chave String -> Hash keccak256
                    finalKey = ethers.id(ruleKey); 
                }
                
                console.log(`   -> UPDATING ${description} [${ruleKey}] to ${valueStr}...`);
                
                const tx = await setter(finalKey, valueBigInt);
                await tx.wait();
                
                console.log("   ✅ SUCCESS.");
                await sleep(500); // Pequeno delay para evitar rate limit
            } catch (e: any) {
                 console.error(`   ❌ ERROR applying rule [${ruleKey}]: ${e.message}`);
                 throw new Error(`Failed on rule update ${ruleKey}: ${e.message}`);
            }
        }
    }
}

export async function runScript(hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;

  console.log(
    `🚀 (MANAGEMENT) Running ecosystem rules update script on network: ${networkName}`
  );
  console.log(`Using account: ${deployer.address}`);
  console.log("----------------------------------------------------");

  // --- 1. Load Address ---
  const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");
  if (!fs.existsSync(addressesFilePath)) throw new Error("Missing deployment-addresses.json");
  
  const addresses = JSON.parse(fs.readFileSync(addressesFilePath, "utf8"));
  const hubAddress = addresses.ecosystemManager;
  if (!hubAddress) throw new Error("EcosystemManager address not found in JSON.");

  // --- 2. Get Hub Instance ---
  const hub = await ethers.getContractAt("EcosystemManager", hubAddress, deployer);
  console.log(`Connected to Hub at: ${hubAddress}`);

  // --- 3. Load Rules ---
  const rulesConfigPath = path.join(__dirname, "../rules-config.json"); 
  if (!fs.existsSync(rulesConfigPath)) throw new Error("rules-config.json not found.");
  
  const RULES_TO_APPLY = JSON.parse(fs.readFileSync(rulesConfigPath, "utf8"));
  console.log("'rules-config.json' loaded.");

  try {
    console.log("\nInitiating rule verification and application...");

    // --- CONVERSORES ---
    // Para valores monetários em BKC (Ex: Taxas de serviço) -> 1 BKC = 1 * 10^18 Wei
    const weiConverter = (value: string) => ethers.parseUnits(value, 18);
    
    // Para números inteiros puros (Ex: pStake, BIPS) -> 10000 = 10000n
    const bigIntConverter = (value: string) => BigInt(value);
    
    // --- EXECUÇÃO ---

    // A. Service Fees (Em WEI)
    await processRuleCategory(
        hub, 
        RULES_TO_APPLY.serviceFees, 
        (k, v) => hub.setServiceFee(k, v), 
        weiConverter, // <--- Usa WEI
        "Service Fee (BKC)"
    );

    // B. pStake Minimum (Em INTEIRO)
    await processRuleCategory(
        hub, 
        RULES_TO_APPLY.pStakeMinimums, 
        (k, v) => hub.setPStakeMinimum(k, v), 
        bigIntConverter, // <--- Usa INTEIRO (Correção aplicada)
        "pStake Minimum"
    );

    // C. Staking Fees (BIPS)
    await processRuleCategory(
        hub, 
        RULES_TO_APPLY.stakingFees, 
        (k, v) => hub.setServiceFee(k, v), 
        bigIntConverter, 
        "Staking Fee (BIPS)"
    );
    
    // D. AMM Tax Fees (BIPS)
    await processRuleCategory(
        hub, 
        RULES_TO_APPLY.ammTaxFees, 
        (k, v) => hub.setServiceFee(k, v), 
        bigIntConverter, 
        "AMM Tax (BIPS)"
    );

    // E. Booster Discounts (BIPS - Chave numérica)
    await processRuleCategory(
        hub, 
        RULES_TO_APPLY.boosterDiscounts, 
        (k, v) => hub.setBoosterDiscount(k, v), 
        bigIntConverter, 
        "Booster Discount (BIPS)", 
        true
    );

    // F. Mining Distribution (BIPS)
    await processRuleCategory(
        hub, 
        RULES_TO_APPLY.miningDistribution, 
        (k, v) => hub.setMiningDistributionBips(k, v), 
        bigIntConverter, 
        "Mining Distribution (BIPS)"
    );

    // G. Fee Distribution (BIPS)
    await processRuleCategory(
        hub, 
        RULES_TO_APPLY.feeDistribution, 
        (k, v) => hub.setFeeDistributionBips(k, v), 
        bigIntConverter, 
        "Fee Distribution (BIPS)"
    );

    console.log("\n----------------------------------------------------");
    console.log("🎉🎉🎉 RULES UPDATE SCRIPT COMPLETE! 🎉🎉🎉");
  
  } catch (error: any) {
    console.error("\n❌ Critical failure:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runScript(require("hardhat")).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}