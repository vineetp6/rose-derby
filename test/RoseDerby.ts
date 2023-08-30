import {
    time,
    loadFixture,
  } from "@nomicfoundation/hardhat-toolbox/network-helpers";
  import { expect } from "chai";
  import { ethers } from "hardhat";

  describe("HorseRace", function () {

    async function deployRoseDerbyFixture() {
      //common race scheduled 1 hour later
      const postTime = (await time.latest()) + 60 * 60;

      const [owner, accountTwo, accountThree, accountFour] = await ethers.getSigners();
  
      const RoseDerby = await ethers.getContractFactory("RoseDerby");
      const roseDerby = await RoseDerby.deploy();

      const RoseDerbyTestNonDeterministic = await ethers.getContractFactory("RoseDerbyTestNonDeterministic");
      const roseDerbyNonDeterministic = await RoseDerbyTestNonDeterministic.deploy();

      const RoseDerbyTestDeterministic = await ethers.getContractFactory("RoseDerbyTestDeterministic");
      const roseDerbyDeterministic = await RoseDerbyTestDeterministic.deploy();
  
      return { roseDerby, roseDerbyNonDeterministic, roseDerbyDeterministic, owner, accountTwo, accountThree, accountFour, postTime };
    }
  
    describe("Deployment", () => {
      it("Should set the owner", async () => {
        const { roseDerbyNonDeterministic, owner } = await loadFixture(deployRoseDerbyFixture);

        expect(await roseDerbyNonDeterministic.getOwner()).to.equal(owner.address);
      });

      it("Should start with a zero balance", async () => {
        const { roseDerby } = await loadFixture(deployRoseDerbyFixture);

        expect(await ethers.provider.getBalance(roseDerby.target)).to.equal(0);
      });
    });

    describe("Scheduling races", () => {
      it("Should fail if you try to set a takeout amount greater than 100%", async () => {
        const { roseDerby, accountTwo, postTime } = await loadFixture(deployRoseDerbyFixture);

        await expect(roseDerby.connect(accountTwo)
          .scheduleRace(postTime, 97, 2))
          .to.be.revertedWith("Takeout adds up to more than 100%");
      });

      it("Should fail if the postTime is not in the future", async function () {
        const { roseDerby, accountTwo } = await loadFixture(deployRoseDerbyFixture);
        const latestTime = await time.latest();
        
        await expect(roseDerby.connect(accountTwo)
          .scheduleRace(latestTime, 2, 2))
          .to.be.revertedWith("Post time should be in the future");
      });

      it("Should set the right values on a new race and add it to the races array", async () => {
        const { roseDerby, accountTwo, postTime } = await loadFixture(deployRoseDerbyFixture);

        await roseDerby.connect(accountTwo)
          .scheduleRace(postTime, 5, 5);
        const race = await roseDerby._races(0);
        expect(race).to.deep.equal([5, 5, postTime, 0, false]);
      });
    });

    describe("Placing bets", () => {

      it("Should fail if the race doesn't exist", async () => {
        const { roseDerby, accountTwo } = await loadFixture(deployRoseDerbyFixture);

        await expect(roseDerby.connect(accountTwo).placeBet(0, 1))
              .to.be.revertedWith("No such race");
      });

      it("Should fail if you try to place a bet after the post time", async () => {
        const { roseDerby, accountTwo } = await loadFixture(deployRoseDerbyFixture);

        const postTime = await time.latest() + 60;
        await roseDerby.connect(accountTwo)
          .scheduleRace(postTime, 5, 5);

        await time.increaseTo(postTime);

        await expect(roseDerby.connect(accountTwo)
          .placeBet(0, 1))
          .to.be.revertedWith("Race already started");
      });

      it("Should fail if you try to place a bet for less than 2 ROSE", async () => {
        const { roseDerby, accountTwo } = await loadFixture(deployRoseDerbyFixture);

        const postTime = await time.latest() + 60;
        await roseDerby.connect(accountTwo)
          .scheduleRace(postTime, 5, 5);

        await expect(roseDerby.connect(accountTwo)
          .placeBet(0, 1, { value: ethers.parseEther('1') }))
          .to.be.revertedWith("Minimum bet is 2 ROSE");
      });

      it("Should increase the total pool by the bet amount", async () => {
        const betAmount = ethers.parseEther('2');
        const { roseDerby, accountTwo } = await loadFixture(deployRoseDerbyFixture);

        const postTime = await time.latest() + 60;
        await roseDerby.connect(accountTwo)
          .scheduleRace(postTime, 5, 5);

        let race = await roseDerby._races(0);
        expect(race.pool).to.equal(0);

        await roseDerby.connect(accountTwo)
          .placeBet(0, 1, { value: betAmount });

        race = await roseDerby._races(0);
        expect(race.pool).to.equal(betAmount);
      });

    });

    describe("Determining race results", () => {

      it("Should fail if the race doesn't exist", async () => {
        const { roseDerby, accountTwo } = await loadFixture(deployRoseDerbyFixture);
        const account = await roseDerby.connect(accountTwo);

        await expect(account.determineResults(0)).to.be.revertedWith("No such race");
      });

      it("Should fail if you try to determine results before the post time", async () => {
        const { roseDerby, accountTwo } = await loadFixture(deployRoseDerbyFixture);
        const account = await roseDerby.connect(accountTwo);

        const postTime = await time.latest() + 60;
        await account.scheduleRace(postTime, 5, 5);

        await expect(account.determineResults(0)).to.be.revertedWith("Race hasn't started");
      });

      it("Should fail if you try to determine results on an already-finished race", async () => {
        const { roseDerbyNonDeterministic, accountTwo } = await loadFixture(deployRoseDerbyFixture);
        const account = roseDerbyNonDeterministic.connect(accountTwo);

        const postTime = await time.latest() + 60;
        await account.scheduleRace(postTime, 5, 5);
        await time.increaseTo(postTime);
        await account.determineResults(0);

        await expect(account.determineResults(0)).to.be.revertedWith("Race results already determined");
      });

      it("Should mark the race as finished", async () => {
        const { roseDerbyNonDeterministic, accountTwo, postTime } = await loadFixture(deployRoseDerbyFixture);
        const account = await roseDerbyNonDeterministic.connect(accountTwo);

        await account.scheduleRace(postTime, 5, 5);
        let race = await roseDerbyNonDeterministic._races(0);
        expect(race.finished).to.be.false;

        await time.increaseTo(postTime);

        await account.determineResults(0);
        race = await roseDerbyNonDeterministic._races(0);
        expect(race.finished).to.be.true;
      });
    });

    describe("Withdrawing winnings", () => {});

    describe("Events", function () {
        it("Should emit a race scheduled event on scheduling", async () => {
          const { roseDerby, accountTwo, postTime } = await loadFixture(deployRoseDerbyFixture);
          const account = await roseDerby.connect(accountTwo);

          await expect(await account.scheduleRace(postTime, 5, 5))
                .to.emit(roseDerby, "RaceScheduled")
                .withArgs(0);

          await expect(await account.scheduleRace(postTime, 5, 5))
                .to.emit(roseDerby, "RaceScheduled")
                .withArgs(1);
        });

        it("Should emit a bet placed event on placing a bet", async () => {
          const betAmount = ethers.parseEther('2');
          const { roseDerby, accountTwo } = await loadFixture(deployRoseDerbyFixture);
          const account = await roseDerby.connect(accountTwo);

          const postTime = await time.latest() + 60;
          await account.scheduleRace(postTime, 5, 5);
  
          await expect(account.placeBet(0, 1, { value: betAmount }))
            .to.emit(roseDerby, "BetPlaced")
            .withArgs(0, 1, betAmount);
        });

        it("Should emit a race results determined event on determining results", async () => {
          const { roseDerbyNonDeterministic, accountTwo } = await loadFixture(deployRoseDerbyFixture);
          const account = await roseDerbyNonDeterministic.connect(accountTwo);

          const postTime = await time.latest() + 60;
          await account.scheduleRace(postTime, 5, 5);

          await time.increaseTo(postTime);

          await expect(account.determineResults(0))
            .to.emit(roseDerbyNonDeterministic, "RaceResultsDetermined");
        });
        
      });

      
  });
  