import type { Task } from "./task";
import { logger } from "../../logger";
import { createClient } from 'redis';

const client = createClient({
    socket: {
        host: 'localhost',
        port: 16379
    }
});

client.on('error', err => console.log('Redis Client Error', err));

type TaskQueueArgs = {
    concurrentTaskCount?: number;
}

const TASK_EXEC_INTERVAL = 2; //s

export class TaskQueue<DataType extends Record<string, any>> {
    private queue: Array<Task<DataType>> = []; // 其中只有未开始和正在运行的任务

    // 可以同时并行的任务，默认值由订阅计划决定
    private concurrentTaskCountLimit: number;
    private concurrentTaskCounter: number = 0;
    private executeIntervalInstance: any;

    constructor(args: TaskQueueArgs) {
        this.concurrentTaskCountLimit = args.concurrentTaskCount ?? 1;
        this.executeIntervalInstance = setInterval(()=>{
            // logger.info(`[TaskQueue] 尝试执行任务, 当前队列情况: ${this.concurrentTaskCounter}/${this.concurrentTaskCountLimit}`);
            this.executeTask();
        }, TASK_EXEC_INTERVAL * 1000);
    }

    getTask(taskId: string) {
        return this.queue.find((t) => t.id === taskId);
    }

    // 下面的 wss 都是和客户端进行通信的 websocket
    submitTask(task: Task<DataType>) { // 提交任务
        logger.info(`提交任务 ${task.toJSON()}`);
        this.queue.push(task);
        task.submit({}, this);
    }

    executeTask(taskId?: string) { // 执行一个指定任务或者可以运行的任务
        if (this.concurrentTaskCounter >= this.concurrentTaskCountLimit) {
            return;
        }
        let tasks: Task<DataType>[] = [];
        if (taskId) {
            const task = this.getTask(taskId);
            if (task){
                tasks.push(task);
            }
        }
        else {
            tasks = this.findRunnableTasks();
        }
        // 可执行的任务列表 (为了方式 429 code, 每次只执行一个任务)
        const canRunnableTasks = tasks.slice(0, Math.min( this.concurrentTaskCountLimit - this.concurrentTaskCounter, tasks.length, 1))
        canRunnableTasks.forEach(t => t.execute({}, this) );
        this.concurrentTaskCounter += canRunnableTasks.length;
    }

    private findRunnableTasks() {
        return this.queue.filter((t) => t.status === "pending");
    }

    removeTask(taskId: string) {
        const index = this.queue.findIndex((t) => t.id === taskId);
        if (index !== -1) {
            this.queue.splice(index, 1);
            this.concurrentTaskCounter -= 1;
        }
    }

    cancelTask(taskId: string) { // 取消任务
        this.removeTask(taskId);
    }

    handleTaskProcessing(taskId: string, msg: any) {
        // ...
    }

    // 下面这些函数是在进度更新的时候进行调用
    handleTaskCompleted(taskId: string, msg: any) {
        this.removeTask(taskId);
    }

    handleTaskError(taskId: string, msg: any) {
        this.removeTask(taskId);
    }

    // 其他的 handler 都是由 midjourney 服务器引发的，唯独 timeout handler 是靠 task 内部时钟决定的
    handleTaskTimeout(taskId: string, msg: any) {
        this.removeTask(taskId);
    }
}