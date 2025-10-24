import hre from "hardhat";
import fs from "fs";
import path from "path";
// Import ethers explicitamente para melhor clareza, embora hre o forneça
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Implantando DecentralizedNotary com a conta:", deployer.address);
  console.log("----------------------------------------------------");

  // --- 1. Ler endereços existentes ---
  console.log("1. Lendo endereços de contratos dependentes...");
  const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");
  if (!fs.existsSync(addressesFilePath)) {
       console.error(`❌ Erro: Arquivo 'deployment-addresses.json' não encontrado. Rode 'deploy.ts' primeiro.`);
       process.exit(1);
  }
  const addresses = JSON.parse(fs.readFileSync(addressesFilePath, "utf8"));

  // --- 2. Obter argumentos do construtor ---
  console.log("2. Preparando argumentos para o construtor...");
  const bkcTokenAddress = addresses.bkcToken;
  const delegationManagerAddress = addresses.delegationManager;
  // Usaremos o endereço do deployer como Tesouraria e Dono inicial.
  // Altere aqui se precisar de endereços diferentes.
  const treasuryAddress = deployer.address;
  const initialOwner = deployer.address;

  // Validar se os endereços necessários foram encontrados
  if (!bkcTokenAddress || !delegationManagerAddress) {
      console.error("❌ Erro: Endereços BKCToken ou DelegationManager não encontrados em deployment-addresses.json.");
      console.error("   Certifique-se de que o script 'deploy.ts' foi executado com sucesso.");
      process.exit(1);
  }

  console.log(`   -> Usando BKCToken em: ${bkcTokenAddress}`);
  console.log(`   -> Usando DelegationManager em: ${delegationManagerAddress}`);
  console.log(`   -> Definindo Treasury (inicial) como: ${treasuryAddress}`);
  console.log(`   -> Definindo Owner (inicial) como: ${initialOwner}`);
  console.log("----------------------------------------------------");

  // --- 3. Implantar o contrato DecentralizedNotary ---
  console.log("3. Implantando o contrato DecentralizedNotary...");

  // Usar deployContract (padrão do Hardhat/Ethers v6+)
  const notaryContract = await ethers.deployContract("DecentralizedNotary", [
      bkcTokenAddress,
      delegationManagerAddress,
      treasuryAddress,
      initialOwner,
  ]);

  console.log("   Aguardando confirmação...");
  await notaryContract.waitForDeployment();
  const notaryAddress = notaryContract.target; // Endereço do contrato implantado
  console.log(`✅ Contrato DecentralizedNotary implantado em: ${notaryAddress}`);
  console.log("----------------------------------------------------");

  // --- 4. Salvar o novo endereço ---
  console.log("4. Salvando endereço no arquivo deployment-addresses.json...");
  addresses.decentralizedNotary = notaryAddress; // Adiciona a nova propriedade
  fs.writeFileSync(addressesFilePath, JSON.stringify(addresses, null, 2));
  console.log("✅ Endereço do DecentralizedNotary salvo com sucesso!");
  console.log("----------------------------------------------------");


  // --- 5. Próximos Passos ---
  console.log("\n🎉 Deploy do DecentralizedNotary concluído! 🎉");
  console.log("\n🚀 PRÓXIMOS PASSOS:");
  console.log(`1. Copie o endereço do contrato DecentralizedNotary: ${notaryAddress}`);
  console.log("2. Cole-o no seu arquivo `config.js` frontend (em `addresses.decentralizedNotary`).");
  console.log("3. (Opcional, mas recomendado) Verifique o contrato no Etherscan:");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${notaryAddress} ${bkcTokenAddress} ${delegationManagerAddress} ${treasuryAddress} ${initialOwner}`);
  console.log("----------------------------------------------------");

}

main().catch((error) => {
  console.error("❌ Erro durante o deploy do DecentralizedNotary:");
  console.error(error);
  process.exitCode = 1;
});