# 数据库 Schema 设计文档

> **模型**: DeepSeek V4 Pro  
> **阶段**: Phase 3 - 系统架构 + 数据库设计

## 一、集合总览

| 集合名 | 说明 | 数据量预估 | 关键索引 |
|--------|------|-----------|---------|
| `courses` | 课程基本信息 | < 1万条/用户 | `_openid+status`, `_openid+expiryDate` |
| `schedules` | 固定上课时间周期 | < 100条/用户 | `courseId+status`, `dayOfWeek+time+status` |
| `lesson_records` | 消课记录 | < 10万条/用户 | `courseId+lessonDate`, `_openid+lessonDate`, `scheduleId+lessonDate` |
| `audit_logs` | 操作审计日志 | 随操作增长 | `_openid+createdAt`, `_openid+courseId+createdAt`, `_openid+actionType+createdAt` |
| `deduction_locks` | 自动消课幂等锁 | 自动TTL清理 | `lockKey`(unique), `expireAt`(TTL) |

## 二、集合详细定义

### 2.1 `courses` — 课程

| 字段 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `_id` | string | 自动 | 文档ID | `"abc123..."` |
| `_openid` | string | 自动 | 用户OPENID（权限隔离） | `"oXXXXX..."` |
| `name` | string | ✅ | 课程名称 | `"初三数学1对1"` |
| `courseType` | string | ✅ | 课程类型 | `"one_on_one"` |
| `subject` | string | ✅ | 科目 | `"math"` |
| `teacher` | string | | 授课老师 | `"李老师"` |
| `student` | string | | 学生姓名 | `"张三"` |
| `totalHours` | number | ✅ | 总购买课时 | `30.0` |
| `consumedHours` | number | ✅ | 已消耗课时 | `12.0` |
| `remainingHours` | number | ✅ | 剩余课时 | `18.0` |
| `deductionUnit` | number | ✅ | 每次扣课时数 | `1.0` |
| `startDate` | Date | ✅ | 课程开始日期 | `2026-06-01` |
| `expiryDate` | Date | ✅ | 课时过期日期 | `2026-12-31` |
| `lowHoursThreshold` | number | ✅ | 低课时预警阈值 | `3.0` |
| `status` | string | ✅ | active\|paused\|completed\|expired | `"active"` |
| `notes` | string | | 备注 | `"重点辅导数学压轴题"` |
| `createdAt` | Date | 自动 | 创建时间 | |
| `updatedAt` | Date | 自动 | 最后更新时间 | |

**status 转换规则**:
- `active` → `paused`: 用户手动暂停
- `active`/`paused` → `completed`: consumedHours >= totalHours
- `active`/`paused` → `expired`: expiryDate < today && remainingHours > 0
- `paused` → `active`: 用户手动恢复
- `completed`/`expired` 不可变更为其他状态

### 2.2 `schedules` — 固定排课

| 字段 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `_id` | string | 自动 | 文档ID | |
| `_openid` | string | 自动 | 用户OPENID | |
| `courseId` | string | ✅ | 关联课程ID | `"abc123..."` |
| `courseName` | string | ✅ | 课程名称(冗余) | `"初三数学1对1"` |
| `dayOfWeek` | number | ✅ | 星期几(0-6) | `1` (周一) |
| `time` | string | ✅ | 上课时间(HH:mm, 北京) | `"17:00"` |
| `effectiveFrom` | Date | ✅ | 生效起始 | `2026-06-01` |
| `effectiveTo` | Date | ✅ | 失效日期(=课程expiryDate) | `2026-12-31` |
| `status` | string | ✅ | active\|paused\|ended | `"active"` |
| `lastDeductedDate` | Date | | 最近自动消课日期 | `2026-06-16` |
| `createdAt` | Date | 自动 | | |
| `updatedAt` | Date | 自动 | | |

**唯一性约束**: 同一课程、同一 `(dayOfWeek, time)` 只能有一个 `active` 排课。

### 2.3 `lesson_records` — 消课记录

| 字段 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `_id` | string | 自动 | | |
| `_openid` | string | 自动 | | |
| `courseId` | string | ✅ | 课程ID | |
| `courseName` | string | ✅ | 课程名称(冗余) | |
| `scheduleId` | string | | 排课ID(手动消课时为null) | |
| `lessonDate` | Date | ✅ | 上课日期 | `2026-06-17` |
| `scheduledTime` | string | | 预定时间(HH:mm) | `"17:00"` |
| `deductionHours` | number | ✅ | 本次扣除课时 | `1.0` |
| `deductionType` | string | ✅ | auto\|manual | `"auto"` |
| `beforeConsumed` | number | ✅ | 消课前已消耗 | `11.0` |
| `afterConsumed` | number | ✅ | 消课后已消耗 | `12.0` |
| `beforeRemaining` | number | ✅ | 消课前剩余 | `19.0` |
| `afterRemaining` | number | ✅ | 消课后剩余 | `18.0` |
| `status` | string | ✅ | completed\|cancelled | `"completed"` |
| `notes` | string | | 备注 | `"今天讲了二次函数"` |
| `createdAt` | Date | 自动 | | |

### 2.4 `audit_logs` — 审计日志

| 字段 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `_id` | string | 自动 | | |
| `_openid` | string | 自动 | | |
| `actionType` | string | ✅ | 操作类型枚举 | `"lesson_auto_deduct"` |
| `targetType` | string | ✅ | 操作对象类型 | `"lesson_record"` |
| `targetId` | string | ✅ | 被操作记录ID | |
| `courseId` | string | ✅ | 关联课程ID | |
| `courseName` | string | ✅ | 关联课程名称 | |
| `detail` | object | ✅ | 变更详情(可包含diff) | `{"field":"status","from":"active","to":"completed"}` |
| `trigger` | string | ✅ | manual\|auto_scheduler | `"auto_scheduler"` |
| `createdAt` | Date | 自动 | | |

### 2.5 `deduction_locks` — 幂等锁

| 字段 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `_id` | string | 自动 | | |
| `lockKey` | string | ✅ | 唯一锁键 | `"abc123_def456_2026-06-17"` |
| `createdAt` | Date | 自动 | | |
| `expireAt` | Date | 自动 | TTL自动删除(7天) | |

**lockKey 格式**: `{courseId}_{scheduleId}_{YYYY-MM-DD}`

## 三、索引策略

### courses
- `{ _openid: 1, status: 1 }` — 首页按状态查询
- `{ _openid: 1, expiryDate: 1 }` — 过期扫描
- `{ _openid: 1, remainingHours: 1 }` — 低课时预警

### schedules
- `{ courseId: 1, status: 1 }` — 按课程查排课
- `{ dayOfWeek: 1, time: 1, status: 1 }` — 定时触发器扫表

### lesson_records
- `{ courseId: 1, lessonDate: 1 }` — 按课程查记录
- `{ _openid: 1, lessonDate: 1 }` — 日历月视图
- `{ scheduleId: 1, lessonDate: 1 }` — 幂等去重

### audit_logs
- `{ _openid: 1, createdAt: -1 }` — 时间倒排
- `{ _openid: 1, courseId: 1, createdAt: -1 }` — 按课程筛选
- `{ _openid: 1, actionType: 1, createdAt: -1 }` — 按类型筛选

### deduction_locks
- `{ lockKey: 1 }` UNIQUE — 幂等锁核心
- `{ expireAt: 1 }` TTL (expireAfterSeconds: 0) — 需在控制台手动创建
