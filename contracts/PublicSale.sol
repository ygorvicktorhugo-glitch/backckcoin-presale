// --- Imports para a versão Upgradeable ---
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "./IInterfaces.sol"; // Imports IEcosystemManager e IRewardBoosterNFT

/**
 * @title PublicSale (V4 - Price Update Support, Upgradeable)
 * @author Gemini AI (Based on original contract)
 * @dev Contrato de venda que agora usa o padrão Upgradeable.
 * @notice Vende RewardBoosterNFTs por moeda nativa (BNB/ETH/etc.).
 */
contract PublicSale is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    
    IRewardBoosterNFT public rewardBoosterNFT;
    IEcosystemManager public ecosystemManager;

    struct Tier {
        uint256 priceInWei; // Price in native currency (BNB) Wei
        uint256 maxSupply; // Maximum supply for this tier
        uint256 mintedCount; // How many have been sold
        uint256 boostBips; // The associated boost (e.g., 5000)
        string metadataFile; // JSON file name (e.g., "diamond.json")
        bool isConfigured; // Flag to know if the tier is set
    }

    mapping(uint256 => Tier) public tiers;
    // --- Events ---
    event NFTSold(
        address indexed buyer,
        uint256 indexed tierId,
        uint256 indexed tokenId,
        uint256 price
    );
    event TierSet(
        uint256 indexed tierId,
        uint256 price,
        uint256 maxSupply
    );
    /**
     * @notice (NEW) Emitted when only the price of a tier is updated.
     */
    event TierPriceUpdated(uint256 indexed tierId, uint256 newPrice);
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializer sets the core addresses.
     */
    function initialize(
        address _rewardBoosterAddress,
        address _ecosystemManagerAddress,
        address _initialOwner
    ) public initializer {
        // CORRIGIDO: __Ownable_init() agora não aceita argumentos.
        __Ownable_init();
        __UUPSUpgradeable_init();

        require(
            _rewardBoosterAddress != address(0),
            "Sale: Invalid Booster NFT Contract"
        );
        require(
            _ecosystemManagerAddress != address(0),
            "Sale: Invalid EcosystemManager"
        );
        rewardBoosterNFT = IRewardBoosterNFT(_rewardBoosterAddress);
        ecosystemManager = IEcosystemManager(_ecosystemManagerAddress);
        
        _transferOwnership(_initialOwner);
    }

    // --- Admin Functions ---

    /**
     * @notice (Owner) Configures a sale tier for the FIRST time or RESETS it.
     * @dev This function RESETS the mintedCount to 0.
     */
    function setTier(
        uint256 _tierId,
        uint256 _priceInWei,
        uint256 _maxSupply,
        uint256 _boostBips,
        string calldata _metadataFile
    ) external onlyOwner {
        Tier storage tier = tiers[_tierId];
        tier.priceInWei = _priceInWei;
        tier.maxSupply = _maxSupply;
        tier.mintedCount = 0; // RESETS THE COUNT
        tier.boostBips = _boostBips;
        tier.metadataFile = _metadataFile;
        tier.isConfigured = true;

        emit TierSet(_tierId, _priceInWei, _maxSupply);
    }

    /**
     * @notice (Owner) (NEW) Updates ONLY the price of a tier.
     * @dev This function does NOT reset the mintedCount.
     * @param _tierId The tier ID to update.
     * @param _newPriceInWei The new price in Wei.
     */
    function updateTierPrice(uint256 _tierId, uint256 _newPriceInWei)
        external
        onlyOwner
    {
        Tier storage tier = tiers[_tierId];
        require(tier.isConfigured, "Sale: Tier not configured");
        require(_newPriceInWei > 0, "Sale: Price must be positive");

        tier.priceInWei = _newPriceInWei;

        emit TierPriceUpdated(_tierId, _newPriceInWei);
    }

    // --- Core Sale Functions ---

    /**
     * @notice (User) Buys a single NFT from a tier.
     */
    function buyNFT(uint256 _tierId) external payable {
        buyMultipleNFTs(_tierId, 1);
    }

    /**
     * @notice (User) Buys multiple NFTs from a tier.
     */
    function buyMultipleNFTs(uint256 _tierId, uint256 _quantity) public payable {
        require(_quantity > 0, "Sale: Quantity must be > 0");
        Tier storage tier = tiers[_tierId];
        require(tier.isConfigured, "Sale: Tier not configured");

        uint256 totalPrice = tier.priceInWei * _quantity;
        require(msg.value == totalPrice, "Sale: Incorrect BNB value");

        // Stock check
        require(
            tier.mintedCount + _quantity <= tier.maxSupply,
            "Sale: Sold out for this tier"
        );
        tier.mintedCount += _quantity;

        for (uint i = 0; i < _quantity; i++) {
            // Chamada para o NFT Booster (que deve ser o RewardBoosterNFT.sol, agora Upgradeable)
            uint256 newTokenId = rewardBoosterNFT.mintFromSale(
                msg.sender,
                tier.boostBips,
                tier.metadataFile
            );
            emit NFTSold(msg.sender, _tierId, newTokenId, tier.priceInWei);
        }
    }

    /**
     * @notice (Owner) Rescues the native currency (BNB) funds.
     */
    function withdrawFunds() external onlyOwner {
        address treasuryWallet = ecosystemManager.getTreasuryAddress();
        require(
            treasuryWallet != address(0),
            "Sale: Treasury not configured in Hub"
        );
        uint256 balance = address(this).balance;
        if (balance > 0) {
            // Usa call para enviar BNB
            (bool success, ) = treasuryWallet.call{value: balance}("");
            require(success, "Sale: BNB withdrawal failed");
        }
    }
    
    // --- UUPS Upgrade Function ---
    /**
     * @dev Authorizes an upgrade to a new implementation,
     * restricted to the `owner` only.
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}