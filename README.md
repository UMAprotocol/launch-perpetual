# Stub Package for Launching a New Perpetual

The purpose of this repository/package is to make it easy to customize your Perpetual deployment. Feel free to use this
repository in place or fork and customize it.

## Install system dependencies

You will need to install nodejs (we recommend the latest stable version, nodejs v14, and `nvm` to manage node versions) and yarn.

Note: these additional dependencies are required -- you may or may not have them on your system already:

- `libudev`
- `libusb`

Example ubuntu installation command for additional deps:

```bash
sudo apt-get update && sudo apt-get install -y libudev-dev libusb-1.0-0-dev
```

## Install packages

```bash
yarn
```

## Run the deployment script on a mainnet fork

It's a good idea to try out your deployment on a fork before running it on mainnet. This will allow you to run the
deployment in a forked environment and interact with it to ensure it works as expected.

Start ganache.

```bash
yarn ganache-fork your.node.url.io
```

Set a `MNEMONIC=word1 word 2 ...` environment variable in a `.env` file. This is optional -- without it, the script will use the provider's default pre-loaded account.

In a separate terminal, run the deployment script (it defaults to using localhost:8545 as the ETH node, which is
desired in this case)

```bash
node index.js --gasprice 50 --priceFeedIdentifier ETHUSD --fundingRateIdentifier "ETH/BTC" --collateralAddress "0xaddress" --syntheticName "Synthetic ETH" --syntheticSymbol uETH --minSponsorTokens .01
```

Now you should be able to use `localhost:8545` to interact with a forked version of mainnet (or kovan) where your
contract is deployed.

## Run the deployment script on mainnet or kovan

Replace the example values with your values.

```bash
node index.js --gasprice 50 --url your.node.url.io --priceFeedIdentifier ETHUSD --fundingRateIdentifier "ETH/BTC" --collateralAddress "0xaddress" --syntheticName "Synthetic ETH" --syntheticSymbol uETH --minSponsorTokens .01
```

## Customize the script

The script should be fairly easy to read and understand. The primary use case for customization is modifying the perpetualParams
struct to customize the construction parameters for the Perpetual. See [the script](./index.js) for more details.

We encourage you to fork this repo and customize the script as you see fit!
