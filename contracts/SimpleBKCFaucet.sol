// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19; 

// Imports with the correct path for OZ v5.x
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SimpleBKCFaucet
 * @dev A simple faucet to distribute BKC tokens for testing purposes.
 * @notice AJUSTADO: Permite múltiplos claims de 100 BKC por endereço.
 */
contract SimpleBKCFaucet is Ownable, ReentrancyGuard {
    IERC20 public immutable token;
    
    // --- AJUSTE CRÍTICO: 100 BKC por claim ---
    uint256 public immutable claimAmount = 100 * 10**18; 
    // --- FIM DO AJUSTE ---

    // REMOVIDO: O mapeamento 'hasClaimed' para permitir múltiplos claims.
    
    // Event emitted when someone claims tokens
    event TokensClaimed(address indexed recipient, uint256 amount);

    /**
     * @dev Contract constructor.
     * @param _tokenAddress The address of the ERC20 token contract (BKC).
     */
    constructor(address _tokenAddress) Ownable(msg.sender) {
        require(_tokenAddress != address(0), "Faucet: Invalid token address");
        token = IERC20(_tokenAddress);
    }

    /**
     * @dev Allows a user to claim the defined amount of tokens, multiple times.
     * Ensures the faucet has funds and uses nonReentrant.
     */
    function claim() external nonReentrant {
        require(token.balanceOf(address(this)) >= claimAmount, "Faucet: Insufficient funds in faucet");
        
        // Transfer the tokens
        bool sent = token.transfer(msg.sender, claimAmount);
        require(sent, "Faucet: Token transfer failed");

        // Emit the event
        emit TokensClaimed(msg.sender, claimAmount);
    }

    /**
     * @dev Allows the contract owner to withdraw all remaining BKC tokens.
     */
    function withdrawRemainingTokens() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            bool sent = token.transfer(msg.sender, balance);
            require(sent, "Faucet: Withdrawal transfer failed");
        }
    }

    /**
     * @dev Fallback function to reject direct ETH sends to the contract.
     */
    receive() external payable {
        revert("Faucet: Contract does not accept ETH");
    }

    /**
     * @dev Allows the owner to withdraw any ETH accidentally sent to the contract.
     */
    function withdrawETH() external onlyOwner {
         (bool success, ) = owner().call{value: address(this).balance}("");
         require(success, "Faucet: ETH withdrawal failed");
    }
}