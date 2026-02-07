# 常见问题

## 访问接口返回 401

需要在请求头中携带密码，或将 `auth.password` 设为空字符串。

## 访问接口返回 403

当前 IP 不在白名单内，检查 `ipWhitelist` 和 `ipHeader` 设置。

## 上传提示 文件已存在

上传接口默认不覆盖同名文件，设置 `override` 为 `1` 可覆盖。

## 列表接口无法访问

若未认证且路径未设置为公开路径，`/api/images/list` 会被拦截。

## base64 上传失败

`base64` 字段支持 data URL，也支持纯 base64 字符串。确保 `filename` 与 `base64` 字段存在。

## Windows 下路径问题

所有路径按 POSIX 格式处理，统一使用 `/` 作为分隔符。
