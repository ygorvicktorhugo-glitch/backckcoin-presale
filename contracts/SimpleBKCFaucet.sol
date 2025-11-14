// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- Imports para a versão Upgradeable ---
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol"; // <-- ADICIONADO

/**
 * @title SimpleBKCFaucet (Upgradeable)
 * @author Gemini AI (Based on original contract)
 * @dev Faucet converted to UUPS pattern to standardize the ecosystem.
 * @notice Allows any address to claim a fixed amount of tokens.
 * @notice DO NOT deploy on mainnet with real funds. This is for testnets only.
 */
contract SimpleBKCFaucet is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable // <-- ADICIONADO
{
    /** @notice The ERC20 token this faucet will distribute (BKC).
     */
    IERC20Upgradeable public token;

    /** @notice The fixed amount of tokens (in Wei) given per claim.
     */
    uint256 public constant claimAmount = 100 * 10**18;
    // 100 BKC

    /** @notice Emitted when a user claims tokens.
     */
    event TokensClaimed(address indexed recipient, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializer for the Upgradeable contract.
     * @param _tokenAddress The address of the BKC token.
     */
    function initialize(
        address _tokenAddress,
        address /* _initialOwner */ // Parameter commented out to silence warning.
    ) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init(); // <-- ADICIONADO

        require(_tokenAddress != address(0), "Faucet: Invalid token address");
        token = IERC20Upgradeable(_tokenAddress);
    }

    /**
     * @notice Allows any user to claim the defined amount of tokens.
     * @dev Checks if the faucet has sufficient funds before sending.
     */
    function claim() external nonReentrant {
        require(
            token.balanceOf(address(this)) >= claimAmount,
            "Faucet: Insufficient funds in faucet"
        );
        // Transfer the tokens
        bool sent = token.transfer(msg.sender, claimAmount);
        require(sent, "Faucet: Token transfer failed");

        // Emit the event
        emit TokensClaimed(msg.sender, claimAmount);
    }

    /**
     * @notice (Owner) Allows the owner to withdraw all remaining BKC tokens.
     * @dev Use this to recover remaining funds after testing is complete.
     */
    function withdrawRemainingTokens() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            bool sent = token.transfer(owner(), balance);
            require(sent, "Faucet: Withdrawal transfer failed");
        }
    }

    /**
     * @notice (Owner) Allows the owner to withdraw any native currency (e.g., ETH/BNB)
     * accidentally sent to this contract.
     */
    function withdrawNativeCurrency() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = owner().call{value: balance}("");
            require(success, "Faucet: Native currency withdrawal failed");
        }
    }

    /**
     * @dev Authorizes an upgrade to a new implementation, restricted to the owner.
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}

    /**
     * @dev Fallback function to reject direct native currency sends.
     */
    receive() external payable {
        revert("Faucet: Contract does not accept native currency");
    }
}