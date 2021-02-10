// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;

contract MesaFactory {

    event AuctionCreated(address indexed auction, uint256 templateId);
    event TemplateAdded(address indexed template, uint256 templateId);

    uint256 public feeNumerator;
    uint256 public auctionFee;
    address public feeTo;
    address public feeManager;
    address public templateManager;
    address public auctionCreator;
    address[] public allAuctions;
    uint256 public templateId;

    constructor(
        address _feeManager,
        address _feeTo,
        address _templateManager,
        address _auctionCreator,
        uint256 _feeNumerator,
        uint256 _auctionFee
    ) public {
        feeManager = _feeManager;
        feeTo = _feeTo;
        feeNumerator = _feeNumerator;
        templateManager = _templateManager;
        auctionCreator = _auctionCreator;
        auctionFee = _auctionFee;
    }

    function setFeeTo(address _feeTo) external {
        require(msg.sender == feeManager, "AuctionCreator: FORBIDDEN");
        feeTo = _feeTo;
    }

    function setFeeNumerator(uint256 _feeNumerator) external {
        require(msg.sender == feeManager, "AuctionCreator: FORBIDDEN");
        feeNumerator = _feeNumerator;
    }

    function setAuctionFee(uint256 _auctionFee) external {
        require(msg.sender == feeManager, "AuctionCreator: FORBIDDEN");
        auctionFee = _auctionFee;
    }

    function setFeeManager(address _feeManager) external {
        require(msg.sender == feeManager, "AuctionCreator: FORBIDDEN");
        feeManager = _feeManager;
    }

    function setTemplateManager(address _templateManager) external {
        require(msg.sender == templateManager, "AuctionCreator: FORBIDDEN");
        templateManager = _templateManager;
    }

    function setAuctionCreator(address _auctionCreator) external {
        require(msg.sender == templateManager, "AuctionCreator: FORBIDDEN");
        auctionCreator = _auctionCreator;
    }

    function addAuction(address _auction, uint256 _templateId) external {
      require(msg.sender == auctionCreator, "AuctionCreator: FORBIDDEN");
      allAuctions.push(_auction);
      emit AuctionCreated(_auction, _templateId);
    }

    function addTemplate(address _template) external returns (uint256 newTemplateId) {
      require(msg.sender == auctionCreator, "AuctionCreator: FORBIDDEN");
      newTemplateId = templateId;
      templateId++;
      emit TemplateAdded(_template, newTemplateId);
    }

    function numberOfAuctions() external view returns (uint256) {
        return allAuctions.length;
    }
}
