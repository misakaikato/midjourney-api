const winston = require('winston');
const path = require('path');

// 创建一个 Winston 日志实例
export const logger = winston.createLogger({
    level: 'debug', // 设置日志级别，只记录 info 及以上级别的日志
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
