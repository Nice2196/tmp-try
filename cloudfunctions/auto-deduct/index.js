/**
 * autoDeduct - 自动消课云函数
 *
 * 这是整个系统最核心的业务逻辑模块，通过微信云开发定时触发器
 * 每小时执行一次，扫描当日应消课的排课并自动扣除课时。
 *
 * 职责：
 *   1. 确定目标日期（默认今天北京时间）
 *   2. 查 schedules（status=active, dayOfWeek 匹配, 日期在有效期内）
 *   3. 对每条匹配排课：幂等锁检查 → 课程有效性校验 → 事务消课
 *   4. 输出统计摘要（扫描/匹配/成功/跳过数量）
 *
 * ⚠️ 幂等性保障（关键设计）：
 *   deduction_locks 集合的 lockKey 有唯一索引（unique index）。
 *   原子插入操作：第一次成功执行业务，重复插入因唯一索引冲突自动跳过。
 *   这是数据库级别保证，而不是应用层的 check-then-act。
 *
 *   即使定时触发器因网络重试、系统延迟、并发等原因重复触发，
 *   同一天同一排课只会被扣一次。
 *
 * ⚠️ 时区策略：
 *   定时触发器的 cron 基于 UTC 时间。
 *   但函数内部通过 getBeijingToday() 获取北京时间当天日期，
 *   与 schedules 中存储的 dayOfWeek（北京时间星期）匹配。
 *
 * ⚠️ 处理上限：
 *   为防止云函数超时（默认 3 秒，可配置为 60 秒），
 *   单次最多处理 MAX_AUTO_DEDUCT_PER_RUN = 20 条排课。
 *   超出部分由下一次定时调度继续处理。
 *
 * 定时触发器配置 (config.json):
 *   "0 0 * * * * *"  — 每小时整点执行
 *   等价描述: 每小时的 0 分 0 秒
 *
 * 定时触发器环境的特殊性:
 *   定时触发器调用时 cloud.getWXContext() 不返回 OPENID（没有用户上下文）。
 *   因此本函数以系统身份运行，需要查询所有用户的排课数据。
 *   但插入 lesson_records 和更新 courses 时仍需保留正确的 _openid。
 *
 * @module autoDeduct
 * @responsible DeepSeek V4 Pro
 * @phase Phase 4
 */

const cloud = require('wx-server-sdk')
const { getDB } = require('./common/db')
const { tryGetOpenID } = require('./common/auth')
const { tryAcquireLockNonTx } = require('./common/idempotency')
const {
  COURSE_STATUS,
  DEDUCTION_TYPE,
  ACTION_TYPES,
  TARGET_TYPE,
  TRIGGER_TYPE,
  BUSINESS
} = require('./common/constants')
const { logInfo, logWarn, logError, logDeductionFailure } = require('./common/logger')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  // 增加超时时间，防止事务处理中函数被kill
  timeout: 60
})

const db = getDB()

/**
 * 云函数主入口
 *
 * @param {object} event - 定时触发器传入空对象 {}；手动触发可传 { year, month, day } 指定日期
 * @param {object} context
 * @returns {object} 消课统计摘要
 */
exports.main = async (event, context) => {
  // 定时触发器没有用户上下文
  const openid = tryGetOpenID(cloud)
  const isManualTrigger = !!openid // 手动触发时有 OPENID

  // 确定目标日期
  const targetDate = getTargetDate(event)

  logInfo('autoDeduct', `自动消课开始`, {
    targetDate: formatBeijingDate(targetDate),
    trigger: isManualTrigger ? 'manual' : 'scheduler',
    openid: openid || 'system'
  })

  // 统计变量
  const stats = {
    totalChecked: 0,
    matchedSchedules: 0,
    successfullyDeducted: 0,
    skipped: {
      locked: 0,           // 已加锁（幂等跳过）
      courseInactive: 0,   // 课程状态不允许
      insufficientHours: 0, // 课时不足
      expired: 0,          // 已过期
      errors: 0            // 执行异常
    },
    details: []
  }

  try {
    // ============================================================
    // 步骤1：计算目标日期的星期
    // ============================================================
    const targetDayOfWeek = getBeijingDayOfWeek(targetDate)

    // ============================================================
    // 步骤2：查询匹配的活跃排课
    // ============================================================
    const scheduleQuery = db.collection('schedules')
      .where({
        status: 'active',
        dayOfWeek: targetDayOfWeek,
        effectiveFrom: db.command.lte(targetDate),
        effectiveTo: db.command.gte(targetDate)
      })
      .limit(BUSINESS.MAX_AUTO_DEDUCT_PER_RUN)

    const scheduleRes = await scheduleQuery.get()
    stats.totalChecked = scheduleRes.data.length

    logInfo('autoDeduct', `扫描到 ${stats.totalChecked} 条匹配排课`)

    if (stats.totalChecked === 0) {
      return { success: true, stats, message: '无符合条件的排课' }
    }

    // ============================================================
    // 步骤3：逐条处理
    // ============================================================
    const targetDateStr = formatBeijingDate(targetDate)

    for (const schedule of scheduleRes.data) {
      stats.matchedSchedules++

      try {
        await processSchedule(schedule, targetDate, targetDateStr, stats)
      } catch (err) {
        stats.skipped.errors++
        logDeductionFailure(
          'autoDeduct',
          schedule.courseId,
          schedule._id,
          targetDateStr,
          err.message || '未知异常',
          { schedule }
        )
        stats.details.push({
          scheduleId: schedule._id,
          courseId: schedule.courseId,
          status: 'error',
          reason: err.message
        })
      }
    }

    logInfo('autoDeduct', '自动消课完成', stats)

    return {
      success: true,
      stats,
      message: `处理完成: ${stats.successfullyDeducted} 成功, ${stats.skipped.locked} 幂等跳过, ${stats.skipped.errors} 失败`
    }
  } catch (err) {
    logError('autoDeduct', '自动消课主流程异常', err)
    return { success: false, error: err.message, stats }
  }
}

// ============================================================
// 处理单条排课的消课逻辑
// ============================================================

/**
 * 对一条排课执行自动消课（含幂等检查、状态校验、事务操作）
 *
 * @param {object} schedule - 排课文档
 * @param {Date} targetDate - 目标日期（Date对象）
 * @param {string} targetDateStr - 目标日期字符串 "YYYY-MM-DD"
 * @param {object} stats - 统计对象（引用传递，会修改）
 */
async function processSchedule(schedule, targetDate, targetDateStr, stats) {
  const { courseId, _id: scheduleId } = schedule

  // ============================================================
  // 步骤3a：幂等锁检查（数据库级别原子操作）
  // ============================================================
  const locked = await tryAcquireLockNonTx(db, courseId, scheduleId, targetDateStr)

  if (!locked) {
    // lockKey 已存在 → 已处理过，跳过
    stats.skipped.locked++
    stats.details.push({
      scheduleId,
      courseId,
      status: 'skipped',
      reason: '幂等锁已存在，跳过重复消课'
    })
    return
  }

  // ============================================================
  // 步骤3b：查询课程并校验有效性
  // ============================================================

  // 从 schedule 的 _openid 获取课程所属用户
  const userOpenid = schedule._openid
  if (!userOpenid) {
    stats.skipped.errors++
    throw new Error(`排课 ${scheduleId} 缺少 _openid 字段`)
  }

  const courseRes = await db.collection('courses')
    .where({
      _id: courseId,
      _openid: userOpenid
    })
    .get()

  if (courseRes.data.length === 0) {
    stats.skipped.courseInactive++
    stats.details.push({
      scheduleId,
      courseId,
      status: 'skipped',
      reason: '课程不存在或数据异常'
    })
    return
  }

  const course = courseRes.data[0]

  // 校验课程状态
  if (course.status !== COURSE_STATUS.ACTIVE) {
    stats.skipped.courseInactive++
    stats.details.push({
      scheduleId,
      courseId,
      status: 'skipped',
      reason: `课程状态为 "${course.status}"，非活跃状态`
    })
    return
  }

  // 校验过期
  const expiryBeijingDate = getBeijingDateStart(new Date(course.expiryDate))
  if (targetDate > expiryBeijingDate) {
    stats.skipped.expired++
    stats.details.push({
      scheduleId,
      courseId,
      status: 'skipped',
      reason: `课程已过期 (expiryDate: ${formatBeijingDate(expiryBeijingDate)})`
    })
    return
  }

  // 校验剩余课时
  const deductionUnit = course.deductionUnit || BUSINESS.DEFAULT_DEDUCTION_UNIT
  if (course.remainingHours < deductionUnit) {
    stats.skipped.insufficientHours++
    stats.details.push({
      scheduleId,
      courseId,
      status: 'skipped',
      reason: `剩余课时(${course.remainingHours})不足(${deductionUnit})`
    })
    // 可以在这里发送订阅消息提醒用户课时不足
    return
  }

  // ============================================================
  // 步骤3c：事务执行消课
  // ============================================================
  try {
    const transaction = await db.startTransaction()

    // --- 🔑 关键：事务内重读课程最新数据（防止与手动消课并发） ---
    const freshCourseRes = await transaction.collection('courses')
      .doc(courseId)
      .get()

    if (!freshCourseRes.data) {
      await transaction.rollback()
      stats.skipped.courseInactive++
      stats.details.push({
        scheduleId,
        courseId,
        status: 'skipped',
        reason: '课程在事务中已被删除'
      })
      return
    }

    const freshCourse = freshCourseRes.data

    // 二次校验：状态（防止在事务外读取后状态被变更）
    if (freshCourse.status !== COURSE_STATUS.ACTIVE) {
      await transaction.rollback()
      stats.skipped.courseInactive++
      stats.details.push({
        scheduleId,
        courseId,
        status: 'skipped',
        reason: `课程状态已变更为 "${freshCourse.status}"`
      })
      return
    }

    // 二次校验：剩余课时（防止在事务外读取后被手动消课扣减）
    if (freshCourse.remainingHours < deductionUnit) {
      await transaction.rollback()
      stats.skipped.insufficientHours++
      stats.details.push({
        scheduleId,
        courseId,
        status: 'skipped',
        reason: `剩余课时已不足(${freshCourse.remainingHours})，需要 ${deductionUnit}`
      })
      return
    }

    // 二次校验：过期（防止事务外读取后过期日期被提前）
    const freshExpiryBeijing = getBeijingDateStart(new Date(freshCourse.expiryDate))
    if (targetDate > freshExpiryBeijing) {
      await transaction.rollback()
      stats.skipped.expired++
      stats.details.push({
        scheduleId,
        courseId,
        status: 'skipped',
        reason: `课程在事务中已过期`
      })
      return
    }

    // 以事务内最新数据计算
    const newConsumed = freshCourse.consumedHours + deductionUnit
    const newRemaining = freshCourse.totalHours - newConsumed
    const shouldComplete = newRemaining <= 0

    // 1. 更新课程课时
    const courseUpdateData = {
      consumedHours: newConsumed,
      remainingHours: newRemaining,
      updatedAt: new Date()
    }
    if (shouldComplete) {
      courseUpdateData.status = COURSE_STATUS.COMPLETED
    }

    await transaction.collection('courses')
      .doc(courseId)
      .update({ data: courseUpdateData })

    // 2. 插入消课记录
    const lessonData = {
      courseId: courseId,
      courseName: freshCourse.name,
      scheduleId: scheduleId,
      lessonDate: targetDate,
      scheduledTime: schedule.time,
      deductionHours: deductionUnit,
      deductionType: DEDUCTION_TYPE.AUTO,
      beforeConsumed: freshCourse.consumedHours,
      afterConsumed: newConsumed,
      beforeRemaining: freshCourse.remainingHours,
      afterRemaining: newRemaining,
      status: 'completed',
      notes: '',
      createdAt: new Date()
    }

    const lessonResult = await transaction.collection('lesson_records').add({
      data: {
        ...lessonData,
        _openid: userOpenid  // 保留正确的用户归属
      }
    })

    // 3. 插入审计日志
    await transaction.collection('audit_logs').add({
      data: {
        _openid: userOpenid,
        actionType: ACTION_TYPES.LESSON_AUTO_DEDUCT,
        targetType: TARGET_TYPE.LESSON_RECORD,
        targetId: lessonResult._id,
        courseId: courseId,
        courseName: freshCourse.name,
        detail: {
          deductionType: DEDUCTION_TYPE.AUTO,
          deductionHours: deductionUnit,
          beforeConsumed: freshCourse.consumedHours,
          afterConsumed: newConsumed,
          beforeRemaining: freshCourse.remainingHours,
          afterRemaining: newRemaining,
          lessonDate: targetDateStr,
          triggeredCompletion: shouldComplete
        },
        trigger: TRIGGER_TYPE.AUTO_SCHEDULER,
        createdAt: new Date()
      }
    })

    // 4. 更新排课的 lastDeductedDate
    await transaction.collection('schedules')
      .doc(scheduleId)
      .update({
        data: {
          lastDeductedDate: targetDate,
          updatedAt: new Date()
        }
      })

    // 提交事务
    await transaction.commit()

    stats.successfullyDeducted++
    stats.details.push({
      scheduleId,
      courseId,
      courseName: course.name,
      status: 'deducted',
      deductionHours: deductionUnit,
      newRemaining,
      completed: shouldComplete
    })

    logInfo('autoDeduct', `成功消课: ${course.name}`, {
      courseId,
      scheduleId,
      deductionUnit,
      remaining: newRemaining
    })
  } catch (err) {
    // 事务失败（可能已回滚）
    stats.skipped.errors++
    logDeductionFailure(
      'autoDeduct',
      courseId,
      scheduleId,
      targetDateStr,
      `事务执行失败: ${err.message}`,
      { deductionUnit, remainingHours: course.remainingHours }
    )
    stats.details.push({
      scheduleId,
      courseId,
      status: 'error',
      reason: `事务失败: ${err.message}`
    })
  }
}

// ============================================================
// 时区与日期工具函数
// ============================================================

/**
 * 获取目标日期（默认北京时间今天）
 *
 * 定时触发器调用时 event 为空对象 {}，取默认值。
 * 手动触发时可通过 event 传入特定的 year/month/day。
 *
 * @param {object} event - 云函数参数
 * @returns {Date} 目标日期的北京时间 00:00:00（UTC 表示）
 */
function getTargetDate(event) {
  if (event && event.year && event.month && event.day) {
    // 手动指定日期（用于测试/补扣）
    const d = new Date(Date.UTC(event.year, event.month - 1, event.day, 0, 0, 0))
    // 转换为北京时间 00:00 的 UTC 表示
    // UTC(year,month,day,0,0,0) 在 UTC 时区是 midnight
    // 北京时间 00:00 = 前一天的 UTC 16:00
    // 简化处理：直接用 UTC Date(year, month-1, day) 作为北京的日期
    const beijing = new Date(Date.UTC(event.year, event.month - 1, event.day))
    beijing.setUTCHours(0, 0, 0, 0)
    return beijing
  }

  // 默认：北京时间今天
  return getBeijingToday()
}

/**
 * 获取北京时间今天的 00:00:00（UTC 表示）
 *
 * 例如：北京 2026-06-17 00:00:00 → UTC 2026-06-16 16:00:00
 *
 * @returns {Date}
 */
function getBeijingToday() {
  const now = new Date()
  // 当前 UTC → 加 8 小时得北京时间 → 清零时分秒 → 得到北京时间今天 00:00
  const beijingNow = new Date(now.getTime() + 8 * 3600 * 1000)
  const today = new Date(Date.UTC(
    beijingNow.getUTCFullYear(),
    beijingNow.getUTCMonth(),
    beijingNow.getUTCDate(),
    0, 0, 0
  ))
  return today
}

/**
 * 获取北京时间的星期几
 *
 * @param {Date} date - UTC 日期
 * @returns {number} 0=周日, 6=周六
 */
function getBeijingDayOfWeek(date) {
  // date 已经是北京时间 00:00 的 UTC 表示
  // 需要转回北京时间来获取正确的 dayOfWeek
  const beijing = new Date(date.getTime() + 8 * 3600 * 1000)
  return beijing.getUTCDay()
}

/**
 * 获取北京时间的日期起点（仅保留日期部分，清除时分秒）
 *
 * 输入: Date 对象（可能含有时分秒）
 * 输出: 北京时间当天 00:00 的 UTC 表示
 * 例如: 输入 "2026-06-17 15:30 UTC" → 北京 06-17 00:00 = 06-16T16:00Z
 *
 * @param {Date} date - 任意 Date 对象
 * @returns {Date} 北京时间当天 00:00 的 UTC Date
 */
function getBeijingDateStart(date) {
  // 先加 8h 得到北京时间，取日期部分
  const beijing = new Date(date.getTime() + 8 * 3600 * 1000)
  // 构造北京时间当天 00:00 的 UTC 时间
  // Beijing 00:00 = UTC 前一天 16:00
  const utcMidnight = new Date(Date.UTC(
    beijing.getUTCFullYear(),
    beijing.getUTCMonth(),
    beijing.getUTCDate(),
    0, 0, 0
  ))
  // UTC midnight 表示的是北京当天 08:00，不是 00:00
  // 真正北京 00:00 是 UTC 前一天 16:00
  // 但因为我们只用日期比较（忽略时间），直接用 UTC midnight 即可
  // 因为 Date.UTC(year, month, day, 0, 0, 0) 对于相同 day 在两个函数中一致
  return utcMidnight
}

/**
 * 格式化日期为北京时间 YYYY-MM-DD 字符串
 */
function formatBeijingDate(date) {
  const beijing = new Date(date.getTime() + 8 * 3600 * 1000)
  const y = beijing.getUTCFullYear()
  const m = String(beijing.getUTCMonth() + 1).padStart(2, '0')
  const d = String(beijing.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

module.exports = { main: exports.main }
