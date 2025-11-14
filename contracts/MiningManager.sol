// contracts/MiningManager.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- Imports for UUPS (Upgradeable) Pattern ---
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

// --- Import Interfaces and Contracts ---
import "./IInterfaces.sol";
import "./BKCToken.sol";

/**
 * @title MiningManager (Guardian, Minter, V2)
 * @author Gemini AI (New contract based on project requirements)
 * @dev Central contract that manages all BKC minting and distribution based on services.
 * @notice Only contract authorized to mint the BKC token.
 */
contract MiningManager is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    IMiningManager // Implements the mining interface
{
    using SafeERC20Upgradeable for BKCToken;
    
    // --- Core Contracts ---
    IEcosystemManager public ecosystemManager;
    BKCToken public bkcToken;
    address public bkcTokenAddress; // Stores the token address
    
    // --- State ---
    mapping(string => address) public authorizedMiners; 
    bool private tgeMinted; 

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializer for the UUPS contract.
     */
    function initialize(
        address /* _initialOwner */, // Parameter commented out to silence warning.
        address _ecosystemManagerAddress
    ) public initializer {
        __Ownable_init(); // Sets msg.sender (deployer) as owner
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        // Initialize state variables
        tgeMinted = false; 

        require(_ecosystemManagerAddress != address(0), "MM: Hub cannot be zero");
        ecosystemManager = IEcosystemManager(_ecosystemManagerAddress);
        
        // Get BKC Token address and set state
        bkcTokenAddress = ecosystemManager.getBKCTokenAddress();
        require(bkcTokenAddress != address(0), "MM: BKC Token not set in Hub");
        bkcToken = BKCToken(bkcTokenAddress);

        // Ownership remains with msg.sender (Deployer).
    }

    // --- Admin Functions (Owner Only) ---
    
    /**
     * @notice (Owner) Authorizes a Spoke contract (e.g., RewardManager) to act as a "Miner" 
     * for a specific service key (e.g., "VESTING_SERVICE").
     * @param _serviceKey The key representing the service/pool (e.g., VESTING_SERVICE).
     * @param _spokeAddress The address of the Spoke contract.
     */
    function setAuthorizedMiner(string calldata _serviceKey, address _spokeAddress) external onlyOwner {
        require(_spokeAddress != address(0), "MM: Address cannot be zero");
        authorizedMiners[_serviceKey] = _spokeAddress;
    }
    
    /**
     * @notice (Owner) Mints the initial TGE supply (must be called only once).
     * @dev Called by the deployer after ownership of BKCToken is transferred to this contract.
     * @param to The recipient address for the TGE supply (usually the MiningManager itself).
     * @param amount The TGE supply amount.
     */
    function initialTgeMint(address to, uint256 amount) external onlyOwner {
        require(!tgeMinted, "MM: TGE already minted");
        tgeMinted = true;
        bkcToken.mint(to, amount);
    }

    // --- Core Mining Logic (Called by Authorized Spokes) ---

    /**
     * @notice The central point for all "Proof-of-Purchase" mining.
     * @dev Calculates the final amount to mint and distributes to pools via BKC.mint().
     * @param _serviceKey The key representing the service (e.g., VESTING_SERVICE).
     * @param _purchaseAmount The BKC amount spent by the user (after fees).
     * @return bonusAmount The bonus amount (if any) to be sent back to the Buyer (Spoke).
     */
    function performPurchaseMining(
        string calldata _serviceKey,
        uint256 _purchaseAmount
    ) external nonReentrant returns (uint256 bonusAmount) {
        // 1. Authorization Check (Ensures only authorized Spoke calls this)
        require(msg.sender == authorizedMiners[_serviceKey], "MM: Caller not authorized for service");
        
        // 2. Mining Calculation
        uint256 totalMintAmount = getMintAmount(_purchaseAmount);
        if (totalMintAmount == 0) return 0;
        
        // 3. Distribution Calculation (Golden Rule from Hub)
        uint256 treasuryShareBips = ecosystemManager.getMiningDistributionBips("TREASURY");
        uint256 validatorShareBips = ecosystemManager.getMiningDistributionBips("VALIDATOR_POOL");
        uint256 delegatorShareBips = ecosystemManager.getMiningDistributionBips("DELEGATOR_POOL");
        
        uint256 buyerBonusBips = ecosystemManager.getMiningBonusBips(_serviceKey);
        
        // Shares
        uint256 treasuryAmount = (totalMintAmount * treasuryShareBips) / 10000;
        uint256 validatorAmount = (totalMintAmount * validatorShareBips) / 10000;
        uint256 delegatorAmount = (totalMintAmount * delegatorShareBips) / 10000;
        
        // Bonus (is the remainder after pool shares)
        uint256 totalPoolShares = treasuryAmount + validatorAmount + delegatorAmount;
        uint256 baseBonusAmount = totalMintAmount - totalPoolShares;

        // Apply Buyer Bonus Bips (This is the amount returned to the caller Spoke)
        bonusAmount = (baseBonusAmount * buyerBonusBips) / 10000; 

        // 4. Execute Minting and Transfer
        // Total amount to mint must match total distribution
        uint256 finalMintAmount = totalPoolShares + bonusAmount;
        
        // Mint tokens to the MiningManager contract (since it holds ownership of BKC Token)
        bkcToken.mint(address(this), finalMintAmount);

        // A. Distribute Treasury Share
        address treasury = ecosystemManager.getTreasuryAddress();
        if (treasuryAmount > 0) {
            bkcToken.transfer(treasury, treasuryAmount);
        }

        // B. Distribute Validator/Delegator Shares to DelegationManager
        address dm = ecosystemManager.getDelegationManagerAddress();
        uint256 totalDMShare = validatorAmount + delegatorAmount;
        if (totalDMShare > 0) {
            bkcToken.approve(dm, totalDMShare);
            IDelegationManager(dm).depositMiningRewards(validatorAmount, delegatorAmount);
        }
        
        // C. The remaining (bonusAmount) is transferred back to the Spoke (caller)
        if (bonusAmount > 0) {
            bkcToken.transfer(msg.sender, bonusAmount);
        }

        return bonusAmount;
    }

    // --- View Functions ---

    /**
     * @notice (Public View) Exposes the internal mining calculation for frontends.
     * @dev Simple 1:1 ratio for simplicity, adjust based on your tokenomics (e.g., time-decay).
     */
    function getMintAmount(uint256 _purchaseAmount) public pure override returns (uint256) {
        // Example: 1 BKC mining reward for 1 BKC purchase (1:1 ratio)
        return _purchaseAmount;
    }
    
    // --- New Transfer/Approval Functions for TGE Distribution ---
    
    /**
     * @notice Allows the owner (Deployer/DAO) to transfer BKC tokens held by the Guardian.
     * @dev Used for initial TGE distribution (e.g., Airdrop, Initial LP).
     * @param to The recipient address.
     * @param amount The amount to transfer.
     */
    function transferTokensFromGuardian(address to, uint256 amount) external onlyOwner {
        bkcToken.transfer(to, amount);
    }
    
    /**
     * @notice Allows the owner (Deployer/DAO) to approve spending of BKC tokens held by the Guardian.
     * @dev Used for initial TGE distribution (e.g., approving AMM pool funding).
     * @param spender The address allowed to spend.
     * @param amount The amount to approve.
     */
    function approveTokensFromGuardian(address spender, uint256 amount) external onlyOwner {
        bkcToken.approve(spender, amount);
    }


    // --- UUPS Upgrade Function ---
    /**
     * @dev Allows the owner (Deployer/DAO) to perform an upgrade.
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}