const Router = require('koa-router')
import "dotenv/config";
import { logger } from "../logger";
import type { Midjourney } from "../../midjourney";

export const router = new Router();

type CtxType = {
	[key: string]: any;
	mjc: Midjourney;
	wss: Map<string, WebSocket>;
};

const loadingHandler = (ctx: CtxType, uri: string, progress: string, seed?: string) => {
	logger.info(`loading ${uri}, progress ${progress}, seed ${seed}`);
}

router.get("/", (ctx: CtxType) => {
	ctx.body = "Hello World.";
});

router.post("/imagine", async (ctx: CtxType) => {
	let { prompt } = ctx.request.body
	logger.info(`[imagine] prompt: ${prompt}`);
	try {
		const msg = await ctx.mjc.Imagine(prompt, loadingHandler.bind(null, ctx));
		ctx.body = msg;
	}
	catch (error: any) {
		logger.error(`error: ${error}`);
		ctx.body = error;
	}
});

router.post("/variation", async (ctx: CtxType) => {
	let { task_msg, index } = ctx.request.body
	logger.info(`[variation] task_msg: ${task_msg}, index: ${index}`);
	try {
		const msg = await ctx.mjc.Variation({
			index,
			msgId: <string>task_msg.id,
			hash: <string>task_msg.hash,
			flags: task_msg.flags,
			content: task_msg.content,
			loading: loadingHandler.bind(null, ctx)
		});
		ctx.body = msg;
	}
	catch (error: any) {
		logger.error(`error: ${error}`);
		ctx.body = error;
	}
});

router.post("/upscale", async (ctx: CtxType) => {
	let { task_msg, index } = ctx.request.body
	logger.info(`[upscale] task_msg: ${task_msg}, index: ${index}`);
	try {
		const msg = await ctx.mjc.Upscale({
			index,
			msgId: <string>task_msg.id,
			hash: <string>task_msg.hash,
			flags: task_msg.flags,
			content: task_msg.content,
			loading: loadingHandler.bind(null, ctx)
		});
		ctx.body = msg;
	}
	catch (error: any) {
		logger.error(`error: ${error}`);
		ctx.body = error;
	}
});

router.post("/reroll", async (ctx: CtxType) => {
	let { task_msg } = ctx.request.body
	logger.info(`[reroll] task_msg: ${task_msg}`);
	try {
		const msg = await ctx.mjc.Reroll({
			msgId: <string>task_msg.id,
			hash: <string>task_msg.hash,
			flags: task_msg.flags,
			content: task_msg.content,
			loading: loadingHandler.bind(null, ctx)
		});
		ctx.body = msg;
	}
	catch (error: any) {
		logger.error(`error: ${error}`);
		ctx.body = error;
	}
});

function base64ToBlob(base64: string, mimeType: string): Blob {
	const byteCharacters = atob(base64);
	const byteArrays = [];
	for (let offset = 0; offset < byteCharacters.length; offset += 512) {
		const slice = byteCharacters.slice(offset, offset + 512);
		const byteNumbers = new Array(slice.length);
		for (let i = 0; i < slice.length; i++) {
			byteNumbers[i] = slice.charCodeAt(i);
		}
		const byteArray = new Uint8Array(byteNumbers);
		byteArrays.push(byteArray);
	}
	return new Blob(byteArrays, { type: mimeType });
}

function dataURItoBlob(dataURI: string) {
    const [header, base64Data] = dataURI.split(',');
    if (header && base64Data) {
        const data = atob(base64Data);
        const mimeType = header.split(':')[1].split(';')[0];
        let uint8Array = new Uint8Array(data.length);
        for (let i = 0; i < data.length; ++i) {
            uint8Array[i] = data.charCodeAt(i);
        }
        return new Blob([uint8Array], { type: mimeType });
    }
}

router.post("/describe", async (ctx: CtxType) => {
	let { img, base64, mimeType } = ctx.request.body
	logger.info(`[describe] img: ${img} ${base64}`);
	try {
		let msg: any = null;
		if (base64 && img) {
			const blob = dataURItoBlob(img as string);
			if (blob){
				msg = await ctx.mjc.DescribeByBlob( blob );
			}
			else {
				throw Error("转换为 Blob 时出现错误");
			}
		}
		else if (img) {
			msg = await ctx.mjc.Describe(img as string);
		}
		ctx.body = msg;
	}
	catch (error: any) {
		logger.error(`error: ${error}`);
		ctx.body = JSON.stringify(error);
	}
});

router.post("/zoomout", async (ctx: CtxType) => {
	let { task_msg, scale } = ctx.request.body
	logger.info(`[zoomout] scale: ${scale}`);
	try {
		const msg = await ctx.mjc.ZoomOut({
			level: scale,
			msgId: <string>task_msg.id,
			hash: <string>task_msg.hash,
			flags: task_msg.flags,
			content: task_msg.content,
			loading: loadingHandler.bind(null, ctx)
		})
		ctx.body = msg;
	}
	catch (error: any) {
		logger.error(`error: ${error}`);
		ctx.body = error;
	}
});

router.post("/shorten", async (ctx: CtxType) => {
	let { prompt } = ctx.request.body
	logger.info(`[shorten] prompt: ${prompt}`);
	try {
		const msg = await ctx.mjc.Shorten(prompt);
		ctx.body = msg;
	}
	catch (error: any) {
		logger.error(`error: ${error}`);
		ctx.body = error;
	}
});

router.post("/pan", async (ctx: CtxType) => {
	let { direction, prompt, task_msg } = ctx.request.body
	logger.info(`[pan] direction: ${direction}`);
	try {
		const msg = await ctx.mjc.Custom({
			content: `${prompt}`,
			customId: `MJ::JOB::pan_${direction}::1::${task_msg.hash}::SOLO`,
			msgId: <string>task_msg.id,
			flags: task_msg.flags,
			loading: loadingHandler.bind(null, ctx)
		});
		// const msg = await ctx.mjc.Pan({
		// 	direction,
		// 	prompt,
		// 	msgId: <string>task_msg.id,
		// 	hash: <string>task_msg.hash,
		// 	flags: task_msg.flags,
		// 	loading: loadingHandler.bind(null, ctx)
		// });
		ctx.body = msg;
	}
	catch (error: any) {
		logger.error(`error: ${error}`);
		ctx.body = error;
	}
});
