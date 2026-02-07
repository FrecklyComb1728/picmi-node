# PicMi-Node

![License](https://img.shields.io/badge/license-Unlicense-blue.svg)
![Node](https://img.shields.io/badge/nodejs-runtime-brightgreen.svg)

PicMi-Node 是一个基于 Node.js 的轻量级文件与图片管理服务，提供文件浏览、上传、移动、重命名、公开路径与运行状态监控等能力，适合做私有图床或简单文件管理后台。

> 事先声明，PicMi-Node 99%的代码都是AI生成，不过我也检查了一下，基本没有问题。

相关项目：

- [PicMi](https://github.com/FrecklyComb1728/picmi)：主控

## 主要特性

- 本地文件存储目录浏览与管理
- 上传（multipart 与 base64）与静态访问
- 公开路径开关与免登录访问
- 运行状态与带宽监控（含 SSE 推送）
- 支持多种存储元数据后端（SQLite / MySQL / PostgreSQL / Supabase）
- IP 白名单与密码认证

## 技术栈

- Node.js
- Express
- Busboy
- SQLite / MySQL / PostgreSQL / Supabase SDK

## 目录结构

```
.
├─ data
│  └─ config.json
├─ src
│  ├─ config.js
│  ├─ images.js
│  ├─ paths.js
│  ├─ security.js
│  ├─ server.js
│  ├─ status.js
│  └─ store.js
├─ index.js
├─ package.json
└─ docs
```

## 快速开始

中文说明：安装依赖并启动服务

```bash
pnpm install && pnpm start
```

默认监听端口为 5409，配置文件会在首次启动时生成。

## 配置说明

配置文件优先级：项目根目录 config.json 优先于 data/config.json。首次启动会自动创建 data/config.json 并写入默认配置。

默认配置示例：

```json
{
  "port": 5409,
  "storageRoot": "uploads",
  "auth": {
    "password": "picmi-node"
  },
  "ipWhitelist": [],
  "ipHeader": "",
  "db": {
    "type": "sqlite",
    "sqlite": {
      "file": "data/sqlite.db"
    },
    "mysql": {
      "host": "",
      "port": 3306,
      "user": "",
      "password": "",
      "database": ""
    },
    "postgresql": {
      "host": "",
      "port": 5432,
      "user": "",
      "password": "",
      "database": ""
    },
    "supabase": {
      "url": "",
      "key": ""
    }
  },
  "storage": {
    "type": "local"
  }
}
```

关键字段说明：

- port：服务监听端口
- storageRoot：存储根目录（相对项目根目录）
- auth.password：访问密码，为空时不启用认证
- ipWhitelist：IP 白名单，可填单个 IP 或 CIDR
- ipHeader：从指定请求头读取客户端 IP（如反向代理场景）
- db：公开路径的元数据存储后端配置
- storage.type：当前仅支持 local

## API 概览

统一返回结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

认证方式：

- 请求头 x-node-password
- 请求头 x-picmi-node-password
- Authorization: Bearer <password>

详细接口说明见 [docs/api-reference.md](docs/api-reference.md)。

## 文档
~~文档是AI写的将就着看，实在不行就提issue~~

- [docs/index.md](docs/index.md)
- [docs/getting-started.md](docs/getting-started.md)
- [docs/configuration.md](docs/configuration.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/api-reference.md](docs/api-reference.md)
- [docs/database.md](docs/database.md)
- [docs/storage.md](docs/storage.md)
- [docs/security.md](docs/security.md)
- [docs/operations.md](docs/operations.md)
- [docs/faq.md](docs/faq.md)

## 许可证

本项目使用 Unlicense 许可，详情见 [LICENSE](LICENSE)。