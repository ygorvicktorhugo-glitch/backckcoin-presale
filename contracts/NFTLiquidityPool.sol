// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- Imports for UUPS (Upgradeable) Pattern ---
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
// --- Standard Imports ---
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

// --- Import Interfaces and Contracts ---
import "./IInterfaces.sol";
import "./BKCToken.sol";

/**
 * @title NFTLiquidityPool (V3 - UUPS AMM Spoke)
 * @author Gemini AI (Based on original contract)
 * @dev This UUPS contract is an AMM for trading RewardBoosterNFTs for BKC.
 */
contract NFTLiquidityPool is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    IERC721ReceiverUpgradeable
{
    // --- Core Contracts ---
    IEcosystemManager public ecosystemManager;
    BKCToken public bkcToken;
    IDelegationManager public delegationManager;

    // --- Pool Data ---
    struct Pool {
        uint256 tokenBalance;
        uint256 nftCount;
        uint256 k;
        bool isInitialized;
    }

    mapping(uint256 => Pool) public pools;

    // --- Service Keys ---
    string public constant PSTAKE_SERVICE_KEY = "NFT_POOL_ACCESS";
    string public constant TAX_BIPS_KEY = "NFT_POOL_TAX_BIPS";
    string public constant TAX_TREASURY_SHARE_KEY = "NFT_POOL_TAX_TREASURY_SHARE_BIPS";
    string public constant TAX_DELEGATOR_SHARE_KEY = "NFT_POOL_TAX_DELEGATOR_SHARE_BIPS";

    // --- Events ---
    event PoolCreated(uint256 indexed boostBips);
    event LiquidityAdded(
        uint256 indexed boostBips,
        uint256 nftAmount,
        uint256 bkcAmount
    );
    event NFTsAddedToPool(uint256 indexed boostBips, uint256 nftAmount);
    event NFTBought(
        address indexed buyer,
        uint256 indexed boostBips,
        uint256 tokenId,
        uint256 price
    );
    event NFTSold(
        address indexed seller,
        uint256 indexed boostBips,
        uint256 tokenId,
        uint256 payout,
        uint256 taxPaid
    );

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
            "NLP: EcosystemManager cannot be zero"
        );
        require(_initialOwner != address(0), "NLP: Invalid owner address");
        
        ecosystemManager = IEcosystemManager(_ecosystemManagerAddress);

        address _bkcTokenAddress = ecosystemManager.getBKCTokenAddress();
        address _dmAddress = ecosystemManager.getDelegationManagerAddress();

        require(
            _bkcTokenAddress != address(0) && _dmAddress != address(0),
            "NLP: Core contracts not set in Brain"
        );
        
        bkcToken = BKCToken(_bkcTokenAddress);
        delegationManager = IDelegationManager(_dmAddress);
        
        _transferOwnership(_initialOwner);
    }

    // Required by IERC721Receiver
    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // --- 1. Admin Functions ---

    /**
     * @notice (Owner) Creates the structure for a new liquidity pool.
     */
    function createPool(uint256 _boostBips) external onlyOwner {
        require(!pools[_boostBips].isInitialized, "NLP: Pool already exists");
        pools[_boostBips].isInitialized = true;
        emit PoolCreated(_boostBips);
    }

    /**
     * @notice (Owner) Adds the very first liquidity (NFTs + BKC) to initialize a pool.
     */
    function addInitialLiquidity(
        uint256 _boostBips,
        uint256[] calldata _tokenIds,
        uint256 _bkcAmount
    ) external onlyOwner nonReentrant {
        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(
            rewardBoosterAddress != address(0),
            "NLP: Booster not configured in Brain"
        );
        IERC721Upgradeable rewardBoosterNFT = IERC721Upgradeable(rewardBoosterAddress);
        
        Pool storage pool = pools[_boostBips];
        require(pool.isInitialized, "NLP: Pool not initialized");
        require(pool.nftCount == 0, "NLP: Liquidity already added");
        require(_tokenIds.length > 0, "NLP: Must add at least one NFT");
        require(_bkcAmount > 0, "NLP: Must add BKC liquidity");

        for (uint i = 0; i < _tokenIds.length; i++) {
            rewardBoosterNFT.safeTransferFrom(
                msg.sender,
                address(this),
                _tokenIds[i]
            );
        }

        require(
            bkcToken.transferFrom(msg.sender, address(this), _bkcAmount),
            "NLP: BKC transfer failed"
        );

        pool.nftCount = _tokenIds.length;
        pool.tokenBalance = _bkcAmount;
        pool.k = pool.nftCount * pool.tokenBalance;

        emit LiquidityAdded(_boostBips, pool.nftCount, pool.tokenBalance);
    }

    /**
     * @notice (Owner) Adds more NFTs to an initialized pool (increases supply).
     */
    function addMoreNFTsToPool(
        uint256 _boostBips,
        uint256[] calldata _tokenIds
    ) external onlyOwner nonReentrant {
        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(
            rewardBoosterAddress != address(0),
            "NLP: Booster not configured in Brain"
        );
        IERC721Upgradeable rewardBoosterNFT = IERC721Upgradeable(rewardBoosterAddress);
        
        Pool storage pool = pools[_boostBips];
        require(
            pool.isInitialized && pool.k > 0,
            "NLP: Pool not initialized with liquidity"
        );
        require(_tokenIds.length > 0, "NLP: Token IDs array empty");

        for (uint i = 0; i < _tokenIds.length; i++) {
            rewardBoosterNFT.safeTransferFrom(
                msg.sender,
                address(this),
                _tokenIds[i]
            );
        }

        pool.nftCount += _tokenIds.length;
        pool.k = pool.nftCount * pool.tokenBalance;

        emit NFTsAddedToPool(_boostBips, _tokenIds.length);
    }

    // --- 2. Trading Functions (User) ---

    /**
     * @notice Buys an NFT from the pool.
     */
    function buyNFT(
        uint256 _boostBips,
        uint256 _tokenId,
        uint256 _boosterTokenId
    ) external nonReentrant {
        // 1. AUTHORIZATION
        ecosystemManager.authorizeService(
            PSTAKE_SERVICE_KEY,
            msg.sender,
            _boosterTokenId
        );
        
        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(
            rewardBoosterAddress != address(0),
            "NLP: Booster not configured in Brain"
        );
        IRewardBoosterNFT rewardBoosterNFT = IRewardBoosterNFT(rewardBoosterAddress);
        
        Pool storage pool = pools[_boostBips];
        require(
            pool.isInitialized && pool.nftCount > 0,
            "NLP: No NFTs in this pool"
        );
        require(
            IERC721Upgradeable(rewardBoosterAddress).ownerOf(_tokenId) == address(this),
            "NLP: Contract does not own this NFT"
        );
        require(
            rewardBoosterNFT.boostBips(_tokenId) == _boostBips,
            "NLP: Token tier mismatch"
        );

        uint256 price = getBuyPrice(_boostBips);
        require(price < type(uint256).max, "NLP: Price calculation error");

        // 2. Pull BKC from buyer
        require(
            bkcToken.transferFrom(msg.sender, address(this), price),
            "NLP: BKC transfer failed"
        );

        // 3. Update pool state
        pool.tokenBalance += price;
        pool.nftCount--;
        pool.k = (pool.nftCount == 0) ? 0 : pool.tokenBalance * pool.nftCount;

        // 4. Transfer NFT to buyer
        IERC721Upgradeable(rewardBoosterAddress).safeTransferFrom(
            address(this),
            msg.sender,
            _tokenId
        );

        emit NFTBought(msg.sender, _boostBips, _tokenId, price);
    }

    /**
     * @notice Sells an NFT to the pool.
     */
    function sellNFT(uint256 _tokenId, uint256 _boosterTokenId)
        external
        nonReentrant
    {
        // 1. AUTHORIZATION
        ecosystemManager.authorizeService(
            PSTAKE_SERVICE_KEY,
            msg.sender,
            _boosterTokenId
        );
        
        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(
            rewardBoosterAddress != address(0),
            "NLP: Booster not configured in Brain"
        );
        IRewardBoosterNFT rewardBoosterNFT = IRewardBoosterNFT(rewardBoosterAddress);

        // 2. Check Ownership and Validity
        require(
            IERC721Upgradeable(rewardBoosterAddress).ownerOf(_tokenId) == msg.sender,
            "NLP: Not the owner"
        );
        uint256 boostBips = rewardBoosterNFT.boostBips(_tokenId);
        require(boostBips > 0, "NLP: Not a valid Booster NFT");

        Pool storage pool = pools[boostBips];
        require(pool.isInitialized, "NLP: Pool does not exist for this tier");

        uint256 sellValue = getSellPrice(boostBips);
        require(
            pool.tokenBalance >= sellValue,
            "NLP: Pool has insufficient BKC liquidity"
        );

        // --- 3. TAX CALCULATION ---
        uint256 taxBipsBase = ecosystemManager.getFee(TAX_BIPS_KEY);
        uint256 discountBips = 0;

        if (_boosterTokenId > 0) {
            try rewardBoosterNFT.ownerOf(_boosterTokenId)
            returns (address owner) {
                if (owner == msg.sender) {
                    uint256 userBoostBips = rewardBoosterNFT.boostBips(_boosterTokenId);
                    discountBips = ecosystemManager.getBoosterDiscount(userBoostBips);
                }
            } catch {}
        }

        uint256 finalTaxBips = (taxBipsBase > discountBips)
            ? taxBipsBase - discountBips
            : 0;
        uint256 finalTaxAmount = (sellValue * finalTaxBips) / 10000;
        uint256 payoutToSeller = sellValue - finalTaxAmount;

        // 4. TRANSFERS
        IERC721Upgradeable(rewardBoosterAddress).safeTransferFrom(
            msg.sender,
            address(this),
            _tokenId
        );

        if (payoutToSeller > 0) {
            require(
                bkcToken.transfer(msg.sender, payoutToSeller),
                "NLP: Payout transfer failed"
            );
        }

        // 5. TAX DISTRIBUTION
        if (finalTaxAmount > 0) {
            _distributeTax(finalTaxAmount);
        }

        // 6. UPDATE POOL STATE
        uint256 liquidityAmount = _getLiquidityShare(finalTaxAmount);
        pool.tokenBalance -= sellValue;
        pool.tokenBalance += liquidityAmount;
        pool.nftCount++;
        pool.k = pool.tokenBalance * pool.nftCount;

        emit NFTSold(
            msg.sender,
            boostBips,
            _tokenId,
            payoutToSeller,
            finalTaxAmount
        );
    }

    // --- 3. Internal & View Functions ---

    /**
     * @notice (Internal) Distributes the tax (40/40/20).
     */
    function _distributeTax(uint256 _taxAmount) internal {
        if (_taxAmount == 0) return;
        
        address treasury = ecosystemManager.getTreasuryAddress();
        require(treasury != address(0), "NLP: Treasury not configured in Brain");

        uint256 treasuryShareBips = ecosystemManager.getFee(TAX_TREASURY_SHARE_KEY);
        uint256 delegatorShareBips = ecosystemManager.getFee(TAX_DELEGATOR_SHARE_KEY);
        
        uint256 treasuryAmount = (_taxAmount * treasuryShareBips) / 10000;
        uint256 delegatorAmount = (_taxAmount * delegatorShareBips) / 10000;

        if (treasuryAmount > 0) {
            require(
                bkcToken.transfer(treasury, treasuryAmount),
                "NLP: Tax to Treasury failed"
            );
        }

        if (delegatorAmount > 0) {
            bkcToken.approve(address(delegationManager), delegatorAmount);
            delegationManager.depositRewards(0, delegatorAmount);
        }
    }

    /**
     * @notice (Internal) Calculates the liquidity share of the tax.
     */
    function _getLiquidityShare(uint256 _taxAmount)
        internal
        view
        returns (uint256)
    {
        uint256 treasuryShareBips = ecosystemManager.getFee(TAX_TREASURY_SHARE_KEY);
        uint256 delegatorShareBips = ecosystemManager.getFee(TAX_DELEGATOR_SHARE_KEY);
        
        uint256 treasuryAmount = (_taxAmount * treasuryShareBips) / 10000;
        uint256 delegatorAmount = (_taxAmount * delegatorShareBips) / 10000;
        
        return _taxAmount - treasuryAmount - delegatorAmount;
    }

    /**
     * @notice Calculates the current price to buy 1 NFT.
     */
    function getBuyPrice(uint256 _boostBips) public view returns (uint256) {
        Pool storage pool = pools[_boostBips];
        if (!pool.isInitialized || pool.nftCount == 0) {
            return type(uint256).max;
        }
        if (pool.nftCount <= 1) {
            return type(uint256).max;
        }

        uint256 newY = pool.k / (pool.nftCount - 1);
        if (newY < pool.tokenBalance) {
            return 0;
        }
        return newY - pool.tokenBalance;
    }

    /**
     * @notice Calculates the current payout for selling 1 NFT (before tax).
     */
    function getSellPrice(uint256 _boostBips) public view returns (uint256) {
        Pool storage pool = pools[_boostBips];
        if (!pool.isInitialized || pool.nftCount == type(uint256).max) {
            return 0;
        }

        uint256 newY = pool.k / (pool.nftCount + 1);
        return (pool.tokenBalance > newY) ? pool.tokenBalance - newY : 0;
    }

    /**
     * @notice Returns the state of a specific pool.
     */
    function getPoolInfo(uint256 _boostBips)
        external
        view
        returns (Pool memory)
    {
        return pools[_boostBips];
    }

    // --- UUPS Upgrade Function ---
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}