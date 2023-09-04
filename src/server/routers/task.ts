const Router = require('koa-router')
export const router = new Router();

router.post("/connect", (ctx: any)=>{
	ctx.body = "Hello World.";
});

router.post("/close", (ctx: any)=>{
	ctx.body = "Hello World.";
});

router.post("/tasklist", (ctx: any)=>{
	ctx.body = "Hello World.";
});

router.post("/taskquery", (ctx: any)=>{
	ctx.body = "Hello World.";
});