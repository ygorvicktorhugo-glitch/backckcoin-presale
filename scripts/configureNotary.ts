import hre from "hardhat";
import { ethers } from "hardhat";
import addresses from "../deployment-addresses.json";

// Valores fixos da sua solicitação
const NOTARY_FEE_BKC = 100; // 100 BKC
const TREASURY_BIPS = 5000; // 50%

// Porcentagem do Total Supply para o pStake Mínimo: 0.0001% = 1 / 1,000,000
const MIN_PSTAKE_DIVISOR = 1_000_000n; 
const MIN_PSTAKE_FALLBACK = 1_000n; // Fallback para 1,000 pStake se o Supply for muito baixo.

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("🚀 Iniciando a configuração de taxas e pStake do DecentralizedNotary...");

    const notaryAddress = addresses.decentralizedNotary;
    const bkcTokenAddress = addresses.bkcToken;

    if (!notaryAddress || !bkcTokenAddress) {
        console.error("❌ Erro: Endereços Notary ou BKCToken não encontrados em deployment-addresses.json.");
        process.exit(1);
    }

    const notaryContract = await ethers.getContractAt("DecentralizedNotary", notaryAddress, deployer);
    const bkcToken = await ethers.getContractAt("BKCToken", bkcTokenAddress, deployer);

    // --- 1. Calcular a Taxa em WEI (100 BKC) ---
    const feeInWei = ethers.parseUnits(String(NOTARY_FEE_BKC), 18);
    console.log(`1. Definindo Taxa de Notarização para: ${NOTARY_FEE_BKC} BKC (${feeInWei.toString()} Wei)`);


    // --- 2. Calcular o pStake Mínimo (0.0001% do Total Supply) ---
    
    const totalSupplyWei = await bkcToken.totalSupply();
    
    // Converte Total Supply de Wei para unidades BKC (unidades base, sem decimais)
    // Ex: 50,555,452.419 BKC (50_555_452_419546275392000000 Wei) -> 50555452n (unidades inteiras)
    const totalSupplyBKCUnits = totalSupplyWei / ethers.parseUnits("1", 18);
    
    // Calcula 0.0001% em unidades pStake
    // Ex: 50,555,452 / 1,000,000 = 50 pStake (aproximadamente)
    let calculatedMinPStake = totalSupplyBKCUnits / MIN_PSTAKE_DIVISOR;

    // Garante que o valor final seja pelo menos o fallback se o cálculo for zero ou muito baixo
    if (calculatedMinPStake < MIN_PSTAKE_FALLBACK) {
        calculatedMinPStake = MIN_PSTAKE_FALLBACK;
    }
    
    const finalMinPStake = calculatedMinPStake; // Este é o valor BigInt que representa o pStake mínimo
    
    console.log(`2. pStake Total da Rede (Unidades): ${totalSupplyBKCUnits.toString()}`);
    console.log(`3. pStake Mínimo Calculado (0.0001%): ${finalMinPStake.toString()} pStake`);


    // --- 4. Chamando setNotarySettings ---
    console.log("\n4. Enviando transação setNotarySettings...");
    
    try {
        const tx = await notaryContract.setNotarySettings(
            finalMinPStake, // pStake Mínimo (como um número inteiro BigInt)
            feeInWei,       // Taxa em BKC (em Wei)
            TREASURY_BIPS   // Divisão da Taxa
        );

        console.log("   -> Transação enviada. Aguardando confirmação...");
        await tx.wait();
        
        console.log("✅ Configurações do DecentralizedNotary atualizadas com sucesso!");
        console.log(`   - Taxa: ${NOTARY_FEE_BKC} BKC`);
        console.log(`   - pStake Mínimo: ${finalMinPStake.toString()} pStake`);
        console.log(`   - Divisão Tesouraria: ${TREASURY_BIPS / 100}%`);
        
    } catch (error: any) {
        console.error("❌ Falha ao configurar o Notary. Motivo:", error.message);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("❌ Erro durante a configuração do Notary:", error);
    process.exitCode = 1;
});