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
    // socket.emit("SubmitTask", {
    //     id: `imageine`,
    //     userId: process.env.USERID ?? "misaka",
    //     type: "imagine",
    //     data: {
    //         prompt: "a cute cat --niji",
    //         images: [ "https://fanyiapp.cdn.bcebos.com/feed/d13329d0-6e15-3a56-f908-43e6e9ab2fc8.jpg" ]
    //     }
    // }, "imagine");
    socket.emit("SubmitTask", {
        id: `reroll`,
        userId: process.env.USERID ?? "misaka",
        type: "reroll",
        data: {
            taskMsg: {
                "id": "1148519326001926234",
                "flags": 0,
                "content": "**<<<749632982335>>> <https://s.mj.run/P7ki_AQe53g> a cute cat --niji --s 750** - <@914174839277899777> (fast)",
                "hash": "e35ca991-f717-49e6-9fdb-eb3681e5532a",
            },
            direction: "left"
        }
    }, "reroll");
    // socket.emit("SubmitTask", {
    //     id: `shorten-test`,
    //     userId: process.env.USERID ?? "misaka",
    //     type: "Imagine",
    //     data: { prompt: "a biger apple???" }
    // }, "shorten");
    // socket.emit("SubmitTask", {
    //     id: `0001`,
    //     userId: process.env.USERID ?? "misaka",
    //     type: "Imagine",
    //     data: { prompt: "a cute cat" }
    // }, "imagine");
    // socket.emit("SubmitTask", {
    //     id: `0002`,
    //     userId: process.env.USERID ?? "misaka",
    //     type: "Imagine",
    //     data: { prompt: "a cute cat" }
    // }, "imagine");
    // socket.emit("SubmitTask", {
    //     id: `0003`,
    //     userId: process.env.USERID ?? "misaka",
    //     type: "Imagine",
    //     data: { prompt: "a cute cat" }
    // }, "imagine");
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