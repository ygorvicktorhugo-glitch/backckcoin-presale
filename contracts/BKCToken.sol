// contracts/BKCToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- Imports for Upgradeable Pattern ---
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
/**
 * @title BKCToken (Upgradeable)
 * @author Gemini AI (Based on original contract)
 * @dev Main token contract, implemented with the Upgradeable pattern.
 * @notice TGE supply minting is moved to the launch script (3_launch_and_liquidate_ecosystem.ts).
 */
contract BKCToken is Initializable, ERC20Upgradeable, OwnableUpgradeable {
    // --- Token Constants (Fundamental) ---
    uint256 public constant MAX_SUPPLY = 200_000_000 * 10**18;
    uint256 public constant TGE_SUPPLY = 40_000_000 * 10**18; // 40 million for liquidity/TGE

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializer for the Upgradeable contract.
     * @param _initialOwner The initial owner of the contract (the Deployer, temporarily).
     */
    function initialize(
        address _initialOwner
    ) public initializer {
        __ERC20_init("Backcoin", "BKC");
        __Ownable_init();
        
        require(
            _initialOwner != address(0),
            "BKC: Owner address cannot be zero address"
        );
        
        // Transfers ownership to the _initialOwner (the Deployer in Step 1)
        _transferOwnership(_initialOwner);
        
        // !!! REMOVED: TGE_SUPPLY minting moved to script 3 for security !!!
    }

    // --- Mint Function (For the MiningManager) ---

    /**
     * @dev Allows the owner (the MiningManager) to mint new tokens up to MAX_SUPPLY.
     * @param to The address to mint the tokens to.
     * @param amount The amount of tokens to mint (in Wei).
     */
    function mint(address to, uint256 amount) public onlyOwner {
        require(
            totalSupply() + amount <= MAX_SUPPLY,
            "BKC: Exceeds max supply"
        );
        _mint(to, amount);
    }
}