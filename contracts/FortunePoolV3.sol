// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Imports
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./IInterfaces.sol";
import "./BKCToken.sol";

/**
 * @title FortunePoolV3 (Oracle Enabled + Fee)
 * @author Gemini AI (Implementa Oráculo Assíncrono com taxa de gás)
 * @notice Implementa "Highest Prize Wins" com aleatoriedade de oráculo
 * e uma taxa de gás (em ETH/BNB) para financiar o Oráculo.
 */
contract FortunePoolV3 is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    // --- Core Contracts ---
    IEcosystemManager public ecosystemManager;
    BKCToken public bkcToken;
    IDelegationManager public delegationManager;
    address public miningManagerAddress;

    // --- Oracle State ---
    address public oracleAddress; // A carteira do seu backend (indexer.js)
    uint256 public oracleFeeInWei; // ✅ NOVO: A taxa em ETH/BNB (ex: 0.001 ETH)
    uint256 public gameCounter; 

    // --- Tokenomic Constants ---
    uint256 public constant TOTAL_FEE_BIPS = 1000;
    uint256 public constant TREASURY_SHARE_BIPS = 500;
    uint256 public constant DELEGATOR_SHARE_BIPS = 500;
    uint256 public constant TOTAL_BIPS = 10000;
    uint256 public constant MAX_PRIZE_PAYOUT_BIPS = 1000;

    // --- Pool State ---
    struct PrizeTier {
        bool isInitialized;
        uint256 chanceDenominator; 
        uint256 multiplierBips;
    }
    mapping(uint256 => PrizeTier) public prizeTiers; 
    uint256 public prizePoolBalance;
    uint256 public activeTierCount;
    mapping(uint256 => uint256[3]) public gameResults;

    // --- Events ---
    event TierCreated(uint256 indexed tierId, uint256 chance, uint256 multiplier);
    event PrizePoolToppedUp(uint256 amount);
    event OracleAddressSet(address indexed oracle);
    event OracleFeeSet(uint256 newFeeInWei); // ✅ NOVO
    
    event GameRequested(uint256 indexed gameId, address indexed user, uint256 purchaseAmount);
    event GameFulfilled(
        uint256 indexed gameId, 
        address indexed user, 
        uint256 prizeWon,
        uint256[3] rolls
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _initialOwner,
        address _ecosystemManagerAddress
    ) public initializer {
        __Ownable_init(); 
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        require(
            _ecosystemManagerAddress != address(0),
            "FP: EcosystemManager cannot be zero"
        );
        ecosystemManager = IEcosystemManager(_ecosystemManagerAddress);

        address _bkcTokenAddress = ecosystemManager.getBKCTokenAddress();
        address _dmAddress = ecosystemManager.getDelegationManagerAddress();
        address _miningManagerAddr = ecosystemManager.getMiningManagerAddress();

        require(
            _bkcTokenAddress != address(0) &&
                _dmAddress != address(0) &&
                _miningManagerAddr != address(0),
            "FP: Core contracts not set in Brain"
        );
        bkcToken = BKCToken(_bkcTokenAddress);
        delegationManager = IDelegationManager(_dmAddress);
        miningManagerAddress = _miningManagerAddr;
        
        _transferOwnership(_initialOwner);
    }

    // --- 1. Admin Functions ---

    /**
     * @notice (Owner) Define a carteira do Oráculo que pode chamar 'fulfillGame'.
     */
    function setOracleAddress(address _oracle) external onlyOwner {
        require(_oracle != address(0), "FP: Oracle cannot be zero address");
        oracleAddress = _oracle;
        emit OracleAddressSet(_oracle);
    }
    
    /**
     * @notice (Owner) Define a taxa (em Wei) que o usuário paga (em ETH/BNB)
     * para cobrir o custo de gás do Oráculo.
     */
    function setOracleFee(uint256 _feeInWei) external onlyOwner {
        oracleFeeInWei = _feeInWei;
        emit OracleFeeSet(_feeInWei);
    }

    function setPrizeTier(
        uint256 _tierId,
        uint256 _chanceDenominator,
        uint256 _multiplierBips
    ) external onlyOwner {
        require(_tierId > 0 && _tierId < 10, "FP: Invalid tier ID (1-9)");
        
        if (!prizeTiers[_tierId].isInitialized) {
            activeTierCount++;
        }
        prizeTiers[_tierId].isInitialized = true;
        prizeTiers[_tierId].chanceDenominator = _chanceDenominator;
        prizeTiers[_tierId].multiplierBips = _multiplierBips;

        emit TierCreated(_tierId, _chanceDenominator, _multiplierBips);
    }

    function topUpPool(uint256 _amount) external onlyOwner {
        require(_amount > 0, "FP: Amount must be greater than zero");
        bkcToken.transferFrom(msg.sender, address(this), _amount);
        _addAmountToPool(_amount);
        emit PrizePoolToppedUp(_amount);
    }

    function emergencyWithdraw() external onlyOwner {
        address treasury = ecosystemManager.getTreasuryAddress();
        require(treasury != address(0), "FP: Treasury not set in Brain");
        uint256 totalBalance = prizePoolBalance;
        prizePoolBalance = 0;
        if (totalBalance > 0) {
            bkcToken.transfer(treasury, totalBalance);
        }
    }

    // --- 2. Core Game Flow (Transação 1: Usuário) ---

    /**
     * @notice (Usuário) Paga e requisita um jogo.
     * @dev O usuário deve enviar a taxa do Oráculo (em ETH/BNB) como 'msg.value'
     * e pagar a aposta (em $BKC) via 'approve'.
     * @param _amount A quantidade de $BKC a ser apostada.
     */
    function participate(uint256 _amount) external payable nonReentrant {
        require(_amount > 0, "FP: Amount must be greater than zero");
        
        // ✅ NOVO: Verifica se o usuário enviou a taxa de gás (ETH/BNB) correta
        require(msg.value == oracleFeeInWei, "FP: Invalid native fee sent for Oracle");

        // ✅ NOVO: Repassa a taxa de gás para a carteira do Oráculo IMEDIAMENTE
        (bool sent, ) = oracleAddress.call{value: msg.value}("");
        require(sent, "FP: Failed to forward fee to Oracle");

        // --- 1. Taxas e PoP Mining (Lógica antiga) ---
        (uint256 purchaseAmount, uint256 buyerBonus) = _processFeesAndMining(_amount);
        _addAmountToPool(buyerBonus);

        // --- 2. Requisita o Jogo ---
        gameCounter++;
        uint256 newGameId = gameCounter;
        
        emit GameRequested(newGameId, msg.sender, purchaseAmount);
    }
    
    // --- 3. Core Game Flow (Transação 2: Oráculo) ---

    /**
     * @notice (Oráculo) Envia o número aleatório para finalizar um jogo.
     * @param _gameId O ID do jogo requisitado.
     * @param _user O usuário que requisitou o jogo.
     * @param _purchaseAmount O valor (pós-taxa) que o usuário apostou.
     * @param _randomNumber Um número aleatório seguro (ex: 256-bit) gerado pelo Oráculo.
     */
    function fulfillGame(
        uint256 _gameId,
        address _user,
        uint256 _purchaseAmount,
        uint256 _randomNumber
    ) external nonReentrant {
        // Apenas a carteira do seu backend (indexer.js) pode chamar esta função
        require(msg.sender == oracleAddress, "FP: Caller is not the authorized Oracle");
        // Garante que este jogo ainda não foi pago
        require(gameResults[_gameId][0] == 0, "FP: Game already fulfilled");

        uint256 highestPrizeWon = 0;
        uint256[3] memory rolls; 

        // Itera pelos 3 Tiers (1=3x, 2=10x, 3=100x)
        for (uint256 tierId = 1; tierId <= activeTierCount; tierId++) {
            PrizeTier storage tier = prizeTiers[tierId];
            
            if (tier.isInitialized && prizePoolBalance > 0) {
                // A. Rola o dado
                uint256 roll = (uint256(keccak256(abi.encodePacked(_randomNumber, tierId))) % tier.chanceDenominator) + 1;
                
                if(tierId <= 3) { rolls[tierId-1] = roll; } 

                // B. Verifica a vitória (roll == 1)
                if (roll == 1) { 
                    // C. Calcula o prêmio
                    uint256 maxPrizeMultiplier = (_purchaseAmount * tier.multiplierBips) / TOTAL_BIPS;
                    uint256 maxPrizeSustainability = (prizePoolBalance * MAX_PRIZE_PAYOUT_BIPS) / TOTAL_BIPS;
                    uint256 prizeAmount = (maxPrizeMultiplier < maxPrizeSustainability)
                        ? maxPrizeMultiplier
                        : maxPrizeSustainability;
                        
                    // D. Rastreia o prêmio mais alto
                    if (prizeAmount > highestPrizeWon) {
                        highestPrizeWon = prizeAmount;
                    }
                }
            }
        }

        gameResults[_gameId] = rolls;

        // --- 4. PAGAMENTO ---
        if (highestPrizeWon > 0) {
            prizePoolBalance -= highestPrizeWon; 
            bkcToken.transfer(_user, highestPrizeWon);
        }

        emit GameFulfilled(_gameId, _user, highestPrizeWon, rolls);
    }


    // --- 4. Internal Functions ---

    function _processFeesAndMining(uint256 _amount) internal returns (uint256 purchaseAmount, uint256 buyerBonus) {
        uint256 totalFee = (_amount * TOTAL_FEE_BIPS) / TOTAL_BIPS;
        purchaseAmount = _amount - totalFee;
        require(purchaseAmount > 0, "FP: Amount after fee is zero");
        
        uint256 treasuryFee = (_amount * TREASURY_SHARE_BIPS) / TOTAL_BIPS;
        uint256 delegatorFee = totalFee - treasuryFee;
        address treasury = ecosystemManager.getTreasuryAddress();
        require(treasury != address(0), "FP: Treasury not set in Brain");

        bkcToken.transferFrom(msg.sender, address(this), _amount);
        
        if (treasuryFee > 0) {
            bkcToken.transfer(treasury, treasuryFee);
        }
        if (delegatorFee > 0) {
            bkcToken.approve(address(delegationManager), delegatorFee);
            delegationManager.depositRewards(0, delegatorFee);
        }

        bkcToken.approve(miningManagerAddress, purchaseAmount);
        buyerBonus = IMiningManager(miningManagerAddress)
            .performPurchaseMining("FORTUNE_POOL_SERVICE", purchaseAmount);
    }
    
    function _addAmountToPool(uint256 _amount) internal {
        if (_amount == 0) return;
        
        if (activeTierCount == 0) {
            address treasury = ecosystemManager.getTreasuryAddress();
            require(treasury != address(0), "FP: Treasury not set in Brain");
            bkcToken.transfer(treasury, _amount);
            return;
        }
        prizePoolBalance += _amount;
    }

    // --- UUPS Upgrade Function ---
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}