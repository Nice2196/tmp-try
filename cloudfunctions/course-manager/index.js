/**
 * courseManager - 课程管理云函数
 *
 * 职责：
 *   1. 课程的增删改查（create / get / list / update / delete）
 *   2. 课程状态变更（pause / resume）
 *   3. 每次操作自动写入审计日志（audit_logs）
 *   4. 删除课程时关联检查（有消课记录的课程不可物理删除）
 *   5. 修改 totalHours 时自动重算 remainingHours
 *   6. 根据 remainingHours 和 expiryDate 自动判定课程 status
 *
 * 权限隔离：
 *   所有操作通过 OPENID 过滤，用户只能操作自己的课程数据。
 *
 * 输入格式（通过 event）:
 *   { action: 'create'|'get'|'list'|'update'|'delete'|'pause'|'resume', data: {...} }
 *
 * 输出格式:
 *   { success: boolean, data?: ..., error?: string }
 *
 * @module courseManager
 * @responsible DeepSeek V4 Pro
 * @phase Phase 3
 */

const cloud = require('wx-server-sdk')
const { getDB } = require('./common/db')
const { requireOpenID, injectOpenID, injectOpenIDToData } = require('./common/auth')
const {
  COURSE_STATUS,
  ACTION_TYPES,
  TARGET_TYPE,
  TRIGGER_TYPE,
  BUSINESS
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

  // 参数校验：action 必须存在
  if (!action) {
    return { success: false, error: '缺少必填参数: action' }
  }

  logInfo('courseManager', `执行操作: ${action}`, { openid })

  try {
    switch (action) {
      case 'create':
        return await createCourse(data, openid)
      case 'get':
        return await getCourse(data, openid)
      case 'list':
        return await listCourses(data, openid)
      case 'update':
        return await updateCourse(data, openid)
      case 'delete':
        return await deleteCourse(data, openid)
      case 'pause':
        return await changeCourseStatus(data, openid, COURSE_STATUS.PAUSED)
      case 'resume':
        return await changeCourseStatus(data, openid, COURSE_STATUS.ACTIVE)
      default:
        return { success: false, error: `未知操作: ${action}` }
    }
  } catch (err) {
    logError('courseManager', `操作 ${action} 失败`, err)
    return { success: false, error: err.message || '服务内部错误' }
  }
}

// ============================================================
// 创建课程
// ============================================================

/**
 * 创建新课程
 *
 * 业务规则：
 *   1. 总课时必须 > 0
 *   2. 过期日期必须在开始日期之后
 *   3. remainingHours 初始值 = totalHours
 *   4. status 初始值 = 'active'
 *   5. 写入 audit_logs
 */
async function createCourse(data, openid) {
  const {
    name,
    courseType,
    subject,
    teacher = '',
    student = '',
    totalHours,
    deductionUnit = BUSINESS.DEFAULT_DEDUCTION_UNIT,
    startDate,
    expiryDate,
    lowHoursThreshold = BUSINESS.DEFAULT_LOW_HOURS_THRESHOLD,
    notes = ''
  } = data

  // --- 参数校验 ---
  if (!name || !name.trim()) {
    return { success: false, error: '课程名称不能为空' }
  }
  if (!totalHours || typeof totalHours !== 'number' || totalHours <= 0) {
    return { success: false, error: '总课时必须为大于0的数字' }
  }
  if (!startDate || !expiryDate) {
    return { success: false, error: '开始日期和过期日期不能为空' }
  }
  if (new Date(expiryDate) <= new Date(startDate)) {
    return { success: false, error: '过期日期必须在开始日期之后' }
  }
  if (deductionUnit <= 0) {
    return { success: false, error: '每次扣除课时数必须大于0' }
  }

  const now = new Date()

  // 构造课程文档
  const courseData = {
    name: name.trim(),
    courseType: courseType || 'one_on_one',
    subject: subject || 'other',
    teacher: teacher.trim(),
    student: student.trim(),
    totalHours: totalHours,
    consumedHours: 0,
    remainingHours: totalHours,
    deductionUnit: deductionUnit,
    startDate: new Date(startDate),
    expiryDate: new Date(expiryDate),
    lowHoursThreshold: lowHoursThreshold,
    status: COURSE_STATUS.ACTIVE,
    notes: notes.trim(),
    createdAt: now,
    updatedAt: now
  }

  // 插入课程
  const courseResult = await db.collection('courses').add({
    data: injectOpenIDToData(courseData, openid)
  })

  const courseId = courseResult._id

  // 写入审计日志
  await writeAuditLog({
    openid,
    actionType: ACTION_TYPES.COURSE_CREATE,
    targetType: TARGET_TYPE.COURSE,
    targetId: courseId,
    courseId: courseId,
    courseName: courseData.name,
    detail: {
      action: 'create',
      courseData: {
        name: courseData.name,
        totalHours: courseData.totalHours,
        courseType: courseData.courseType,
        subject: courseData.subject
      }
    },
    trigger: TRIGGER_TYPE.MANUAL
  })

  logInfo('courseManager', '课程创建成功', { courseId, name: courseData.name })

  return {
    success: true,
    data: { _id: courseId, ...courseData }
  }
}

// ============================================================
// 获取单个课程
// ============================================================

/**
 * 获取课程详情
 *
 * 会动态计算课程状态（过期判定），并返回关联的排课列表。
 */
async function getCourse(data, openid) {
  const { id } = data

  if (!id) {
    return { success: false, error: '缺少课程ID' }
  }

  // 查询课程（权限过滤）
  const courseRes = await db.collection('courses')
    .where(injectOpenID({ _id: id }, openid))
    .get()

  if (courseRes.data.length === 0) {
    return { success: false, error: '课程不存在或无权限访问' }
  }

  let course = courseRes.data[0]

  // 动态更新过期状态
  course = refreshCourseStatus(course)

  // 查询关联的活跃排课
  const schedulesRes = await db.collection('schedules')
    .where({
      courseId: id,
      _openid: openid,
      status: 'active'
    })
    .get()

  return {
    success: true,
    data: {
      course,
      schedules: schedulesRes.data
    }
  }
}

// ============================================================
// 查询课程列表
// ============================================================

/**
 * 查询课程列表
 *
 * 支持按状态筛选，默认按 updatedAt 倒序排列。
 * 每个课程会动态刷新过期状态。
 */
async function listCourses(data, openid) {
  const {
    status,
    pageSize = BUSINESS.DEFAULT_PAGE_SIZE,
    pageNum = 1
  } = data || {}

  // 构建查询条件
  let condition = { _openid: openid }
  if (status) {
    condition.status = status
  }

  // 查询总数
  const countRes = await db.collection('courses')
    .where(condition)
    .count()

  // 分页查询
  const skip = (pageNum - 1) * pageSize
  const courseRes = await db.collection('courses')
    .where(condition)
    .orderBy('updatedAt', 'desc')
    .skip(skip)
    .limit(Math.min(pageSize, BUSINESS.MAX_PAGE_SIZE))
    .get()

  // 动态刷新每条课程的过期状态
  const courses = courseRes.data.map(course => refreshCourseStatus(course))

  return {
    success: true,
    data: {
      total: countRes.total,
      pageNum,
      pageSize,
      courses
    }
  }
}

// ============================================================
// 更新课程
// ============================================================

/**
 * 更新课程信息
 *
 * 特殊处理：
 *   1. 如果修改了 totalHours → 重新计算 remainingHours = totalHours - consumedHours
 *   2. 重新计算 remainingHours 后自动判定是否应切换为 completed/expired
 *   3. 写入 audit_logs（含变更前后 diff）
 */
async function updateCourse(data, openid) {
  const { id, ...updateFields } = data

  if (!id) {
    return { success: false, error: '缺少课程ID' }
  }

  // 先查询原课程（用于变更对比和权限校验）
  const originalRes = await db.collection('courses')
    .where(injectOpenID({ _id: id }, openid))
    .get()

  if (originalRes.data.length === 0) {
    return { success: false, error: '课程不存在或无权限修改' }
  }

  const original = originalRes.data[0]

  // 构造更新数据
  const now = new Date()
  const updateData = { updatedAt: now }
  const changes = {}  // 记录变更内容，用于审计日志

  // 逐字段对比并记录变更
  const editableFields = [
    'name', 'courseType', 'subject', 'teacher', 'student',
    'deductionUnit', 'startDate', 'expiryDate', 'lowHoursThreshold', 'notes'
  ]

  for (const field of editableFields) {
    if (updateFields[field] !== undefined && updateFields[field] !== original[field]) {
      changes[field] = { from: original[field], to: updateFields[field] }
      updateData[field] = updateFields[field]
    }
  }

  // 特殊处理：如果修改了 totalHours
  if (updateFields.totalHours !== undefined && updateFields.totalHours !== original.totalHours) {
    const newTotal = updateFields.totalHours
    if (newTotal <= 0) {
      return { success: false, error: '总课时必须大于0' }
    }
    // 重新计算剩余课时
    const newRemaining = Math.max(0, newTotal - original.consumedHours)

    changes.totalHours = { from: original.totalHours, to: newTotal }
    changes.remainingHours = { from: original.remainingHours, to: newRemaining }

    updateData.totalHours = newTotal
    updateData.remainingHours = newRemaining

    // 自动判定状态
    if (newRemaining <= 0) {
      updateData.status = COURSE_STATUS.COMPLETED
      changes.status = { from: original.status, to: COURSE_STATUS.COMPLETED }
    }
  }

  // 执行更新
  await db.collection('courses')
    .where(injectOpenID({ _id: id }, openid))
    .update({ data: updateData })

  // 写入审计日志
  if (Object.keys(changes).length > 0) {
    await writeAuditLog({
      openid,
      actionType: ACTION_TYPES.COURSE_UPDATE,
      targetType: TARGET_TYPE.COURSE,
      targetId: id,
      courseId: id,
      courseName: original.name,
      detail: { action: 'update', changes },
      trigger: TRIGGER_TYPE.MANUAL
    })
  }

  logInfo('courseManager', '课程更新成功', { courseId: id, changes: Object.keys(changes) })

  return {
    success: true,
    data: {
      _id: id,
      changes: Object.keys(changes)
    }
  }
}

// ============================================================
// 删除课程
// ============================================================

/**
 * 删除课程（逻辑删除）
 *
 * 约束：
 *   1. 有消课记录（consumedHours > 0）的课程不可删除，
 *      只能修改 status 为 'completed' 或 'expired'
 *   2. 无消课记录的课程可物理删除，但依然写入审计日志
 */
async function deleteCourse(data, openid) {
  const { id } = data

  if (!id) {
    return { success: false, error: '缺少课程ID' }
  }

  // 查询课程
  const courseRes = await db.collection('courses')
    .where(injectOpenID({ _id: id }, openid))
    .get()

  if (courseRes.data.length === 0) {
    return { success: false, error: '课程不存在或无权限操作' }
  }

  const course = courseRes.data[0]

  // 检查是否有消课记录
  if (course.consumedHours > 0) {
    return {
      success: false,
      error: '该课程已有消课记录，不可删除。请将课程状态改为"已完成"或"已过期"。',
      suggestion: 'change_status',
      currentStatus: course.status
    }
  }

  // 执行删除
  await db.collection('courses')
    .where(injectOpenID({ _id: id }, openid))
    .remove()

  // 同时删除该课程关联的排课
  await db.collection('schedules')
    .where({ _openid: openid, courseId: id })
    .remove()

  // 写入审计日志
  await writeAuditLog({
    openid,
    actionType: ACTION_TYPES.COURSE_DELETE,
    targetType: TARGET_TYPE.COURSE,
    targetId: id,
    courseId: id,
    courseName: course.name,
    detail: {
      action: 'delete',
      courseName: course.name,
      totalHours: course.totalHours
    },
    trigger: TRIGGER_TYPE.MANUAL
  })

  logInfo('courseManager', '课程已删除', { courseId: id, name: course.name })

  return { success: true, data: { deletedId: id, name: course.name } }
}

// ============================================================
// 课程状态变更（暂停/恢复）
// ============================================================

/**
 * 变更课程状态（暂停/恢复）
 *
 * 暂停的课程不参与自动消课。
 */
async function changeCourseStatus(data, openid, newStatus) {
  const { id, reason } = data

  if (!id) {
    return { success: false, error: '缺少课程ID' }
  }

  // 查询原课程
  const courseRes = await db.collection('courses')
    .where(injectOpenID({ _id: id }, openid))
    .get()

  if (courseRes.data.length === 0) {
    return { success: false, error: '课程不存在或无权限操作' }
  }

  const course = courseRes.data[0]
  const oldStatus = course.status

  // 状态校验
  if (oldStatus === newStatus) {
    return { success: false, error: `课程已处于 ${newStatus} 状态` }
  }
  if (oldStatus === COURSE_STATUS.COMPLETED) {
    return { success: false, error: '已完成课程不可变更状态' }
  }

  // 执行更新
  await db.collection('courses')
    .where(injectOpenID({ _id: id }, openid))
    .update({
      data: {
        status: newStatus,
        updatedAt: new Date()
      }
    })

  // 写入审计日志
  await writeAuditLog({
    openid,
    actionType: ACTION_TYPES.COURSE_STATUS_CHANGE,
    targetType: TARGET_TYPE.COURSE,
    targetId: id,
    courseId: id,
    courseName: course.name,
    detail: {
      action: 'status_change',
      field: 'status',
      from: oldStatus,
      to: newStatus,
      reason: reason || '无备注'
    },
    trigger: TRIGGER_TYPE.MANUAL
  })

  logInfo('courseManager', `课程状态变更: ${oldStatus} → ${newStatus}`, { courseId: id })

  return {
    success: true,
    data: {
      courseId: id,
      oldStatus,
      newStatus
    }
  }
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 动态刷新课程状态
 *
 * 根据当前日期和课程数据判断是否应标记为过期或已完成。
 * 注意：此函数仅在读取时做"软判定"，
 * 实际状态更新由消课操作触发（lessonManager / autoDeduct 中写入）。
 *
 * @param {object} course - 课程文档
 * @returns {object} 刷新后的课程对象
 */
function refreshCourseStatus(course) {
  const today = getBeijingDate()

  // 已完成判定
  if (course.remainingHours <= 0 && course.status !== COURSE_STATUS.COMPLETED) {
    course.status = COURSE_STATUS.COMPLETED
    course._statusNote = '所有课时已消耗完毕'
  }

  // 过期判定（只在 active 或 paused 状态下检查）
  if (
    (course.status === COURSE_STATUS.ACTIVE || course.status === COURSE_STATUS.PAUSED) &&
    course.remainingHours > 0 &&
    new Date(course.expiryDate) < today
  ) {
    course.status = COURSE_STATUS.EXPIRED
    course._statusNote = '课程已过期，仍有剩余课时未使用'
  }

  return course
}

/**
 * 获取北京时间当天 00:00:00（UTC 表示）
 *
 * 统一使用 Date.UTC 构造，与 autoDeduct 的 getBeijingToday() 保持一致。
 *
 * @returns {Date} UTC Date 对象，代表北京时间当天午夜
 */
function getBeijingDate() {
  const now = new Date()
  // 当前 UTC 时间 +8h = 北京时间
  const beijingNow = new Date(now.getTime() + 8 * 3600 * 1000)
  // 构造北京时间当天 00:00 对应的 UTC 时刻
  return new Date(Date.UTC(
    beijingNow.getUTCFullYear(),
    beijingNow.getUTCMonth(),
    beijingNow.getUTCDate(),
    0, 0, 0
  ))
}

/**
 * 写入审计日志
 *
 * @param {object} params - 日志参数
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
    // 审计日志写入失败不阻断主流程，但记录错误
    console.error('[courseManager] 审计日志写入失败:', err.message)
  }
}

module.exports = { main: exports.main }
