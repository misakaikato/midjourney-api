const Koa = require('koa');
import { router as midjourney_router } from "./routers/midjourney";
import { router as task_router } from "./routers/task";
import { router as extension_router } from "./routers/extension";

import { FetchFn } from "../interfaces";
import { SocksProxyAgent } from "socks-proxy-agent";
import WebSocket from "isomorphic-ws";
import WS = require('ws')
const http = require('http');
import { base64ToBlob } from "../utils";

const WS_PROXY = true;

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
const io = new Server(httpServer, {
	cors: {
		origin: "http://127.0.0.1"
	}
});

import { RemoteTask, Task, type TaskArgs } from "./routers/task/task";
const taskqueue = new TaskQueue({ concurrentTaskCount: 3 });

function retry(count: number, func: any, ...args: any) {
	for (let i = 0; i < count; i++) {
		try {
			const rst = func(...args);
			return rst;
		}
		catch (error: any) {
			logger.error(JSON.stringify(error));
			continue;
		}
	}
	logger.error(`RETRY MAX`);
	throw Error("retry touch max number.");
}

async function async_retry(count: number, func: any, ...args: any) {
	let lastError: any = null;
	for (let i = 0; i < count; i++) {
		try {
			const rst = await func(...args);
			logger.debug(`rst!!!`);
			return rst;
		}
		catch (error: any) {
			logger.error(error);
			lastError = error;
			continue;
		}
	}
	logger.error(`RETRY MAX ${JSON.stringify(lastError)}`);
	throw Error(`retry touch max number. error: ${JSON.stringify(lastError)}`);
}

async function sleep(time: number) {
	return new Promise<void>((resolve, reject) => {
		setTimeout(() => {
			resolve();
		}, time);
	});
}

async function AppInitial(app: any) {
	if (!app.context.mjc) {

		if (WS_PROXY) {
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
		else {
			const client = new Midjourney({
				ServerId: <string>process.env.SERVER_ID,
				ChannelId: <string>process.env.CHANNEL_ID,
				SalaiToken: <string>process.env.SALAI_TOKEN,
				Debug: true,
				Ws: true,
			});
			await client.init();
			app.context.mjc = client;
		}
	}
}

app.use(BodyParser());
app.use(midjourney_router.routes());
app.use(task_router.routes());
app.use(extension_router.routes());

interface ServerToClientEvents {
	TaskEvent: (msg: any) => void;
}

interface ClientToServerEvents {
	SubmitTask: (taskArgs: TaskArgs, type: string) => void;
	TaskEvent: (msg: any) => void;
}
interface InterServerEvents {
}

interface SocketData {
	mjc: Midjourney;
}

type IOSocketType = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

class ShortenTask extends RemoteTask<IOSocketType, Record<string, any>>{
	async _execute(data: { prompt: string }): Promise<any> {
		return this.wss.data.mjc.Shorten(data.prompt);
	}
}

class UploadImageTask extends RemoteTask<IOSocketType, Record<string, any>>{
	async _execute(data: { images: string[] }): Promise<any> {
		return this.wss.data.mjc.UploadImages(data.images);
	}
}

class ImagineTask extends RemoteTask<IOSocketType, Record<string, any>>{
	async _execute(data: { prompt: string, images?: string[] }): Promise<any> {
		let prompt = data.prompt;
		if (data.images) {
			const uploadImages = data.images.filter(image => image.startsWith("data:"));
			const urls: string[] = data.images.filter(images => !images.startsWith("data:"));
			if (uploadImages.length > 0) {
				const uploadedUrls: string[] = (await this.wss.data.mjc.UploadImages(uploadImages)).map((response: any) => response.url);
				const imagesUrls = urls.concat(uploadedUrls);
				prompt = `${imagesUrls.join(" ")} ${prompt}`;
			}
		}
		return this.wss.data.mjc.Imagine(prompt, (message: any, progress: string, seed?: string) => {
			logger.debug(`in ImagineTask, execute ${progress}`);
			this.processing(message, taskqueue);
		}, this.id);
	}
}

class VariationTask extends RemoteTask<IOSocketType, Record<string, any>>{
	async _execute(data: { taskMsg: { id: string, flags: number, hash: string, content: string }, index: 1 | 2 | 3 | 4 }): Promise<any> {
		return this.wss.data.mjc.Variation({
			msgId: data.taskMsg.id,
			hash: data.taskMsg.hash,
			// content: data.taskMsg.content,
			flags: data.taskMsg.flags,
			index: data.index,
			loading: (message: any, progress: string, seed?: string) => {
				logger.debug(`in VariationTask, execute ${progress}`);
				this.processing(message, taskqueue);
			}
		});
	}
}

class UpscaleTask extends RemoteTask<IOSocketType, Record<string, any>>{
	async _execute(data: { taskMsg: { id: string, flags: number, hash: string, content: string }, index: 1 | 2 | 3 | 4 }): Promise<any> {
		return this.wss.data.mjc.Upscale({
			msgId: data.taskMsg.id,
			hash: data.taskMsg.hash,
			// content: data.taskMsg.content,
			flags: data.taskMsg.flags,
			index: data.index,
			loading: (message: any, progress: string, seed?: string) => {
				logger.debug(`in VariationTask, execute ${progress}`);
				this.processing(message, taskqueue);
			}
		});
	}
}

class RerollTask extends RemoteTask<IOSocketType, Record<string, any>>{
	async _execute(data: { taskMsg: { id: string, flags: number, hash: string, content: string } }): Promise<any> {
		return this.wss.data.mjc.Reroll({
			msgId: data.taskMsg.id,
			hash: data.taskMsg.hash,
			flags: data.taskMsg.flags,
			loading: (message: any, progress: string, seed?: string) => {
				logger.debug(`in VariationTask, execute ${progress}`);
				this.processing(message, taskqueue);
			}
		});
	}
}

class ZoomOutTask extends RemoteTask<IOSocketType, Record<string, any>>{
	async _execute(data: { taskMsg: { id: string, flags: number, hash: string, content: string }, level: "high" | "low" | "2x" | "1.5x" }): Promise<any> {
		return this.wss.data.mjc.ZoomOut({
			level: data.level,
			msgId: data.taskMsg.id,
			hash: data.taskMsg.hash,
			flags: data.taskMsg.flags,
			loading: (message: any, progress: string, seed?: string) => {
				logger.debug(`in VariationTask, execute ${progress}`);
				this.processing(message, taskqueue);
			}
		});
	}
}

class PanTask extends RemoteTask<IOSocketType, Record<string, any>>{
	async _execute(data: { taskMsg: { id: string, flags: number, hash: string, content: string }, direction: "left" | "right" | "up" | "down" }): Promise<any> {
		return this.wss.data.mjc.Pan({
			direction: data.direction,
			msgId: data.taskMsg.id,
			hash: data.taskMsg.hash,
			flags: data.taskMsg.flags,
			loading: (message: any, progress: string, seed?: string) => {
				logger.debug(`in PanTask, execute ${progress}`);
				this.processing(message, taskqueue);
			}
		});
	}
}

class DescribeTask extends RemoteTask<IOSocketType, Record<string, any>>{
	async _execute(data: { image: string }): Promise<any> {
		return this.wss.data.mjc.Describe(data.image);
	}
}

function generateRandomDigits(n: number) {
	let result = '';
	for (let i = 0; i < n; i++) {
		result += Math.floor(Math.random() * 10); // 生成 0 到 9 的随机数
	}
	return result;
}

// 设置监听端口
app.listen(10089, async () => {
	console.log('app is starting at port i0089');
	await AppInitial(app);
	io.on("connection", async (socket) => {

		socket.data.mjc = app.context.mjc;

		logger.websocket("连接到新的 socket");

		socket.on("SubmitTask", async (taskArgs: TaskArgs, type: string, callback: (response: any) => void) => {
			logger.info(`server socket 接收到 SubmitTask, ${type}`);

			const id = generateRandomDigits(12);

			taskArgs.id = id;

			if (type === "shorten") {
				taskqueue.submitTask(new ShortenTask(taskArgs, socket));
			}
			else if (type === "describe") {
				taskqueue.submitTask(new DescribeTask(taskArgs, socket));
			}
			else if (type === "uploadImage") {
				taskqueue.submitTask(new UploadImageTask(taskArgs, socket));
			}
			else if (type === "imagine") {
				taskqueue.submitTask(new ImagineTask(taskArgs, socket));
			}
			else if (type === "variation") {
				taskqueue.submitTask(new VariationTask(taskArgs, socket));
			}
			else if (type === "upscale") {
				taskqueue.submitTask(new UpscaleTask(taskArgs, socket));
			}
			else if (type === "reroll") {
				taskqueue.submitTask(new RerollTask(taskArgs, socket));
			}
			else if (type === "zoomout") {
				taskqueue.submitTask(new ZoomOutTask(taskArgs, socket));
			}
			else if (type === "pan") {
				taskqueue.submitTask(new PanTask(taskArgs, socket));
			}
			callback({ id, status: "ok", code: 0, ok: true });
		})
	});
});

httpServer.listen(13000);