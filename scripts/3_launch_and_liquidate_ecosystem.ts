// scripts/3_launch_and_liquidate_ecosystem.ts
import { ethers, upgrades } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";
import { LogDescription, Log, ContractTransactionReceipt, BaseContract } from "ethers";

// ######################################################################
// ###               ECOSYSTEM LAUNCH CONFIGURATION                 ###
// ######################################################################

const DEPLOY_DELAY_MS = 2000;
const CONFIG_DELAY_MS = 1500;
const CHUNK_SIZE = 150;
const CHUNK_SIZE_BIGINT = BigInt(CHUNK_SIZE);

// --- Manual Liquidity Mint Simulation (Test) ---
const MANUAL_LIQUIDITY_MINT_COUNT = [
    10n, // Tier 0 (Diamond)
    20n, // Tier 1 (Platinum)
    30n, // Tier 2 (Gold)
    40n, // Tier 3 (Silver)
    50n, // Tier 4 (Bronze)
    60n, // Tier 5 (Iron)
    70n  // Tier 6 (Crystal)
];
// -------------------------------------------------------------------

// --- 1. Oracle Fee ---
const FORTUNE_POOL_ORACLE_FEE_ETH = "0.001"; 

// --- 2. Fortune Pool Liquidity ---
const FORTUNE_POOL_LIQUIDITY_TOTAL = ethers.parseEther("1000000"); // 1,000,000 BKC

const FORTUNE_POOL_TIERS = [
    { poolId: 1, multiplierBips: 10000n, chanceDenominator: 3n }, // 1x, 1/3
    { poolId: 2, multiplierBips: 100000n, chanceDenominator: 10n }, // 10x, 1/10
    { poolId: 3, multiplierBips: 1000000n, chanceDenominator: 100n } // 100x, 1/100
];

// --- 3. AMM Liquidity Config ---
const LIQUIDITY_BKC_AMOUNT_PER_POOL = ethers.parseEther("2000000"); // 2,000,000 BKC per NFT Tier

const ALL_TIERS = [
  { tierId: 0, name: "Diamond", boostBips: 5000n, metadata: "diamond_booster.json" },
  { tierId: 1, name: "Platinum", boostBips: 4000n, metadata: "platinum_booster.json" },
  { tierId: 2, name: "Gold", boostBips: 3000n, metadata: "gold_booster.json" },
  { tierId: 3, name: "Silver", boostBips: 2000n, metadata: "silver_booster.json" },
  { tierId: 4, name: "Bronze", boostBips: 1000n, metadata: "bronze_booster.json" },
  { tierId: 5, name: "Iron", boostBips: 500n, metadata: "iron_booster.json" },
  { tierId: 6, name: "Crystal", boostBips: 100n, metadata: "crystal_booster.json" },
];

// --- TGE Supply (40M) ---
const TGE_SUPPLY_AMOUNT = 40_000_000n * 10n**18n; 

// --- Initial Delegation (Staking) Config ---
const INITIAL_STAKE_AMOUNT = ethers.parseEther("1000"); // 1,000 BKC
const INITIAL_STAKE_DURATION = 365; // 365 Days
// ######################################################################

const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");

// --- Helper Functions ---
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Função auxiliar para salvar no JSON imediatamente (evita perda se crashar)
function updateAddressJSON(key: string, value: string) {
    const currentAddresses = JSON.parse(fs.readFileSync(addressesFilePath, "utf8"));
    currentAddresses[key] = value;
    fs.writeFileSync(addressesFilePath, JSON.stringify(currentAddresses, null, 2));
}

async function sendTransactionWithRetries(txFunction: () => Promise<any>, description: string, retries = 3): Promise<ContractTransactionReceipt | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const tx = await txFunction();
      const receipt = await tx.wait();
      if (!receipt) { throw new Error("Transaction sent but null receipt returned."); }
      console.log(`   ✅ OK. Hash: ${receipt.hash}`);
      await sleep(1500);
      return receipt as ContractTransactionReceipt;
    } catch (error: any) {
      if ((error.message.includes("nonce") || error.message.includes("in-flight")) && i < retries - 1) {
        console.warn(`   ⚠️ Nonce issue detected. Retrying in 5s...`);
        await sleep(5000);
      } else if (error.message.includes("ReentrancyGuard: reentrant call")) {
        throw new Error(`❌ FALHA na transação (${description}): ReentrancyGuard error.`);
      } else {
        // Se o erro for "já feito", apenas loga e segue
        if(error.message.includes("already") || error.message.includes("Already")) {
             console.log(`   ⚠️ Note: Transaction might have already run (${error.message}). Continuing...`);
             return null;
        }
        throw new Error(`❌ FALHA na transação (${description}): ${error.message}`);
      }
    }
  }
  throw new Error("Transaction failed after multiple retries.");
}

// --- Rule Setting Helpers ---
async function setServiceFee(manager: any, key: string, value: number | bigint) {
    const current = await manager.getFee(key);
    if (current === BigInt(value)) {
        console.log(`   ⏩ Fee ${key} already set to ${value}. Skipping.`);
        return;
    }
    await sendTransactionWithRetries(() => manager.setServiceFee(key, value), `Set Fee ${key}`);
}

async function setPStake(manager: any, key: string, value: number | bigint) {
    const current = await manager.getServiceRequirements(key);
    if (current.pStake === BigInt(value)) {
         console.log(`   ⏩ pStake ${key} already set to ${value}. Skipping.`);
         return;
    }
    await sendTransactionWithRetries(() => manager.setPStakeMinimum(key, value), `Set pStake ${key}`);
}

async function setMiningDistributionBips(manager: any, key: string, value: number | bigint) {
    const current = await manager.getMiningDistributionBips(key);
    if (current === BigInt(value)) return;
    await sendTransactionWithRetries(() => manager.setMiningDistributionBips(key, value), `Set Mining Bips ${key}`);
}

async function setFeeDistributionBips(manager: any, key: string, value: number | bigint) {
    const current = await manager.getFeeDistributionBips(key);
    if (current === BigInt(value)) return;
    await sendTransactionWithRetries(() => manager.setFeeDistributionBips(key, value), `Set Fee Bips ${key}`);
}

/**
 * Helper to deploy or load Spoke contracts (Idempotent)
 */
async function getOrCreateSpoke(
    hre: HardhatRuntimeEnvironment,
    addresses: { [key: string]: string },
    key: keyof typeof addresses,
    contractName: string,
    contractPath: string,
    initializerArgs: any[],
) {
    const { ethers, upgrades } = hre;
    const [deployer] = await ethers.getSigners();

    if (addresses[key] && addresses.hasOwnProperty(key) && addresses[key].startsWith("0x")) {
        const instance = await ethers.getContractAt(contractName, addresses[key], deployer);
        console.log(`   ⚠️ ${contractName} already deployed. Loaded from: ${addresses[key]}`);
        return instance;
    } else {
        console.log(`   deploying ${contractName}...`);
        const ContractFactory = await ethers.getContractFactory(contractPath);
        const instance = await upgrades.deployProxy(ContractFactory, initializerArgs, { kind: "uups" });
        await instance.waitForDeployment();
        const addr = await instance.getAddress();
        
        addresses[key] = addr;
        updateAddressJSON(key as string, addr); // Save immediately
        console.log(`   ✅ ${contractName} (Proxy) deployed & initialized at: ${addr}`);
        
        return instance;
    }
}


export async function runScript(hre: HardhatRuntimeEnvironment) {
  const { ethers, upgrades } = hre;
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;

  console.log(
    `🚀 (Phase 2) RESUMABLE Deploy Script on: ${networkName}`
  );
  console.log(`Using account: ${deployer.address}`);
  console.log("----------------------------------------------------");

  // --- 0. Load Addresses ---
  if (!fs.existsSync(addressesFilePath)) {
    throw new Error("Missing deployment-addresses.json. Run 1_deploy_full_initial_setup.ts first.");
  }
  const addresses: { [key: string]: string } = JSON.parse(fs.readFileSync(addressesFilePath, "utf8"));

  const { ecosystemManager, rewardBoosterNFT, publicSale, oracleWalletAddress } = addresses;
  
  if (!ecosystemManager || !rewardBoosterNFT || !publicSale || !oracleWalletAddress) {
    throw new Error("Missing key addresses in JSON.");
  }

  const hub = await ethers.getContractAt("EcosystemManager", ecosystemManager, deployer);
  let bkcTokenInstance: any;
  let miningManagerInstance: any;
  let delegationManagerInstance: any;
  let notaryInstance: any;
  let fortunePoolInstance: any;
  
  let tx: ContractTransactionReceipt | null;

  try {
    // ##############################################################
    // ### PART 1: DEPLOY/LOAD ALL SPOKE CONTRACTS ###
    // ##############################################################
    console.log("=== PART 1: DEPLOYING/LOADING SPOKES ===");
    
    bkcTokenInstance = await ethers.getContractAt("BKCToken", addresses.bkcToken, deployer);

    miningManagerInstance = await getOrCreateSpoke(hre, addresses, 'miningManager', 'MiningManager', 'MiningManager', 
        [addresses.ecosystemManager]
    ); 
    
    delegationManagerInstance = await getOrCreateSpoke(hre, addresses, 'delegationManager', 'DelegationManager', 'contracts/DelegationManager.sol:DelegationManager',
        [deployer.address, addresses.ecosystemManager]
    );
    
    // 1.3. Critical Hub Update 
    const currentTreasury = await hub.getTreasuryAddress();
    const currentBooster = await hub.getBoosterAddress();
    const currentBKC = await hub.getBKCTokenAddress();
    addresses.treasuryWallet = currentTreasury;

    // Verifica se já está configurado para não gastar gas
    const currentMMInHub = await hub.getMiningManagerAddress();
    if (currentMMInHub !== addresses.miningManager) {
        console.log("\n1.2. Updating Hub (MM & DM)...");
        await sendTransactionWithRetries(() => hub.setAddresses(
            currentBKC,
            currentTreasury,
            addresses.delegationManager,
            currentBooster,
            addresses.miningManager,
            addresses.decentralizedNotary || ethers.ZeroAddress,
            addresses.fortunePool || ethers.ZeroAddress,
            addresses.nftLiquidityPoolFactory || ethers.ZeroAddress
        ), "Update Hub with MM and DM");
    } else {
        console.log("   ⏩ Hub already configured with MM/DM.");
    }

    notaryInstance = await getOrCreateSpoke(hre, addresses, 'decentralizedNotary', 'DecentralizedNotary', 'contracts/DecentralizedNotary.sol:DecentralizedNotary',
        [deployer.address, addresses.ecosystemManager]
    );
    fortunePoolInstance = await getOrCreateSpoke(hre, addresses, 'fortunePool', 'FortunePool', 'FortunePool', 
        [deployer.address, addresses.ecosystemManager]
    );
    
    // 1.4. NFT Pool Implementation
    let nftPoolImplementationAddress = addresses.nftLiquidityPool_Implementation;
    if (!nftPoolImplementationAddress || !nftPoolImplementationAddress.startsWith("0x")) {
        console.log("Deploying Pool Implementation...");
        const NFTLiquidityPool = await ethers.getContractFactory("NFTLiquidityPool");
        const nftPoolImplementation = await NFTLiquidityPool.deploy();
        await nftPoolImplementation.waitForDeployment();
        nftPoolImplementationAddress = await nftPoolImplementation.getAddress();
        addresses.nftLiquidityPool_Implementation = nftPoolImplementationAddress;
        updateAddressJSON("nftLiquidityPool_Implementation", nftPoolImplementationAddress);
        console.log(`   ✅ Implementation deployed to: ${nftPoolImplementationAddress}`);
    }
    
    // 1.5. NFT Pool Factory
    let factoryInstance: BaseContract;
    const factoryAddress = addresses.nftLiquidityPoolFactory;
    if (!factoryAddress || !factoryAddress.startsWith("0x")) {
        console.log("Deploying Factory...");
        const NFTLiquidityPoolFactory = await ethers.getContractFactory("NFTLiquidityPoolFactory");
        factoryInstance = await upgrades.deployProxy(
            NFTLiquidityPoolFactory, 
            [
                deployer.address, 
                addresses.ecosystemManager, 
                nftPoolImplementationAddress
            ], 
            { initializer: "initialize", kind: "uups" }
        );
        await factoryInstance.waitForDeployment();
        const addr = await factoryInstance.getAddress();
        addresses.nftLiquidityPoolFactory = addr;
        updateAddressJSON("nftLiquidityPoolFactory", addr);
        console.log(`   ✅ Factory deployed to: ${addr}`);
    } else {
        factoryInstance = await ethers.getContractAt("NFTLiquidityPoolFactory", factoryAddress, deployer);
    }
    
    // ##############################################################
    // ### PART 2: CONFIGURE CONNECTIONS & OWNERSHIP ###
    // ##############################################################
    console.log("\n=== PART 2: CONFIGURING CONNECTIONS ===");

    // 2.1. Final Hub Connection Update
    const notaryInHub = await hub.getDecentralizedNotaryAddress();
    if (notaryInHub !== addresses.decentralizedNotary) {
        console.log("\n2.1. Updating Hub with all final Spoke addresses...");
        await sendTransactionWithRetries(() => hub.setAddresses(
            addresses.bkcToken,
            addresses.treasuryWallet,
            addresses.delegationManager,
            addresses.rewardBoosterNFT,
            addresses.miningManager,
            addresses.decentralizedNotary,
            addresses.fortunePool,
            addresses.nftLiquidityPoolFactory
        ), "Update Hub with All Final Addresses");
    }

    // 2.2. Authorize Miners in MiningManager
    const mm = miningManagerInstance;
    // Check logic: We'll just try to set. If it fails/reverts 'already set', our helper handles it or it consumes gas.
    // Since there's no easy 'isAuthorized' public getter for all keys without looping, we assume the user pays gas if re-running.
    await sendTransactionWithRetries(() => mm.setAuthorizedMiner("TIGER_GAME_SERVICE", addresses.fortunePool), "Authorize FortunePool");
    await sendTransactionWithRetries(() => mm.setAuthorizedMiner("NOTARY_SERVICE", addresses.decentralizedNotary), "Authorize DecentralizedNotary");
    
    // Autorizações para taxas do DelegationManager (incluindo a nova DELEGATION_FEE_BIPS)
    await sendTransactionWithRetries(() => mm.setAuthorizedMiner("UNSTAKE_FEE_BIPS", addresses.delegationManager), "Authorize DelegationManager for UNSTAKE_FEE_BIPS");
    await sendTransactionWithRetries(() => mm.setAuthorizedMiner("FORCE_UNSTAKE_PENALTY_BIPS", addresses.delegationManager), "Authorize DelegationManager for PENALTY_BIPS");
    await sendTransactionWithRetries(() => mm.setAuthorizedMiner("CLAIM_REWARD_FEE_BIPS", addresses.delegationManager), "Authorize DelegationManager for CLAIM_BIPS");
    await sendTransactionWithRetries(() => mm.setAuthorizedMiner("DELEGATION_FEE_BIPS", addresses.delegationManager), "Authorize DelegationManager for STAKE_FEE_BIPS"); // NOVO

    // 2.3. Transfer BKCToken Ownership
    const currentOwner = await bkcTokenInstance.owner(); 
    if (currentOwner.toLowerCase() === deployer.address.toLowerCase()) {
        await sendTransactionWithRetries(() => bkcTokenInstance.transferOwnership(addresses.miningManager), "Transfer BKCToken Ownership");
        console.log(`   ✅ OWNERSHIP TRANSFERRED!`);
    } else {
        console.log(`   ⏩ Ownership already transferred (Owner: ${currentOwner}).`);
    }
    
    // 2.4. Mint TGE Supply
    try {
        await sendTransactionWithRetries(() => 
            miningManagerInstance.initialTgeMint(addresses.miningManager, TGE_SUPPLY_AMOUNT), "Initial TGE Mint"
        );
    } catch (e: any) {
        if (e.message.includes("TGE already minted")) { console.log("   ⏩ TGE already minted."); }
        else { throw e; }
    }
    
    // 2.5. Distribute TGE Supply (Check balances first)
    const mmBalance = await bkcTokenInstance.balanceOf(addresses.miningManager);
    const totalLiquidityForDeployer = FORTUNE_POOL_LIQUIDITY_TOTAL + (LIQUIDITY_BKC_AMOUNT_PER_POOL * BigInt(ALL_TIERS.length)) + INITIAL_STAKE_AMOUNT;
    const remainingForAirdrop = TGE_SUPPLY_AMOUNT - totalLiquidityForDeployer;

    if (mmBalance > 0n) {
        console.log(`   MiningManager has balance. Distributing...`);
        await sendTransactionWithRetries(() => 
            miningManagerInstance.transferTokensFromGuardian(deployer.address, totalLiquidityForDeployer), "Transfer Liquidity"
        );
        await sendTransactionWithRetries(() => 
            miningManagerInstance.transferTokensFromGuardian(deployer.address, remainingForAirdrop), "Transfer Airdrop (Using Deployer as Wallet)"
        );
    } else {
         console.log("   ⏩ MiningManager balance is 0. TGE distribution likely done.");
    }
    
    // 2.6. Configure Oracle
    try {
        await sendTransactionWithRetries(() => fortunePoolInstance.setOracleAddress(addresses.oracleWalletAddress), "Set Oracle Address");
        await sendTransactionWithRetries(() => fortunePoolInstance.setOracleFee(ethers.parseEther(FORTUNE_POOL_ORACLE_FEE_ETH)), "Set Oracle Fee");
    } catch (e: any) { console.warn(`   ⚠️ Failed to set oracle (maybe done): ${e.message}`); }


    // ##############################################################
    // ### PART 3: CONFIGURE RULES ###
    // ##############################################################
    console.log("\n=== PART 3: CONFIGURING RULES ===");
    // (A lógica de setServiceFee e Bips já verifica se o valor é igual antes de enviar tx)

    try {
        for (const tier of FORTUNE_POOL_TIERS) {
            await sendTransactionWithRetries(() => fortunePoolInstance.setPrizeTier(tier.poolId, tier.chanceDenominator, tier.multiplierBips), `Set FortunePool Tier ${tier.poolId}`);
        }
    } catch (e) { console.warn("Skipping Fortune tiers"); }

    const RULES = JSON.parse(fs.readFileSync(path.join(__dirname, "../rules-config.json"), "utf8"));
    
    try {
        // Serviços que cobram em ETH/BNB (ou BKC com valor base)
        await setServiceFee(hub, "NOTARY_SERVICE", ethers.parseEther(RULES.serviceFees.NOTARY_SERVICE));
        await setPStake(hub, "NOTARY_SERVICE", BigInt(RULES.pStakeMinimums.NOTARY_SERVICE));
        
        await setServiceFee(hub, "FORTUNE_POOL_SERVICE", ethers.parseEther(RULES.serviceFees.FORTUNE_POOL_SERVICE));
        await setPStake(hub, "FORTUNE_POOL_SERVICE", BigInt(RULES.pStakeMinimums.FORTUNE_POOL_SERVICE));

        await setServiceFee(hub, "NFT_POOL_ACCESS", ethers.parseEther(RULES.serviceFees.NFT_POOL_ACCESS));
        await setPStake(hub, "NFT_POOL_ACCESS", BigInt(RULES.pStakeMinimums.NFT_POOL_ACCESS));

        // Taxas em BIPS (incluindo a nova DELEGATION_FEE_BIPS)
        await setServiceFee(hub, "DELEGATION_FEE_BIPS", BigInt(RULES.stakingFees.DELEGATION_FEE_BIPS)); // NOVO
        await setServiceFee(hub, "UNSTAKE_FEE_BIPS", BigInt(RULES.stakingFees.UNSTAKE_FEE_BIPS));
        await setServiceFee(hub, "FORCE_UNSTAKE_PENALTY_BIPS", BigInt(RULES.stakingFees.FORCE_UNSTAKE_PENALTY_BIPS));
        await setServiceFee(hub, "CLAIM_REWARD_FEE_BIPS", BigInt(RULES.stakingFees.CLAIM_REWARD_FEE_BIPS));

        await setServiceFee(hub, "NFT_POOL_TAX_BIPS", BigInt(RULES.ammTaxFees.NFT_POOL_TAX_BIPS));
        await setServiceFee(hub, "NFT_POOL_TAX_LIQUIDITY_SHARE_BIPS", BigInt(RULES.ammTaxFees.NFT_POOL_TAX_LIQUIDITY_SHARE_BIPS));
        
        // Distribuições
        const md = RULES.miningDistribution;
        await setMiningDistributionBips(hub, "TREASURY", BigInt(md.TREASURY));
        await setMiningDistributionBips(hub, "VALIDATOR_POOL", BigInt(md.VALIDATOR_POOL));
        await setMiningDistributionBips(hub, "DELEGATOR_POOL", BigInt(md.DELEGATOR_POOL));

        const fd = RULES.feeDistribution;
        await setFeeDistributionBips(hub, "TREASURY", BigInt(fd.TREASURY));
        await setFeeDistributionBips(hub, "VALIDATOR_POOL", BigInt(fd.VALIDATOR_POOL));
        await setFeeDistributionBips(hub, "DELEGATOR_POOL", BigInt(fd.DELEGATOR_POOL));

    } catch (e: any) { console.warn(`   ⚠️ Error setting rules: ${e.message}`); }


    // ##############################################################
    // ### PART 4: SEED ECOSYSTEM (LIQUIDITY) ###
    // ##############################################################
    console.log("\n=== PART 4: SEEDING ECOSYSTEM (LIQUIDITY) ===");

    // 4.1. FortunePool Liquidity
    const fpBalance = await bkcTokenInstance.balanceOf(addresses.fortunePool);
    if (fpBalance < FORTUNE_POOL_LIQUIDITY_TOTAL) {
        console.log(`\n4.1. Seeding FortunePool...`);
        await sendTransactionWithRetries(() => 
            bkcTokenInstance.approve(addresses.fortunePool, FORTUNE_POOL_LIQUIDITY_TOTAL), "Approve FortunePool Liquidity"
        );
        await sendTransactionWithRetries(() => fortunePoolInstance.topUpPool(FORTUNE_POOL_LIQUIDITY_TOTAL), "TopUp FortunePool");
    } else {
        console.log(`   ⏩ FortunePool already has liquidity (${ethers.formatEther(fpBalance)} BKC). Skipping.`);
    }


    // 4.2. NFT AMM Liquidity (Factory Mode) - RE-EXECUÇÃO INTELIGENTE
    console.log("\n4.2. Checking/Seeding AMM Pools...");

    const rewardBoosterNFT = await ethers.getContractAt("RewardBoosterNFT", addresses.rewardBoosterNFT, deployer);
    const factoryInstanceLoaded = await ethers.getContractAt("NFTLiquidityPoolFactory", addresses.nftLiquidityPoolFactory, deployer);

    for (let i = 0; i < ALL_TIERS.length; i++) {
        const tier = ALL_TIERS[i];
        const initialMintAmount = MANUAL_LIQUIDITY_MINT_COUNT[i]; 

        console.log(`\n   --- Processing ${tier.name} (Tier ${tier.tierId}) ---`);

        // 1. Check if pool exists in JSON
        const poolKey = `pool_${tier.name.toLowerCase()}`;
        let poolAddress = addresses[poolKey];

        // 2. If not in JSON, check Factory
        if (!poolAddress || !poolAddress.startsWith('0x')) {
            console.log(`      Checking Factory for pool address...`);
            poolAddress = await factoryInstanceLoaded.getPoolAddress(tier.boostBips);
            
            // 3. If not in Factory, Deploy
            if (poolAddress === ethers.ZeroAddress) {
                console.log(`      Not found. Deploying...`);
                const tx = await sendTransactionWithRetries(() => factoryInstanceLoaded.deployPool(tier.boostBips), `Deploy Pool ${tier.name}`);
                
                const logs = (tx?.logs || []) as Log[];
                const parsedLogs = logs
                    .map((log: Log) => { try { return factoryInstanceLoaded.interface.parseLog(log as any); } catch { return null; } })
                    .filter((log: LogDescription | null): log is LogDescription => log !== null && log.name === "PoolDeployed");

                if (parsedLogs.length > 0) {
                    poolAddress = parsedLogs[0].args.poolAddress;
                    console.log(`      ✅ Pool Deployed: ${poolAddress}`);
                } else {
                    // Fallback fetch
                    poolAddress = await factoryInstanceLoaded.getPoolAddress(tier.boostBips);
                }
            } else {
                console.log(`      Found in Factory: ${poolAddress}`);
            }
            // Update JSON
            updateAddressJSON(poolKey, poolAddress);
        } else {
             console.log(`      Found in JSON: ${poolAddress}`);
        }
        
        // 4. Authorize Pool (Idempotent check inside MM is hard, so we try)
        // To save gas on re-runs, we skip if pool already has liquidity (implies auth worked)
        const poolInstance = await ethers.getContractAt("NFTLiquidityPool", poolAddress, deployer);
        const poolInfo = await poolInstance.getPoolInfo();
        
        if (poolInfo.nftCount > 0) { 
            console.log(`      ⏩ Pool already has liquidity (${poolInfo.nftCount} NFTs). Skipping seed.`); 
            continue; 
        }

        console.log(`      Authorizing Pool in MiningManager...`);
        try {
            await sendTransactionWithRetries(() => 
                mm.setAuthorizedMiner("NFT_POOL_TAX_BIPS", poolAddress), `Authorize Pool`
            );
        } catch(e) {}

        // 5. Mint & Add Liquidity
        console.log(`      Minting ${initialMintAmount} NFTs & Adding Liquidity...`);
        const allPoolTokenIds: string[] = [];
        for (let j = 0n; j < initialMintAmount; j += CHUNK_SIZE_BIGINT) {
            const remaining = initialMintAmount - j;
            const amountToMint = remaining < CHUNK_SIZE_BIGINT ? remaining : CHUNK_SIZE_BIGINT;
            
            const tx = await sendTransactionWithRetries(() =>
                rewardBoosterNFT.ownerMintBatch(deployer.address, Number(amountToMint), tier.boostBips, tier.metadata), `Mint Batch`
            );
            if (tx) {
                 const logs = (tx.logs || []) as Log[];
                 const ids = logs.map((log: Log) => { try { return rewardBoosterNFT.interface.parseLog(log as any); } catch { return null; } })
                    .filter((log: LogDescription | null): log is LogDescription => log !== null && log.name === "BoosterMinted")
                    .map((log: LogDescription) => log.args.tokenId.toString());
                 allPoolTokenIds.push(...ids);
            }
        }
        
        await sendTransactionWithRetries(() => bkcTokenInstance.approve(poolAddress, LIQUIDITY_BKC_AMOUNT_PER_POOL), `Approve BKC`);
        await sendTransactionWithRetries(() => rewardBoosterNFT.setApprovalForAll(poolAddress, true), `Approve NFTs`);

        let isFirstChunk = true;
        for (let k = 0; k < allPoolTokenIds.length; k += CHUNK_SIZE) {
            const chunk = allPoolTokenIds.slice(k, k + CHUNK_SIZE);
            if (isFirstChunk) {
                await sendTransactionWithRetries(() => 
                    poolInstance.addInitialLiquidity(chunk, LIQUIDITY_BKC_AMOUNT_PER_POOL), `Add Initial Liquidity`
                );
                isFirstChunk = false;
            } else {
                await sendTransactionWithRetries(() => poolInstance.addMoreNFTsToPool(chunk), `Add More NFTs`);
            }
        }
        await sendTransactionWithRetries(() => rewardBoosterNFT.setApprovalForAll(poolAddress, false), `Revoke Approval`);
        console.log(`      ✅ Liquidity Added.`);
    }
    
    // ##############################################################
    // ### PART 5: INITIAL GLOBAL DELEGATION ###
    // ##############################################################
    console.log("\n=== PART 5: INITIAL STAKE ===");

    const dm = delegationManagerInstance;
    const totalPStake = await dm.totalNetworkPStake();
    
    if (totalPStake > 0n) {
         console.log(`   ⏩ Network already has pStake (${ethers.formatEther(totalPStake)}). Skipping initial delegation.`);
    } else {
         console.log(`   Delegating ${ethers.formatEther(INITIAL_STAKE_AMOUNT)} BKC...`);
         await sendTransactionWithRetries(() => bkcTokenInstance.approve(addresses.delegationManager, INITIAL_STAKE_AMOUNT), `Approve Stake`);
         const lockDurationSeconds = BigInt(INITIAL_STAKE_DURATION * 24 * 3600);
         await sendTransactionWithRetries(() => dm.delegate(INITIAL_STAKE_AMOUNT, lockDurationSeconds, 0), "Initial Delegation");
         console.log(`   ✅ Initial Stake Successful!`);
    }

  } catch (error: any) {
    console.error("\n❌ Script Error:", error.message);
    process.exit(1);
  }

  console.log("\n----------------------------------------------------");
  console.log("\n🎉🎉🎉 ECOSYSTEM LAUNCH & SEEDING COMPLETE! 🎉🎉🎉");
}

// Standalone execution block
if (require.main === module) {
  runScript(require("hardhat")).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}