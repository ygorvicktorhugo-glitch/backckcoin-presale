// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract RewardBoosterNFT is Initializable, ERC721Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    using StringsUpgradeable for uint256;

    mapping(uint256 => uint256) public boostBips;
    mapping(uint256 => string) public tokenMetadataFile;
    string private _customBaseURI;
    uint256 private _tokenIdCounter;
    address public saleContractAddress;

    event BoosterMinted(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 boostInBips
    );
    event SaleContractAddressSet(address indexed saleContract);

    // REMOVIDO O CONSTRUCTOR QUE CAUSA O ERRO DE SEGURANÇA NA OZ
    // constructor() {
    //     _disableInitializers();
    // }

    function initialize(
        address _initialOwner
    ) public initializer {
        __ERC721_init("Backchain Reward Booster", "BKCB");
        __Ownable_init();
        __UUPSUpgradeable_init();
        
        require(_initialOwner != address(0), "RBNFT: Invalid owner address");
        _transferOwnership(_initialOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _customBaseURI = newBaseURI;
    }

    function setSaleContractAddress(address _saleAddress) external onlyOwner {
        require(_saleAddress != address(0), "RBNFT: Invalid address");
        saleContractAddress = _saleAddress;
        emit SaleContractAddressSet(_saleAddress);
    }

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

    function _mintInternal(
        address to,
        uint256 boostValueInBips,
        string calldata metadataFile
    ) internal returns (uint256) {
        uint256 tokenId = _tokenIdCounter++;
        _safeMint(to, tokenId);

        boostBips[tokenId] = boostValueInBips;
        tokenMetadataFile[tokenId] = metadataFile;

        emit BoosterMinted(tokenId, to, boostValueInBips);
        return tokenId;
    }

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