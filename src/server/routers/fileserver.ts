import originalFs from 'fs';
import fs from 'fs/promises';
import path from 'path';
import Router from 'koa-router';
import chokidar from 'chokidar';

const dir_list = process.env.SHARE_DIR_LIST ? process.env.SHARE_DIR_LIST.split(',') : [];
const DEBOUNCE_TIME = 1000;
const POLL_INTERVAL = 1 * 60 * 1000;
const IMAGE_REGEX = /\.(png|jpg)$/;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
let debounceTimeout: NodeJS.Timeout | null = null;
let cache: any = null;

export const router = new Router();

interface IFileNode {
    name: string;
    type: 'file' | 'dir';
    path?: string;
    creatTimeStamp?: number;
    children?: IFileNode[];
}

const isAllowedImage = (filename: string) => IMAGE_REGEX.test(filename);

const walk = async (dir: string): Promise<IFileNode[]> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const childrenPromises = entries.map(async (entry) => {
        const filePath = path.join(dir, entry.name);
        if (entry.isFile() && isAllowedImage(entry.name)) {
            const stats = await fs.stat(filePath);
            return {
                // name: entry.name,
                type: "file",
                path: filePath,
                creatTimeStamp: stats.ctimeMs
            };
        } else if (entry.isDirectory()) {
            return {
                name: entry.name,
                type: "dir",
                children: await walk(filePath)
            };
        }
        return null;
    });

    return (await Promise.all(childrenPromises)).filter(Boolean) as IFileNode[];
};

const flatten = (node: IFileNode, flatList: IFileNode[]) => {
    if (node.type === 'file') flatList.push(node);
    else if (node.children) node.children.forEach(child => flatten(child, flatList));
};

const generateShareDirData = async () => {
    cache = null;
    const dirPromises = dir_list.map(async dir => ({
        name: dir,
        type: "dir",
        children: await walk(dir)
    }));

    const files = await Promise.all(dirPromises);
    const flatList: IFileNode[] = [];
    files.forEach(file => flatten(file, flatList));
    flatList.sort((a, b) => (b.creatTimeStamp ?? 0) - (a.creatTimeStamp ?? 0));
    return { flatList };
};

const setupWatchers = () => {
    chokidar.watch(dir_list, { ignored: IMAGE_REGEX, usePolling: false })
        .on('all', () => {
            if (debounceTimeout) clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(generateShareDirData, DEBOUNCE_TIME);
        })
        .on('error', error => console.error(`Error watching files: ${error}`));
};

const periodicRefresh = () => {
    generateShareDirData()
        .then(() => console.log('Cache refreshed'))
        .catch(err => console.error('Error refreshing cache:', err));
};

const allowedDirSet = new Set(dir_list.map(dir => path.resolve(dir)));

const isInsideAllowedDir = (userPath: string) => {
    const absolutePath = path.resolve(userPath);
    return Array.from(allowedDirSet).some(allowedDir => absolutePath.startsWith(allowedDir) || absolutePath === allowedDir);
};

router.get("/shareDir", async (ctx: any) => {
    if (!cache) {
        cache = await generateShareDirData();
    }
    ctx.body = cache;
});

router.get("/file", async (ctx: any) => {
    if (!isInsideAllowedDir(ctx.query.path)) {
        ctx.status = FORBIDDEN;
        ctx.body = "Access Denied";
        return;
    }

    const absolutePath = path.resolve(ctx.query.path);
    try {
        const stat = await fs.stat(absolutePath);
        if (stat.isFile() && isAllowedImage(absolutePath)) {
            const ext = path.extname(absolutePath);
            ctx.set('Content-Type', ext === '.png' ? 'image/png' : 'image/jpeg');
            ctx.body = originalFs.createReadStream(absolutePath);
        } else if (stat.isDirectory()) {
            ctx.body = await fs.readdir(absolutePath);
        }
    } catch {
        ctx.status = NOT_FOUND;
        ctx.body = "File or directory not found";
    }
});

setupWatchers();
setInterval(periodicRefresh, POLL_INTERVAL);
