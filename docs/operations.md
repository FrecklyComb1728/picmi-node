# 运行与监控

## 启动校验

启动时会进行以下校验：

- storageRoot 目录存在且可读写
- 能在 storageRoot 内创建、读取与删除临时文件
- 元数据库连接可用

## 日志

以下行为会输出日志：

- 服务启动
- 状态 SSE 连接与断开
- 文件上传（multipart 与 base64）

## 状态数据字段

`/api/status` 与 `/api/status/stream` 的 data 字段包含以下信息：

| 字段 | 说明 |
| --- | --- |
| mode | 存储模式，默认 local |
| time | 服务器时间 ISO 字符串 |
| cpu.usage | CPU 使用率 (0-1) |
| cpuPercent | CPU 使用率 (0-100) |
| memory.total | 总内存字节 |
| memory.used | 已用内存字节 |
| memory.usage | 内存使用率 (0-1) |
| memoryTotal | 总内存字节 |
| memoryUsed | 已用内存字节 |
| disk.total | 磁盘总字节 |
| disk.used | 磁盘已用字节 |
| disk.free | 磁盘可用字节 |
| disk.usage | 磁盘使用率 (0-1) |
| diskTotal | 磁盘总字节 |
| diskUsed | 磁盘已用字节 |
| bandwidth.in | 下行速率字节/秒 |
| bandwidth.out | 上行速率字节/秒 |
| bandwidth.up | 上行速率字节/秒 |
| bandwidth.down | 下行速率字节/秒 |
| bandwidthUp | 上行速率字节/秒 |
| bandwidthDown | 下行速率字节/秒 |
| up | 上行速率字节/秒 |
| down | 下行速率字节/秒 |
| online | 是否在线 |
| reachable | 是否可达 |
| uptime | 进程运行时长（秒） |

在非 local 模式下，返回存储不可用的简化结构。

## 带宽采样逻辑

- 应用带宽：根据请求 Content-Length 与响应写入统计
- 系统带宽：仅 Linux 下从 `/proc/net/dev` 采样
- 若系统带宽不可用，则回退到应用带宽

## 备份建议

仅需要备份两部分：

- `storageRoot` 中的文件
- `public_paths` 元数据库
