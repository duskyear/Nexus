# Nexus 核心调用清单 3.0 (自用极简版)

这是 `Nexus` 架构在本地开发时的“说明书”。它将你的 natural language 意图精准映射到 `auto-retry`、`omx` 和 `guard` 命令上。

## 1. 核心目标
*   **自愈合执行**：所有验证动作必须过 `auto-retry` 壳，不通过不准停。
*   **契约驱动**：以 `AGENTS.md` 为本能，以 `harness` 为栅栏。
*   **上下文熵减**：禁止全局扫描，利用目录 `cd` 实现原生隔离。

## 2. 核心指令集

### A. 自动化验证 (自愈合)
这是你最常用的入口，用来替代原生的 `npm test` 或 `python run`。
*   **标准用法**：`node ./tools/orchestrator/auto-retry.mjs "<你的验证命令>"`
*   **示例**：`node ./tools/orchestrator/auto-retry.mjs "npm test"`
*   **场景**：当你在 Implementation 阶段改完代码，丢给它这条命令，然后直接去喝咖啡。

### B. 状态机控制 (Harness)
*   **查看进度**：`guard session status --compact` (随时确认自己在哪个阶段)
*   **阶段流转**：
    1.  `guard stage plan` (定需求)
    2.  `guard stage openspec` (出设计)
    3.  `guard stage local_run` (记证据)
*   **强制体检**：`guard doctor` (环境乱了就跑一下)

### C. 并行与专家调度 (Orchestration)
*   **子任务委派**：`npm run harness:spawn -- --agent <role> --task "..."`
*   **上下文压缩**：`npm run harness:dream` (当你觉得 Agent 开始“胡言乱语”或 Token 告急时，必跑！)

---

## 3. 阶段调用模板 (Nexus 适配版)

| 阶段 | 你的意图 | 运行命令 | 核心约束 | 结束标志 |
| :--- | :--- | :--- | :--- | :--- |
| **启动/规划** | “帮我想想这功能怎么加” | `guard stage plan` | 必须产出 DoD (完成标准) | 计划字段补齐，存入 `.harness` |
| **设计/规约** | “写出技术方案，别急着干活” | `guard stage openspec` | 禁止修改任何 `.ts/.py`源码 | 产出 `design.md` 和 `specs/` |
| **自愈合开发** | “开始实现，报错自己修” | `node tools/orchestrator/auto-retry.mjs "npm test"` | **强制重试上限 3 次** | Exit Code 0 且产出证据 |
| **后悔回档** | “这一步做废了，退回设计” | `guard stage revert openspec` | 配合 Git 清理现场 | 状态机返回指定阶段 |
| **交付审计** | “帮我推送到 GitHub” | `git push` | 必须符合 Lore Commit 协议 | 仓库出现带记录的 commit |

---

## 4. 这里的“潜规则” (Solo-Dev Edition)

1.  **目录即上下文**：如果你要在 `api/` 下干活，先让 Agent `cd api/`。这样它读取的就是 `api/` 的局部语境，反应最快。
2.  **不准口嗨**：任何时候 Agent 说“我觉得没问题了”，你都回它一句：“**Show me the evidence powered by auto-retry.**”
3.  **记忆重置**：如果一个会话持续超过 2 小时，不要犹豫，直接运行 `npm run harness:dream`，这能让它清醒得像刚出生一样。
