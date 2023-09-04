const Koa = require('koa');
import { router as midjourney_router } from "./routers/midjourney";
import { router as task_router } from "./routers/task";
import { router as extension_router } from "./routers/extension";

import { FetchFn } from "../interfaces";
import { SocksProxyAgent } from "socks-proxy-agent";
import WebSocket from "isomorphic-ws";
import WS = require('ws')
const http = require('http');

const proxyFetch: FetchFn = async (
	input: RequestInfo | URL,
	init?: RequestInit | undefined
): Promise<Response> => {
	const agent = new SocksProxyAgent("socks://127.0.0.1:10088", {
		keepAlive: true,
	});
	if (!init) init = {};
	// @ts-ignore
	init.agent = agent;
	// @ts-ignore
	return fetch(input, init);
};

class ProxyWebSocket extends WebSocket {
	constructor(address: string | URL, options?: WebSocket.ClientOptions) {
		const agent = new SocksProxyAgent("socks://127.0.0.1:10088", {
			keepAlive: true,
		});
		if (!options) options = {};
		options.agent = agent;
		super(address, options);
	}
}

const BodyParser = require('koa-bodyparser');
import { Midjourney } from "../midjourney";

const app = new Koa();
import { logger } from "./logger";
import { TaskQueue } from "./routers/task/taskqueue";
import { createServer } from "http";
const httpServer = createServer(app.callback());

import { RemoteSocket, Server, Socket } from "socket.io";
const io = new Server(httpServer);

import { RemoteTask, Task, type TaskArgs } from "./routers/task/task";
const taskqueue = new TaskQueue({ concurrentTaskCount: 3 });

function retry(count: number, func: any, ...args: any ){
	for(let i=0; i<count; i++){
		try{
			const rst = func(...args);
			return rst;
		}
		catch(error: any){
			logger.error(JSON.stringify(error));
			continue;
		}
	}
	logger.error(`RETRY MAX`);
	throw Error("retry touch max number.");
}

async function async_retry(count: number, func: any, ...args: any ){
	let lastError: any = null;
	for(let i=0; i<count; i++){
		try{
			const rst = await func(...args);
			logger.debug(`rst!!!`);
			return rst;
		}
		catch(error: any){
			logger.error(error);
			lastError = error;
			continue;
		}
	}
	logger.error(`RETRY MAX ${JSON.stringify(lastError)}`);
	throw Error(`retry touch max number. error: ${JSON.stringify(lastError)}`);
}

async function sleep(time: number){
	return new Promise<void>((resolve, reject)=>{
		setTimeout(()=>{
			resolve();
		}, time);
	});
}

async function AppInitial(app: any) {
	if (!app.context.mjc) {
		const client = new Midjourney({
			ServerId: <string>process.env.SERVER_ID,
			ChannelId: <string>process.env.CHANNEL_ID,
			SalaiToken: <string>process.env.SALAI_TOKEN,
			Debug: true,
			Ws: true,
			fetch: proxyFetch,
			WebSocket: ProxyWebSocket as typeof WebSocket,
		});
		// retry
		// await async_retry(3, client.init())
		await client.init();
		app.context.mjc = client;
	}
}

app.use(BodyParser());
app.use(midjourney_router.routes());
app.use(task_router.routes());
app.use(extension_router.routes());

interface ServerToClientEvents {
    TaskEvent: (msg: any)=>void;
}

interface ClientToServerEvents {
    SubmitTask: (taskArgs: TaskArgs, type: string) => void;
    TaskEvent: (msg: any) => void;
}
interface InterServerEvents{
}

interface SocketData{
	mjc: Midjourney;
}

type IOSocketType = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

class ShortenTask extends RemoteTask<IOSocketType, Record<string, any>>{
	async _execute(data: { prompt: string }): Promise<any> {
		return this.wss.data.mjc.Shorten(data.prompt);
	}
}

class ImagineTask extends RemoteTask<IOSocketType, Record<string, any>>{
	async _execute(data: { prompt: string }): Promise<any> {
		return this.wss.data.mjc.Imagine(data.prompt, (message: any, progress: string, seed?: string)=>{
			logger.debug(`in ImagineTask, execute ${progress}`);
			this.processing(message, taskqueue);
		});
	}
}

// 设置监听端口
app.listen(10089, async () => {
	console.log('app is starting at port 10089');
	await AppInitial(app);
	io.on("connection", async (socket) => {
		socket.data.mjc = app.context.mjc;
		socket.on("SubmitTask", async (taskArgs: TaskArgs, type: string) => {
			logger.info(`server socket 接收到 SubmitTask, ${type}`);
			if (type === "shorten"){
				taskqueue.submitTask(new ShortenTask(taskArgs, socket));
			}
			else if (type === "imagine"){
				taskqueue.submitTask(new ImagineTask(taskArgs, socket));
			}
		})
	});
});

httpServer.listen(13000);