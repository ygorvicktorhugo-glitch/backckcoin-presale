// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IDelegationManager
 * @dev Interface to manage user pStake and rewards.
 */
interface IDelegationManager {
    /**
     * @notice Returns the total pStake of a user.
     */
    function userTotalPStake(address _user) external view returns (uint256);
    /**
     * @notice Deposits the reward shares from the MiningManager (newly minted tokens).
     */
    function depositMiningRewards(uint256 _validatorShare, uint256 _delegatorShare) external;
    /**
     * @notice Deposits fees/penalties into the delegator pool (existing tokens).
     */
    function depositRewards(uint256, uint256 _delegatorAmount) external;
    /**
     * @notice Returns the total network pStake.
     */
    function totalNetworkPStake() external view returns (uint256);
}

// ---

/**
 * @title IMiningManager
 * @dev Interface for the Guardian contract that handles all token minting and distribution.
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
     * @notice Calculates the amount of BKC to be minted for a given purchase amount, applying dynamic scarcity.
     */
    function getMintAmount(uint256 _purchaseAmount) external view returns (uint256);
}

// ---

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
     * @notice Mints a single NFT when called by the authorized sale contract.
     */
    function mintFromSale(
        address to,
        uint256 boostInBips,
        string calldata metadataFile
    ) external returns (uint256 tokenId);
}

// ---

/**
 * @title INFTLiquidityPoolFactory
 * @dev Interface for the Factory that creates NFT Liquidity Pools.
 */
interface INFTLiquidityPoolFactory {
    /**
     * @notice Gets the address of an existing pool for a specific NFT boost tier.
     */
    function getPoolAddress(uint256 _boostBips) external view returns (address);
}

// ---

/**
 * @title INFTLiquidityPool
 * @dev Interface for the individual NFT Liquidity Pool contract.
 */
interface INFTLiquidityPool {
    /**
     * @notice Adds initial liquidity (NFTs + BKC) to the pool.
     */
    function addInitialLiquidity(
        uint256[] calldata _tokenIds,
        uint256 _bkcAmount
    ) external;

    /**
     * @notice Adds more NFTs to an existing pool.
     */
    function addMoreNFTsToPool(uint256[] calldata _tokenIds) external;
}

// ---

/**
 * @title IEcosystemManager
 * @dev The PUBLIC interface of the "Brain" (Hub).
 */
interface IEcosystemManager {
    // --- Rule Getters ---

    /**
     * @notice Returns the service fee and pStake minimum for a given service.
     */
    function getServiceRequirements(
        string calldata _serviceKey
    ) external view returns (uint256 fee, uint256 pStake);
    
    /**
     * @notice Returns the service fee only.
     */
    function getFee(string calldata _serviceKey) external view returns (uint256);

    /**
     * @notice Returns the discount BIPS for a given booster level.
     */
    function getBoosterDiscount(uint256 _boostBips) external view returns (uint256);

    /**
     * @notice Returns the distribution BIPS for a given mining pool key.
     */
    function getMiningDistributionBips(string calldata _poolKey) external view returns (uint256);
    
    /**
     * @notice Returns the bonus BIPS for a given service.
     */
    function getMiningBonusBips(string calldata _serviceKey) external view returns (uint256);

    // --- Address Getters ---
    function getTreasuryAddress() external view returns (address);
    function getDelegationManagerAddress() external view returns (address);
    function getBKCTokenAddress() external view returns (address);
    function getBoosterAddress() external view returns (address);
    function getMiningManagerAddress() external view returns (address);
    function getDecentralizedNotaryAddress() external view returns (address);
    function getFortunePoolAddress() external view returns (address);
    function getNFTLiquidityPoolFactoryAddress() external view returns (address);
}