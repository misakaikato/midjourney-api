const winston = require('winston');
const path = require('path');

const customLevels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        debug: 4,
        websocket: 5,
        discord: 6,
        midjourney: 7
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        info: 'green',
        http: 'blue',
        debug: 'gray',
        websocket: 'magenta',
        discord: 'cyan',
        midjourney: 'white'
    }
};

winston.addColors(customLevels.colors);

// 创建一个 Winston 日志实例
export const logger = winston.createLogger({
    // level: 'debug', // 设置日志级别，只记录 info 及以上级别的日志
    level: 'midjourney',
    levels: customLevels.levels,
    // format: winston.format.combine(
    //     winston.format.colorize({ all: true }),
    //     winston.format.simple()
    // ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }), // 输出日志到控制台
        new winston.transports.File({
            format: winston.format.combine(
                winston.format.timestamp(), // 添加时间戳
                winston.format.json(), // JSON 格式的日志
            ),
            filename: path.join(".", 'app.log'),
        }), // 输出日志到文件
    ],
});
