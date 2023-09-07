import { logger } from "../server/logger";

export class RetryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RetryError';
    }
}

export function Retry(retryCount: number = 3): MethodDecorator {
    return function (target: Object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args: any[]) {
            for (let i = 0; i < retryCount; i++) {
                try {
                    if (i > 0){
                        logger.warn(`正在进行第${i}次重试...`);
                    }
                    return await originalMethod.apply(this, args);
                } catch (error) {
                    if (i === retryCount - 1) {
                        throw new RetryError(
                            `Method ${String(propertyKey)} failed after ${retryCount} retries.`,
                        );
                    }
                }
            }
        };
        return descriptor;
    };
}
