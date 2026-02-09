# 存储与路径

## 存储根目录

`storageRoot` 为文件系统存储根目录，默认 `uploads`。服务启动时会自动创建并校验读写权限。

## 静态访问

静态文件通过 `/uploads` 映射到 `storageRoot`。

示例：

- 文件路径：`/a.png`
- 访问 URL：`/uploads/a.png`

## 文件列表结构

`/api/images/list` 返回以下结构：

```json
{
  "path": "/",
  "items": [
    { "type": "folder", "name": "album", "path": "/album" },
    { "type": "image", "name": "a.png", "path": "/a.png", "url": "/uploads/a.png", "size": 1024, "uploadedAt": "2026-02-08T00:00:00.000Z" }
  ]
}
```

类型说明：

- folder：目录
- image：图片文件（jpg/jpeg/png/gif/webp/bmp/svg）
- file：其他文件

## 上传临时目录

multipart 上传过程中会在 `data/.tmp` 中写入临时文件，上传完成后重命名为目标文件。

## 路径规范化

所有输入路径会被规范化为以 `/` 开头的 POSIX 路径，并经过路径穿越检测，确保不会逃逸出 `storageRoot`。
