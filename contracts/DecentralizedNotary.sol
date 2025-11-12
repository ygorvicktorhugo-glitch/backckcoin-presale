// contracts/DecentralizedNotary.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Imports
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "./IInterfaces.sol";
import "./BKCToken.sol";

contract DecentralizedNotary is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ERC721EnumerableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;

    // --- Core Contracts ---
    IEcosystemManager public ecosystemManager;
    IDelegationManager public delegationManager;
    BKCToken public bkcToken;
    address public miningManagerAddress;

    // --- State ---
    CountersUpgradeable.Counter private _tokenIdCounter;
    mapping(uint256 => string) public documentMetadataURI;

    string public constant SERVICE_KEY = "NOTARY_SERVICE";

    // --- Events ---
    event NotarizationEvent(
        uint256 indexed tokenId,
        address indexed owner,
        string indexed documentMetadataHash 
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract and sets core addresses.
     */
    function initialize(
        address _initialOwner,
        address _ecosystemManagerAddress
    ) public initializer {
        // ✅ CORREÇÃO (Aviso): Ordem dos inicializadores corrigida
        __Ownable_init(); 
        __UUPSUpgradeable_init();
        __ERC721_init("Notary Certificate", "NOTARY");
        __ERC721Enumerable_init();
        __ReentrancyGuard_init(); 

        require(
            _ecosystemManagerAddress != address(0),
            "Notary: EcosystemManager cannot be zero"
        );
        require(_initialOwner != address(0), "Notary: Invalid owner address");
        
        _transferOwnership(_initialOwner);

        ecosystemManager = IEcosystemManager(_ecosystemManagerAddress);

        address _bkcTokenAddress = ecosystemManager.getBKCTokenAddress();
        address _dmAddress = ecosystemManager.getDelegationManagerAddress();
        address _miningManagerAddr = ecosystemManager.getMiningManagerAddress();

        require(
            _bkcTokenAddress != address(0) &&
                _dmAddress != address(0) &&
                _miningManagerAddr != address(0),
            "Notary: Core contracts not set in Brain"
        );

        bkcToken = BKCToken(_bkcTokenAddress);
        delegationManager = IDelegationManager(_dmAddress);
        miningManagerAddress = _miningManagerAddr;
    }

    // --- Core Functionality ---

    /**
     * @notice Notarizes a document by saving its metadata URI.
     * @param _documentMetadataURI The IPFS URI of the metadata JSON file.
     * @param _boosterTokenId The booster NFT used for a discount.
     */
    function notarize(
        string calldata _documentMetadataURI, 
        uint256 _boosterTokenId
    ) external nonReentrant returns (uint256 tokenId) {
        require(
            bytes(_documentMetadataURI).length > 0,
            "Notary: Hash cannot be empty"
        );
        
        uint256 feeToPay = ecosystemManager.authorizeService(
            SERVICE_KEY,
            msg.sender,
            _boosterTokenId
        );
        require(feeToPay > 0, "Notary: Fee cannot be zero");

        // 1. Puxa a taxa de $BKC
        bkcToken.transferFrom(msg.sender, address(this), feeToPay);

        // 2. Aprova e chama o PoP Mining
        bkcToken.approve(miningManagerAddress, feeToPay);
        uint256 bonusReward = IMiningManager(miningManagerAddress)
            .performPurchaseMining(
                SERVICE_KEY,
                feeToPay
            );
            
        // 3. Deposita a taxa (pós-bônus) no pool de delegação
        bkcToken.approve(address(delegationManager), feeToPay);
        delegationManager.depositRewards(0, feeToPay);
        
        // 4. Devolve o bônus de mineração ao usuário
        if (bonusReward > 0) {
            bkcToken.transfer(msg.sender, bonusReward);
        }

        // 5. Minta o NFT
        _tokenIdCounter.increment();
        tokenId = _tokenIdCounter.current();
        _safeMint(msg.sender, tokenId);

        // 6. Salva a URI dos metadados
        documentMetadataURI[tokenId] = _documentMetadataURI;

        emit NotarizationEvent(tokenId, msg.sender, _documentMetadataURI);
        return tokenId;
    }

    // --- View Functions (ERC721 Overrides) ---

    /**
     * @notice Returns the metadata URI for a given token ID.
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        require(
            _exists(tokenId),
            "ERC721: URI query for nonexistent token"
         );
        
        // Retorna a URI única salva durante o 'notarize'
        return documentMetadataURI[tokenId];
    }

    // --- Required Overrides for ERC721Enumerable ---
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721EnumerableUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // --- UUPS Upgrade Function ---
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}