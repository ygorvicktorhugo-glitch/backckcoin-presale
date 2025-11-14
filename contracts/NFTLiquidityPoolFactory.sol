// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./NFTLiquidityPool.sol";
import "./IInterfaces.sol";

contract NFTLiquidityPoolFactory is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable
{
    address public poolImplementation;
    address public ecosystemManagerAddress;

    mapping(uint256 => address) public getPoolAddress;
    uint256[] public deployedBoostBips;

    event PoolImplementationSet(address indexed implementation);
    event EcosystemManagerSet(address indexed ecosystemManager);
    event PoolDeployed(uint256 indexed boostBips, address indexed poolAddress);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _initialOwner,
        address _ecosystemManagerAddress,
        address _poolImplementation
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        require(_initialOwner != address(0), "Factory: Invalid owner");
        require(_ecosystemManagerAddress != address(0), "Factory: Invalid Hub");
        require(_poolImplementation != address(0), "Factory: Invalid Implementation");
        
        ecosystemManagerAddress = _ecosystemManagerAddress;
        poolImplementation = _poolImplementation;
        
        _transferOwnership(_initialOwner);
    }

    function setEcosystemManager(address _ecosystemManagerAddress) external onlyOwner {
        require(_ecosystemManagerAddress != address(0), "Factory: Invalid Hub");
        ecosystemManagerAddress = _ecosystemManagerAddress;
        emit EcosystemManagerSet(_ecosystemManagerAddress);
    }

    function setPoolImplementation(address _poolImplementation) external onlyOwner {
        require(_poolImplementation != address(0), "Factory: Invalid Implementation");
        poolImplementation = _poolImplementation;
        emit PoolImplementationSet(_poolImplementation);
    }

    function deployPool(uint256 _boostBips) external onlyOwner {
        require(_boostBips > 0, "Factory: Invalid boostBips");
        require(getPoolAddress[_boostBips] == address(0), "Factory: Pool already exists");
        require(poolImplementation != address(0), "Factory: Implementation not set");

        address cloneAddress = Clones.clone(poolImplementation);
        
        NFTLiquidityPool(cloneAddress).initialize(
            owner(),
            ecosystemManagerAddress,
            _boostBips
        );

        getPoolAddress[_boostBips] = cloneAddress;
        deployedBoostBips.push(_boostBips);

        emit PoolDeployed(_boostBips, cloneAddress);
    }

    function deployedPoolsCount() external view returns (uint256) {
        return deployedBoostBips.length;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}