// scripts/5_create_pools.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";

// --- ESM FIX REMOVED (fileURLToPath) ---

// --- ⚙️ CONFIGURATION ---
// This list MUST match the immutable discounts
// defined in EcosystemManager.
const TIERS_TO_CREATE = [
  { name: "Diamond", boostBips: 5000 },
  { name: "Platinum", boostBips: 4000 },
  { name: "Gold", boostBips: 3000 },
  { name: "Silver", boostBips: 2000 },
  { name: "Bronze", boostBips: 1000 },
  { name: "Iron", boostBips: 500 },
  { name: "Crystal", boostBips: 100 },
];
// ------------------------

// THE MAIN FUNCTION IS NOW EXPORTED
export async function runScript(hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;

  console.log(`🚀 (Step 5/8) Creating NFT AMM Pool structures (for NFTs) on network: ${networkName}`);
  console.log(`Using account: ${deployer.address}`);
  console.log("----------------------------------------------------");

  // --- 1. Load Address ---
  // __dirname now works natively (CommonJS)
  const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");
  if (!fs.existsSync(addressesFilePath)) {
    console.error("❌ Error: 'deployment-addresses.json' not found. Did Step 1 fail?");
    throw new Error("Missing deployment-addresses.json");
  }
  const addresses: { [key: string]: string } = JSON.parse(fs.readFileSync(addressesFilePath, "utf8"));
  
  const poolAddress = addresses.nftLiquidityPool;
  if (!poolAddress) {
    console.error("❌ Error: 'nftLiquidityPool' address not found in deployment-addresses.json.");
    throw new Error("Missing nftLiquidityPool address.");
  }

  // --- 2. Get Contract Instance ---
  const nftLiquidityPool = await ethers.getContractAt(
    "NFTLiquidityPool",
    poolAddress,
    deployer
  );

  // --- 3. Create Pools ---
  console.log("Creating 7 empty pool structures for the NFT AMM...");
  let createdCount = 0;
  let skippedCount = 0;

  for (const tier of TIERS_TO_CREATE) {
    console.log(`\n -> Processing pool: ${tier.name} (BoostBips: ${tier.boostBips})`);
    
    try {
      // =================================================================
      // ### FIX ###
      // We must call the new `getPoolInfo` function
      // instead of the old public getter `pools`.
      const poolInfo = await nftLiquidityPool.getPoolInfo(tier.boostBips);
      // poolInfo is an object with named properties: [tokenBalance, nftCount, k, isInitialized]
      
      if (poolInfo.isInitialized) {
      // =================================================================
        console.log(`   ⚠️ SKIPPED: Pool for ${tier.name} is already initialized.`);
        skippedCount++;
        continue;
      }

      // If not initialized, create it
      const tx = await nftLiquidityPool.createPool(tier.boostBips);
      await tx.wait();
      console.log(`   ✅ SUCCESS: Pool structure for ${tier.name} created.`);
      createdCount++;

    } catch (error: any) {
      console.error(`   ❌ FAILED to create pool for ${tier.name}. Reason: ${error.reason || error.message}`);
      throw error; // Stop the script if one fails
    }
  }

  console.log("----------------------------------------------------");
  console.log("\n🎉 NFT AMM Pool creation process complete!");
  console.log(`   Total pools created: ${createdCount}`);
  console.log(`   Total skipped (already exist): ${skippedCount}`);
  console.log("\nNext step: Run '6_setup_sale.ts'");
}