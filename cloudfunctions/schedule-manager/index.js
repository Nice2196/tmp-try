/**
 * scheduleManager - 排课管理云函数
 *
 * 职责：
 *   1. 固定上课时间（周期性排课）的增删改查
 *   2. 排课重复校验（同一课程、同一 dayOfWeek + time 不可重复）
 *   3. 删除排课时关联检查（已有 auto 消课记录的不可物理删除，仅标记为 ended）
 *   4. 每次操作自动写入审计日志
 *
 * 权限隔离：
 *   通过 OPENID 限制，用户只能操作自己课程的排课。
 *
 * 输入格式:
 *   { action: 'create'|'listByCourse'|'update'|'delete', data: {...} }
 *
 * @module scheduleManager
 * @responsible DeepSeek V4 Pro
 * @phase Phase 3
 */

const cloud = require('wx-server-sdk')
const { getDB } = require('./common/db')
const { requireOpenID, injectOpenID, injectOpenIDToData } = require('./common/auth')
const {
  SCHEDULE_STATUS,
  ACTION_TYPES,
  TARGET_TYPE,
  TRIGGER_TYPE
} = require('./common/constants')
const { logInfo, logError } = require('./common/logger')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = getDB()

/**
 * 云函数主入口
 */
exports.main = async (event, context) => {
  const openid = requireOpenID(cloud)
  const { action, data } = event

  if (!action) {
    return { success: false, error: '缺少必填参数: action' }
  }

  logInfo('scheduleManager', `执行操作: ${action}`, { openid })

  try {
    switch (action) {
      case 'create':
        return await createSchedule(data, openid)
      case 'listByCourse':
        return await listByCourse(data, openid)
      case 'update':
        return await updateSchedule(data, openid)
      case 'delete':
        return await deleteSchedule(data, openid)
      default:
        return { success: false, error: `未知操作: ${action}` }
    }
  } catch (err) {
    logError('scheduleManager', `操作 ${action} 失败`, err)
    return { success: false, error: err.message || '服务内部错误' }
  }
}

// ============================================================
// 校验课程归属
// ============================================================

/**
 * 校验课程是否存在且属于当前用户
 *
 * 所有排课操作的前置检查：确保关联课程有效且用户有权限。
 *
 * @param {string} courseId - 课程 ID
 * @param {string} openid - 当前用户 OPENID
 * @returns {Promise<object>} 课程文档 { name, status, expiryDate, ... }
 * @throws {Error} 课程不存在或无权限
 */
async function validateCourseOwnership(courseId, openid) {
  const courseRes = await db.collection('courses')
    .where(injectOpenID({ _id: courseId }, openid))
    .get()

  if (courseRes.data.length === 0) {
    throw new Error('课程不存在或无权限操作')
  }

  const course = courseRes.data[0]

  // 已完成或已过期的课程不可新增排课
  if (course.status === 'completed' || course.status === 'expired') {
    throw new Error(`课程状态为"${course.status}"，不可添加排课`)
  }

  return course
}

// ============================================================
// 创建排课
// ============================================================

/**
 * 新增固定上课时间
 *
 * 业务规则：
 *   1. 同一课程、同一 dayOfWeek + time 不能重复
 *   2. effectiveTo 默认等于关联课程的 expiryDate
 *   3. dayOfWeek 范围 0-6（0=周日）
 *   4. time 格式 "HH:mm"（北京时间）
 */
async function createSchedule(data, openid) {
  const {
    courseId,
    dayOfWeek,
    time,
    effectiveFrom,
    effectiveTo
  } = data

  // --- 参数校验 ---
  if (!courseId) {
    return { success: false, error: '缺少课程ID' }
  }
  if (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6) {
    return { success: false, error: 'dayOfWeek 必须为 0-6 的整数（0=周日）' }
  }
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return { success: false, error: '上课时间格式必须为 HH:mm（如 17:00）' }
  }
  if (!effectiveFrom) {
    return { success: false, error: '缺少生效起始日期' }
  }

  // --- 校验课程归属 ---
  const course = await validateCourseOwnership(courseId, openid)

  // --- 重复排课检查 ---
  const dupCheck = await db.collection('schedules')
    .where({
      _openid: openid,
      courseId: courseId,
      dayOfWeek: Number(dayOfWeek),
      time: time,
      status: SCHEDULE_STATUS.ACTIVE
    })
    .count()

  if (dupCheck.total > 0) {
    return {
      success: false,
      error: `该课程已存在每周${getDayLabel(dayOfWeek)} ${time} 的排课，请勿重复添加`
    }
  }

  const now = new Date()

  // 构造排课文档
  const scheduleData = {
    courseId: courseId,
    courseName: course.name,
    dayOfWeek: Number(dayOfWeek),
    time: time,
    effectiveFrom: new Date(effectiveFrom),
    effectiveTo: effectiveTo ? new Date(effectiveTo) : new Date(course.expiryDate),
    status: SCHEDULE_STATUS.ACTIVE,
    lastDeductedDate: null,
    createdAt: now,
    updatedAt: now
  }

  // 插入排课
  const result = await db.collection('schedules').add({
    data: injectOpenIDToData(scheduleData, openid)
  })

  // 写入审计日志
  await writeAuditLog({
    openid,
    actionType: ACTION_TYPES.SCHEDULE_CREATE,
    targetType: TARGET_TYPE.SCHEDULE,
    targetId: result._id,
    courseId: courseId,
    courseName: course.name,
    detail: {
      action: 'create',
      schedule: {
        dayOfWeek: Number(dayOfWeek),
        time: time,
        effectiveFrom: effectiveFrom,
        effectiveTo: scheduleData.effectiveTo
      }
    },
    trigger: TRIGGER_TYPE.MANUAL
  })

  logInfo('scheduleManager', '排课创建成功', {
    scheduleId: result._id,
    courseId,
    dayOfWeek,
    time
  })

  return {
    success: true,
    data: { _id: result._id, ...scheduleData }
  }
}

// ============================================================
// 按课程查询排课列表
// ============================================================

/**
 * 查询指定课程的所有排课
 */
async function listByCourse(data, openid) {
  const { courseId, status } = data

  if (!courseId) {
    return { success: false, error: '缺少课程ID' }
  }

  // 先确认课程归属
  await validateCourseOwnership(courseId, openid)

  // 构建查询条件
  const condition = { _openid: openid, courseId: courseId }
  if (status) {
    condition.status = status
  }

  const result = await db.collection('schedules')
    .where(condition)
    .orderBy('dayOfWeek', 'asc')
    .orderBy('time', 'asc')
    .get()

  return {
    success: true,
    data: {
      schedules: result.data,
      total: result.data.length
    }
  }
}

// ============================================================
// 更新排课
// ============================================================

/**
 * 修改排课信息
 *
 * 支持修改：dayOfWeek, time, effectiveFrom, effectiveTo, status
 * 修改 dayOfWeek+time 时需重新检查重复。
 */
async function updateSchedule(data, openid) {
  const { id, ...updateFields } = data

  if (!id) {
    return { success: false, error: '缺少排课ID' }
  }

  // 查询原排课
  const origRes = await db.collection('schedules')
    .where(injectOpenID({ _id: id }, openid))
    .get()

  if (origRes.data.length === 0) {
    return { success: false, error: '排课不存在或无权限操作' }
  }

  const original = origRes.data[0]

  // 如果修改了 dayOfWeek 或 time，检查是否与已有排课重复
  const newDayOfWeek = updateFields.dayOfWeek !== undefined ? Number(updateFields.dayOfWeek) : original.dayOfWeek
  const newTime = updateFields.time || original.time

  if (updateFields.dayOfWeek !== undefined || updateFields.time !== undefined) {
    const dupCheck = await db.collection('schedules')
      .where({
        _openid: openid,
        courseId: original.courseId,
        dayOfWeek: newDayOfWeek,
        time: newTime,
        status: SCHEDULE_STATUS.ACTIVE,
        _id: db.command.neq(id)  // 排除自身
      })
      .count()

    if (dupCheck.total > 0) {
      return {
        success: false,
        error: `该课程已存在每周${getDayLabel(newDayOfWeek)} ${newTime} 的排课`
      }
    }
  }

  // 构造更新数据
  const now = new Date()
  const updateData = { updatedAt: now }
  const changes = {}

  const editableFields = ['dayOfWeek', 'time', 'effectiveFrom', 'effectiveTo', 'status']
  for (const field of editableFields) {
    if (updateFields[field] !== undefined && updateFields[field] !== original[field]) {
      changes[field] = { from: original[field], to: updateFields[field] }
      // 日期字段需要转换为 Date 对象
      if (['effectiveFrom', 'effectiveTo'].includes(field)) {
        updateData[field] = new Date(updateFields[field])
      } else if (field === 'dayOfWeek') {
        updateData[field] = Number(updateFields[field])
      } else {
        updateData[field] = updateFields[field]
      }
    }
  }

  if (Object.keys(changes).length === 0) {
    return { success: true, data: { message: '无变更' } }
  }

  // 执行更新
  await db.collection('schedules')
    .where(injectOpenID({ _id: id }, openid))
    .update({ data: updateData })

  // 写入审计日志
  await writeAuditLog({
    openid,
    actionType: ACTION_TYPES.SCHEDULE_UPDATE,
    targetType: TARGET_TYPE.SCHEDULE,
    targetId: id,
    courseId: original.courseId,
    courseName: original.courseName,
    detail: { action: 'update', changes },
    trigger: TRIGGER_TYPE.MANUAL
  })

  logInfo('scheduleManager', '排课更新成功', { scheduleId: id, changes })

  return {
    success: true,
    data: { _id: id, changes: Object.keys(changes) }
  }
}

// ============================================================
// 删除排课
// ============================================================

/**
 * 删除排课（逻辑删除）
 *
 * 规则：
 *   1. 无 auto 消课记录的排课 → 物理删除
 *   2. 有 auto 消课记录的排课 → 标记为 'ended'（保留历史记录）
 */
async function deleteSchedule(data, openid) {
  const { id } = data

  if (!id) {
    return { success: false, error: '缺少排课ID' }
  }

  // 查询排课
  const origRes = await db.collection('schedules')
    .where(injectOpenID({ _id: id }, openid))
    .get()

  if (origRes.data.length === 0) {
    return { success: false, error: '排课不存在或无权限操作' }
  }

  const schedule = origRes.data[0]

  // 检查是否有 auto 消课记录
  const lessonCount = await db.collection('lesson_records')
    .where({
      _openid: openid,
      scheduleId: id,
      deductionType: 'auto'
    })
    .count()

  let result
  if (lessonCount.total > 0) {
    // 有消课记录 → 标记为 ended
    await db.collection('schedules')
      .where(injectOpenID({ _id: id }, openid))
      .update({
        data: {
          status: SCHEDULE_STATUS.ENDED,
          updatedAt: new Date()
        }
      })

    result = {
      deleted: false,
      markedAsEnded: true,
      message: '该排课已有消课记录，已标记为"已终止"（历史记录保留）'
    }
  } else {
    // 无消课记录 → 物理删除
    await db.collection('schedules')
      .where(injectOpenID({ _id: id }, openid))
      .remove()

    result = {
      deleted: true,
      markedAsEnded: false,
      message: '排课已删除'
    }
  }

  // 写入审计日志
  await writeAuditLog({
    openid,
    actionType: ACTION_TYPES.SCHEDULE_DELETE,
    targetType: TARGET_TYPE.SCHEDULE,
    targetId: id,
    courseId: schedule.courseId,
    courseName: schedule.courseName,
    detail: {
      action: 'delete',
      ...result,
      schedule: {
        dayOfWeek: schedule.dayOfWeek,
        time: schedule.time
      }
    },
    trigger: TRIGGER_TYPE.MANUAL
  })

  logInfo('scheduleManager', '排课删除成功', { scheduleId: id, ...result })

  return { success: true, data: result }
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 获取星期中文标签
 */
function getDayLabel(dayOfWeek) {
  const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return labels[dayOfWeek] || `星期${dayOfWeek}`
}

/**
 * 写入审计日志（异步，不阻断主流程）
 */
async function writeAuditLog(params) {
  try {
    await db.collection('audit_logs').add({
      data: {
        _openid: params.openid,
        actionType: params.actionType,
        targetType: params.targetType,
        targetId: params.targetId,
        courseId: params.courseId || '',
        courseName: params.courseName || '',
        detail: params.detail || {},
        trigger: params.trigger || TRIGGER_TYPE.MANUAL,
        createdAt: new Date()
      }
    })
  } catch (err) {
    console.error('[scheduleManager] 审计日志写入失败:', err.message)
  }
}

module.exports = { main: exports.main }
