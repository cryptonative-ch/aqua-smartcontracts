// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../utils/cloneFactory.sol";
import "../interfaces/IAuction.sol";

contract AuctionLauncher is CloneFactory {
    bool private initialised;

    struct Auction {
        bool exists;
        uint256 templateId;
        uint256 index;
    }

    address[] public auctions;

    uint256 public auctionTemplateId;

    mapping(uint256 => address) private auctionTemplates;

    mapping(address => uint256) private auctionTemplateToId;

    mapping(address => Auction) public auctionInfo;

    uint256 public minimumFee;
    uint256 public tokenFee;

    event AuctionTemplateAdded(address newAuction, uint256 templateId);

    event AuctionTemplateRemoved(address auction, uint256 templateId);

    event AuctionCreated(
        address indexed owner,
        address indexed addr,
        address template
    );

    function initAuctionLauncher(address[] memory _templates) external {
        require(!initialised);

        auctionTemplateId = 0;
        for (uint256 i = 0; i < _templates.length; i++) {
            _addAuctionTemplate(_templates[i]);
        }

        initialised = true;
    }

    function setMinimumFee(uint256 _amount) public {
        minimumFee = _amount;
    }

    function setTokenFee(uint256 _amount) public {
        tokenFee = _amount;
    }

    function deployMarket(uint256 _templateId)
        public
        payable
        returns (address newAuction)
    {
        require(msg.value >= minimumFee, "Failed to transfer minimumFee");
        require(auctionTemplates[_templateId] != address(0));
        newAuction = createClone(auctionTemplates[_templateId]);
        auctionInfo[address(newAuction)] = Auction(
            true,
            _templateId,
            auctions.length - 1
        );
        auctions.push(address(newAuction));
        emit AuctionCreated(
            msg.sender,
            address(newAuction),
            auctionTemplates[_templateId]
        );
    }

    function createAuction(
        uint256 _templateId,
        address _tokenOut,
        uint256 _tokenOutAmount,
        address _auctionManager,
        bytes calldata _data
    ) external returns (address newAuction) {
        newAuction = deployMarket(_templateId);
        if (_tokenOutAmount > 0) {
            require(
                IERC20(_tokenOut).transferFrom(
                    msg.sender,
                    address(this),
                    _tokenOutAmount
                )
            );
            require(IERC20(_tokenOut).approve(newAuction, _tokenOutAmount));
        }
        IAuction(newAuction).init(_data);
        return newAuction;
    }

    // used by IDO project to withdraw raised tokens – allow to take fee
    function withdrawAuctionFunds() external {}

    function addAuctionTemplate(address _template) external {
        // ToDo: Permissions
        _addAuctionTemplate(_template);
    }

    function removeAuctionTemplate(uint256 _templateId) external {
        // ToDo: Permissions
        require(auctionTemplates[_templateId] != address(0));
        address template = auctionTemplates[_templateId];
        auctionTemplates[_templateId] = address(0);
        delete auctionTemplateToId[template];
        emit AuctionTemplateRemoved(template, _templateId);
    }

    function _addAuctionTemplate(address _template) internal {
        // ToDo: Permissions
        auctionTemplateId++;
        auctionTemplates[auctionTemplateId] = _template;
        auctionTemplateToId[_template] = auctionTemplateId;
        emit AuctionTemplateAdded(_template, auctionTemplateId);
    }

    function getAuctionTemplate(uint256 _templateId)
        public
        view
        returns (address tokenTemplate)
    {
        return auctionTemplates[_templateId];
    }

    function getTemplateId(address _auctionTemplate)
        public
        view
        returns (uint256)
    {
        return auctionTemplateToId[_auctionTemplate];
    }

    function numberOfAuctions() public view returns (uint256) {
        return auctions.length;
    }
}
