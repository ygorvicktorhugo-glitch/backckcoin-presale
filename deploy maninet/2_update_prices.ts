import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  // Tenta ler o arquivo de endereços
  if (!fs.existsSync("deployment-addresses.json")) {
    console.error("❌ Erro: 'deployment-addresses.json' não encontrado. Faça o deploy primeiro.");
    return;
  }

  const addresses = JSON.parse(fs.readFileSync("deployment-addresses.json", "utf8"));
  console.log("📈 INICIANDO AUMENTO DE PREÇOS (+50%)...");
  console.log("🎯 Contrato Alvo:", addresses.presaleNFTContract);

  const PublicSale = await ethers.getContractFactory("PublicSale");
  const publicSale = PublicSale.attach(addresses.presaleNFTContract);

  const tierIds = [1, 2, 3, 4, 5, 6, 7];

  for (const id of tierIds) {
    // 1. Ler dados direto da Blockchain
    const tierData = await publicSale.tiers(id);
    const currentPrice = tierData[0]; // priceInWei
    const isConfigured = tierData[4]; // isConfigured

    if (!isConfigured) {
      console.log(`⚠️ Tier ${id} não configurado. Pulando.`);
      continue;
    }

    // 2. Calcular +50% (Preço * 150 / 100)
    const newPrice = (currentPrice * 150n) / 100n;

    console.log(`\n🔹 Tier ${id}:`);
    console.log(`   Atual: ${ethers.formatEther(currentPrice)} ETH`);
    console.log(`   Novo : ${ethers.formatEther(newPrice)} ETH`);

    // 3. Atualizar na Blockchain
    const tx = await publicSale.updateTierPrice(id, newPrice);
    await tx.wait();
    console.log(`   ✅ Preço atualizado!`);
  }

  console.log("\n🚀 SUCESSO: Todos os preços foram reajustados para a Fase 2!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});