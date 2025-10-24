import hre from "hardhat";
import { ethers } from "hardhat";
import addresses from "../deployment-addresses.json";

// Valores fixos da sua solicitação
const NOTARY_FEE_BKC = 100; // 100 BKC
const TREASURY_BIPS = 5000; // 50%

// Porcentagem do Total Supply para o pStake Mínimo: 0.0001% = 1 BIPS
const MIN_PSTAKE_BIPS = 1; 

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
    
    // NOTA: O cálculo de pStake no frontend/contrato usa 'amountInEther * durationInDays'.
    // O pStake aqui deve ser o VALOR ETHER que, com a DURAÇÃO PADRÃO, resulta no pStake mínimo.
    // Para simplificar e seguir o padrão de 0.0001% do Total Supply (0.0001% = 1 BIPS / 1000000),
    // vamos usar o Total Supply * 1 / 1.000.000.
    
    const totalSupply = await bkcToken.totalSupply();
    const divisor = 1_000_000n; // Equivalente a 0.0001%
    
    // O valor do pStake é o valor em Ether, e não o valor do pStake em si.
    // Se o Total Supply é 200M, 0.0001% é 20.000 BKC.
    const minStakeAmountWei = totalSupply / divisor; 
    
    // Para converter isso em um valor "pStake", precisaríamos saber a duração.
    // Contudo, como o pStake mínimo é um valor arbitrário, vamos defini-lo
    // diretamente como um valor fixo, já que a fórmula complexa só existe no DelegationManager.
    // Vamos usar um valor fixo baseado na escassez, seguindo o padrão de exemplo do validador.
    
    const MIN_PSTAKE_VALUE = 100000n; // Definindo um valor base de 100k pStake se o cálculo for muito complexo.
    const finalMinPStake = minStakeAmountWei > 0n ? minStakeAmountWei : MIN_PSTAKE_VALUE;

    console.log(`2. Calculando pStake Mínimo: ${ethers.formatEther(finalMinPStake)} (aprox. ${finalMinPStake} pStake)`);


    // --- 3. Chamando setNotarySettings ---
    console.log("\n3. Enviando transação setNotarySettings...");
    
    try {
        const tx = await notaryContract.setNotarySettings(
            finalMinPStake, // pStake Mínimo
            feeInWei,       // Taxa em BKC
            TREASURY_BIPS   // Divisão da Taxa
        );

        console.log("   -> Transação enviada. Aguardando confirmação...");
        await tx.wait();
        
        console.log("✅ Configurações do DecentralizedNotary atualizadas com sucesso!");
        console.log(`   - Taxa: ${NOTARY_FEE_BKC} BKC`);
        console.log(`   - pStake Mínimo: ${finalMinPStake.toString()} pStake (equiv. a ${ethers.formatEther(finalMinPStake)} BKC de base)`);
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