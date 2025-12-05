import { ethers, upgrades } from "hardhat";
import * as fs from "fs";

async function main() {
  const [deployer, treasury] = await ethers.getSigners();
  
  console.log("🚀 INICIANDO DEPLOY COMPLETO (SISTEMA + TIERS)...");
  console.log("👨‍✈️ Deployer:", deployer.address);
  console.log("🏦 Treasury (Recebedor):", treasury.address);

  // ====================================================
  // 1. DEPLOY DOS CONTRATOS
  // ====================================================

  // A. EcosystemManager
  console.log("\n1️⃣ Deploying EcosystemManager...");
  const EcosystemManager = await ethers.getContractFactory("EcosystemManager");
  const ecosystemManager = await upgrades.deployProxy(EcosystemManager, [deployer.address], { initializer: "initialize", kind: "uups" });
  await ecosystemManager.waitForDeployment();
  const ecosystemAddress = await ecosystemManager.getAddress();
  console.log("   ✅ EcosystemManager:", ecosystemAddress);

  // B. BKCToken
  console.log("\n2️⃣ Deploying BKCToken...");
  const BKCToken = await ethers.getContractFactory("BKCToken");
  const bkcToken = await upgrades.deployProxy(BKCToken, [deployer.address], { initializer: "initialize", kind: "uups" });
  await bkcToken.waitForDeployment();
  const bkcAddress = await bkcToken.getAddress();
  console.log("   ✅ BKCToken:", bkcAddress);

  // C. RewardBoosterNFT
  console.log("\n3️⃣ Deploying RewardBoosterNFT...");
  const RewardBoosterNFT = await ethers.getContractFactory("RewardBoosterNFT");
  const rewardBooster = await upgrades.deployProxy(RewardBoosterNFT, [deployer.address], { initializer: "initialize", kind: "uups" });
  await rewardBooster.waitForDeployment();
  const boosterAddress = await rewardBooster.getAddress();
  console.log("   ✅ RewardBoosterNFT:", boosterAddress);

  // D. PublicSale
  console.log("\n4️⃣ Deploying PublicSale...");
  const PublicSale = await ethers.getContractFactory("PublicSale");
  const publicSale = await upgrades.deployProxy(
    PublicSale,
    [boosterAddress, ecosystemAddress, deployer.address],
    { initializer: "initialize", kind: "uups" }
  );
  await publicSale.waitForDeployment();
  const saleAddress = await publicSale.getAddress();
  console.log("   ✅ PublicSale:", saleAddress);

  // ====================================================
  // 2. INTERLIGAÇÃO (WIRING)
  // ====================================================
  console.log("\n🔌 Conectando contratos...");

  // Configura Ecosystem com endereços iniciais (ZeroAddress para os futuros)
  const tx1 = await ecosystemManager.setAddresses(
    bkcAddress,           // Token
    treasury.address,     // Treasury
    ethers.ZeroAddress,   // Delegation (Fase 2)
    boosterAddress,       // Booster
    ethers.ZeroAddress,   // Mining (Fase 2)
    ethers.ZeroAddress,   // Notary (Fase 2)
    ethers.ZeroAddress,   // Fortune (Fase 2)
    ethers.ZeroAddress    // PoolFactory (Fase 2)
  );
  await tx1.wait();
  console.log("   -> EcosystemManager configurado.");

  // Autoriza a PublicSale a mintar NFTs
  const tx2 = await rewardBooster.setSaleContractAddress(saleAddress);
  await tx2.wait();
  console.log("   -> PublicSale autorizada no NFT.");

  // ====================================================
  // 3. CONFIGURAÇÃO DOS PREÇOS (TIERS)
  // ====================================================
  console.log("\n💎 Configurando Tiers e Preços...");

  const HIGH_SUPPLY = 1000000; // Simula "sem limite"

  // Preços em ETH para a Fase 1
  const tiers = [
    { id: 1, name: "Diamond",  price: "0.5",   boost: 7000, cid: "bafybeicgip72jcqgsirlrhn3tq5cc226vmko6etnndzl6nlhqrktfikafq/diamond_booster.json" },
    { id: 2, name: "Platinum", price: "0.2",   boost: 6000, cid: "bafybeigc2wgkccckhnjotejve7qyxa2o2z4fsgswfmsxyrbp5ncpc7plei/platinum_booster.json" },
    { id: 3, name: "Gold",     price: "0.075", boost: 5000, cid: "bafybeifponccrbicg2pcjrn2hrfoqgc77xhm2r4ld7hdpw6cxxkbsckf44/gold_booster.json" },
    { id: 4, name: "Silver",   price: "0.035", boost: 4000, cid: "bafybeihvi2inujm5zpi7tl667g4srq273536pjkglwyrtbwmgnskmu7jg4/silver_booster.json" },
    { id: 5, name: "Bronze",   price: "0.02",  boost: 3000, cid: "bafybeiclqidb67rt3tchhjpsib62s624li7j2bpxnr6b5w5mfp4tomhu7m/bronze_booster.json" },
    { id: 6, name: "Iron",     price: "0.01",  boost: 2000, cid: "bafybeiaxhv3ere2hyto4dlb5xqn46ehfglxqf3yzehpy4tvdnifyzpp4wu/iron_booster.json" },
    { id: 7, name: "Crystal",  price: "0.003", boost: 1000, cid: "bafybeib6nacggrhgcp72xksbhsqcofg3lzhfb576kuebj5ioxpk2id5m7u/crystal_booster.json" },
  ];

  for (const tier of tiers) {
    console.log(`   Configurando Tier ${tier.id} (${tier.name}) - ${tier.price} ETH`);
    const tx = await publicSale.setTier(
      tier.id,
      ethers.parseEther(tier.price),
      HIGH_SUPPLY,
      tier.boost,
      `ipfs://${tier.cid}`
    );
    await tx.wait();
  }

  // ====================================================
  // 4. SALVAR ARQUIVO PARA FRONTEND
  // ====================================================
  const addresses = {
    ecosystemManager: ecosystemAddress,
    bkcToken: bkcAddress,
    rewardBoosterNFT: boosterAddress,
    presaleNFTContract: saleAddress,
    treasury: treasury.address
  };

  fs.writeFileSync("deployment-addresses.json", JSON.stringify(addresses, null, 2));
  console.log("\n📄 Arquivo 'deployment-addresses.json' gerado com sucesso!");
  console.log("✨ DEPLOY FINALIZADO! O SISTEMA ESTÁ PRONTO.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});