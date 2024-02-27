import {
	DefaultMJConfig,
	LoadingHandler,
	MJConfig,
	MJConfigParam,
} from "./interfaces";
import { MidjourneyApi } from "./midjourney.api";
import { MidjourneyMessage } from "./discord.message";
import {
	toRemixCustom,
	custom2Type,
	nextNonce,
	random,
	base64ToBlob,
} from "./utils";
import { WsMessage } from "./discord.ws";
import { faceSwap } from "./face.swap";
import { logger } from "./server/logger";
import { Retry } from "./utils/retry";

type TaskMsgType = {
	msgId: string;
	hash: string;
	flags: number;
	content?: string;
	loading?: LoadingHandler;
};

export class Midjourney extends MidjourneyMessage {
	public config: MJConfig;
	private wsClient?: WsMessage;
	public MJApi: MidjourneyApi;

	constructor(defaults: MJConfigParam) {
		const { SalaiToken } = defaults;
		if (!SalaiToken) {
			throw new Error("SalaiToken are required");
		}
		super(defaults);
		this.config = {
			...DefaultMJConfig,
			...defaults,
		};
		this.MJApi = new MidjourneyApi(this.config);
	}

	async Connect() {
		if (!this.config.Ws) {
			return this;
		}
		await this.MJApi.allCommand();
		//if auth failed, will throw error
		// if (this.config.ServerId) {
		// 	await this.MJApi.getCommand("settings");
		// } else {
		// 	await this.MJApi.allCommand();
		// }
		if (this.wsClient) return this;
		this.wsClient = new WsMessage(this.config, this.MJApi);
		await this.wsClient.onceReady();
		return this;
	}

	@Retry(3)
	async init() {
		await this.Connect();
		const settings = await this.Settings();
		if (settings) {
			// this.log(`settings:`, settings.content);
			const remix = settings.options.find((o) => o.label === "Remix mode");
			if (remix?.style == 3) {
				this.config.Remix = true;
				this.log(`Remix mode enabled`);
			}
		}
		return this;
	}

	// data: base64 | uri | blob
	async UploadImages(images: (string | Blob)[]) {
		console.log("in UploadImages, images.length", images.length);
		// upload images
		const DcImages: any[] = [];
		for (const image of images) {
			let DcImage: any = null;
			if (image instanceof Blob) { // Blob
				DcImage = await this.MJApi.UploadImageByBolb(image);
			}
			else if (typeof image === "string") {
				if (image.startsWith("data:")) { // base64
					DcImage = await this.MJApi.UploadImageByBase64(image);
				}
				else { // uri
					DcImage = await this.MJApi.UploadImageByUri(image);
				}
			}
			if (DcImage) {
				logger.info(`图片上传成功. ${DcImage.filename}`);
			}
			DcImages.push(DcImage);
		}
		// send message
		const response = await this.MJApi.sendApi(`upload image`, DcImages);
		logger.info(`图片消息发送.`);
		const json = await response?.json();
		return json?.attachments.map((attch: any) => ({ url: attch.url, proxy_url: attch.proxy_url })) ?? [];
	}

	async Imagine(prompt: string, loading?: LoadingHandler, seed?: string) {
		prompt = prompt.trim();
		// task id
		// const seed = random(100000000000, 999999999999);
		prompt = `<<<${seed}>>> ${prompt}`;
		if (this.config.Ws) {
			await this.getWsClient();
		}
		const nonce = nextNonce();
		logger.info(`Imagine`, prompt, "nonce", nonce);
		const httpStatus = await this.MJApi.ImagineApi(prompt, nonce);
		if (httpStatus !== 204) {
			throw new Error(`ImagineApi failed with status ${httpStatus}`);
		}
		// 使用 wss
		if (this.wsClient) {
			return await this.wsClient.waitImageMessage({ nonce, loading, prompt });
		}
		// 使用轮询
		else {
			this.log(`await generate image`);
			const msg = await this.WaitMessage(prompt, loading);
			this.log(`image generated`, prompt, msg?.uri);
			return msg;
		}
	}

	// check ws enabled && connect
	private async getWsClient() {
		if (!this.config.Ws) {
			throw new Error(`ws not enabled`);
		}
		if (!this.wsClient) {
			await this.Connect();
		}
		if (!this.wsClient) {
			throw new Error(`ws not connected`);
		}
		return this.wsClient;
	}

	async Settings() {
		const wsClient = await this.getWsClient();
		const nonce = nextNonce();
		const httpStatus = await this.MJApi.SettingsApi(nonce);
		if (httpStatus !== 204) {
			throw new Error(`ImagineApi failed with status ${httpStatus}`);
		}
		return wsClient.waitSettings();
	}
	async Reset() {
		const settings = await this.Settings();
		if (!settings) {
			throw new Error(`Settings not found`);
		}
		const reset = settings.options.find((o) => o.label === "Reset Settings");
		if (!reset) {
			throw new Error(`Reset Settings not found`);
		}
		const httpstatus = await this.MJApi.CustomApi({
			msgId: settings.id,
			customId: reset.custom,
			flags: settings.flags,
		});
		if (httpstatus !== 204) {
			throw new Error(`Reset failed with status ${httpstatus}`);
		}
	}

	async Info() {
		const wsClient = await this.getWsClient();
		const nonce = nextNonce();
		const httpStatus = await this.MJApi.InfoApi(nonce);
		if (httpStatus !== 204) {
			throw new Error(`InfoApi failed with status ${httpStatus}`);
		}
		return wsClient.waitInfo();
	}

	async Fast() {
		const nonce = nextNonce();
		const httpStatus = await this.MJApi.FastApi(nonce);
		if (httpStatus !== 204) {
			throw new Error(`FastApi failed with status ${httpStatus}`);
		}
		return null;
	}
	async Relax() {
		const nonce = nextNonce();
		const httpStatus = await this.MJApi.RelaxApi(nonce);
		if (httpStatus !== 204) {
			throw new Error(`RelaxApi failed with status ${httpStatus}`);
		}
		return null;
	}
	async SwitchRemix() {
		const wsClient = await this.getWsClient();
		const nonce = nextNonce();
		const httpStatus = await this.MJApi.SwitchRemixApi(nonce);
		if (httpStatus !== 204) {
			throw new Error(`RelaxApi failed with status ${httpStatus}`);
		}
		return wsClient.waitContent("prefer-remix");
	}

	async Describe(image: string | Blob) {
		if (image instanceof Blob) {
			return this.DescribeByBlob(image);
		}
		else if (typeof image === "string") {
			if (image.startsWith("data:")) {
				return this.DescribeByBase64(image);
			}
			else {
				return this.DescribeUri(image);
			}
		}
	}

	async DescribeUri(imgUri: string) {
		const wsClient = await this.getWsClient();
		const nonce = nextNonce();
		const DcImage = await this.MJApi.UploadImageByUri(imgUri);
		this.log(`Describe`, DcImage);
		const httpStatus = await this.MJApi.DescribeApi(DcImage, nonce);
		if (httpStatus !== 204) {
			throw new Error(`DescribeApi failed with status ${httpStatus}`);
		}
		return wsClient.waitDescribe(nonce);
	}

	async DescribeByBase64(base64: string) {
		const wsClient = await this.getWsClient();
		const nonce = nextNonce();
		const DcImage = await this.MJApi.UploadImageByBase64(base64);
		this.log(`Describe`, DcImage);
		const httpStatus = await this.MJApi.DescribeApi(DcImage, nonce);
		if (httpStatus !== 204) {
			throw new Error(`DescribeApi failed with status ${httpStatus}`);
		}
		return wsClient.waitDescribe(nonce);
	}

	async DescribeByBlob(blob: Blob) {
		const wsClient = await this.getWsClient();
		const nonce = nextNonce();
		const DcImage = await this.MJApi.UploadImageByBolb(blob);
		this.log(`Describe`, DcImage);
		const httpStatus = await this.MJApi.DescribeApi(DcImage, nonce);
		if (httpStatus !== 204) {
			throw new Error(`DescribeApi failed with status ${httpStatus}`);
		}
		return wsClient.waitDescribe(nonce);
	}

	async Blend(images: string[], dimensions: "1:1" | "2:3" | "3:2" = "1:1") {
		if (images.length >= 2) {
			if (typeof images?.[0] === "string") {
				if (images?.[0].startsWith("data:")) {
					return this.BlendByBase64(images, dimensions);
				}
			}
		}
	}

	async BlendByBase64(images: string[], dimensions: string = "1:1", loading?: LoadingHandler) {
		const wsClient = await this.getWsClient();
		const nonce = nextNonce();
		const DcImages = await Promise.all(images.map((image, index) => this.MJApi.UploadImageByBase64(image, `图片${index + 1}.png`)));
		this.log(`Blend`, DcImages);
		const httpStatus = await this.MJApi.BlendApi(DcImages, dimensions, nonce);
		if (httpStatus !== 204) {
			throw new Error(`BlendApi failed with status ${httpStatus}`);
		}
		return await wsClient.waitImageMessage({ nonce, loading });
	}

	async Shorten(prompt: string) {
		const wsClient = await this.getWsClient();
		const nonce = nextNonce();
		const httpStatus = await this.MJApi.ShortenApi(prompt, nonce);
		if (httpStatus !== 204) {
			throw new Error(`ShortenApi failed with status ${httpStatus}`);
		}
		return wsClient.waitShorten(nonce);
	}

	async Variation({ index, msgId, hash, content, flags, loading }: TaskMsgType & { index: 1 | 2 | 3 | 4 }) {
		return await this.Custom({
			customId: `MJ::JOB::variation::${index}::${hash}`,
			msgId,
			content,
			flags,
			loading,
		});
	}

	async Upscale({ index, msgId, hash, content, flags, loading }: TaskMsgType & { index: 1 | 2 | 3 | 4 }) {
		return await this.Custom({
			customId: `MJ::JOB::upsample::${index}::${hash}`,
			msgId,
			content,
			flags,
			loading,
		});
	}

	async Custom({ msgId, customId, content, flags, loading }: Omit<TaskMsgType, "hash"> & { customId: string }) {
		if (this.config.Ws) {
			await this.getWsClient();
		}
		const nonce = nextNonce();
		const httpStatus = await this.MJApi.CustomApi({
			msgId,
			customId,
			flags,
			nonce,
		});
		if (httpStatus !== 204) {
			throw new Error(`CustomApi failed with status ${httpStatus}`);
		}
		if (this.wsClient) {
			return await this.wsClient.waitImageMessage({
				nonce,
				loading,
				messageId: msgId,
				prompt: content,
				onmodal: async (nonde, id) => {
					if (content === undefined || content === "") {
						return "";
					}
					const newNonce = nextNonce();
					switch (custom2Type(customId)) {
						case "customPan":
							const panHttpStatus = await this.MJApi.CustomPanImagineApi({
								msgId: id,
								customId,
								prompt: content,
								nonce: newNonce,
							});
							if (panHttpStatus !== 204) {
								throw new Error(
									`CustomPanImagineApi failed with status ${panHttpStatus}`
								);
							}
							return newNonce;
						case "customZoom":
							const httpStatus = await this.MJApi.CustomZoomImagineApi({
								msgId: id,
								customId,
								prompt: content,
								nonce: newNonce,
							});
							if (httpStatus !== 204) {
								throw new Error(
									`CustomZoomImagineApi failed with status ${httpStatus}`
								);
							}
							return newNonce;
						case "variation":
							if (this.config.Remix !== true) {
								return "";
							}
							customId = toRemixCustom(customId);
							const remixHttpStatus = await this.MJApi.RemixApi({
								msgId: id,
								customId,
								prompt: content,
								nonce: newNonce,
							});
							if (remixHttpStatus !== 204) {
								throw new Error(
									`RemixApi failed with status ${remixHttpStatus}`
								);
							}
							return newNonce;
						default:
							return "";
							throw new Error(`unknown customId ${customId}`);
					}
				},
			});
		}
		if (content === undefined || content === "") {
			throw new Error(`content is required`);
		}
		return await this.WaitMessage(content, loading);
	}

	async ZoomOut({ level, msgId, hash, content, flags, loading }: TaskMsgType & { level: "high" | "low" | "2x" | "1.5x" | "square" }) {
		let customId: string;
		switch (level) {
			case "high":
				customId = `MJ::JOB::high_variation::1::${hash}::SOLO`;
				break;
			case "low":
				customId = `MJ::JOB::low_variation::1::${hash}::SOLO`;
				break;
			case "2x":
				customId = `MJ::Outpaint::50::1::${hash}::SOLO`;
				break;
			case "1.5x":
				customId = `MJ::Outpaint::75::1::${hash}::SOLO`;
				break;
			case "square":
				customId = `MJ::Outpaint::100::1::${hash}::SOLO`;
				break;
		}
		return this.Custom({
			msgId,
			customId,
			content,
			flags,
			loading,
		});
	}

	// feature
	async Pan({ direction, content, msgId, hash, flags, loading, }: TaskMsgType & { direction: "left" | "right" | "up" | "down" }) {
		let customId = `MJ::JOB::pan_${direction}::1::${hash}::SOLO`;
		return this.Custom({
			msgId,
			customId,
			content,
			flags,
			loading,
		});
	}

	async Reroll({ msgId, hash, content, flags, loading, }: TaskMsgType) {
		return await this.Custom({
			customId: `MJ::JOB::reroll::0::${hash}::SOLO`,
			msgId,
			content,
			flags,
			loading,
		});
	}

	async FaceSwap(target: string, source: string) {
		const wsClient = await this.getWsClient();
		const app = new faceSwap(this.config.HuggingFaceToken);
		const Target = await (await this.config.fetch(target)).blob();
		const Source = await (await this.config.fetch(source)).blob();
		const res = await app.changeFace(Target, Source);
		this.log(res[0]);
		const blob = await base64ToBlob(res[0] as string);
		const DcImage = await this.MJApi.UploadImageByBolb(blob);
		const nonce = nextNonce();
		const httpStatus = await this.MJApi.DescribeApi(DcImage, nonce);
		if (httpStatus !== 204) {
			throw new Error(`DescribeApi failed with status ${httpStatus}`);
		}
		return wsClient.waitDescribe(nonce);
	}

	Close() {
		if (this.wsClient) {
			this.wsClient.close();
			this.wsClient = undefined;
		}
	}
}
