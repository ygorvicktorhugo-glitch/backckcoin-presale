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
 * @notice This contract centralizes fees, discounts, and MINING RULES.
 * @notice MUST be deployed using a UUPS Proxy.
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
    // --- 2. SERVICE RULES (Spokes) ---
    mapping(string => uint256) public serviceFees;
    mapping(string => uint256) public servicePStakeMinimums;
    // --- 3. DISCOUNT RULES (Booster) ---
    mapping(uint256 => uint256) public boosterDiscountsBips;
    // --- 4. THE "GOLDEN RULE" (Mining Distribution) ---
    mapping(string => uint256) public miningDistributionBips;
    mapping(string => uint256) public miningBonusBips;
    
    // --- Events ---
    event AddressSet(string indexed key, address indexed newAddress); // ✅ NOVO EVENTO
    event FeeSet(string indexed serviceKey, uint256 newFee);
    event PStakeMinimumSet(string indexed serviceKey, uint256 newPStake);
    event BoosterDiscountSet(uint256 indexed boostBips, uint256 discountBips);
    event MiningDistributionSet(string indexed poolKey, uint256 bips);
    event MiningBonusSet(string indexed serviceKey, uint256 bips);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializer for the UUPS contract (replaces constructor).
     * @param _initialOwner The address of your MultiSig that will control the Brain.
     */
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

    // ❌ REMOVIDO: setAddresses (função original que causava o erro)
    
    // ✅ NOVO: Funções de configuração individuais para implantação em fases
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


    /**
     * @notice (Owner) Sets the fee for a service.
     */
    function setFee(string calldata _serviceKey, uint256 _fee)
        external
        onlyOwner
    {
        serviceFees[_serviceKey] = _fee;
        emit FeeSet(_serviceKey, _fee);
    }

    /**
     * @notice (Owner) Sets the minimum pStake for a service.
     */
    function setPStakeMinimum(string calldata _serviceKey, uint256 _pStake)
        external
        onlyOwner
    {
        servicePStakeMinimums[_serviceKey] = _pStake;
        emit PStakeMinimumSet(_serviceKey, _pStake);
    }

    /**
     * @notice (Owner) Sets or changes a booster discount.
     */
    function setBoosterDiscount(uint256 _boostBips, uint256 _discountBips)
        external
        onlyOwner
    {
        boosterDiscountsBips[_boostBips] = _discountBips;
        emit BoosterDiscountSet(_boostBips, _discountBips);
    }

    /**
     * @notice (Owner) Sets the mining share for a pool.
     */
    function setMiningDistributionBips(
        string calldata _poolKey,
        uint256 _bips
    ) external onlyOwner {
        miningDistributionBips[_poolKey] = _bips;
        emit MiningDistributionSet(_poolKey, _bips);
    }

    /**
     * @notice (Owner) Sets the "Buyer" bonus for a service.
     */
    function setMiningBonusBips(string calldata _serviceKey, uint256 _bips)
        external
        onlyOwner
    {
        miningBonusBips[_serviceKey] = _bips;
        emit MiningBonusSet(_serviceKey, _bips);
    }

    // --- 6. AUTHORIZATION FUNCTION (Called by Spokes) ---

    /**
     * @notice Checks if a user can use a service and returns the final fee.
     */
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
                            ? baseFee - discountAmount
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