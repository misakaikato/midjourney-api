const Router = require('koa-router')
export const router = new Router();

router.post("/tasklist", (ctx: any)=>{
	ctx.body = "Hello World.";
});

router.post("/taskquery", (ctx: any)=>{
	ctx.body = "Hello World.";
});