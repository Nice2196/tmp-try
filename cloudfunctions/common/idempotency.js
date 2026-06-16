/**
 * 幂等锁工具模块
 *
 * 职责：为自动消课操作提供数据库级别的幂等性保障。
 *
 * ## 为什么需要幂等锁？
 * 微信云开发的定时触发器可能出现以下情况导致重复执行：
 *   1. 云平台重试机制
 *   2. 定时触发器因系统负载延迟执行后补执行
 *   3. 网络超时后 SDK 自动重试
 *
 * 如果同一天、同一排课的消课操作被执行两次，将导致：
 *   - 课时被多扣
 *   - 消耗记录重复
 *   - 数据不一致
 *
 * ## 幂等锁原理
 * lockKey = "{courseId}_{scheduleId}_{YYYY-MM-DD}"
 *
 * deduction_locks 集合的 lockKey 字段有唯一索引（unique index）。
 * 原子插入操作：第一次插入成功 → 执行业务逻辑；
 * 重复插入时数据库抛出唯一索引冲突 → 自动跳过。
 *
 * 这是数据库级别保证，比应用层 "先查后写" 更可靠。
 *
 * ## TTL 自动清理
 * expireAt 字段有 TTL 索引，7 天后自动删除，
 * 防止锁集合无限膨胀。
 *
 * @module idempotency
 * @responsible DeepSeek V4 Pro
 */

const { BUSINESS } = require('./constants')

/**
 * 尝试获取幂等锁
 *
 * 原子操作：尝试向 deduction_locks 插入一条记录。
 * 如果 lockKey 已存在（唯一索引冲突），说明已处理过，返回 false。
 * 如果插入成功，返回 true，调用方应继续执行业务逻辑。
 *
 * ⚠️ 此函数应在事务内调用，确保锁的插入与业务操作原子绑定。
 *    如果作为独立调用，则使用先加锁后执行（锁成功后即使业务失败也不会重复执行）。
 *
 * @param {object} transaction - 云数据库事务对象
 * @param {string} courseId - 课程 _id
 * @param {string} scheduleId - 排课 _id
 * @param {string} dateStr - 目标日期字符串 "YYYY-MM-DD"
 * @returns {Promise<boolean>} true=锁获取成功（应继续处理），false=已处理过
 */
async function tryAcquireLock(transaction, courseId, scheduleId, dateStr) {
  const lockKey = buildLockKey(courseId, scheduleId, dateStr)
  const now = new Date()

  // 计算 expireAt：当前时间 + LOCK_TTL_DAYS 天
  const expireAt = new Date(now.getTime() + BUSINESS.LOCK_TTL_DAYS * 24 * 3600 * 1000)

  try {
    await transaction.collection('deduction_locks').add({
      data: {
        lockKey: lockKey,
        createdAt: now,
        expireAt: expireAt
      }
    })
    // 插入成功 → 锁获取成功
    return true
  } catch (err) {
    // errCode -1 表示唯一索引冲突 = 已加过锁
    if (err.errCode === -1) {
      return false
    }
    // 其他错误向上抛出
    throw err
  }
}

/**
 * 为非事务场景提供幂等锁获取方法
 *
 * 适用场景：autoDeduct 中在进入事务前先检查锁状态，
 * 快速跳过已处理的排课，避免无效的事务开销。
 *
 * @param {object} db - 数据库实例
 * @param {string} courseId - 课程 _id
 * @param {string} scheduleId - 排课 _id
 * @param {string} dateStr - 目标日期字符串 "YYYY-MM-DD"
 * @returns {Promise<boolean>} true=锁获取成功，false=已处理过
 */
async function tryAcquireLockNonTx(db, courseId, scheduleId, dateStr) {
  const lockKey = buildLockKey(courseId, scheduleId, dateStr)
  const now = new Date()
  const expireAt = new Date(now.getTime() + BUSINESS.LOCK_TTL_DAYS * 24 * 3600 * 1000)

  try {
    await db.collection('deduction_locks').add({
      data: {
        lockKey: lockKey,
        createdAt: now,
        expireAt: expireAt
      }
    })
    return true
  } catch (err) {
    if (err.errCode === -1) {
      return false
    }
    throw err
  }
}

/**
 * 构建幂等锁 Key
 *
 * @param {string} courseId - 课程 _id
 * @param {string} scheduleId - 排课 _id
 * @param {string} dateStr - 目标日期 "YYYY-MM-DD"
 * @returns {string} 锁 Key，格式: "courseId_scheduleId_2026-06-17"
 */
function buildLockKey(courseId, scheduleId, dateStr) {
  return `${courseId}_${scheduleId}_${dateStr}`
}

module.exports = {
  tryAcquireLock,
  tryAcquireLockNonTx,
  buildLockKey
}
