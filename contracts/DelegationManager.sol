// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- Imports for UUPS (Upgradeable) Pattern ---
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
// --- Import Interfaces and Contracts ---
import "./IInterfaces.sol";
import "./BKCToken.sol";
import "./RewardBoosterNFT.sol";
// Necessário para IRewardBoosterNFT

/**
 * @title DelegationManager (V4 - UUPS & Dual-Pool Rewards)
 * @author Gemini AI (Based on original contract)
 * @dev The UUPS contract that manages all staking, validators, and reward pools.
 * @notice V4: Lógica de desconto de booster ADICIONADA ao unstake, forceUnstake e claimDelegatorReward.
 */
contract DelegationManager is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    // --- Core Contracts ---
    IEcosystemManager public ecosystemManager;
    BKCToken public bkcToken;

    // --- Staking Constants ---
    uint256 public constant MIN_LOCK_DURATION = 1 days;
    uint256 public constant MAX_LOCK_DURATION = 3650 days;
    uint256 public constant VALIDATOR_LOCK_DURATION = 1825 days;
    uint256 public constant DYNAMIC_STAKE_BIPS = 3;
    uint256 public constant SAFETY_MARGIN_BIPS = 10100;

    // --- Data Structures ---
    struct Validator {
        bool isRegistered;
        uint256 selfStakeAmount;
        uint256 selfStakeUnlockTime;
        uint256 totalPStake;
        uint256 totalDelegatedAmount;
    }

    struct Delegation {
        uint256 amount;
        uint256 unlockTime;
        uint256 lockDuration;
        address validator;
    }

    // --- Validator State ---
    mapping(address => bool) public hasPaidRegistrationFee;
    mapping(address => Validator) public validators;
    address[] public validatorsArray;

    // --- Validator Reward Pool ---
    uint256 public totalValidatorSelfStake;
    uint256 public accValidatorRewardPerStake;
    mapping(address => uint256) public validatorRewardDebt;

    // --- Delegator State ---
    mapping(address => Delegation[]) public userDelegations;
    mapping(address => uint256) public userTotalPStake; // MANTIDO
    uint256 public totalNetworkPStake;

    // --- Delegator Reward Pool ---
    uint256 public accDelegatorRewardPerStake;
    mapping(address => uint256) public delegatorRewardDebt;

    // --- Events ---
    event ValidatorRegistered(address indexed validator, uint256 selfStake);
    event ValidatorUnregistered(address indexed validator, uint256 selfStakeReturned);
    event Delegated(
        address indexed user,
        address indexed validator,
        uint256 delegationIndex,
        uint256 amount,
        uint256 feePaid
    );
    event Unstaked(
        address indexed user,
        uint256 delegationIndex,
        uint256 amount,
        uint256 feePaid
    );
    event RewardsDeposited(
        address indexed from,
        uint256 validatorAmount,
        uint256 delegatorAmount
    );
    event ValidatorRewardClaimed(address indexed validator, uint256 amount);
    event DelegatorRewardClaimed(address indexed delegator, uint256 amount);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializer for the UUPS contract.
     */
    function initialize(
        address _initialOwner,
        address _ecosystemManagerAddress
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        require(
            _ecosystemManagerAddress != address(0),
            "DM: EcosystemManager cannot be zero"
        );
        require(_initialOwner != address(0), "DM: Invalid owner address");
        
        ecosystemManager = IEcosystemManager(_ecosystemManagerAddress);

        address _bkcTokenAddress = ecosystemManager.getBKCTokenAddress();
        require(
            _bkcTokenAddress != address(0),
            "DM: BKCToken not set in EcosystemManager"
        );
        bkcToken = BKCToken(_bkcTokenAddress);
        
        _transferOwnership(_initialOwner);
    }

    // --- 1. Reward Deposit Function ---

    /**
     * @notice (Called by MiningManager) Receives and distributes mining reward shares.
     */
    function depositMiningRewards(
        uint256 _validatorShare,
        uint256 _delegatorShare
    ) external nonReentrant {
        require(
            msg.sender == ecosystemManager.getMiningManagerAddress(),
            "DM: Caller is not the authorized MiningManager"
        );
        // NOTE: Funds transfer is handled by MiningManager.
        
        if (_validatorShare > 0 && totalValidatorSelfStake > 0) {
            accValidatorRewardPerStake +=
                (_validatorShare * 1e18) / totalValidatorSelfStake;
        }

        if (_delegatorShare > 0 && totalNetworkPStake > 0) {
            accDelegatorRewardPerStake +=
                (_delegatorShare * 1e18) / totalNetworkPStake;
        }

        if (_validatorShare > 0 || _delegatorShare > 0) {
            emit RewardsDeposited(msg.sender, _validatorShare, _delegatorShare);
        }
    }

    /**
     * @notice (For other services) Deposits fees into the delegator pool.
     */
    function depositRewards(uint256, uint256 _delegatorAmount)
        external
        nonReentrant
    {
        if (_delegatorAmount > 0) {
            require(
                bkcToken.transferFrom(msg.sender, address(this), _delegatorAmount),
                "DM: Failed to pull delegator rewards"
            );
            
            if (totalNetworkPStake > 0) {
                accDelegatorRewardPerStake +=
                    (_delegatorAmount * 1e18) / totalNetworkPStake;
            }
            emit RewardsDeposited(msg.sender, 0, _delegatorAmount);
        }
    }

    // --- 2. Validator Management ---

    function getMinValidatorStake() public view returns (uint256) {
        uint256 dynamicStake = (bkcToken.totalSupply() * DYNAMIC_STAKE_BIPS) / 10000;
        return (dynamicStake * SAFETY_MARGIN_BIPS) / 10000;
    }

    function payRegistrationFee() external nonReentrant {
        uint256 stakeAmount = getMinValidatorStake();
        require(!hasPaidRegistrationFee[msg.sender], "DM: Fee already paid");
        
        address treasury = ecosystemManager.getTreasuryAddress();
        require(treasury != address(0), "DM: Treasury not set in Brain");

        // NOTE: This transfers the fee amount (MinValidatorStake) to the Treasury
        require(
            bkcToken.transferFrom(msg.sender, treasury, stakeAmount),
            "DM: Fee transfer failed"
        );
        hasPaidRegistrationFee[msg.sender] = true;
    }

    function registerValidator(address _validatorAddress) external nonReentrant {
        uint256 stakeAmount = getMinValidatorStake();
        require(msg.sender == _validatorAddress, "DM: Can only register self");
        require(hasPaidRegistrationFee[msg.sender], "DM: Must pay registration fee first");
        require(!validators[_validatorAddress].isRegistered, "DM: Validator already registered");
        
        // Claim pending rewards before updating debt/pStake
        _claimDelegatorReward(msg.sender, 0); // No booster used here, so pass 0
        
        require(
            bkcToken.transferFrom(msg.sender, address(this), stakeAmount),
            "DM: Stake transfer failed"
        );
        validators[_validatorAddress] = Validator({
            isRegistered: true,
            selfStakeAmount: stakeAmount,
            selfStakeUnlockTime: block.timestamp + VALIDATOR_LOCK_DURATION,
            totalPStake: 0,
            totalDelegatedAmount: 0
        });
        validatorsArray.push(_validatorAddress);

        totalValidatorSelfStake += stakeAmount;
        validatorRewardDebt[_validatorAddress] =
            (stakeAmount * accValidatorRewardPerStake) / 1e18;
        emit ValidatorRegistered(_validatorAddress, stakeAmount);
    }

    // --- 3. Delegator Staking Functions ---

    /**
     * @notice Delegates tokens to a validator.
     */
    function delegate(
        address _validatorAddress, 
        uint256 _totalAmount, 
        uint256 _lockDuration,
        uint256 _boosterTokenId 
    ) external nonReentrant {
        // Claim pending rewards before updating pStake and reward debt
        _claimDelegatorReward(msg.sender, _boosterTokenId); 
        
        require(validators[_validatorAddress].isRegistered, "DM: Invalid validator");
        require(_totalAmount > 0, "DM: Invalid amount");
        require(
            _lockDuration >= MIN_LOCK_DURATION && _lockDuration <= MAX_LOCK_DURATION,
            "DM: Invalid lock duration"
        );
        
        uint256 stakeAmount = _totalAmount; 
        uint256 feeAmount = 0; // delegate() é gratuito
        
        require(bkcToken.transferFrom(msg.sender, address(this), stakeAmount), "DM: Failed to delegate tokens");

        uint256 delegationIndex = userDelegations[msg.sender].length;
        userDelegations[msg.sender].push(Delegation({
            amount: stakeAmount,
            unlockTime: block.timestamp + _lockDuration,
            lockDuration: _lockDuration,
            validator: _validatorAddress
        }));

        uint256 pStake = _calculatePStake(stakeAmount, _lockDuration);
        totalNetworkPStake += pStake;
        validators[_validatorAddress].totalPStake += pStake;
        validators[_validatorAddress].totalDelegatedAmount += stakeAmount;
        userTotalPStake[msg.sender] += pStake;
        
        delegatorRewardDebt[msg.sender] = (userTotalPStake[msg.sender] * accDelegatorRewardPerStake) / 1e18;

        emit Delegated(msg.sender, _validatorAddress, delegationIndex, stakeAmount, feeAmount);
    }

    /**
     * @notice Unstakes a delegation (after lockup ends).
     */
    function unstake(
        uint256 _delegationIndex, 
        uint256 _boosterTokenId 
    ) external nonReentrant {
        // Claim pending rewards before updating pStake and reward debt
        _claimDelegatorReward(msg.sender, _boosterTokenId);
        
        Delegation[] storage delegationsOfUser = userDelegations[msg.sender];
        require(_delegationIndex < delegationsOfUser.length, "DM: Invalid index");
        
        Delegation storage d = delegationsOfUser[_delegationIndex];
        require(block.timestamp >= d.unlockTime, "DM: Lock period not over");
        
        uint256 pStakeToRemove = _calculatePStake(d.amount, d.lockDuration);
        
        // --- 1. Calculate Fee ---
        uint256 feeBips = ecosystemManager.getFee("UNSTAKE_FEE_BIPS");
        uint256 finalFeeBips = _applyBoosterDiscount(feeBips, _boosterTokenId);
        
        uint256 feeAmount = (d.amount * finalFeeBips) / 10000;
        uint256 amountToUser = d.amount - feeAmount;

        // --- 2. Update State ---
        totalNetworkPStake -= pStakeToRemove;
        validators[d.validator].totalPStake -= pStakeToRemove;
        validators[d.validator].totalDelegatedAmount -= d.amount;
        userTotalPStake[msg.sender] -= pStakeToRemove;
        
        // --- 3. Distribute Fee (to Delegator Pool) ---
        if (feeAmount > 0) {
            _distributeFees(feeAmount); // Fees go to Treasury (50%) and Delegator Pool (50%)
        }

        // --- 4. Clean up Array ---
        if (delegationsOfUser.length > 1 && _delegationIndex != delegationsOfUser.length - 1) {
            delegationsOfUser[_delegationIndex] = delegationsOfUser[delegationsOfUser.length - 1];
        }
        delegationsOfUser.pop();

        // --- 5. Transfer Payout ---
        require(bkcToken.transfer(msg.sender, amountToUser), "DM: Failed to transfer tokens back");

        // Update reward debt
        delegatorRewardDebt[msg.sender] = (userTotalPStake[msg.sender] * accDelegatorRewardPerStake) / 1e18;

        emit Unstaked(msg.sender, _delegationIndex, amountToUser, feeAmount);
    }

    /**
     * @notice Force unstakes a delegation (before lockup ends).
     */
    function forceUnstake(uint256 _delegationIndex, uint256 _boosterTokenId) external nonReentrant {
        // Claim pending rewards before updating pStake and reward debt
        _claimDelegatorReward(msg.sender, _boosterTokenId); 
        
        Delegation[] storage delegationsOfUser = userDelegations[msg.sender];
        require(_delegationIndex < delegationsOfUser.length, "DM: Invalid index");
        
        Delegation storage d = delegationsOfUser[_delegationIndex];
        require(
            block.timestamp < d.unlockTime,
            "DM: Delegation is unlocked, use regular unstake"
        );
        
        uint256 originalAmount = d.amount;

        // --- 1. Calculate Penalty ---
        uint256 basePenaltyBips = ecosystemManager.getFee("FORCE_UNSTAKE_PENALTY_BIPS");
        uint256 finalPenaltyBips = _applyBoosterDiscount(basePenaltyBips, _boosterTokenId);
        
        uint256 penaltyAmount = (originalAmount * finalPenaltyBips) / 10000;
        uint256 amountToUser = originalAmount - penaltyAmount;
        
        uint256 pStakeToRemove = _calculatePStake(originalAmount, d.lockDuration);

        // --- 2. Update State ---
        totalNetworkPStake -= pStakeToRemove;
        validators[d.validator].totalPStake -= pStakeToRemove;
        validators[d.validator].totalDelegatedAmount -= originalAmount;
        userTotalPStake[msg.sender] -= pStakeToRemove;

        // --- 3. Distribute Penalty ---
        if (penaltyAmount > 0) {
            _distributeFees(penaltyAmount); // Penalty goes to Treasury (50%) and Delegator Pool (50%)
        }
        
        // --- 4. Clean up Array ---
        if (delegationsOfUser.length > 1 && _delegationIndex != delegationsOfUser.length - 1) {
            delegationsOfUser[_delegationIndex] = delegationsOfUser[delegationsOfUser.length - 1];
        }
        delegationsOfUser.pop();
        
        // --- 5. Transfer Payout ---
        require(bkcToken.transfer(msg.sender, amountToUser), "DM: Failed to return tokens to user");

        // Update reward debt
        delegatorRewardDebt[msg.sender] = (userTotalPStake[msg.sender] * accDelegatorRewardPerStake) / 1e18;

        emit Unstaked(msg.sender, _delegationIndex, amountToUser, penaltyAmount);
    }

    // --- 4. Reward Claiming Functions ---

    /**
     * @notice Public claim function.
     */
    function claimDelegatorReward(uint256 _boosterTokenId) external nonReentrant {
        // This is the public entry point, calls the internal function
        _claimDelegatorReward(msg.sender, _boosterTokenId);
    }

    function claimValidatorReward() external nonReentrant {
        address _validator = msg.sender;
        Validator storage v = validators[_validator];
        require(v.isRegistered, "DM: Not a validator");
        
        // Calculate pending reward
        uint256 pending = pendingValidatorRewards(_validator);

        if (pending > 0) {
            validatorRewardDebt[_validator] = (v.selfStakeAmount * accValidatorRewardPerStake) / 1e18;
            
            require(
                bkcToken.transfer(_validator, pending),
                "DM: Validator reward transfer failed"
            );

            emit ValidatorRewardClaimed(_validator, pending);
        }
    }

    // --- 5. Internal & View Functions ---

    /**
     * @notice Claims pending rewards for the user.
     * @dev Applies the booster discount to the claim fee.
     */
    function _claimDelegatorReward(address _user, uint256 _boosterTokenId) internal {
        uint256 pending = pendingDelegatorRewards(_user);

        if (pending > 0) {
            // 1. Get the BASE fee (in BIPS) from the Hub
            uint256 baseFeeBips = ecosystemManager.getFee("CLAIM_REWARD_FEE_BIPS");

            // --- Apply Booster Discount ---
            uint256 finalFeeBips = _applyBoosterDiscount(baseFeeBips, _boosterTokenId);
            // --- End New Logic ---

            uint256 feeAmount = (pending * finalFeeBips) / 10000;
            uint256 amountToUser = pending - feeAmount;
            
            // 2. Update the reward debt (sempre com o valor total pendente)
            delegatorRewardDebt[_user] = (userTotalPStake[_user] * accDelegatorRewardPerStake) / 1e18;

            // 3. Distribute Fee (50% Treasury, 50% Delegator Pool)
            if (feeAmount > 0) {
                _distributeFees(feeAmount);
            }

            // 4. Transfer Payout
            if (amountToUser > 0) {
                require(
                    bkcToken.transfer(_user, amountToUser),
                    "DM: Failed to transfer delegator rewards"
                );
            }

            emit DelegatorRewardClaimed(_user, amountToUser);
        }
    }

    /**
     * @notice Distributes fees/penalties to Treasury (50%) and Delegator Pool (50%).
     */
    function _distributeFees(uint256 _amount) internal {
        if (_amount == 0) return;
        
        address treasury = ecosystemManager.getTreasuryAddress();
        require(treasury != address(0), "DM: Treasury not set in Brain");

        uint256 treasuryAmount = _amount / 2;
        uint256 delegatorAmount = _amount - treasuryAmount;

        if (treasuryAmount > 0) {
            require(
                bkcToken.transfer(treasury, treasuryAmount),
                "DM: Fee to Treasury failed"
            );
        }

        if (delegatorAmount > 0) {
            // Funds are already in this contract from the fee/penalty transfer
            if (totalNetworkPStake > 0) {
                 accDelegatorRewardPerStake += (delegatorAmount * 1e18) / totalNetworkPStake;
            }
            emit RewardsDeposited(address(this), 0, delegatorAmount);
        }
    }

    /**
     * @notice Applies the booster discount to a base fee BIPS (centralized internal logic).
     */
    function _applyBoosterDiscount(uint256 _baseFeeBips, uint256 _boosterTokenId) internal view returns (uint256 finalFeeBips) {
        if (_boosterTokenId == 0) return _baseFeeBips;

        address boosterAddress = ecosystemManager.getBoosterAddress();
        if (boosterAddress == address(0)) return _baseFeeBips;
        
        IRewardBoosterNFT booster = IRewardBoosterNFT(boosterAddress);
        
        try booster.ownerOf(_boosterTokenId) returns (address owner) {
            if (owner == msg.sender) {
                uint256 boostBips = booster.boostBips(_boosterTokenId);
                uint256 discountBips = ecosystemManager.getBoosterDiscount(boostBips);
                
                if (discountBips > 0) {
                    return (_baseFeeBips > discountBips) ? _baseFeeBips - discountBips : 0;
                }
            }
        } catch {
            // Ignore if NFT is invalid
        }
        return _baseFeeBips;
    }

    /**
     * @notice Calculates the total pStake based on amount and lock duration.
     * @dev Simple calculation: (Amount * LockDays) / 1e18
     */
    function _calculatePStake(uint256 _amount, uint256 _lockDuration)
        internal
        pure
        returns (uint256)
    {
        // Simple calculation: Amount * (LockDuration / 1 day) / 1e18
        return (_amount * (_lockDuration / 1 days)) / 1e18;
    }

    function pendingDelegatorRewards(address _user)
        public
        view
        returns (uint256)
    {
        return (userTotalPStake[_user] * accDelegatorRewardPerStake / 1e18) -
            delegatorRewardDebt[_user];
    }

    function pendingValidatorRewards(address _validator)
        public
        view
        returns (uint256)
    {
        Validator storage v = validators[_validator];
        if (!v.isRegistered) return 0;
        return (v.selfStakeAmount * accValidatorRewardPerStake / 1e18) -
            validatorRewardDebt[_validator];
    }

    function getDelegationsOf(address _user)
        external
        view
        returns (Delegation[] memory)
    {
        return userDelegations[_user];
    }

    function getAllValidators() external view returns (address[] memory) {
        return validatorsArray;
    }

    // --- UUPS Upgrade Function ---
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}