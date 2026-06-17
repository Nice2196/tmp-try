/**
 * lessonManager - 消课管理云函数
 *
 * 职责：
 *   1. 手动消课（add）：扣减课时 + 生成消课记录 + 审计日志
 *   2. 取消消课（cancel）：回退已扣课时 + 标记记录为 cancelled
 *   3. 查询消课记录（list）：按课程分页查询
 *   4. 所有消课操作在事务中完成（原子性保证）
 *
 * ⚠️ 事务策略：
 *   手工消课涉及 courses(更新) + lesson_records(插入) + audit_logs(插入)，
 *   三个操作必须在同一事务中，任一步骤失败则全部回滚。
 *
 * 权限隔离：
 *   所有操作通过 OPENID 过滤。
 *
 * 输入格式:
 *   { action: 'add' | 'cancel' | 'list', data: {...} }
 *
 * @module lessonManager
 * @responsible DeepSeek V4 Pro
 * @phase Phase 4
 */

const cloud = require('wx-server-sdk')
const { getDB } = require('./common/db')
const { requireOpenID, injectOpenID, injectOpenIDToData } = require('./common/auth')
const {
  COURSE_STATUS,
  LESSON_STATUS,
  DEDUCTION_TYPE,
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

  if (!action) {
    return { success: false, error: '缺少必填参数: action' }
  }

  logInfo('lessonManager', `执行操作: ${action}`, { openid })

  try {
    switch (action) {
      case 'add':
        return await addLesson(data, openid)
      case 'cancel':
        return await cancelLesson(data, openid)
      case 'list':
        return await listLessons(data, openid)
      default:
        return { success: false, error: `未知操作: ${action}` }
    }
  } catch (err) {
    logError('lessonManager', `操作 ${action} 失败`, err)
    return { success: false, error: err.message || '服务内部错误' }
  }
}

// ============================================================
// 手工消课（核心操作）
// ============================================================

/**
 * 执行一次手工消课
 *
 * 业务流程：
 *   1. 校验课程存在且状态为 active
 *   2. 校验剩余课时 >= 本次扣除课时
 *   3. 计算消课后的 consumedHours 和 remainingHours
 *   4. 在事务中完成: 更新课程 + 插入消课记录 + 插入审计日志
 *   5. 如果 remainingHours <= 0，自动将课程标记为 completed
 *
 * 幂等保障：
 *   同一课程、同一天不允许重复消课（通过 lesson_records 索引 + 前置检查实现）
 *
 * @param {object} data - { courseId, lessonDate, scheduledTime?, deductionHours?, notes? }
 * @param {string} openid - 当前用户 OPENID
 */
async function addLesson(data, openid) {
  const {
    courseId,
    lessonDate,
    scheduledTime = '',
    deductionHours,
    notes = ''
  } = data

  // --- 参数校验 ---
  if (!courseId) {
    return { success: false, error: '缺少课程ID' }
  }
  if (!lessonDate) {
    return { success: false, error: '缺少上课日期' }
  }

  // --- 查询课程 ---
  const courseRes = await db.collection('courses')
    .where(injectOpenID({ _id: courseId }, openid))
    .get()

  if (courseRes.data.length === 0) {
    return { success: false, error: '课程不存在或无权限操作' }
  }

  // ⚠️ 注意：此处读取的是事务外的快照，事务内会重新读取最新数据
  const course = courseRes.data[0]

  // --- 状态校验 ---
  if (course.status !== COURSE_STATUS.ACTIVE && course.status !== COURSE_STATUS.PAUSED) {
    return {
      success: false,
      error: `课程状态为"${course.status}"，不可消课。只有进行中或暂停的课程可手动消课。`
    }
  }

  // --- 过期校验 ---
  const lessonDateObj = new Date(lessonDate)
  const lessonBeijingDate = getBeijingDateStart(lessonDateObj)
  const expiryBeijingDate = getBeijingDateStart(new Date(course.expiryDate))

  if (lessonBeijingDate > expiryBeijingDate) {
    return {
      success: false,
      error: `上课日期(${lessonDate})已超过课程过期日期，不可消课。`
    }
  }

  // --- 课时校验 ---
  const actualDeductionHours = deductionHours || course.deductionUnit || BUSINESS.DEFAULT_DEDUCTION_UNIT

  if (actualDeductionHours <= 0) {
    return { success: false, error: '扣除课时数必须大于0' }
  }

  if (actualDeductionHours > course.remainingHours) {
    return {
      success: false,
      error: `剩余课时(${course.remainingHours})不足，无法扣除 ${actualDeductionHours} 课时`
    }
  }

  // --- 重复消课检查（防止同一天多次手工消课同一课程） ---
  const dupCheck = await db.collection('lesson_records')
    .where({
      _openid: openid,
      courseId: courseId,
      lessonDate: lessonBeijingDate,
      status: LESSON_STATUS.COMPLETED
    })
    .count()

  if (dupCheck.total > 0) {
    return {
      success: false,
      error: `该课程在 ${lessonDate} 已有消课记录，请勿重复操作。如需调整请先取消原记录。`
    }
  }

  // --- 计算新值 ---
  const newConsumed = course.consumedHours + actualDeductionHours
  const newRemaining = course.totalHours - newConsumed

  // 判断是否完成
  const shouldComplete = newRemaining <= 0

  // ============================================================
  // 事务执行
  // ============================================================
  let lessonRecordId = null

  try {
    const transaction = await db.startTransaction()

    // --- 第1步：在事务内重新读取课程最新数据（防止并发修改） ---
    const freshCourseRes = await transaction.collection('courses')
      .doc(courseId)
      .get()

    const freshCourse = freshCourseRes.data

    // 二次校验：如果课程状态在事务外读取后发生了变化
    if (freshCourse.status !== COURSE_STATUS.ACTIVE && freshCourse.status !== COURSE_STATUS.PAUSED) {
      await transaction.rollback()
      return {
        success: false,
        error: `课程状态已变更为"${freshCourse.status}"，无法消课`
      }
    }

    // 二次校验：剩余课时是否仍然充足
    if (actualDeductionHours > freshCourse.remainingHours) {
      await transaction.rollback()
      return {
        success: false,
        error: `剩余课时已不足(${freshCourse.remainingHours})，无法扣除 ${actualDeductionHours}`
      }
    }

    // 以事务内的最新数据重新计算
    const txNewConsumed = freshCourse.consumedHours + actualDeductionHours
    const txNewRemaining = freshCourse.totalHours - txNewConsumed
    const txShouldComplete = txNewRemaining <= 0

    // --- 第2步：更新课程课时 ---
    const courseUpdateData = {
      consumedHours: txNewConsumed,
      remainingHours: txNewRemaining,
      updatedAt: new Date()
    }
    if (txShouldComplete) {
      courseUpdateData.status = COURSE_STATUS.COMPLETED
    }

    await transaction.collection('courses')
      .doc(courseId)
      .update({ data: courseUpdateData })

    // --- 第3步：插入消课记录 ---
    const lessonData = {
      courseId: courseId,
      courseName: course.name,
      scheduleId: null, // 手工消课不关联排课
      lessonDate: lessonBeijingDate,
      scheduledTime: scheduledTime,
      deductionHours: actualDeductionHours,
      deductionType: DEDUCTION_TYPE.MANUAL,
      beforeConsumed: freshCourse.consumedHours,
      afterConsumed: txNewConsumed,
      beforeRemaining: freshCourse.remainingHours,
      afterRemaining: txNewRemaining,
      status: LESSON_STATUS.COMPLETED,
      notes: notes.trim(),
      createdAt: new Date()
    }

    const lessonResult = await transaction.collection('lesson_records').add({
      data: injectOpenIDToData(lessonData, openid)
    })
    lessonRecordId = lessonResult._id

    // --- 第4步：插入审计日志 ---
    await transaction.collection('audit_logs').add({
      data: injectOpenIDToData({
        actionType: ACTION_TYPES.LESSON_MANUAL_DEDUCT,
        targetType: TARGET_TYPE.LESSON_RECORD,
        targetId: lessonRecordId,
        courseId: courseId,
        courseName: course.name,
        detail: {
          deductionType: DEDUCTION_TYPE.MANUAL,
          deductionHours: actualDeductionHours,
          beforeConsumed: freshCourse.consumedHours,
          afterConsumed: txNewConsumed,
          beforeRemaining: freshCourse.remainingHours,
          afterRemaining: txNewRemaining,
          lessonDate: lessonDate,
          triggeredCompletion: txShouldComplete
        },
        trigger: TRIGGER_TYPE.MANUAL,
        createdAt: new Date()
      }, openid)
    })

    // --- 提交事务 ---
    await transaction.commit()

    logInfo('lessonManager', '手工消课成功', {
      courseId,
      lessonRecordId,
      deductionHours: actualDeductionHours,
      newRemaining: txNewRemaining,
      completed: txShouldComplete
    })

    return {
      success: true,
      data: {
        lessonRecordId,
        courseId,
        courseName: course.name,
        deductionHours: actualDeductionHours,
        beforeConsumed: freshCourse.consumedHours,
        afterConsumed: txNewConsumed,
        beforeRemaining: freshCourse.remainingHours,
        afterRemaining: txNewRemaining,
        courseCompleted: txShouldComplete
      }
    }
  } catch (err) {
    logError('lessonManager', '手工消课事务失败', err)
    return { success: false, error: `消课失败: ${err.message || '事务执行异常'}` }
  }
}

// ============================================================
// 取消消课
// ============================================================

/**
 * 取消一次消课记录（回退课时）
 *
 * 业务规则：
 *   1. 只有手工消课可取消（自动消课不可取消，需联系管理员）
 *   2. 取消后：consumedHours 回退，remainingHours 恢复
 *   3. 如果课程之前因消课被标记为 completed，取消后恢复为 active
 *   4. 事务保证回退的原子性
 *
 * @param {object} data - { lessonRecordId }
 * @param {string} openid
 */
async function cancelLesson(data, openid) {
  const { lessonRecordId } = data

  if (!lessonRecordId) {
    return { success: false, error: '缺少消课记录ID' }
  }

  // 查询消课记录
  const lessonRes = await db.collection('lesson_records')
    .where(injectOpenID({ _id: lessonRecordId }, openid))
    .get()

  if (lessonRes.data.length === 0) {
    return { success: false, error: '消课记录不存在或无权限操作' }
  }

  const lesson = lessonRes.data[0]

  // 只能取消手工消课
  if (lesson.deductionType === DEDUCTION_TYPE.AUTO) {
    return {
      success: false,
      error: '自动消课记录不可手动取消。如需回退请直接修改课程课时并记录备注。'
    }
  }

  // 已取消的记录不可重复取消
  if (lesson.status === LESSON_STATUS.CANCELLED) {
    return { success: false, error: '该消课记录已被取消' }
  }

  // --- 事务执行 ---
  try {
    const transaction = await db.startTransaction()

    // 1. 更新课程：回退课时
    const courseRes = await transaction.collection('courses')
      .where(injectOpenID({ _id: lesson.courseId }, openid))
      .get()

    if (courseRes.data.length === 0) {
      await transaction.rollback()
      return { success: false, error: '关联课程不存在' }
    }

    const course = courseRes.data[0]
    const newConsumed = course.consumedHours - lesson.deductionHours
    const newRemaining = course.totalHours - newConsumed

    // 确定取消后的状态：仅当课程因本次消课被标记为 completed 时才恢复
    const wasCompletedByThisDeduction =
      course.status === COURSE_STATUS.COMPLETED &&
      course.consumedHours - lesson.deductionHours < course.totalHours
    const targetStatus = wasCompletedByThisDeduction
      ? COURSE_STATUS.ACTIVE  // 恢复为活跃
      : course.status          // 保留原状态（可能是 paused）

    await transaction.collection('courses')
      .doc(lesson.courseId)
      .update({
        data: {
          consumedHours: Math.max(0, newConsumed),
          remainingHours: newRemaining,
          status: targetStatus,
          updatedAt: new Date()
        }
      })

    // 2. 更新消课记录状态
    await transaction.collection('lesson_records')
      .doc(lessonRecordId)
      .update({
        data: {
          status: LESSON_STATUS.CANCELLED,
          notes: (lesson.notes || '') + ' [已取消]'
        }
      })

    // 3. 写入审计日志
    await transaction.collection('audit_logs').add({
      data: injectOpenIDToData({
        actionType: ACTION_TYPES.LESSON_CANCEL,
        targetType: TARGET_TYPE.LESSON_RECORD,
        targetId: lessonRecordId,
        courseId: lesson.courseId,
        courseName: lesson.courseName,
        detail: {
          cancelledDeductionHours: lesson.deductionHours,
          lessonDate: lesson.lessonDate,
          deductionType: lesson.deductionType
        },
        trigger: TRIGGER_TYPE.MANUAL,
        createdAt: new Date()
      }, openid)
    })

    await transaction.commit()

    logInfo('lessonManager', '消课回退成功', { lessonRecordId, courseId: lesson.courseId })

    return {
      success: true,
      data: {
        lessonRecordId,
        courseId: lesson.courseId,
        restoredHours: lesson.deductionHours,
        message: '消课记录已取消，课时已回退'
      }
    }
  } catch (err) {
    logError('lessonManager', '取消消课事务失败', err)
    return { success: false, error: `取消失败: ${err.message}` }
  }
}

// ============================================================
// 查询消课记录
// ============================================================

/**
 * 按课程分页查询消课记录
 *
 * @param {object} data - { courseId, pageSize?, pageNum? }
 * @param {string} openid
 */
async function listLessons(data, openid) {
  const {
    courseId,
    pageSize = BUSINESS.DEFAULT_PAGE_SIZE,
    pageNum = 1
  } = data

  if (!courseId) {
    return { success: false, error: '缺少课程ID' }
  }

  const condition = {
    _openid: openid,
    courseId: courseId
  }

  // 总数
  const countRes = await db.collection('lesson_records')
    .where(condition)
    .count()

  // 分页数据（按日期倒序）
  const skip = (pageNum - 1) * pageSize
  const lessonRes = await db.collection('lesson_records')
    .where(condition)
    .orderBy('lessonDate', 'desc')
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(Math.min(pageSize, BUSINESS.MAX_PAGE_SIZE))
    .get()

  return {
    success: true,
    data: {
      total: countRes.total,
      pageNum,
      pageSize,
      lessons: lessonRes.data
    }
  }
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 获取北京时间的日期起点
 */
function getBeijingDateStart(date) {
  const beijing = new Date(date.getTime() + 8 * 3600 * 1000)
  return new Date(Date.UTC(
    beijing.getUTCFullYear(),
    beijing.getUTCMonth(),
    beijing.getUTCDate(),
    0, 0, 0
  ))
}

module.exports = { main: exports.main }
