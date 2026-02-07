# 配置详解

## 配置文件位置与优先级

- 优先读取项目根目录的 config.json
- 若根目录不存在，则使用 data/config.json
- 若 data/config.json 不存在，首次启动会自动创建

配置读取逻辑会对默认配置与用户配置进行深度合并，未提供字段将回退为默认值。

## 完整配置结构

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

## 字段说明

### port

服务监听端口。

### storageRoot

文件存储根目录，支持相对路径，实际路径按项目根目录解析。

### auth.password

请求认证密码。若为空字符串，将跳过认证校验。

### ipWhitelist

IP 白名单数组，支持以下格式：

- 单个 IP：`192.168.1.10`
- IPv6：`2001:db8::1`
- CIDR：`192.168.1.0/24`、`2001:db8::/32`

为空时不限制来源 IP。

### ipHeader

从指定请求头读取客户端 IP，例如反向代理场景可设置为 `x-forwarded-for`。

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
