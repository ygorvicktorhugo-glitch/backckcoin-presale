// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- Imports for UUPS (Upgradeable) Pattern ---
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
// --- Import Interfaces ---
import "./IInterfaces.sol";
import "./BKCToken.sol";

/**
 * @title MiningManager (V1 - UUPS Guardian)
 * @author Gemini AI (Based on original contracts)
 * @dev This UUPS contract is the "Guardian" of the token supply.
 * @notice It is the *only* contract authorized to mint new BKCToken.
 * @notice It reads distribution rules from the EcosystemManager (the "Brain").
 * @notice This contract MUST be set as the `owner` of the BKCToken contract.
 */
contract MiningManager is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable
{
    // --- Core Contracts ---
    IEcosystemManager public ecosystemManager;
    BKCToken public bkcToken;

    // --- State ---
    mapping(string => address) public authorizedMiners;

    // --- Tokenomic Constants ---
    uint256 public constant MAX_SUPPLY = 200_000_000 * 10**18;
    uint256 public constant TGE_SUPPLY = 40_000_000 * 10**18;
    uint256 public constant MINT_POOL = MAX_SUPPLY - TGE_SUPPLY;
    
    // --- Events ---
    event MinerAuthorized(string indexed serviceKey, address indexed spokeAddress);
    event MiningExecuted(
        string indexed serviceKey,
        uint256 purchaseAmount,
        uint256 totalMinted,
        uint256 buyerBonus
    );
    event MiningDistribution(
        uint256 treasuryShare,
        uint256 validatorShare,
        uint256 delegatorShare
    );
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializer for the UUPS contract.
     * @param _initialOwner The address of your MultiSig.
     * @param _ecosystemManagerAddress The address of the deployed EcosystemManager (Brain).
     */
    function initialize(
        address _initialOwner,
        address _ecosystemManagerAddress
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        require(
            _ecosystemManagerAddress != address(0),
            "MiningManager: EcosystemManager cannot be zero"
        );
        require(_initialOwner != address(0), "MiningManager: Invalid owner address");
        
        ecosystemManager = IEcosystemManager(_ecosystemManagerAddress);

        address _bkcTokenAddress = ecosystemManager.getBKCTokenAddress();
        require(
            _bkcTokenAddress != address(0),
            "MiningManager: BKCToken not set in EcosystemManager"
        );
        bkcToken = BKCToken(_bkcTokenAddress);
        
        _transferOwnership(_initialOwner);
    }

    // --- Admin Functions ---

    /**
     * @notice (Owner) Authorizes or de-authorizes a Spoke contract to trigger mining.
     */
    function setAuthorizedMiner(
        string calldata _serviceKey,
        address _spokeAddress
    ) external onlyOwner {
        authorizedMiners[_serviceKey] = _spokeAddress;
        emit MinerAuthorized(_serviceKey, _spokeAddress);
    }

    // --- Core Mining Function ---

    /**
     * @notice (Called by Spokes) The central point for all "Proof-of-Purchase" mining.
     */
    function performPurchaseMining(
        string calldata _serviceKey,
        uint256 _purchaseAmount
    ) external returns (uint256 bonusAmount) {
        // 1. VERIFY SPOKE
        require(
            authorizedMiners[_serviceKey] == msg.sender,
            "MiningManager: Caller is not the authorized spoke for this key"
        );
        
        // 2. CALCULATE MINT
        uint256 totalMintAmount = _calculateMintAmount(_purchaseAmount);
        if (totalMintAmount == 0) {
            return 0;
        }

        // 3. MINT
        bkcToken.mint(address(this), totalMintAmount);
        
        // 4. READ RULES
        uint256 bonusBips = ecosystemManager.getMiningBonusBips(_serviceKey);
        uint256 treasuryBips = ecosystemManager.getMiningDistributionBips("TREASURY");
        uint256 validatorBips = ecosystemManager.getMiningDistributionBips("VALIDATOR_POOL");
        uint256 delegatorBips = ecosystemManager.getMiningDistributionBips("DELEGATOR_POOL");
        
        // 5. CALCULATE SHARES
        bonusAmount = (totalMintAmount * bonusBips) / 10000;
        uint256 remainingAmount = totalMintAmount - bonusAmount;

        uint256 treasuryShare = (remainingAmount * treasuryBips) / 10000;
        uint256 validatorShare = (remainingAmount * validatorBips) / 10000;
        uint256 delegatorShare = remainingAmount - treasuryShare - validatorShare;
            
        // 6. DISTRIBUTE
        address treasury = ecosystemManager.getTreasuryAddress();
        address dm = ecosystemManager.getDelegationManagerAddress();
        require(
            treasury != address(0) && dm != address(0),
            "MiningManager: Core addresses not set in Brain"
        );
        
        // A. Send Buyer Bonus
        if (bonusAmount > 0) {
            bkcToken.transfer(msg.sender, bonusAmount);
        }

        // B. Send Treasury Share
        if (treasuryShare > 0) {
            bkcToken.transfer(treasury, treasuryShare);
        }

        // C. Send Validator and Delegator Shares
        uint256 totalPoolAmount = validatorShare + delegatorShare;
        if (totalPoolAmount > 0) {
            bkcToken.approve(dm, totalPoolAmount);
            IDelegationManager(dm).depositMiningRewards(
                validatorShare,
                delegatorShare
            );
        }

        emit MiningExecuted(
            _serviceKey,
            _purchaseAmount,
            totalMintAmount,
            bonusAmount
        );
        emit MiningDistribution(treasuryShare, validatorShare, delegatorShare);

        return bonusAmount;
    }

    // --- Internal Functions ---

    /**
     * @notice (Internal) Calculates the amount to mint based on dynamic scarcity.
     */
    function _calculateMintAmount(uint256 _purchaseAmount)
        internal
        view
        returns (uint256)
    {
        uint256 currentSupply = bkcToken.totalSupply();
        if (currentSupply >= MAX_SUPPLY) {
            return 0;
        }

        uint256 remainingInPool = MAX_SUPPLY - currentSupply;
        if (remainingInPool == 0) {
            return 0;
        }

        uint256 finalMintAmount = (remainingInPool * _purchaseAmount) / MINT_POOL;
        
        if (currentSupply + finalMintAmount > MAX_SUPPLY) {
            finalMintAmount = MAX_SUPPLY - currentSupply;
        }

        return finalMintAmount;
    }
    
    /**
     * @notice (Public View) Exposes the internal mining calculation for frontends.
     */
    function getMintAmount(uint256 _purchaseAmount) public view returns (uint256) {
        return _calculateMintAmount(_purchaseAmount);
    }

    // --- UUPS Upgrade Function ---
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}