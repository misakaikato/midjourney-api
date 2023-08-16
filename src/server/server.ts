const Koa = require('koa');
import { router as midjourney_router } from "./routers/midjourney";
import { router as task_router } from "./routers/task";
import { router as extension_router } from "./routers/extension";
import { FetchFn } from "../interfaces";
import { SocksProxyAgent } from "socks-proxy-agent";
import { Midjourney } from "../midjourney";
const BodyParser = require('koa-bodyparser');
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

const app = new Koa();

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
		await client.init();
		app.context.mjc = client;
	}
}

app.use(BodyParser());
app.use(midjourney_router.routes());
app.use(task_router.routes());
app.use(extension_router.routes());

// 设置监听端口
app.listen(3000, async () => {
	console.log('app is starting at port 3000');
	const server = http.createServer(app.callback());
	// const wss = new WS.Server({ server });
	// // 当WebSocket从客户端连接时
	// wss.on('connection', (ws) => {
	// 	console.log('Client connected');
	// 	// 接收来自客户端的消息
	// 	ws.on('message', (message) => {
	// 		console.log(`Received: ${message}`);
	// 	});
	// 	// // 向客户端发送消息
	// 	// ws.send('Hello from Koa WebSocket server!');
	// });
	// app.context.wss = wss;
	await AppInitial(app);
});
