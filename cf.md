# Cloudflare 部署与数据存储指南 (纯 D1 方案)

本指南将指导您如何将此 AI 学习助手部署到 Cloudflare Pages，并仅使用 Cloudflare D1 (Serverless SQLite) 作为唯一的数据库和存储介质。

> ⚠️ **注意：纯 D1 存储的局限性**
> Cloudflare D1 是一个关系型数据库 (SQLite)。它**并不适合**存储大型文件（如高清图片、大型 PDF）。
> D1 每行数据的大小通常有严格限制（例如 1MB）。如果您将文件转为 Base64 字符串直接存入 D1，极易导致数据库膨胀、查询缓慢，甚至因为单行数据过大而写入失败。
> 强烈建议在生产环境中使用 R2 (对象存储) 来存储文件，D1 仅存储文件的 URL 和元数据。
> 但如果您坚持仅使用 D1，请参考以下方案。

## 1. 准备工作

1. 注册并登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 在本地安装 Wrangler CLI (Cloudflare 的命令行工具)：
   ```bash
   npm install -g wrangler
   wrangler login
   ```

## 2. 创建 D1 数据库

在终端中运行以下命令创建一个新的 D1 数据库：

```bash
wrangler d1 create ai-assistant-db
```

命令执行成功后，终端会输出类似以下的信息。请**务必保存**这些信息，稍后需要配置到项目中：

```text
✅ Successfully created DB 'ai-assistant-db' in region APAC
Created your database using D1's new storage backend. The new storage backend is not yet recommended for production workloads, but backs up your data via point-in-time recovery.

[[d1_databases]]
binding = "DB" # i.e. available in your Worker on env.DB
database_name = "ai-assistant-db"
database_id = "xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxx"
```

```
✅ Successfully created DB 'ai-assistant-db' in region WNAM
Created your new D1 database.

To access your new D1 Database in your Worker, add the following snippet to your configuration file:
{
  "d1_databases": [
    {
      "binding": "ai_assistant_db",
      "database_name": "ai-assistant-db",
      "database_id": "d77130f5-8454-4490-b322-544692054e8f"
    }
  ]
}
```


## 3. 配置项目

在项目根目录下创建或修改 `wrangler.toml` 文件，将上一步获取的 `database_name` 和 `database_id` 填入：

```toml
name = "ai-assistant"
compatibility_date = "2024-03-20"
pages_build_output_dir = ".next"

[[d1_databases]]
binding = "DB"
database_name = "ai-assistant-db"
database_id = "xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxx"
```

## 4. 初始化数据库表结构

由于我们要把所有数据（包括文件）都塞进 D1，我们需要设计相应的表结构。
在项目根目录创建一个 `schema.sql` 文件：

```sql
-- 记忆表
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  functionType TEXT,
  purposeType TEXT,
  isMistake BOOLEAN DEFAULT 0,
  wrongAnswer TEXT,
  errorReason TEXT,
  visualDescription TEXT,
  notes TEXT,
  knowledgeNodeIds TEXT, -- JSON 数组
  createdAt INTEGER NOT NULL,
  embedding TEXT -- JSON 数组
);

-- 知识节点表
CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  name TEXT NOT NULL,
  parentId TEXT,
  "order" INTEGER DEFAULT 0
);

-- 课本表
CREATE TABLE IF NOT EXISTS textbooks (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  name TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);

-- 课本页面表 (存储 OCR 文本和 Base64 图片)
CREATE TABLE IF NOT EXISTS textbook_pages (
  id TEXT PRIMARY KEY,
  textbookId TEXT NOT NULL,
  pageNumber INTEGER NOT NULL,
  content TEXT NOT NULL,
  imageBase64 TEXT, -- 警告：可能非常大
  embedding TEXT, -- JSON 数组
  FOREIGN KEY (textbookId) REFERENCES textbooks(id) ON DELETE CASCADE
);

-- 资源库表 (存储文件 Base64)
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  contentBase64 TEXT, -- 警告：可能非常大，极易超出 D1 单行限制
  isFolder BOOLEAN DEFAULT 0,
  parentId TEXT,
  createdAt INTEGER NOT NULL
);
```

在本地执行 SQL 初始化远程数据库：

```bash
wrangler d1 execute ai-assistant-db --file=./schema.sql --remote
```

## 5. 编写后端 API (Next.js Edge API)

为了让前端能够读写 D1 数据库，您需要在 Next.js 项目中创建 API 路由。由于部署在 Cloudflare Pages，必须使用 Edge Runtime。

例如，创建 `app/api/resources/route.ts`：

```typescript
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const { id, name, subject, type, size, contentBase64, isFolder, parentId, createdAt } = await req.json();
    
    // 获取 D1 绑定 (需要配置 env)
    const db = process.env.DB as any; 
    
    if (!db) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // 警告：如果 contentBase64 过大，此操作可能会失败
    await db.prepare(
      `INSERT INTO resources (id, name, subject, type, size, contentBase64, isFolder, parentId, createdAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, name, subject, type, size, contentBase64, isFolder ? 1 : 0, parentId, createdAt).run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

## 6. 修改前端逻辑

您需要修改 `lib/store.tsx` 或相关的组件，将原本存入 IndexedDB 的逻辑，改为通过 `fetch` 调用您刚刚编写的 `/api/...` 接口。

例如，保存资源时：

```typescript
// 伪代码
async function saveResourceToD1(resource) {
  const res = await fetch('/api/resources', {
    method: 'POST',
    body: JSON.stringify(resource)
  });
  if (!res.ok) throw new Error('Failed to save to D1');
}
```

## 7. 部署到 Cloudflare Pages

### 针对报错 "fatal: No url found for submodule path 'superpowers-zh' in .gitmodules" 的修复方法

如果你在 Cloudflare 自动部署时遇到了 `Failed: error occurred while updating repository submodules` 的报错，这是因为 Github 仓库里遗留了一个损坏的 Git 子模块配置文件。

**请在本地执行以下命令修复**（在你推送代码的本地电脑上执行）：
```bash
# 1. 从 git 缓存中移除损坏的子模块
git rm --cached superpowers-zh

# 2. 如果根目录下有 .gitmodules 文件，请将其删除或者打开并删掉 superpowers-zh 相关的内容
rm .gitmodules
git add .gitmodules

# 3. 提交修改并推送到 Github 触发重新部署
git commit -m "fix: 移除损坏的 superpowers-zh 子模块"
git push
```

### 更详细的 Cloudflare 部署步骤

针对你目前代码的 `wrangler.toml` (使用的是 `.vercel/output/static` 构建输出)，可以通过下面两种方式部署。

**方式一、通过 Github 自动部署 (推荐)**
1. 到 GitHub 把刚修复的代码 push 上去
2. 登录 Cloudflare -> Workers and Pages -> Create application -> Pages -> Connect to git
3. 选择你的仓库 `notebook`
4. **构建配置（非常重要）**：
   - **Framework preset**: 选择 `Next.js` 
   - **Build command**: `npx @cloudflare/next-on-pages@1`
   - **Build output directory**: `.vercel/output/static`
   - **Environment Variables**: 添加 `NEXT_PUBLIC_GEMINI_API_KEY` (如果有需要)
5. 点击 Save and Deploy 开启部署。

> 💡 **解决 "Error: No Next.js version detected" 问题**：
如果构建日志报 `Error: No Next.js version detected`，说明 Cloudflare 没有在根目录找到 `package.json`，通常是因为上传仓库时包裹了子文件夹。
**解决方法**：在 Cloudflare 项目设置的 "**Build & deployments**" 中，找到 "**Root directory**"，将其修改为你的代码实际上所在的子目录名称（比如 `/notebook2`），然后再重试部署。

**方式二、也可以本地使用命令行推送部署**
因为本地项目含有 `wrangler.toml` 文件：
```bash
# 构建项目
npm install
npm run build

# 使用 wrangler 终端部署 (需要提前执行过 wrangler login)
npx wrangler pages deploy .vercel/output/static
```

## 总结与警告

再次强调，将文件转为 Base64 存储在 D1 中是一种**反模式 (Anti-pattern)**。
*   **性能极差**：每次查询列表时，如果 `SELECT *` 会把巨大的 Base64 字符串一起拉取下来，导致网络传输缓慢、内存溢出。
*   **容易崩溃**：如果上传了一个 5MB 的 PDF，转为 Base64 后可能达到 7MB，极有可能超出 D1 的单行写入限制，导致保存失败。

**强烈建议**：如果您希望系统稳定运行，请务必引入 Cloudflare R2。将文件上传至 R2，然后将 R2 返回的 URL 存入 D1 的 `url` 字段中，而不是存储 `contentBase64`。

## Docker 并行部署说明（新增）

本仓库现在提供了 Docker 运行准备（`Dockerfile` + `docker-compose.yml`），用于本地或通用容器环境运行 Next.js 应用。

请注意：

1. Docker 路径是**并行部署路径**，不是 Cloudflare D1 绑定方案的替代。
2. 如果你的同步接口依赖 Cloudflare 的 `DB` 绑定，直接在普通 Docker 环境运行时不会自动获得该绑定。
3. 生产若继续使用 D1，请优先采用 Cloudflare Pages/Workers 部署链路；Docker 主要用于本地验证、CI 构建和通用容器运行。
## 服务端检索依赖

新版检索把索引视为派生数据，D1 仍保存业务真源数据，Qdrant 保存检索索引。

Cloudflare Pages/Functions 不内置本地 Qdrant，需要连接外部 HTTP Endpoint：

- `QDRANT_URL`
- `QDRANT_API_KEY`
- `RERANKER_URL`（可选）
- `RERANKER_API_KEY`（可选）
- `LATE_INTERACTION_URL`（可选）
- `LATE_INTERACTION_API_KEY`（可选）

未配置 reranker 或 late interaction provider 时，系统会自动降级到 `dense + sparse + fusion`，不会影响基础问答与复习流程。
