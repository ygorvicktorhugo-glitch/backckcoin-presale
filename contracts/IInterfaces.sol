// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IDelegationManager
 * @dev Interface to query a user's pStake.
 */
interface IDelegationManager {
    /**
     * @notice Returns the total pStake of a user.
     */
    function userTotalPStake(address _user) external view returns (uint256);
    /**
     * @notice (NEW) Deposits the reward shares from the MiningManager.
     */
    function depositMiningRewards(uint256 _validatorShare, uint256 _delegatorShare) external;
    /**
     * @notice (Fee Deposit) Deposits fees into the delegator pool (used by Spokes like Notary).
     */
    function depositRewards(uint256, uint256 _delegatorAmount) external;
    /**
     * @notice Returns the total network pStake.
     */
    function totalNetworkPStake() external view returns (uint256);
}

/**
 * @title IMiningManager
 * @dev (NEW) Interface for the Guardian contract that handles all token minting.
 */
interface IMiningManager {
    /**
     * @notice The central point for all "Proof-of-Purchase" mining.
     * @return bonusAmount The bonus amount (if any) to be sent back to the Buyer (Spoke).
     */
    function performPurchaseMining(
        string calldata _serviceKey,
        uint256 _purchaseAmount
    ) external returns (uint256 bonusAmount);
    /**
     * @notice (Public View) Exposes the internal mining calculation for frontends.
     */
    function getMintAmount(uint256 _purchaseAmount) external view returns (uint256);
}

/**
 * @title IRewardBoosterNFT
 * @dev Interface to verify a Booster NFT.
 */
interface IRewardBoosterNFT {
    /**
     * @notice Returns the owner of a tokenId.
     */
    function ownerOf(uint256 tokenId) external view returns (address);
    /**
     * @notice Returns the Bips value of the booster.
     */
    function boostBips(uint256 tokenId) external view returns (uint256);
    /**
     * @notice (PublicSale Contract) Mints a single NFT when called by the authorized sale contract.
     */
    function mintFromSale(
        address to,
        uint256 boostInBips,
        string calldata metadataFile
    ) external returns (uint256 tokenId);
}

/**
 * @title IEcosystemManager
 * @dev The PUBLIC interface of the "Brain".
 * @notice Defines all functions that other contracts can "read".
 */
interface IEcosystemManager {
    // --- Authorization and Fee Functions ---
    function authorizeService(
        string calldata _serviceKey,
        address _user,
        uint256 _boosterTokenId
    ) external view returns (uint256 finalFee);
    function getServiceRequirements(
        string calldata _serviceKey
    ) external view returns (uint256 fee, uint256 pStake);
    function getBoosterDiscount(uint256 _boostBips) external view returns (uint256);
    function getFee(string calldata _serviceKey) external view returns (uint256);
    // --- Address Getters ---
    function getTreasuryAddress() external view returns (address);
    function getDelegationManagerAddress() external view returns (address);
    function getBKCTokenAddress() external view returns (address);
    function getBoosterAddress() external view returns (address);
    /**
     * @notice (NEW) Returns the address of the Mining Guardian.
     */
    function getMiningManagerAddress() external view returns (address);
    // --- (NEW) Getters for the "Golden Rule" (Mining Distribution) ---
    /**
     * @notice Returns the mining share for a pool (e.g., "TREASURY").
     */
    function getMiningDistributionBips(string calldata _poolKey) external view returns (uint256);
    /**
     * @notice Returns the "Buyer" bonus for a service (e.g., "VESTING_SERVICE").
     */
    function getMiningBonusBips(string calldata _serviceKey) external view returns (uint256);
}