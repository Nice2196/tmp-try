# 测试计划文档

@responsible MiMo-V2.5 Pro
@phase Phase 7

---

## 一、测试策略

### 1.1 测试范围

| 层级 | 覆盖内容 | 优先级 |
|------|---------|--------|
| 云函数逻辑 | 8 个云函数的正常流程、边界条件、异常处理 | P0 |
| 数据完整性 | 课时恒等式、幂等锁机制、事务原子性 | P0 |
| 前端页面 | 9 个页面 + 5 个组件的核心交互 | P1 |
| 安全验证 | OPENID 权限隔离、参数注入防护、并发安全 | P0 |
| 时区一致性 | 北京时区 Date.UTC() 模式在所有模块中的正确性 | P1 |

### 1.2 测试方法

| 方法 | 说明 | 适用场景 |
|------|------|---------|
| 云函数单元测试 | 通过微信开发者工具"云函数测试"面板传入 event 参数 | 每个云函数的 action 路由和业务逻辑 |
| 集成测试 | 前端页面操作触发云函数调用，验证端到端流程 | 消课全流程、课程 CRUD 全流程 |
| 数据校验测试 | 直接查询数据库集合，验证数据一致性和约束 | 课时恒等式、幂等锁、审计日志 |
| 边界测试 | 输入极端值、空值、越界参数 | 参数校验、分页边界、数值边界 |
| 并发模拟测试 | 模拟定时触发器与手动消课同时执行 | 幂等锁、事务冲突 |

### 1.3 测试环境

- 微信开发者工具（本地调试 + 云函数测试面板）
- 微信云开发测试环境（独立于生产环境）
- 测试用 OPENID：使用开发者工具的模拟登录或真机调试

---

## 二、云函数验证方案

### 2.1 initDB — 数据库初始化

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| INIT-001 | 首次初始化所有索引 | `{}` (空 event) | success=true，所有索引 status="created"，manualSteps 提示创建 TTL 索引 |
| INIT-002 | 重复初始化（索引已存在） | `{}` (空 event) | success=true，索引 status="already_exists"，不报错 |
| INIT-003 | 验证输出摘要字段 | `{}` (空 event) | 返回值包含 summary.totalIndexes、created、alreadyExists、errors |

### 2.2 courseManager — 课程管理

#### 2.2.1 create（创建课程）

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| CM-C-001 | 正常创建课程 | `{action:'create', data:{name:'初三数学', totalHours:30, startDate:'2026-06-01', expiryDate:'2026-12-31'}}` | success=true，consumedHours=0，remainingHours=30，status='active' |
| CM-C-002 | 课程名称为空 | `{action:'create', data:{name:'', totalHours:30, ...}}` | success=false，error 包含"课程名称不能为空" |
| CM-C-003 | 总课时为 0 | `{action:'create', data:{name:'测试', totalHours:0, ...}}` | success=false，error 包含"总课时必须为大于0的数字" |
| CM-C-004 | 总课时为负数 | `{action:'create', data:{name:'测试', totalHours:-5, ...}}` | success=false |
| CM-C-005 | 总课时为字符串 | `{action:'create', data:{name:'测试', totalHours:'abc', ...}}` | success=false |
| CM-C-006 | 过期日期早于开始日期 | `{action:'create', data:{..., startDate:'2026-12-31', expiryDate:'2026-01-01'}}` | success=false，error 包含"过期日期必须在开始日期之后" |
| CM-C-007 | 过期日期等于开始日期 | `{action:'create', data:{..., startDate:'2026-06-01', expiryDate:'2026-06-01'}}` | success=false |
| CM-C-008 | deductionUnit 为 0 | `{action:'create', data:{..., deductionUnit:0}}` | success=false，error 包含"每次扣除课时数必须大于0" |
| CM-C-009 | 使用默认值（可选字段不传） | `{action:'create', data:{name:'测试', totalHours:10, startDate:'2026-06-01', expiryDate:'2026-12-31'}}` | courseType='one_on_one'，subject='other'，deductionUnit=1.0，lowHoursThreshold=3.0 |
| CM-C-010 | 创建后审计日志写入 | 同 CM-C-001 | audit_logs 集合中存在 actionType='course_create' 的记录 |

#### 2.2.2 get（获取课程详情）

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| CM-G-001 | 正常获取课程 | `{action:'get', data:{id:'<courseId>'}}` | success=true，返回 course 对象 + schedules 数组 |
| CM-G-002 | 课程不存在 | `{action:'get', data:{id:'nonexistent'}}` | success=false，error 包含"课程不存在" |
| CM-G-003 | 缺少课程ID | `{action:'get', data:{}}` | success=false，error 包含"缺少课程ID" |
| CM-G-004 | 已过期课程动态刷新状态 | 获取一个 expiryDate < 今天的 active 课程 | 返回的 course.status='expired'，有 _statusNote |
| CM-G-005 | 已完成课程（remainingHours=0）动态刷新 | 获取一个 remainingHours=0 但 status!=completed 的课程 | 返回的 course.status='completed' |

#### 2.2.3 list（查询课程列表）

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| CM-L-001 | 查询全部课程 | `{action:'list', data:{}}` | success=true，返回所有当前用户的课程 |
| CM-L-002 | 按状态筛选 | `{action:'list', data:{status:'active'}}` | 仅返回 active 状态的课程 |
| CM-L-003 | 分页查询 | `{action:'list', data:{pageSize:2, pageNum:1}}` | 返回 2 条记录，total 为总数 |
| CM-L-004 | 超出最大分页限制 | `{action:'list', data:{pageSize:500}}` | pageSize 被限制为 MAX_PAGE_SIZE(100) |
| CM-L-005 | 无课程时返回空列表 | 新用户无课程数据 | success=true，courses=[]，total=0 |

#### 2.2.4 update（更新课程）

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| CM-U-001 | 修改课程名称 | `{action:'update', data:{id:'<id>', name:'新名称'}}` | success=true，changes 包含 'name' |
| CM-U-002 | 修改 totalHours 增大 | `{action:'update', data:{id:'<id>', totalHours:50}}` | remainingHours 重算 = 50 - consumedHours |
| CM-U-003 | 修改 totalHours 使 remaining<=0 | totalHours 设为小于 consumedHours 的值 | remainingHours=0，status 自动变为 'completed' |
| CM-U-004 | 修改 totalHours 为 0 | `{action:'update', data:{id:'<id>', totalHours:0}}` | success=false |
| CM-U-005 | 无实际变更 | `{action:'update', data:{id:'<id>', name:<原名>}}` | success=true，changes 为空数组 |
| CM-U-006 | 课程不存在 | `{action:'update', data:{id:'nonexistent', name:'x'}}` | success=false |

#### 2.2.5 delete（删除课程）

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| CM-D-001 | 删除无消课记录的课程 | `{action:'delete', data:{id:'<无消课课程>'}}` | success=true，课程和关联排课被物理删除 |
| CM-D-002 | 删除有消课记录的课程 | `{action:'delete', data:{id:'<有消课课程>'}}` | success=false，error 包含"已有消课记录"，返回 suggestion='change_status' |
| CM-D-003 | 删除课程后关联排课也被删除 | 同 CM-D-001 | schedules 集合中该课程的排课记录也被移除 |
| CM-D-004 | 删除后审计日志 | 同 CM-D-001 | audit_logs 中有 actionType='course_delete' 记录 |

#### 2.2.6 pause/resume（暂停/恢复）

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| CM-P-001 | 暂停活跃课程 | `{action:'pause', data:{id:'<active课程>'}}` | success=true，newStatus='paused' |
| CM-P-002 | 恢复暂停课程 | `{action:'resume', data:{id:'<paused课程>'}}` | success=true，newStatus='active' |
| CM-P-003 | 暂停已完成课程 | `{action:'pause', data:{id:'<completed课程>'}}` | success=false，error 包含"已完成课程不可变更状态" |
| CM-P-004 | 重复暂停同一课程 | 对 paused 课程再执行 pause | success=false，error 包含"已处于 paused 状态" |

### 2.3 scheduleManager — 排课管理

#### 2.3.1 create（创建排课）

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| SC-C-001 | 正常创建排课 | `{action:'create', data:{courseId:'<id>', dayOfWeek:1, time:'17:00', effectiveFrom:'2026-06-01'}}` | success=true，effectiveTo 自动设为课程 expiryDate |
| SC-C-002 | 重复排课（同课程+同星期+同时间） | 同 SC-C-001 再执行一次 | success=false，error 包含"请勿重复添加" |
| SC-C-003 | dayOfWeek 超出范围 | `{action:'create', data:{..., dayOfWeek:7}}` | success=false，error 包含"0-6" |
| SC-C-004 | time 格式错误 | `{action:'create', data:{..., time:'5pm'}}` | success=false，error 包含"HH:mm" |
| SC-C-005 | 关联课程为 completed 状态 | 对 completed 课程创建排课 | success=false，error 包含"不可添加排课" |
| SC-C-006 | 关联课程为 expired 状态 | 对 expired 课程创建排课 | success=false |
| SC-C-007 | 课程不存在 | `{action:'create', data:{courseId:'nonexistent', ...}}` | success=false |

#### 2.3.2 listByCourse（按课程查询排课）

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| SC-L-001 | 查询课程的所有排课 | `{action:'listByCourse', data:{courseId:'<id>'}}` | success=true，返回 schedules 数组，按 dayOfWeek+time 排序 |
| SC-L-002 | 按状态筛选 | `{action:'listByCourse', data:{courseId:'<id>', status:'active'}}` | 仅返回 active 排课 |
| SC-L-003 | 无排课时返回空 | 新建课程无排课 | success=true，schedules=[]，total=0 |

#### 2.3.3 update（更新排课）

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| SC-U-001 | 修改上课时间 | `{action:'update', data:{id:'<id>', time:'19:00'}}` | success=true，changes 包含 'time' |
| SC-U-002 | 修改 dayOfWeek 导致重复 | 将 dayOfWeek 改为已有排课的值 | success=false，error 包含"已存在" |
| SC-U-003 | 排课不存在 | `{action:'update', data:{id:'nonexistent', time:'10:00'}}` | success=false |

#### 2.3.4 delete（删除排课）

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| SC-D-001 | 删除无消课记录的排课 | `{action:'delete', data:{id:'<无消课排课>'}}` | success=true，deleted=true，物理删除 |
| SC-D-002 | 删除有 auto 消课记录的排课 | `{action:'delete', data:{id:'<有auto消课排课>'}}` | success=true，deleted=false，markedAsEnded=true，status 变为 'ended' |
| SC-D-003 | 排课不存在 | `{action:'delete', data:{id:'nonexistent'}}` | success=false |

### 2.4 lessonManager — 消课管理

#### 2.4.1 add（手动消课）

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| LM-A-001 | 正常手动消课 | `{action:'add', data:{courseId:'<id>', lessonDate:'2026-06-17'}}` | success=true，deductionHours=课程的 deductionUnit |
| LM-A-002 | 自定义扣除课时数 | `{action:'add', data:{courseId:'<id>', lessonDate:'2026-06-17', deductionHours:2}}` | success=true，deductionHours=2 |
| LM-A-003 | 剩余课时不足 | 剩余 0.5 课时，扣除 1 课时 | success=false，error 包含"剩余课时不足" |
| LM-A-004 | 课程为 paused 状态 | 对 paused 课程消课 | success=true（paused 允许手动消课） |
| LM-A-005 | 课程为 completed 状态 | 对 completed 课程消课 | success=false，error 包含"不可消课" |
| LM-A-006 | 消课日期超过课程过期日期 | lessonDate > expiryDate | success=false，error 包含"已超过课程过期日期" |
| LM-A-007 | 同一课程同一天重复消课 | 同 LM-A-001 再执行一次 | success=false，error 包含"已有消课记录" |
| LM-A-008 | 扣除课时 <= 0 | `{action:'add', data:{..., deductionHours:0}}` | success=false |
| LM-A-009 | 消课后课程自动完成 | 剩余 1 课时，扣除 1 课时 | courseCompleted=true，课程 status 变为 'completed' |
| LM-A-010 | 事务原子性验证 | 消课成功 | courses.consumedHours 正确增加，lesson_records 插入记录，audit_logs 写入日志，三者一致 |
| LM-A-011 | 消课记录快照字段 | 消课前 consumed=10，扣除 1 | beforeConsumed=10，afterConsumed=11，beforeRemaining=20，afterRemaining=19 |
| LM-A-012 | 缺少 courseId | `{action:'add', data:{lessonDate:'2026-06-17'}}` | success=false |
| LM-A-013 | 缺少 lessonDate | `{action:'add', data:{courseId:'<id>'}}` | success=false |

#### 2.4.2 cancel（取消消课）

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| LM-C-001 | 正常取消手动消课 | `{action:'cancel', data:{lessonRecordId:'<手动消课记录>'}}` | success=true，课时回退 |
| LM-C-002 | 取消自动消课 | `{action:'cancel', data:{lessonRecordId:'<自动消课记录>'}}` | success=false，error 包含"自动消课记录不可手动取消" |
| LM-C-003 | 取消已取消的记录 | 对 cancelled 记录再执行 cancel | success=false，error 包含"已被取消" |
| LM-C-004 | 取消后课程恢复 active | 课程因本次消课变为 completed 后取消 | 课程 status 恢复为 active |
| LM-C-005 | 课时回退后恒等式验证 | 消课前 consumed=12，回退 1 | consumedHours=11，remainingHours=totalHours-11 |

#### 2.4.3 list（查询消课记录）

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| LM-L-001 | 按课程查询消课记录 | `{action:'list', data:{courseId:'<id>'}}` | success=true，按 lessonDate 倒序 |
| LM-L-002 | 分页查询 | `{action:'list', data:{courseId:'<id>', pageSize:5, pageNum:2}}` | 返回第 6-10 条记录 |
| LM-L-003 | 无记录 | 新课程无消课 | success=true，lessons=[]，total=0 |

### 2.5 autoDeduct — 自动消课

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| AD-001 | 正常自动消课（定时触发） | `{}` (空 event，模拟定时触发) | success=true，stats.successfullyDeducted > 0 |
| AD-002 | 手动指定日期触发 | `{year:2026, month:6, day:17}` | 按指定日期消课，非当天 |
| AD-003 | 无匹配排课 | 非排课日执行 | success=true，stats.matchedSchedules=0 |
| AD-004 | 幂等跳过（重复执行） | 同一天同一排课第二次执行 | stats.skipped.locked++，不重复扣课时 |
| AD-005 | 课程状态为 paused | paused 课程的排课 | stats.skipped.courseInactive++ |
| AD-006 | 课程已过期 | expiryDate < targetDate | stats.skipped.expired++ |
| AD-007 | 剩余课时不足 | remainingHours < deductionUnit | stats.skipped.insufficientHours++ |
| AD-008 | 超过最大处理数（20条） | 配置 >20 条排课 | 仅处理前 20 条，其余由下次调度处理 |
| AD-009 | 自动消课后课程自动完成 | 最后一次消课扣完剩余课时 | 课程 status 变为 completed |
| AD-010 | 事务内二次校验状态变更 | 消课前课程被手动暂停 | 事务回滚，stats.skipped.courseInactive++ |
| AD-011 | 事务内二次校验课时不足 | 事务外读取时充足，事务内被手动消课扣减 | 事务回滚，stats.skipped.insufficientHours++ |
| AD-012 | 排课 lastDeductedDate 更新 | 消课成功 | schedules.lastDeductedDate 更新为目标日期 |
| AD-013 | 审计日志 trigger 类型 | 消课成功 | audit_logs 中 trigger='auto_scheduler' |
| AD-014 | 消课记录 scheduleId 关联 | 消课成功 | lesson_records.scheduleId = 排课 ID |

### 2.6 statsQuery — 统计查询

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| SQ-001 | 正常查询全部统计 | `{rangeType:'30days'}` | success=true，返回 courseBreakdown/categoryBreakdown/trendData/expiryWarnings/lowHoursWarnings/summary |
| SQ-002 | 90天趋势数据 | `{rangeType:'90days'}` | trendData 包含近 90 天数据 |
| SQ-003 | 课程进度百分比计算 | totalHours=30, consumedHours=12 | progressPercent=40 |
| SQ-004 | 过期预警（30天内到期） | 有课程 15 天后到期 | expiryWarnings 包含该课程，daysUntilExpiry=15 |
| SQ-005 | 低课时预警 | remainingHours <= lowHoursThreshold | lowHoursWarnings 包含该课程 |
| SQ-006 | 无课程时统计为空 | 新用户 | summary.totalCourses=0，所有数组为空 |
| SQ-007 | 本月消课统计 | 本月有消课记录 | summary.monthlyDeductionHours 为正数 |
| SQ-008 | 分类聚合正确性 | 3 门 one_on_one + 2 门 small_group | categoryBreakdown 各类 courseCount 正确 |

### 2.7 calendarQuery — 日历查询

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| CQ-001 | 正常查询某月日历 | `{year:2026, month:6}` | success=true，days 数组包含该月所有天 |
| CQ-002 | 排课日 + 已消课 | 排课日且有 completed 记录 | status='completed'，deductionType 正确 |
| CQ-003 | 排课日 + 未来未消课 | 排课日且日期 > 今天 | status='pending' |
| CQ-004 | 排课日 + 过去未消课 | 排课日且日期 < 今天且无记录 | status='expired' |
| CQ-005 | 手工消课（无排课） | 手工消课记录，日期无排课 | days 中该日期包含 completed 记录，scheduleId=null |
| CQ-006 | 排课生效日期过滤 | 排课 effectiveFrom 在月中 | 月初该排课日无排课，effectiveFrom 之后有 |
| CQ-007 | 缺少参数 | `{year:2026}` | success=false，error 包含"缺少必填参数" |
| CQ-008 | 跨月边界（2月28/29天） | `{year:2026, month:2}` | days 数组长度=28（2026年非闰年） |
| CQ-009 | 跨月边界（闰年2月） | `{year:2028, month:2}` | days 数组长度=29 |

### 2.8 auditQuery — 审计日志查询

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|---------|
| AQ-001 | 查询全部审计日志 | `{}` | success=true，按 createdAt 倒序 |
| AQ-002 | 按操作类型筛选 | `{filters:{actionType:'course_create'}}` | 仅返回 course_create 类型日志 |
| AQ-003 | 按时间范围筛选 | `{filters:{dateRange:{start:'2026-06-01', end:'2026-06-16'}}}` | 仅返回该时间范围内的日志 |
| AQ-004 | 按课程筛选 | `{filters:{courseId:'<id>'}}` | 仅返回该课程相关日志 |
| AQ-005 | 组合筛选 | `{filters:{actionType:'lesson_auto_deduct', dateRange:{start:'2026-06-01'}}}` | 同时满足两个条件 |
| AQ-006 | 分页查询 | `{pageSize:5, pageNum:3}` | 返回第 11-15 条记录 |
| AQ-007 | 无日志记录 | 新用户 | success=true，logs=[]，total=0 |

---

## 三、数据完整性验证

### 3.1 课时恒等式验证

核心约束：`consumedHours + remainingHours = totalHours`

| 验证ID | 场景 | 验证方法 | 预期 |
|--------|------|---------|------|
| DI-001 | 创建课程后 | 查询 courses 集合 | consumedHours=0，remainingHours=totalHours |
| DI-002 | 手动消课后 | 查询 courses 集合 | consumedHours 增加 deductionHours，remainingHours 减少相同值，恒等式成立 |
| DI-003 | 自动消课后 | 查询 courses 集合 | 同 DI-002 |
| DI-004 | 取消消课后 | 查询 courses 集合 | consumedHours 回退，remainingHours 恢复，恒等式成立 |
| DI-005 | 修改 totalHours 后 | 查询 courses 集合 | remainingHours = newTotal - consumedHours |
| DI-006 | 批量消课后 | 连续消课 N 次 | consumedHours = N * deductionUnit，remainingHours = totalHours - consumedHours |
| DI-007 | 消课记录快照一致性 | 比对 lesson_records 的 before/after 字段 | beforeConsumed + deductionHours = afterConsumed，beforeRemaining - deductionHours = afterRemaining |
| DI-008 | 消课记录快照与课程一致 | 比对 lesson_records.afterConsumed 与 courses.consumedHours | 最新消课记录的 afterConsumed = courses.consumedHours |

**验证脚本思路**（在云开发控制台的数据面板中执行）：

```
// 查询所有课程，检查恒等式
db.collection('courses').get().then(res => {
  res.data.forEach(course => {
    const ok = Math.abs(course.consumedHours + course.remainingHours - course.totalHours) < 0.01
    if (!ok) console.error(`课程 ${course._id} 恒等式不成立:`, course)
  })
})
```

### 3.2 幂等锁机制验证

| 验证ID | 场景 | 验证方法 | 预期 |
|--------|------|---------|------|
| IL-001 | 首次消课获取锁成功 | 查询 deduction_locks 集合 | 存在 lockKey="{courseId}_{scheduleId}_{date}" |
| IL-002 | lockKey 格式正确 | 检查 lockKey 字段 | 格式为 `{courseId}_{scheduleId}_{YYYY-MM-DD}` |
| IL-003 | 重复执行被跳过 | 对同一排课同一天触发两次 autoDeduct | 第二次 stats.skipped.locked++，不产生新消课记录 |
| IL-004 | 不同日期锁独立 | 周一和周二分别触发 | 各有独立的 lockKey，各自消课成功 |
| IL-005 | 不同课程锁独立 | 同一天两个不同课程的排课 | 各有独立的 lockKey，各自消课成功 |
| IL-006 | 锁的 TTL 过期 | 查询 deduction_locks 中旧记录的 expireAt | expireAt = createdAt + 7天 |
| IL-007 | 手动消课不使用幂等锁 | 手动消课操作 | deduction_locks 中无对应 lockKey |

---

## 四、前端页面验证清单

### 4.1 首页 (pages/index)

| 验证点 | 说明 |
|--------|------|
| 课程列表加载 | 显示当前用户的所有活跃课程，按 updatedAt 倒序 |
| 课程卡片信息 | 显示课程名称、科目、剩余课时、进度条 |
| 状态筛选 | 可按 active/paused/completed/expired 筛选 |
| 低课时预警 | remainingHours <= threshold 的课程有视觉提示 |
| 过期预警 | 30 天内到期的课程有视觉提示 |
| 空状态展示 | 无课程时显示 empty-state 组件，引导创建课程 |
| 加载骨架屏 | 首次加载显示 loading-skeleton 组件 |
| 下拉刷新 | 下拉刷新课程列表 |
| 上拉加载更多 | 分页加载更多课程 |
| 点击跳转详情 | 点击课程卡片跳转到课程详情页 |

### 4.2 日历页 (pages/calendar)

| 验证点 | 说明 |
|--------|------|
| 月视图展示 | 显示当月日历，排课日有标记 |
| 日期状态标记 | 已完成(绿)、待上课(蓝)、已过期(灰) 区分显示 |
| 点击日期详情 | 点击某天显示该天的消课/排课详情 |
| 切换月份 | 左右滑动切换月份，数据重新加载 |
| 手工消课标记 | 无排课但有手工消课的日期也应显示 |
| calendar-view 组件 | 日期渲染、手势交互、选中状态正确 |

### 4.3 统计页 (pages/stats)

| 验证点 | 说明 |
|--------|------|
| 总览摘要卡片 | 显示总课程数、活跃课程数、总剩余课时、本月消课时长 |
| 课程粒度统计 | 每门课程的进度百分比、已消耗/剩余课时 |
| 分类聚合统计 | 按课程类型分组的课时统计 |
| 消课趋势图表 | 近 N 天的消课趋势折线图/柱状图（stats-chart 组件） |
| 过期预警列表 | 30 天内到期的课程列表 |
| 低课时预警列表 | 课时不足的课程列表 |
| 时间范围切换 | 30天/90天/全部 切换趋势数据 |

### 4.4 设置页 (pages/settings)

| 验证点 | 说明 |
|--------|------|
| 用户信息展示 | 显示当前用户 OPENID 相关信息 |
| 新建课程入口 | 点击跳转到课程编辑页 |
| 审计日志入口 | 点击跳转到审计日志页 |
| 版本信息 | 显示小程序版本号 |

### 4.5 课程详情页 (pages/course/detail)

| 验证点 | 说明 |
|--------|------|
| 课程完整信息 | 显示所有课程字段（名称、类型、科目、老师、学生等） |
| 课时进度 | 显示 consumedHours/totalHours 进度条 |
| 排课列表 | 显示该课程的所有活跃排课 |
| 消课记录入口 | 点击跳转到消课记录列表 |
| 操作按钮 | 编辑、暂停/恢复、删除 按钮根据状态显示/隐藏 |
| 删除确认 | 有消课记录时提示不可删除 |

### 4.6 课程编辑页 (pages/course/edit)

| 验证点 | 说明 |
|--------|------|
| 新建模式 | 所有字段为空，必填项标记 |
| 编辑模式 | 回填课程现有数据 |
| 表单验证 | 名称非空、totalHours>0、expiryDate>startDate、deductionUnit>0 |
| 保存成功 | 新建/更新后返回详情页，数据已更新 |
| 排课管理 | 可新增/编辑/删除该课程的排课 |

### 4.7 手动消课页 (pages/lesson/add)

| 验证点 | 说明 |
|--------|------|
| 课程选择 | 从活跃课程列表中选择 |
| 日期选择 | 日期选择器，不可选择超过 expiryDate 的日期 |
| 课时数输入 | 默认值为课程 deductionUnit，可自定义 |
| 重复消课提示 | 同课程同一天已有消课记录时提示 |
| 消课成功 | 显示消课结果（扣除/剩余/是否完成） |
| 余额不足提示 | 剩余课时不足时提示 |

### 4.8 消课记录列表页 (pages/lesson/list)

| 验证点 | 说明 |
|--------|------|
| 按课程查看 | 显示指定课程的所有消课记录 |
| 记录详情 | 显示日期、扣除课时、类型(auto/manual)、备注 |
| 取消消课 | 手动消课记录可取消，自动消课记录不可取消 |
| 分页加载 | 支持分页加载更多记录 |
| 状态区分 | completed 和 cancelled 记录视觉区分 |

### 4.9 审计日志页 (pages/audit-log)

| 验证点 | 说明 |
|--------|------|
| 日志列表 | 按时间倒序显示所有操作日志 |
| 操作类型筛选 | 可按 actionType 筛选（下拉选择） |
| 时间范围筛选 | 可选择起止日期筛选 |
| 日志详情 | 显示操作类型、目标、变更详情、触发方式 |
| 空状态 | 无日志时显示空状态 |

### 4.10 组件验证

| 组件 | 验证点 |
|------|--------|
| calendar-view | 月份渲染正确、日期点击事件、状态标记样式、手势滑动切换月份 |
| stats-chart | 图表渲染正确、数据绑定、空数据处理、响应式布局 |
| course-card | 课程信息展示、进度条渲染、点击事件 |
| empty-state | 图标/文字展示、操作引导按钮 |
| loading-skeleton | 骨架屏动画、加载完成后隐藏 |

---

## 五、边界场景和安全验证点

### 5.1 时区一致性验证

| 验证ID | 场景 | 验证方法 | 预期 |
|--------|------|---------|------|
| TZ-001 | 北京时间 23:59 消课 | 在北京时间 23:59 执行消课 | lessonDate 为当天（非 UTC 次日） |
| TZ-002 | 北京时间 00:01 消课 | 在北京时间 00:01 执行消课 | lessonDate 为当天 |
| TZ-003 | autoDeduct 时区匹配 | UTC 时间触发（北京时间 08:00） | getBeijingToday() 返回正确的北京时间日期 |
| TZ-004 | 日历查询时区 | 查询当月日历 | 日期字符串为北京时间 YYYY-MM-DD |
| TZ-005 | 排课 dayOfWeek 匹配 | 周一的排课在周一手动触发 autoDeduct | getBeijingDayOfWeek 返回正确值 |
| TZ-006 | 过期日期边界 | expiryDate 为当天，北京时间还有 1 小时 | 课程不算过期 |

### 5.2 数值边界验证

| 验证ID | 场景 | 预期 |
|--------|------|------|
| NUM-001 | totalHours=0.01（极小值） | 创建成功，剩余课时=0.01 |
| NUM-002 | totalHours=99999（极大值） | 创建成功 |
| NUM-003 | deductionUnit=0.001（极小扣除） | 创建成功 |
| NUM-004 | 浮点精度：0.1+0.2 | consumedHours 计算不应出现 0.30000000000000004 |
| NUM-005 | remainingHours=0.001 时消课 1.0 | remainingHours 变为负数，课程标记为 completed |
| NUM-006 | 分页 pageSize=0 | 应使用默认值或返回空 |
| NUM-007 | 分页 pageNum=0 或负数 | 应使用默认值 pageNum=1 |

### 5.3 安全验证

| 验证ID | 场景 | 验证方法 | 预期 |
|--------|------|---------|------|
| SEC-001 | 用户 A 访问用户 B 的课程 | 用 OPENID_A 查询 OPENID_B 的 courseId | 返回"课程不存在或无权限访问" |
| SEC-002 | 用户 A 修改用户 B 的课程 | 用 OPENID_A 更新 OPENID_B 的 courseId | 返回"课程不存在或无权限修改" |
| SEC-003 | 用户 A 删除用户 B 的课程 | 用 OPENID_A 删除 OPENID_B 的 courseId | 返回"课程不存在或无权限操作" |
| SEC-004 | 用户 A 消课用户 B 的课程 | 用 OPENID_A 对 OPENID_B 的 courseId 消课 | 返回"课程不存在或无权限操作" |
| SEC-005 | SQL/NoSQL 注入（课程名） | name="{$gt:''}" | 被当作普通字符串处理，不触发查询注入 |
| SEC-006 | 超长字符串输入 | name 长度 10000 字符 | 云函数应正常处理或返回参数校验错误 |
| SEC-007 | XSS 攻击（备注字段） | notes 含 `<script>alert(1)</script>` | 存储原样存储，前端渲染时 WXML 自动转义 |
| SEC-008 | 审计日志不可篡改 | 尝试直接操作 audit_logs 集合 | 仅通过云函数写入，前端无直接写入入口 |

### 5.4 并发安全验证

| 验证ID | 场景 | 验证方法 | 预期 |
|--------|------|---------|------|
| CON-001 | 同时手动消课 + 自动消课 | 并发触发 lessonManager.add 和 autoDeduct 对同一课程 | 事务保证仅一个成功，另一个因课时不足或幂等锁失败 |
| CON-002 | 同时两次手动消课 | 并发触发两次 lessonManager.add 对同一课程同一天 | 第二次因重复消课检查失败 |
| CON-003 | 消课并发修改 totalHours | 消课的同时修改 totalHours | 事务内二次校验 catch 到变化，回滚或重算 |
| CON-004 | 自动消课定时触发器重试 | 同一触发器周期内两次执行 | 幂等锁保证仅扣一次 |

### 5.5 异常恢复验证

| 验证ID | 场景 | 验证方法 | 预期 |
|--------|------|---------|------|
| REC-001 | 事务中途失败回滚 | 模拟事务中某步骤异常 | courses、lesson_records、audit_logs 三者均不变更 |
| REC-002 | 审计日志写入失败不阻断主流程 | 模拟 audit_logs 集合不可用 | 主业务操作（消课/更新）仍成功完成 |
| REC-003 | 云函数超时（3秒限制） | 大量排课同时消课 | MAX_AUTO_DEDUCT_PER_RUN=20 限制处理量，防止超时 |
| REC-004 | 数据库连接异常 | 模拟网络中断 | 云函数返回 error，不产生脏数据 |
| REC-005 | 排课 effectiveFrom > effectiveTo | 手动构造异常排课数据 | 该排课永远不匹配，不影响其他排课 |
