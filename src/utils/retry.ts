import { logger } from "../server/logger";

export function retryFunctor(fn: (args?: any) => any, maxTimes: number) {
	return (args?: any) => {
		for (let i = 1; i <= maxTimes; i++) {
			try {
				return fn(args);
			}
			catch (error: any) {
                logger.warn(`重试第${i}次`);
				if (i === maxTimes){
					throw Error("touch max retry times.");
				}
				continue;
			}
		}
	}
}

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
                    let error_info = "";
                    if (error instanceof Error){
                        error_info = `${error.message}, ${error.stack}`;
                    }
                    else {
                        error_info = JSON.stringify( error );
                    }
                    logger.warn(`[Retry] 发送错误，进行尝试，错误信息：${error_info}`)
                    if (i === retryCount - 1) {
                        throw new RetryError(
                            `Method ${String(propertyKey)} failed after ${retryCount} retries. Error info: ${error_info}`,
                        );
                    }
                }
            }
        };
        return descriptor;
    };
}
