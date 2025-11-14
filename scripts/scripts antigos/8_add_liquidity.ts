// scripts/8_add_liquidity.ts
// IMPORTANT: This script must be run *AFTER* the presale has ended.
//
// LOGIC: Mints "unsold" NFTs (95% - Sold) and adds them to the NFT AMM.

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { LogDescription, ContractTransactionReceipt, ethers, Log } from "ethers";
import fs from "fs";
import path from "path";

// --- ESM FIX REMOVED ---

// Helper function for delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Transaction wrapper with retries (full function)
async function sendTransactionWithRetries(
  txFunction: () => Promise<any>,
  retries = 3
): Promise<ContractTransactionReceipt> {
  for (let i = 0; i < retries; i++) {
    try {
      const tx = await txFunction();
      console.log(`   -> Transaction sent... awaiting confirmation...`);
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Transaction sent but a null receipt was returned.");
      }
      await sleep(1500);
      return receipt;
    } catch (error: any) {
      if (
        (error.message.includes("nonce") ||
          error.message.includes("in-flight") ||
          error.message.includes("underpriced")) &&
        i < retries - 1
      ) {
        const delay = (i + 1) * 5000;
        console.warn(
          `   ⚠️ Nonce issue detected. Retrying in ${delay / 1000} seconds...`
        );
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
  throw new Error("Transaction failed after multiple retries.");
}

// ######################################################################
// ###               CONFIGURE MANUALLY HERE (POST-SALE)              ###
// ######################################################################

// Your new rule: 2 Million BKC per AMM pool
const LIQUIDITY_BKC_AMOUNT_PER_POOL = ethers.parseEther("2000000"); // 2,000,000 BKC

// Definition of the 7 Tiers (must match 6_setup_sale.ts)
const ALL_TIERS = [
  { tierId: 0, name: "Diamond", boostBips: 5000, metadata: "diamond_booster.json" },
  { tierId: 1, name: "Platinum", boostBips: 4000, metadata: "platinum_booster.json" },
  { tierId: 2, name: "Gold", boostBips: 3000, metadata: "gold_booster.json" },
  { tierId: 3, name: "Silver", boostBips: 2000, metadata: "silver_booster.json" },
  { tierId: 4, name: "Bronze", boostBips: 1000, metadata: "bronze_booster.json" },
  { tierId: 5, name: "Iron", boostBips: 500, metadata: "iron_booster.json" },
  { tierId: 6, name: "Crystal", boostBips: 100, metadata: "crystal_booster.json" },
];

// Max NFTs to process per transaction
const CHUNK_SIZE = 150;
const CHUNK_SIZE_BIGINT = BigInt(CHUNK_SIZE);

// ######################################################################
// ###               DO NOT EDIT BELOW THIS LINE                     ###
// ######################################################################

// THE MAIN FUNCTION IS NOW EXPORTED
export async function runScript(hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  // --- Load Addresses ---
  // __dirname now works natively (CommonJS)
  const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");
  if (!fs.existsSync(addressesFilePath)) {
    console.error("❌ Error: 'deployment-addresses.json' not found. Has the master deploy (steps 1-7) been run?");
    throw new Error("Missing deployment-addresses.json");
  }
  const addresses: { [key: string]: string } = JSON.parse(fs.readFileSync(addressesFilePath, "utf8"));


  // --- Load Contracts ---
  const hub = await ethers.getContractAt(
    "EcosystemManager",
    addresses.ecosystemManager,
    deployer
  );
  const treasuryWallet = await hub.getTreasuryAddress();

  console.log("🚀 (Step 8/8) Starting POST-SALE liquidity process...");
  console.log(`Using account: ${deployer.address}`);
  console.log(`Treasury Wallet (from Hub): ${treasuryWallet}`);
  console.log("----------------------------------------------------");

  // --- Get Contract Instances ---
  const rewardBoosterNFT = await ethers.getContractAt(
    "RewardBoosterNFT",
    addresses.rewardBoosterNFT,
    deployer
  );
  const nftLiquidityPool = await ethers.getContractAt(
    "NFTLiquidityPool",
    addresses.nftLiquidityPool,
    deployer
  );
  const bkcToken = await ethers.getContractAt("BKCToken", addresses.bkcToken, deployer);
  const publicSale = await ethers.getContractAt(
    "PublicSale",
    addresses.publicSale,
    deployer
  );

  console.log("\n--- Step 1: Adding Initial Liquidity to AMM Pools (using unsold) ---");

  // Approve $BKC once for all pools
  const bkcPoolCount = ALL_TIERS.length;
  const totalBkcApproval = LIQUIDITY_BKC_AMOUNT_PER_POOL * BigInt(bkcPoolCount);

  console.log(
    `\n1. Approving NFTLiquidityPool to spend ${ethers.formatEther(totalBkcApproval)} $BKC...`
  );
  await sendTransactionWithRetries(() =>
    bkcToken.approve(addresses.nftLiquidityPool, totalBkcApproval)
  );
  console.log("✅ BKC approval successful.");

  // Approve all NFTs for the Pool
  await sendTransactionWithRetries(() =>
    rewardBoosterNFT.setApprovalForAll(addresses.nftLiquidityPool, true)
  );
  console.log("✅ NFT approval for Pool successful.");


  // --- THE SMART LOGIC STARTS HERE ---
  for (const tier of ALL_TIERS) {
    console.log(`\n--- Processing pool liquidity for: ${tier.name} ---`);

    // 2a. Accounting: Read the PublicSale contract
    const tierInfo = await publicSale.tiers(tier.tierId);
    const maxSupply = tierInfo.maxSupply; // Total Supply (100%)
    const mintedCount = tierInfo.mintedCount; // How many were SOLD (by public)
    
    // 2b. Correctly calculate unsold (95% - Sold)
    const saleAllocation = (maxSupply * 95n) / 100n; // The 95% that were for sale
    let unsoldAmount = 0n;

    if (mintedCount >= saleAllocation) {
        unsoldAmount = 0n;
    } else {
        unsoldAmount = saleAllocation - mintedCount; // What's left from the 95%
    }
    
    console.log(`   Stats: Max Supply=${maxSupply}, Sale Allocation (95%)=${saleAllocation}`);
    console.log(`   Sold (public)=${mintedCount}, Unsold (for liquidity)=${unsoldAmount}`);

    // 2c. Check the liquidity pool state
    // =================================================================
    // ### FIX ###
    // We must call the new `getPoolInfo` function
    // instead of the old public getter `pools`.
    const poolInfo = await nftLiquidityPool.getPoolInfo(tier.boostBips);
    // poolInfo is an object with named properties: [tokenBalance, nftCount, k, isInitialized]

    if (poolInfo.isInitialized && poolInfo.nftCount > 0) {
    // =================================================================
      console.log(`   ⚠️ WARNING: Pool for ${tier.name} already has liquidity. Skipping.`);
      continue;
    }
    if (!poolInfo.isInitialized) {
      console.error(`   ❌ ERROR: Pool for ${tier.name} (boostBips: ${tier.boostBips}) was not created. Run '5_create_pools.ts' first.`);
      continue;
    }

    // 2d. Check if there are "unsold" NFTs to add
    if (unsoldAmount <= 0n) {
      console.log(`   ⚠️ WARNING: Tier ${tier.name} SOLD OUT. No unsold NFTs to create liquidity pool.`);
      console.log(`   (NFTLiquidityPool requires at least 1 NFT to initialize a pool)`);
      continue;
    }

    // 2e. Mint the "unsold" NFTs (unsoldAmount)
    console.log(` -> Minting ${unsoldAmount} "unsold" NFTs (${tier.name}) for the liquidity pool...`);
    const allPoolTokenIds: string[] = [];

    // This loop uses 'bigint'
    for (let i = 0n; i < unsoldAmount; i += CHUNK_SIZE_BIGINT) {
      const remainingInLiquidityLoop = unsoldAmount - i;
      const amountToMint_Liquidity = remainingInLiquidityLoop < CHUNK_SIZE_BIGINT ? remainingInLiquidityLoop : CHUNK_SIZE_BIGINT;

      const receipt = await sendTransactionWithRetries(() =>
        rewardBoosterNFT.ownerMintBatch(
          deployer.address, // Mint to self (deployer) first
          Number(amountToMint_Liquidity), // Convert bigint to number
          tier.boostBips,
          tier.metadata
        )
      );

      // Parse logs to get token IDs
      const tokenIdsInChunk = receipt.logs
        .map((log: Log) => {
          try { return rewardBoosterNFT.interface.parseLog(log); } catch { return null; }
        })
        .filter((log: LogDescription | null): log is LogDescription => log !== null && log.name === "BoosterMinted")
        .map((log: LogDescription) => log.args.tokenId.toString());
          
      allPoolTokenIds.push(...tokenIdsInChunk);
    }
    console.log(`   ✅ All ${allPoolTokenIds.length} unsold NFTs for the pool have been minted.`);

    // 2f. Add Liquidity (Unsold NFTs + 2 Million BKC)
    console.log(
      ` -> Adding liquidity with ${allPoolTokenIds.length} unsold NFTs and ${ethers.formatEther(LIQUIDITY_BKC_AMOUNT_PER_POOL)} $BKC...`
    );
    let isFirstChunk = true;
    for (let i = 0; i < allPoolTokenIds.length; i += CHUNK_SIZE) {
      const chunk = allPoolTokenIds.slice(i, i + CHUNK_SIZE);
      if (isFirstChunk) {
        // The first transaction adds NFTs AND the 2M $BKC
        await sendTransactionWithRetries(() =>
          nftLiquidityPool.addInitialLiquidity(
            tier.boostBips,
            chunk,
            LIQUIDITY_BKC_AMOUNT_PER_POOL
          )
        );
        isFirstChunk = false;
      } else {
        // Subsequent transactions only add more NFTs
        await sendTransactionWithRetries(() =>
          nftLiquidityPool.addMoreNFTsToPool(tier.boostBips, chunk)
        );
      }
    }
    console.log(`   ✅ Liquidity for ${tier.name} added successfully.`);
  }

  // Revoke NFT approval for the pool contract
  await sendTransactionWithRetries(() =>
    rewardBoosterNFT.setApprovalForAll(addresses.nftLiquidityPool, false)
  );
  console.log("✅ NFT approval for Pool revoked.");
  console.log("----------------------------------------------------");

  // --- Final Step: Renounce Ownership ---
  console.log(
    "\n🔒 Final Step: Renouncing ownership of RewardBoosterNFT..."
  );
  // Only renounce if deployer is still owner
  const currentOwner = await rewardBoosterNFT.owner();
  if (currentOwner.toLowerCase() === deployer.address.toLowerCase()) {
      await sendTransactionWithRetries(() =>
        rewardBoosterNFT.renounceOwnership()
      );
      console.log("✅ Ownership renounced. NFT supply is now FINAL and IMMUTABLE.");
  } else {
      console.log(`⚠️  Ownership already transferred or renounced. Current owner: ${currentOwner}`);
  }
  console.log("----------------------------------------------------");

  console.log(
    "\n🎉🎉🎉 POST-SALE MINTING AND LIQUIDITY INIT COMPLETE! 🎉🎉🎉"
  );
  console.log("\n✅ The ecosystem is fully configured and the NFT secondary market is ACTIVE.");
}

// ====================================================================
// Standalone execution entry point
// ====================================================================
if (require.main === module) {
  console.log("Running 8_add_liquidity.ts as a standalone script...");
  import("hardhat").then(hre => {
    runScript(hre) 
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  });
}