// scripts/1_deploy_core.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";

// --- ESM FIX REMOVED ---

// Helper function for delays between deployments
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DEPLOY_DELAY_MS = 2000; // 2-second delay

// THE MAIN FUNCTION IS NOW EXPORTED
export async function runScript(hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;

  console.log(`🚀 (Step 1/8) Deploying Core Contracts on network: ${networkName}`);
  console.log(`Using account: ${deployer.address}`);
  console.log("----------------------------------------------------");

  const addresses: { [key: string]: string } = {};

  // Ensure the addresses file is clean or exists
  // __dirname now now works natively (CommonJS)
  const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");
  
  // Lê o arquivo para preservar informações se ele já existir (melhor prática)
  if (fs.existsSync(addressesFilePath)) {
      try {
          Object.assign(addresses, JSON.parse(fs.readFileSync(addressesFilePath, "utf8")));
          console.log("⚠️ Existing deployment-addresses.json found. Will be updated.");
      } catch (e) {
          console.log("Existing deployment-addresses.json is invalid. Creating a new one.");
          fs.writeFileSync(addressesFilePath, JSON.stringify({}, null, 2));
      }
  } else {
      fs.writeFileSync(addressesFilePath, JSON.stringify({}, null, 2));
  }


  try {
    // --- 1. Deploy EcosystemManager (The Hub) ---
    console.log("1. Deploying EcosystemManager (Hub)...");
    const ecosystemManager = await ethers.deployContract("EcosystemManager", [
      deployer.address,
    ]);
    await ecosystemManager.waitForDeployment();
    addresses.ecosystemManager = ecosystemManager.target as string;
    console.log(`✅ EcosystemManager deployed to: ${addresses.ecosystemManager}`);
    console.log("----------------------------------------------------");
    await sleep(DEPLOY_DELAY_MS);

    // --- 2. Deploy BKCToken ---
    console.log("2. Deploying BKCToken...");
    const bkcToken = await ethers.deployContract("BKCToken", [
      deployer.address,
    ]);
    await bkcToken.waitForDeployment();
    addresses.bkcToken = bkcToken.target as string;
    console.log(`✅ BKCToken deployed to: ${addresses.bkcToken}`);
    console.log("----------------------------------------------------");
    await sleep(DEPLOY_DELAY_MS);

    // --- 3. Deploy RewardBoosterNFT ---
    console.log("3. Deploying RewardBoosterNFT...");
    const rewardBoosterNFT = await ethers.deployContract("RewardBoosterNFT", [
      deployer.address,
    ]);
    await rewardBoosterNFT.waitForDeployment();
    addresses.rewardBoosterNFT = rewardBoosterNFT.target as string;
    console.log(`✅ RewardBoosterNFT deployed to: ${addresses.rewardBoosterNFT}`);
    console.log("----------------------------------------------------");
    await sleep(DEPLOY_DELAY_MS);

    // --- 4. Deploy DelegationManager ---
    console.log("4. Deploying DelegationManager...");
    const delegationManager = await ethers.deployContract("DelegationManager", [
      addresses.bkcToken,
      addresses.ecosystemManager,
      deployer.address,
    ]);
    await delegationManager.waitForDeployment();
    addresses.delegationManager = delegationManager.target as string;
    console.log(
      `✅ DelegationManager deployed to: ${addresses.delegationManager}`
    );
    console.log("----------------------------------------------------");
    await sleep(DEPLOY_DELAY_MS);

    // --- 5. Deploy RewardManager ---
    console.log("5. Deploying RewardManager...");
    const rewardManager = await ethers.deployContract("RewardManager", [
      addresses.bkcToken,
      deployer.address, // _treasuryWallet
      addresses.ecosystemManager,
      deployer.address, // _initialOwner
    ]);
    await rewardManager.waitForDeployment();
    addresses.rewardManager = rewardManager.target as string;
    console.log(`✅ RewardManager deployed to: ${addresses.rewardManager}`);
    console.log("----------------------------------------------------");
    await sleep(DEPLOY_DELAY_MS);

    // --- 6. Deploy DecentralizedNotary ---
    console.log("6. Deploying DecentralizedNotary...");
    const decentralizedNotary = await ethers.deployContract(
      "DecentralizedNotary",
      [addresses.bkcToken, addresses.ecosystemManager, deployer.address]
    );
    await decentralizedNotary.waitForDeployment();
    addresses.decentralizedNotary = decentralizedNotary.target as string;
    console.log(
      `✅ DecentralizedNotary deployed to: ${addresses.decentralizedNotary}`
    );
    console.log("----------------------------------------------------");
    await sleep(DEPLOY_DELAY_MS);

    // --- 7. Deploy PublicSale ---
    console.log("7. Deploying PublicSale...");
    const publicSale = await ethers.deployContract("PublicSale", [
      addresses.rewardBoosterNFT,
      addresses.ecosystemManager,
      deployer.address,
    ]);
    await publicSale.waitForDeployment();
    addresses.publicSale = publicSale.target as string;
    console.log(`✅ PublicSale deployed to: ${addresses.publicSale}`);
    console.log("----------------------------------------------------");
    await sleep(DEPLOY_DELAY_MS);
    
    // --- 8. Deploy SimpleBKCFaucet (Always redeployed) ---
    console.log("8. Deploying SimpleBKCFaucet...");
    const simpleBKCFaucet = await ethers.deployContract("SimpleBKCFaucet", [
        addresses.bkcToken, // <-- Passes the NEW bkcToken (from Step 2)
    ]);
    await simpleBKCFaucet.waitForDeployment();
    addresses.faucet = simpleBKCFaucet.target as string;
    console.log(`✅ SimpleBKCFaucet deployed to: ${addresses.faucet}`);
    console.log("----------------------------------------------------");
    await sleep(DEPLOY_DELAY_MS);


  } catch (error: any) {
    console.error("❌ Deployment Failed (Step 1):", error.message);
    throw error;
  }

  // =================================================================
  // ### BLOCO DE ENDEREÇO DA POOL DA DEX (INFORMAÇÃO SALVA) ###
  // Este campo armazena uma URL para funções de front-end (Comprar BKC)
  // =================================================================
  console.log("Adding/Updating DEX Swap Link (bkcDexPoolAddress)...");
  
  // Usando a URL solicitada
  addresses.bkcDexPoolAddress = "https://pancakeswap.finance/swap";
  
  console.log(`✅ DEX Link saved: ${addresses.bkcDexPoolAddress}`);
  console.log("----------------------------------------------------");
  // =================================================================

  // --- Saves addresses to file ---
  fs.writeFileSync(
    addressesFilePath,
    JSON.stringify(addresses, null, 2)
  );

  console.log("\n🎉🎉🎉 CORE CONTRACTS DEPLOYED SUCCESSFULLY! 🎉🎉🎉");
  console.log("\nNext step: Run '0_faucet_test_supply.ts'");
}

// Bloco de entrada para execução standalone
if (require.main === module) {
  runScript(require("hardhat")).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}