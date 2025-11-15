// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- Imports para a versão Upgradeable ---
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract SimpleBKCFaucet is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    IERC20Upgradeable public token;
    uint256 public constant claimAmount = 100 * 10**18;

    event TokensClaimed(address indexed recipient, uint256 amount);

    // REMOVIDO O CONSTRUCTOR QUE CAUSAVA O ERRO DE SEGURANÇA.
    // constructor() {
    //     _disableInitializers();
    // }

    function initialize(
        address _tokenAddress,
        address _initialOwner
    ) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        require(_tokenAddress != address(0), "Faucet: Invalid token address");
        token = IERC20Upgradeable(_tokenAddress);
        
        _transferOwnership(_initialOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function claim() external nonReentrant {
        require(
            token.balanceOf(address(this)) >= claimAmount,
            "Faucet: Insufficient funds in faucet"
        );
        
        bool sent = token.transfer(msg.sender, claimAmount);
        require(sent, "Faucet: Token transfer failed");

        emit TokensClaimed(msg.sender, claimAmount);
    }

    function withdrawRemainingTokens() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            bool sent = token.transfer(owner(), balance);
            require(sent, "Faucet: Withdrawal transfer failed");
        }
    }

    function withdrawNativeCurrency() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = owner().call{value: balance}("");
            require(success, "Faucet: Native currency withdrawal failed");
        }
    }

    receive() external payable {
        revert("Faucet: Contract does not accept native currency");
    }
}