// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- Imports para a versão Upgradeable ---
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title BKCToken (Upgradeable)
 * @author Gemini AI (Based on original contract)
 * @dev Contrato do token principal, agora implementado com o padrão Upgradeable
 * para uniformizar com o resto do ecossistema.
 * @notice O suprimento TGE é mintado no 'initialize'.
 */
contract BKCToken is Initializable, ERC20Upgradeable, OwnableUpgradeable {
    // --- Token Constants (Fundamental) ---
    uint256 public constant MAX_SUPPLY = 200_000_000 * 10**18;
    uint256 public constant TGE_SUPPLY = 40_000_000 * 10**18;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Inicializador para o contrato Upgradeable.
     * @param _initialOwner O proprietário inicial do contrato (que será o MiningManager)
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
        
        // Transfere ownership para o _initialOwner
        _transferOwnership(_initialOwner);
        
        // Mintar o suprimento TGE para o endereço _initialOwner (o Guardian/MiningManager)
        _mint(_initialOwner, TGE_SUPPLY);
    }

    // --- Mint Function (Para o MiningManager) ---

    /**
     * @dev Permite ao proprietário (o MiningManager) criar novos tokens até MAX_SUPPLY.
     * @param to O endereço para onde mintar os tokens.
     * @param amount A quantidade de tokens a mintar (em Wei).
     */
    function mint(address to, uint256 amount) public onlyOwner {
        require(
            totalSupply() + amount <= MAX_SUPPLY,
            "BKC: Exceeds max supply"
        );
        _mint(to, amount);
    }
}