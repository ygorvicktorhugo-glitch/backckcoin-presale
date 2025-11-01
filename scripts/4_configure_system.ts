// scripts/4_configure_system.ts
import hre from "hardhat";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

// Helper function for delays between deployments
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const CONFIG_DELAY_MS = 1500; // 1.5-second delay

// --- ⚙️ CONFIGURATION ---
const IPFS_BASE_URI_VESTING =
  "ipfs://bafybeig4g562r4g7yxgtqm2rkkmsblvzwcghjiebcipsrt3ltlgitzkr6i/";
  
const IPFS_BASE_URI_BOOSTERS =
  "ipfs://bafybeihxs7dd7x5thhpkmwxl3adnajjxlnwx5yqodr7hjrllxaif7ojad4/";
// ------------------------

// A FUNÇÃO PRINCIPAL É AGORA EXPORTADA
export async function runScript(hre: any) { // Usamos 'any' para facilitar a tipagem do hre
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  console.log(`🚀 (Passo 4/8) Configurando dependências do sistema com a conta: ${deployer.address}`);
  console.log("----------------------------------------------------");

  // ######################################################
  // ### SOLUÇÃO: CARREGAR ENDEREÇOS DO DISCO NA HORA ###
  // ######################################################
  const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");
  if (!fs.existsSync(addressesFilePath)) {
    throw new Error("Missing deployment-addresses.json");
  }
  const addresses: { [key: string]: string } = JSON.parse(fs.readFileSync(addressesFilePath, "utf8"));
  // ######################################################
  
  // --- Validar CIDs (Verificação de segurança) ---
  if (
    IPFS_BASE_URI_VESTING.includes("YOUR_CID") ||
    IPFS_BASE_URI_BOOSTERS.includes("YOUR_CID")
  ) {
    console.error("❌ Erro: CIDs ainda estão com o valor padrão 'YOUR_CID'.");
    throw new Error("IPFS CIDs must be set.");
  } else {
    console.log("✅ CIDs do IPFS carregados com sucesso.");
  }


  // --- Carregar Contratos (Usando os endereços lidos diretamente do disco) ---
  console.log("Carregando instâncias de contratos implantados...");
  
  // Verificação de que todos os endereços necessários estão presentes
  const requiredAddresses = ['bkcToken', 'delegationManager', 'rewardManager', 'rewardBoosterNFT', 'fortuneTiger'];
  for (const key of requiredAddresses) {
      if (!addresses[key]) {
          throw new Error(`Endereço '${key}' não encontrado no JSON. O Passo 3 falhou ou o arquivo não foi atualizado.`);
      }
  }


  const bkcToken = await ethers.getContractAt("BKCToken", addresses.bkcToken, deployer);
  const delegationManager = await ethers.getContractAt(
    "DelegationManager",
    addresses.delegationManager,
    deployer
  );
  const rewardManager = await ethers.getContractAt(
    "RewardManager",
    addresses.rewardManager,
    deployer
  );
  const rewardBooster = await ethers.getContractAt(
    "RewardBoosterNFT",
    addresses.rewardBoosterNFT,
    deployer
  );
  // O endereço 'fortuneTiger' deve estar presente aqui
  const fortuneTiger = await ethers.getContractAt(
    "FortuneTiger",
    addresses.fortuneTiger,
    deployer
  );

  try {
    // --- Passo 1: Definir Endereços de Referência no BKCToken ---
    console.log("\n1. Definindo endereços de referência no BKCToken...");
    
    let tx = await bkcToken.setTreasuryWallet(deployer.address);
    await tx.wait();
    console.log(` -> Tesouraria definida para: ${deployer.address}`);
    await sleep(CONFIG_DELAY_MS);


    tx = await bkcToken.setDelegationManager(addresses.delegationManager);
    await tx.wait();
    console.log(` -> Endereço do DelegationManager registrado no Token.`);
    await sleep(CONFIG_DELAY_MS);

    tx = await bkcToken.setRewardManager(addresses.rewardManager);
    await tx.wait();
    console.log(` -> Endereço do RewardManager registrado no Token.`);
    await sleep(CONFIG_DELAY_MS);
    
    console.log("✅ Endereços de referência do BKCToken configurados.");

    // --- Passo 2: Configurar Interdependências dos Managers (CORRIGIDO) ---
    console.log("\n2. Configurando interdependências dos managers...");
    
    // NOVO: Define o DelegationManager no RewardManager (CORREÇÃO DE DEPENDÊNCIA CRÍTICA)
    tx = await rewardManager.setDelegationManager(addresses.delegationManager);
    await tx.wait();
    console.log(` -> DelegationManager definido no RewardManager.`);
    await sleep(CONFIG_DELAY_MS);
    
    // Define o RewardManager no DelegationManager
    tx = await delegationManager.setRewardManager(addresses.rewardManager);
    await tx.wait();
    console.log(` -> RewardManager definido no DelegationManager.`);
    await sleep(CONFIG_DELAY_MS);
    
    // Define o FortuneTiger (TigerGame) no RewardManager
    tx = await rewardManager.setTigerGameAddress(addresses.fortuneTiger);
    await tx.wait();
    console.log(` -> TigerGame (${addresses.fortuneTiger}) definido no RewardManager.`);
    await sleep(CONFIG_DELAY_MS);


    console.log("✅ Managers configurados.");

    // --- Passo 3: Autorizar Contrato PublicSale ---
    console.log("\n3. Autorizando PublicSale a cunhar Booster NFTs...");
    tx = await rewardBooster.setSaleContractAddress(addresses.publicSale);
    await tx.wait();
    console.log(` -> Contrato PublicSale (${addresses.publicSale}) autorizado.`);
    await sleep(CONFIG_DELAY_MS);
    console.log("✅ PublicSale autorizado.");

    // --- Passo 4: Definir URIs Base dos NFTs ---
    console.log("\n4. Definindo URIs Base para metadados de NFT...");
    tx = await rewardManager.setBaseURI(IPFS_BASE_URI_VESTING);
    await tx.wait();
    console.log(` -> URI Base do Certificado de Vesting definida.`);
    await sleep(CONFIG_DELAY_MS);

    tx = await rewardBooster.setBaseURI(IPFS_BASE_URI_BOOSTERS);
    await tx.wait();
    console.log(` -> URI Base do Reward Booster definida.`);
    await sleep(CONFIG_DELAY_MS);
    console.log("✅ URIs Base configuradas.");

    // --- Passo 5: Transferir Posse do BKCToken (PASSO CRÍTICO) ---
    console.log("\n5. Transferindo posse do BKCToken para o RewardManager...");
    const currentOwner = await bkcToken.owner();
    if (currentOwner.toLowerCase() === deployer.address.toLowerCase()) {
      tx = await bkcToken.transferOwnership(addresses.rewardManager);
      await tx.wait();
      console.log(
        `✅ Posse do BKCToken transferida para: ${addresses.rewardManager}`
      );
    } else {
      console.log(
        `⚠️  A posse do BKCToken já pertence a ${currentOwner}. Nenhuma ação tomada.`
      );
    }

    console.log("\n🎉🎉🎉 CONFIGURAÇÃO DO SISTEMA CONCLUÍDA! 🎉🎉🎉");
    console.log("\nPróximo passo: Execute '5_create_pools.ts'");
    
  } catch (error: any) {
    console.error("\n❌ ERRO CRÍTICO DURANTE A CONFIGURAÇÃO DO SISTEMA (Passo 4) ❌\n");
    throw error;
  }
}