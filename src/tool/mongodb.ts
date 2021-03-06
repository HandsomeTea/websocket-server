import mongoose from 'mongoose';
import { getENV, systemLog } from '@/config';

const RECONNET_TIME = 5000;
const mongoconnect = () => {
    const mongodbAddress = getENV('MONGO_URL') as string;

    if (!mongodbAddress) {
        return systemLog('mongodb').error(`mongodb connect address is required but get ${mongodbAddress}`);
    }
    return mongoose.connect(mongodbAddress, {}, error => {
        if (error) {
            systemLog('mongodb').error(error);
            setTimeout(mongoconnect, RECONNET_TIME);
        }
    });
};

class MongoDB {
    constructor() {
        // 初始化操作
        this.server.once('connected', () => {// 连接成功
            systemLog('mongodb').info(`mongodb connected on ${getENV('MONGO_URL')} success and ready to use.`);
        });

        this.server.on('disconnected', () => {// 连接失败或中断
            systemLog('mongodb').fatal(`disconnected! connection is break off. it will be retried in ${RECONNET_TIME} ms after every reconnect until success unless process exit.`);
        });

        this.server.on('reconnected', () => {// 重新连接成功
            systemLog('mongodb').info(`reconnect on ${getENV('MONGO_URL')} success and ready to use.`);
        });

        this.init();
    }

    private async init() {
        return await mongoconnect();
    }

    public get server() {
        return mongoose.connection;
    }

    public get schema() {
        return mongoose.Schema;
    }

    public get isUseful() {
        return this.server.readyState === 1;
    }

    public async close() {
        return await mongoose.connection.close();
    }
}

export default new MongoDB();
