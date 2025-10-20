// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19; // Mantive a versão que você usou, compatível com OZ 5.x

// Importações com o caminho correto para OZ v5.x
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; // <--- CORREÇÃO AQUI

// Certifique-se de instalar as dependências:
// npm install @openzeppelin/contracts

contract SimpleBKCFaucet is Ownable, ReentrancyGuard {
    IERC20 public immutable token; // Endereço do token BKC, definido no deploy
    uint256 public immutable claimAmount = 12500 * 10**18; // 12.500 BKC com 18 decimais

    // Mapeamento para registrar quem já clamou
    mapping(address => bool) public hasClaimed;

    // Evento emitido quando alguém clama tokens
    event TokensClaimed(address indexed recipient, uint256 amount);

    /**
     * @dev Construtor do contrato.
     * @param _tokenAddress O endereço do contrato do token ERC20 (BKC).
     */
    constructor(address _tokenAddress) Ownable(msg.sender) {
        require(_tokenAddress != address(0), "Faucet: Invalid token address");
        token = IERC20(_tokenAddress);
    }

    /**
     * @dev Permite que um usuário clame a quantia definida de tokens, uma única vez.
     * Garante que o usuário não clamou antes e que o faucet tem fundos.
     * Usa nonReentrant para prevenir ataques de reentrância.
     */
    function claim() external nonReentrant {
        require(!hasClaimed[msg.sender], "Faucet: Address has already claimed tokens");
        require(token.balanceOf(address(this)) >= claimAmount, "Faucet: Insufficient funds in faucet");

        // Marca o usuário como tendo clamado *antes* da transferência
        hasClaimed[msg.sender] = true;

        // Transfere os tokens
        bool sent = token.transfer(msg.sender, claimAmount);
        require(sent, "Faucet: Token transfer failed");

        // Emite o evento
        emit TokensClaimed(msg.sender, claimAmount);
    }

    /**
     * @dev Permite que o dono do contrato retire todos os tokens BKC restantes.
     * Útil para recuperar fundos não utilizados ou mover para outro faucet.
     */
    function withdrawRemainingTokens() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            bool sent = token.transfer(msg.sender, balance);
            require(sent, "Faucet: Withdrawal transfer failed");
        }
    }

    /**
     * @dev Função fallback para rejeitar o envio direto de ETH ao contrato.
     */
    receive() external payable {
        revert("Faucet: Contract does not accept ETH");
    }

    /**
     * @dev Permite que o dono retire qualquer ETH enviado acidentalmente ao contrato.
     */
    function withdrawETH() external onlyOwner {
         (bool success, ) = owner().call{value: address(this).balance}("");
         require(success, "Faucet: ETH withdrawal failed");
    }
}