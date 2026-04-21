# 项目优化执行计划

## 当前目标

本轮优化按“先恢复工程可信度，再修主链路，再做结构优化”的顺序推进。

核心目标：

1. 恢复工程基线，使项目重新达到可安装、可类型检查、可构建的状态。
2. 修复同步、存储、AI 调用这三条主链路中的关键断层。
3. 收敛仓库结构，降低重复文件和历史副本对维护的干扰。
4. 为后续性能优化、模块拆分和部署稳定性建立基础。

## 执行范围

第一轮执行范围：

1. 工程基线修复
2. 仓库噪音收敛
3. 同步链路修复
4. 本地存储与数据清理修复

暂缓到第二轮：

1. 大规模模块拆分
2. 全量乱码修复
3. AI 网关安全收敛
4. 教材和 RAG 的深度性能优化

## 阶段计划

### 阶段 1：恢复工程基线

目的：
让项目回到“依赖、类型、脚本、构建”都可信的状态。

具体步骤：

1. 校验依赖安装状态，确认 `package.json` 与 `node_modules` 是否一致。
2. 修复确定性的 TypeScript 报错：
   - `REMOVE_DRAFT_PROPOSAL` action 类型缺失
   - `pullFromCloudflare` 调用参数不匹配
   - 其他明显的签名问题
3. 修复无效脚本，例如 `next clean`。
4. 重新验证：
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npm run build`

产出：

1. 项目能够通过基础工程校验
2. 关键脚本可正常执行

验收标准：

1. `lint` 通过
2. `typecheck` 通过
3. `build` 可执行

### 阶段 2：收敛仓库结构

目的：
消除重复文件和历史副本对开发、构建、类型检查的干扰。

具体步骤：

1. 盘点 `*-1.*`、`*-2.*`、`temp_notebook`、`tsbuildinfo` 等文件。
2. 确认哪些是历史副本，哪些仍被引用。
3. 先通过配置排除无关文件，再决定是否物理清理。
4. 更新 `.gitignore` 与 TypeScript 包含范围。

产出：

1. 类型检查只覆盖主代码
2. 仓库中的“真实版本”更清晰

验收标准：

1. 不再出现重复副本参与类型检查
2. 主代码路径明确

### 阶段 3：修复同步链路

目的：
修复前后端协议不一致导致的同步失败问题。

具体步骤：

1. 对齐 `/api/sync` 的请求字段和客户端调用。
2. 修复自动同步缺失 `Authorization` 和 `syncKey` 的问题。
3. 修复手动同步签名和错误提示。
4. 明确当前支持同步的实体范围。
5. 为后续 `updatedAt` / `deletedAt` 扩展做准备。

产出：

1. 自动同步与手动同步协议一致
2. 同步错误可诊断

验收标准：

1. 配置完整时，请求格式正确
2. 同步失败时有清晰错误

### 阶段 4：修复本地存储与数据清理

目的：
让本地数据清理、导入导出、持久化行为和实际存储一致。

具体步骤：

1. 修复“清空数据”只删除 `localStorage` 不删除 IndexedDB 的问题。
2. 统一数据导入导出和实际存储位置。
3. 为后续拆分 IndexedDB store 做准备。

产出：

1. 清空数据行为真实有效
2. 导入导出行为与实际存储一致

验收标准：

1. 清空后刷新不会恢复旧数据
2. 导入导出可用

## 当前已发现问题

1. `node_modules` 与 `package.json` 不一致，核心依赖缺失。
2. `lib/store.tsx` 中使用了 `REMOVE_DRAFT_PROPOSAL`，但 `lib/types.ts` 未声明该 action。
3. `components/settings/DataSettings.tsx` 调用 `pullFromCloudflare` 少传了 `syncKey`。
4. 自动同步调用 `/api/sync` 时没有发送 `Authorization` 和 `syncKey`。
5. `package.json` 中的 `clean` 脚本无效。
6. 仓库中存在较多历史副本和临时文件，会干扰维护和类型检查。

## 执行记录

### 2026-04-18

1. 已完成项目结构和关键风险点分析。
2. 已建立本执行计划文件。
3. 已完成第一阶段核心修复：
   - 修复 `package.json` 中无效的 `clean` 脚本，并新增 `typecheck`
   - 补齐 `REMOVE_DRAFT_PROPOSAL` action 类型
   - 修复 `pullFromCloudflare` 参数签名不匹配
   - 修复自动同步缺失 `Authorization` 与 `syncKey` 的问题
   - 为 `Memory`、`KnowledgeNode` 增加 `updatedAt`，修复增量同步判断
   - 将聊天路由、聊天上下文和 AI 配置适配到当前 AI SDK 版本
   - 调整 `tsconfig.json`，使 `tsc --noEmit` 不再依赖 `.next/types`
4. 已完成环境修复：
   - 重新安装并校验依赖
   - 修复损坏的 `node_modules`
5. 已完成本地清理能力修复：
   - 新增统一的 `clearLocalAppData`
   - 设置页的“清空数据”已切换为清理 IndexedDB 和旧 localStorage 键
6. 当前验证结果：
   - `npm run clean` 通过
   - `npx tsc --noEmit --pretty false` 通过
   - `npm run lint` 通过
   - `npm run build` 通过
7. 下一步建议：
   - 继续阶段 2，收敛重复文件和历史副本
   - 继续阶段 3，补齐同步实体范围和删除同步策略
