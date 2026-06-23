/**
 * initDB - 数据库初始化云函数
 *
 * 职责：
 *   1. 使用 db.createCollection() API 显式创建所有业务集合
 *   2. 输出索引创建指引（需在云开发控制台手动创建）
 *
 * ⚠️ 注意：
 *   - 新版微信云开发不再支持 "首次 add() 时自动建集合"，必须显式创建
 *   - createCollection() 是官方 API，适用于基础版及以上环境
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
 * 使用 db.createCollection() API 显式创建集合。
 * 注意：新版微信云开发不再支持 "首次 add() 自动建集合" 的行为，
 * 必须先创建集合才能写入数据。
 */
/**
 * 创建 deduction_locks 的 TTL 索引
 *
 * 微信云开发控制台 UI 不支持创建 TTL 索引，
 * 必须通过 aggregate + $out 或 raw command 方式创建。
 * 这里使用 db.command.aggregate 的方式尝试创建。
 */
async function createTTLIndex() {
  try {
    // 微信云开发 Node SDK 支持通过 collection.database().command 创建索引
    // 但标准 API 不直接暴露 createIndex
    // 尝试使用 raw API
    const coll = db.collection('deduction_locks')

    // 检查是否已有 TTL 索引
    const existingIndexes = await coll.indexes && coll.indexes()
      .catch(() => null)

    // 如果 SDK 不支持 indexes()，则尝试通过 aggregate 方式创建
    // 微信云开发的 aggregate 不直接支持 createIndex
    // 但可以通过 $merge 或 $out 间接实现

    // 最可靠的方式：使用 db.driver.Database().createIndex()
    // 但这在微信云开发中不可用

    // 实际上微信云开发的 Node SDK 不暴露 createIndex API
    // TTL 索引只能在控制台创建，或者通过 HTTP API

    console.log('[initDB] deduction_locks TTL 索引需要在云开发控制台手动创建')
    return { status: 'manual_required', message: '请在云开发控制台手动创建 TTL 索引' }
  } catch (err) {
    console.error('[initDB] TTL 索引创建失败:', err)
    return { status: 'error', message: err.message }
  }
}

exports.main = async (event, context) => {
  const results = []
  console.log('[initDB] 开始初始化数据库集合...')

  for (const colDef of REQUIRED_COLLECTIONS) {
    try {
      // 使用官方 createCollection API 创建集合
      await db.createCollection(colDef.name)

      results.push({
        collection: colDef.name,
        desc: colDef.desc,
        status: 'ok',
        message: `集合已创建: ${colDef.desc}`
      })

      console.log(`[initDB] ✅ ${colDef.name} - ${colDef.desc}`)
    } catch (err) {
      // 判断是否因为集合已存在而失败
      const alreadyExists =
        err.errCode === -1 ||
        err.errCode === -502001 ||
        (err.message && (
          err.message.includes('already exist') ||
          err.message.includes('ResourceConflict') ||
          err.message.includes('CollectionAlreadyExists') ||
          err.message.includes('already exists')
        )) ||
        (err.errMsg && err.errMsg.includes('already exist'))

      results.push({
        collection: colDef.name,
        desc: colDef.desc,
        status: alreadyExists ? 'already_exists' : 'error',
        message: alreadyExists
          ? `集合已存在: ${colDef.desc}`
          : `创建失败: ${err.message || err.errMsg || JSON.stringify(err)}`
      })

      if (alreadyExists) {
        console.log(`[initDB] ⏭ ${colDef.name} 已存在，跳过`)
      } else {
        console.error(`[initDB] ❌ ${colDef.name} 失败:`, err.message || err.errMsg || JSON.stringify(err))
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
      '📋 索引创建说明',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '普通索引：云开发控制台 → 数据库 → 选择集合 → 索引管理 → 新建索引',
      '',
      ...INDEX_GUIDE.flatMap(g => [
        `▸ ${g.collection}:`,
        ...g.indexes.map(i => `    ${i.字段}  ← ${i.用途}`),
        ''
      ]),
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '⚠️ TTL 索引说明',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'deduction_locks 的 expireAt TTL 索引需要通过 HTTP API 创建：',
      '',
      'POST https://api.weixin.qq.com/tcb/createindex',
      'Content-Type: application/json',
      '',
      '{',
      '  "env": "<your-env-id>",',
      '  "collection_name": "deduction_locks",',
      '  "create_indexes": [{',
      '    "Name": "expireAt_ttl",',
      '    "Key": {"expireAt": 1},',
      '    "Background": true,',
      '    "ExpireAfterSeconds": 604800',
      '  }]',
      '}',
      '',
      '或使用 miniprogram-ci CLI 工具创建。'
    ]
  }
}
