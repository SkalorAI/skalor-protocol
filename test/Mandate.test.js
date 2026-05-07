const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const ONE_USDC = 10n ** 6n;

describe("Mandate", function () {
  let usdc, mandate, factory;
  let deployer, agent, controller, vendorA, vendorB, stranger;

  const PER_TX = 100n * ONE_USDC;        // $100 per tx
  const DAILY = 500n * ONE_USDC;          // $500 per day
  const FUND_AMOUNT = 1_000n * ONE_USDC;  // $1,000 deposited

  beforeEach(async function () {
    [deployer, agent, controller, vendorA, vendorB, stranger] = await ethers.getSigners();

    const TestERC20 = await ethers.getContractFactory("TestERC20");
    usdc = await TestERC20.deploy();

    const Mandate = await ethers.getContractFactory("Mandate");
    mandate = await Mandate.deploy(
      await usdc.getAddress(),
      agent.address,
      controller.address,
      PER_TX,
      DAILY,
      [vendorA.address]
    );

    const MandateFactory = await ethers.getContractFactory("MandateFactory");
    factory = await MandateFactory.deploy();

    await usdc.mint(deployer.address, FUND_AMOUNT);
    await usdc.connect(deployer).approve(await mandate.getAddress(), FUND_AMOUNT);
    await mandate.connect(deployer).deposit(FUND_AMOUNT);
  });

  describe("deployment", function () {
    it("sets immutable config correctly", async function () {
      expect(await mandate.usdc()).to.equal(await usdc.getAddress());
      expect(await mandate.agent()).to.equal(agent.address);
      expect(await mandate.controller()).to.equal(controller.address);
      expect(await mandate.perTxLimit()).to.equal(PER_TX);
      expect(await mandate.dailyLimit()).to.equal(DAILY);
      expect(await mandate.paused()).to.equal(false);
    });

    it("seeds initial counterparty allowlist", async function () {
      expect(await mandate.allowedCounterparties(vendorA.address)).to.equal(true);
      expect(await mandate.allowedCounterparties(vendorB.address)).to.equal(false);
    });

    it("rejects zero addresses in constructor", async function () {
      const Mandate = await ethers.getContractFactory("Mandate");
      await expect(
        Mandate.deploy(ethers.ZeroAddress, agent.address, controller.address, PER_TX, DAILY, [])
      ).to.be.revertedWithCustomError(mandate, "ZeroAddress");
    });
  });

  describe("deposit", function () {
    it("accepts deposits and emits Deposited", async function () {
      await usdc.mint(stranger.address, ONE_USDC);
      await usdc.connect(stranger).approve(await mandate.getAddress(), ONE_USDC);
      await expect(mandate.connect(stranger).deposit(ONE_USDC))
        .to.emit(mandate, "Deposited")
        .withArgs(stranger.address, ONE_USDC);
      expect(await mandate.balance()).to.equal(FUND_AMOUNT + ONE_USDC);
    });

    it("rejects zero deposit", async function () {
      await expect(mandate.connect(stranger).deposit(0n))
        .to.be.revertedWithCustomError(mandate, "ZeroAmount");
    });
  });

  describe("spend — happy path", function () {
    it("transfers USDC, increments dailySpent + nonce, emits Spent", async function () {
      const intent = ethers.keccak256(ethers.toUtf8Bytes("buy 1 OpenAI API credit"));
      const before = await usdc.balanceOf(vendorA.address);
      await expect(mandate.connect(agent).spend(vendorA.address, 50n * ONE_USDC, intent))
        .to.emit(mandate, "Spent")
        .withArgs(vendorA.address, 50n * ONE_USDC, intent, 1n);
      expect(await usdc.balanceOf(vendorA.address)).to.equal(before + 50n * ONE_USDC);
      expect(await mandate.dailySpent()).to.equal(50n * ONE_USDC);
      expect(await mandate.spendNonce()).to.equal(1n);
    });
  });

  describe("spend — revert paths", function () {
    const intent = ethers.keccak256(ethers.toUtf8Bytes("test"));

    it("reverts when paused", async function () {
      await mandate.connect(controller).pause();
      await expect(mandate.connect(agent).spend(vendorA.address, ONE_USDC, intent))
        .to.be.revertedWithCustomError(mandate, "MandatePaused");
    });

    it("reverts when caller is not the agent", async function () {
      await expect(mandate.connect(stranger).spend(vendorA.address, ONE_USDC, intent))
        .to.be.revertedWithCustomError(mandate, "OnlyAgent");
    });

    it("reverts when counterparty is not allowlisted", async function () {
      await expect(mandate.connect(agent).spend(vendorB.address, ONE_USDC, intent))
        .to.be.revertedWithCustomError(mandate, "CounterpartyNotAllowed")
        .withArgs(vendorB.address);
    });

    it("reverts when amount exceeds per-tx limit", async function () {
      const tooMuch = PER_TX + 1n;
      await expect(mandate.connect(agent).spend(vendorA.address, tooMuch, intent))
        .to.be.revertedWithCustomError(mandate, "PerTxLimitExceeded")
        .withArgs(tooMuch, PER_TX);
    });

    it("reverts when amount exceeds remaining daily budget", async function () {
      // five $100 txs = $500 = daily cap
      for (let i = 0; i < 5; i++) {
        await mandate.connect(agent).spend(vendorA.address, PER_TX, intent);
      }
      expect(await mandate.dailySpent()).to.equal(DAILY);
      await expect(mandate.connect(agent).spend(vendorA.address, ONE_USDC, intent))
        .to.be.revertedWithCustomError(mandate, "DailyLimitExceeded")
        .withArgs(ONE_USDC, 0n);
    });

    it("reverts on zero amount", async function () {
      await expect(mandate.connect(agent).spend(vendorA.address, 0n, intent))
        .to.be.revertedWithCustomError(mandate, "ZeroAmount");
    });
  });

  describe("daily rollover", function () {
    it("resets dailySpent after a new day starts", async function () {
      const intent = ethers.keccak256(ethers.toUtf8Bytes("d1"));
      await mandate.connect(agent).spend(vendorA.address, PER_TX, intent);
      expect(await mandate.dailySpent()).to.equal(PER_TX);

      await time.increase(24 * 60 * 60 + 1);

      await mandate.connect(agent).spend(vendorA.address, PER_TX, intent);
      expect(await mandate.dailySpent()).to.equal(PER_TX);
    });

    it("remainingDailyBudget reflects rollover even before a tx", async function () {
      const intent = ethers.keccak256(ethers.toUtf8Bytes("rb"));
      await mandate.connect(agent).spend(vendorA.address, PER_TX, intent);
      expect(await mandate.remainingDailyBudget()).to.equal(DAILY - PER_TX);

      await time.increase(24 * 60 * 60 + 1);
      expect(await mandate.remainingDailyBudget()).to.equal(DAILY);
    });
  });

  describe("controller actions", function () {
    it("only controller can pause / unpause", async function () {
      await expect(mandate.connect(stranger).pause())
        .to.be.revertedWithCustomError(mandate, "OnlyController");
      await expect(mandate.connect(controller).pause())
        .to.emit(mandate, "Paused").withArgs(controller.address);
      await expect(mandate.connect(controller).unpause())
        .to.emit(mandate, "Unpaused").withArgs(controller.address);
    });

    it("only controller can update limits", async function () {
      await expect(mandate.connect(stranger).setLimits(1n, 2n))
        .to.be.revertedWithCustomError(mandate, "OnlyController");
      await expect(mandate.connect(controller).setLimits(7n * ONE_USDC, 70n * ONE_USDC))
        .to.emit(mandate, "LimitsUpdated").withArgs(7n * ONE_USDC, 70n * ONE_USDC);
      expect(await mandate.perTxLimit()).to.equal(7n * ONE_USDC);
      expect(await mandate.dailyLimit()).to.equal(70n * ONE_USDC);
    });

    it("controller can add and remove counterparties", async function () {
      await expect(mandate.connect(controller).allowCounterparty(vendorB.address))
        .to.emit(mandate, "CounterpartyAllowed").withArgs(vendorB.address);
      expect(await mandate.allowedCounterparties(vendorB.address)).to.equal(true);

      await expect(mandate.connect(controller).removeCounterparty(vendorB.address))
        .to.emit(mandate, "CounterpartyRemoved").withArgs(vendorB.address);
      expect(await mandate.allowedCounterparties(vendorB.address)).to.equal(false);
    });

    it("only controller can withdraw", async function () {
      await expect(mandate.connect(stranger).withdraw(stranger.address, ONE_USDC))
        .to.be.revertedWithCustomError(mandate, "OnlyController");
      const before = await usdc.balanceOf(controller.address);
      await expect(mandate.connect(controller).withdraw(controller.address, 10n * ONE_USDC))
        .to.emit(mandate, "Withdrawn").withArgs(controller.address, 10n * ONE_USDC);
      expect(await usdc.balanceOf(controller.address)).to.equal(before + 10n * ONE_USDC);
    });
  });

  describe("MandateFactory", function () {
    it("deploys a Mandate and emits MandateDeployed", async function () {
      const tx = await factory.deployMandate(
        await usdc.getAddress(),
        agent.address,
        controller.address,
        PER_TX,
        DAILY,
        [vendorA.address]
      );
      const receipt = await tx.wait();
      const ev = receipt.logs.find(l => l.fragment && l.fragment.name === "MandateDeployed");
      expect(ev).to.not.equal(undefined);
      expect(ev.args.agent).to.equal(agent.address);
      expect(ev.args.controller).to.equal(controller.address);
      expect(ev.args.perTxLimit).to.equal(PER_TX);
      expect(ev.args.dailyLimit).to.equal(DAILY);

      const newMandate = await ethers.getContractAt("Mandate", ev.args.mandate);
      expect(await newMandate.agent()).to.equal(agent.address);
      expect(await newMandate.allowedCounterparties(vendorA.address)).to.equal(true);
    });
  });
});
