import { logger } from "../../logger";

import { io } from "socket.io-client";
const socket = io("ws://localhost:13000");

async function sleep(time: number) {
    return new Promise<void>((resolve, reject) => {
        setTimeout(() => { resolve() }, time);
    })
}

socket.on("TaskEvent", (task: any) => {
    logger.info(`[TaskEvent] ${task}`);
});

const INTERVAL = 3000

socket.on("connect", async () => {
    // for (let i = 0; i < 100; i++) {
    socket.emit("SubmitTask", {
        id: `shorten-test`,
        userId: process.env.USERID ?? "misaka",
        type: "Imagine",
        data: { prompt: "a biger apple???" }
    }, "shorten");
    await sleep(INTERVAL);
    socket.emit("SubmitTask", {
        id: `0001`,
        userId: process.env.USERID ?? "misaka",
        type: "Imagine",
        data: { prompt: "a cute cat" }
    }, "imagine");
    await sleep(INTERVAL);
    socket.emit("SubmitTask", {
        id: `0002`,
        userId: process.env.USERID ?? "misaka",
        type: "Imagine",
        data: { prompt: "a cute cat" }
    }, "imagine");
    await sleep(INTERVAL);
    socket.emit("SubmitTask", {
        id: `0003`,
        userId: process.env.USERID ?? "misaka",
        type: "Imagine",
        data: { prompt: "a cute cat" }
    }, "imagine");
});

// wsServer.on("connection", (socket) => {
//     socket.on("SubmitTask", (taskArgs: TaskArgs, type: string)=>{
//         if (type === "success"){
//             taskqueue.submitTask(new SuccessTask(taskArgs), socket);
//         }
//         else if (type === "fail"){
//             taskqueue.submitTask(new FailTask(taskArgs), socket);
//         }
//         else if (type === "timeout"){
//             taskqueue.submitTask(new TimeoutTask(taskArgs), socket);
//         }
//         else if (type === "error"){
//             taskqueue.submitTask(new ErrorTask(taskArgs), socket);
//         }
//     })
// });