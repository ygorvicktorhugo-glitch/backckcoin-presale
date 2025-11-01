// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; 
import "./BKCToken.sol";
import "./DelegationManager.sol"; 
import "./EcosystemManager.sol"; 
/**
 * @title RewardManager (Vesting Certificate NFT + PoP Mining)
 * @dev Manages "Proof-of-Purchase" Mining and the distribution of mining rewards.
 */
contract RewardManager is ERC721Enumerable, Ownable, ReentrancyGuard { 
    BKCToken public immutable bkcToken;
    DelegationManager public delegationManager;
    IEcosystemManager public immutable ecosystemManager; 
    address public immutable treasuryWallet;
    string private baseURI;

    // --- Constantes de Supply e Vesting ---
    uint256 public constant MAX_SUPPLY = 200_000_000 * 10**18;
    uint256 public constant TGE_SUPPLY = 40_000_000 * 10**18;
    uint256 public constant MINT_POOL = MAX_SUPPLY - TGE_SUPPLY;
    uint256 public constant VESTING_DURATION = 5 * 365 days;
    uint256 public constant INITIAL_PENALTY_BIPS = 5000;

    // --- Variáveis de Estado ---
    uint256 private _tokenIdCounter;
    mapping(address => uint256) public minerRewardsOwed;
    uint256 public nextValidatorIndex;

    address public tigerGameAddress;
    struct VestingPosition {
        uint256 totalAmount;
        uint256 startTime;
    }
    mapping(uint256 => VestingPosition) public vestingPositions;

    // --- Eventos ---
    event VestingCertificateCreated(uint256 indexed tokenId, address indexed recipient, uint256 netAmount);
    event CertificateWithdrawn(uint256 indexed tokenId, address indexed owner, uint256 amountToOwner, uint256 penaltyAmount);
    event MinerRewardClaimed(address indexed miner, uint256 amount);
    event TigerGameMiningExecuted(uint256 totalMinted, uint256 delegatorShare);

    // --- Construtor ---

    constructor(
        address _bkcTokenAddress,
        address _treasuryWallet,
        address _ecosystemManagerAddress, 
        address _initialOwner
    ) ERC721("Backchain Vesting Certificate", "BKCV") Ownable(_initialOwner) {
        require(_bkcTokenAddress != address(0), "RM: Invalid BKC Token address");
        require(_treasuryWallet != address(0), "RM: Invalid Treasury address");
        require(_ecosystemManagerAddress != address(0), "RM: Invalid EcosystemManager address");
        
        bkcToken = BKCToken(_bkcTokenAddress);
        treasuryWallet = _treasuryWallet;
        ecosystemManager = IEcosystemManager(_ecosystemManagerAddress); 
    }

    // --- Funções de Configuração ---

    function setDelegationManager(address _delegationManagerAddress) external onlyOwner {
        require(_delegationManagerAddress != address(0), "RM: Address cannot be zero");
        require(address(delegationManager) == address(0), "RM: Already set");
        delegationManager = DelegationManager(_delegationManagerAddress);
    }
    
    function setTigerGameAddress(address _gameAddress) external onlyOwner {
        require(_gameAddress != address(0), "RM: TigerGame cannot be zero address");
        tigerGameAddress = _gameAddress;
    }
    
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        baseURI = newBaseURI;
    }
    
    // --- FUNÇÃO ORIGINAL: createVestingCertificate (Mineração Convencional) ---
    function createVestingCertificate(address _recipient, uint256 _grossAmount) external nonReentrant {
        require(address(delegationManager) != address(0), "RM: DelegationManager not set");
        require(_grossAmount > 0, "RM: Amount must be greater than zero"); 
        require(_recipient != address(0), "RM: Invalid recipient"); 
        
        uint256 feeAmount = 0;
        uint256 netAmountForVesting = _grossAmount; 
        
        // Lógica de Taxa Condicional baseada no pStake do usuário
        uint256 userPStake = delegationManager.userTotalPStake(msg.sender);
        uint256 totalPStake = delegationManager.totalNetworkPStake(); 
        
        if (totalPStake > 0) { 
            uint256 userShareBIPS = (userPStake * 10000) / totalPStake;
            if (userShareBIPS < 10) { 
                feeAmount = (_grossAmount * 5) / 100;
            } 
            else if (userShareBIPS < 100) { 
                feeAmount = (_grossAmount * 2) / 100;
            }
        } else {
            feeAmount = (_grossAmount * 5) / 100;
        }
        
        if (feeAmount > 0) { 
            netAmountForVesting = _grossAmount - feeAmount;
            require(netAmountForVesting > 0, "RM: Amount after fee is zero"); 
            require(bkcToken.transferFrom(msg.sender, treasuryWallet, feeAmount), "RM: Fee transfer failed");
        }
        
        require(bkcToken.transferFrom(msg.sender, address(this), netAmountForVesting), "RM: Token transfer failed");
        // --- LÓGICA DE MINERAÇÃO E BÔNUS (10% para o Certificado) ---
        uint256 totalMintAmount = _calculateMintAmount(_grossAmount);
        uint256 finalVestingAmount = netAmountForVesting; 

        if (totalMintAmount > 0) { 
            uint256 certificateRewardAmount = (totalMintAmount * 10) / 100;
            // 10% para o certificado
            finalVestingAmount += certificateRewardAmount;
            if (certificateRewardAmount > 0) { 
                bkcToken.mint(address(this), certificateRewardAmount);
            }

            address selectedMiner = _selectNextValidator();
            require(selectedMiner != address(0), "RM: Could not select a miner"); 

            uint256 treasuryAmount = (totalMintAmount * 10) / 100;
            uint256 minerRewardAmount = (totalMintAmount * 15) / 100; 
            uint256 delegatorPoolAmount = totalMintAmount - (certificateRewardAmount + treasuryAmount + minerRewardAmount);
            
            if (treasuryAmount > 0) bkcToken.mint(treasuryWallet, treasuryAmount);
            if (minerRewardAmount > 0) { 
                minerRewardsOwed[selectedMiner] += minerRewardAmount;
                bkcToken.mint(address(this), minerRewardAmount); 
            }
            
            if (delegatorPoolAmount > 0) { 
                bkcToken.mint(address(this), delegatorPoolAmount);
                bkcToken.approve(address(delegationManager), delegatorPoolAmount); 
                delegationManager.depositRewards(0, delegatorPoolAmount); 
            }
        }
        
        uint256 tokenId = _tokenIdCounter++;
        _safeMint(_recipient, tokenId); 
        vestingPositions[tokenId] = VestingPosition({ totalAmount: finalVestingAmount, startTime: block.timestamp }); 
        emit VestingCertificateCreated(tokenId, _recipient, finalVestingAmount);
    }
    
    // --- NOVO: Função de Mineração para o TigerGame (Sem Certificado) ---
    function performGameMiningAndDistribution(uint256 _purchaseAmount) external nonReentrant {
        require(msg.sender == tigerGameAddress, "RM: Caller not authorized");
        require(address(delegationManager) != address(0), "RM: DelegationManager not set");
        
        uint256 totalMintAmount = _calculateMintAmount(_purchaseAmount);

        if (totalMintAmount > 0) {
            
            uint256 treasuryAmount = (totalMintAmount * 10) / 100;
            uint256 minerRewardAmount = (totalMintAmount * 15) / 100; 
            // 10% (Treasury) + 15% (Miner) = 25%. O restante é 75% para o Delegator Pool.
            uint256 delegatorPoolAmount = totalMintAmount - (treasuryAmount + minerRewardAmount);
            
            bkcToken.mint(address(this), totalMintAmount);
            address selectedMiner = _selectNextValidator();
            
            // ######################################################
            // ### CORREÇÃO APLICADA: Usa Dívida do Minerador ###
            // ######################################################
            if (minerRewardAmount > 0 && selectedMiner != address(0)) {
                // CORRIGIDO: Acumula a dívida, eliminando o bkcToken.transfer direto.
                minerRewardsOwed[selectedMiner] += minerRewardAmount;
            }

            if (treasuryAmount > 0) {
                // A Tesouraria deve receber diretamente (transferir do saldo cunhado)
                require(bkcToken.transfer(treasuryWallet, treasuryAmount), "RM: Falha no pagamento p/ Tesouraria");
            }
            
            if (delegatorPoolAmount > 0) {
                 bkcToken.approve(address(delegationManager), delegatorPoolAmount);
                 delegationManager.depositRewards(0, delegatorPoolAmount); 
            }
            emit TigerGameMiningExecuted(totalMintAmount, delegatorPoolAmount);
        }
    }
    
    // --- FUNÇÕES DE SAQUE E UTILIDADE ---

    function withdraw(uint256 _tokenId, uint256 _boosterTokenId) external nonReentrant { 
        // ... (lógica de withdraw e penalidade mantida do seu original)
        require(ownerOf(_tokenId) == msg.sender, "RM: Caller is not token owner");
        VestingPosition storage pos = vestingPositions[_tokenId];
        require(pos.totalAmount > 0, "RM: Certificate already withdrawn or invalid");

        uint256 timeElapsed = block.timestamp - pos.startTime;
        // 1. Calcula a penalidade base
        uint256 penaltyBips = 0;
        if (timeElapsed < VESTING_DURATION) {
            uint256 maxPenaltyTime = VESTING_DURATION;
            uint256 remainingTime = maxPenaltyTime - timeElapsed;
            penaltyBips = (INITIAL_PENALTY_BIPS * remainingTime) / maxPenaltyTime;
        }

        // 2. Aplica o desconto do Booster NFT (Corrigido)
        if (_boosterTokenId > 0) {
            address boosterAddress = ecosystemManager.getBoosterAddress();
            require(boosterAddress != address(0), "RM: Booster address not set in Hub");
            
            IRewardBoosterNFT booster = IRewardBoosterNFT(boosterAddress);
            
            try booster.ownerOf(_boosterTokenId) returns (address owner) {
                if (owner == msg.sender) {
                    uint256 boostBips = booster.boostBips(_boosterTokenId);
                    uint256 boostBipsDiscount = ecosystemManager.getBoosterDiscount(boostBips);
                    
                    if (boostBipsDiscount > 0) {
                        if (penaltyBips < boostBipsDiscount) {
                            penaltyBips = 0;
                        } else {
                            penaltyBips -= boostBipsDiscount;
                        }
                    }
                }
            } catch {
                // Ignore errors
            }
        }
        
    
        // 3. Calcula os valores de saque com a penalidade final
        (uint256 amountToOwner, uint256 penaltyAmount) = _calculateWithdrawalAmounts(pos, penaltyBips);
        uint256 totalVestingAmount = pos.totalAmount;
        delete vestingPositions[_tokenId];
        _burn(_tokenId);

        if (penaltyAmount > 0) {
            bkcToken.approve(address(delegationManager), penaltyAmount);
            delegationManager.depositRewards(0, penaltyAmount);
        }

        if (amountToOwner > 0) {
            require(bkcToken.transfer(msg.sender, amountToOwner), "RM: Failed to transfer withdrawal amount");
        }
        
        emit CertificateWithdrawn(_tokenId, msg.sender, amountToOwner, penaltyAmount);
    }

    function claimMinerRewards() external nonReentrant { 
        uint256 amount = minerRewardsOwed[msg.sender];
        require(amount > 0, "RM: No rewards to claim");

        minerRewardsOwed[msg.sender] = 0;
        require(bkcToken.transfer(msg.sender, amount), "RM: Transfer failed");
        
        emit MinerRewardClaimed(msg.sender, amount);
    }

    // --- Funções Internas de Cálculo ---

    function _calculateWithdrawalAmounts(
        VestingPosition memory _pos,
        uint256 _penaltyBips
    ) internal pure returns (uint256 amountToOwner, uint256 penaltyAmount) {
        if (_penaltyBips == 0) {
            return (_pos.totalAmount, 0);
        }
        
        penaltyAmount = (_pos.totalAmount * _penaltyBips) / 10000;
        amountToOwner = _pos.totalAmount - penaltyAmount;
    }

    function _calculateMintAmount(uint256 _purchaseAmount) internal view returns (uint256) {
        uint256 currentSupply = bkcToken.totalSupply();
        if (currentSupply >= MAX_SUPPLY) return 0;
        
        uint256 remainingInPool = MAX_SUPPLY - currentSupply;
        uint256 finalMintAmount = (remainingInPool * _purchaseAmount) / MINT_POOL;
        if (currentSupply + finalMintAmount > MAX_SUPPLY) {
            finalMintAmount = MAX_SUPPLY - currentSupply;
        }

        return finalMintAmount;
    }

    /**
     * @notice Expõe a função _calculateMintAmount para o frontend.
     * @dev Resolve o erro 'no matching function' chamando esta view publicamente.
     */
    function getMintRate(uint256 _purchaseAmount) public view returns (uint256) {
        return _calculateMintAmount(_purchaseAmount);
    }

    function _selectNextValidator() internal view returns (address) {
        address[] memory validators = delegationManager.getAllValidators();
        uint256 count = validators.length;
        if (count == 0) return address(0);
        
        uint256 index = nextValidatorIndex % count;
        return validators[index];
    }
    
    // --- Overrides ERC721 ---

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
        return string(abi.encodePacked(baseURI, "vesting_cert.json"));
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable)
        returns (address)
    {
        // Garante que o índice avance APENAS se não for o Tiger Game
        if (msg.sender != tigerGameAddress) {
             nextValidatorIndex = (nextValidatorIndex + 1);
        }
        
        return super._update(to, tokenId, auth);
    }
    
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}