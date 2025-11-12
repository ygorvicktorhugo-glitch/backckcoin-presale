// scripts/1_1_update_presale_prices.ts
import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";

// ######################################################################
// ###               CONFIGURAÇÃO DA FASE 2 DA PRÉ-VENDA              ###
// ######################################################################

/*
 * Este script ATUALIZA OS PREÇOS da pré-venda.
 * Ele chama a nova função 'updateTierPrice' e NÃO RESETA a contagem de vendas.
 */

// Defina os NOVOS PREÇOS (Fase 2) aqui
const NEW_PRICES_ETH = {
  // Preços da Fase 1 (ex: 3.60) aumentados em 50%
  // (Você pode definir qualquer valor, não precisa ser +50%)
  "0": "5.40", // Diamond (Tier ID 0)
  "1": "2.16", // Platinum (Tier ID 1)
  "2": "0.81", // Gold (Tier ID 2)
  "3": "0.405", // Silver (Tier ID 3)
  "4": "0.216", // Bronze (Tier ID 4)
  "5": "0.105", // Iron (Tier ID 5)
  "6": "0.015", // Crystal (Tier ID 6)
};

// ######################################################################

// Helper function for delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runScript(hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;

  console.log(
    `🚀 (GERENCIAMENTO) Atualizando preços para FASE 2 da Pré-Venda na rede: ${networkName}`
  );
  console.log(`Usando a conta (Owner): ${deployer.address}`);
  console.log("----------------------------------------------------");

  // --- 1. Carregar Endereços ---
  const addressesFilePath = path.join(
    __dirname,
    "../deployment-addresses.json"
  );
  if (!fs.existsSync(addressesFilePath)) {
    throw new Error("Missing deployment-addresses.json");
  }
  const addresses: { [key: string]: string } = JSON.parse(
    fs.readFileSync(addressesFilePath, "utf8")
  );

  const saleAddress = addresses.publicSale;
  if (!saleAddress) {
    throw new Error("PublicSale address not found in JSON.");
  }

  // --- 2. Obter Contrato ---
  const saleContract = await ethers.getContractAt(
    "PublicSale",
    saleAddress,
    deployer
  );
  console.log(`Conectado ao PublicSale em: ${saleAddress}`);

  try {
    // --- 3. Processar Atualizações de Preço ---
    console.log(
      `\nIniciando atualização de preços para a Fase 2...`
    );

    for (const tierIdStr of Object.keys(NEW_PRICES_ETH)) {
      const tierId = parseInt(tierIdStr, 10);
      const newPriceETH = (NEW_PRICES_ETH as any)[tierIdStr];
      const newPriceInWei = ethers.parseEther(newPriceETH);

      console.log(`\n   -> Processando Tier ID ${tierId}...`);
      
      // ✅ CORREÇÃO AQUI: Convertido tierId para BigInt
      const currentTier = await saleContract.tiers(BigInt(tierId));
      if (!currentTier.isConfigured) {
          console.log(`      ⚠️ AVISO: Tier ${tierId} não está configurado. Pulando.`);
          continue;
      }

      console.log(`      Preço Antigo: ${ethers.formatEther(currentTier.priceInWei)} ETH/BNB`);
      console.log(`      Preço Novo:   ${newPriceETH} ETH/BNB (${newPriceInWei} Wei)`);
      console.log(`      Contagem de Vendas (MintedCount): ${currentTier.mintedCount} (NÃO SERÁ RESETADO)`);

      // ✅ CORREÇÃO AQUI: Convertido tierId para BigInt
      const tx = await saleContract.updateTierPrice(
        BigInt(tierId),
        newPriceInWei
      );
      await tx.wait();
      console.log(`   ✅ SUCESSO: Tier ${tierId} atualizado para o preço da Fase 2.`);
      await sleep(1000);
    }

    console.log("\n----------------------------------------------------");
    console.log("🎉🎉🎉 ATUALIZAÇÃO DE PREÇOS DA FASE 2 CONCLUÍDA! 🎉🎉🎉");
    console.log("A contagem de vendas ('mintedCount') foi preservada.");

  } catch (error: any) {
    console.error(
      "\n❌ Falha grave durante a atualização de preços:",
      error.message
    );
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