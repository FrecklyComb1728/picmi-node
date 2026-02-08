# API 参考

## 通用约定

### 返回结构

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

### 认证方式

以下方式任一满足即可：

- `x-node-password` 请求头
- `x-picmi-node-password` 请求头
- `Authorization: Bearer <password>`

### 错误码

- `40001` 参数错误
- `40101` 未登录
- `40901` 资源已存在
- `1` 服务异常

## 健康检查

### GET /api/health

返回服务基本状态。

响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": { "status": "ok" }
}
```

## 状态监控

### GET /api/status

需要认证。

响应 data 字段详见 [operations.md](/docs/operations.md)。

### GET /api/status/stream

需要认证，SSE 流式输出。每秒推送一次状态数据。

响应示例（事件流）：

```
data: {"mode":"local","time":"2026-02-08T00:00:00.000Z",...}

```

## 文件列表

### GET /api/images/list

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 否 | 目录路径，默认 `/` |

若路径被设置为公开路径，则可免认证访问。

响应 data 示例：

```json
{
  "path": "/",
  "items": [
    { "type": "folder", "name": "album", "path": "/album" },
    { "type": "image", "name": "a.png", "path": "/a.png", "url": "/uploads/a.png", "size": 1024, "uploadedAt": "2026-02-08T00:00:00.000Z" }
  ]
}
```

## 文件存在性

### GET /api/images/exists

需要认证。

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 否 | 目录路径，默认 `/` |
| filename | string | 是 | 文件名 |

响应 data：

```json
{ "exists": true }
```

## 创建目录

### POST /api/images/mkdir

需要认证。

请求体：

```json
{ "path": "/", "name": "album" }
```

## 删除文件或目录

### POST /api/images/delete

需要认证。

请求体：

```json
{ "paths": ["/a.png", "/album"] }
```

## 复制文件或目录

### POST /api/images/copy

需要认证。

请求体：

```json
{ "items": [{ "path": "/a.png" }], "toPath": "/backup" }
```

## 移动文件或目录

### POST /api/images/move

需要认证。

请求体：

```json
{ "items": [{ "path": "/a.png" }], "toPath": "/archive" }
```

## 重命名

### POST /api/images/rename

需要认证。

请求体：

```json
{ "path": "/a.png", "newName": "b.png" }
```

## 公开路径开关

### POST /api/images/public

需要认证。

请求体：

```json
{ "path": "/album" }
```

响应 data：

```json
{ "enabled": true }
```

### GET /api/images/public-status

需要认证。

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 否 | 目录路径，默认 `/` |

响应 data：

```json
{ "enabled": false }
```

## Base64 上传

### POST /api/images/upload-base64

需要认证。

请求体：

```json
{
  "path": "/",
  "filename": "a.png",
  "base64": "data:image/png;base64,....",
  "override": "0"
}
```

字段说明：

- override：`1` 覆盖同名文件，`0` 不覆盖

## Multipart 上传

### POST /api/images/upload

需要认证。

表单字段：

- `file`：上传文件
- `path`：目标目录
- `override`：`1` 覆盖同名文件，`0` 不覆盖

中文说明：使用 curl 上传文件

```bash
curl.exe -H "x-picmi-node-password: <password>" -F "file=@a.png" -F "path=/" -F "override=0" http://localhost:5409/api/images/upload
```
