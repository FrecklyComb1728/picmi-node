# 架构与流程

## 启动流程

1. 读取配置文件（root/config.json 优先）
2. 解析 storageRoot 并创建目录
3. 写入/读取临时文件以验证读写权限
4. 校验元数据库连接
5. 启动 Express 服务

入口文件：[index.js](file:///e:/Github/picmi-node/index.js)

## 关键模块

### server.js

负责 HTTP 路由、认证、静态资源服务、上传与文件管理。

### config.js

负责配置文件加载、默认配置生成与深度合并。

### images.js

负责文件列表、目录创建、复制与删除。

### paths.js

负责路径规范化与路径穿越防护。

### security.js

负责 IP 白名单与认证校验。

### store.js

负责公开路径的元数据读写，并支持多种后端。

### status.js

负责系统与应用运行状态采样与 SSE 推送数据构造。

## 请求处理链路

1. 白名单校验
2. 流量统计中间件
3. JSON 解析（1GB 上限）
4. 路由处理与认证校验
5. 统一返回结构

## 数据流

- 文件实体：落盘于 storageRoot
- 公开路径：存储于 public_paths 表
- 静态访问：通过 /uploads 映射到 storageRoot
