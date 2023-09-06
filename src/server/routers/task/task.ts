import { randomUUID } from "crypto";

export type TaskType = "Imagine" | "Upscale" | "Variation" | "Pan" | "ZoomOut" | "Reroll" | "Describe" | "Blend";
export type TaskStatusType = 
    "uncreate" | 
    "queuing" |
    "pending" | 
    "processing" | 
    "completed" | 
    "timeout" | 
    "error";

export type TaskArgs = {
    id?: string;
    userId: string;
    type: TaskType;
    data?: any;
}

export const TIMEOUTLIMIT: number = 100; //s

import type { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from "./socket";
import type { Server, Socket } from "socket.io";
import { logger } from "../../logger";
import type { TaskQueue } from "./taskqueue";

// type SocketIOType = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 *   midjourney server       timeout   
 *          |              .----------.
 *          v              |          | 
 *       .----------------------.     |
 *       |         task         |<----'
 *       '----------------------'
 *                  ^ 
 *                  |
 *           user submit task
 */

export class Task<DataType extends Record<string, any>> {
    public id: string;
    public userId: string;
    public status: TaskStatusType = "uncreate";
    public type: TaskType;
    private createTime: number = 0;
    private startTime: number = 0;
    private finishTime: number = 0;
    private data: DataType;
    private msg: any = {};
    private timeoutTimer: any = null;

    constructor(args: TaskArgs) {
        this.id = args.id ?? randomUUID();
        this.userId = args.userId;
        this.type = args.type;
        this.data = args.data;
        this.createTime = Date.now();
        // this.status = "queuing";
        this.status = "pending";
    }

    protected sendToUser(msg?: any) {
        logger.info(`send to user, msg: ${msg}, json: ${this.toJSON()}`);
    }

    async submit(msg: any, queue: TaskQueue<DataType>) {
        this.sendToUser();
    }

    async execute(msg: any, queue: TaskQueue<DataType>) {
        logger.info("[Task execute] 任务开始执行");
        this.startTime = Date.now();
        this.status = "processing";
        this.msg = msg;
        this.sendToUser();
        this.timeoutTimer = setTimeout(() => {
            this.timeout(msg, queue);
        }, TIMEOUTLIMIT * 1000);
        // 调用真正需要执行的异步函数
        try {
            const msg = await this._execute(this.data);
            this.success(msg, queue);
        }
        catch (error: any) {
            this.fail(error, queue);
        }
    }

    protected async _execute(data: DataType): Promise<any> {
        return new Promise<void>((resolve, reject) => {
            setTimeout(() => {
                resolve();
            }, 1000.0);
        })
    }

    async processing(msg: any, queue: TaskQueue<DataType>) {
        if (this.status !== "timeout") {
            this.msg = msg;
            this.sendToUser();
            queue.handleTaskProcessing(this.id, msg);
        }
    }

    async success(msg: any, queue: TaskQueue<DataType>) {
        if (this.status !== "timeout") {
            this.finishTime = Date.now();
            this.status = "completed";
            this.msg = msg;
            clearTimeout(this.timeoutTimer);
            this.sendToUser();
            queue.handleTaskCompleted(this.id, msg);
        }
    }

    async timeout(msg: any, queue: TaskQueue<DataType>) {
        this.finishTime = Date.now();
        this.status = "timeout";
        this.msg = msg;
        logger.debug(`[timeout] debug, ${this.toJSON()}`);
        this.sendToUser();
        queue.handleTaskTimeout(this.id, msg);
    }

    async fail(msg: any, queue: TaskQueue<DataType>) {
        console.log("debug, error in fail()", msg);
        this.finishTime = Date.now();
        this.status = "error";
        this.msg = msg;
        clearTimeout(this.timeoutTimer);
        this.sendToUser();
        queue.handleTaskError(this.id, msg);
    }

    toJSON() {
        return JSON.stringify({
            id: this.id,
            userId: this.userId,
            type: this.type,
            status: this.status,
            createTime: this.createTime,
            startTime: this.startTime,
            finishTime: this.finishTime,
            data: this.data,
            msg: JSON.stringify(this.msg),
        });
    }
}

export class RemoteTask
    <IOSocketType extends Socket, DataType extends Record<string, any>>
    extends Task<DataType> {
        protected wss: IOSocketType;

        constructor(args: TaskArgs, wss: IOSocketType) {
            super(args);
            this.wss = wss;
        }

        protected sendToUser(msg?: any) {
            this.wss.emit("TaskEvent", this);
        }
    }