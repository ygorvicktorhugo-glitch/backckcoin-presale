// scripts/1_deploy_presale.ts
import { ethers, upgrades } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";

// Helper function for delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ######################################################################
// ###               CONFIGURAÇÃO DA PRÉ-VENDA (FASE 1)             ###
// ######################################################################

const IPFS_BASE_URI_BOOSTERS =
  "ipfs://bafybeigf3n2q2cbsnsmqytv57e6dvuimtzsg6pp7iyhhhmqpaxgpzlmgem/"; // SEU CID AQUI

// ✅ ALTERAÇÃO: 'maxSupply' definido para 1 milhão para simular vendas "sem teto".
const TIERS_TO_SETUP = [
  { tierId: 0, maxSupply: 1000000, priceETH: "3.60", boostBips: 5000, metadata: "diamond_booster.json" },
  { tierId: 1, maxSupply: 1000000, priceETH: "1.44", boostBips: 4000, metadata: "platinum_booster.json" },
  { tierId: 2, maxSupply: 1000000, priceETH: "0.54", boostBips: 3000, metadata: "gold_booster.json" },
  { tierId: 3, maxSupply: 1000000, priceETH: "0.27", boostBips: 2000, metadata: "silver_booster.json" },
  { tierId: 4, maxSupply: 1000000, priceETH: "0.144", boostBips: 1000, metadata: "bronze_booster.json" },
  { tierId: 5, maxSupply: 1000000, priceETH: "0.07", boostBips: 500, metadata: "iron_booster.json" },
  { tierId: 6, maxSupply: 1000000, priceETH: "0.01", boostBips: 100, metadata: "crystal_booster.json" },
];

const DEPLOY_DELAY_MS = 2000;
// ######################################################################

export async function runScript(hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;

  console.log(
    `🚀 (FASE 1) Implantando e Configurando a PRÉ-VENDA na rede: ${networkName}`
  );
  console.log(`Usando a conta: ${deployer.address}`);
  console.log("----------------------------------------------------");

  if (!IPFS_BASE_URI_BOOSTERS.includes("ipfs://")) {
    throw new Error("IPFS_BASE_URI_BOOSTERS must be set and start with 'ipfs://'");
  }

  const addresses: { [key: string]: string } = {};
  const addressesFilePath = path.join(
    __dirname,
    "../deployment-addresses.json"
  );
  fs.writeFileSync(addressesFilePath, JSON.stringify({}, null, 2));

  let boosterNFT: any;
  let saleContract: any; // Declarado aqui para uso posterior

  try {
    // === PASSO 1: IMPLANTAR CONTRATOS ===

    console.log("1. Implantando EcosystemManager (Cérebro UUPS)...");
    const EcosystemManager = await ethers.getContractFactory("EcosystemManager");
    const ecosystemManager = await upgrades.deployProxy(
      EcosystemManager,
      [deployer.address],
      { initializer: "initialize", kind: "uups" }
    );
    await ecosystemManager.waitForDeployment();
    addresses.ecosystemManager = await ecosystemManager.getAddress();
    console.log(`   ✅ EcosystemManager (Proxy) implantado em: ${addresses.ecosystemManager}`);
    await sleep(DEPLOY_DELAY_MS);

    // ✅ CORREÇÃO: Implantar RewardBoosterNFT usando 'deployProxy'
    // Isso garante que a função 'initialize' seja chamada corretamente na mesma transação.
    console.log("\n2. Implantando RewardBoosterNFT (Fábrica) como Proxy...");
    const RewardBoosterNFT = await ethers.getContractFactory("RewardBoosterNFT");
    boosterNFT = await upgrades.deployProxy(
        RewardBoosterNFT,
        [deployer.address], // Argumentos para a função initialize
        { initializer: "initialize" } 
        // Nota: Este contrato não é UUPS, então o 'kind' é 'transparent' (padrão)
    );
    await boosterNFT.waitForDeployment();
    addresses.rewardBoosterNFT = await boosterNFT.getAddress();
    console.log(`   ✅ RewardBoosterNFT (Proxy) implantado em: ${addresses.rewardBoosterNFT}`);
    console.log(`   ✅ RewardBoosterNFT inicializado e ownership definido para ${deployer.address}.`);
    await sleep(DEPLOY_DELAY_MS);


    console.log("\n3. Implantando PublicSale (Loja UUPS)...");
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
    console.log(`   ✅ PublicSale (Proxy) implantado em: ${addresses.publicSale}`);
    console.log("   ✅ PublicSale inicializado automaticamente pelo proxy.");
    await sleep(DEPLOY_DELAY_MS);
    
    addresses.mainLPPairAddress = "0x...[PLEASE UPDATE AFTER CREATING LP]...";
    
    fs.writeFileSync(addressesFilePath, JSON.stringify(addresses, null, 2));
    await sleep(DEPLOY_DELAY_MS);

    // === PASSO 2: CONFIGURAR CONTRATOS ===

    console.log("\n4. Conectando o Cérebro (EcosystemManager)...");
    const hub = await ethers.getContractAt("EcosystemManager", addresses.ecosystemManager, deployer);
    
    // ✅ CORREÇÃO: Usando as novas funções de configuração individuais
    let tx = await hub.setTreasuryAddress(deployer.address);
    await tx.wait();
    console.log(`   ✅ Endereço de Tesouraria (${deployer.address}) definido no Cérebro.`);
    await sleep(DEPLOY_DELAY_MS);

    tx = await hub.setRewardBoosterAddress(addresses.rewardBoosterNFT);
    await tx.wait();
    console.log(`   ✅ Endereço do BoosterNFT (${addresses.rewardBoosterNFT}) definido no Cérebro.`);
    await sleep(DEPLOY_DELAY_MS);


    console.log("\n5. Autorizando a Loja (PublicSale) a cunhar NFTs...");
    // A instância 'boosterNFT' agora é um proxy, mas a chamada é a mesma
    tx = await boosterNFT.setSaleContractAddress(addresses.publicSale);
    await tx.wait();
    console.log(`   ✅ Loja (${addresses.publicSale}) autorizada.`);
    await sleep(DEPLOY_DELAY_MS);

    console.log("\n6. Definindo o IPFS Base URI no contrato de NFT...");
    tx = await boosterNFT.setBaseURI(IPFS_BASE_URI_BOOSTERS);
    await tx.wait();
    console.log(`   ✅ Base URI definida para: ${IPFS_BASE_URI_BOOSTERS}`);
    await sleep(DEPLOY_DELAY_MS);

    // === PASSO 3: LANÇAR A VENDA (FASE 1) ===
    console.log("\n7. Configurando os Tiers de Venda na Loja (Preços da Fase 1)...");
    
    for (const tier of TIERS_TO_SETUP) {
      const priceInWei = ethers.parseEther(tier.priceETH);
      const maxSupply = BigInt(tier.maxSupply);
      
      console.log(`   -> Configurando ${tier.metadata} (ID ${tier.tierId}):`);
      console.log(`      Preço (Fase 1): ${tier.priceETH} BNB`);
      // ✅ AVISO: O teto de suprimento agora é 1 milhão
      console.log(`      Teto de Suprimento: ${maxSupply}`);
      
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
    console.log("\n🎉🎉🎉 SCRIPT DE PRÉ-VENDA (FASE 1) CONCLUÍDO! 🎉🎉🎉");
    console.log("O sistema está pronto para o público comprar NFTs com BNB.");
    console.log("\nPróximo passo: (Opcional) Rode `1_1_update_presale_prices.ts` para mudar para a Fase 2.");
    console.log("Próximo passo: (Opcional) Rode `mint_treasury.ts` para cunhar NFTs da tesouraria.");
    console.log("Próximo passo: (Principal) Execute `2_launch_ecosystem.ts` (APÓS A PRÉ-VENDA).");

  } catch (error: any) {
    console.error("\n❌ Falha grave no script de Pré-Venda:", error.message);
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