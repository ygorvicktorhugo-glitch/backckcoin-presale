// scripts/1_deploy_full_initial_setup.ts (FUSÃO: Core + Pré-Venda)
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";
import { BigNumberish } from "ethers";

// Helper function for delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DEPLOY_DELAY_MS = 2000;

// ######################################################################
// ### CONFIGURAÇÃO DA PRÉ-VENDA (FASE 1)
// ######################################################################

const IPFS_BASE_URI_BOOSTERS =
  "ipfs://bafybeigf3n2q2cbsnsmqytv57e6dvuimtzsg6pp7iyhhhmqpaxgpzlmgem/"; // SEU CID AQUI

// ✅ ORACLE ADDRESS PADRÃO 
const DEFAULT_ORACLE_ADDRESS = "0xd7e622124b78a28c4c928b271fc9423285804f98";

const TIERS_TO_SETUP = [
  { tierId: 0, maxSupply: 1000000, priceETH: "3.60", boostBips: 5000, metadata: "diamond_booster.json" },
  { tierId: 1, maxSupply: 1000000, priceETH: "1.44", boostBips: 4000, metadata: "platinum_booster.json" },
  { tierId: 2, maxSupply: 1000000, priceETH: "0.54", boostBips: 3000, metadata: "gold_booster.json" },
  { tierId: 3, maxSupply: 1000000, priceETH: "0.27", boostBips: 2000, metadata: "silver_booster.json" },
  { tierId: 4, maxSupply: 1000000, priceETH: "0.144", boostBips: 1000, metadata: "bronze_booster.json" },
  { tierId: 5, maxSupply: 1000000, priceETH: "0.07", boostBips: 500, metadata: "iron_booster.json" },
  { tierId: 6, maxSupply: 1000000, priceETH: "0.01", boostBips: 100, metadata: "crystal_booster.json" },
];

// ######################################################################

const addressesFilePath = path.join(
    __dirname,
    "../deployment-addresses.json"
);

// Função para deletar o arquivo de endereços em caso de erro
function deleteAddressesFileOnError() {
    if (fs.existsSync(addressesFilePath)) {
        fs.unlinkSync(addressesFilePath);
        console.log("\n==========================================================");
        console.log("🗑️ ARQUIVO 'deployment-addresses.json' DELETADO AUTOMATICAMENTE.");
        console.log("⚠️ Você pode rodar o script novamente.");
        console.log("==========================================================");
    }
}

export async function runScript(hre: HardhatRuntimeEnvironment) {
  // ✅ CORREÇÃO: Acessando ethers e upgrades via hre
  const { ethers, upgrades } = hre; 
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;

  console.log(
    `🚀 (FUSÃO CORE/PRÉ-VENDA) Implantando e Configurando o Setup Inicial na rede: ${networkName}`
  );
  console.log(`Usando a conta: ${deployer.address}`);
  console.log("----------------------------------------------------");

  if (!IPFS_BASE_URI_BOOSTERS.includes("ipfs://")) {
    throw new Error("IPFS_BASE_URI_BOOSTERS must be set and start with 'ipfs://'");
  }

  const addresses: { [key: string]: string } = {};
  
  // Garante que o arquivo de endereços é iniciado ou limpo antes do deploy
  if (fs.existsSync(addressesFilePath)) {
       fs.unlinkSync(addressesFilePath);
       console.log(`(Limpeza: 'deployment-addresses.json' anterior deletado)`);
  }
  fs.writeFileSync(addressesFilePath, JSON.stringify({}, null, 2));


  let boosterNFT: any;
  let saleContract: any;
  let bkcTokenInstance: any;
  // Variável 'tx' declarada com 'let' para permitir reatribuição
  let tx; 

  try {
    // =================================================================
    // === PASSO 1: IMPLANTAR CONTRATOS CHAVE E PRÉ-VENDA (PROXIES) ===
    // =================================================================

    // 1.1. EcosystemManager (Hub)
    console.log("1.1. Implantando EcosystemManager (Cérebro UUPS)...");
    const EcosystemManager = await ethers.getContractFactory("EcosystemManager");
    const ecosystemManager = await upgrades.deployProxy(
      EcosystemManager,
      [deployer.address],
      { initializer: "initialize", kind: "uups" }
    );
    await ecosystemManager.waitForDeployment();
    addresses.ecosystemManager = await ecosystemManager.getAddress();
    fs.writeFileSync(addressesFilePath, JSON.stringify(addresses, null, 2)); // Salva após cada deploy
    console.log(`   ✅ EcosystemManager (Proxy) implantado em: ${addresses.ecosystemManager}`);
    await sleep(DEPLOY_DELAY_MS);

    // 1.2. RewardBoosterNFT (Fábrica)
    console.log("\n1.2. Implantando RewardBoosterNFT (Fábrica) como Proxy...");
    const RewardBoosterNFT = await ethers.getContractFactory("RewardBoosterNFT");
    boosterNFT = await upgrades.deployProxy(
        RewardBoosterNFT,
        [deployer.address], // Argumentos para a função initialize
        { initializer: "initialize" } 
    );
    await boosterNFT.waitForDeployment();
    addresses.rewardBoosterNFT = await boosterNFT.getAddress();
    fs.writeFileSync(addressesFilePath, JSON.stringify(addresses, null, 2));
    console.log(`   ✅ RewardBoosterNFT (Proxy) implantado em: ${addresses.rewardBoosterNFT}`);
    await sleep(DEPLOY_DELAY_MS);

    // 1.3. PublicSale (Loja)
    console.log("\n1.3. Implantando PublicSale (Loja UUPS)...");
    const PublicSale = await ethers.getContractFactory("PublicSale");
    saleContract = await upgrades.deployProxy(
      PublicSale,
      [
        addresses.rewardBoosterNFT,
        addresses.ecosystemManager,
        deployer.address
      ],
      { initializer: "initialize", kind: "uups" }
    );
    await saleContract.waitForDeployment();
    addresses.publicSale = await saleContract.getAddress();
    fs.writeFileSync(addressesFilePath, JSON.stringify(addresses, null, 2));
    console.log(`   ✅ PublicSale (Proxy) implantado em: ${addresses.publicSale}`);
    await sleep(DEPLOY_DELAY_MS);

    // =================================================================
    // === PASSO 2: IMPLANTAR CORE UTILITIES (FUSÃO DE 1_deploy_core.ts) ===
    // =================================================================

    // 2.1. BKCToken (Necessário para a Faucet) - Usando Proxy para consistência
    console.log("\n2.1. Implantando BKCToken (Proxy) (Necessário para a Faucet)...");
    const BKCToken = await ethers.getContractFactory("BKCToken");
    bkcTokenInstance = await upgrades.deployProxy(
        BKCToken,
        [deployer.address], 
        { initializer: "initialize" }
    );
    await bkcTokenInstance.waitForDeployment();
    addresses.bkcToken = await bkcTokenInstance.getAddress();
    fs.writeFileSync(addressesFilePath, JSON.stringify(addresses, null, 2));
    console.log(`   ✅ BKCToken (Proxy) implantado em: ${addresses.bkcToken}`);
    await sleep(DEPLOY_DELAY_MS);
    
    // 2.2. SimpleBKCFaucet
    console.log("\n2.2. Implantando SimpleBKCFaucet (Utility/Core) como Proxy...");
    const SimpleBKCFaucet = await ethers.getContractFactory("SimpleBKCFaucet");

    const simpleBKCFaucet = await upgrades.deployProxy(
        SimpleBKCFaucet,
        [addresses.bkcToken, deployer.address], // args para: initialize(address _tokenAddress, address _initialOwner)
        { initializer: "initialize", kind: "uups" }
    );

    await simpleBKCFaucet.waitForDeployment();
    addresses.faucet = await simpleBKCFaucet.getAddress();
    fs.writeFileSync(addressesFilePath, JSON.stringify(addresses, null, 2));
    console.log(`   ✅ SimpleBKCFaucet (Proxy) implantado em: ${addresses.faucet}`);
    await sleep(DEPLOY_DELAY_MS);


    // =================================================================
    // === PASSO 3: SALVAR ENDEREÇOS (INCLUINDO O ORACLE SOLICITADO) ===
    // =================================================================
    
    // ✅ Adiciona o Endereço do Oráculo
    addresses.oracleWalletAddress = DEFAULT_ORACLE_ADDRESS;
    console.log(`\n3.1. Endereço do Oráculo salvo como: ${addresses.oracleWalletAddress}`);
    
    // ✅ NOVO: Adiciona o link de swap com a chain ID correta (Solicitado)
    addresses.bkcDexPoolAddress = "https://pancakeswap.finance/swap?chain=bsc";
    console.log(`   Link DEX (bkcDexPoolAddress) salvo: ${addresses.bkcDexPoolAddress}`);

    // Salva o placeholder do endereço do LP
    addresses.mainLPPairAddress = "0x...[PLEASE UPDATE AFTER CREATING LP]...";
    
    fs.writeFileSync(addressesFilePath, JSON.stringify(addresses, null, 2));
    console.log(`   ✅ Todos os ${Object.keys(addresses).length} endereços (incluindo Oráculo e Link DEX) salvos em JSON.`);
    await sleep(DEPLOY_DELAY_MS);

    // =================================================================
    // === PASSO 4: CONFIGURAR CONTRATOS (DE 1_deploy_presale.ts) ===
    // =================================================================

    console.log("\n--- Configuração de Conexões e Regras ---");
    const hub = await ethers.getContractAt("EcosystemManager", addresses.ecosystemManager, deployer);
    
    // 4.1. Configurações do Hub
    console.log("4.1. Configurando Hub usando a função de lote `setAddresses` (Solução Robusta)...");

    // Usa a função única setAddresses para configurar os endereços principais.
    tx = await hub.setAddresses(
        addresses.bkcToken,             // _bkcToken
        deployer.address,               // _treasuryWallet (usando deployer temporariamente)
        ethers.ZeroAddress,             // _delegationManager (Endereço não implantado na FASE 1)
        addresses.rewardBoosterNFT,     // _rewardBooster
        ethers.ZeroAddress,             // _miningManager (Endereço não implantado na FASE 1)
        ethers.ZeroAddress,             // _decentralizedNotary (Endereço não implantado na FASE 1)
        ethers.ZeroAddress,             // _fortunePool (Endereço não implantado na FASE 1)
        ethers.ZeroAddress              // _nftLiquidityPoolFactory (Endereço não implantado na FASE 1)
    );
    await tx.wait();
    
    console.log(`   ✅ Hub configurado (BKCToken, RewardBooster e Treasury).`);
    await sleep(DEPLOY_DELAY_MS);

    // 4.2. Autorização e URI do NFT
    tx = await boosterNFT.setSaleContractAddress(addresses.publicSale);
    await tx.wait();
    tx = await boosterNFT.setBaseURI(IPFS_BASE_URI_BOOSTERS);
    await tx.wait();
    console.log(`   ✅ Loja autorizada e Base URI do NFT definida.`);
    await sleep(DEPLOY_DELAY_MS);

    // 4.3. Configurando Tiers de Venda
    console.log("\n4.3. Configurando os Tiers de Venda na Loja (Preços da Fase 1)...");
    
    for (const tier of TIERS_TO_SETUP) {
      const priceInWei = ethers.parseEther(tier.priceETH);
      const maxSupply = BigInt(tier.maxSupply);
      
      console.log(`   -> Configurando ${tier.metadata} (ID ${tier.tierId}): Preço: ${tier.priceETH} ETH/BNB`);
      
      tx = await saleContract.setTier(
        BigInt(tier.tierId),
        priceInWei,
        maxSupply,
        BigInt(tier.boostBips),
        tier.metadata
      );
      await tx.wait();
      console.log(`   ✅ Tier ${tier.tierId} configurado.`);
    }

    console.log("----------------------------------------------------");
    console.log("\n🎉🎉🎉 SETUP INICIAL (CORE + PRÉ-VENDA) CONCLUÍDO! 🎉🎉🎉");
    console.log("Os contratos de infraestrutura (Proxies) e de venda foram implantados e o Endereço do Oráculo foi salvo no JSON.");
    console.log("\nPróximo passo: (Opcional) Rode '2_update_presale_prices.ts' para mudar para a Fase 2.");
    console.log("Próximo passo: (Principal) Execute '3_launch_and_liquidate_ecosystem.ts' (AGORA FAZ CUNHAGEM E LIQUIDEZ).");

  } catch (error: any) {
    console.error("\n❌ Falha grave no script de Setup Inicial:", error.message);
    
    // Chama a função de limpeza em caso de erro
    deleteAddressesFileOnError();
    
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