// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- Imports for UUPS (Upgradeable) Pattern ---
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./IInterfaces.sol";
import "./BKCToken.sol";

/**
 * @title DelegationManager (V4 - UUPS & Dual-Pool Rewards)
 * @author Gemini AI (Based on original contract)
 * @dev This UUPS contract manages all staking, validators, and reward pools.
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
    mapping(address => uint256) public userTotalPStake;
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
        
        _claimDelegatorReward(msg.sender);
        
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
            stakeAmount * accValidatorRewardPerStake / 1e18;
            
        emit ValidatorRegistered(_validatorAddress, stakeAmount);
    }

    // --- 3. Delegator Staking Functions ---

    function delegate(
        address _validatorAddress,
        uint256 _totalAmount,
        uint256 _lockDuration
    ) external nonReentrant {
        _claimDelegatorReward(msg.sender);
        
        require(validators[_validatorAddress].isRegistered, "DM: Invalid validator");
        require(_totalAmount > 0, "DM: Invalid amount");
        require(
            _lockDuration >= MIN_LOCK_DURATION && _lockDuration <= MAX_LOCK_DURATION,
            "DM: Invalid lock duration"
        );
        
        uint256 stakeAmount = _totalAmount;

        require(
            bkcToken.transferFrom(msg.sender, address(this), stakeAmount),
            "DM: Failed to delegate tokens"
        );
        
        userDelegations[msg.sender].push(
            Delegation({
                amount: stakeAmount,
                unlockTime: block.timestamp + _lockDuration,
                lockDuration: _lockDuration,
                validator: _validatorAddress
            })
        );

        uint256 pStake = _calculatePStake(stakeAmount, _lockDuration);
        totalNetworkPStake += pStake;
        validators[_validatorAddress].totalPStake += pStake;
        validators[_validatorAddress].totalDelegatedAmount += stakeAmount;
        userTotalPStake[msg.sender] += pStake;
        
        delegatorRewardDebt[msg.sender] =
            (userTotalPStake[msg.sender] * accDelegatorRewardPerStake) / 1e18;
            
        emit Delegated(
            msg.sender,
            _validatorAddress,
            userDelegations[msg.sender].length - 1,
            stakeAmount,
            0
        );
    }

    function unstake(uint256 _delegationIndex) external nonReentrant {
        _claimDelegatorReward(msg.sender);

        Delegation[] storage delegationsOfUser = userDelegations[msg.sender];
        require(_delegationIndex < delegationsOfUser.length, "DM: Invalid index");
        
        Delegation storage d = delegationsOfUser[_delegationIndex];
        require(block.timestamp >= d.unlockTime, "DM: Lock period not over");

        uint256 pStakeToRemove = _calculatePStake(d.amount, d.lockDuration);
        totalNetworkPStake -= pStakeToRemove;
        validators[d.validator].totalPStake -= pStakeToRemove;
        validators[d.validator].totalDelegatedAmount -= d.amount;
        userTotalPStake[msg.sender] -= pStakeToRemove;
        
        uint256 feeBips = ecosystemManager.getFee("UNSTAKE_FEE_BIPS");
        uint256 feeAmount = (d.amount * feeBips) / 10000;
        uint256 amountToUser = d.amount - feeAmount;
        
        if (feeAmount > 0) {
            _distributeFees(feeAmount);
        }

        if (delegationsOfUser.length > 1 && _delegationIndex != delegationsOfUser.length - 1) {
            delegationsOfUser[_delegationIndex] = delegationsOfUser[delegationsOfUser.length - 1];
        }
        delegationsOfUser.pop();

        require(
            bkcToken.transfer(msg.sender, amountToUser),
            "DM: Failed to transfer tokens back"
        );
        
        delegatorRewardDebt[msg.sender] =
            (userTotalPStake[msg.sender] * accDelegatorRewardPerStake) / 1e18;
            
        emit Unstaked(msg.sender, _delegationIndex, amountToUser, feeAmount);
    }

    function forceUnstake(
        uint256 _delegationIndex,
        uint256 _boosterTokenId
    ) external nonReentrant {
        _claimDelegatorReward(msg.sender);

        Delegation[] storage delegationsOfUser = userDelegations[msg.sender];
        require(_delegationIndex < delegationsOfUser.length, "DM: Invalid index");
        
        Delegation storage d = delegationsOfUser[_delegationIndex];
        require(
            block.timestamp < d.unlockTime,
            "DM: Delegation is unlocked, use regular unstake"
        );
        
        uint256 originalAmount = d.amount;

        uint256 basePenaltyBips = ecosystemManager.getFee("FORCE_UNSTAKE_PENALTY_BIPS");
        uint256 discountBips = 0;
        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();

        if (_boosterTokenId > 0 && rewardBoosterAddress != address(0)) {
            try IRewardBoosterNFT(rewardBoosterAddress).ownerOf(_boosterTokenId)
            returns (address owner) {
                if (owner == msg.sender) {
                    uint256 userBoostBips = IRewardBoosterNFT(rewardBoosterAddress)
                        .boostBips(_boosterTokenId);
                    discountBips = ecosystemManager.getBoosterDiscount(userBoostBips);
                }
            } catch {}
        }

        uint256 finalPenaltyBips = (basePenaltyBips > discountBips)
            ? (basePenaltyBips - discountBips)
            : 0;

        uint256 penaltyAmount = (originalAmount * finalPenaltyBips) / 10000;
        uint256 amountToUser = originalAmount - penaltyAmount;

        uint256 pStakeToRemove = _calculatePStake(originalAmount, d.lockDuration);
        totalNetworkPStake -= pStakeToRemove;
        validators[d.validator].totalPStake -= pStakeToRemove;
        validators[d.validator].totalDelegatedAmount -= originalAmount;
        userTotalPStake[msg.sender] -= pStakeToRemove;
        
        if (penaltyAmount > 0) {
            _distributeFees(penaltyAmount);
        }

        require(
            bkcToken.transfer(msg.sender, amountToUser),
            "DM: Failed to return tokens to user"
        );
        
        if (delegationsOfUser.length > 1 && _delegationIndex != delegationsOfUser.length - 1) {
            delegationsOfUser[_delegationIndex] = delegationsOfUser[delegationsOfUser.length - 1];
        }
        delegationsOfUser.pop();

        delegatorRewardDebt[msg.sender] =
            (userTotalPStake[msg.sender] * accDelegatorRewardPerStake) / 1e18;
            
        emit Unstaked(msg.sender, _delegationIndex, amountToUser, penaltyAmount);
    }

    // --- 4. Reward Claiming Functions ---

    function claimDelegatorReward() external nonReentrant {
        _claimDelegatorReward(msg.sender);
    }

    function claimValidatorReward() external nonReentrant {
        address _validator = msg.sender;
        Validator storage v = validators[_validator];
        require(v.isRegistered, "DM: Not a validator");
        
        uint256 pending = (v.selfStakeAmount * accValidatorRewardPerStake / 1e18) -
            validatorRewardDebt[_validator];
            
        if (pending > 0) {
            validatorRewardDebt[_validator] =
                (v.selfStakeAmount * accValidatorRewardPerStake) / 1e18;
                
            require(
                bkcToken.transfer(_validator, pending),
                "DM: Validator reward transfer failed"
            );
            emit ValidatorRewardClaimed(_validator, pending);
        }
    }

    // --- 5. Internal & View Functions ---

    function _claimDelegatorReward(address _user) internal {
        uint256 pending = pendingDelegatorRewards(_user);
        if (pending > 0) {
            uint256 feeBips = ecosystemManager.getFee("CLAIM_REWARD_FEE_BIPS");
            uint256 feeAmount = (pending * feeBips) / 10000;
            uint256 amountToUser = pending - feeAmount;
            
            delegatorRewardDebt[_user] =
                (userTotalPStake[_user] * accDelegatorRewardPerStake) / 1e18;
            
            if (feeAmount > 0) {
                _distributeFees(feeAmount);
            }

            if (amountToUser > 0) {
                require(
                    bkcToken.transfer(_user, amountToUser),
                    "DM: Failed to transfer delegator rewards"
                );
            }

            emit DelegatorRewardClaimed(_user, amountToUser);
        }
    }

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

        if (delegatorAmount > 0 && totalNetworkPStake > 0) {
            accDelegatorRewardPerStake +=
                (delegatorAmount * 1e18) / totalNetworkPStake;
            emit RewardsDeposited(address(this), 0, delegatorAmount);
        }
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

    function _calculatePStake(uint256 _amount, uint256 _lockDuration)
        internal
        pure
        returns (uint256)
    {
        return (_amount * (_lockDuration / 1 days)) / 1e18;
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