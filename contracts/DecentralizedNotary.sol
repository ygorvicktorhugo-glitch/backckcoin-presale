// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Importações necessárias
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./BKCToken.sol";
import "./DelegationManager.sol";

/**
 * @title DecentralizedNotary
 * @dev Contrato corrigido: Ajustado override(ERC721) para tokenURI.
 */
contract DecentralizedNotary is ERC721Enumerable, Ownable, ReentrancyGuard {

    // --- Contratos do Ecossistema ---
    BKCToken public immutable bkcToken;
    DelegationManager public immutable delegationManager;
    address public immutable treasuryWallet;

    // --- Configurações do Cartório ---
    uint256 public minimumPStakeRequired;
    uint256 public notarizeFeeBKC;
    uint256 public treasuryFeeBips;

    // --- Armazenamento dos NFTs ---
    uint256 private _tokenIdCounter;
    mapping(uint256 => string) private _documentURIs;

    // --- State variable para Base URI ---
    string private _baseTokenURI;

    // --- Eventos ---
    event DocumentNotarized(
        address indexed user,
        uint256 indexed tokenId,
        string documentURI,
        uint256 feePaid
    );
    event NotarySettingsChanged(
        uint256 newMinPStake,
        uint256 newFee,
        uint256 newTreasuryBips
    );

    /**
     * @dev Construtor do contrato.
     */
    constructor(
        address _bkcTokenAddress,
        address _delegationManagerAddress,
        address _treasuryAddress,
        address _initialOwner
    ) ERC721("Backchain Notary Certificate", "BKCN") Ownable(_initialOwner) {

        require(
            _bkcTokenAddress != address(0) &&
            _delegationManagerAddress != address(0) &&
            _treasuryAddress != address(0),
            "Notary: Invalid addresses"
        );

        bkcToken = BKCToken(_bkcTokenAddress);
        delegationManager = DelegationManager(_delegationManagerAddress);
        treasuryWallet = _treasuryAddress;

        minimumPStakeRequired = 1000;
        notarizeFeeBKC = 100 * 10**18;
        treasuryFeeBips = 5000;
    }

    // --- Função Principal (para Usuários) ---
    function notarizeDocument(string calldata _documentURI) external nonReentrant {
        require(bytes(_documentURI).length > 0, "Notary: Document URI cannot be empty");

        uint256 fee = notarizeFeeBKC;
        uint256 pStake = delegationManager.userTotalPStake(msg.sender);

        require(pStake >= minimumPStakeRequired, "Notary: Insufficient pStake delegation");
        require(bkcToken.balanceOf(msg.sender) >= fee, "Notary: Insufficient BKC balance for fee");

        uint256 treasuryAmount = (fee * treasuryFeeBips) / 10000;
        uint256 delegatorAmount = fee - treasuryAmount;

        require(bkcToken.transferFrom(msg.sender, address(this), fee), "Notary: Fee transfer failed");

        if (treasuryAmount > 0) {
            require(bkcToken.transfer(treasuryWallet, treasuryAmount), "Notary: Treasury transfer failed");
        }

        if (delegatorAmount > 0) {
            bkcToken.approve(address(delegationManager), delegatorAmount);
            delegationManager.depositRewards(0, delegatorAmount);
        }

        uint256 tokenId = _tokenIdCounter++;
        _documentURIs[tokenId] = _documentURI;
        _safeMint(msg.sender, tokenId);

        emit DocumentNotarized(msg.sender, tokenId, _documentURI, fee);
    }

    // --- Funções de Administração (Owner) ---
    function setNotarySettings(
        uint256 _newMinPStake,
        uint256 _newFeeBKC,
        uint256 _newTreasuryBips
    ) external onlyOwner {
        require(_newTreasuryBips <= 10000, "Notary: Bips cannot exceed 10000");

        minimumPStakeRequired = _newMinPStake;
        notarizeFeeBKC = _newFeeBKC;
        treasuryFeeBips = _newTreasuryBips;

        emit NotarySettingsChanged(_newMinPStake, _newFeeBKC, _newTreasuryBips);
    }

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
    }

    // --- Funções de Consulta (View) ---

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    /**
     * @notice Retorna o URI completo do token.
     * @dev CORREÇÃO: Usa override(ERC721).
     */
    function tokenURI(uint256 tokenId) public view override(ERC721) returns (string memory) { // <-- CORREÇÃO AQUI
        require(ownerOf(tokenId) != address(0), "ERC721: URI query for nonexistent token");

        string memory base = _baseURI();
        string memory docURI = _documentURIs[tokenId];

        if (bytes(base).length == 0) {
            return docURI;
        }

        if (! (bytes(docURI).length > 7 && (
                 (bytes(docURI)[0] == 'i' && bytes(docURI)[1] == 'p' && bytes(docURI)[2] == 'f' && bytes(docURI)[3] == 's' && bytes(docURI)[4] == ':' && bytes(docURI)[5] == '/' && bytes(docURI)[6] == '/') ||
                 (bytes(docURI)[0] == 'h' && bytes(docURI)[1] == 't' && bytes(docURI)[2] == 't' && bytes(docURI)[3] == 'p' && bytes(docURI)[4] == 's' && bytes(docURI)[5] == ':' && bytes(docURI)[6] == '/') ||
                 (bytes(docURI)[0] == 'h' && bytes(docURI)[1] == 't' && bytes(docURI)[2] == 't' && bytes(docURI)[3] == 'p' && bytes(docURI)[4] == ':' && bytes(docURI)[5] == '/' && bytes(docURI)[6] == '/')
             ))) {
            return string(abi.encodePacked(base, docURI));
        }

        return docURI;
    }

    // --- Funções Internas ---
    // Override _update from ERC721Enumerable for compatibility if needed elsewhere,
    // otherwise the base _update from ERC721 is sufficient.
    // Keeping _increaseBalance override as it's required by ERC721Enumerable inheritance.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable) // Keep this override specific to Enumerable's version if used
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 amount)
        internal
        override(ERC721Enumerable)
    {
         super._increaseBalance(account, amount);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable) // Keep this override specific to Enumerable
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}