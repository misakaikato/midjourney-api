import { Task, TaskArgs, RemoteTask } from "./task";
import { TaskQueue } from "./taskqueue";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from "./socket";
import { logger } from "../../logger";
import { clearInterval } from "timers";

type SocketIOType = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
const taskqueue = new TaskQueue({ concurrentTaskCount: 0});

const Koa = require('koa');


function fakeProcessing(task: Task, msg: any, queue: TaskQueue) {
    return setInterval(() => {
        task.processing(msg, queue);
    }, 1900);
}

class SuccessTask extends RemoteTask {
    protected async _execute() {
        const interval = fakeProcessing(this, "process", taskqueue);
        return new Promise<void>((resolve, reject) => {
            setTimeout(() => {
                clearInterval(interval);
                resolve();
            }, 2000);
        })
    }
}

class FailTask extends RemoteTask {
    protected async _execute() {
        const interval = fakeProcessing(this, "process", taskqueue);
        return new Promise<void>((resolve, reject) => {
            setTimeout(() => {
                clearInterval(interval);
                reject();
            }, 2000);
        })
    }
}

class TimeoutTask extends RemoteTask {
    protected async _execute() {
        const interval = fakeProcessing(this, "process", taskqueue);
        return new Promise<void>((resolve, reject) => {
            setTimeout(() => {
                clearInterval(interval);
                resolve();
            }, 11 * 1000.0);
        })
    }
}

class ErrorTask extends RemoteTask {
    protected async _execute() {
        const interval = fakeProcessing(this, "process", taskqueue);
        return new Promise<void>((resolve, reject) => {
            setTimeout(() => {
                try {
                    clearInterval(interval);
                    throw Error("error");
                    reject();
                }
                catch (error: any) {
                    reject();
                }
            }, 2000);
        })
    }
}

logger.info("socket io 服务器启动");

// const wsServer: SocketIOType = new Server(13000);

import { createServer } from "http";
const app = new Koa();
const httpServer = createServer(app.callback());
const io = new Server(httpServer);

io.on("connection", (socket) => {
    socket.on("SubmitTask", (taskArgs: TaskArgs, type: string) => {
        logger.info(`server socket 接收到 SubmitTask, ${type}`);
        if (type === "success") {
            taskqueue.submitTask(new SuccessTask(taskArgs, socket));
        }
        else if (type === "fail") {
            taskqueue.submitTask(new FailTask(taskArgs, socket));
        }
        else if (type === "timeout") {
            taskqueue.submitTask(new TimeoutTask(taskArgs, socket));
        }
        else if (type === "error") {
            taskqueue.submitTask(new ErrorTask(taskArgs, socket));
        }
    })
});

httpServer.listen(13000);

// wsServer.on("connection", (socket) => {
//     socket.on("SubmitTask", (taskArgs: TaskArgs, type: string) => {
//         logger.info(`server socket 接收到 SubmitTask, ${type}`);
//         if (type === "success") {
//             taskqueue.submitTask(new SuccessTask(taskArgs, socket));
//         }
//         else if (type === "fail") {
//             taskqueue.submitTask(new FailTask(taskArgs, socket));
//         }
//         else if (type === "timeout") {
//             taskqueue.submitTask(new TimeoutTask(taskArgs, socket));
//         }
//         else if (type === "error") {
//             taskqueue.submitTask(new ErrorTask(taskArgs, socket));
//         }
//     })
// });