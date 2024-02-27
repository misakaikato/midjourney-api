/**
 * 使用 ws 
 */

import {
	MJConfig,
	WaitMjEvent,
	MJMessage,
	LoadingHandler,
	MJEmit,
	MJInfo,
	MJSettings,
	MJOptions,
	OnModal,
	MJShorten,
	MJDescribe,
} from "./interfaces";
import { MidjourneyApi } from "./midjourney.api";
import { logger } from "./server/logger";
import {
	content2progress,
	content2prompt,
	formatInfo,
	formatOptions,
	formatPrompts,
	nextNonce,
	uriToHash,
} from "./utils";
import { VerifyHuman } from "./verify.human";
import WebSocket from "isomorphic-ws";
import { retryFunctor } from "./utils/retry";

export class WsMessage {
	ws: WebSocket;
	private closed = false;
	// 事件处理：[{event: "update", callback()}...]
	private event: Array<{ event: string; callback: (message: any) => void }> = [];
	// midjourney 消息处理：none-> { ..., onmodel(), ... }
	private waitMjEvents: Map<string, WaitMjEvent> = new Map();
	private skipMessageId: string[] = [];
	private reconnectTime: boolean[] = [];
	private heartbeatInterval = 0;
	public UserId = "";

	constructor(public config: MJConfig, public MJApi: MidjourneyApi) {
		logger.websocket(`新建连接, BaseUrl: ${this.config.WsBaseUrl}`);
		// this.ws = new this.config.WebSocket(this.config.WsBaseUrl);
		this.ws = retryFunctor(()=>{
			return new this.config.WebSocket(this.config.WsBaseUrl);
		}, 3) ();
		this.ws.addEventListener("open", this.open.bind(this));
		this.onSystem("ready", this.onReady.bind(this));
		this.onSystem("messageCreate", this.onMessageCreate.bind(this));
		this.onSystem("messageUpdate", this.onMessageUpdate.bind(this));
		this.onSystem("messageDelete", this.onMessageDelete.bind(this));
		this.onSystem("interactionSuccess", this.onInteractionSuccess.bind(this));
	}

	// 发送心跳包, 间隔 40s
	private async heartbeat(num: number) {
		if (this.reconnectTime[num]) return;
		//check if ws is closed
		if (this.closed) return;
		if (this.ws.readyState !== this.ws.OPEN) {
			this.reconnect();
			return;
		}
		logger.websocket(`heartbeat, ${this.heartbeatInterval}`);
		this.heartbeatInterval++;
		this.ws.send(
			JSON.stringify({
				op: 1,
				d: this.heartbeatInterval,
			})
		);
		await this.timeout(1000 * 40);
		this.heartbeat(num);
	}

	close() {
		this.closed = true;
		this.ws.close();
		logger.websocket("关闭连接");
	}

	async checkWs() {
		if (this.closed) return;
		if (this.ws.readyState !== this.ws.OPEN) {
			this.reconnect();
			await this.onceReady();
		}
	}

	async onceReady() {
		return new Promise((resolve) => {
			// ready 事件发送
			this.once("ready", (user) => {
				//print user nickname
				logger.websocket(`🎊 ws ready!!! Hi: ${user.global_name}`);
				resolve(this);
			});
		});
	}

	//try reconnect
	reconnect() {
		if (this.closed) return;
		this.ws = new this.config.WebSocket(this.config.WsBaseUrl);
		this.heartbeatInterval = 0;
		this.ws.addEventListener("open", this.open.bind(this));
		logger.websocket("重新连接");
	}

	// After opening ws
	private async open() {
		const num = this.reconnectTime.length;
		logger.websocket(`开启连接, 开启次数: ${num}`);
		// this.log("open.time", num);
		this.reconnectTime.push(false);
		// 建立连接之后进行认证
		this.auth();
		this.ws.addEventListener("message", (event) => {
			this.parseMessage(event.data as string);
		});
		this.ws.addEventListener("error", (event) => {
			this.reconnectTime[num] = true;
			this.reconnect();
		});
		this.ws.addEventListener("close", (event) => {
			this.reconnectTime[num] = true;
			this.reconnect();
		});
		// 连接建立后 10s 后开始进行心跳
		setTimeout(() => {
			this.heartbeat(num);
		}, 1000 * 10);
	}

	// auth
	private auth() {
		logger.websocket(`进行认证...`);
		this.ws.send(
			JSON.stringify({
				op: 2,
				d: {
					token: this.config.SalaiToken,
					capabilities: 8189,
					properties: {
						os: "Mac OS X",
						browser: "Chrome",
						device: "",
					},
					compress: false,
				},
			})
		);
	}

	async timeout(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
	
	// 消息被创建
	private async messageCreate(message: any) {
		const { 
			embeds, // 是一个数组，包含了消息中的嵌入内容。嵌入是一种特殊类型的消息，可以包含标题、描述、字段、缩略图、图片等。它们用于展示更加丰富和结构化的信息。
			id, //是消息的唯一标识符。每条消息在 Discord 中都有一个全局唯一的 ID，用于追踪和管理。
			nonce, // nonce 是一个可选字段，用于验证消息的发送。它是一个用于识别是否同一消息被多次发送的机制。通常，这是一个随机生成的数或字符串。
			components, //是一个数组，包含了消息中的交互组件。这些可以是按钮、选择菜单等，用于增加用户与机器人的互动。
			attachments //是一个数组，包含了消息中附加的文件或媒体，比如图片、音频、视频等。这些字段通常都是由 Discord API 提供的，不同的编程库（比如 discord.js、discord.py 等）会以不同的方式来访问这些字段。
		} = message;
		if (nonce) {
			// this.log("waiting start image or info or error");
			// nonce -> id
			this.updateMjEventIdByNonce(id, nonce);
			if (embeds?.[0]) {
				const { color, description, title } = embeds[0];
				this.log("embeds[0].color", color);
				switch (color) {
					case 16711680: //error
						if (title == "Action needed to continue") {
							return this.continue(message);
						} else if (title == "Pending mod message") {
							return this.continue(message);
						}

						const error = new Error(description);
						this.EventError(id, error);
						return;

					case 16776960: //warning
						console.warn(description);
						break;

					default:
						if (
							title?.includes("continue") &&
							description?.includes("verify you're human")
						) {
							//verify human
							await this.verifyHuman(message);
							return;
						}

						if (title?.includes("Invalid")) {
							//error
							const error = new Error(description);
							this.EventError(id, error);
							return;
						}
				}
			}
		}

		if (!nonce && attachments?.length > 0 && components?.length > 0) {
			this.done(message);
			return;
		}

		this.messageUpdate(message);
	}

	// 消息被更新
	private messageUpdate(message: any) {
		const {
			content,
			embeds,
			interaction = {},
			nonce,
			id,
			components,
		} = message;

		if (!nonce) {
			const { name } = interaction;

			switch (name) {
				// case 'imagine': 
				// 	logger.debug(`imagine-${id}-update`);
				// 	// this.emit("imagine-processing", message);
				// 	// id->noce
				// 	this.emitMJ(id, message);
				// 	return;
				case "settings":
					this.emit("settings", message);
					return;
				case "describe":
					let uri = embeds?.[0]?.image?.url;
					if (this.config.ImageProxy !== "") {
						uri = uri.replace(
							"https://cdn.discordapp.com/",
							this.config.ImageProxy
						);
					}
					const describe: MJDescribe = {
						id: id,
						flags: message.flags,
						descriptions: embeds?.[0]?.description.split("\n\n"),
						uri: uri,
						proxy_url: embeds?.[0]?.image?.proxy_url,
						options: formatOptions(components),
					};
					this.emitMJ(id, describe);
					break;
				case "prefer remix":
					if (content != "") {
						this.emit("prefer-remix", content);
					}
					break;
				case "shorten":
					const shorten: MJShorten = {
						description: embeds?.[0]?.description,
						prompts: formatPrompts(embeds?.[0]?.description as string),
						options: formatOptions(components),
						id,
						flags: message.flags,
					};
					this.emitMJ(id, shorten);
					break;
				case "info":
					this.emit("info", embeds?.[0]?.description);
					return;
			}
		}
		if (embeds?.[0]) {
			var { description, title } = embeds[0];
			if (title === "Duplicate images detected") {
				const error = new Error(description);
				this.EventError(id, error);
				return;
			}
		}

		if (content) {
			this.processingImage(message);
		}
	}

	//interaction success
	private async onInteractionSuccess({
		nonce,
		id,
	}: {
		nonce: string;
		id: string;
	}) {
		// this.log("interactionSuccess", nonce, id);
		const event = this.getEventByNonce(nonce);
		if (!event) {
			return;
		}
		event.onmodal && event.onmodal(nonce, id);
	}

	private async onReady(user: any) {
		this.UserId = user.id;
		logger.websocket(`连接 ready`);
	}

	private async onMessageCreate(message: any) {
		const { channel_id, author, interaction } = message;
		if (channel_id !== this.config.ChannelId) return;
		if (author?.id !== this.config.BotId) return;
		if (interaction && interaction.user.id !== this.UserId) return;
		logger.websocket(`新建消息[${message.id}]`);
		this.messageCreate(message);
	}

	private async onMessageUpdate(message: any) {
		const { channel_id, author, interaction } = message;
		if (channel_id !== this.config.ChannelId) return;
		if (author?.id !== this.config.BotId) return;
		if (interaction && interaction.user.id !== this.UserId) return;
		logger.websocket(`消息被更新[${message.id}]`);
		this.messageUpdate(message);
	}

	private async onMessageDelete(message: any) {
		const { channel_id, id } = message;
		if (channel_id !== this.config.ChannelId) return;
		for (const [key, value] of this.waitMjEvents.entries()) {
			if (value.id === id) {
				logger.websocket(`消息被删除[${message.id}]`);
				this.waitMjEvents.set(key, { ...value, del: true });
			}
		}
	}

	// parse message from ws
	private parseMessage(data: string) {
		const msg = JSON.parse(data);
		if (!msg.t) {
			return;
		}
		const message = msg.d;
		if (message.channel_id === this.config.ChannelId) {
			// 每一步的结果
			// this.log(data);
			// logger.info(`[message ${msg.t}] id:${msg.d.id}, nonce:${msg.d.nonce}`);
			// return;
		}
		switch (msg.t) {
			// 与 discord 建立 websocket 连接
			case "READY":
				this.emitSystem("ready", message.user);
				break;
			case "MESSAGE_CREATE":
				this.emitSystem("messageCreate", message);
				break;
			case "MESSAGE_UPDATE":
				this.emitSystem("messageUpdate", message);
				break;
			case "MESSAGE_DELETE":
				this.emitSystem("messageDelete", message);
			case "INTERACTION_CREATE":
				if (message.nonce) {
					this.emitSystem("interactionCreate", message);
				}
				break;
			case "INTERACTION_SUCCESS":
				if (message.nonce) {
					this.emitSystem("interactionSuccess", message);
				}
				break;
		}
	}

	//continue click appeal or Acknowledged
	private async continue(message: any) {
		const { components, id, flags, nonce } = message;
		const appeal = components[0]?.components[0];
		this.log("appeal", appeal);
		if (appeal) {
			var newnonce = nextNonce();
			const httpStatus = await this.MJApi.CustomApi({
				msgId: id,
				customId: appeal.custom_id,
				flags,
				nonce: newnonce,
			});
			this.log("appeal.httpStatus", httpStatus);
			if (httpStatus == 204) {
				this.on(newnonce, (data) => {
					this.emit(nonce, data);
				});
			}
		}
	}

	private async verifyHuman(message: any) {
		const { HuggingFaceToken } = this.config;
		if (HuggingFaceToken === "" || !HuggingFaceToken) {
			this.log("HuggingFaceToken is empty");
			return;
		}
		const { embeds, components, id, flags, nonce } = message;
		const uri = embeds[0].image.url;
		const categories = components[0].components;
		const classify = categories.map((c: any) => c.label);
		const verifyClient = new VerifyHuman(this.config);
		const category = await verifyClient.verify(uri, classify);
		if (category) {
			const custom_id = categories.find(
				(c: any) => c.label === category
			).custom_id;
			var newnonce = nextNonce();
			const httpStatus = await this.MJApi.CustomApi({
				msgId: id,
				customId: custom_id,
				flags,
				nonce: newnonce,
			});
			if (httpStatus == 204) {
				this.on(newnonce, (data) => {
					this.emit(nonce, data);
				});
			}
			this.log("verifyHumanApi", httpStatus, custom_id, message.id);
		}
	}
	private EventError(id: string, error: Error) {
		const event = this.getEventById(id);
		if (!event) {
			return;
		}
		const eventMsg: MJEmit = {
			error,
		};
		this.emit(event.nonce, eventMsg);
	}

	// 任务完成
	private done(message: any) {
		const { content, id, attachments, components, flags } = message;
		const { url, proxy_url, width, height } = attachments[0];
		let uri = url;
		// 替换图片代理
		if (this.config.ImageProxy !== "") {
			uri = uri.replace("https://cdn.discordapp.com/", this.config.ImageProxy);
		}
		const MJmsg: MJMessage = {
			id,
			flags,
			content,
			hash: uriToHash(url),
			progress: "done",
			uri,
			proxy_url,
			options: formatOptions(components),
			width,
			height,
		};
		this.filterMessages(MJmsg);
		return;
	}

	private processingImage(message: any) {
		const { content, id, attachments, flags } = message;
		if (!content) {
			return;
		}
		const event = this.getEventById(id);
		if (!event) {
			return;
		}
		event.prompt = content;
		//not image
		if (!attachments || attachments.length === 0) {
			return;
		}

		let uri = attachments[0].url;
		if (this.config.ImageProxy !== "") {
			uri = uri.replace("https://cdn.discordapp.com/", this.config.ImageProxy);
		}
		const MJmsg: MJMessage = {
			uri: uri,
			proxy_url: attachments[0].proxy_url,
			content: content,
			flags: flags,
			progress: content2progress(content),
		};
		const eventMsg: MJEmit = {
			message: MJmsg,
		};
		this.emitImage(event.nonce, eventMsg);
	}

	// 任务完成时过滤消息
	private async filterMessages(MJmsg: MJMessage) {
		// delay 300ms for discord message delete
		await this.timeout(300);
		// 通过 prompt 找到对应的 event.nonce
		const event = this.getEventByContent(MJmsg.content);

		if (!event) {
			logger.error(`FilterMessages not found, ${JSON.stringify(MJmsg)}, ${JSON.stringify(this.waitMjEvents)}`);
			return;
		}

		const eventMsg: MJEmit = {
			message: MJmsg,
		};

		this.emitImage(event.nonce, eventMsg);
	}

	// find event by prompt
	private getEventByContent(content: string) {
		const prompt = content2prompt(content);

		// logger.debug(`getEventByContent(), ${content}, ${prompt}`)
		// for (const [key, value] of this.waitMjEvents.entries()) {
		// 	logger.debug(`getEventByContent() in loop, ${content2prompt(value.prompt as string)}`);
		// }

		//fist del message
		for (const [key, value] of this.waitMjEvents.entries()) {
			if (
				value.del === true &&
				prompt === content2prompt(value.prompt as string)
			) {
				return value;
			}
		}

		for (const [key, value] of this.waitMjEvents.entries()) {
			if (prompt === content2prompt(value.prompt as string)) {
				return value;
			}
		}
	}

	private getEventById(id: string) {
		for (const [key, value] of this.waitMjEvents.entries()) {
			if (value.id === id) {
				return value;
			}
		}
	}
	private getEventByNonce(nonce: string) {
		for (const [key, value] of this.waitMjEvents.entries()) {
			if (value.nonce === nonce) {
				return value;
			}
		}
	}
	private updateMjEventIdByNonce(id: string, nonce: string) {
		if (nonce === "" || id === "") return;
		let event = this.waitMjEvents.get(nonce);
		if (!event) return;
		event.id = id;
		// this.log("updateMjEventIdByNonce success", this.waitMjEvents.get(nonce));
	}

	protected async log(...args: any[]) {
		this.config.Debug && console.info(...args, new Date().toISOString());
	}

	// discord 事件被触发, 执行对应函数
	emit(event: string, message: any) {
		this.event
			.filter((e) => e.event === event)
			.forEach((e) => e.callback(message));
	}

	private emitImage(type: string, message: MJEmit) {
		this.emit(type, message);
	}

	//FIXME: emitMJ rename
	private emitMJ(id: string, data: any) {
		const event = this.getEventById(id);
		if (!event) return;
		// logger.debug(`emitMJ() ${JSON.stringify(data)}`);
		this.emit(event.nonce, data);
	}

	on(event: string, callback: (message: any) => void) {
		this.event.push({ event, callback });
	}

	// 设置 discord 事件处理
	onSystem(
		event:
			| "ready"
			| "messageCreate"
			| "messageUpdate"
			| "messageDelete"
			| "interactionCreate"
			| "interactionSuccess",
		callback: (message: any) => void
	) {
		this.on(event, callback);
	}

	// 触发 discord 事件
	private emitSystem(
		type:
			| "ready"
			| "messageCreate"
			| "messageUpdate"
			| "messageDelete"
			| "interactionSuccess"
			| "interactionCreate",
		message: MJEmit
	) {
		this.emit(type, message);
	}

	// event 只处理一次
	once(event: string, callback: (message: any) => void) {
		const once = (message: any) => {
			this.remove(event, once);
			callback(message);
		};
		this.event.push({ event, callback: once });
	}

	// 删除事件和回调
	remove(event: string, callback: (message: any) => void) {
		this.event = this.event.filter(
			(e) => e.event !== event && e.callback !== callback
		);
	}

	// 删除事件
	removeEvent(event: string) {
		this.event = this.event.filter((e) => e.event !== event);
	}

	//FIXME: USE ONCE
	onceInfo(callback: (message: any) => void) {
		const once = (message: any) => {
			this.remove("info", once);
			callback(message);
		};
		this.event.push({ event: "info", callback: once });
	}

	//FIXME: USE ONCE
	onceSettings(callback: (message: any) => void) {
		const once = (message: any) => {
			this.remove("settings", once);
			callback(message);
		};
		this.event.push({ event: "settings", callback: once });
	}

	onceMJ(nonce: string, callback: (data: any) => void) {
		const once = (message: any) => {
			this.remove(nonce, once);
			//FIXME: removeWaitMjEvent
			this.removeWaitMjEvent(nonce);
			callback(message);
		};
		//FIXME: addWaitMjEvent
		this.waitMjEvents.set(nonce, { nonce });
		this.event.push({ event: nonce, callback: once });
	}

	private removeSkipMessageId(messageId: string) {
		const index = this.skipMessageId.findIndex((id) => id !== messageId);
		if (index !== -1) {
			this.skipMessageId.splice(index, 1);
		}
	}

	private removeWaitMjEvent(nonce: string) {
		this.waitMjEvents.delete( nonce );
		// this.waitMjEvents.clear();
	}

	onceImage(nonce: string, callback: (data: MJEmit) => void) {
		const once = (data: MJEmit) => {
			const { message, error } = data;
			if (error || (message && message.progress === "done")) {
				// 指导报错或者结束才会删除当前的事件
				this.remove(nonce, once);
			}
			callback(data);
		};

		this.event.push({ event: nonce, callback: once });
	}

	async waitImageMessage({
		nonce,
		prompt,
		onmodal,
		messageId,
		loading,
	}: {
		nonce: string; // Number once
		prompt?: string;
		messageId?: string;
		onmodal?: OnModal;
		loading?: LoadingHandler;
	}) {
		if (messageId) this.skipMessageId.push(messageId);

		return new Promise<MJMessage | null>((resolve, reject) => {
			const handleImageMessage = ({ message, error }: MJEmit) => {
				// 错误的 message
				if (error) {
					this.removeWaitMjEvent(nonce);
					reject(error);
					return;
				}
				// 完成的 message
				if (message && message.progress === "done") {
					this.removeWaitMjEvent(nonce);
					messageId && this.removeSkipMessageId(messageId);
					resolve(message);
					return;
				}
				// 处理过程中的 message
				message && loading && loading(message, message.progress || "");
			};

			this.waitMjEvents.set(nonce, {
				nonce,
				prompt,
				// 只有交互成功后，才会调用 modal 函数
				onmodal: async (nonce, id) => {
					if (onmodal === undefined) {
						// reject(new Error("onmodal is not defined"))
						return "";
					}
					var nonce = await onmodal(nonce, id);
					if (nonce === "") {
						// reject(new Error("onmodal return empty nonce"))
						return "";
					}
					this.removeWaitMjEvent(nonce);
					this.waitMjEvents.set(nonce, { nonce });
					this.onceImage(nonce, handleImageMessage);
					return nonce;
				},
			});

			this.onceImage(nonce, handleImageMessage);
		});
	}

	async waitDescribe(nonce: string) {
		return new Promise<MJDescribe | null>((resolve) => {
			this.onceMJ(nonce, (message) => {
				resolve(message);
			});
		});
	}

	async waitShorten(nonce: string) {
		return new Promise<MJShorten | null>((resolve) => {
			this.onceMJ(nonce, (message) => {
				resolve(message);
			});
		});
	}
	async waitContent(event: string) {
		return new Promise<string | null>((resolve) => {
			this.once(event, (message) => {
				resolve(message);
			});
		});
	}
	async waitInfo() {
		return new Promise<MJInfo | null>((resolve, reject) => {
			this.onceInfo((message) => {
				resolve(formatInfo(message));
			});
		});
	}
	async waitSettings() {
		return new Promise<MJSettings | null>((resolve, reject) => {
			this.onceSettings((message) => {
				resolve({
					id: message.id,
					flags: message.flags,
					content: message,
					options: formatOptions(message.components),
				});
			});
		});
	}
}
