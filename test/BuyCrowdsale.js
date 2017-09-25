
var RequestTokenSale = artifacts.require("./RequestTokenSale.sol");
var RequestToken = artifacts.require("./RequestToken.sol");
var BigNumber = require('bignumber.js');

var expectThrow = async function(promise) {
  try {
    await promise;
  } catch (error) {
    const invalidOpcode = error.message.search('invalid opcode') >= 0;
    const invalidJump = error.message.search('invalid JUMP') >= 0;
    const outOfGas = error.message.search('out of gas') >= 0;
    assert(
      invalidOpcode || invalidJump || outOfGas,
      "Expected throw, got '" + error + "' instead",
    );
    return;
  }
  assert.fail('Expected throw not received');
};


contract('Buy token sale', function(accounts) {
	// account setting ----------------------------------------------------------------------
	var admin = accounts[0];
	var foundationWallet = accounts[1];
	var earlyInvestorWallet = accounts[2];
	var vestingWallet = accounts[3];

	var randomGuy1 = accounts[4];
	var randomGuy2 = accounts[5];
	var randomGuy3 = accounts[6];
	var randomGuy4 = accounts[7];
	var randomGuy5 = accounts[8];
	var randomGuy6 = accounts[9];

	// tool const ----------------------------------------------------------------------------
	const day = 60 * 60 * 24 * 1000;
	const dayInSecond = 60 * 60 * 24;
	const second = 1000;
	const gasPriceMax = 50000000000;

	// crowdsale setting ---------------------------------------------------------------------
	const name = "Request Quark";
	const symbol = "REQ";
	const decimals = 18;
	const amountTokenSupply = 1000000000;
	const rateETHREQ = 5000;
		// translate with decimal for solitidy
	const amountTokenSupplySolidity = (new BigNumber(10).pow(decimals)).mul(amountTokenSupply);
	const capCrowdsaleInETH = 100000;
		// setting in wei for solidity
	const capCrowdsaleInWei = web3.toWei(capCrowdsaleInETH, "ether");

	// Token initialy distributed for the team (15%)
	const TEAM_VESTING_WALLET = vestingWallet;
	const TEAM_VESTING_AMOUNT = 150000000;

	// Token initialy distributed for the early investor (20%)
	const EARLY_INVESTOR_WALLET = earlyInvestorWallet;
	const EARLY_INVESTOR_AMOUNT = 200000000;

	// Token initialy distributed for the early foundation (15%)
	// wallet use also to gather the ether of the token sale
	const REQUEST_FOUNDATION_WALLET = foundationWallet;
	const REQUEST_FOUNDATION_AMOUNT = 150000000;

    // variable to host contracts ------------------------------------------------------------
	var requestTokenSale;
	var requestToken;

	beforeEach(async () => {
		const currentTimeStamp = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
		const startTimeSolidity = currentTimeStamp + 2*dayInSecond;
		const endTimeSolidity 	= startTimeSolidity + 3*dayInSecond;

		// create de crowdsale
		requestTokenSale = await RequestTokenSale.new(startTimeSolidity, endTimeSolidity);
		// retrieve the Token itself
		requestToken = await RequestToken.at(await requestTokenSale.token.call());

		var baseCapPerAddressWei = web3.toWei(10, "ether");

		await requestTokenSale.setBaseEthCapPerAddress(baseCapPerAddressWei,{from:admin});
		await requestTokenSale.changeRegistrationStatus(randomGuy1, true, {from:admin});

	});

	it("buy token ", async function() {
		addsDayOnEVM(2);
		var walletBalanceEthBefore = await web3.eth.getBalance(foundationWallet);

		var weiSpend = web3.toWei(2, "ether");
		// buy token within cap should work	
		var r = await requestTokenSale.sendTransaction({from:randomGuy1,value:weiSpend, gasPrice:gasPriceMax});

		assert.equal(r.logs[0].event, 'TokenPurchase', "event is wrong");
		assert.equal(r.logs[0].args.purchaser, randomGuy1, "purchaser is wrong");
		assert(r.logs[0].args.value.equals(weiSpend), "value is wrong");
		assert(r.logs[0].args.amount.equals(weiSpend*rateETHREQ), "amount is wrong");

		// check token arrived on buyer
		assert((new BigNumber(10).pow(18)).mul(10000).equals(await requestToken.balanceOf(randomGuy1)), "randomGuy1 balance");
		assert((new BigNumber(10).pow(18)).mul(500000000-10000).equals(await requestToken.balanceOf(requestTokenSale.address)), "requestTokenSale.address balance");
		// check money arrived :
		assert((new BigNumber(walletBalanceEthBefore)).add(weiSpend).equals(await web3.eth.getBalance(foundationWallet)), "foundationWallet eth balance");

		// buy token within cap should work	
		r = await requestTokenSale.sendTransaction({from:randomGuy1,value:weiSpend, gasPrice:gasPriceMax});

		assert.equal(r.logs[0].event, 'TokenPurchase', "event is wrong");
		assert.equal(r.logs[0].args.purchaser, randomGuy1, "purchaser is wrong");
		assert(r.logs[0].args.value.equals(weiSpend), "value is wrong");
		assert(r.logs[0].args.amount.equals(weiSpend*rateETHREQ), "amount is wrong");

		// check token arrived on buyer
		assert((new BigNumber(10).pow(18)).mul(20000).equals(await requestToken.balanceOf(randomGuy1)), "randomGuy1 balance");
		assert((new BigNumber(10).pow(18)).mul(500000000-20000).equals(await requestToken.balanceOf(requestTokenSale.address)), "requestTokenSale.address balance");
		// check money arrived :
		assert((new BigNumber(walletBalanceEthBefore)).add(weiSpend).add(weiSpend).equals(await web3.eth.getBalance(foundationWallet)), "foundationWallet eth balance");
	});


	it("buy token impossible", async function() {
		addsDayOnEVM(2);
		var weiSpend = web3.toWei(2, "ether");

		// buy not being on whitelist	opcode
		await expectThrow(requestTokenSale.sendTransaction({from:randomGuy2,value:weiSpend, gasPrice:gasPriceMax}));

		// Buy 0 token	opcode
		await expectThrow(requestTokenSale.sendTransaction({from:randomGuy1,value:0, gasPrice:gasPriceMax}));

		// gas price more than 50Gwei	opcode
		await expectThrow(requestTokenSale.sendTransaction({from:randomGuy1,value:weiSpend, gasPrice:gasPriceMax+1}));
	});


	it("Individual cap overpass 1st day", async function() {
		addsDayOnEVM(2);
		var wei1ether = web3.toWei(1, "ether");
		var wei10ether = web3.toWei(10, "ether");
		var wei11ether = web3.toWei(11, "ether");
		// var wei21ether = web3.toWei(21, "ether");
		// var wei41ether = web3.toWei(41, "ether");
		
		// buy overpass the individual cap (1st day)	opcode
		await expectThrow(requestTokenSale.sendTransaction({from:randomGuy1,value:wei11ether, gasPrice:gasPriceMax}));

		await requestTokenSale.sendTransaction({from:randomGuy1,value:wei10ether, gasPrice:gasPriceMax});

		// buy overpass the individual cap (1st day)	opcode
		await expectThrow(requestTokenSale.sendTransaction({from:randomGuy1,value:wei1ether, gasPrice:gasPriceMax}));

	});

	it("Individual cap overpass 2nd day", async function() {
		addsDayOnEVM(3);
		var wei1ether = web3.toWei(1, "ether");
		var wei20ether = web3.toWei(20, "ether");
		var wei21ether = web3.toWei(21, "ether");
		
		// buy overpass the individual cap (2nd day)	opcode
		await expectThrow(requestTokenSale.sendTransaction({from:randomGuy1,value:wei21ether, gasPrice:gasPriceMax}));

		await requestTokenSale.sendTransaction({from:randomGuy1,value:wei20ether, gasPrice:gasPriceMax});

		// buy overpass the individual cap (2nd day)	opcode
		await expectThrow(requestTokenSale.sendTransaction({from:randomGuy1,value:wei1ether, gasPrice:gasPriceMax}));
	});


	it("Individual cap overpass 3rd day", async function() {
		addsDayOnEVM(4);
		var wei1ether = web3.toWei(1, "ether");
		var wei40ether = web3.toWei(40, "ether");
		var wei41ether = web3.toWei(41, "ether");
		
		// buy overpass the individual cap (3rd day)	opcode
		await expectThrow(requestTokenSale.sendTransaction({from:randomGuy1,value:wei41ether, gasPrice:gasPriceMax}));

		await requestTokenSale.sendTransaction({from:randomGuy1,value:wei40ether, gasPrice:gasPriceMax});

		// buy overpass the individual cap (3rd day)	opcode
		await expectThrow(requestTokenSale.sendTransaction({from:randomGuy1,value:wei1ether, gasPrice:gasPriceMax}));
	});

	it("Check Individual cap", async function() {
		addsDayOnEVM(2);
		// check cap 1st day
		assert(new BigNumber(web3.toWei(10, "ether")).equals(await requestTokenSale.getCurrentEthCapPerAddress.call()), "Individual cap");
		addsDayOnEVM(1);
		// check cap 2nd day
		assert((new BigNumber(web3.toWei(20, "ether"))).equals(await requestTokenSale.getCurrentEthCapPerAddress.call()), "Individual cap");
		addsDayOnEVM(1);
		// check cap 3rd day
		assert((new BigNumber(web3.toWei(40, "ether"))).equals(await requestTokenSale.getCurrentEthCapPerAddress.call()), "Individual cap");
		addsDayOnEVM(1);
		// check cap 4th day
		assert((new BigNumber(web3.toWei(80, "ether"))).equals(await requestTokenSale.getCurrentEthCapPerAddress.call()), "Individual cap");
		addsDayOnEVM(1);
		// check cap 5th day
		assert((new BigNumber(web3.toWei(160, "ether"))).equals(await requestTokenSale.getCurrentEthCapPerAddress.call()), "Individual cap");
	});

	it("buy before sale start => opcode", async function() {
		var weiSpend = web3.toWei(2, "ether");

		// buy before sale start 2days before => opcode
		await expectThrow(requestTokenSale.sendTransaction({from:randomGuy1,value:weiSpend, gasPrice:gasPriceMax}));
		addsDayOnEVM(1);
		
		// buy before sale start 1day before => opcode
		await expectThrow(requestTokenSale.sendTransaction({from:randomGuy1,value:weiSpend, gasPrice:gasPriceMax}));
	});

	it("buy after sale end => opcode", async function() {
		addsDayOnEVM(5);
		var weiSpend = web3.toWei(2, "ether");

		// buy after sale end => opcode
		await expectThrow(requestTokenSale.sendTransaction({from:randomGuy1,value:weiSpend, gasPrice:gasPriceMax}));
	});

	it("buy overpass total Hard cap => opcode", async function() {
		baseCapPerAddressWei = web3.toWei(100000, "ether");
		await requestTokenSale.setBaseEthCapPerAddress(baseCapPerAddressWei,{from:admin});
		await requestTokenSale.changeRegistrationStatus(randomGuy2, true, {from:admin});
		
		addsDayOnEVM(2);
		
		var weiSpend1 = web3.toWei(1, "ether");
		var weiSpend100000ether = web3.toWei(100000, "ether");

		await requestTokenSale.sendTransaction({from:randomGuy1,value:weiSpend100000ether, gasPrice:gasPriceMax});

		// buy overpass total Hard cap =>	opcode
		await expectThrow(requestTokenSale.sendTransaction({from:randomGuy2,value:weiSpend1, gasPrice:gasPriceMax}));
	});




	var addsDayOnEVM = async function(days) {
		var daysInsecond = 60 * 60 * 24 * days 
		var currentBlockTime = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
		await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [daysInsecond], id: 0});
		await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});
	}


});


