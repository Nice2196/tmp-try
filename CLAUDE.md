# CLAUDE.md

## 包管理策略（必需遵循）

本机是 **MacBook Air 2015，macOS Monterey 12.7.6**（系统已到顶）。Homebrew 不为此旧系统提供预编译 bottle。

**安装任何软件包时，严格按以下优先级**：

1. **MacPorts（最高优先级）**：`port search <pkg>` → `sudo port install <pkg>`
   - 走清华 ports 树 + USTC 二进制包，秒装不编译
   - ports 树路径：`/opt/local/var/macports/sources/mirrors.tuna.tsinghua.edu.cn/macports/release/tarballs/ports/`
   - 不要运行 `port selfupdate`（rsync被封，会卡住）
   
2. **Go 工具**：`GOPROXY=https:https://goproxy.cn,direct go install <path>@latest`
   - 示例：`go install github.com/cli/cli/v2/cmd/gh@latest`
   
3. **Python 包**：`pip3 install -i https:https://mirrors.ustc.edu.cn/pypi/web/simple <pkg>`

4. **Homebrew（仅备选）**：仅当 MacPorts 没有时使用，接受源码编译
   - 已配 USTC 镜像但 Monterey 无 bottle

**检查已安装**：先 `which <cmd>` 或 `port installed | grep <pkg>`，避免重复装。

## Python 版本

始终使用 Python 3.11：`/usr/local/bin/python3.11`

## Skills 研发全流程（必需遵循）

本项目配置了 6 阶段研发流水线 Skills，编写/修改代码时**严格按以下流程**：

### 流水线总览

```
产品设计 ──→ 架构设计 ──→ 编码开发 ──→ 代码Review ──→ 测试 ──→ 发布上线
```

### 各阶段 Skills 映射

| 阶段 | 必装 Skill | 增强 Skill | 触发条件 |
|------|-----------|-----------|---------|
| 1.产品 | `prd-to-spec` | `documentation-writer` | 有 PRD/需求文档/功能描述 |
| 2.架构 | `database-schema-designer` | `excalidraw-diagram-generator` `improve-codebase-architecture` `backend-development` | SPEC 完成后设计架构/DB |
| 3.编码 | `backend-development` `python-code-quality` | `security-best-practices` | 架构确认后编码 |
| 4.Review | `/code-review` | `/security-review` `/simplify` `refactor` | 编码完成后审查 |
| 5.测试 | `python-testing` | `/verify` | Review 通过后写测试 |
| 6.发布 | `git-flow-branch-creator` `conventional-commit` | `changelog-generator` `devops-engineer` `gh-fix-ci` | 测试通过后提交&部署 |

### 自动化 Hooks

- **Write/Edit .py 文件后**: 自动 `ruff check --fix` + `ruff format`
- **git commit 前**: 验证 Conventional Commit 格式（不合规则阻断）
- **git push 到 main/master**: 阻断并提示使用 PR 工作流
- **会话结束**: 检测变更，提醒 Review→Test→Commit 闭环

### 子Agent 调用规范

当使用 Workflow 编排多个子Agent时，每个阶段使用对应 Skill：

```
Phase 1: agent("PRD→技术SPEC", { skill: "prd-to-spec" })
Phase 2: agent("DB Schema设计", { skill: "database-schema-designer" })
         + agent("架构设计", { skill: "improve-codebase-architecture" })
Phase 3: agent("模块实现", { skill: "backend-development" })
Phase 4: parallel(/code-review, /security-review, /simplify)
Phase 5: agent("pytest测试", { skill: "python-testing" })
Phase 6: agent("GitFlow分支", { skill: "git-flow-branch-creator" })
         → agent("规范提交", { skill: "conventional-commit" })
         → agent("生成CHANGELOG", { skill: "changelog-generator" })
```

### Skills 来源与质量

| 来源仓库 | ⭐ Stars | 提供的 Skills |
|----------|---------|--------------|
| github/awesome-copilot | 35,057 | git-flow-branch-creator, refactor, excalidraw-diagram-generator, documentation-writer |
| openai/skills | 22,220 | security-best-practices, gh-fix-ci |
| alirezarezvani/claude-skills | 18,145 | changelog-generator |
| jeffallan/claude-skills | 9,913 | devops-engineer |
| softaworks/agent-toolkit | 2,026 | database-schema-designer |

## 系统信息

- macOS Monterey 12.7.6 (Darwin 21.6.0)
- MacBookAir7,2 (Intel x86_64)
- 系统无法再升级（硬件限制）
