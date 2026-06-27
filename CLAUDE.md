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
| 5.前端UI | `frontend-design` | `excalidraw-diagram-generator` | 需要设计前端界面/组件时 |
| 6.测试 | `python-testing` | `/verify` | Review 通过后写测试 |
| 7.发布 | `git-flow-branch-creator` `conventional-commit` | `changelog-generator` `devops-engineer` `gh-fix-ci` | 测试通过后提交&部署 |

### 自动化 Hooks（已配置）

| Hook | 触发时机 | 行为 |
|------|---------|------|
| PostToolUse (Write\|Edit) | 写入 .py 文件后 | 自动 `ruff check --fix` + `ruff format` |
| PreToolUse (Bash git commit) | git commit 执行前 | 验证 Conventional Commit 格式，不合规则阻断 |
| PreToolUse (Bash git push) | git push 到 main/master | 警告但允许（个人项目） |
| **Stop (会话结束)** | **每次会话结束** | **💾 自动保存点: 检测变更 → pytest → conventional commit → push** |

### 自动保存点流程 (auto-savepoint.py)

```
会话结束
  ├→ 检测 git diff（过滤 .claude/ 内部文件 + .pyc）
  ├→ .py 文件变更？ → 运行 pytest
  │   ├→ 测试失败 → ❌ 跳过提交，打印失败摘要
  │   └→ 测试通过 → 继续
  ├→ 自动分类 commit 类型 (feat/fix/docs/chore/refactor/test)
  ├→ 生成 Conventional Commit message
  ├→ git add -A + git commit
  └→ git push origin <current-branch>
```

**关键规则**：
- 每次会话结束，代码自动存档到 GitHub，无需手动操作
- 测试失败时会阻断提交，告知失败原因
- Commit 类型自动推断（修改文件类型 + diff 关键词）

### 子Agent 调用规范（含模型路由）

⚠️ **关键规则**：每个子 Agent 必须通过 `model` 参数显式指定目标模型。不指定则继承主会话模型。

#### 模型别名 → 实际提供商映射

| Agent `model` 参数 | 实际模型名 | 代理路由 | API 提供商 |
|-------------------|-----------|---------|-----------|
| `"haiku"` (默认) | `mimo-v2.5-pro` | `mimo-*` → MiMo | `api.xiaomimimo.com/anthropic` |
| `"sonnet"` | `deepseek-v4-pro` | `deepseek-*` → DeepSeek | `api.deepseek.com/anthropic` |

> 验证方式：`grep -E '\[(deepseek|mimo)\]' proxy.log` 查看代理实际路由记录。

#### 本项目 8 阶段调用规范

```
Phase 1 (MiMo):  agent("PRD→技术SPEC",  { model: "haiku", skill: "prd-to-spec" })
Phase 2 (DeepSeek): agent("DB Schema设计", { model: "sonnet", skill: "database-schema-designer" })
                 + agent("架构设计",     { model: "sonnet", skill: "improve-codebase-architecture" })
Phase 3 (DeepSeek): agent("云函数实现",   { model: "sonnet", skill: "backend-development" })
Phase 4 (DeepSeek): agent("更多云函数",   { model: "sonnet", skill: "backend-development" })
Phase 5 (MiMo):  agent("前端UI设计",   { model: "haiku", skill: "frontend-design" })
                 + agent("前端UI实现",   { model: "haiku" })
Phase 6 (DeepSeek): 主会话 /model sonnet 切换后执行 parallel(/code-review, /security-review, /simplify)
                 → 或用 agent("Review", { model: "sonnet" }) 子Agent 执行
Phase 7 (MiMo):  agent("测试计划",     { model: "haiku" })
Phase 8 (MiMo):  agent("部署文档+CHANGELOG", { model: "haiku" })
```

> **为什么**：主会话默认 `mimo-v2.5-pro`（MiMo），按模型名前缀路由。不加 `model: "sonnet"` 时子 Agent 继承主会话 MiMo，DeepSeek 阶段会被错误路由到 MiMo。

#### ⚠️ 每阶段完成后必须立即提交（防漏）

每个 Phase 完成后，主会话**必须立即**执行：

```bash
git add -A && git commit -m "<phase产出>" && git push origin <branch>
```

> **为什么**：Stop Hook (`auto-savepoint.py`) 在会话结束时才触发，但会话可能很长。Stop Hook 是**兜底**，每阶段主动提交是**主路径**。

### Skills 来源与质量

| 来源仓库 | ⭐ Stars | 提供的 Skills |
|----------|---------|--------------|
| github/awesome-copilot | 35,057 | git-flow-branch-creator, refactor, excalidraw-diagram-generator, documentation-writer |
| openai/skills | 22,220 | security-best-practices, gh-fix-ci |
| alirezarezvani/claude-skills | 18,145 | changelog-generator |
| jeffallan/claude-skills | 9,913 | devops-engineer |
| softaworks/agent-toolkit | 2,026 | database-schema-designer |
| anthropics/claude-plugins-official | 官方 | frontend-design |

## 模型路由策略

本项目配置了多模型智能路由，通过 Vision Proxy (`localhost:8899`) 根据模型名前缀自动分发到不同提供商。

### 路由规则

| 模型前缀 | 目标提供商 | API Base | Auth | 用途 |
|----------|-----------|---------|------|------|
| `deepseek-*` | DeepSeek V4 Pro | `api.deepseek.com/anthropic` | `x-api-key` | 方案规划/架构设计/核心编码/CodeReview |
| `mimo-*` | MiMo-V2.5 系列 | `api.xiaomimimo.com/anthropic` | `api-key` | 日常对话/产品文档/前端UI/测试/发布 |
| 未匹配 | MiMo（默认） | `api.xiaomimimo.com/anthropic` | `api-key` | fallback，安全兜底 |

### 流水线各阶段模型分配

**本项目 8 阶段**（微信小程序 + 云开发）：

| 阶段 | 复杂度 | Agent model | 实际 API | 说明 |
|------|--------|------------|---------|------|
| 1. 产品设计 | 🟡 中/低 | **`"haiku"`** | `mimo-v2.5-pro` | PRD→技术规格 |
| 2. 方案规划 | 🔴 高 | **`"sonnet"`** | `deepseek-v4-pro` | Skills选型+架构方案 |
| 3. 架构+DB | 🔴 高 | **`"sonnet"`** | `deepseek-v4-pro` | DB Schema + 云函数架构 |
| 4. 核心编码 | 🔴 高 | **`"sonnet"`** | `deepseek-v4-pro` | 云函数 + 公共模块 |
| 5. 前端UI | 🟡 中/低 | **`"haiku"`** | `mimo-v2.5-pro` | frontend-design 设计 + WXML/WXSS/JS 实现 |
| 6. Code Review | 🔴 高 | **`"sonnet"`** | `deepseek-v4-pro` | 用 `/model sonnet` 切换或用子Agent |
| 7. 测试 | 🟡 中/低 | **`"haiku"`** | `mimo-v2.5-pro` | 测试计划+验证用例 |
| 8. 发布上线 | 🟡 中/低 | **`"haiku"`** | `mimo-v2.5-pro` | 部署文档+手册+CHANGELOG |

**Agent 调用时务必带 `model` 参数**，否则代理默认路由到 MiMo。

#### 历史模型使用审计

> 通过 proxy.log 验证 (`grep -E '\[(deepseek|mimo)\]' proxy.log`)：
> - DeepSeek: 678 次，MiMo: 121 次
> - Phase 1/5 的部分 MiMo 请求可确认（log 行号 75615-83338 区间）
> - Phase 7/8 已确认使用 MiMo（log 行号 110000+ 区间，显式 `model: "haiku"`）
> - **结论**: Phase 1/5 部分未指定 `model` 的子 Agent 实际走了 DeepSeek（本应 MiMo）

### 视觉/多模态处理

- **图片识别**始终使用 **mimo-v2.5**（OpenAI 兼容 `/v1/chat/completions`），不受文本路由影响
- Proxy 在每次请求转发前自动检测并替换 image block → 文字描述
- 预留了音频、视频等新模态的入口（扩展 `find_media_blocks()` 即可）

### 子Agent 中指定模型

在 Workflow 脚本或 Agent 工具中通过 `model` 参数覆盖默认模型：

```javascript
// 高复杂度阶段 → DeepSeek
agent("架构设计", { skill: "improve-codebase-architecture", model: "deepseek-v4-pro" })

// 中低复杂度阶段 → MiMo
agent("PRD→技术SPEC", { skill: "prd-to-spec", model: "mimo-v2.5-pro" })
```

### /fast 命令

`/fast` 使用 Haiku 模型层，已配置为 `mimo-v2.5-pro`。适合快速、低成本的简单任务。

### 百万上下文支持（[1M] 标识）

Claude Code 使用 `[1M]` 后缀标识百万上下文模型。代理层自动处理转换：

| 配置的模型名 | 转发给 API 的模型名 | 上下文窗口 |
|-------------|-------------------|-----------|
| `mimo-v2.5-pro[1M]` | `mimo-v2.5-pro` | 1M tokens |
| `deepseek-v4-pro[1M]` | `deepseek-v4-pro` | 1M tokens |

**工作原理**：
1. `settings.json` 中配置带 `[1M]` 后缀的模型名
2. 代理的 `/v1/models` 端点返回支持的模型列表（含 `[1M]` 变体）
3. 代理的 `clean_model_name()` 函数在转发请求时自动去掉 `[1M]` 后缀
4. MiMo/DeepSeek API 收到的是干净的模型名

**支持的百万上下文模型**：
- `mimo-v2.5-pro[1M]` — MiMo V2.5 Pro，100万 token 上下文
- `deepseek-v4-pro[1M]` — DeepSeek V4 Pro，100万 token 上下文

### 添加新提供商

在 `proxy.py` 的 `PROVIDERS` 列表中添加一项即可，支持任意 Anthropic 兼容 API：

```python
{"name": "new-provider", "prefix": "np-", "base_url": "...", "api_key": "...", "auth_header": "x-api-key"}
```

## 系统信息

- macOS Monterey 12.7.6 (Darwin 21.6.0)
- MacBookAir7,2 (Intel x86_64)
- 系统无法再升级（硬件限制）

## 小程序自动发布流程

### 阶段6发布上线 - 自动化脚本

**脚本位置**: `scripts/auto-release.py`

**功能（6 步自动完成）**:
1. 检查前提条件（密钥文件、miniprogram-ci）
2. 上传 8 个云函数到云端
3. 上传前端代码到微信后台（版本号自动递增）
4. 设置体验版
5. 生成预览二维码（`release/preview-qr.png`）
6. 生成体验版二维码（`release/experience-qr.png`）

**使用方法**:
```bash
# 基本用法
python3.11 scripts/auto-release.py

# 带版本描述
python3.11 scripts/auto-release.py "feat: 新功能描述"
```

**前提条件**:
1. Node.js >= 16.x（miniprogram-ci 依赖）
2. 代码上传密钥文件放在项目根目录（`private.{APPID}.key`）
3. 云开发环境已开通

**输出文件**:
- `release/preview-qr.png` - 预览二维码（有效期短，适合开发调试）
- `release/experience-qr.png` - 体验版二维码（有效期长，适合验收）
- `.version` - 当前版本号记录

**云函数清单**（8 个）:
- `init-db` - 数据库初始化
- `course-manager` - 课程 CRUD
- `schedule-manager` - 排课管理
- `lesson-manager` - 手动消课
- `auto-deduct` - 自动消课（定时触发，每 30 分钟）
- `stats-query` - 统计查询
- `calendar-query` - 日历查询
- `audit-query` - 操作日志查询

**完整发布流程**:
```
阶段6发布上线
  ├→ 执行 python3.11 scripts/auto-release.py "版本描述"
  │   ├→ 自动上传 8 个云函数
  │   ├→ 自动上传前端代码
  │   ├→ 自动设置体验版
  │   └→ 自动生成预览码 + 体验码
  ├→ 扫描预览二维码验证功能
  ├→ 确认无误后在微信公众平台提交审核
  └→ 审核通过后发布上线
```

**验收方式**:
- 扫描 `release/preview-qr.png` → 预览最新代码
- 扫描 `release/experience-qr.png` → 体验版（需先设置体验版）
