// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- Imports for Upgradeable Pattern ---
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract BKCToken is Initializable, ERC20Upgradeable, OwnableUpgradeable {
    // --- Token Constants (Fundamental) ---
    uint256 public constant MAX_SUPPLY = 200000000 * 10**18;
    uint256 public constant TGE_SUPPLY = 40000000 * 10**18; // 40 million for liquidity/TGE

    // REMOVIDO O CONSTRUCTOR QUE CAUSA O ERRO DE SEGURANÇA.
    // constructor() {
    //     _disableInitializers();
    // }

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