// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- Imports para a versão Upgradeable ---
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol";

/**
 * @title RewardBoosterNFT (V2 - Mint on Demand Support, Upgradeable)
 * @author Gemini AI (Based on original contract)
 * @dev Este NFT foi convertido para o padrão Upgradeable para uniformizar o projeto.
 * @notice It allows an authorized 'saleContractAddress' to mint NFTs on demand.
 */
contract RewardBoosterNFT is Initializable, ERC721Upgradeable, OwnableUpgradeable {
    using StringsUpgradeable for uint256;

    // --- State Variables ---
    /** @notice Maps a tokenId to its boost value (e.g., 5000 for 50%).
     */
    mapping(uint256 => uint256) public boostBips;

    /** @notice Maps a tokenId to its metadata filename (e.g., "diamond.json").
     */
    mapping(uint256 => string) public tokenMetadataFile;

    /** @notice The base URI for metadata (e.g., "ipfs://CID/").
     */
    string private _customBaseURI;

    /** @notice Counter for generating new token IDs.
     */
    uint256 private _tokenIdCounter;

    /** @notice The single, authorized address (e.g., PublicSale contract) allowed to mint.
     */
    address public saleContractAddress;

    // --- Events ---
    event BoosterMinted(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 boostInBips
    );
    event SaleContractAddressSet(address indexed saleContract);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // --- Initializer ---
    function initialize(
        address _initialOwner
    ) public initializer {
        __ERC721_init("Backchain Reward Booster", "BKCB");
        __Ownable_init();
        
        require(_initialOwner != address(0), "RBNFT: Invalid owner address");
        _transferOwnership(_initialOwner);
    }

    // --- Configuration Functions (Owner Only) ---

    /**
     * @notice (Owner) Sets the base URI for token metadata.
     * @param newBaseURI The base URI string (e.g., "https://api.myproject.com/nft/").
     */
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _customBaseURI = newBaseURI;
    }

    /**
     * @notice (Owner) Sets the address of the PublicSale contract authorized to mint.
     * @param _saleAddress The address of the deployed PublicSale contract.
     */
    function setSaleContractAddress(address _saleAddress) external onlyOwner {
        require(_saleAddress != address(0), "RBNFT: Invalid address");
        saleContractAddress = _saleAddress;
        emit SaleContractAddressSet(_saleAddress);
    }

    // --- Minting Functions ---

    /**
     * @notice (Owner) Mints a batch of NFTs to a specific address.
     * @dev Useful for airdrops or seeding the NFTLiquidityPool.
     * @param to The recipient address.
     * @param quantity The number of NFTs to mint.
     * @param boostValueInBips The boost value for all NFTs in this batch.
     * @param metadataFile The metadata filename for all NFTs in this batch.
     */
    function ownerMintBatch(
        address to,
        uint256 quantity,
        uint256 boostValueInBips,
        string calldata metadataFile
    ) external onlyOwner {
        require(quantity > 0, "RBNFT: Quantity must be > 0");
        require(to != address(0), "RBNFT: Mint to zero address");
        require(boostValueInBips > 0 && boostValueInBips <= 10000, "RBNFT: Invalid boost value");
        
        for (uint256 i = 0; i < quantity; i++) {
            _mintInternal(to, boostValueInBips, metadataFile);
        }
    }

    /**
     * @notice (PublicSale Contract) Mints a single NFT when called by the authorized sale contract.
     * @param to The address of the buyer receiving the NFT.
     * @param boostValueInBips The boost value associated with the purchased tier.
     * @param metadataFile The metadata filename for this tier.
     * @return tokenId The ID of the newly created token.
     */
    function mintFromSale(
        address to,
        uint256 boostValueInBips,
        string calldata metadataFile
    ) external returns (uint256) {
        require(
            msg.sender == saleContractAddress,
            "RBNFT: Caller not authorized"
        );
        require(to != address(0), "RBNFT: Mint to zero address");
        require(boostValueInBips > 0 && boostValueInBips <= 10000, "RBNFT: Invalid boost value");
        
        return _mintInternal(to, boostValueInBips, metadataFile);
    }

    /**
     * @dev Internal function for minting logic, called by ownerMintBatch and mintFromSale.
     * @param to Address to mint to
     * @param boostValueInBips The boost value to store
     * @param metadataFile The metadata file name
     */
    function _mintInternal(
        address to,
        uint256 boostValueInBips,
        string calldata metadataFile
    ) internal returns (uint256) {
        uint256 tokenId = _tokenIdCounter++;
        _safeMint(to, tokenId);

        // CORRIGIDO: Armazena o VALOR do parâmetro boostValueInBips no mapping boostBips
        boostBips[tokenId] = boostValueInBips;
        tokenMetadataFile[tokenId] = metadataFile;

        emit BoosterMinted(tokenId, to, boostValueInBips);
        return tokenId;
    }

    // --- View Functions ---

    /**
     * @notice Returns the metadata URI for a given token ID.
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        require(_ownerOf(tokenId) != address(0), "ERC721: URI query for nonexistent token");
        
        string memory baseURI = _customBaseURI;
        string memory metadataFile = tokenMetadataFile[tokenId];
        
        return bytes(baseURI).length > 0
            ? string(abi.encodePacked(baseURI, metadataFile))
            : metadataFile;
    }
}