/**
 * initDB - 数据库初始化云函数
 *
 * 职责：
 *   1. 为所有业务集合创建查询索引，优化性能
 *   2. 为 deduction_locks 集合创建 TTL 索引（7天自动删除）
 *   3. 输出索引创建结果摘要
 *
 * ⚠️ 使用说明：
 *   1. 首次部署后，在微信开发者工具的云函数面板中手动触发此函数一次
 *   2. 如果索引已存在，创建操作会报错（可忽略，索引无须重建）
 *   3. 不建议将此函数暴露给前端，仅在开发者工具中手动运行
 *
 * 调用方式（仅供后台使用）:
 *   在微信开发者工具的"云开发控制台 → 云函数 → initDB"中点击"测试"
 *
 * @module initDB
 * @responsible DeepSeek V4 Pro
 * @phase Phase 3
 */

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// ============================================================
// 索引定义配置
// ============================================================
// 格式: { collection: 集合名, indexes: [{fields, options}] }
const INDEX_CONFIG = [
  // --- courses 集合 ---
  {
    collection: 'courses',
    indexes: [
      {
        // 首页按状态查询活跃课程
        fields: { _openid: 1, status: 1 },
        options: { name: 'idx_openid_status' }
      },
      {
        // 过期扫描
        fields: { _openid: 1, expiryDate: 1 },
        options: { name: 'idx_openid_expiryDate' }
      },
      {
        // 低课时预警
        fields: { _openid: 1, remainingHours: 1 },
        options: { name: 'idx_openid_remainingHours' }
      }
    ]
  },

  // --- schedules 集合 ---
  {
    collection: 'schedules',
    indexes: [
      {
        // 按课程查排课
        fields: { courseId: 1, status: 1 },
        options: { name: 'idx_courseId_status' }
      },
      {
        // 定时触发器扫表（按星期和时间查找活跃排课）
        fields: { dayOfWeek: 1, time: 1, status: 1 },
        options: { name: 'idx_dayOfWeek_time_status' }
      }
    ]
  },

  // --- lesson_records 集合 ---
  {
    collection: 'lesson_records',
    indexes: [
      {
        // 按课程 + 日期查消课记录
        fields: { courseId: 1, lessonDate: 1 },
        options: { name: 'idx_courseId_lessonDate' }
      },
      {
        // 日历视图（用户 + 月份范围）
        fields: { _openid: 1, lessonDate: 1 },
        options: { name: 'idx_openid_lessonDate' }
      },
      {
        // 幂等去重（同一排课、同一天不重复消课）
        fields: { scheduleId: 1, lessonDate: 1 },
        options: { name: 'idx_scheduleId_lessonDate' }
      }
    ]
  },

  // --- audit_logs 集合 ---
  {
    collection: 'audit_logs',
    indexes: [
      {
        // 按用户 + 时间倒排
        fields: { _openid: 1, createdAt: -1 },
        options: { name: 'idx_openid_createdAt' }
      },
      {
        // 按课程筛选日志
        fields: { _openid: 1, courseId: 1, createdAt: -1 },
        options: { name: 'idx_openid_courseId_createdAt' }
      },
      {
        // 按操作类型筛选
        fields: { _openid: 1, actionType: 1, createdAt: -1 },
        options: { name: 'idx_openid_actionType_createdAt' }
      }
    ]
  },

  // --- deduction_locks 集合（幂等锁） ---
  {
    collection: 'deduction_locks',
    indexes: [
      {
        // 幂等锁唯一键（核心：防止重复扣课时）
        fields: { lockKey: 1 },
        options: { name: 'idx_lockKey_unique', unique: true }
      }
      // 注意：TTL 索引（expireAt: 1, expireAfterSeconds: 0）
      // 需要在云开发控制台手动创建，因为 createIndex API 不支持 TTL 选项。
      // 替代方案：编写一个定期清理的云函数，或依赖 paid plan 的 TTL 特性。
      // 当前方案：deduction_locks 记录很少（每个排课每天1条），
      // 即使不清理也不会膨胀太快。如需清理，可增加定期云函数。
    ]
  }
]

/**
 * 云函数入口
 *
 * 遍历 INDEX_CONFIG，为每个集合创建已定义的索引。
 * 输出每个索引的创建结果（成功/失败/已存在）。
 *
 * @returns {object} { success: boolean, totalIndexes: number, results: [...] }
 */
exports.main = async (event, context) => {
  const results = []
  let totalIndexes = 0

  console.log('[initDB] 开始初始化数据库索引...')

  // 遍历每个集合的索引配置
  for (const config of INDEX_CONFIG) {
    const { collection: colName, indexes } = config
    console.log(`[initDB] 处理集合: ${colName}, 索引数: ${indexes.length}`)

    for (const idx of indexes) {
      totalIndexes++
      try {
        // 尝试创建索引
        await db.collection(colName).createIndex(idx.fields, idx.options)

        results.push({
          collection: colName,
          index: idx.options.name,
          status: 'created',
          message: `索引 ${idx.options.name} 创建成功`
        })
      } catch (err) {
        // errCode -1 通常表示索引已存在，这不算错误
        const isAlreadyExists =
          err.errCode === -1 ||
          (err.message && err.message.includes('already exists'))

        results.push({
          collection: colName,
          index: idx.options.name,
          status: isAlreadyExists ? 'already_exists' : 'error',
          message: isAlreadyExists
            ? `索引 ${idx.options.name} 已存在，跳过`
            : `创建失败: ${err.message} (errCode: ${err.errCode})`
        })
      }
    }
  }

  // 统计结果
  const created = results.filter(r => r.status === 'created').length
  const alreadyExists = results.filter(r => r.status === 'already_exists').length
  const errors = results.filter(r => r.status === 'error').length

  const summary = {
    totalIndexes,
    created,
    alreadyExists,
    errors,
    message: `索引创建完成: ${created} 新建, ${alreadyExists} 已存在, ${errors} 失败`
  }

  console.log(`[initDB] ${summary.message}`)
  console.log(`[initDB] ⚠️ 请前往云开发控制台 → 数据库 → deduction_locks → 索引管理`)
  console.log(`[initDB]    手动创建 TTL 索引: 字段 expireAt(升序) + expireAfterSeconds=0`)

  return {
    success: errors === 0,
    summary,
    results,
    manualSteps: [
      '1. 前往云开发控制台 → 数据库 → deduction_locks → 索引管理',
      '2. 手动创建 TTL 索引: 索引字段 expireAt(升序)',
      '3. 设置 expireAfterSeconds = 0（文档在 expireAt 时间后自动删除）',
      '4. 如需要也可在 deduction_locks 中手动确认 lockKey 唯一索引已创建'
    ]
  }
}
