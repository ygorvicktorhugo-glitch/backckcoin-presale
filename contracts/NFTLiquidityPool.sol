// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
// Import Hub, Token, and Booster interfaces
import "./EcosystemManager.sol";
import "./BKCToken.sol";

/**
 * @title NFTLiquidityPool (AMM for RewardBoosterNFT)
 * @dev V2: "Spoke" contract refactored to use EcosystemManager.
 * @notice V3: Added "Tax" on sale (10%) with 4/4/2 distribution and booster discount.
 * @notice V4 (CORRECTED): Added tokenId tracking and the buyNextAvailableNFT function.
 */
contract NFTLiquidityPool is Ownable, ReentrancyGuard, IERC721Receiver {

    IEcosystemManager public immutable ecosystemManager;
    BKCToken public immutable bkcToken;

    struct Pool {
        uint256 tokenBalance; // BKC balance
        uint256 nftCount;     // Number of NFTs held
        uint256 k;            // Invariant k = tokenBalance * nftCount
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

    // O mapping 'pools' NÃO PODE ser 'public' se a struct Pool contém um mapping.
    // O getter 'getPoolInfo' (no final do arquivo) o substitui.
    mapping(uint256 => Pool) private pools; // Maps boostBips => Pool

    // --- KEYS FOR HUB (Unchanged) ---
    string public constant PSTAKE_SERVICE_KEY = "NFT_POOL_ACCESS";
    string public constant TAX_BIPS_KEY = "NFT_POOL_TAX_BIPS";
    string public constant TAX_TREASURY_SHARE_KEY = "NFT_POOL_TAX_TREASURY_SHARE_BIPS";
    string public constant TAX_DELEGATOR_SHARE_KEY = "NFT_POOL_TAX_DELEGATOR_SHARE_BIPS";
    string public constant TAX_LIQUIDITY_SHARE_KEY = "NFT_POOL_TAX_LIQUIDITY_SHARE_BIPS";

    // --- Events (Unchanged) ---
    event PoolCreated(uint256 indexed boostBips);
    event LiquidityAdded(uint256 indexed boostBips, uint256 nftAmount, uint256 bkcAmount);
    event NFTsAddedToPool(uint256 indexed boostBips, uint256 nftAmount);
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
        bkcToken = BKCToken(_bkcTokenAddress);
    }

    // Required by IERC721Receiver
    function onERC721Received(address, address, uint256, bytes memory) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // --- Admin Functions ---

    function createPool(uint256 _boostBips) external onlyOwner {
        require(!pools[_boostBips].isInitialized, "NLP: Pool already exists");
        pools[_boostBips].isInitialized = true;
        emit PoolCreated(_boostBips);
    }

    function addInitialLiquidity(uint256 _boostBips, uint256[] calldata _tokenIds, uint256 _bkcAmount) external onlyOwner nonReentrant {
        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(rewardBoosterAddress != address(0), "NLP: Booster not configured in Hub");
        IERC721 rewardBoosterNFT = IERC721(rewardBoosterAddress);
        
        Pool storage pool = pools[_boostBips];
        require(pool.isInitialized, "NLP: Pool not initialized");
        require(pool.nftCount == 0, "NLP: Liquidity already added");
        require(_tokenIds.length > 0, "NLP: Must add at least one NFT");
        require(_bkcAmount > 0, "NLP: Must add BKC liquidity");

        for (uint i = 0; i < _tokenIds.length; i++) {
            rewardBoosterNFT.safeTransferFrom(msg.sender, address(this), _tokenIds[i]);
            _addTokenId(pool, _tokenIds[i]); // <-- Tracks the ID
        }

        require(bkcToken.transferFrom(msg.sender, address(this), _bkcAmount), "NLP: BKC transfer failed");

        pool.nftCount = _tokenIds.length;
        pool.tokenBalance = _bkcAmount;
        pool.k = pool.nftCount * pool.tokenBalance;

        emit LiquidityAdded(_boostBips, pool.nftCount, pool.tokenBalance);
    }

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
        }

        pool.nftCount += _tokenIds.length;
        pool.k = pool.nftCount * pool.tokenBalance; // Recalculate k

        emit NFTsAddedToPool(_boostBips, _tokenIds.length);
    }

    // --- Trading Functions ---

    /**
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

        // Update pool state
        pool.tokenBalance += price;
        pool.nftCount--;
        pool.k = (pool.nftCount == 0) ? 0 : pool.tokenBalance * pool.nftCount;

        // --- V4 CHANGE: Remove the specific ID from tracking ---
        _removeTokenId(pool, _tokenId);

        // Transfer NFT to buyer
        IERC721(rewardBoosterAddress).safeTransferFrom(address(this), msg.sender, _tokenId);
        emit NFTBought(msg.sender, _boostBips, _tokenId, price);
    }

    /**
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
            PSTAKE_SERVICE_KEY,
            msg.sender,
            _boosterTokenId
        );
        require(serviceFee == 0, "NLP: Sell service fee should be zero");

        address rewardBoosterAddress = ecosystemManager.getBoosterAddress();
        require(rewardBoosterAddress != address(0), "NLP: Booster not configured in Hub");
        IRewardBoosterNFT rewardBoosterNFT = IRewardBoosterNFT(rewardBoosterAddress);
        
        require(IERC721(rewardBoosterAddress).ownerOf(_tokenId) == msg.sender, "NLP: Not the owner");
        uint256 boostBips = rewardBoosterNFT.boostBips(_tokenId);
        require(boostBips > 0, "NLP: Not a valid Booster NFT");

        Pool storage pool = pools[boostBips];
        require(pool.isInitialized, "NLP: Pool does not exist for this tier");

        uint256 sellValue = getSellPrice(boostBips);
        require(pool.tokenBalance >= sellValue, "NLP: Pool has insufficient BKC liquidity");

        // --- 2. TAX CALCULATION (Unchanged) ---
        uint256 taxBipsBase = ecosystemManager.getFee(TAX_BIPS_KEY);
        uint256 discountBips = 0;
        
        if (_boosterTokenId > 0) {
            try rewardBoosterNFT.ownerOf(_boosterTokenId) returns (address owner) {
                if (owner == msg.sender) {
                    uint256 userBoostBips = rewardBoosterNFT.boostBips(_boosterTokenId);
                    discountBips = ecosystemManager.getBoosterDiscount(userBoostBips);
                }
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
        if (finalTaxAmount > 0) {
            _distributeTax(finalTaxAmount);
        }

        // --- 5. UPDATE POOL STATE (Unchanged logic) ---
        uint256 liquidityShareBips = ecosystemManager.getFee(TAX_LIQUIDITY_SHARE_KEY);
        uint256 liquidityAmount = (finalTaxAmount * liquidityShareBips) / 10000;
        
        pool.tokenBalance -= sellValue;
        pool.tokenBalance += liquidityAmount;
        pool.nftCount++;

        // --- V4 CHANGE: Add the sold token to tracking ---
        _addTokenId(pool, _tokenId);
        
        pool.k = pool.tokenBalance * pool.nftCount; // Recalculate k

        emit NFTSold(msg.sender, boostBips, _tokenId, payoutToSeller, finalTaxAmount);
    }

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
     */
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
        // The remainder (liquidityAmount) is already accounted for in 'sellNFT' logic

        if (treasuryAmount > 0) {
            require(bkcToken.transfer(treasury, treasuryAmount), "NLP: Tax to Treasury failed");
        }
        if (delegatorAmount > 0) {
            bkcToken.approve(dm, delegatorAmount);
            IDelegationManager(dm).depositRewards(0, delegatorAmount);
        }
    }

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

        uint256 newY = pool.k / (pool.nftCount + 1);
        return (pool.tokenBalance > newY) ? pool.tokenBalance - newY : 0;
    }

    // ===================================================
    // ### CORREÇÃO 2 ###
    // Esta função (getPoolInfo) causou o erro de compilação.
    // Ela agora retorna os valores individuais em vez da struct.
    /**
     * @notice Returns the state of a specific pool.
     * @dev Does not return the full struct, as it contains a mapping.
     */
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
    }
}