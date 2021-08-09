/* eslint-disable no-unused-vars */
import { BigNumberish } from "ethers";

export enum TAGS {
    AQUA = "AQUA", // Full deploy,
    AQUA_FACTORY = "AQUA_FACTORY",
    SALE_LAUNCHER = "SALE_LAUNCHER",
    PARTICIPANT_LIST = "PARTICIPANT_LIST",
    PARTICIPANT_LIST_LAUNCHER = "PARTICIPANT_LIST_LAUNCHER",
    TEMPLATE_LAUNCHER = "TEMPLATE_LAUNCHER",
    FAIR_SALE = "FAIR_SALE",
    FIXED_PRICE_SALE = "FIXED_PRICE_SALE",
    FAIR_SALE_TEMPLATE = "FAIR_SALE_TEMPLATE",
    FIXED_PRICE_SALE_TEMPLATE = "FIXED_PRICE_SALE_TEMPLATE",
    REGISTER_TEMPLATE_LAUNCHER = "REGISTER_TEMPLATE_LAUNCHER",
    REGISTER_TEMPLATE_LAUNCHER_TEMPLATES = "REGISTER_TEMPLATE_LAUNCHER_TEMPLATES" 
}

type AquaDeploymentParams = Partial<{
    feeTo: string;
    feeManager: string;
    templateManager: string;
    feeNumerator: BigNumberish;
    saleFee: BigNumberish;
    templateFee: BigNumberish;
}>;

const deploymentConfig: { [k: string]: AquaDeploymentParams } = {
    mainnet: {
        feeManager: "0xA601aeD34dda12fF760d8ABb64Fd4Eb3664E35Af",
        feeTo: "0xA601aeD34dda12fF760d8ABb64Fd4Eb3664E35Af",
        templateManager: "0xA601aeD34dda12fF760d8ABb64Fd4Eb3664E35Af",
        saleFee: 0,
        templateFee: 0,
        feeNumerator: 0,
    },
    rinkeby: {
        feeManager: "0xA601aeD34dda12fF760d8ABb64Fd4Eb3664E35Af",
        feeTo: "0xA601aeD34dda12fF760d8ABb64Fd4Eb3664E35Af",
        templateManager: "0xA601aeD34dda12fF760d8ABb64Fd4Eb3664E35Af",
        saleFee: 0,
        templateFee: 0,
        feeNumerator: 0,
    },
    xdai: {
        feeManager: "0xA601aeD34dda12fF760d8ABb64Fd4Eb3664E35Af",
        feeTo: "0xA601aeD34dda12fF760d8ABb64Fd4Eb3664E35Af",
        templateManager: "0xA601aeD34dda12fF760d8ABb64Fd4Eb3664E35Af",
        saleFee: 0,
        templateFee: 0,
        feeNumerator: 0,
    },
};

export const getDeploymentConfig = (networkName: string) => {
    return deploymentConfig[networkName] || undefined;
};
