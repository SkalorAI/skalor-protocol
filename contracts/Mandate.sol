// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title  Mandate
/// @notice On-chain spending mandate for an AI agent. USDC held here can only
///         be moved by the bound agent via `spend()`, subject to a per-tx limit,
///         a daily limit, a counterparty allowlist, and a controller kill switch.
/// @dev    Pairs with off-chain Skalor gates (anomaly detection, OFAC, HITL).
///         The chain is canonical truth — gates are advisory ML overlay that
///         can pause this mandate via the controller, but cannot bypass these
///         deterministic rules. This is the layer Sean Neville described as
///         missing: "guardrails without policy enforcement just become
///         suggestions."
contract Mandate {
    using SafeERC20 for IERC20;

    // --- immutable config ---
    IERC20 public immutable usdc;
    address public immutable agent;
    address public immutable controller;

    // --- limits (controller-mutable) ---
    uint256 public perTxLimit;
    uint256 public dailyLimit;

    // --- daily accounting ---
    uint256 public dailySpent;
    uint256 public lastResetDay;

    // --- state ---
    bool public paused;
    uint256 public spendNonce;

    // --- allowlist ---
    mapping(address => bool) public allowedCounterparties;

    // --- events ---
    event Spent(address indexed to, uint256 amount, bytes32 indexed intentHash, uint256 indexed nonce);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event LimitsUpdated(uint256 perTxLimit, uint256 dailyLimit);
    event CounterpartyAllowed(address indexed counterparty);
    event CounterpartyRemoved(address indexed counterparty);
    event Withdrawn(address indexed to, uint256 amount);
    event Deposited(address indexed from, uint256 amount);

    // --- errors ---
    error MandatePaused();
    error OnlyAgent();
    error OnlyController();
    error PerTxLimitExceeded(uint256 amount, uint256 limit);
    error DailyLimitExceeded(uint256 attempted, uint256 remaining);
    error CounterpartyNotAllowed(address counterparty);
    error ZeroAmount();
    error ZeroAddress();

    modifier onlyAgent() {
        if (msg.sender != agent) revert OnlyAgent();
        _;
    }

    modifier onlyController() {
        if (msg.sender != controller) revert OnlyController();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert MandatePaused();
        _;
    }

    constructor(
        IERC20 _usdc,
        address _agent,
        address _controller,
        uint256 _perTxLimit,
        uint256 _dailyLimit,
        address[] memory _initialCounterparties
    ) {
        if (address(_usdc) == address(0) || _agent == address(0) || _controller == address(0)) {
            revert ZeroAddress();
        }
        usdc = _usdc;
        agent = _agent;
        controller = _controller;
        perTxLimit = _perTxLimit;
        dailyLimit = _dailyLimit;
        lastResetDay = block.timestamp / 1 days;
        for (uint256 i = 0; i < _initialCounterparties.length; i++) {
            address cp = _initialCounterparties[i];
            if (cp == address(0)) revert ZeroAddress();
            allowedCounterparties[cp] = true;
            emit CounterpartyAllowed(cp);
        }
    }

    /// @notice Deposit USDC into the mandate. Caller must approve first.
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /// @notice Spend USDC to an allowed counterparty.
    /// @param to         Counterparty (must be allowlisted).
    /// @param amount     USDC amount in 6-decimal units.
    /// @param intentHash keccak256 of the human-readable intent string.
    function spend(address to, uint256 amount, bytes32 intentHash)
        external
        onlyAgent
        whenNotPaused
    {
        if (amount == 0) revert ZeroAmount();
        if (!allowedCounterparties[to]) revert CounterpartyNotAllowed(to);
        if (amount > perTxLimit) revert PerTxLimitExceeded(amount, perTxLimit);

        uint256 today = block.timestamp / 1 days;
        if (today > lastResetDay) {
            dailySpent = 0;
            lastResetDay = today;
        }

        uint256 remaining = dailyLimit > dailySpent ? dailyLimit - dailySpent : 0;
        if (amount > remaining) revert DailyLimitExceeded(amount, remaining);
        dailySpent += amount;

        uint256 nonce = ++spendNonce;
        usdc.safeTransfer(to, amount);
        emit Spent(to, amount, intentHash, nonce);
    }

    // --- controller actions ---

    function pause() external onlyController {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyController {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setLimits(uint256 _perTxLimit, uint256 _dailyLimit) external onlyController {
        perTxLimit = _perTxLimit;
        dailyLimit = _dailyLimit;
        emit LimitsUpdated(_perTxLimit, _dailyLimit);
    }

    function allowCounterparty(address cp) external onlyController {
        if (cp == address(0)) revert ZeroAddress();
        allowedCounterparties[cp] = true;
        emit CounterpartyAllowed(cp);
    }

    function removeCounterparty(address cp) external onlyController {
        allowedCounterparties[cp] = false;
        emit CounterpartyRemoved(cp);
    }

    /// @notice Emergency withdraw to recover funds. Controller only.
    function withdraw(address to, uint256 amount) external onlyController {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    // --- views ---

    function balance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function remainingDailyBudget() external view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        if (today > lastResetDay) return dailyLimit;
        return dailyLimit > dailySpent ? dailyLimit - dailySpent : 0;
    }
}
