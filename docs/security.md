# 安全与访问控制

## 认证机制

当 `auth.password` 非空时，需要进行认证。以下方式任一满足即可：

- `x-node-password` 请求头
- `x-picmi-node-password` 请求头
- `Authorization: Bearer <password>`

若 `auth.password` 为空字符串，则跳过认证。

## 公开路径

公开路径存储在数据库表 `public_paths` 中。

当请求 `/api/images/list` 时，若请求路径命中公开路径，则允许免认证访问。

## IP 白名单

`ipWhitelist` 支持：

- IPv4 / IPv6 单 IP
- CIDR（如 `192.168.1.0/24`、`2001:db8::/32`）

为空时不限制来源 IP。若列表不为空且请求 IP 不匹配，将返回 403。

## 代理场景

可通过 `ipHeader` 指定读取客户端 IP 的请求头，例如 `x-forwarded-for`。若该头存在且包含多个 IP，仅取第一个。

## 路径安全

所有路径经规范化处理并进行路径穿越检测，防止访问 `storageRoot` 之外的文件。
