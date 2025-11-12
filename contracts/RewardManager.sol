// contracts/RewardManager.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- Imports for UUPS (Upgradeable) Pattern ---
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
// --- Standard Imports ---
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

// --- Import Interfaces and Contracts ---
import "./IInterfaces.sol";
import "./BKCToken.sol";
/**
 * @title RewardManager (V3 - UUPS Spoke)
 * @author Gemini AI (Based on original contract)
 * @dev This UUPS contract is a "Spoke" that issues Vesting Certificate NFTs.
 */
contract RewardManager is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    ERC721EnumerableUpgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;
    // --- Core Contracts ---
    IEcosystemManager public ecosystemManager;
    BKCToken public bkcToken;
    IDelegationManager public delegationManager;
    address public miningManagerAddress;
    // --- Tokenomic Constants ---
    uint256 public constant VESTING_DURATION = 5 * 365 days;
    uint256 public constant INITIAL_PENALTY_BIPS = 5000;

    // --- State ---
    CountersUpgradeable.Counter private _tokenIdCounter;
    string private _baseTokenURI;
    struct VestingPosition {
        uint256 totalAmount;
        uint256 startTime;
    }
    mapping(uint256 => VestingPosition) public vestingPositions;
    
    // --- Events ---
    event VestingCertificateCreated(
        uint256 indexed tokenId,
        address indexed recipient,
        uint256 netAmount,
        uint256 bonusAmount
    );
    event CertificateWithdrawn(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 amountToOwner,
        uint256 penaltyAmount
    );
    event BaseURISet(string newBaseURI);

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
        // ✅ CORREÇÃO (Aviso): Ordem dos inicializadores corrigida
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init(); // Movido para cima
        __ERC721_init("Backchain Vesting Certificate", "BKCV");
        __ERC721Enumerable_init();
        // ❌ __ReentrancyGuard_init(); (Removido da posição antiga)

        require(
            _ecosystemManagerAddress != address(0),
            "RM: EcosystemManager cannot be zero"
        );
        require(_initialOwner != address(0), "RM: Invalid owner address");
        
        ecosystemManager = IEcosystemManager(_ecosystemManagerAddress);

        address _bkcTokenAddress = ecosystemManager.getBKCTokenAddress();
        address _dmAddress = ecosystemManager.getDelegationManagerAddress();
        address _miningManagerAddr = ecosystemManager.getMiningManagerAddress();

        require(
            _bkcTokenAddress != address(0) &&
                _dmAddress != address(0) &&
                _miningManagerAddr != address(0),
            "RM: Core contracts not set in Brain"
        );
        bkcToken = BKCToken(_bkcTokenAddress);
        delegationManager = IDelegationManager(_dmAddress);
        miningManagerAddress = _miningManagerAddr;
        
        _transferOwnership(_initialOwner);
    }

    // --- 1. Core Function: Create Vesting Certificate ---

    /**
     * @notice Creates a new Vesting Certificate NFT.
     */
    function createVestingCertificate(
        address _recipient,
        uint256 _grossAmount
    ) external nonReentrant {
        require(_grossAmount > 0, "RM: Amount must be greater than zero");
        require(_recipient != address(0), "RM: Invalid recipient");

        // --- 1. Fee Calculation ---
        uint256 feeAmount = _calculatePStakeFee(_grossAmount);
        uint256 purchaseAmount = _grossAmount - feeAmount;
        require(purchaseAmount > 0, "RM: Amount after fee is zero");

        address treasury = ecosystemManager.getTreasuryAddress();
        require(treasury != address(0), "RM: Treasury not set in Brain");

        // --- 2. Fund Transfer ---
        require(
            bkcToken.transferFrom(msg.sender, address(this), _grossAmount),
            "RM: Token transfer failed"
        );
        if (feeAmount > 0) {
            require(
                bkcToken.transfer(treasury, feeAmount),
                "RM: Fee transfer to treasury failed"
            );
        }

        // --- 3. Call the Guardian (MiningManager) ---
        require(
            bkcToken.approve(miningManagerAddress, purchaseAmount),
            "RM: Mining approve failed"
        );
        uint256 certificateBonus = IMiningManager(miningManagerAddress)
            .performPurchaseMining("VESTING_SERVICE", purchaseAmount);
        // --- 4. Mint NFT ---
        uint256 finalVestingAmount = purchaseAmount + certificateBonus;
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        vestingPositions[tokenId] = VestingPosition({
            totalAmount: finalVestingAmount,
            startTime: block.timestamp
        });
        _safeMint(_recipient, tokenId);

        emit VestingCertificateCreated(
            tokenId,
            _recipient,
            purchaseAmount,
            certificateBonus
        );
    }

    // --- 2. Core Function: Withdraw Certificate ---

    /**
     * @notice Withdraws the BKC from a Vesting Certificate.
     */
    function withdraw(uint256 _tokenId, uint256 _boosterTokenId)
        external
        nonReentrant
    {
        require(
            ownerOf(_tokenId) == msg.sender,
            "RM: Caller is not token owner"
        );
        VestingPosition storage pos = vestingPositions[_tokenId];
        require(
            pos.totalAmount > 0,
            "RM: Certificate already withdrawn or invalid"
        );
        // --- 1. Calculate Base Penalty ---
        uint256 timeElapsed = block.timestamp - pos.startTime;
        uint256 penaltyBips = 0;

        if (timeElapsed < VESTING_DURATION) {
            uint256 remainingTime = VESTING_DURATION - timeElapsed;
            penaltyBips = (INITIAL_PENALTY_BIPS * remainingTime) / VESTING_DURATION;
        }

        // --- 2. Apply Booster Discount ---
        if (_boosterTokenId > 0 && penaltyBips > 0) {
            address boosterAddress = ecosystemManager.getBoosterAddress();
            if (boosterAddress != address(0)) {
                try IRewardBoosterNFT(boosterAddress).ownerOf(_boosterTokenId)
                returns (address owner) {
                    if (owner == msg.sender) {
                        uint256 boostBips = IRewardBoosterNFT(boosterAddress)
                            .boostBips(_boosterTokenId);
                        uint256 discountBips = ecosystemManager
                            .getBoosterDiscount(boostBips);
                        if (discountBips > 0) {
                            penaltyBips = (penaltyBips > discountBips)
                                ? penaltyBips - discountBips
                                : 0;
                        }
                    }
                } catch {}
            }
        }

        // --- 3. Calculate Final Amounts ---
        (
            uint256 amountToOwner,
            uint256 penaltyAmount
        ) = _calculateWithdrawalAmounts(pos, penaltyBips);
        // --- 4. Execute Withdrawal ---
        delete vestingPositions[_tokenId];
        _burn(_tokenId);
        if (penaltyAmount > 0) {
            bkcToken.approve(address(delegationManager), penaltyAmount);
            delegationManager.depositRewards(0, penaltyAmount);
        }

        if (amountToOwner > 0) {
            require(
                bkcToken.transfer(msg.sender, amountToOwner),
                "RM: Failed to transfer withdrawal amount"
            );
        }

        emit CertificateWithdrawn(
            _tokenId,
            msg.sender,
            amountToOwner,
            penaltyAmount
        );
    }

    // --- 3. Internal & View Functions ---

    /**
     * @notice (Internal) Calculates the pStake-based fee.
     */
    function _calculatePStakeFee(uint256 _grossAmount)
        internal
        view
        returns (uint256)
    {
        uint256 feeAmount = 0;
        uint256 userPStake = delegationManager.userTotalPStake(msg.sender);
        uint256 totalPStake = delegationManager.totalNetworkPStake();

        if (totalPStake > 0) {
            uint256 userShareBIPS = (userPStake * 10000) / totalPStake;
            if (userShareBIPS < 10) {
                feeAmount = (_grossAmount * 5) / 100;
            } else if (userShareBIPS < 100) {
                feeAmount = (_grossAmount * 2) / 100;
            }
        } else {
            feeAmount = (_grossAmount * 5) / 100;
        }
        return feeAmount;
    }

    /**
     * @notice (Internal) Calculates final withdrawal and penalty amounts.
     */
    function _calculateWithdrawalAmounts(
        VestingPosition memory _pos,
        uint256 _penaltyBips
    ) internal pure returns (uint256 amountToOwner, uint256 penaltyAmount) {
        if (_penaltyBips == 0) {
            return (_pos.totalAmount, 0);
        }

        penaltyAmount = (_pos.totalAmount * _penaltyBips) / 10000;
        amountToOwner = _pos.totalAmount - penaltyAmount;
    }

    // --- 4. Admin and View Functions ---

    /**
     * @notice (Owner) Sets the base URI for token metadata.
     */
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
        emit BaseURISet(newBaseURI);
    }

    /**
     * @notice (View) Returns the metadata URI for a given token ID.
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        require(_exists(tokenId), "ERC721: URI query for nonexistent token");
        return string(abi.encodePacked(_baseTokenURI, "vesting_cert.json"));
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
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