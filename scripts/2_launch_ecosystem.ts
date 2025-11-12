// scripts/2_launch_ecosystem.ts
import { ethers, upgrades } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";
import { LogDescription, Log, ContractTransactionReceipt } from "ethers";

// ######################################################################
// ###               CONFIGURAÇÃO DO LANÇAMENTO PÓS-VENDA             ###
// ######################################################################

// ❌ REMOVIDO: A constante ORACLE_WALLET_ADDRESS foi removida daqui.
// O script agora lerá do 'deployment-addresses.json'.

// ✅ NOVO (OBRIGATÓRIO): A taxa em ETH/BNB que o usuário pagará por jogada
// (Ex: 0.001 ETH). Isso deve ser MAIOR que o custo de gás da Tx 2.
const FORTUNE_POOL_ORACLE_FEE_ETH = "0.001"; 


// --- 1. Configuração de URIs ---
const IPFS_BASE_URI_VESTING =
  "ipfs://bafybeiebqaxpruffltuzptttlebu24w4prwfebeevprmm7sudaxpzmg57a/"; 
const IPFS_BASE_URI_NOTARY =
  "ipfs://YOUR_NOTARY_METADATA_CID_HERE/";

// --- 2. Configuração do FortunePool ---
// ✅ ATUALIZADO: Agora são "Tiers" (Níveis) para a Piscina Única
const FORTUNE_TIER_CONFIG = [
  { tierId: 1, multiplierBips: 30000, chanceDenominator: 3 }, // 3x
  { tierId: 2, multiplierBips: 100000, chanceDenominator: 10 }, // 10x
  { tierId: 3, multiplierBips: 1000000, chanceDenominator: 100 }, // 100x
];
// ✅ ATUALIZADO: Total de 2 Milhões de BKC para a Piscina Única
const FORTUNE_POOL_TOTAL_LIQUIDITY = ethers.parseEther("2000000"); 

// --- 3. Configuração do AMM (NFTLiquidityPool) ---
const LIQUIDITY_BKC_PER_POOL = ethers.parseEther("2000000"); // 2 Milhões de BKC por pool
const NFT_MINT_CHUNK_SIZE = 150;
const NFT_MINT_CHUNK_SIZE_BIGINT = BigInt(NFT_MINT_CHUNK_SIZE);

// ✅ SEU PASSO MANUAL (Defina os valores de teste aqui)
// (10 para o mais alto, 20 para o próximo, etc.)
const AMM_LIQUIDITY_TO_MINT = [
  { boostBips: 5000n, metadata: "diamond_booster.json", amountToMint: 10n }, 
  { boostBips: 4000n, metadata: "platinum_booster.json", amountToMint: 20n },
  { boostBips: 3000n, metadata: "gold_booster.json", amountToMint: 30n },
  { boostBips: 2000n, metadata: "silver_booster.json", amountToMint: 40n },
  { boostBips: 1000n, metadata: "bronze_booster.json", amountToMint: 50n },
  { boostBips: 500n, metadata: "iron_booster.json", amountToMint: 60n },
  { boostBips: 100n, metadata: "crystal_booster.json", amountToMint: 70n }, 
];
// ######################################################################


// --- 4. Configuração de Taxas do Ecossistema ---
const SERVICE_SETTINGS = {
  NOTARY_SERVICE_FEE: ethers.parseUnits("100", 18),
  NOTARY_SERVICE_PSTAKE: BigInt(10000),
  FORTUNE_POOL_SERVICE_FEE: BigInt(0), 
  FORTUNE_POOL_SERVICE_PSTAKE: BigInt(10000),
  UNSTAKE_FEE_BIPS: BigInt(100),
  FORCE_UNSTAKE_PENALTY_BIPS: BigInt(5000),
  CLAIM_REWARD_FEE_BIPS: BigInt(50),
  NFT_POOL_ACCESS_PSTAKE: BigInt(10000),
  NFT_POOL_TAX_BIPS: BigInt(1000),
  NFT_POOL_TAX_TREASURY_SHARE_BIPS: BigInt(4000),
  NFT_POOL_TAX_DELEGATOR_SHARE_BIPS: BigInt(4000),
};
// ######################################################################

// Helper functions (sem alteração)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DEPLOY_DELAY_MS = 2000;
async function setService(manager: any, serviceKey: string, feeValue: number | bigint, pStakeValue: number | bigint) {
  console.log(`\n   -> Configurando Serviço: ${serviceKey}...`);
  let tx = await manager.setFee(serviceKey, feeValue);
  await tx.wait();
  console.log(`      Taxa definida: ${feeValue.toString()}`);
  tx = await manager.setPStakeMinimum(serviceKey, pStakeValue);
  await tx.wait();
  console.log(`      pStake definido: ${pStakeValue}`);
}
async function setFee(manager: any, key: string, value: number | bigint) {
   let tx = await manager.setFee(key, value);
   await tx.wait();
   console.log(`   -> Taxa definida: ${key} = ${value.toString()}`);
}
async function addLiquidityInChunks(
  nftLiquidityPoolInstance: any,
  boostBips: bigint,
  allPoolTokenIds: bigint[],
  bkcAmount: bigint
): Promise<void> { 
  let isFirstChunk: boolean = true;
  let chunkIndex: number = 0;
  const totalTokens: number = allPoolTokenIds.length;
  while (chunkIndex < totalTokens) {
    const endIndex: number = Math.min(chunkIndex + NFT_MINT_CHUNK_SIZE, totalTokens);
    const chunk: bigint[] = allPoolTokenIds.slice(
      chunkIndex as any as number, 
      endIndex as any as number
    );
    if (chunk.length === 0) { break; }
    if (isFirstChunk) {
      const tx = await nftLiquidityPoolInstance.addInitialLiquidity(
        boostBips, chunk, bkcAmount
      );
      await tx.wait();
      isFirstChunk = false;
    } else {
      const tx = await nftLiquidityPoolInstance.addMoreNFTsToPool(boostBips, chunk);
      await tx.wait();
    }
    chunkIndex = endIndex;
  }
}


export async function runScript(hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;

  console.log(
    `🚀 (FASE 2) Implantando e Configurando o ECOSSISTEMA (Pós-Venda) na rede: ${networkName}`
  );
  console.log(`Usando a conta: ${deployer.address}`);
  console.log("----------------------------------------------------");

  // ✅ CORREÇÃO: A verificação de taxa permanece
  if (!FORTUNE_POOL_ORACLE_FEE_ETH || ethers.parseEther(FORTUNE_POOL_ORACLE_FEE_ETH) <= 0n) {
       throw new Error("ERRO: Por favor, defina um valor para 'FORTUNE_POOL_ORACLE_FEE_ETH' (linha 18).");
  }


  // --- 0. Carregar Endereços da Pré-Venda ---
  const addressesFilePath = path.join(
    __dirname,
    "../deployment-addresses.json"
  );
  if (!fs.existsSync(addressesFilePath)) {
    throw new Error("Missing deployment-addresses.json. Run 1_deploy_presale.ts first.");
  }
  const addresses: { [key: string]: string } = JSON.parse(
    fs.readFileSync(addressesFilePath, "utf8")
  );

  // ✅ CORREÇÃO: Lê o 'oracleWalletAddress' e 'mainLPPairAddress' do JSON
  const { 
    ecosystemManager, 
    rewardBoosterNFT, 
    publicSale, 
    mainLPPairAddress, 
    oracleWalletAddress // <-- LIDO AQUI
  } = addresses;
  
  if (!ecosystemManager || !rewardBoosterNFT || !publicSale) {
    throw new Error("Presale addresses (ecosystemManager, rewardBoosterNFT, publicSale) not found in JSON. Rerun presale script.");
  }
  
  // ✅ CORREÇÃO: Nova verificação de segurança para o JSON
  if (!oracleWalletAddress || oracleWalletAddress.length < 42 || oracleWalletAddress.startsWith("0x...")) {
      throw new Error("ERRO: O 'oracleWalletAddress' não foi definido no seu 'deployment-addresses.json'. Por favor, adicione-o manualmente.");
  }
  // ✅ CORREÇÃO: A verificação do 'mainLPPairAddress' (agora 'swapLink') foi removida.
  

  const hub = await ethers.getContractAt("EcosystemManager", ecosystemManager, deployer);
  let tx: any;
  let bkcTokenInstance: any;

  try {
    // ##############################################################
    // ### PASSO 1: IMPLANTAR NOVOS CONTRATOS (Token e Spokes UUPS) ###
    // ##############################################################
    console.log("=== PASSO 1: IMPLANTANDO CONTRATOS DO ECOSSISTEMA ===");

    // 1.1. Implantar BKCToken (como Proxy)
    console.log("\n1. Implantando BKCToken (como Proxy)...");
    const BKCToken = await ethers.getContractFactory("BKCToken");
    bkcTokenInstance = await upgrades.deployProxy(
        BKCToken,
        [deployer.address], 
        { initializer: "initialize" }
    );
    await bkcTokenInstance.waitForDeployment();
    addresses.bkcToken = await bkcTokenInstance.getAddress();
    console.log(`   ✅ BKCToken (Proxy) implantado em: ${addresses.bkcToken}`);
    console.log(`   ✅ BKCToken inicializado (TGE mintado para o deployer).`);
    await sleep(DEPLOY_DELAY_MS);
    
    // 1.2. Implantar MiningManager ...
    console.log("\n2. Implantando MiningManager (Guardião UUPS) (sem inicializar)...");
    const MiningManager = await ethers.getContractFactory("MiningManager");
    const miningManager = await upgrades.deployProxy(
      MiningManager, [], { initializer: false, kind: "uups" }
    );
    await miningManager.waitForDeployment();
    addresses.miningManager = await miningManager.getAddress();
    console.log(`   ✅ MiningManager (Proxy) implantado em: ${addresses.miningManager}`);
    await sleep(DEPLOY_DELAY_MS);

    // 1.3. Implantar DelegationManager ...
    console.log("\n3. Implantando DelegationManager (Pools UUPS) (sem inicializar)...");
    const DelegationManager = await ethers.getContractFactory("DelegationManager");
    const delegationManager = await upgrades.deployProxy(
      DelegationManager, [], { initializer: false, kind: "uups" }
    );
    await delegationManager.waitForDeployment();
    addresses.delegationManager = await delegationManager.getAddress();
    console.log(`   ✅ DelegationManager (Proxy) implantado em: ${addresses.delegationManager}`);
    await sleep(DEPLOY_DELAY_MS);

    // 1.4. Implantar RewardManager ...
    console.log("\n4. Implantando RewardManager (Vesting UUPS) (sem inicializar)...");
    const RewardManager = await ethers.getContractFactory("RewardManager");
    const rewardManager = await upgrades.deployProxy(
      RewardManager, [], { initializer: false, kind: "uups" }
    );
    await rewardManager.waitForDeployment();
    addresses.rewardManager = await rewardManager.getAddress();
    console.log(`   ✅ RewardManager (Proxy) implantado em: ${addresses.rewardManager}`);
    await sleep(DEPLOY_DELAY_MS);

    // 1.5. Implantar DecentralizedNotary ...
    console.log("\n5. Implantando DecentralizedNotary (Cartório UUPS) (sem inicializar)...");
    const DecentralizedNotary = await ethers.getContractFactory("DecentralizedNotary");
    const decentralizedNotary = await upgrades.deployProxy(
      DecentralizedNotary, [], { initializer: false, kind: "uups" }
    );
    await decentralizedNotary.waitForDeployment();
    addresses.decentralizedNotary = await decentralizedNotary.getAddress();
    console.log(`   ✅ DecentralizedNotary (Proxy) implantado em: ${addresses.decentralizedNotary}`);
    await sleep(DEPLOY_DELAY_MS);

    // ✅ ALTERAÇÃO: Implantando FortunePoolV3
    console.log("\n6. Implantando FortunePoolV3 (Oráculo UUPS) (sem inicializar)...");
    const FortunePoolV3 = await ethers.getContractFactory("FortunePoolV3");
    const fortunePool = await upgrades.deployProxy(
      FortunePoolV3, // <-- Novo contrato
      [], 
      { initializer: false, kind: "uups" }
    );
    await fortunePool.waitForDeployment();
    addresses.fortunePool = await fortunePool.getAddress();
    console.log(`   ✅ FortunePoolV3 (Proxy) implantado em: ${addresses.fortunePool}`);
    await sleep(DEPLOY_DELAY_MS);

    // 1.7. Implantar NFTLiquidityPool ...
    console.log("\n7. Implantando NFTLiquidityPool (AMM UUPS) (sem inicializar)...");
    const NFTLiquidityPool = await ethers.getContractFactory("NFTLiquidityPool");
    const nftLiquidityPool = await upgrades.deployProxy(
      NFTLiquidityPool, [], { initializer: false, kind: "uups" }
    );
    await nftLiquidityPool.waitForDeployment();
    addresses.nftLiquidityPool = await nftLiquidityPool.getAddress();
    console.log(`   ✅ NFTLiquidityPool (Proxy) implantado em: ${addresses.nftLiquidityPool}`);
    
    // Sobrescreve o JSON com os novos endereços, mantendo os antigos
    const finalAddresses = { ...addresses, ...{
        bkcToken: addresses.bkcToken,
        miningManager: addresses.miningManager,
        delegationManager: addresses.delegationManager,
        rewardManager: addresses.rewardManager,
        decentralizedNotary: addresses.decentralizedNotary,
        fortunePool: addresses.fortunePool,
        nftLiquidityPool: addresses.nftLiquidityPool
    }};
    fs.writeFileSync(addressesFilePath, JSON.stringify(finalAddresses, null, 2));

    // ##############################################################
    // ### PASSO 2: CONFIGURAR CONEXÕES E REGRAS DO SISTEMA       ###
    // ##############################################################
    console.log("\n=== PASSO 2: CONFIGURANDO CONEXÕES E REGRAS DO SISTEMA ===");

    console.log("\n2.1. Atualizando o Cérebro (EcosystemManager) com todos os endereços...");
    
    tx = await hub.setBKCTokenAddress(addresses.bkcToken); await tx.wait();
    tx = await hub.setDelegationManagerAddress(addresses.delegationManager); await tx.wait();
    tx = await hub.setMiningManagerAddress(addresses.miningManager); await tx.wait();
    console.log(`   ✅ Cérebro atualizado com todos os endereços de produção.`);
    await sleep(DEPLOY_DELAY_MS);

    // ✅ NOVO PASSO: Inicializar todos os Spokes agora que o Cérebro está pronto.
    console.log("\n=== PASSO 2.5: INICIALIZANDO SPOKES MANUALMENTE ===");

    console.log("   -> Inicializando MiningManager...");
    const miningManagerInstance = await ethers.getContractAt("MiningManager", addresses.miningManager, deployer);
    tx = await miningManagerInstance.initialize(deployer.address, addresses.ecosystemManager); await tx.wait();

    console.log("   -> Inicializando DelegationManager...");
    const delegationManagerInstance = await ethers.getContractAt("DelegationManager", addresses.delegationManager, deployer);
    tx = await delegationManagerInstance.initialize(deployer.address, addresses.ecosystemManager); await tx.wait();

    console.log("   -> Inicializando RewardManager...");
    const rewardManagerInstance = await ethers.getContractAt("RewardManager", addresses.rewardManager, deployer);
    tx = await rewardManagerInstance.initialize(deployer.address, addresses.ecosystemManager); await tx.wait();

    // ✅ ALTERAÇÃO: Instanciando FortunePoolV3
    console.log("   -> Inicializando FortunePoolV3...");
    const fortunePoolInstance = await ethers.getContractAt("FortunePoolV3", addresses.fortunePool, deployer);
    tx = await fortunePoolInstance.initialize(deployer.address, addresses.ecosystemManager); await tx.wait();

    console.log("   -> Inicializando NFTLiquidityPool...");
    const nftLiquidityPoolInstance = await ethers.getContractAt("NFTLiquidityPool", addresses.nftLiquidityPool, deployer);
    tx = await nftLiquidityPoolInstance.initialize(deployer.address, addresses.ecosystemManager); await tx.wait();

    console.log("   -> Inicializando DecentralizedNotary (com args corrigidos)...");
    const notaryInstance = await ethers.getContractAt("DecentralizedNotary", addresses.decentralizedNotary, deployer);
    tx = await notaryInstance.initialize(deployer.address, addresses.ecosystemManager); await tx.wait();
    
    console.log(`   ✅ Todos os spokes foram inicializados.`);
    await sleep(DEPLOY_DELAY_MS);

    // (O passo 2.2 original vem aqui)
    console.log("\n2.2. Autorizando Spokes no Guardião (MiningManager)...");
    tx = await miningManagerInstance.setAuthorizedMiner("VESTING_SERVICE", addresses.rewardManager); await tx.wait();
    tx = await miningManagerInstance.setAuthorizedMiner("FORTUNE_POOL_SERVICE", addresses.fortunePool); await tx.wait();
    tx = await miningManagerInstance.setAuthorizedMiner("NOTARY_SERVICE", addresses.decentralizedNotary); await tx.wait();
    console.log(`   ✅ Todos os Spokes autorizados no MiningManager.`);
    await sleep(DEPLOY_DELAY_MS);

    console.log("\n2.3. Definindo URIs de Metadados (Vesting)...");
    tx = await rewardManagerInstance.setBaseURI(IPFS_BASE_URI_VESTING); await tx.wait();
    console.log(`   ✅ URIs de Vesting definida.`);
    console.log(`   (URI do Notary é definida dinamicamente em cada mint)`);
    await sleep(DEPLOY_DELAY_MS);

    console.log("\n2.4. Configurando todas as taxas e regras de pStake no Cérebro...");
    await setService(hub, "NOTARY_SERVICE", SERVICE_SETTINGS.NOTARY_SERVICE_FEE, SERVICE_SETTINGS.NOTARY_SERVICE_PSTAKE);
    await setService(hub, "FORTUNE_POOL_SERVICE", SERVICE_SETTINGS.FORTUNE_POOL_SERVICE_FEE, SERVICE_SETTINGS.FORTUNE_POOL_SERVICE_PSTAKE);
    await setFee(hub, "UNSTAKE_FEE_BIPS", SERVICE_SETTINGS.UNSTAKE_FEE_BIPS);
    await setFee(hub, "FORCE_UNSTAKE_PENALTY_BIPS", SERVICE_SETTINGS.FORCE_UNSTAKE_PENALTY_BIPS);
    await setFee(hub, "CLAIM_REWARD_FEE_BIPS", SERVICE_SETTINGS.CLAIM_REWARD_FEE_BIPS);
    await setService(hub, "NFT_POOL_ACCESS", BigInt(0), SERVICE_SETTINGS.NFT_POOL_ACCESS_PSTAKE);
    await setFee(hub, "NFT_POOL_TAX_BIPS", SERVICE_SETTINGS.NFT_POOL_TAX_BIPS);
    await setFee(hub, "NFT_POOL_TAX_TREASURY_SHARE_BIPS", SERVICE_SETTINGS.NFT_POOL_TAX_TREASURY_SHARE_BIPS);
    await setFee(hub, "NFT_POOL_TAX_DELEGATOR_SHARE_BIPS", SERVICE_SETTINGS.NFT_POOL_TAX_DELEGATOR_SHARE_BIPS);
    console.log(`   ✅ Todas as taxas e regras de pStake foram definidas.`);
    await sleep(DEPLOY_DELAY_MS);
    
    console.log("\n2.6. (PASSO CRÍTICO) Transferindo posse do BKCToken para o MiningManager...");
    tx = await bkcTokenInstance.transferOwnership(addresses.miningManager);
    await tx.wait();
    console.log(`   ✅ POSSE TRANSFERIDA! O MiningManager (${addresses.miningManager}) é agora o único minter.`);
    await sleep(DEPLOY_DELAY_MS);
    
    // ✅ NOVO: PASSO 2.7 - Autorizando o Oráculo no FortunePoolV3
    console.log("\n2.7. (PASSO CRÍTICO) Autorizando o Oráculo no FortunePoolV3...");
    // ✅ CORREÇÃO: Lendo 'addresses.oracleWalletAddress' do JSON
    tx = await fortunePoolInstance.setOracleAddress(addresses.oracleWalletAddress);
    await tx.wait();
    console.log(`   ✅ ORÁCULO AUTORIZADO: Endereço ${addresses.oracleWalletAddress} pode agora chamar 'fulfillGame'.`);
    await sleep(DEPLOY_DELAY_MS);

    // ✅ NOVO: PASSO 2.8 - Definindo a taxa de Gás do Oráculo
    console.log("\n2.8. (PASSO CRÍTICO) Definindo Taxa de Gás do Oráculo no FortunePoolV3...");
    const feeInWei = ethers.parseEther(FORTUNE_POOL_ORACLE_FEE_ETH);
    tx = await fortunePoolInstance.setOracleFee(feeInWei);
    await tx.wait();
    console.log(`   ✅ TAXA DE GÁS DEFINIDA: Usuários pagarão ${FORTUNE_POOL_ORACLE_FEE_ETH} ETH/BNB por jogada.`);
    await sleep(DEPLOY_DELAY_MS);


    // ##############################################################
    // ### PASSO 3: ABASTECER O ECOSSISTEMA (SEED LIQUIDITY)      ###
    // ##############################################################
    console.log("\n=== PASSO 3: ABASTECENDO O ECOSSISTEMA (LIQUIDEZ) ===");

    console.log(`\n1. Abastecendo o FortunePool com ${ethers.formatEther(FORTUNE_POOL_TOTAL_LIQUIDITY)} BKC...`);
    tx = await bkcTokenInstance.approve(addresses.fortunePool, FORTUNE_POOL_TOTAL_LIQUIDITY);
    await tx.wait();
    console.log(`   -> Aprovação de BKC para o FortunePool... OK.`);
    
    // ✅ ALTERAÇÃO: Configurando Tiers (em vez de Pools)
    for (const tier of FORTUNE_TIER_CONFIG) {
        tx = await fortunePoolInstance.setPrizeTier(
            BigInt(tier.tierId), 
            BigInt(tier.chanceDenominator),
            BigInt(tier.multiplierBips)
        );
        await tx.wait();
        console.log(`   -> Tier ${tier.tierId} (Chance: 1/${tier.chanceDenominator}, Mult: ${tier.multiplierBips} bips) configurado.`);
    }
    
    // ✅ ALTERAÇÃO: Chamando 'topUpPool' (singular)
    tx = await fortunePoolInstance.topUpPool(FORTUNE_POOL_TOTAL_LIQUIDITY);
    await tx.wait();
    console.log(`   ✅ FortunePool (Piscina Única) abastecido com ${ethers.formatEther(FORTUNE_POOL_TOTAL_LIQUIDITY)} BKC.`);
    await sleep(DEPLOY_DELAY_MS);


    console.log("\n2. Abastecendo o NFTLiquidityPool (AMM)...");
    const boosterNFTInstance = await ethers.getContractAt("RewardBoosterNFT", addresses.rewardBoosterNFT, deployer);

    const totalBkcApproval = LIQUIDITY_BKC_PER_POOL * BigInt(AMM_LIQUIDITY_TO_MINT.length);
    console.log(`   -> Aprovando ${ethers.formatEther(totalBkcApproval)} BKC para o AMM...`);
    tx = await bkcTokenInstance.approve(addresses.nftLiquidityPool, totalBkcApproval);
    await tx.wait();
    console.log(`   -> Aprovando TODOS os NFTs (futuros) para o AMM...`);
    tx = await boosterNFTInstance.setApprovalForAll(addresses.nftLiquidityPool, true);
    await tx.wait();

    // ✅ ALTERAÇÃO: O loop agora usa sua configuração manual 'AMM_LIQUIDITY_TO_MINT'
    for (const tier of AMM_LIQUIDITY_TO_MINT) {
      console.log(`\n   --- Processando liquidez do AMM para: ${tier.metadata} ---`);

      const poolInfo = await nftLiquidityPoolInstance.pools(tier.boostBips);
      if (!poolInfo.isInitialized) {
        tx = await nftLiquidityPoolInstance.createPool(tier.boostBips);
        await tx.wait();
        console.log(`      -> Estrutura de Pool (ID ${tier.boostBips}) criada.`);
      } else {
        console.log(`      -> Estrutura de Pool (ID ${tier.boostBips}) já existe.`);
      }
      
      const unsoldAmount = tier.amountToMint; 
      console.log(`      Decisão Manual: Adicionar ${unsoldAmount} NFTs ao pool.`);

      if (unsoldAmount <= 0n) {
        console.log(`      ⚠️ AVISO: Quantidade definida como 0. Pulando este tier.`);
        continue;
      }

      console.log(`      -> Cunhando ${unsoldAmount} NFTs (sobras) para o deployer...`);
      
      const allPoolTokenIds: bigint[] = []; 
      
      for (let i = 0n; i < unsoldAmount; i += NFT_MINT_CHUNK_SIZE_BIGINT) {
        const remaining = unsoldAmount - i;
        const amountToMint: bigint = remaining < NFT_MINT_CHUNK_SIZE_BIGINT ? remaining : NFT_MINT_CHUNK_SIZE_BIGINT;
        
        const mintTx = await boosterNFTInstance.ownerMintBatch(
          deployer.address, amountToMint, tier.boostBips, tier.metadata
        );
        const receipt = await mintTx.wait() as ContractTransactionReceipt;
        
        const tokenIdsInChunk = (receipt?.logs as Log[])
            .map((log: Log) => {
                try { return boosterNFTInstance.interface.parseLog(log as any); } catch { return null; }
            })
            .filter((log: LogDescription | null): log is LogDescription => log !== null && log.name === "BoosterMinted")
            .map((log: LogDescription) => BigInt(log.args.tokenId.toString())); 
            
        allPoolTokenIds.push(...tokenIdsInChunk);
      }
      console.log(`      -> ${allPoolTokenIds.length} NFTs cunhados.`);

      console.log(`      -> Adicionando ${allPoolTokenIds.length} NFTs e ${ethers.formatEther(LIQUIDITY_BKC_PER_POOL)} BKC ao AMM...`);
      
      await addLiquidityInChunks(
        nftLiquidityPoolInstance, tier.boostBips, allPoolTokenIds, LIQUIDITY_BKC_PER_POOL
      );
      
      console.log(`      ✅ Liquidez para ${tier.metadata} adicionada com sucesso.`);
    }

    tx = await boosterNFTInstance.setApprovalForAll(addresses.nftLiquidityPool, false);
    await tx.wait();
    console.log(`\n   ✅ Aprovação de NFTs para o AMM revogada (Segurança).`);
    
    console.log("\n   -> Posse do RewardBoosterNFT mantida (fábrica aberta).");

    console.log("----------------------------------------------------");
    console.log("\n🎉🎉🎉 SCRIPT PÓS-VENDA CONCLUÍDO! 🎉🎉🎉");
    console.log("O ecossistema está totalmente implantado, configurado e abastecido.");
    console.log("\nLembrete: Crie o LP (BKC/BNB) na DEX e atualize o 'swapLink' no JSON.");
    console.log("Próximo passo: Execute '3_verify_contracts.ts' e '4_manage_rules.ts'.");

  } catch (error: any) {
    console.error("\n❌ Falha grave no script Pós-Venda:", error.message);
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