// scripts/deployFaucet.js

const hre = require("hardhat");

async function main() {
    console.log("Fetching deployer account...");
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

    // --- Carrega o endereço do BKC Token do config.js ---
    // Usamos import() dinâmico pois config.js é um ES Module
    console.log("Loading BKC Token address from config.js...");
    const configPath = '../config.js'; // Ajuste se o config.js não estiver na raiz
    const config = await import(configPath);
    const bkcTokenAddress = config.addresses.bkcToken;

    if (!bkcTokenAddress || bkcTokenAddress.startsWith('0x...')) {
        throw new Error("BKC Token address not found or not configured in config.js");
    }
    console.log(`Using BKC Token address: ${bkcTokenAddress}`);
    // --- Fim do Carregamento ---

    console.log("\nGetting Faucet contract factory...");
    const FaucetFactory = await hre.ethers.getContractFactory("SimpleBKCFaucet");

    console.log("Deploying SimpleBKCFaucet...");
    const faucet = await FaucetFactory.deploy(bkcTokenAddress); // Passa o endereço do BKC Token

    console.log("Waiting for deployment confirmation...");
    await faucet.waitForDeployment(); // Espera a transação ser minerada

    const faucetAddress = await faucet.getAddress(); // Pega o endereço do contrato implantado
    console.log("✅ SimpleBKCFaucet deployed successfully!");
    console.log("   Contract Address:", faucetAddress);
    console.log("   Deployed by:", deployer.address);
    console.log(`   Linked BKC Token: ${bkcTokenAddress}`);

    console.log("\n🚀 NEXT STEPS:");
    console.log(`1. Copy the Faucet Contract Address: ${faucetAddress}`);
    console.log("2. Paste it into your `config.js` file under `addresses.faucet`.");
    console.log(`3. Transfer at least 12,500 $BKC tokens to the Faucet address (${faucetAddress}) so users can claim.`);
    console.log("4. Verify the contract on Etherscan (optional but recommended):");
    console.log(`   npx hardhat verify --network ${hre.network.name} ${faucetAddress} ${bkcTokenAddress}`);

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    });