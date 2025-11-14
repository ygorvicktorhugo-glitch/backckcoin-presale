// contracts/EcosystemManager.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- Imports for UUPS (Upgradeable) Pattern ---
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
// --- Import Interfaces ---
import "./IInterfaces.sol";

/**
 * @title EcosystemManager (V3 - UUPS Upgradable & Flexible)
 * @author Gemini AI (Based on original contracts)
 * @dev The UUPS (upgradable) "Brain" that stores ALL business rules.
 */
contract EcosystemManager is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    IEcosystemManager
{
    // --- 1. ADDRESS REGISTRY ---
    address public bkcTokenAddress;
    address public treasuryWallet;
    address public delegationManagerAddress;
    address public rewardBoosterAddress;
    address public miningManagerAddress;
    address public rewardManagerAddress;
    address public decentralizedNotaryAddress;
    address public fortunePoolAddress;
    
    // --- ARCHITECTURE CHANGE ---
    // address public nftLiquidityPoolAddress; // REMOVED
    address public nftLiquidityPoolFactoryAddress; // ADDED


    // --- 2. SERVICE RULES (Spokes) ---
    mapping(string => uint256) public serviceFees;
    mapping(string => uint256) public servicePStakeMinimums;
    // --- 3. DISCOUNT RULES (Booster) ---
    mapping(uint256 => uint256) public boosterDiscountsBips;
    // --- 4. THE "GOLDEN RULE" (Mining Distribution) ---
    mapping(string => uint256) public miningDistributionBips;
    mapping(string => uint256) public miningBonusBips;
    
    // --- Events ---
    event AddressSet(string indexed key, address indexed newAddress);
    event FeeSet(string indexed serviceKey, uint256 newFee);
    event PStakeMinimumSet(string indexed serviceKey, uint256 newPStake);
    event BoosterDiscountSet(uint256 indexed boostBips, uint256 discountBips);
    event MiningDistributionSet(string indexed poolKey, uint256 bips);
    event MiningBonusSet(string indexed serviceKey, uint256 bips);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _initialOwner) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        require(_initialOwner != address(0), "Ecosystem: Invalid owner address");
        _transferOwnership(_initialOwner);

        // Sets the original default discounts.
        boosterDiscountsBips[5000] = 5000;
        boosterDiscountsBips[4000] = 4000;
        boosterDiscountsBips[3000] = 3000;
        boosterDiscountsBips[2000] = 2000;
        boosterDiscountsBips[1000] = 1000;
        boosterDiscountsBips[500] = 500;
        boosterDiscountsBips[100] = 100;
        // Sets the default mining percentages (Golden Rule)
        miningDistributionBips["TREASURY"] = 1000;
        miningDistributionBips["VALIDATOR_POOL"] = 1500;
        miningDistributionBips["DELEGATOR_POOL"] = 7500;

        // Sets the default buyer bonus
        miningBonusBips["VESTING_SERVICE"] = 1000;
        miningBonusBips["TIGER_GAME_SERVICE"] = 0;
    }

    // --- 5. ADMIN FUNCTIONS (Total Flexibility) ---

    function setBKCTokenAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "Ecosystem: Address cannot be zero");
        bkcTokenAddress = _addr;
        emit AddressSet("BKCToken", _addr);
    }
    function setTreasuryAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "Ecosystem: Address cannot be zero");
        treasuryWallet = _addr;
        emit AddressSet("Treasury", _addr);
    }
    function setDelegationManagerAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "Ecosystem: Address cannot be zero");
        delegationManagerAddress = _addr;
        emit AddressSet("DelegationManager", _addr);
    }
    function setRewardBoosterAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "Ecosystem: Address cannot be zero");
        rewardBoosterAddress = _addr;
        emit AddressSet("RewardBooster", _addr);
    }
    function setMiningManagerAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "Ecosystem: Address cannot be zero");
        miningManagerAddress = _addr;
        emit AddressSet("MiningManager", _addr);
    }
    function setRewardManagerAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "Ecosystem: Address cannot be zero");
        rewardManagerAddress = _addr;
        emit AddressSet("RewardManager", _addr);
    }
    function setDecentralizedNotaryAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "Ecosystem: Address cannot be zero");
        decentralizedNotaryAddress = _addr;
        emit AddressSet("DecentralizedNotary", _addr);
    }
    function setFortunePoolAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "Ecosystem: Address cannot be zero");
        fortunePoolAddress = _addr;
        emit AddressSet("FortunePool", _addr);
    }
    
    // --- ARCHITECTURE CHANGE ---
    /**
     * @notice (Owner) Sets the address of the NEW Pool Factory.
     */
    function setNFTLiquidityPoolFactoryAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "Ecosystem: Address cannot be zero");
        nftLiquidityPoolFactoryAddress = _addr;
        emit AddressSet("NFTLiquidityPoolFactory", _addr);
    }


    function setFee(string calldata _serviceKey, uint256 _fee)
        external
        onlyOwner
    {
        serviceFees[_serviceKey] = _fee;
        emit FeeSet(_serviceKey, _fee);
    }

    function setPStakeMinimum(string calldata _serviceKey, uint256 _pStake)
        external
        onlyOwner
    {
        servicePStakeMinimums[_serviceKey] = _pStake;
        emit PStakeMinimumSet(_serviceKey, _pStake);
    }

    function setBoosterDiscount(uint256 _boostBips, uint256 _discountBips)
        external
        onlyOwner
    {
        boosterDiscountsBips[_boostBips] = _discountBips;
        emit BoosterDiscountSet(_boostBips, _discountBips);
    }

    function setMiningDistributionBips(
        string calldata _poolKey,
        uint256 _bips
    ) external onlyOwner {
        miningDistributionBips[_poolKey] = _bips;
        emit MiningDistributionSet(_poolKey, _bips);
    }

    function setMiningBonusBips(string calldata _serviceKey, uint256 _bips)
        external
        onlyOwner
    {
        miningBonusBips[_serviceKey] = _bips;
        emit MiningBonusSet(_serviceKey, _bips);
    }

    // --- 6. AUTHORIZATION FUNCTION (Called by Spokes) ---
    // NOTE: This logic is 100% UNCHANGED.
    function authorizeService(
        string calldata _serviceKey,
        address _user,
        uint256 _boosterTokenId
    ) external view override returns (uint256 finalFee) {
        // A. PSTAKE VERIFICATION
        uint256 minPStake = servicePStakeMinimums[_serviceKey];
        if (minPStake > 0) {
            require(
                delegationManagerAddress != address(0),
                "Ecosystem: DM not configured"
            );
            uint256 userPStake = IDelegationManager(delegationManagerAddress)
                .userTotalPStake(_user);
            require(
                userPStake >= minPStake,
                "Ecosystem: Insufficient pStake"
            );
        }

        // B. FINAL FEE CALCULATION (With Discount)
        uint256 baseFee = serviceFees[_serviceKey];
        finalFee = baseFee;

        if (_boosterTokenId > 0 && rewardBoosterAddress != address(0)) {
            IRewardBoosterNFT booster = IRewardBoosterNFT(rewardBoosterAddress);
            try booster.ownerOf(_boosterTokenId) returns (address owner) {
                if (owner == _user) {
                    uint256 boostBips = booster.boostBips(_boosterTokenId);
                    uint256 discountBips = boosterDiscountsBips[boostBips];
                    if (discountBips > 0) {
                        uint256 discountAmount = (baseFee * discountBips) / 10000;
                        finalFee = (baseFee > discountAmount)
                            ?
                            baseFee - discountAmount
                            : 0;
                    }
                }
            } catch {
                // Ignore if NFT is invalid or call fails
            }
        }
        return finalFee;
    }

    // --- 7. VIEW FUNCTIONS (Read-Only) ---

    function getServiceRequirements(
        string calldata _serviceKey
    ) external view override returns (uint256 fee, uint256 pStake) {
        return (serviceFees[_serviceKey], servicePStakeMinimums[_serviceKey]);
    }

    function getFee(string calldata _serviceKey)
        external
        view
        override
        returns (uint256)
    {
        return serviceFees[_serviceKey];
    }

    function getBoosterDiscount(uint256 _boostBips)
        external
        view
        override
        returns (uint256)
    {
        return boosterDiscountsBips[_boostBips];
    }

    function getTreasuryAddress()
        external
        view
        override
        returns (address)
    {
        return treasuryWallet;
    }

    function getDelegationManagerAddress()
        external
        view
        override
        returns (address)
    {
        return delegationManagerAddress;
    }

    function getBKCTokenAddress() external view override returns (address) {
        return bkcTokenAddress;
    }

    function getBoosterAddress() external view override returns (address) {
        return rewardBoosterAddress;
    }

    function getMiningManagerAddress()
        external
        view
        override
        returns (address)
    {
        return miningManagerAddress;
    }
    
    function getRewardManagerAddress()
        external
        view
        returns (address)
    {
        return rewardManagerAddress;
    }
    
    function getDecentralizedNotaryAddress()
        external
        view
        returns (address)
    {
        return decentralizedNotaryAddress;
    }
    
    function getFortunePoolAddress()
        external
        view
        returns (address)
    {
        return fortunePoolAddress;
    }
    
    // --- ARCHITECTURE CHANGE ---
    function getNFTLiquidityPoolFactoryAddress()
        external
        view
        override // Added 'override'
        returns (address)
    {
        return nftLiquidityPoolFactoryAddress;
    }
    
    function getMiningDistributionBips(string calldata _poolKey)
        external
        view
        override
        returns (uint256)
    {
        return miningDistributionBips[_poolKey];
    }

    function getMiningBonusBips(string calldata _serviceKey)
        external
        view
        override
        returns (uint256)
    {
        return miningBonusBips[_serviceKey];
    }

    // --- 8. UPGRADE FUNCTION (UUPS) ---
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}