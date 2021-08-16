import { existsSync } from 'fs'
import glob from 'glob-promise'
import { join, parse, resolve} from 'path'
import { exec } from 'child_process'
import { mkdir, readdir, readFile, writeFile, copyFile, rm } from 'fs/promises'

const ROOT = join(__dirname, '..')

// TYPES
export type ContractsAddresses = {
    [chainId: string]: {
        [contractName: string]: string
    }
}

// CONFIG
const config = {
    paths: {
        outDir: join(ROOT, 'aqua-sc'),                  // Path to root folder
        deployments: join(ROOT, 'deployments'),         // Path to folder with deployments (compatible with hardhat-deploy only)
        artifacts: join(ROOT, 'build/artifacts')        // Path to folder with artifacts to be copied
    },
    addresses: {
        fileName: 'addresses',                          // Name of the file to which addresses will be saved in .json format
        ignoredDeployments: [                           // Array of deployments (chains) that will be ignored
            'localhost', 
            'hardhat'
        ],
        includedContracts: [                            // Name of contracts (will match filename) to be included in .json with addresses
            'AquaFactory', 
            'ParticipantListLauncher', 
            'SaleLauncher', 
            'TemplateLauncher'
        ]
    },
    artifacts: {
        dirName: 'artifacts',                           // Name of folder to which artifacts will be saved 
        ignoredPaths: [                                 // Array of globs to be omitted
            '**/*.dbg.json',
            '**/build-info/*.*',
            '**/test/**/*.*',
            '**/libraries/**/*.*',
            '**/hardhat/**/*.*',
            `**/I*.json`, // interfaces 
            '**/CloneFactory.json',
            '**/Address.json',
            '**/Context.json',
        ]
    },
    chains: {                                           // chain name => networkId mapping used to build enum
        rinkeby: 4,
        xdai: 100
    },
    build: {
        perservedFiles: [                               // Array of filenames that will NOT be deleted between builds
            'README.md',
            `CHANGELOG.md`,
            'package.json',
        ]                              
    }
}



// UTILS
const camelize = (str: string) => {
    return str.replace(
        /(?:^\w|[A-Z]|\b\w)/g, 
        (word: string, index: number) => {
            return index === 0 ? word.toLowerCase() : word.toUpperCase();
        }
    ).replace(/\s+/g, '');
  }

const recreateDir = async (path: string, rmIfExists: boolean = false) => {
    const exists = existsSync(path)

    if (exists && rmIfExists) {
        await rm(path,{
            recursive: true,
            force: true
        })
        
    }

    if (!exists) {
        await mkdir(path, {
            recursive: true
        })
    }
}

const log = (msg: string) => console.log('\x1b[32m%s\x1b[0m', msg)

const execAsync = (cmd:string) => {
    return new Promise((resolve) => {
     exec(cmd, (error, stdout, stderr) => {
      if (error) {
       console.warn(error);
      }
      resolve(stdout? stdout : stderr);
     });
    });
   }

const clearDirExcept = async (dir: string, patternsToIgnore: string[], maxDepth = 1) => {
    const ignoredPatterns = patternsToIgnore.map(pattern => {
        return `-not -name "${pattern}"`
    })
    await execAsync(`find ${dir} -maxdepth ${maxDepth} -type f ${ignoredPatterns.join(' ')} -delete`)
}

// BUNDLERS
const bundleAddresses = async () => {
    const addresses: ContractsAddresses = {}
    const deployments = await readdir(config.paths.deployments)
    
    for (const deployment of deployments) {
        let chainId: string;

        if (!config.addresses.ignoredDeployments.includes(deployment)) {
            const deploymentContent = await readdir(join(config.paths.deployments, deployment))

            if (deploymentContent.includes('.chainId')) {
                chainId = (await readFile(join(config.paths.deployments, deployment, '.chainId'))).toString()
            } else {
                throw new Error(`Missing ${join(config.paths.deployments, deployment, '.chainId')}`)
            }
            
            for (const fileName of deploymentContent) {
                const filePath = join(config.paths.deployments, deployment, fileName)
                const file = parse(filePath)
        
                if (file.ext === '.json' && config.addresses.includedContracts.includes(file.name)) {
                    const fileContent = (await readFile(join(config.paths.deployments, deployment, fileName))).toString()
                    const addressSearch = fileContent.match(/(?<="address": ")[\w\d]*/g)
        
                    if (addressSearch && addressSearch.length > 0) {
                        if (!addresses[chainId]) {
                            addresses[chainId] = {}
                        }
                        addresses[chainId][camelize(file.name)] = addressSearch[0]
                    }
                }
            }
        }
    }

    if (Object.keys(addresses).length > 0) {
        await recreateDir(config.paths.outDir)

        await writeFile(join(config.paths.outDir, `${config.addresses.fileName}.json`), JSON.stringify(addresses), {})
    }
}

const bundleArtifacts = async () => {
    const artifactsOutDir = join(config.paths.outDir, config.artifacts.dirName)
    const artifacts = await glob(`${config.paths.artifacts}/**/*.json`, {
        cwd: resolve(__dirname),
        ignore: config.artifacts.ignoredPaths
    })

    await recreateDir(artifactsOutDir)
    
    for (const artifact of artifacts) {
        const contractProps = parse(artifact)

        await copyFile(artifact, join(artifactsOutDir, contractProps.base))
    }
}

const createIndexFile = async () => {
    // Write imports
    const writeImports = `import addresses from './${config.addresses.fileName}.json';`

    // Write reexports
    const writeReexports = `export * from './typechain/index'`
    
    // Write ContractAddresses interface
    const artifacts = await glob(`${join(config.paths.outDir, config.artifacts.dirName)}/*.json`, {
        cwd: resolve(__dirname)
    })

    const artifactsNames = artifacts.reduce<string[]>((total, filepath) => {
        let name = parse(filepath).name

        if (config.addresses.includedContracts.includes(name)) {
            total.push(`${camelize(name)}: string;`)
        }
        
        return total
    }, []).join('\n\t\t')

    const writeContractAddressInterface = `export interface ContractAddresses {
        ${artifactsNames}
    }`

    // Write ChainId enum
    const chains = Object.keys(config.chains).map(chainName => {
        return `${chainName.toLowerCase()} = ${config.chains[chainName as keyof typeof config.chains]},`
    }).join('\n\t\t')

    const writeChainEnum = `export enum ChainId {
        ${chains}
    }`

    // Write function
    const writeFunction = `
    /**
     * Used to get addresses of contracts that have been deployed to either the
     * Ethereum mainnet or a supported testnet. Throws if there are no known
     * contracts deployed on the corresponding chain.
     * @param chainId The desired chainId.
     * @returns The set of addresses for contracts which have been deployed on the
     * given chainId.
     */
    export function getContractAddressesForChainOrThrow(chainId: ChainId): ContractAddresses {
        const chainToAddresses: { [chainId: number]: ContractAddresses } = addresses;
    
        if (chainToAddresses[chainId] === undefined) {
            throw new Error(\`Unknown chain id (\${chainId}). No known aqua contracts have been deployed on this chain.\`);
        }
        return chainToAddresses[chainId];
    }
    `
    
    // Create and write index.ts
    const writeIndexFile = `
    /*eslint-disable */
    // @ts-nocheck
    // Inspired by https://github.com/0xProject/protocol/tree/main/packages/contract-addresses

    ${writeImports}

    ${writeReexports}

    ${writeContractAddressInterface}

    ${writeChainEnum}

    ${writeFunction}
    `

    await writeFile(join(config.paths.outDir, 'index.ts'), writeIndexFile)
}

const run = async () => {
    log(`Aqua-sc bundler`)
    log('=====================')
    log('Cleaning old files...')
    await clearDirExcept(config.paths.outDir, config.build.perservedFiles, 3)
    log('Bundling addresses...')
    await bundleAddresses()
    log('Bundling artifacts...')
    await bundleArtifacts()
    log('Creating index.ts...')
    await createIndexFile()
    log('Running typechain...')
    await execAsync(`yarn typechain --target ethers-v5 --out-dir ${join(config.paths.outDir, 'typechain')} '${join(config.paths.outDir, config.artifacts.dirName)}/*.json'`)
    log('Running tsc...')
    await execAsync(`tsc --declaration true ${join(config.paths.outDir, '*.ts')}`)
    // log('Removing .ts files...')
    // await execAsync(`find ${config.paths.outDir} -type f -name '*[!d].ts' -delete`)
    log('=====================')
    log(`Bundle successfully created in '${config.paths.outDir}' folder.`)
}

run()