// scripts/3_deploy_spokes.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";
import { ethers } from "ethers";

// Helper function for delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DEPLOY_DELAY_MS = 2000; // 2-second delay

// A FUNÇÃO PRINCIPAL É AGORA EXPORTADA
export async function runScript(hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;

  console.log(`🚀 (Passo 3/8) Implantando Contratos "Spoke" na rede: ${networkName}`);
  console.log(`Usando a conta: ${deployer.address}`);
  console.log("----------------------------------------------------");

  // --- 1. Carregar Endereços Existentes ---
  const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");
  if (!fs.existsSync(addressesFilePath)) {
    console.error("❌ Erro: 'deployment-addresses.json' não encontrado.");
    throw new Error("Missing deployment-addresses.json");
  }
  const addresses = JSON.parse(fs.readFileSync(addressesFilePath, "utf8"));

  if (!addresses.ecosystemManager || !addresses.bkcToken || !addresses.rewardManager) {
      console.error("❌ Erro: 'ecosystemManager', 'bkcToken', ou 'rewardManager' não encontrado. Execute os passos anteriores.");
      throw new Error("Missing ecosystemManager, bkcToken, or rewardManager address in JSON.");
  }

  try {
    // --- 1. Deploy NFTLiquidityPool (INALTERADO) ---
    console.log("1. Implantando NFTLiquidityPool...");
    const nftLiquidityPool = await ethers.deployContract("NFTLiquidityPool", [
      addresses.ecosystemManager,
      deployer.address,
    ]);
    await nftLiquidityPool.waitForDeployment();
    addresses.nftLiquidityPool = nftLiquidityPool.target as string;
    console.log(
      `✅ NFTLiquidityPool implantado em: ${addresses.nftLiquidityPool}`
    );
    console.log("----------------------------------------------------");
    await sleep(DEPLOY_DELAY_MS);

    // --- 2. Deploy FortuneTiger (AJUSTADO: Construtor tem 4 argumentos) ---
    console.log("2. Implantando FortuneTiger (TigerGame)...");
    const fortuneTiger = await ethers.deployContract("FortuneTiger", [
      addresses.ecosystemManager, // _ecosystemManager
      addresses.bkcToken, // _bkcTokenAddress
      addresses.rewardManager, // _rewardManagerAddress (NOVO ARGUMENTO)
      deployer.address, // _initialOwner
    ]);
    await fortuneTiger.waitForDeployment();
    addresses.fortuneTiger = fortuneTiger.target as string;
    console.log(`✅ FortuneTiger implantado em: ${addresses.fortuneTiger}`);
    console.log("----------------------------------------------------");

  } catch (error: any) {
    console.error("❌ Falha na implantação dos Spokes (Passo 3):", error.message);
    throw error;
  }

  // --- Salva TODOS os endereços de volta no arquivo ---
  fs.writeFileSync(
    addressesFilePath,
    JSON.stringify(addresses, null, 2)
  );

  console.log("\n🎉🎉🎉 CONTRATOS SPOKE IMPLANTADOS COM SUCESSO! 🎉🎉🎉");
  console.log(
    `✅ Endereços do NFTLiquidityPool e FortuneTiger salvos em: ${addressesFilePath}`
  );
  console.log("\nPróximo passo: Execute '4_configure_system.ts'");
}