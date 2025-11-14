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
 * @title NFTLiquidityPool (V5 - Single Pool Logic)
 * @author Gemini AI (Refactored for Factory Pattern)
 * @dev This contract now manages ONE SINGLE liquidity pool.
 * @notice It is designed to be deployed via NFTLiquidityPoolFactory.
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

    // --- Pool Data (Now for ONE single pool) ---
    struct Pool {
        uint256 tokenBalance;
        uint256 nftCount;
        uint256 k;
        bool isInitialized;
        // Mapeamento para encontrar a posição de um token no array em O(1)
        mapping(uint256 => uint256) tokenIdToIndex;
        // Array de Token IDs que este pool possui
        uint256[] tokenIds;
    }

    // REFACTOR: This now stores the data for the SINGLE pool this contract manages.
    Pool private pool;
    
    // REFACTOR: The Boost Bips value for THIS specific pool.
    uint256 public boostBips;

    // --- KEYS FOR HUB (Unchanged) ---
    string public constant PSTAKE_SERVICE_KEY = "NFT_POOL_ACCESS";
    string public constant TAX_BIPS_KEY = "NFT_POOL_TAX_BIPS";
    string public constant TAX_TREASURY_SHARE_KEY = "NFT_POOL_TAX_TREASURY_SHARE_BIPS";
    string public constant TAX_DELEGATOR_SHARE_KEY = "NFT_POOL_TAX_DELEGATOR_SHARE_BIPS";
    string public constant TAX_LIQUIDITY_SHARE_KEY = "NFT_POOL_TAX_LIQUIDITY_SHARE_BIPS";
    
    // --- Events ---
    // PoolCreated event was removed.
    event LiquidityAdded(
        uint256 indexed boostBips,
        uint256 nftAmount,
        uint256 bkcAmount
    );
    event NFTsAddedToPool(uint256 indexed boostBips, uint256 nftAmount);
    event NFTBought(address indexed buyer, uint256 indexed boostBips, uint256 tokenId, uint256 price);
    event NFTSold(address indexed seller, uint256 indexed boostBips, uint256 tokenId, uint256 payout, uint256 taxPaid);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializer for the pool contract.
     * @dev Now also sets the boostBips for this pool.
     */
    function initialize(
        address _initialOwner,
        address _ecosystemManagerAddress,
        uint256 _boostBips // NEW: Defines which pool this contract IS
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        require(
            _ecosystemManagerAddress != address(0),
            "NLP: EcosystemManager cannot be zero"
        );
        require(_initialOwner != address(0), "NLP: Invalid owner address");
        require(_boostBips > 0, "NLP: Boost Bips must be set");
        
        ecosystemManager = IEcosystemManager(_ecosystemManagerAddress);

        address _bkcTokenAddress = ecosystemManager.getBKCTokenAddress();
        address _dmAddress = ecosystemManager.getDelegationManagerAddress();
        require(
            _bkcTokenAddress != address(0) && _dmAddress != address(0),
            "NLP: Core contracts not set in Brain"
        );
        bkcToken = BKCToken(_bkcTokenAddress);
        delegationManager = IDelegationManager(_dmAddress);
        
        boostBips = _boostBips; // Sets the Tier for this pool
        
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

    // --- Admin Functions ---

    // createPool was REMOVED. This is now handled by the Factory.

    /**
     * @notice (Owner) Adds the very first liquidity (NFTs + BKC) to initialize this pool.
     */
    function addInitialLiquidity(
        uint256[] calldata _tokenIds,
        uint256 _bkcAmount
    ) external onlyOwner nonReentrant {
        // REFACTOR: _boostBips is no longer an argument, uses the contract's 'boostBips'
        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(
            rewardBoosterAddress != address(0),
            "NLP: Booster not configured in Brain"
        );
        IERC721Upgradeable rewardBoosterNFT = IERC721Upgradeable(rewardBoosterAddress);
        
        // REFACTOR: Changed 'pools[_boostBips]' to 'pool'
        require(!pool.isInitialized, "NLP: Pool already initialized");
        require(_tokenIds.length > 0, "NLP: Must add at least one NFT");
        require(_bkcAmount > 0, "NLP: Must add BKC liquidity");
        
        pool.isInitialized = true; // Mark as initialized

        for (uint i = 0; i < _tokenIds.length; i++) {
            rewardBoosterNFT.safeTransferFrom(
                msg.sender,
                address(this),
                _tokenIds[i]
            );
            _addTokenId(pool, _tokenIds[i]); // Tracks the ID
        }

        require(
            bkcToken.transferFrom(msg.sender, address(this), _bkcAmount),
            "NLP: BKC transfer failed"
        );
        pool.nftCount = _tokenIds.length;
        pool.tokenBalance = _bkcAmount;
        pool.k = pool.nftCount * pool.tokenBalance;
        emit LiquidityAdded(boostBips, pool.nftCount, pool.tokenBalance);
    }

    /**
     * @notice (Owner) Adds more NFTs to this initialized pool.
     */
    function addMoreNFTsToPool(
        uint256[] calldata _tokenIds
    ) external onlyOwner nonReentrant {
        // REFACTOR: _boostBips is no longer an argument
        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(
            rewardBoosterAddress != address(0),
            "NLP: Booster not configured in Brain"
        );
        IERC721Upgradeable rewardBoosterNFT = IERC721Upgradeable(rewardBoosterAddress);
        
        // REFACTOR: Changed 'pools[_boostBips]' to 'pool'
        require(
            pool.isInitialized && pool.k > 0,
            "NLP: Pool not initialized with liquidity yet"
        );
        require(_tokenIds.length > 0, "NLP: Token IDs array cannot be empty");
        for (uint i = 0; i < _tokenIds.length; i++) {
            rewardBoosterNFT.safeTransferFrom(
                msg.sender,
                address(this),
                _tokenIds[i]
            );
            _addTokenId(pool, _tokenIds[i]); // Tracks the ID
        }

        pool.nftCount += _tokenIds.length;
        pool.k = pool.nftCount * pool.tokenBalance;

        emit NFTsAddedToPool(_tokenIds.length, boostBips);
    }

    // --- 2. Trading Functions (User) ---

    /**
     * @notice (LEGACY FUNCTION - KEPT) Buys a specific NFT by ID.
     */
    function buyNFT(
        uint256 _tokenId,
        uint256 _boosterTokenId
    ) external nonReentrant {
        // REFACTOR: _boostBips removed from arguments
        // 1. AUTHORIZATION
        uint256 serviceFee = ecosystemManager.authorizeService(
            PSTAKE_SERVICE_KEY,
            msg.sender,
            _boosterTokenId 
   
        );
        require(serviceFee == 0, "NLP: Buy service fee should be zero");

        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(
            rewardBoosterAddress != address(0),
            "NLP: Booster not configured in Brain"
        );
        IRewardBoosterNFT rewardBoosterNFT = IRewardBoosterNFT(rewardBoosterAddress);
        
        // REFACTOR: Changed 'pools[_boostBips]' to 'pool'
        require(
            pool.isInitialized && pool.nftCount > 0,
            "NLP: No NFTs available in this pool"
        );
        require(
            IERC721Upgradeable(rewardBoosterAddress).ownerOf(_tokenId) == address(this),
            "NLP: Contract does not own this NFT"
        );
        // Check if the NFT belongs to this tier
        require(
            rewardBoosterNFT.boostBips(_tokenId) == boostBips,
            "NLP: Token tier mismatch"
        );
        
        uint256 price = getBuyPrice(); // REFACTOR: No argument
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
        _removeTokenId(pool, _tokenId);
        
        // 4. Transfer NFT to buyer
        IERC721Upgradeable(rewardBoosterAddress).safeTransferFrom(
            address(this),
            msg.sender,
            _tokenId
        );
        emit NFTBought(msg.sender, boostBips, _tokenId, price);
    }

    /**
     * @notice (NEW FUNCTION V4) Buys the next available NFT from this tier.
     */
    function buyNextAvailableNFT(uint256 _boosterTokenId) external nonReentrant {
        // REFACTOR: _boostBips removed from arguments
        // 1. AUTHORIZATION
        uint256 serviceFee = ecosystemManager.authorizeService(
            PSTAKE_SERVICE_KEY,
            msg.sender,
            _boosterTokenId
        );
        require(serviceFee == 0, "NLP: Buy service fee should be zero");

        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(rewardBoosterAddress != address(0), "NLP: Booster not configured in Hub");
        
        // REFACTOR: Changed 'pools[_boostBips]' to 'pool'
        require(pool.isInitialized && pool.nftCount > 0, "NLP: No NFTs available in this pool");
        require(pool.tokenIds.length > 0, "NLP: Pool tracking array is empty, desync");
        
        // 2. SELECT THE TOKEN
        uint256 tokenIdToSell = pool.tokenIds[pool.tokenIds.length - 1];
        
        // 3. PRICE & PAYMENT LOGIC
        uint256 price = getBuyPrice(); // REFACTOR: No argument
        require(bkcToken.transferFrom(msg.sender, address(this), price), "NLP: BKC transfer failed");

        // 4. UPDATE POOL STATE
        pool.tokenBalance += price;
        pool.nftCount--;
        pool.k = (pool.nftCount == 0) ? 0 : pool.tokenBalance * pool.nftCount;
        
        // 5. UPDATE TRACKING (O(1) pop)
        delete pool.tokenIdToIndex[tokenIdToSell];
        pool.tokenIds.pop();

        // 6. TRANSFER NFT
        IERC721Upgradeable(rewardBoosterAddress).safeTransferFrom(address(this), msg.sender, tokenIdToSell);
        emit NFTBought(msg.sender, boostBips, tokenIdToSell, price);
    }

    /**
     * @notice Sells an NFT to the pool.
     */
    function sellNFT(uint256 _tokenId, uint256 _boosterTokenId) external nonReentrant {
        // 1. AUTHORIZATION
         ecosystemManager.authorizeService(
            PSTAKE_SERVICE_KEY,
            msg.sender,
            _boosterTokenId
        );
        
        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(rewardBoosterAddress != address(0), "NLP: Booster not configured in Hub");
        IRewardBoosterNFT rewardBoosterNFT = IRewardBoosterNFT(rewardBoosterAddress);
        
        // 2. Check Ownership and Validity
        require(IERC721Upgradeable(rewardBoosterAddress).ownerOf(_tokenId) == msg.sender, "NLP: Not the owner");
        
        uint256 nftBoostBips = rewardBoosterNFT.boostBips(_tokenId);
        // REFACTOR: Check if the NFT belongs to THIS pool's tier
        require(nftBoostBips == boostBips, "NLP: Wrong pool for this NFT tier");

        // REFACTOR: Changed 'pools[boostBips]' to 'pool'
        require(pool.isInitialized, "NLP: Pool does not exist for this tier");

        uint256 sellValue = getSellPrice(); // REFACTOR: No argument
        require(pool.tokenBalance >= sellValue, "NLP: Pool has insufficient BKC liquidity");
        
        // --- 3. TAX CALCULATION (Logic unchanged) ---
        uint256 taxBipsBase = ecosystemManager.getFee(TAX_BIPS_KEY);
        uint256 discountBips = 0;

        if (_boosterTokenId > 0) {
            try rewardBoosterNFT.ownerOf(_boosterTokenId)
            returns (address owner) {
                if (owner == msg.sender) {
                    uint256 userBoostBips = rewardBoosterNFT.boostBips(_boosterTokenId);
                    discountBips = ecosystemManager.getBoosterDiscount(userBoostBips);
                }
            } catch { /* Ignore discount */ }
        }

        uint256 finalTaxBips = (taxBipsBase > discountBips)
            ? taxBipsBase - discountBips
            : 0;
        uint256 finalTaxAmount = (sellValue * finalTaxBips) / 10000;
        uint256 payoutToSeller = sellValue - finalTaxAmount;
        
        // --- 4. TRANSFERS (Logic unchanged) ---
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

        // --- 5. TAX DISTRIBUTION (Logic unchanged) ---
        if (finalTaxAmount > 0) {
            _distributeTax(finalTaxAmount);
        }

        // --- 6. UPDATE POOL STATE (Logic unchanged) ---
        uint256 liquidityShareBips = ecosystemManager.getFee(TAX_LIQUIDITY_SHARE_KEY);
        uint256 liquidityAmount = (finalTaxAmount * liquidityShareBips) / 10000;

        pool.tokenBalance -= sellValue;
        pool.tokenBalance += liquidityAmount;
        pool.nftCount++;
        _addTokenId(pool, _tokenId);
        pool.k = pool.tokenBalance * pool.nftCount; // Recalculate k

        emit NFTSold(
            msg.sender,
            boostBips,
            _tokenId,
            payoutToSeller,
            finalTaxAmount
        );
    }

    // --- Internal Functions (V4) ---
    // REFACTOR: Changed 'Pool storage _pool' to 'Pool storage pool'
    function _addTokenId(Pool storage _pool, uint256 _tokenId) internal {
        // NOTE: This logic is correct, _pool is passed as a storage pointer
        _pool.tokenIdToIndex[_tokenId] = _pool.tokenIds.length;
        _pool.tokenIds.push(_tokenId);
    }

    function _removeTokenId(Pool storage _pool, uint256 _tokenId) internal {
        // NOTE: This logic is correct, _pool is passed as a storage pointer
        uint256 indexToRemove = _pool.tokenIdToIndex[_tokenId];
        uint256 lastIndex = _pool.tokenIds.length - 1;

        if (indexToRemove != lastIndex) {
            uint256 lastTokenId = _pool.tokenIds[lastIndex];
            _pool.tokenIds[indexToRemove] = lastTokenId;
            _pool.tokenIdToIndex[lastTokenId] = indexToRemove;
        }
        _pool.tokenIds.pop();
        delete _pool.tokenIdToIndex[_tokenId];
    }

    // Tax distribution logic is unchanged and correct.
    function _distributeTax(uint256 _taxAmount) internal {
        if (_taxAmount == 0) return;
        address treasury = ecosystemManager.getTreasuryAddress();
        address dm = ecosystemManager.getDelegationManagerAddress();
        require(treasury != address(0), "NLP: Treasury not configured in Hub");
        require(dm != address(0), "NLP: Delegation Manager not configured in Hub");

        uint256 treasuryShareBips = ecosystemManager.getFee(TAX_TREASURY_SHARE_KEY);
        uint256 delegatorShareBips = ecosystemManager.getFee(TAX_DELEGATOR_SHARE_KEY);
        uint256 treasuryAmount = (_taxAmount * treasuryShareBips) / 10000;
        uint256 delegatorAmount = (_taxAmount * delegatorShareBips) / 10000;
        
        if (treasuryAmount > 0) {
            require(bkcToken.transfer(treasury, treasuryAmount), "NLP: Tax to Treasury failed");
        }
        
        if (delegatorAmount > 0) {
            bkcToken.approve(address(delegationManager), delegatorAmount);
            delegationManager.depositRewards(0, delegatorAmount);
        }
    }

    // --- View Functions (Price Logic Refactored) ---

    /**
     * @notice Calculates the current price to buy 1 NFT.
     */
    function getBuyPrice() public view returns (uint256) {
        // REFACTOR: Uses 'pool' variable
        if (!pool.isInitialized || pool.nftCount == 0) return type(uint256).max;
        if (pool.nftCount <= 1) return type(uint256).max; // Cannot buy the last NFT
        uint256 newY = pool.k / (pool.nftCount - 1);
        if (newY < pool.tokenBalance) return 0; // Should not happen

        return newY - pool.tokenBalance;
    }

    /**
     * @notice Calculates the current payout for selling 1 NFT (before tax).
     */
    function getSellPrice() public view returns (uint256) {
        // REFACTOR: Uses 'pool' variable
        if (!pool.isInitialized || pool.nftCount == type(uint256).max) return 0;

        uint256 newY = pool.k / (pool.nftCount + 1);
        return (pool.tokenBalance > newY) ? pool.tokenBalance - newY : 0;
    }

    /**
     * @notice Returns the state of this pool.
     */
    function getPoolInfo() 
        external 
        view 
        returns (
            uint256 tokenBalance, 
            uint256 nftCount, 
            uint256 k, 
            bool isInitialized
        ) 
    {
        // REFACTOR: Uses 'pool' variable
        return (
            pool.tokenBalance,
            pool.nftCount,
            pool.k,
            pool.isInitialized
        );
    }

    /**
     * @notice (NEW V4) Returns the available token IDs for purchase in a pool.
     */
    function getAvailableTokenIds() external view returns (uint256[] memory) {
        return pool.tokenIds;
    }

    // --- UUPS Upgrade Function ---
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}