// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- Imports para a versão Upgradeable ---
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title SimpleBKCFaucet (Upgradeable)
 * @author Gemini AI (Based on original contract)
 * @dev Faucet convertido para o padrão Upgradeable para uniformizar o ecossistema.
 * @notice Permite a qualquer endereço reivindicar uma quantidade fixa de tokens.
 * @notice DO NOT deploy on mainnet with real funds. This is for testnets only.
 */
contract SimpleBKCFaucet is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    
    /** @notice O token ERC20 que este faucet irá distribuir (BKC).
     */
    IERC20Upgradeable public token; // Removido 'immutable'

    /** @notice A quantidade fixa de tokens (em Wei) dada por reivindicação.
     */
    uint256 public constant claimAmount = 100 * 10**18; // 100 BKC 

    /** @notice Emitido quando um usuário reivindica tokens.
     */
    event TokensClaimed(address indexed recipient, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Inicializador para o contrato Upgradeable.
     * @param _tokenAddress O endereço do token BKC. 
     * @param _initialOwner O endereço do seu MultiSig.
     */
    function initialize(
        address _tokenAddress,
        address _initialOwner
    ) public initializer {
        // CORRIGIDO: __Ownable_init() agora não aceita argumentos.
        __Ownable_init(); 
        __ReentrancyGuard_init();

        require(_tokenAddress != address(0), "Faucet: Invalid token address");
        token = IERC20Upgradeable(_tokenAddress); 
    }

    /**
     * @notice Permite a qualquer usuário reivindicar a quantidade definida de tokens.
     * @dev Verifica se o faucet tem fundos suficientes antes de enviar.
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
     * @notice (Owner) Permite ao proprietário retirar todos os tokens BKC restantes.
     * @dev Use isso para recuperar fundos restantes após a conclusão dos testes.
     */
    function withdrawRemainingTokens() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) { 
            bool sent = token.transfer(owner(), balance);
            require(sent, "Faucet: Withdrawal transfer failed"); 
        }
    }

    /**
     * @notice (Owner) Permite ao proprietário retirar qualquer moeda nativa (ex: ETH/BNB)
     * acidentalmente enviada para este contrato.
     */
    function withdrawNativeCurrency() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) { 
            (bool success, ) = owner().call{value: balance}("");
            require(success, "Faucet: Native currency withdrawal failed"); 
        }
    }

    /**
     * @dev Função de fallback para rejeitar envios diretos de moeda nativa.
     */
    receive() external payable {
        revert("Faucet: Contract does not accept native currency");
    }
}