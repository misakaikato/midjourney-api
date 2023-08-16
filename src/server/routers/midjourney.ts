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
	// const wss = ctx.wss;
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


router.post("/describe", async (ctx: CtxType) => {
	let { img } = ctx.request.body
	logger.info(`[describe] img: ${img}`);
	try {
		const msg = await ctx.mjc.Describe(img as string);
		ctx.body = msg;
	}
	catch (error: any) {
		logger.error(`error: ${error}`);
		ctx.body = error;
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
