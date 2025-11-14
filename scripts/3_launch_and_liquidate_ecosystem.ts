// scripts/3_launch_and_liquidate_ecosystem.ts (Lançamento do Ecossistema e Liquidez Pós-Venda)
// REVISÃO: Agora usa a arquitetura NFTLiquidityPoolFactory

import { ethers, upgrades } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";
import { LogDescription, Log, ContractTransactionReceipt, BaseContract } from "ethers";

// ######################################################################
// ###               CONFIGURAÇÃO GERAL DO ECOSSISTEMA              ###
// ######################################################################

const DEPLOY_DELAY_MS = 2000;
const CONFIG_DELAY_MS = 1500;
const CHUNK_SIZE = 150;
const CHUNK_SIZE_BIGINT = BigInt(CHUNK_SIZE);

// --- SIMULAÇÃO DE CUNHAGEM MANUAL PARA LIQUIDEZ (TESTE) ---
const MANUAL_LIQUIDITY_MINT_COUNT = [
    10n, // Tier 0 (Diamond) - 10 NFTs para Liquidez
    20n, // Tier 1 (Platinum) - 20 NFTs para Liquidez
    30n, // Tier 2 (Gold) - 30 NFTs para Liquidez
    40n, // Tier 3 (Silver) - 40 NFTs para Liquidez
    50n, // Tier 4 (Bronze) - 50 NFTs para Liquidez
    60n, // Tier 5 (Iron) - 60 NFTs para Liquidez
    70n  // Tier 6 (Crystal) - 70 NFTs para Liquidez
];
// -------------------------------------------------------------------


// --- 1. Configuração de URIs ---
const IPFS_BASE_URI_VESTING =
  "ipfs://bafybeiebqaxpruffltuzptttlebu24w4prwfebebeevprmm7sudaxpzmg57a/"; 

// --- 2. Taxa do Oráculo ---
const FORTUNE_POOL_ORACLE_FEE_ETH = "0.001"; 

// --- 3. CONFIGURAÇÃO DE LIQUIDEZ DO FORTUNE POOL ---
const FORTUNE_POOL_LIQUIDITY_TOTAL = ethers.parseEther("1000000"); // 1,000,000 BKC

const LIQUIDITY_CONFIG = [
    { 
        poolId: 1, 
        multiplierBips: 10000n, // 1x
        chanceDenominator: 2, // 50%
        bipsContribution: 9000n, 
        amount: ethers.parseEther("900000") // 90%
    },
    { 
        poolId: 2, 
        multiplierBips: 50000n, // 5x
        chanceDenominator: 20, // 5%
        bipsContribution: 700n, 
        amount: ethers.parseEther("70000") // 7%
    },
    { 
        poolId: 3, 
        multiplierBips: 1000000n, // 100x
        chanceDenominator: 1000, // 0.1%
        bipsContribution: 300n, 
        amount: ethers.parseEther("30000") // 3%
    }
];
const TOTAL_FORTUNE_LIQUIDITY = LIQUIDITY_CONFIG.reduce((sum, pool) => sum + pool.amount, 0n);

// --- 4. CONFIGURAÇÃO DE TAXAS E REGRAS ---
const SERVICE_SETTINGS = {
  NOTARY_FEE: ethers.parseUnits("100", 18), 
  NOTARY_SERVICE_PSTAKE: BigInt(10000), 
  TIGER_GAME_SERVICE_FEE: BigInt(0), 
  TIGER_GAME_SERVICE_PSTAKE: BigInt(10000), 
  UNSTAKE_FEE_BIPS: BigInt(100), 
  FORCE_UNSTAKE_PENALTY_BIPS: BigInt(5000), 
  CLAIM_REWARD_FEE_BIPS: BigInt(2000), 
  NFT_POOL_ACCESS_PSTAKE: BigInt(10000), 
  NFT_POOL_TAX_BIPS: BigInt(1000), 
  NFT_POOL_TAX_TREASURY_SHARE_BIPS: BigInt(4000), 
  NFT_POOL_TAX_DELEGATOR_SHARE_BIPS: BigInt(4000), 
  NFT_POOL_TAX_LIQUIDITY_SHARE_BIPS: BigInt(2000), 
};

// --- 5. AMM LIQUIDEZ CONFIG ---
const LIQUIDITY_BKC_AMOUNT_PER_POOL = ethers.parseEther("2000000"); // 2,000,000 BKC por Tier NFT
const AIRDROP_AMOUNT = ethers.parseEther("25000000"); // 25,000,000 BKC para airdrop/vendas

const ALL_TIERS = [
  { tierId: 0, name: "Diamond", boostBips: 5000n, metadata: "diamond_booster.json" },
  { tierId: 1, name: "Platinum", boostBips: 4000n, metadata: "platinum_booster.json" },
  { tierId: 2, name: "Gold", boostBips: 3000n, metadata: "gold_booster.json" },
  { tierId: 3, name: "Silver", boostBips: 2000n, metadata: "silver_booster.json" },
  { tierId: 4, name: "Bronze", boostBips: 1000n, metadata: "bronze_booster.json" },
  { tierId: 5, name: "Iron", boostBips: 500n, metadata: "iron_booster.json" },
  { tierId: 6, name: "Crystal", boostBips: 100n, metadata: "crystal_booster.json" },
];
// --- SUPRIMENTO TOTAL TGE (40M) ---
const TGE_SUPPLY_AMOUNT = 40_000_000n * 10n**18n; 
// ######################################################################


// --- Funções Auxiliares (Wrappers e Helpers) ---
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendTransactionWithRetries(txFunction: () => Promise<any>, retries = 3): Promise<ContractTransactionReceipt> {
  for (let i = 0; i < retries; i++) {
    try {
      const tx = await txFunction();
      const receipt = await tx.wait();
      if (!receipt) { throw new Error("Transação enviada, mas um recibo nulo foi retornado."); }
      await sleep(1500);
      return receipt as ContractTransactionReceipt;
    } catch (error: any) {
      if ((error.message.includes("nonce") || error.message.includes("in-flight")) && i < retries - 1) {
        console.warn(`   ⚠️ Problema de nonce detectado. Tentando novamente em ${5000} segundos...`);
        await sleep(5000);
      } else {
        throw error;
      }
    }
  }
  throw new Error("Transação falhou após múltiplas tentativas.");
}

async function setFee(manager: any, key: string, value: number | bigint) {
    const { ethers } = require("hardhat"); 
    await sendTransactionWithRetries(() => manager.getFunction("setFee")(key, value));
    console.log(`   -> Taxa definida: ${key} = ${value.toString()}`);
    await sleep(CONFIG_DELAY_MS / 2); 
}

async function setPStake(manager: any, key: string, value: number | bigint) {
    await sendTransactionWithRetries(() => manager.getFunction("setPStakeMinimum")(key, value));
    console.log(`   -> pStake definido: ${key} = ${value}`);
    await sleep(CONFIG_DELAY_MS / 2);
}

async function setService(manager: any, serviceKey: string, feeValue: number | bigint, pStakeValue: number | bigint) {
    console.log(`\nConfigurando Serviço: ${serviceKey}...`);
    await setFee(manager, serviceKey, feeValue);
    await setPStake(manager, serviceKey, pStakeValue);
}

// ====================================================================

/**
 * Funções auxiliares para carregamento/deploy de Spokes
 */
async function getOrCreateSpoke(
    hre: HardhatRuntimeEnvironment,
    addresses: { [key: string]: string },
    key: keyof typeof addresses,
    contractName: string,
    artifactPath: string,
) {
    const { ethers, upgrades } = hre;
    const [deployer] = await ethers.getSigners();
    const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");


    if (addresses[key] && addresses.hasOwnProperty(key) && addresses[key].startsWith("0x")) {
        // Carregar se já estiver implantado (MODO RETOMADA)
        const instance = await ethers.getContractAt(contractName, addresses[key], deployer);
        console.log(`   ⚠️ ${contractName} já implantado. Carregado em: ${addresses[key]}`);
        return instance;
    } else {
        // Implantar e salvar
        const ContractFactory = await ethers.getContractFactory(artifactPath);
        const instance = await upgrades.deployProxy(ContractFactory, [], { 
            initializer: false, 
            kind: "uups" 
        });
        await instance.waitForDeployment();
        addresses[key] = await instance.getAddress();
        fs.writeFileSync(addressesFilePath, JSON.stringify(addresses, null, 2));
        console.log(`   ✅ ${contractName} (Proxy) implantado em: ${addresses[key]}`);
        
        // RETORNAMOS A INSTÂNCIA PARA SER INICIALIZADA NA ETAPA 2.2
        return instance;
    }
}
const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");


export async function runScript(hre: HardhatRuntimeEnvironment) {
  const { ethers, upgrades } = hre;
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;

  console.log(
    `🚀 (Passo 3/X) Implantando, Configurando e Abastecendo o Ecossistema na rede: ${networkName}`
  );
  console.log(`Usando a conta: ${deployer.address}`);
  console.log("----------------------------------------------------");

  // --- 0. Carregar Endereços ---
  if (!fs.existsSync(addressesFilePath)) {
    throw new Error("Faltando deployment-addresses.json. Execute 1_deploy_full_initial_setup.ts primeiro.");
  }
  const addresses: { [key: string]: string } = JSON.parse(fs.readFileSync(addressesFilePath, "utf8"));

  const { ecosystemManager, rewardBoosterNFT, publicSale, oracleWalletAddress } = addresses;
  
  if (!ecosystemManager || !rewardBoosterNFT || !publicSale || !oracleWalletAddress) {
    throw new Error("Faltando endereços principais (ecosystemManager, rewardBoosterNFT, publicSale, oracleWalletAddress) no JSON.");
  }
  if (!FORTUNE_POOL_ORACLE_FEE_ETH || ethers.parseEther(FORTUNE_POOL_ORACLE_FEE_ETH) <= 0n) {
       throw new Error("ERRO: Por favor, defina um valor para 'FORTUNE_POOL_ORACLE_FEE_ETH'.");
  }

  const hub = await ethers.getContractAt("EcosystemManager", ecosystemManager, deployer);
  let bkcTokenInstance: any;
  let miningManagerInstance: any;
  let delegationManagerInstance: any;
  let rewardManagerInstance: any;
  let notaryInstance: any;
  let fortunePoolInstance: any;
  // let nftLiquidityPoolInstance: any; // REMOVIDO - Agora é uma Fábrica

  try {
    // ##############################################################
    // ### PARTE 1: IMPLANTAR NOVOS SPOKES (Recarrega Contratos) ###
    // ##############################################################
    console.log("=== PARTE 1: RECARREGANDO SPOKES E IMPLANTANDO NOVOS ===");
    
    // 1.1. BKCToken
    bkcTokenInstance = await ethers.getContractAt("BKCToken", addresses.bkcToken, deployer);
    console.log(`\n1.1. BKCToken (Proxy) carregado em: ${addresses.bkcToken}`);

    // Carregar/Implantar os demais Spokes usando a lógica de Retomada
    miningManagerInstance = await getOrCreateSpoke(hre, addresses, 'miningManager', 'MiningManager', 'MiningManager');
    delegationManagerInstance = await getOrCreateSpoke(hre, addresses, 'delegationManager', 'DelegationManager', 'contracts/DelegationManager.sol:DelegationManager');
    rewardManagerInstance = await getOrCreateSpoke(hre, addresses, 'rewardManager', 'RewardManager', 'contracts/RewardManager.sol:RewardManager');
    notaryInstance = await getOrCreateSpoke(hre, addresses, 'decentralizedNotary', 'DecentralizedNotary', 'contracts/DecentralizedNotary.sol:DecentralizedNotary');
    fortunePoolInstance = await getOrCreateSpoke(hre, addresses, 'fortunePool', 'FortunePoolV3', 'contracts/FortunePoolV3.sol:FortunePoolV3');
    
    // --- (REFA) INÍCIO: Implantação da Fábrica de Piscinas NFT ---
    
    // 1.2. Implantar a Implementação (Molde) do NFTLiquidityPool
    console.log("\n1.2. Implantando Implementação (Molde) do NFTLiquidityPool...");
    let nftPoolImplementationAddress = addresses.nftLiquidityPool_Implementation;
    
    if (!nftPoolImplementationAddress || !nftPoolImplementationAddress.startsWith("0x")) {
        const NFTLiquidityPool = await ethers.getContractFactory("NFTLiquidityPool");
        const nftPoolImplementation = await NFTLiquidityPool.deploy();
        await nftPoolImplementation.waitForDeployment();
        nftPoolImplementationAddress = await nftPoolImplementation.getAddress();
        addresses.nftLiquidityPool_Implementation = nftPoolImplementationAddress;
        fs.writeFileSync(addressesFilePath, JSON.stringify(addresses, null, 2));
        console.log(`   ✅ Implementação (Molde) implantada em: ${nftPoolImplementationAddress}`);
    } else {
        console.log(`   ⚠️ Implementação (Molde) já implantada em: ${nftPoolImplementationAddress}`);
    }
    
    // 1.3. Implantar a FÁBRICA (Proxy UUPS)
    console.log("\n1.3. Implantando NFTLiquidityPoolFactory (Proxy)...");
    let factoryInstance: BaseContract;
    const factoryAddress = addresses.nftLiquidityPoolFactory;

    if (!factoryAddress || !factoryAddress.startsWith("0x")) {
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
        addresses.nftLiquidityPoolFactory = await factoryInstance.getAddress();
        fs.writeFileSync(addressesFilePath, JSON.stringify(addresses, null, 2));
        console.log(`   ✅ NFTLiquidityPoolFactory (Proxy) implantada em: ${addresses.nftLiquidityPoolFactory}`);
    } else {
        factoryInstance = await ethers.getContractAt("NFTLiquidityPoolFactory", factoryAddress, deployer);
        console.log(`   ⚠️ NFTLiquidityPoolFactory (Proxy) já implantada. Carregada em: ${factoryAddress}`);
    }
    // --- (REFA) FIM: Implantação da Fábrica de Piscinas NFT ---
    
    console.log(`\n✅ Todos os Spokes implantados/carregados e endereços salvos.`);
    await sleep(DEPLOY_DELAY_MS);


    // ##############################################################
    // ### PARTE 2: CONFIGURAÇÃO DE CONEXÕES E POSSE ###
    // ##############################################################
    console.log("\n=== PARTE 2: CONFIGURANDO CONEXÕES E POSSE ===");

    await sleep(20000); // Pausa
    console.log("   (Pausa de 20s concluída. Retomando configuração...)");

    // 2.1. Conexões do Hub (EcosystemManager)
    console.log("\n2.1. Atualizando o Hub com todos os endereços...");
    await sendTransactionWithRetries(() => hub.setBKCTokenAddress(addresses.bkcToken)); 
    await sendTransactionWithRetries(() => hub.setDelegationManagerAddress(addresses.delegationManager)); 
    await sendTransactionWithRetries(() => hub.setMiningManagerAddress(addresses.miningManager)); 
    await sendTransactionWithRetries(() => hub.setRewardManagerAddress(addresses.rewardManager)); 
    await sendTransactionWithRetries(() => hub.setDecentralizedNotaryAddress(addresses.decentralizedNotary)); 
    await sendTransactionWithRetries(() => hub.setFortunePoolAddress(addresses.fortunePool)); 
    
    // --- (REFA) Atualiza o Cérebro com o endereço da FÁBRICA ---
    await sendTransactionWithRetries(() => hub.setNFTLiquidityPoolFactoryAddress(addresses.nftLiquidityPoolFactory)); 
    
    await sendTransactionWithRetries(() => hub.setRewardBoosterAddress(addresses.rewardBoosterNFT));
    console.log(`   ✅ Cérebro atualizado.`);

    // 2.2. Inicializar Spokes
    console.log("\n2.2. Inicializando todos os Spokes (DEFININDO O PROPRIETÁRIO)...");
    
    // (A lógica de inicialização para MiningManager, DelegationManager, RewardManager, Notary, FortunePool permanece a mesma)
    try {
        await sendTransactionWithRetries(() => miningManagerInstance.initialize(deployer.address, addresses.ecosystemManager));
        console.log(`   ✅ MiningManager inicializado.`);
    } catch (e: any) {
        if (e.message.includes("already initialized")) { console.log("   ⚠️ MiningManager já inicializado."); }
        else { throw e; }
    }

    try {
        await sendTransactionWithRetries(() => delegationManagerInstance.initialize(deployer.address, addresses.ecosystemManager));
        console.log(`   ✅ DelegationManager inicializado.`);
    } catch (e: any) {
        if (e.message.includes("already initialized")) { console.log("   ⚠️ DelegationManager já inicializado."); }
        else { throw e; }
    }

    try {
        await sendTransactionWithRetries(() => rewardManagerInstance.initialize(deployer.address, addresses.ecosystemManager));
        console.log(`   ✅ RewardManager inicializado.`);
    } catch (e: any) {
        if (e.message.includes("already initialized")) { console.log("   ⚠️ RewardManager já inicializado."); }
        else { throw e; }
    }
    
    try {
        await sendTransactionWithRetries(() => notaryInstance.initialize(deployer.address, addresses.ecosystemManager));
        console.log(`   ✅ DecentralizedNotary inicializado.`);
    } catch (e: any) {
        if (e.message.includes("already initialized")) { console.log("   ⚠️ DecentralizedNotary já inicializado."); }
        else { throw e; }
    }
    
    try {
        await sendTransactionWithRetries(() => fortunePoolInstance.initialize(deployer.address, addresses.ecosystemManager));
        console.log(`   ✅ FortunePoolV3 inicializado.`);
    } catch (e: any) {
        if (e.message.includes("already initialized")) { console.log("   ⚠️ FortunePoolV3 já inicializado."); }
        else { throw e; }
    }
    
    // --- (REFA) REMOVIDA a inicialização do nftLiquidityPoolInstance ---

    console.log(`   ✅ Spokes inicializados.`);


    // 2.3. Autorizando Miners no Guardião (MiningManager)
    // (Esta seção permanece 100% inalterada)
    console.log("\n2.3. Autorizando Spokes no Guardião (MiningManager)...");
    console.log(`   -> Autorizando VESTING_SERVICE...`);
    await sendTransactionWithRetries(() => miningManagerInstance.setAuthorizedMiner("VESTING_SERVICE", addresses.rewardManager)); 
    console.log(`   -> Autorizando TIGER_GAME_SERVICE...`);
    await sendTransactionWithRetries(() => miningManagerInstance.setAuthorizedMiner("TIGER_GAME_SERVICE", addresses.fortunePool)); 
    console.log(`   -> Autorizando NOTARY_SERVICE...`);
    await sendTransactionWithRetries(() => miningManagerInstance.setAuthorizedMiner("NOTARY_SERVICE", addresses.decentralizedNotary)); 
    console.log(`   ✅ Spokes autorizados.`);

    // 2.4. Transfer BKCToken Ownership to MiningManager
    // (Esta seção permanece 100% inalterada)
    console.log("\n2.4. (PASSO CRÍTICO) Transferindo posse do BKCToken para o MiningManager...");
    const currentOwner = await bkcTokenInstance.owner(); 
    if (currentOwner.toLowerCase() === deployer.address.toLowerCase()) {
        await sendTransactionWithRetries(() => bkcTokenInstance.transferOwnership(addresses.miningManager));
        console.log(`   ✅ POSSE TRANSFERIDA! MiningManager é o único minter.`);
    } else if (currentOwner.toLowerCase() === addresses.miningManager.toLowerCase()) {
        console.log(`   ⚠️ AVISO: POSSE JÁ TRANSFERIDA! MiningManager já é o proprietário. Continuando.`);
    } else {
        throw new Error(`❌ ERRO: A posse do BKCToken pertence a ${currentOwner}, não ao Deployer. Não é possível cunhar.`);
    }
    
    // 2.5. Mint TGE Supply
    // (Esta seção permanece 100% inalterada)
    console.log(`\n2.5. Cunhando TGE Supply (${ethers.formatEther(TGE_SUPPLY_AMOUNT)} BKC) para o MiningManager...`);
    try {
        await sendTransactionWithRetries(() => 
            miningManagerInstance.initialTgeMint(addresses.miningManager, TGE_SUPPLY_AMOUNT)
        );
        console.log(`   ✅ TGE de ${ethers.formatEther(TGE_SUPPLY_AMOUNT)} BKC cunhado PARA o MiningManager.`);
    } catch (e: any) {
        if (e.message.includes("TGE already minted")) { console.log("   ⚠️ TGE já cunhado."); }
        else { throw e; }
    }
    
    // 2.6. Distribuir TGE Supply do MiningManager
    // (Esta seção permanece 100% inalterada)
    console.log(`\n2.6. Distribuindo TGE Supply do Guardião (${ethers.formatEther(TGE_SUPPLY_AMOUNT)} BKC)...`);
    const totalLiquidityForDeployer = TOTAL_FORTUNE_LIQUIDITY + (LIQUIDITY_BKC_AMOUNT_PER_POOL * BigInt(ALL_TIERS.length));
    const airdropWallet = deployer.address; 
    
    if (TGE_SUPPLY_AMOUNT < totalLiquidityForDeployer) {
        throw new Error("Configuração de TGE inválida. O TGE é menor que a liquidez necessária.");
    }
    const remainingForAirdrop = TGE_SUPPLY_AMOUNT - totalLiquidityForDeployer;

    console.log(`   -> Transferindo ${ethers.formatEther(totalLiquidityForDeployer)} BKC do Guardião para o Deployer (para Liquidez)...`);
    try {
        await sendTransactionWithRetries(() => 
            miningManagerInstance.transferTokensFromGuardian(deployer.address, totalLiquidityForDeployer)
        );
        console.log(`   ✅ Deployer financiado.`);
    } catch (e: any) {
        if (e.message.includes("transfer amount exceeds balance")) {
             console.warn(`   ⚠️  Guardian não tem saldo TGE. A cunhagem (2.5) pode ter sido pulada.`);
        } else {
             console.warn(`   ⚠️  Falha ao transferir para Deployer (talvez já feito): ${e.message}`);
        }
    }
    
    if (remainingForAirdrop > 0n) {
        console.log(`   -> Transferindo ${ethers.formatEther(remainingForAirdrop)} BKC do Guardião para a Carteira de Airdrop (${airdropWallet})...`);
        try {
            await sendTransactionWithRetries(() => 
                miningManagerInstance.transferTokensFromGuardian(airdropWallet, remainingForAirdrop)
            );
             console.log(`   ✅ Airdrop financiado.`);
        } catch (e: any) {
             console.warn(`   ⚠️  Falha ao transferir para Airdrop (talvez já feito): ${e.message}`);
        }
    }
    
    // 2.7. Configurar Oráculo
    console.log("\n2.7. Autorizando Oráculo no FortunePoolV3 e definindo taxa...");
    // *** ESTA SEÇÃO FOI RESTAURADA *** (Estava comentada no seu arquivo original)
    try {
        await sendTransactionWithRetries(() => fortunePoolInstance.setOracleAddress(addresses.oracleWalletAddress));
        await sendTransactionWithRetries(() => fortunePoolInstance.setOracleFee(ethers.parseEther(FORTUNE_POOL_ORACLE_FEE_ETH)));
        console.log(`   ✅ Oráculo (${addresses.oracleWalletAddress}) autorizado com taxa de ${FORTUNE_POOL_ORACLE_FEE_ETH} ETH/BNB.`);
    } catch (e: any) { console.warn(`   ⚠️ Falha ao configurar oráculo (talvez já feito): ${e.message}`); }


    // ##############################################################
    // ### PARTE 3: CONFIGURAÇÃO DE TAXAS E REGRAS INICIAIS ###
    // ##############################################################
    console.log("\n=== PARTE 3: CONFIGURAÇÃO DE TAXAS E REGRAS INICIAIS ===");

    // 3.1. Configuração do Tiger Game
    console.log("\n3.1. Configurando as 3 piscinas de prêmios (Lógica 'Highest Prize Wins')...");
    // *** ESTA SEÇÃO FOI RESTAURADA *** (Estava comentada no seu arquivo original)
    try {
        const sortedConfig = LIQUIDITY_CONFIG.sort((a, b) => Number(a.poolId) - Number(b.poolId));
        for (const pool of sortedConfig) {
            await sendTransactionWithRetries(() => fortunePoolInstance.setPrizeTier(pool.poolId, pool.chanceDenominator, pool.multiplierBips));
            console.log(`   -> Tier ${pool.poolId} (Mult: ${Number(pool.multiplierBips)/10000}x) configurado.`);
        }
    } catch (e: any) { console.warn(`   ⚠️ Falha ao configurar Tiers (talvez já feito): ${e.message}`); }


    // 3.2. Configurando todas as taxas e pStake no Hub
    console.log("\n3.2. Configurando Taxas e Mínimos de pStake (Hub)...");
    // *** ESTA SEÇÃO FOI RESTAURADA *** (Estava comentada no seu arquivo original)
    try {
        await setService(hub, "NOTARY_SERVICE", SERVICE_SETTINGS.NOTARY_FEE, SERVICE_SETTINGS.NOTARY_SERVICE_PSTAKE);
        await setService(hub, "TIGER_GAME_SERVICE", SERVICE_SETTINGS.TIGER_GAME_SERVICE_FEE, SERVICE_SETTINGS.TIGER_GAME_SERVICE_PSTAKE);
        await setService(hub, "NFT_POOL_ACCESS", 0, SERVICE_SETTINGS.NFT_POOL_ACCESS_PSTAKE);
        console.log("\nConfigurando Taxas de Staking...");
        await setFee(hub, "UNSTAKE_FEE_BIPS", SERVICE_SETTINGS.UNSTAKE_FEE_BIPS);
        await setFee(hub, "FORCE_UNSTAKE_PENALTY_BIPS", SERVICE_SETTINGS.FORCE_UNSTAKE_PENALTY_BIPS);
        await setFee(hub, "CLAIM_REWARD_FEE_BIPS", SERVICE_SETTINGS.CLAIM_REWARD_FEE_BIPS);
        console.log("\nConfigurando Taxas do AMM NFT...");
        await setFee(hub, "NFT_POOL_TAX_BIPS", SERVICE_SETTINGS.NFT_POOL_TAX_BIPS);
        await setFee(hub, "NFT_POOL_TAX_TREASURY_SHARE_BIPS", SERVICE_SETTINGS.NFT_POOL_TAX_TREASURY_SHARE_BIPS);
        await setFee(hub, "NFT_POOL_TAX_DELEGATOR_SHARE_BIPS", SERVICE_SETTINGS.NFT_POOL_TAX_DELEGATOR_SHARE_BIPS);
        await setFee(hub, "NFT_POOL_TAX_LIQUIDITY_SHARE_BIPS", SERVICE_SETTINGS.NFT_POOL_TAX_LIQUIDITY_SHARE_BIPS);
        console.log(`   ✅ Todas as ${Object.keys(SERVICE_SETTINGS).length} regras e taxas foram definidas no Cérebro.`);
    } catch (e: any) { console.warn(`   ⚠️ Falha ao configurar Taxas (talvez já feito): ${e.message}`); }


    // ##############################################################
    // ### PARTE 4: ABASTECER O ECOSSISTEMA (LIQUIDEZ) ###
    // ##############################################################
    console.log("\n=== PARTE 4: ABASTECENDO O ECOSSISTEMA (LIQUIDEZ) ===");

    // 4.1. Liquidez do Fortune Pool
    console.log(`\n4.1. Abastecendo o FortunePool com ${ethers.formatEther(TOTAL_FORTUNE_LIQUIDITY)} $BKC...`);
    // (Esta seção permanece 100% inalterada)
    
    try {
        await sendTransactionWithRetries(() => 
            bkcTokenInstance.approve(addresses.fortunePool, TOTAL_FORTUNE_LIQUIDITY)
        );
        console.log(`   ✅ Aprovação do Deployer para FortunePool concluída.`);

        await sendTransactionWithRetries(() => fortunePoolInstance.topUpPool(TOTAL_FORTUNE_LIQUIDITY));
        console.log(`   ✅ Saldo de ${ethers.formatEther(TOTAL_FORTUNE_LIQUIDITY)} BKC injetado na PrizePool.`);
    } catch (e: any) {
        if (e.message.includes("transfer amount exceeds balance")) {
            console.warn(`   ⚠️  Deployer não tem saldo BKC. A distribuição (2.6) pode ter sido pulada.`);
        } else {
            console.warn(`   ⚠️  Falha ao abastecer FortunePool (talvez já feito): ${e.message}`);
        }
    }


    // 4.2. Liquidez do NFT AMM (Lógica de Teste de Cunhagem Manual)
    console.log("\n4.2. Cunhagem de NFTs e Abastecimento das Piscinas AMM (Modo Fábrica)...");

    const rewardBoosterNFT = await ethers.getContractAt("RewardBoosterNFT", addresses.rewardBoosterNFT, deployer);
    // Carrega a FÁBRICA
    const factoryInstanceLoaded = await ethers.getContractAt("NFTLiquidityPoolFactory", addresses.nftLiquidityPoolFactory, deployer);

    // --- (REFA) REMOVIDAS aprovações globais ---
    // A aprovação agora é feita DENTRO do loop para cada pool clone

    // Loop de Cunhagem e Adição de Liquidez (USANDO A LISTA MANUAL PARA TESTE)
    for (let i = 0; i < ALL_TIERS.length; i++) {
        const tier = ALL_TIERS[i];
        const initialMintAmount = MANUAL_LIQUIDITY_MINT_COUNT[i]; // QTD manual para teste

        console.log(`\n   --- Processando liquidez para: ${tier.name} (Tier ${tier.tierId}) ---`);
        
        if (initialMintAmount === 0n) { 
            console.log(`   ⚠️ Quantidade de cunhagem manual é zero. Pulando.`); 
            continue; 
        }

        // --- (REFA) INÍCIO: Lógica da Fábrica ---
        console.log(`      -> Verificando/Implantando Pool Clone para ${tier.boostBips} bips...`);
        let poolAddress = await factoryInstanceLoaded.getPoolAddress(tier.boostBips);
        
        if (poolAddress === ethers.ZeroAddress) {
            console.log(`         ... Piscina não encontrada. Implantando via Fábrica...`);
            const tx = await sendTransactionWithRetries(() => factoryInstanceLoaded.deployPool(tier.boostBips));
            
            // Encontra o endereço do novo clone a partir do evento
            const logs = (tx.logs as Log[])
                .map((log: Log) => { try { return factoryInstanceLoaded.interface.parseLog(log as any); } catch { return null; } })
                .filter((log: LogDescription | null): log is LogDescription => log !== null && log.name === "PoolDeployed");

            if (logs.length > 0) {
                poolAddress = logs[0].args.poolAddress;
                console.log(`         ✅ Piscina Clone implantada em: ${poolAddress}`);
            } else {
                throw new Error("Falha ao implantar a piscina: Evento 'PoolDeployed' não encontrado.");
            }
        } else {
            console.log(`         ... Piscina já existe em: ${poolAddress}`);
        }

        // Salva o endereço do pool individual no JSON
        const poolKey = `pool_${tier.name.toLowerCase()}`;
        addresses[poolKey] = poolAddress;
        fs.writeFileSync(addressesFilePath, JSON.stringify(addresses, null, 2));
        
        // Obtém a instância do NOVO POOL CLONE
        const poolInstance = await ethers.getContractAt("NFTLiquidityPool", poolAddress, deployer);
        
        // --- (REFA) FIM: Lógica da Fábrica ---

        // Verificação de Pool (agora no poolInstance)
        const poolInfo = await poolInstance.getPoolInfo(); // Não precisa de 'boostBips'
        
        // --- (REFA) REMOVIDA a chamada 'createPool' ---
        // A fábrica já faz isso

        if (poolInfo.nftCount > 0) { 
            console.warn(`   ⚠️ Pool em ${poolAddress} já tem liquidez. Pulando adição de AMM.`); 
            continue; 
        }
        
        console.log(`   NFTs para Cunhar (Teste Manual): ${initialMintAmount}`);

        // Cunhagem dos NFTs (Em lote) - Lógica inalterada
        const allPoolTokenIds: string[] = [];
        for (let j = 0n; j < initialMintAmount; j += CHUNK_SIZE_BIGINT) {
            const remaining = initialMintAmount - j;
            const amountToMint = remaining < CHUNK_SIZE_BIGINT ? remaining : CHUNK_SIZE_BIGINT;
            
            const receipt = await sendTransactionWithRetries(() =>
                rewardBoosterNFT.ownerMintBatch(deployer.address, Number(amountToMint), tier.boostBips, tier.metadata)
            );
            
            const tokenIdsInChunk = (receipt.logs as Log[])
                .map((log: Log) => { try { return rewardBoosterNFT.interface.parseLog(log as any); } catch { return null; } })
                .filter((log: LogDescription | null): log is LogDescription => log !== null && log.name === "BoosterMinted")
                .map((log: LogDescription) => log.args.tokenId.toString());
            allPoolTokenIds.push(...tokenIdsInChunk);
        }
        
        // Adição de Liquidez
        console.log(`      -> Adicionando ${allPoolTokenIds.length} NFTs e ${ethers.formatEther(LIQUIDITY_BKC_AMOUNT_PER_POOL)} BKC ao POOL CLONE em ${poolAddress}...`);
        
        // --- (REFA) INÍCIO: Aprovações por Pool ---
        console.log(`         ... Aprovando BKC para ${poolAddress}`);
        await sendTransactionWithRetries(() => bkcTokenInstance.approve(poolAddress, LIQUIDITY_BKC_AMOUNT_PER_POOL));
        console.log(`         ... Aprovando NFTs para ${poolAddress}`);
        await sendTransactionWithRetries(() => rewardBoosterNFT.setApprovalForAll(poolAddress, true));
        // --- (REFA) FIM: Aprovações por Pool ---

        let isFirstChunk = true;
        for (let k = 0; k < allPoolTokenIds.length; k += CHUNK_SIZE) {
            const chunk = allPoolTokenIds.slice(k, k + CHUNK_SIZE);
            if (isFirstChunk) {
                // O AMM (poolInstance) puxará BKC do saldo aprovado do Deployer.
                await sendTransactionWithRetries(() => 
                    poolInstance.addInitialLiquidity(chunk, LIQUIDITY_BKC_AMOUNT_PER_POOL) // Sem 'boostBips'
                );
                isFirstChunk = false;
            } else {
                await sendTransactionWithRetries(() => poolInstance.addMoreNFTsToPool(chunk)); // Sem 'boostBips'
            }
        }
        
        // --- (REFA) Revoga a aprovação deste pool específico
        await sendTransactionWithRetries(() => rewardBoosterNFT.setApprovalForAll(poolAddress, false));
        console.log(`   ✅ Liquidez para ${tier.name} adicionada e aprovação revogada.`);
    }
    
    // --- (REFA) REMOVIDA a revogação global no final ---

  } catch (error: any) {
    console.error("\n❌ Falha grave no Lançamento/Liquidação:", error.message);
    process.exit(1);
  }

  console.log("\n----------------------------------------------------");
  console.log("\n🎉🎉🎉 LANÇAMENTO DE ECOSSISTEMA E LIQUIDEZ PÓS-VENDA CONCLUÍDOS! 🎉🎉🎉");
  console.log("O ecossistema está totalmente implantado, configurado e abastecido.");
  console.log("\nPróximo passo: Execute '4_verify_contracts.ts' para verificar os contratos.");
}

// Bloco de entrada para execução standalone
if (require.main === module) {
  runScript(require("hardhat")).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}