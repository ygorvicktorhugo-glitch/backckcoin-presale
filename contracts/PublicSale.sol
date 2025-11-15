// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./IInterfaces.sol";

contract PublicSale is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    
    IRewardBoosterNFT public rewardBoosterNFT;
    IEcosystemManager public ecosystemManager;

    struct Tier {
        uint256 priceInWei;
        uint256 maxSupply;
        uint256 mintedCount;
        uint256 boostBips;
        string metadataFile; // <-- O NOME CORRETO
        bool isConfigured;
    }

    mapping(uint256 => Tier) public tiers;

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
    event TierPriceUpdated(uint256 indexed tierId, uint256 newPrice);

    // Construtor removido para Upgrade Safety.

    function initialize(
        address _rewardBoosterAddress,
        address _ecosystemManagerAddress,
        address _initialOwner
    ) public initializer {
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

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

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
        tier.mintedCount = 0;
        tier.boostBips = _boostBips;
        tier.metadataFile = _metadataFile; // Aqui usa metadataFile
        tier.isConfigured = true;

        emit TierSet(_tierId, _priceInWei, _maxSupply);
    }

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

    function buyNFT(uint256 _tierId) external payable {
        buyMultipleNFTs(_tierId, 1);
    }

    function buyMultipleNFTs(uint256 _tierId, uint256 _quantity) public payable {
        require(_quantity > 0, "Sale: Quantity must be > 0");
        Tier storage tier = tiers[_tierId];
        require(tier.isConfigured, "Sale: Tier not configured");

        uint256 totalPrice = tier.priceInWei * _quantity;
        require(msg.value == totalPrice, "Sale: Incorrect native value sent");

        require(
            tier.mintedCount + _quantity <= tier.maxSupply,
            "Sale: Sold out for this tier"
        );
        tier.mintedCount += _quantity;

        for (uint i = 0; i < _quantity; i++) {
            uint256 newTokenId = rewardBoosterNFT.mintFromSale(
                msg.sender,
                tier.boostBips,
                tier.metadataFile // <-- CORRIGIDO AQUI
            );
            emit NFTSold(msg.sender, _tierId, newTokenId, tier.priceInWei);
        }
    }

    function withdrawFunds() external onlyOwner {
        address treasuryWallet = ecosystemManager.getTreasuryAddress();
        require(
            treasuryWallet != address(0),
            "Sale: Treasury not configured in Hub"
        );
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = treasuryWallet.call{value: balance}("");
            require(success, "Sale: Native currency withdrawal failed");
        }
    }
}