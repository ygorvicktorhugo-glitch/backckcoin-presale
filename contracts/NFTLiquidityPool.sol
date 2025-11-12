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
<<<<<<< HEAD
 * @title NFTLiquidityPool (V3 - UUPS AMM Spoke)
 * @author Gemini AI (Based on original contract)
 * @dev This UUPS contract is an AMM for trading RewardBoosterNFTs for BKC.
=======
 * @title NFTLiquidityPool (AMM for RewardBoosterNFT)
 * @dev V2: "Spoke" contract refactored to use EcosystemManager.
 * @notice V3: Added "Tax" on sale (10%) with 4/4/2 distribution and booster discount.
 * @notice V4 (CORRECTED): Added tokenId tracking and the buyNextAvailableNFT function.
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
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
        
        // ===================================================
        // ### CORREÇÃO 1 ###
        // Mapeamento para encontrar a posição de um token no array em O(1)
        // A palavra-chave 'private' foi REMOVIDA.
        mapping(uint256 => uint256) tokenIdToIndex;
        // ===================================================
        
        // Array de Token IDs que este pool possui
        uint256[] tokenIds; 
    }

<<<<<<< HEAD
    mapping(uint256 => Pool) public pools;

    // --- Service Keys ---
=======
    // O mapping 'pools' NÃO PODE ser 'public' se a struct Pool contém um mapping.
    // O getter 'getPoolInfo' (no final do arquivo) o substitui.
    mapping(uint256 => Pool) private pools; // Maps boostBips => Pool

    // --- KEYS FOR HUB (Unchanged) ---
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
    string public constant PSTAKE_SERVICE_KEY = "NFT_POOL_ACCESS";
    string public constant TAX_BIPS_KEY = "NFT_POOL_TAX_BIPS";
    string public constant TAX_TREASURY_SHARE_KEY = "NFT_POOL_TAX_TREASURY_SHARE_BIPS";
    string public constant TAX_DELEGATOR_SHARE_KEY = "NFT_POOL_TAX_DELEGATOR_SHARE_BIPS";
<<<<<<< HEAD

    // --- Events ---
=======
    string public constant TAX_LIQUIDITY_SHARE_KEY = "NFT_POOL_TAX_LIQUIDITY_SHARE_BIPS";

    // --- Events (Unchanged) ---
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
    event PoolCreated(uint256 indexed boostBips);
    event LiquidityAdded(
        uint256 indexed boostBips,
        uint256 nftAmount,
        uint256 bkcAmount
    );
    event NFTsAddedToPool(uint256 indexed boostBips, uint256 nftAmount);
<<<<<<< HEAD
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
        
=======
    event NFTBought(address indexed buyer, uint256 indexed boostBips, uint256 tokenId, uint256 price);
    event NFTSold(address indexed seller, uint256 indexed boostBips, uint256 tokenId, uint256 payout, uint256 taxPaid);

    constructor(
        address _ecosystemManagerAddress,
        address _initialOwner
    ) Ownable(_initialOwner) {
        require(_ecosystemManagerAddress != address(0), "NLP: Hub cannot be zero");
        ecosystemManager = IEcosystemManager(_ecosystemManagerAddress);

        address _bkcTokenAddress = ecosystemManager.getBKCTokenAddress();
        require(_bkcTokenAddress != address(0), "NLP: Token not configured in Hub");
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
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

<<<<<<< HEAD
    // --- 1. Admin Functions ---

    /**
     * @notice (Owner) Creates the structure for a new liquidity pool.
     */
=======
    // --- Admin Functions ---

>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
    function createPool(uint256 _boostBips) external onlyOwner {
        require(!pools[_boostBips].isInitialized, "NLP: Pool already exists");
        pools[_boostBips].isInitialized = true;
        emit PoolCreated(_boostBips);
    }

<<<<<<< HEAD
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
=======
    function addInitialLiquidity(uint256 _boostBips, uint256[] calldata _tokenIds, uint256 _bkcAmount) external onlyOwner nonReentrant {
        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(rewardBoosterAddress != address(0), "NLP: Booster not configured in Hub");
        IERC721 rewardBoosterNFT = IERC721(rewardBoosterAddress);
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
        
        Pool storage pool = pools[_boostBips];
        require(pool.isInitialized, "NLP: Pool not initialized");
        require(pool.nftCount == 0, "NLP: Liquidity already added");
        require(_tokenIds.length > 0, "NLP: Must add at least one NFT");
        require(_bkcAmount > 0, "NLP: Must add BKC liquidity");

        for (uint i = 0; i < _tokenIds.length; i++) {
<<<<<<< HEAD
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
=======
            rewardBoosterNFT.safeTransferFrom(msg.sender, address(this), _tokenIds[i]);
            _addTokenId(pool, _tokenIds[i]); // <-- Tracks the ID
        }

        require(bkcToken.transferFrom(msg.sender, address(this), _bkcAmount), "NLP: BKC transfer failed");
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407

        pool.nftCount = _tokenIds.length;
        pool.tokenBalance = _bkcAmount;
        pool.k = pool.nftCount * pool.tokenBalance;

        emit LiquidityAdded(_boostBips, pool.nftCount, pool.tokenBalance);
    }

<<<<<<< HEAD
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
=======
    function addMoreNFTsToPool(uint256 _boostBips, uint256[] calldata _tokenIds) external onlyOwner nonReentrant {
        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(rewardBoosterAddress != address(0), "NLP: Booster not configured in Hub");
        IERC721 rewardBoosterNFT = IERC721(rewardBoosterAddress);
        
        Pool storage pool = pools[_boostBips];
        require(pool.isInitialized && pool.k > 0, "NLP: Pool not initialized with liquidity yet");
        require(_tokenIds.length > 0, "NLP: Token IDs array cannot be empty");

        for (uint i = 0; i < _tokenIds.length; i++) {
            rewardBoosterNFT.safeTransferFrom(msg.sender, address(this), _tokenIds[i]);
            _addTokenId(pool, _tokenIds[i]); // <-- Tracks the ID
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
        }

        pool.nftCount += _tokenIds.length;
        pool.k = pool.nftCount * pool.tokenBalance;

        emit NFTsAddedToPool(_boostBips, _tokenIds.length);
    }

    // --- 2. Trading Functions (User) ---

    /**
<<<<<<< HEAD
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
=======
     * @notice (LEGACY FUNCTION - KEPT) Buys a specific NFT by ID.
     * @dev Functionality is kept, but frontend should use buyNextAvailableNFT.
     */
    function buyNFT(uint256 _boostBips, uint256 _tokenId, uint256 _boosterTokenId) external nonReentrant {
        // 1. AUTHORIZATION
        uint256 serviceFee = ecosystemManager.authorizeService(
            PSTAKE_SERVICE_KEY,
            msg.sender,
            _boosterTokenId 
        );
        require(serviceFee == 0, "NLP: Buy service fee should be zero");

        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(rewardBoosterAddress != address(0), "NLP: Booster not configured in Hub");
        IRewardBoosterNFT rewardBoosterNFT = IRewardBoosterNFT(rewardBoosterAddress);
        
        Pool storage pool = pools[_boostBips];
        require(pool.isInitialized && pool.nftCount > 0, "NLP: No NFTs available in this pool");
        require(IERC721(rewardBoosterAddress).ownerOf(_tokenId) == address(this), "NLP: Contract does not own this NFT");
        require(rewardBoosterNFT.boostBips(_tokenId) == _boostBips, "NLP: Token tier mismatch");

        uint256 price = getBuyPrice(_boostBips);
        require(bkcToken.transferFrom(msg.sender, address(this), price), "NLP: BKC transfer failed");
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407

        // 2. Pull BKC from buyer
        require(
            bkcToken.transferFrom(msg.sender, address(this), price),
            "NLP: BKC transfer failed"
        );

        // 3. Update pool state
        pool.tokenBalance += price;
        pool.nftCount--;
        pool.k = (pool.nftCount == 0) ? 0 : pool.tokenBalance * pool.nftCount;

<<<<<<< HEAD
        // 4. Transfer NFT to buyer
        IERC721Upgradeable(rewardBoosterAddress).safeTransferFrom(
            address(this),
            msg.sender,
            _tokenId
        );

=======
        // --- V4 CHANGE: Remove the specific ID from tracking ---
        _removeTokenId(pool, _tokenId);

        // Transfer NFT to buyer
        IERC721(rewardBoosterAddress).safeTransferFrom(address(this), msg.sender, _tokenId);
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
        emit NFTBought(msg.sender, _boostBips, _tokenId, price);
    }

    /**
<<<<<<< HEAD
     * @notice Sells an NFT to the pool.
     */
    function sellNFT(uint256 _tokenId, uint256 _boosterTokenId)
        external
        nonReentrant
    {
        // 1. AUTHORIZATION
        ecosystemManager.authorizeService(
=======
     * @notice (NEW FUNCTION V4) Buys the next available NFT from a tier.
     * @dev This is the function the frontend (transactions.js) should call.
     * @param _boostBips The tier of NFT to buy.
     * @param _boosterTokenId The user's booster for the pStake check.
     */
    function buyNextAvailableNFT(uint256 _boostBips, uint256 _boosterTokenId) external nonReentrant {
        // 1. AUTHORIZATION (Logic copied from buyNFT)
        uint256 serviceFee = ecosystemManager.authorizeService(
            PSTAKE_SERVICE_KEY,
            msg.sender,
            _boosterTokenId
        );
        require(serviceFee == 0, "NLP: Buy service fee should be zero");

        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(rewardBoosterAddress != address(0), "NLP: Booster not configured in Hub");
        
        Pool storage pool = pools[_boostBips];
        require(pool.isInitialized && pool.nftCount > 0, "NLP: No NFTs available in this pool");
        require(pool.tokenIds.length > 0, "NLP: Pool tracking array is empty, desync");

        // 2. SELECT THE TOKEN
        // Get the last token ID from the array (O(1))
        uint256 tokenIdToSell = pool.tokenIds[pool.tokenIds.length - 1];

        // 3. PRICE & PAYMENT LOGIC (Logic copied from buyNFT)
        uint256 price = getBuyPrice(_boostBips); 
        require(bkcToken.transferFrom(msg.sender, address(this), price), "NLP: BKC transfer failed");

        // 4. UPDATE POOL STATE (Logic copied from buyNFT)
        pool.tokenBalance += price;
        pool.nftCount--;
        pool.k = (pool.nftCount == 0) ? 0 : pool.tokenBalance * pool.nftCount;

        // 5. UPDATE TRACKING (O(1) pop)
        delete pool.tokenIdToIndex[tokenIdToSell];
        pool.tokenIds.pop();

        // 6. TRANSFER NFT (Logic copied from buyNFT)
        IERC721(rewardBoosterAddress).safeTransferFrom(address(this), msg.sender, tokenIdToSell);
        emit NFTBought(msg.sender, _boostBips, tokenIdToSell, price);
    }


    function sellNFT(uint256 _tokenId, uint256 _boosterTokenId) external nonReentrant {
        // 1. AUTHORIZATION
         uint256 serviceFee = ecosystemManager.authorizeService(
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
            PSTAKE_SERVICE_KEY,
            msg.sender,
            _boosterTokenId
        );
        
        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
<<<<<<< HEAD
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
=======
        require(rewardBoosterAddress != address(0), "NLP: Booster not configured in Hub");
        IRewardBoosterNFT rewardBoosterNFT = IRewardBoosterNFT(rewardBoosterAddress);
        
        require(IERC721(rewardBoosterAddress).ownerOf(_tokenId) == msg.sender, "NLP: Not the owner");
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
        uint256 boostBips = rewardBoosterNFT.boostBips(_tokenId);
        require(boostBips > 0, "NLP: Not a valid Booster NFT");

        Pool storage pool = pools[boostBips];
        require(pool.isInitialized, "NLP: Pool does not exist for this tier");

        uint256 sellValue = getSellPrice(boostBips);
<<<<<<< HEAD
        require(
            pool.tokenBalance >= sellValue,
            "NLP: Pool has insufficient BKC liquidity"
        );

        // --- 3. TAX CALCULATION ---
        uint256 taxBipsBase = ecosystemManager.getFee(TAX_BIPS_KEY);
        uint256 discountBips = 0;

=======
        require(pool.tokenBalance >= sellValue, "NLP: Pool has insufficient BKC liquidity");

        // --- 2. TAX CALCULATION (Unchanged) ---
        uint256 taxBipsBase = ecosystemManager.getFee(TAX_BIPS_KEY);
        uint256 discountBips = 0;
        
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
        if (_boosterTokenId > 0) {
            try rewardBoosterNFT.ownerOf(_boosterTokenId)
            returns (address owner) {
                if (owner == msg.sender) {
                    uint256 userBoostBips = rewardBoosterNFT.boostBips(_boosterTokenId);
                    discountBips = ecosystemManager.getBoosterDiscount(userBoostBips);
                }
<<<<<<< HEAD
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
=======
            } catch { /* Ignore discount */ }
        }

        uint256 finalTaxBips = (taxBipsBase > discountBips) ? taxBipsBase - discountBips : 0;
        uint256 finalTaxAmount = (sellValue * finalTaxBips) / 10000;
        uint256 payoutToSeller = sellValue - finalTaxAmount;
        
        // --- 3. TRANSFERS (Unchanged) ---
        IERC721(rewardBoosterAddress).safeTransferFrom(msg.sender, address(this), _tokenId);
        if (payoutToSeller > 0) {
            require(bkcToken.transfer(msg.sender, payoutToSeller), "NLP: Payout transfer failed");
        }

        // --- 4. TAX DISTRIBUTION (Unchanged) ---
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
        if (finalTaxAmount > 0) {
            _distributeTax(finalTaxAmount);
        }

<<<<<<< HEAD
        // 6. UPDATE POOL STATE
        uint256 liquidityAmount = _getLiquidityShare(finalTaxAmount);
        pool.tokenBalance -= sellValue;
        pool.tokenBalance += liquidityAmount;
        pool.nftCount++;
        pool.k = pool.tokenBalance * pool.nftCount;
=======
        // --- 5. UPDATE POOL STATE (Unchanged logic) ---
        uint256 liquidityShareBips = ecosystemManager.getFee(TAX_LIQUIDITY_SHARE_KEY);
        uint256 liquidityAmount = (finalTaxAmount * liquidityShareBips) / 10000;
        
        pool.tokenBalance -= sellValue;
        pool.tokenBalance += liquidityAmount;
        pool.nftCount++;

        // --- V4 CHANGE: Add the sold token to tracking ---
        _addTokenId(pool, _tokenId);
        
        pool.k = pool.tokenBalance * pool.nftCount; // Recalculate k
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407

        emit NFTSold(
            msg.sender,
            boostBips,
            _tokenId,
            payoutToSeller,
            finalTaxAmount
        );
    }

<<<<<<< HEAD
    // --- 3. Internal & View Functions ---

    /**
     * @notice (Internal) Distributes the tax (40/40/20).
=======
    // --- Internal Functions ---

    /**
     * @notice (NEW V4) Adds a token to the pool's tracking.
     */
    function _addTokenId(Pool storage pool, uint256 _tokenId) internal {
        // Add the ID to the end of the array and save its index
        pool.tokenIdToIndex[_tokenId] = pool.tokenIds.length;
        pool.tokenIds.push(_tokenId);
    }

    /**
     * @notice (NEW V4) Removes a specific token from tracking (Swap and Pop).
     */
    function _removeTokenId(Pool storage pool, uint256 _tokenId) internal {
        // Get the index of the token to remove
        uint256 indexToRemove = pool.tokenIdToIndex[_tokenId];
        uint256 lastIndex = pool.tokenIds.length - 1;

        if (indexToRemove != lastIndex) {
            // If it's not the last one, move the last token to the removed spot
            uint256 lastTokenId = pool.tokenIds[lastIndex];
            pool.tokenIds[indexToRemove] = lastTokenId;
            pool.tokenIdToIndex[lastTokenId] = indexToRemove;
        }

        // Remove the last element (which is either the token to remove, or a duplicate)
        pool.tokenIds.pop();
        delete pool.tokenIdToIndex[_tokenId];
    }

    /**
     * @notice (Internal Tax function - Unchanged)
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
     */
    function _distributeTax(uint256 _taxAmount) internal {
        if (_taxAmount == 0) return;
        
        address treasury = ecosystemManager.getTreasuryAddress();
<<<<<<< HEAD
        require(treasury != address(0), "NLP: Treasury not configured in Brain");
=======
        address dm = ecosystemManager.getDelegationManagerAddress();
        require(treasury != address(0), "NLP: Treasury not configured in Hub");
        require(dm != address(0), "NLP: Delegation Manager not configured in Hub");

        uint256 treasuryShareBips = ecosystemManager.getFee(TAX_TREASURY_SHARE_KEY);
        uint256 delegatorShareBips = ecosystemManager.getFee(TAX_DELEGATOR_SHARE_KEY);
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407

        uint256 treasuryShareBips = ecosystemManager.getFee(TAX_TREASURY_SHARE_KEY);
        uint256 delegatorShareBips = ecosystemManager.getFee(TAX_DELEGATOR_SHARE_KEY);
        
        uint256 treasuryAmount = (_taxAmount * treasuryShareBips) / 10000;
        uint256 delegatorAmount = (_taxAmount * delegatorShareBips) / 10000;
<<<<<<< HEAD

        if (treasuryAmount > 0) {
            require(
                bkcToken.transfer(treasury, treasuryAmount),
                "NLP: Tax to Treasury failed"
            );
        }

=======
        // The remainder (liquidityAmount) is already accounted for in 'sellNFT' logic

        if (treasuryAmount > 0) {
            require(bkcToken.transfer(treasury, treasuryAmount), "NLP: Tax to Treasury failed");
        }
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
        if (delegatorAmount > 0) {
            bkcToken.approve(address(delegationManager), delegatorAmount);
            delegationManager.depositRewards(0, delegatorAmount);
        }
    }

<<<<<<< HEAD
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
=======
    // --- View Functions (Unchanged Price Logic) ---

    function getBuyPrice(uint256 _boostBips) public view returns (uint256) {
        Pool storage pool = pools[_boostBips];
        if (!pool.isInitialized || pool.nftCount == 0) return type(uint256).max;
        if (pool.nftCount <= 1) return type(uint256).max;

        uint256 newY = pool.k / (pool.nftCount - 1);
        if (newY < pool.tokenBalance) return 0;

        return newY - pool.tokenBalance;
    }

    function getSellPrice(uint256 _boostBips) public view returns (uint256) {
        Pool storage pool = pools[_boostBips];
        if (!pool.isInitialized || pool.nftCount == type(uint256).max) return 0;
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407

        uint256 newY = pool.k / (pool.nftCount + 1);
        return (pool.tokenBalance > newY) ? pool.tokenBalance - newY : 0;
    }

<<<<<<< HEAD
=======
    // ===================================================
    // ### CORREÇÃO 2 ###
    // Esta função (getPoolInfo) causou o erro de compilação.
    // Ela agora retorna os valores individuais em vez da struct.
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
    /**
     * @notice Returns the state of a specific pool.
     * @dev Does not return the full struct, as it contains a mapping.
     */
<<<<<<< HEAD
    function getPoolInfo(uint256 _boostBips)
        external
        view
        returns (Pool memory)
    {
        return pools[_boostBips];
=======
    function getPoolInfo(uint256 _boostBips) 
        external 
        view 
        returns (
            uint256 tokenBalance, 
            uint256 nftCount, 
            uint256 k, 
            bool isInitialized
        ) 
    {
        Pool storage pool = pools[_boostBips];
        return (
            pool.tokenBalance,
            pool.nftCount,
            pool.k,
            pool.isInitialized
        );
    }
    // ===================================================

    /**
     * @notice (NEW V4) Returns the available token IDs for purchase in a pool.
     * @dev Useful for frontend to see the "stock".
     */
    function getAvailableTokenIds(uint256 _boostBips) external view returns (uint256[] memory) {
        return pools[_boostBips].tokenIds;
>>>>>>> 778c7fd9d1d9116dad11d65edd265337431e0407
    }

    // --- UUPS Upgrade Function ---
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}