/**
 * initDB - 数据库初始化云函数
 *
 * 职责：
 *   1. 创建所有业务集合（首次写入时自动创建）
 *   2. 输出索引创建指引（需在云开发控制台手动创建）
 *
 * ⚠️ 使用说明：
 *   1. 在微信开发者工具的云开发控制台 → 云函数 → initDB → 云端测试
 *   2. 运行后按返回的 manualSteps 去控制台手动创建索引
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
// 需要创建的集合列表
// ============================================================
const REQUIRED_COLLECTIONS = [
  { name: 'courses', desc: '课程基本信息' },
  { name: 'schedules', desc: '固定排课计划' },
  { name: 'lesson_records', desc: '消课记录' },
  { name: 'audit_logs', desc: '操作审计日志' },
  { name: 'deduction_locks', desc: '自动消课幂等锁' }
]

// ============================================================
// 索引创建指引（需在云开发控制台手动操作）
// ============================================================
const INDEX_GUIDE = [
  {
    collection: 'courses',
    indexes: [
      { 字段: '_openid + status', 用途: '首页按状态查询课程' },
      { 字段: '_openid + expiryDate', 用途: '过期课程扫描' },
      { 字段: '_openid + remainingHours', 用途: '低课时预警' }
    ]
  },
  {
    collection: 'schedules',
    indexes: [
      { 字段: 'courseId + status', 用途: '按课程查排课' },
      { 字段: 'dayOfWeek + time + status', 用途: '定时自动消课扫表' }
    ]
  },
  {
    collection: 'lesson_records',
    indexes: [
      { 字段: 'courseId + lessonDate', 用途: '消课记录查询' },
      { 字段: '_openid + lessonDate', 用途: '日历视图日期查询' },
      { 字段: 'scheduleId + lessonDate', 用途: '幂等去重(唯一索引)' }
    ]
  },
  {
    collection: 'audit_logs',
    indexes: [
      { 字段: '_openid + createdAt', 用途: '日志时间排序' },
      { 字段: '_openid + courseId + createdAt', 用途: '按课程筛选日志' },
      { 字段: '_openid + actionType + createdAt', 用途: '按操作类型筛选' }
    ]
  },
  {
    collection: 'deduction_locks',
    indexes: [
      { 字段: 'lockKey (唯一索引)', 用途: '幂等锁，防止重复扣课时 🔑' },
      { 字段: 'expireAt (TTL索引)', 用途: '7天后自动删除过期锁' }
    ]
  }
]

/**
 * 云函数入口
 *
 * 为每个集合写入一条初始化文档，触发集合自动创建。
 * 初始化文档随后会被删除，只保留集合结构。
 */
exports.main = async (event, context) => {
  const results = []
  console.log('[initDB] 开始初始化数据库集合...')

  for (const colDef of REQUIRED_COLLECTIONS) {
    try {
      // 写入一条标记文档，触发集合自动创建
      const addResult = await db.collection(colDef.name).add({
        data: {
          _type: '_init_marker',
          _desc: `[initDB] ${colDef.desc} 集合初始化标记`,
          createdAt: new Date()
        }
      })

      // 立即删除标记文档（保持集合干净）
      try {
        await db.collection(colDef.name).doc(addResult._id).remove()
      } catch (_) {
        // 删除失败不影响结果
      }

      results.push({
        collection: colDef.name,
        desc: colDef.desc,
        status: 'ok',
        message: `集合已创建: ${colDef.desc}`
      })

      console.log(`[initDB] ✅ ${colDef.name} - ${colDef.desc}`)
    } catch (err) {
      // 集合可能已存在（重复执行时）
      const alreadyExists = err.errCode === -1 || (err.message && (
        err.message.includes('already exist') ||
        err.message.includes('ResourceConflict')
      ))

      results.push({
        collection: colDef.name,
        desc: colDef.desc,
        status: alreadyExists ? 'already_exists' : 'error',
        message: alreadyExists
          ? `集合已存在: ${colDef.desc}`
          : `创建失败: ${err.message}`
      })

      if (alreadyExists) {
        console.log(`[initDB] ⏭ ${colDef.name} 已存在，跳过`)
      } else {
        console.error(`[initDB] ❌ ${colDef.name} 失败:`, err.message)
      }
    }
  }

  const okCount = results.filter(r => r.status === 'ok').length
  const existCount = results.filter(r => r.status === 'already_exists').length
  const errCount = results.filter(r => r.status === 'error').length

  console.log(`[initDB] 完成: ${okCount} 新建, ${existCount} 已存在, ${errCount} 失败`)

  return {
    success: errCount === 0,
    summary: {
      total: REQUIRED_COLLECTIONS.length,
      created: okCount,
      alreadyExists: existCount,
      errors: errCount
    },
    results,
    manualSteps: [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '📋 索引需要手动创建（微信云开发限制）',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '操作路径：云开发控制台 → 数据库 → 选择集合 → 索引管理 → 新建索引',
      '',
      ...INDEX_GUIDE.flatMap(g => [
        `▸ ${g.collection}:`,
        ...g.indexes.map(i => `    ${i.字段}  ← ${i.用途}`),
        ''
      ])
    ]
  }
}
