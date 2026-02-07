# 快速开始

## 环境要求

- Node.js 运行环境
- Windows / Linux / macOS
- 推荐使用 pnpm 作为包管理器

## 安装与启动

中文说明：安装依赖并启动服务

```bash
pnpm install && pnpm start
```


开发模式（自动重启）：

```bash
pnpm dev
```

## 首次启动说明

- 程序启动时会自动生成 data/config.json（若不存在）
- 默认端口 5409
- 默认存储目录 uploads
- 默认访问密码 picmi-node

## 健康检查

中文说明：获取服务健康状态

```bash
curl.exe http://localhost:5409/api/health
```

English: Check health endpoint

```bash
curl.exe http://localhost:5409/api/health
```

## 带认证的请求示例

中文说明：使用密码访问需要认证的接口

```bash
curl.exe -H "x-picmi-node-password: picmi-node" http://localhost:5409/api/status
```

English: Call an authenticated endpoint

```bash
curl.exe -H "x-picmi-node-password: picmi-node" http://localhost:5409/api/status
```
