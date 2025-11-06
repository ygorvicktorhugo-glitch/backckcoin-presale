// scripts/0_faucet_test_supply.ts (PASSO ZERO - TRANSFERÊNCIA DE SUPPLY DE TESTE)
// REMOVIDO: import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ########################################################
// ### COMPATIBILIDADE ESM/CJS PARA __dirname (Mantida) ###
// ########################################################
// Define __filename e __dirname, pois não existem no modo ESM.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// ########################################################

// --- CONFIGURAÇÃO ---
const TEST_SUPPLY_AMOUNT_BKC = "10000000"; 
// --- FIM CONFIGURAÇÃO ---

// Helper function for delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A FUNÇÃO PRINCIPAL É AGORA EXPORTADA
export async function runScript(hre: any) { // Mudamos para 'any'
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;

  // Verifica se o script deve ser executado (Teste vs. Produção)
  if (networkName !== 'sepolia' && networkName !== 'localhost' && networkName !== 'hardhat') {
    console.log(`⚠️ IGNORANDO PASSO ZERO: Transferência de Supply de Teste desativada para rede: ${networkName}`);
    return;
  }

  console.log(`🚀 (Passo 0/10) Transferindo 10M BKC do Deployer para o Faucet na rede: ${networkName}`);
  console.log(`Usando a conta: ${deployer.address}`);
  console.log("----------------------------------------------------");

  // --- 1. Carregar Endereços ---
  const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");
  if (!fs.existsSync(addressesFilePath)) {
    console.error("❌ Erro: 'deployment-addresses.json' não encontrado. Execute o Passo 1 primeiro.");
    throw new Error("Missing deployment-addresses.json");
  }
  const addresses = JSON.parse(fs.readFileSync(addressesFilePath, "utf8"));

  if (!addresses.bkcToken || !addresses.faucet) {
      console.error("❌ Erro: 'bkcToken' ou 'faucet' não encontrado. Execute o Passo 1 primeiro.");
      throw new Error("Missing bkcToken or faucet address in JSON.");
  }

  // --- 2. Obter Instâncias dos Contratos ---
  const bkcToken = await ethers.getContractAt("BKCToken", addresses.bkcToken, deployer);
  const amountToTransferWei = ethers.parseEther(TEST_SUPPLY_AMOUNT_BKC);
  
  try {
    const deployerBalance = await bkcToken.balanceOf(deployer.address);
    const faucetCurrentBalance = await bkcToken.balanceOf(addresses.faucet);

    // 3. Verificação de Saldo e Execução
    if (deployerBalance < amountToTransferWei) {
        console.error(`❌ ERRO: Saldo insuficiente de BKC (${ethers.formatEther(deployerBalance)}) na conta do Deployer.`);
        throw new Error("Insufficient BKC TGE supply for test funding.");
    }
    
    if (faucetCurrentBalance >= amountToTransferWei) {
         console.log(`   ⚠️ AVISO: Faucet já tem ${ethers.formatEther(faucetCurrentBalance)} BKC. Pulando transferência.`);
         console.log(`   -> Saldo do Deployer permanece em: ${ethers.formatEther(deployerBalance)} BKC.`);
         console.log("----------------------------------------------------");
         return;
    }

    // --- 4. Financiamento: Transfere os tokens do Deployer para o Faucet ---
    console.log(`\n1. Transferindo ${TEST_SUPPLY_AMOUNT_BKC} BKC do Deployer para o Faucet em: ${addresses.faucet}`);
    
    let tx = await bkcToken.transfer(addresses.faucet, amountToTransferWei);
    await tx.wait();
    
    const deployerFinalBalance = await bkcToken.balanceOf(deployer.address);
    const faucetFinalBalance = await bkcToken.balanceOf(addresses.faucet);
    
    console.log(`   ✅ Transferência bem-sucedida!`);
    console.log(`   -> Saldo Final do Deployer (para Operações): ${ethers.formatEther(deployerFinalBalance)} BKC.`); 
    console.log(`   -> Saldo do Faucet (Teste): ${ethers.formatEther(faucetFinalBalance)} BKC.`);
    
  } catch (error: any) {
    console.error("\n❌ ERRO CRÍTICO DURANTE O PASSO ZERO (TRANSFERÊNCIA) ❌\n");
    throw error;
  }

  console.log("\n🎉🎉🎉 10M BKC ISOLADOS NO FAUCET PARA TESTES! 🎉🎉🎉");
}