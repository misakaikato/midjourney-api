# 使用官方的 Node.js 16 镜像作为基础镜像
FROM node:18

# 设置工作目录
WORKDIR /usr/src/app

# 将 package.json 和 package-lock.json 文件复制到工作目录
COPY package*.json ./

# 安装项目依赖
RUN npm install

# 将必要的文件和目录复制到工作目录
COPY src ./src
COPY tsconfig.json tsconfig.json

# 声明暴露的端口
EXPOSE 3000
EXPOSE 3001

# 定义启动容器时运行的命令
CMD ["yarn", "server"]