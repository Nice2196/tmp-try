/**
 * statsQuery - 统计查询云函数
 *
 * 职责：
 *   1. 分类统计：按课程类型/科目统计总课时、已消耗、剩余
 *   2. 30 天消课趋势：按天聚合消课数据
 *   3. 即将过期预警：30 天内到期的课程
 *   4. 低课时预警：remainingHours <= 阈值的课程
 *   5. 总览摘要卡片数据
 *
 * 权限隔离：
 *   仅返回当前用户的统计数据。
 *
 * 输入格式:
 *   { rangeType?: '30days' | '90days' | 'all' }
 *
 * @module statsQuery
 * @responsible DeepSeek V4 Pro
 * @phase Phase 4
 */

const cloud = require('wx-server-sdk')
const { getDB } = require('./common/db')
const { requireOpenID } = require('./common/auth')
const { BUSINESS } = require('./common/constants')
const { logError } = require('./common/logger')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = getDB()

/**
 * 云函数主入口
 */
exports.main = async (event, context) => {
  const openid = requireOpenID(cloud)
  const { rangeType = '30days' } = event || {}

  try {
    // 并行执行所有统计查询
    const [
      courseBreakdown,
      categoryBreakdown,
      trendData,
      expiryWarnings,
      lowHoursWarnings,
      summary
    ] = await Promise.all([
      getCourseBreakdown(openid),
      getCategoryBreakdown(openid),
      getTrendData(openid, rangeType),
      getExpiryWarnings(openid),
      getLowHoursWarnings(openid),
      getSummary(openid)
    ])

    return {
      success: true,
      data: {
        courseBreakdown,
        categoryBreakdown,
        trendData,
        expiryWarnings,
        lowHoursWarnings,
        summary
      }
    }
  } catch (err) {
    logError('statsQuery', '统计查询失败', err)
    return { success: false, error: err.message || '统计查询异常' }
  }
}

// ============================================================
// 课程粒度统计
// ============================================================

/**
 * 获取每门课程的课时统计（含进度百分比）
 */
async function getCourseBreakdown(openid) {
  const courseRes = await db.collection('courses')
    .where({ _openid: openid })
    .field({
      name: true,
      courseType: true,
      subject: true,
      totalHours: true,
      consumedHours: true,
      remainingHours: true,
      status: true,
      expiryDate: true
    })
    .get()

  return courseRes.data.map(course => ({
    courseId: course._id,
    courseName: course.name,
    courseType: course.courseType,
    subject: course.subject,
    totalHours: course.totalHours,
    consumedHours: course.consumedHours,
    remainingHours: course.remainingHours,
    progressPercent: course.totalHours > 0
      ? Math.round((course.consumedHours / course.totalHours) * 100)
      : 0,
    status: course.status,
    expiryDate: course.expiryDate
  }))
}

// ============================================================
// 分类聚合统计
// ============================================================

/**
 * 按课程类型聚合统计
 */
async function getCategoryBreakdown(openid) {
  const courseRes = await db.collection('courses')
    .where({ _openid: openid })
    .get()

  // 内存聚合
  const categories = {}
  for (const course of courseRes.data) {
    const key = course.courseType || 'unknown'
    if (!categories[key]) {
      categories[key] = {
        category: key,
        courseCount: 0,
        totalHours: 0,
        consumedHours: 0,
        remainingHours: 0
      }
    }
    categories[key].courseCount++
    categories[key].totalHours += course.totalHours
    categories[key].consumedHours += course.consumedHours
    categories[key].remainingHours += course.remainingHours
  }

  return Object.values(categories)
}

// ============================================================
// 消课趋势（近N天）
// ============================================================

/**
 * 获取近 N 天每天的消课统计
 */
async function getTrendData(openid, rangeType) {
  const days = rangeType === '90days' ? 90 : rangeType === 'all' ? 365 : 30

  // 计算起始日期
  const startDate = getBeijingDateDaysAgo(days)

  // 查询消课记录（聚合）
  const lessonRes = await db.collection('lesson_records')
    .where({
      _openid: openid,
      lessonDate: db.command.gte(startDate),
      status: 'completed'
    })
    .field({
      lessonDate: true,
      deductionHours: true,
      deductionType: true
    })
    .get()

  // 按日期聚合
  const dateMap = {}
  for (const lesson of lessonRes.data) {
    const dateStr = formatBeijingDate(lesson.lessonDate)
    if (!dateMap[dateStr]) {
      dateMap[dateStr] = { date: dateStr, deductionCount: 0, deductionHours: 0 }
    }
    dateMap[dateStr].deductionCount++
    dateMap[dateStr].deductionHours += lesson.deductionHours
  }

  // 返回按日期排序的数组
  return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))
}

// ============================================================
// 过期预警
// ============================================================

/**
 * 获取即将过期（30天内）且有剩余课时的课程
 */
async function getExpiryWarnings(openid) {
  const now = getBeijingToday()
  const warningDate = new Date(now.getTime() + BUSINESS.EXPIRY_WARNING_DAYS * 24 * 3600 * 1000)

  const courseRes = await db.collection('courses')
    .where({
      _openid: openid,
      status: db.command.in(['active', 'paused']),
      remainingHours: db.command.gt(0),
      expiryDate: db.command.lte(warningDate)
    })
    .field({
      name: true,
      remainingHours: true,
      expiryDate: true,
      status: true
    })
    .orderBy('expiryDate', 'asc')
    .get()

  return courseRes.data.map(course => ({
    courseId: course._id,
    courseName: course.name,
    remainingHours: course.remainingHours,
    expiryDate: course.expiryDate,
    daysUntilExpiry: daysBetween(now, course.expiryDate),
    status: course.status
  }))
}

// ============================================================
// 低课时预警
// ============================================================

/**
 * 获取剩余课时低于阈值的活跃课程
 */
async function getLowHoursWarnings(openid) {
  // 先查所有活跃课程，再在内存中过滤（因为阈值是课程级属性）
  const courseRes = await db.collection('courses')
    .where({
      _openid: openid,
      status: db.command.in(['active', 'paused']),
      remainingHours: db.command.gt(0)
    })
    .field({
      name: true,
      remainingHours: true,
      lowHoursThreshold: true,
      status: true
    })
    .get()

  // 过滤：remainingHours <= lowHoursThreshold
  return courseRes.data
    .filter(course => course.remainingHours <= (course.lowHoursThreshold || BUSINESS.DEFAULT_LOW_HOURS_THRESHOLD))
    .map(course => ({
      courseId: course._id,
      courseName: course.name,
      remainingHours: course.remainingHours,
      threshold: course.lowHoursThreshold || BUSINESS.DEFAULT_LOW_HOURS_THRESHOLD,
      status: course.status
    }))
}

// ============================================================
// 总览摘要
// ============================================================

/**
 * 获取首页统计卡片数据
 */
async function getSummary(openid) {
  const courseRes = await db.collection('courses')
    .where({ _openid: openid })
    .get()

  const courses = courseRes.data

  // 本月消课统计
  const monthStart = getBeijingMonthStart()
  const monthEnd = getBeijingMonthEnd()

  const monthLessonRes = await db.collection('lesson_records')
    .where({
      _openid: openid,
      status: 'completed',
      lessonDate: db.command.and([
        db.command.gte(monthStart),
        db.command.lte(monthEnd)
      ])
    })
    .field({ deductionHours: true })
    .get()

  const monthlyDeductionHours = monthLessonRes.data.reduce(
    (sum, l) => sum + l.deductionHours, 0
  )

  return {
    totalCourses: courses.length,
    activeCourses: courses.filter(c => c.status === 'active').length,
    totalRemainingHours: courses.reduce((sum, c) => sum + c.remainingHours, 0),
    totalConsumedHours: courses.reduce((sum, c) => sum + c.consumedHours, 0),
    monthlyDeductionHours: Math.round(monthlyDeductionHours * 10) / 10,
    completedCourses: courses.filter(c => c.status === 'completed').length,
    expiredCourses: courses.filter(c => c.status === 'expired').length
  }
}

// ============================================================
// 辅助函数
// ============================================================

function getBeijingToday() {
  const now = new Date()
  const beijing = new Date(now.getTime() + 8 * 3600 * 1000)
  return new Date(Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate()))
}

function getBeijingDateDaysAgo(days) {
  const today = getBeijingToday()
  return new Date(today.getTime() - days * 24 * 3600 * 1000)
}

function getBeijingMonthStart() {
  const today = new Date()
  const beijing = new Date(today.getTime() + 8 * 3600 * 1000)
  return new Date(Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), 1))
}

function getBeijingMonthEnd() {
  const today = new Date()
  const beijing = new Date(today.getTime() + 8 * 3600 * 1000)
  return new Date(Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth() + 1, 0, 23, 59, 59))
}

function formatBeijingDate(date) {
  const beijing = new Date(date.getTime() + 8 * 3600 * 1000)
  const y = beijing.getUTCFullYear()
  const m = String(beijing.getUTCMonth() + 1).padStart(2, '0')
  const d = String(beijing.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function daysBetween(date1, date2) {
  const d1 = date1 instanceof Date ? date1.getTime() : new Date(date1).getTime()
  const d2 = date2 instanceof Date ? date2.getTime() : new Date(date2).getTime()
  return Math.ceil((d2 - d1) / (24 * 3600 * 1000))
}

module.exports = { main: exports.main }
