const Router = require('koa-router')
export const router = new Router();

router.post("/faceswap", (ctx: any) => {
	ctx.body = "Hello World.";
});