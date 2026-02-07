# 数据库与元数据

picmi-node 仅将“公开路径列表”写入数据库，真实文件存储始终在本地目录中。

## 数据表

表名：`public_paths`

字段：

- path：公开路径字符串，主键

## SQLite

默认使用 SQLite，数据库文件路径由 `db.sqlite.file` 指定。

建表语句：

```sql
CREATE TABLE IF NOT EXISTS public_paths (path TEXT PRIMARY KEY)
```

## MySQL

建表语句：

```sql
CREATE TABLE IF NOT EXISTS public_paths (path VARCHAR(1024) PRIMARY KEY)
```

写入策略：

- 启用公开：`INSERT ... ON DUPLICATE KEY UPDATE`
- 取消公开：`DELETE`

## PostgreSQL

建表语句：

```sql
CREATE TABLE IF NOT EXISTS public_paths (path TEXT PRIMARY KEY)
```

写入策略：

- 启用公开：`INSERT ... ON CONFLICT DO NOTHING`
- 取消公开：`DELETE`

## Supabase

要求在 Supabase 中创建 `public_paths` 表，字段 `path` 为主键。

写入策略：

- 启用公开：upsert
- 取消公开：delete where path

## 连接校验

启动时会对配置的数据库进行连通性校验：

- MySQL / PostgreSQL：执行 `SELECT 1`
- Supabase：读取 `public_paths` 表任意记录
- SQLite：创建或打开文件并执行简单查询
