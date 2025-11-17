// scripts/upgrade-notary.js
// ✅ ATUALIZADO: Lê o endereço do proxy automaticamente do JSON

const { ethers, upgrades } = require("hardhat");
const fs = require("fs"); // Módulo File System para ler arquivos
const path = require("path"); // Módulo Path para construir caminhos de arquivo

/**
 * Carrega o endereço do proxy do arquivo JSON
 */
function getProxyAddress() {
  try {
    // Constrói o caminho para o arquivo na raiz do projeto
    // (Assume que este script está em /scripts e o JSON está em /)
    const addressesPath = path.resolve(__dirname, '..', 'deployment-addresses.json');
    
    if (!fs.existsSync(addressesPath)) {
       throw new Error(`Arquivo não encontrado em: ${addressesPath}`);
    }

    const addressesFile = fs.readFileSync(addressesPath, 'utf8');
    const addresses = JSON.parse(addressesFile);

    // Lê o endereço específico 
    const proxyAddress = addresses.decentralizedNotary;

    if (!proxyAddress || !ethers.isAddress(proxyAddress)) {
      throw new Error(`Endereço "decentralizedNotary" inválido ou não encontrado no JSON: ${proxyAddress}`);
    }

    return proxyAddress;

  } catch (e) {
    console.error("❌ Erro fatal ao ler o 'deployment-addresses.json':", e.message);
    process.exit(1);
  }
}


async function main() {
  // 1. Carrega o endereço do proxy automaticamente 
  const PROXY_ADDRESS = getProxyAddress();
  
  console.log(`Endereço do proxy 'decentralizedNotary' lido do JSON: ${PROXY_ADDRESS}`);
  
  // 2. Pega o "molde" (ContractFactory) do seu novo contrato corrigido
  const DecentralizedNotaryFactory = await ethers.getContractFactory("DecentralizedNotary");
  console.log("Molde (Factory) do novo contrato carregado.");

  // 3. Executa o upgrade
  console.log("Iniciando o upgrade do proxy... Isso pode levar um minuto.");
  const notaryProxy = await upgrades.upgradeProxy(PROXY_ADDRESS, DecentralizedNotaryFactory);

  await notaryProxy.waitForDeployment();

  const implementationAddress = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);

  console.log("\n✅====================================================");
  console.log("✅ Upgrade concluído com sucesso!");
  console.log(`O Proxy (${PROXY_ADDRESS}) agora aponta para a nova implementação em:`);
  console.log(implementationAddress);
  console.log("====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Falha no upgrade:", error);
    process.exit(1);
  });