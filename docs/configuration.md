# 配置详解

## 配置文件位置与优先级

- 优先读取项目根目录的 config.json
- 若根目录不存在，则使用 data/config.json
- 若 data/config.json 不存在，首次启动会自动创建

配置读取逻辑会对默认配置与用户配置进行深度合并，未提供字段将回退为默认值。

支持通过环境变量覆盖部分配置：

- `PICMI_NODE_PASSWORD`
- `PICMI_NODE_AUTH_ENABLED`
- `PICMI_NODE_TRUST_PROXY`
- `PICMI_NODE_JSON_BODY_LIMIT`
- `PICMI_NODE_UPLOAD_BASE64_BYTES`
- `PICMI_NODE_UPLOAD_FILE_BYTES`

## 完整配置结构

```json
{
  "port": 5409,
  "storageRoot": "uploads",
  "auth": {
    "enabled": true,
    "password": ""
  },
  "ipWhitelist": [],
  "ipHeader": "",
  "trustProxy": false,
  "limits": {
    "jsonBody": "10mb",
    "uploadBase64Bytes": 20971520,
    "uploadFileBytes": 104857600,
    "uploadFields": 50
  },
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

## 字段说明

### port

服务监听端口。

### storageRoot

文件存储根目录，支持相对路径，实际路径按项目根目录解析。

### auth.password

请求认证密码。`auth.enabled=true` 时必须配置。

生产环境下若未配置密码，启动会直接退出；开发模式会自动关闭认证。

### auth.enabled

是否开启认证。为 `false` 时将跳过认证校验。

### ipWhitelist

IP 白名单数组，支持以下格式：

- 单个 IP：`192.168.1.10`
- IPv6：`2001:db8::1`
- CIDR：`192.168.1.0/24`、`2001:db8::/32`

为空时不限制来源 IP。

### ipHeader

从指定请求头读取客户端 IP，例如反向代理场景可设置为 `x-forwarded-for`。

### trustProxy

是否信任反向代理头部。仅当 `trustProxy=true` 时才会读取 `ipHeader` 指定的请求头作为客户端 IP。

### limits

请求体与上传限制：

- `limits.jsonBody`：JSON 请求体大小限制（如 `10mb`）
- `limits.uploadBase64Bytes`：base64 上传最大字节数
- `limits.uploadFileBytes`：multipart 上传单文件最大字节数
- `limits.uploadFields`：multipart 字段数量上限

### db

用于存储公开路径（public_paths）元数据的后端。可选值：

- sqlite
- mysql
- postgresql
- supabase

### storage.type

当前仅支持 `local`。若设置为其他值，状态接口会返回存储不可用。

## 配置示例

中文说明：切换到 MySQL 作为元数据存储

```json
{
  "db": {
    "type": "mysql",
    "mysql": {
      "host": "127.0.0.1",
      "port": 3306,
      "user": "root",
      "password": "password",
      "database": "picmi"
    }
  }
}
```
