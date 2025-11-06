// scripts/run_master.ts
import hre from "hardhat";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ########################################################
// ### COMPATIBILIDADE ESM/CJS PARA __dirname (Mantida) ###
// ########################################################
// Define __filename e __dirname, pois podem ser necessários em alguns ambientes Hardhat.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// ########################################################

// --- 📋 SEQUÊNCIA DE EXECUÇÃO ---
const SCRIPT_SEQUENCE = [
    { name: "1_deploy_core.ts", path: "./1_deploy_core.ts", description: "Implantação dos Contratos Principais" },
    { name: "0_faucet_test_supply.ts", path: "./0_faucet_test_supply.ts", description: "Financiamento Opcional de Teste (10M BKC)", isTest: true },
    { name: "2_configure_hub_addresses.ts", path: "./2_configure_hub_addresses.ts", description: "Configuração dos Endereços Centrais no Hub" },
    { name: "3_deploy_spokes.ts", path: "./3_deploy_spokes.ts", description: "Implantação dos Contratos Spoke (Pools/Game)" },
    { name: "4_configure_system.ts", path: "./4_configure_system.ts", description: "Configuração de Posse e Interdependências" },
    { name: "5_create_pools.ts", path: "./5_create_pools.ts", description: "Criação das Estruturas de Pool AMM" },
    { name: "6_setup_sale.ts", path: "./6_setup_sale.ts", description: "Configuração da Pré-Venda e Tesouraria" },
    { name: "7_configure_fees.ts", path: "./7_configure_fees.ts", description: "Definição de Taxas, pStake e Game Pools" },
];


async function main() {
    const networkName = hre.network.name;
    const isTestNet = (networkName === 'sepolia' || networkName === 'localhost' || networkName === 'hardhat');
    let successfulScripts = 0;

    console.log(`\n======================================================`);
    console.log(`=== INICIANDO EXECUÇÃO MASTER NA REDE: ${networkName.toUpperCase()} ===`);
    console.log(`======================================================`);

    for (const script of SCRIPT_SEQUENCE) {
        
        if (script.isTest && !isTestNet) {
            console.log(`\n--- ⏭️ PULANDO ${script.name} (${script.description}) ---`);
            continue;
        }

        console.log(`\n--- ⏳ EXECUTANDO PASSO: ${script.name} (${script.description}) ---`);

        try {
            let module;
            
            // 1. Tentar importar com extensão .js (exigido pelo Node ESM)
            try {
                 // Converte o caminho para URL/URI antes da importação
                 const modulePath = new URL(script.path.replace('.ts', '.js'), import.meta.url).toString();
                 module = await import(modulePath);
            } catch (e) {
                 // 2. Tentar importar com a extensão .ts (necessário para o ts-node em alguns hardhats)
                 const modulePath = new URL(script.path, import.meta.url).toString();
                 module = await import(modulePath);
            }
            
            // Verifica a função exportada e executa
            if (module && typeof module.runScript === 'function') {
                await module.runScript(hre);
            } else {
                throw new Error("Função 'runScript' não encontrada no módulo importado.");
            }

            console.log(`✅ ${script.name} CONCLUÍDO COM SUCESSO.`);
            successfulScripts++;
            
            await new Promise(resolve => setTimeout(resolve, 3000)); 

        } catch (error: any) {
            console.error(`\n======================================================`);
            console.error(`❌ FALHA CRÍTICA NA EXECUÇÃO SEQUENCIAL: ${script.name}`);
            console.error(`ERRO: ${error.message}`);
            console.error(`======================================================`);
            // Se falhar, encerra o processo
            process.exit(1);
        }
    }

    console.log(`\n\n======================================================`);
    console.log(`🎉 EXECUÇÃO MASTER CONCLUÍDA!`);
    console.log(`Total de scripts executados com sucesso: ${successfulScripts}`);
    console.log(`======================================================\n`);
}

main().catch((error) => {
    console.error("ERRO FATAL NA FUNÇÃO MAIN:", error);
    process.exit(1);
});