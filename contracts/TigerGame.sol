// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./BKCToken.sol"; 
import "./EcosystemManager.sol";

// [MANTIDO]
interface IRewardManager {
    function performGameMiningAndDistribution(uint256 _purchaseAmount) external;
    function setTigerGameAddress(address _gameAddress) external;
}

/**
 * @title FortuneTiger (TigerGame - Refatorado V7)
 * @dev Contrato refatorado para:
 * @notice 1. Lógica "Highest Prize Wins": Paga SOMENTE o maior prêmio ganho, não a soma.
 * @notice 2. Lógica "BIPS": Permite multiplicadores decimais (ex: 1.5x = 15000).
 * @notice 3. Flexibilidade: O número de pools ativas é configurável (não fixo em 4).
 * @notice V6: Limite de Prêmio reduzido para 50% da Piscina.
 */
contract FortuneTiger is Ownable, ReentrancyGuard {

    IEcosystemManager public immutable ecosystemManager;
    BKCToken public immutable bkcToken;
    IRewardManager public immutable rewardManager; 

    // --- CONSTANTES DO JOGO E DISTRIBUIÇÃO ---
    // (Mantidas)
    uint256 public constant SERVICE_FEE_BIPS = 1000;
    uint256 public constant PRIZE_POOL_SHARE_BIPS = 9000;
    uint256 public constant TREASURY_FEE_BIPS = 500;
    uint256 public constant DELEGATOR_FEE_BIPS = 500;
    uint256 public constant TOTAL_SHARE_BIPS = 10000;
    uint256 public constant MAX_PRIZE_POOL_BIPS = 5000; 

    // --- [DEPOIS] NOVA VARIÁVEL DE FLEXIBILIDADE ---
    uint256 public activePoolCount;

    // --- ESTRUTURA DE DADOS DAS PISCINAS ---
    struct PrizePool {
        // [ANTES] uint256 multiplier;
        uint256 multiplierBips; // [DEPOIS] Ex: 1.5x = 15000
        uint256 chanceDenominator;
        uint256 balance;
        uint256 contributionShareBips;
    }
    // [MODIFICADO] Mapeamento agora suporta mais pools, mas será limitado pelo activePoolCount
    mapping(uint256 => PrizePool) public prizePools; // 0, 1, 2, 3...

    // --- EVENTOS ---
    event GamePlayed(address indexed user, uint256 amountWagered, uint256 totalPrizeWon);
    // [MODIFICADO] Nome do evento
    event PoolConfigured(uint256 indexed poolId, uint256 multiplierBips, uint256 contributionBips);

    // --- CONSTRUTOR ---
    // (Mantido)
    constructor(
        address _ecosystemManager,
        address _bkcToken,
        address _rewardManager,
        address _initialOwner
    ) Ownable(_initialOwner) {
        require(_ecosystemManager != address(0), "FT: Hub cannot be zero");
        ecosystemManager = IEcosystemManager(_ecosystemManager);

        require(_bkcToken != address(0), "FT: Token not configured in Hub");
        bkcToken = BKCToken(_bkcToken);

        require(_rewardManager != address(0), "FT: RewardManager cannot be zero");
        rewardManager = IRewardManager(_rewardManager);
    }
    
    // --- FUNÇÕES DE ADMINISTRAÇÃO ---
    
    /**
     * @notice (Owner) Configura as N piscinas de prêmios (Flexível).
     * @dev Define o número de piscinas ativas com base no tamanho dos arrays.
     */
    function setPools(
        uint256[] calldata _multipliersBips, // [DEPOIS] Nome alterado
        uint256[] calldata _denominators,
        uint256[] calldata _contributionBips
    ) external onlyOwner {
        
        // [DEPOIS] Lógica de flexibilidade
        uint256 count = _multipliersBips.length;
        require(count > 0 && count == _denominators.length && count == _contributionBips.length, "Game: Arrays incompativeis");
        
        activePoolCount = count; // Define o número de pools ativas
        
        uint256 totalBips = 0;
        
        // [DEPOIS] Loop usa a contagem flexível
        for (uint256 i = 0; i < count; i++) { 
            require(_multipliersBips[i] > 0 && _denominators[i] > 0, "Game: Valores invalidos");
            
            prizePools[i] = PrizePool({
                // [ANTES] multiplier: _multipliers[i],
                multiplierBips: _multipliersBips[i], // [DEPOIS]
                chanceDenominator: _denominators[i],
                balance: prizePools[i].balance, // Mantém o saldo existente
                contributionShareBips: _contributionBips[i]
            });
            
            totalBips += _contributionBips[i];
            
            emit PoolConfigured(i, _multipliersBips[i], _contributionBips[i]);
        }
        require(totalBips == TOTAL_SHARE_BIPS, "Game: Contribuicao BIPS deve somar 10000");
    }

    /**
     * @notice (Owner) Adiciona liquidez inicial às piscinas.
     */
    function addInitialLiquidity(uint256 _poolId, uint256 _amount) external onlyOwner {
        // [ANTES] require(_poolId < 4, "Game: Invalid pool ID");
        require(_poolId < activePoolCount, "Game: Invalid pool ID"); // [DEPOIS] Usa contagem flexível
        
        require(_amount > 0, "Game: Amount must be positive");
        
        // Assume que o owner já transferiu o BKC para este contrato.
        prizePools[_poolId].balance += _amount;
    }

    // --- FUNÇÃO PRINCIPAL DE JOGO ---

    /**
     * @notice Joga no Tiger Game, verifica pStake, cobra taxa, realiza sorteio e PAGA O MAIOR PRÊMIO.
     */
    function play(uint256 _amount, uint256 _boosterTokenId) external nonReentrant {
        require(_amount > 0, "Game: Aposta deve ser positiva");
        
        // 1. AUTORIZAÇÃO E PSTAKE (Mantido)
        ecosystemManager.authorizeService("TIGER_GAME_SERVICE", msg.sender, _boosterTokenId);
        require(bkcToken.transferFrom(msg.sender, address(this), _amount), "Game: Transferencia de aposta falhou");

        // 2. CÁLCULO E DISTRIBUIÇÃO DA TAXA DE SERVIÇO (10%) (Mantido)
        uint256 treasuryAmount = (_amount * TREASURY_FEE_BIPS) / TOTAL_SHARE_BIPS;
        uint256 delegatorFeeAmount = (_amount * DELEGATOR_FEE_BIPS) / TOTAL_SHARE_BIPS;
        uint256 prizePoolAmount = _amount - treasuryAmount - delegatorFeeAmount;

        // A. Tesouraria (5%) (Mantido)
        if (treasuryAmount > 0) {
            require(bkcToken.transfer(ecosystemManager.getTreasuryAddress(), treasuryAmount), "Game: Falha na transferencia p/ Tesouraria");
        }

        // B. Delegadores (5%) (Mantido)
        if (delegatorFeeAmount > 0) {
            address dm = ecosystemManager.getDelegationManagerAddress();
            bkcToken.approve(dm, delegatorFeeAmount);
            IDelegationManager(dm).depositRewards(0, delegatorFeeAmount);
        }
        
        // 3. MINERAÇÃO POR COMPRA (POP MINING) (Mantido)
        rewardManager.performGameMiningAndDistribution(_amount);
        
        // 4. DISTRIBUIÇÃO PARA AS PISCINAS (90%) e SORTEIO
        
        // --- [DEPOIS] INÍCIO DA MODIFICAÇÃO (LÓGICA "HIGHEST PRIZE WINS") ---
        
        // [ANTES] uint256 totalPrizeWon = 0;
        uint256 highestPrizeWon = 0; // Rastreia o maior prêmio
        uint256 highestPrizePoolId = 0; // Rastreia a pool vencedora
        bool prizeWasHit = false; // Flag para saber se algum prêmio foi ganho

        uint256 randomSeed = uint256(blockhash(block.number - 1));
        
        // [DEPOIS] Loop usa a contagem flexível
        for (uint256 poolId = 0; poolId < activePoolCount; poolId++) {
            
            PrizePool storage pool = prizePools[poolId];
            
            // A. Reabastecimento da Piscina (Lógica mantida)
            uint256 contribution = (prizePoolAmount * pool.contributionShareBips) / TOTAL_SHARE_BIPS;
            pool.balance += contribution;
            
            // B. Sorteio 
            if (pool.chanceDenominator > 0 && randomSeed % pool.chanceDenominator == 0) { 
                
                // C. CÁLCULO DO PRÊMIO SUSTENTÁVEL
      
                // [DEPOIS] Usa multiplierBips
                // 1. O Teto Multiplicador: valor apostado * X
                uint256 maxPrizeMultiplier = (_amount * pool.multiplierBips) / 10000; // Dividido por 10000 BIPS

                // 2. O Limite de Sustentabilidade (50% da liquidez)
                uint256 maxPrizeSustainability = (pool.balance * MAX_PRIZE_POOL_BIPS) / 10000;
                
                // O prêmio a ser pago é o MÍNIMO dos dois limites:
                uint256 prizeAmount = (maxPrizeMultiplier < maxPrizeSustainability) 
                                        ? maxPrizeMultiplier
                                        : maxPrizeSustainability;

                // --- [DEPOIS] LÓGICA DE DECISÃO ---
                // Se o prêmio desta pool for o maior até agora, armazene-o.
                if (prizeAmount > highestPrizeWon) {
                    highestPrizeWon = prizeAmount;
                    highestPrizePoolId = poolId;
                    prizeWasHit = true;
                }
                
                // [ANTES] A lógica de pagamento foi removida daqui.
                // pool.balance -= prizeAmount;
                // require(bkcToken.transfer(msg.sender, prizeAmount), ...);
                // totalPrizeWon += prizeAmount;
            }
        }
        
        // D. PAGAMENTO (Fora do Loop)
        // Após verificar todas as pools, pagamos APENAS o maior prêmio.
        if (prizeWasHit) {
            // Pega a pool vencedora (a que tinha o maior prêmio)
            PrizePool storage winningPool = prizePools[highestPrizePoolId];
            
            winningPool.balance -= highestPrizeWon; // Subtrai o saldo
            require(bkcToken.transfer(msg.sender, highestPrizeWon), "Game: Falha na transferencia do premio");
        }
        
        // Emite o prêmio final (que é 0 se não ganhou, or o maior prêmio)
        emit GamePlayed(msg.sender, _amount, highestPrizeWon);

    }
}