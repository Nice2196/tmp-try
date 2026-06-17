/**
 * calendarQuery - 日历视图数据查询云函数
 *
 * 职责：
 *   1. 根据指定年月，查询该月所有排课日 + 消课记录
 *   2. 将排课（预期上课日）与实际消课记录合并
 *   3. 为每个日期标记状态：已完成(completed) / 待上课(pending) / 已过期(expired)
 *   4. 返回 { days: [{ date, lessons: [...] }] } 供前端日历组件使用
 *
 * 状态判定逻辑：
 *   - completed: 排课日且已有消课记录（lesson_record 存在 + status=completed）
 *   - pending: 排课日但尚未消课（今天或未来日期）
 *   - expired: 排课日已过但无消课记录（今天之前且无记录）
 *
 * 权限隔离：
 *   仅返回当前用户数据。
 *
 * 输入格式:
 *   { year: 2026, month: 6 }
 *
 * @module calendarQuery
 * @responsible DeepSeek V4 Pro
 * @phase Phase 4
 */

const cloud = require('wx-server-sdk')
const { getDB } = require('./common/db')
const { requireOpenID } = require('./common/auth')
const { logError } = require('./common/logger')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = getDB()

/**
 * 云函数主入口
 *
 * 处理流程：
 *   1. 查该用户所有 active 排课
 *   2. 按 dayOfWeek 计算本月哪些日期是排课日
 *   3. 查本月实际消课记录
 *   4. 合并：有消课 → completed，未来排课 → pending，过去无记录 → expired
 */
exports.main = async (event, context) => {
  const openid = requireOpenID(cloud)
  const { year, month } = event

  // 参数校验
  if (!year || !month) {
    return { success: false, error: '缺少必填参数: year, month' }
  }

  try {
    // 并行查询
    const [schedules, lessonRecords] = await Promise.all([
      getActiveSchedules(openid),
      getMonthLessons(openid, year, month)
    ])

    // 生成：排课日期表（schedule 按 dayOfWeek → 本月的日期列表）
    const scheduleDates = buildScheduleDateMap(schedules, year, month)

    // 生成：消课记录索引 { "YYYY-MM-DD" -> [lesson, ...] }
    const lessonIndex = buildLessonIndex(lessonRecords)

    // 合并生成日历数据
    const todayStr = getBeijingTodayStr()
    const daysInMonth = getDaysInMonth(year, month)

    const days = []
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dateLessons = []

      // 该日期是否有排课
      const scheduledForDay = scheduleDates[dateStr] || []

      // 该日期实际的消课记录
      const actualLessons = lessonIndex[dateStr] || []

      // 处理排课的消课（自动+手动）
      for (const sch of scheduledForDay) {
        // 查找是否有对应的已完成消课记录
        const completedLesson = actualLessons.find(
          l => l.courseId === sch.courseId && l.status === 'completed'
        )

        if (completedLesson) {
          // 有消课记录 → completed
          dateLessons.push({
            courseId: sch.courseId,
            courseName: sch.courseName,
            scheduleId: sch.scheduleId,
            time: sch.time,
            lessonRecordId: completedLesson._id,
            status: 'completed',
            deductionType: completedLesson.deductionType,
            deductionHours: completedLesson.deductionHours
          })
        } else if (dateStr > todayStr) {
          // 未来日期 → pending
          dateLessons.push({
            courseId: sch.courseId,
            courseName: sch.courseName,
            scheduleId: sch.scheduleId,
            time: sch.time,
            lessonRecordId: null,
            status: 'pending',
            deductionType: null,
            deductionHours: null
          })
        } else {
          // 过去日期但没有消课 → expired/missed
          dateLessons.push({
            courseId: sch.courseId,
            courseName: sch.courseName,
            scheduleId: sch.scheduleId,
            time: sch.time,
            lessonRecordId: null,
            status: 'expired',
            deductionType: null,
            deductionHours: null
          })
        }
      }

      // 补充：有消课记录但无排课的手工消课
      for (const lesson of actualLessons) {
        const alreadyInList = dateLessons.some(
          l => l.courseId === lesson.courseId && l.lessonRecordId === lesson._id
        )
        if (!alreadyInList) {
          dateLessons.push({
            courseId: lesson.courseId,
            courseName: lesson.courseName,
            scheduleId: lesson.scheduleId || null,
            time: lesson.scheduledTime || '',
            lessonRecordId: lesson._id,
            status: 'completed',
            deductionType: lesson.deductionType,
            deductionHours: lesson.deductionHours
          })
        }
      }

      days.push({
        date: dateStr,
        day: day,
        lessons: dateLessons,
        lessonCount: dateLessons.length
      })
    }

    return {
      success: true,
      data: { year, month, days }
    }
  } catch (err) {
    logError('calendarQuery', '日历查询失败', err)
    return { success: false, error: err.message || '查询失败' }
  }
}

// ============================================================
// 数据获取
// ============================================================

/**
 * 获取用户所有活跃排课
 */
async function getActiveSchedules(openid) {
  const res = await db.collection('schedules')
    .where({
      _openid: openid,
      status: 'active'
    })
    .field({
      courseId: true,
      courseName: true,
      dayOfWeek: true,
      time: true,
      effectiveFrom: true,
      effectiveTo: true
    })
    .get()

  return res.data
}

/**
 * 获取指定月份的实际消课记录
 */
async function getMonthLessons(openid, year, month) {
  const monthStart = new Date(Date.UTC(year, month - 1, 1))
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59))

  const res = await db.collection('lesson_records')
    .where({
      _openid: openid,
      lessonDate: db.command.and([
        db.command.gte(monthStart),
        db.command.lte(monthEnd)
      ])
    })
    .field({
      courseId: true,
      courseName: true,
      scheduleId: true,
      lessonDate: true,
      scheduledTime: true,
      deductionHours: true,
      deductionType: true,
      status: true
    })
    .get()

  return res.data
}

// ============================================================
// 数据转换
// ============================================================

/**
 * 根据活跃排课列表和指定月份，构建排课日期映射表
 *
 * @param {Array} schedules - 活跃排课列表
 * @param {number} year
 * @param {number} month
 * @returns {object} { "YYYY-MM-DD": [{courseId, courseName, scheduleId, time}, ...] }
 */
function buildScheduleDateMap(schedules, year, month) {
  const map = {}
  const daysInMonth = getDaysInMonth(year, month)

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, month - 1, day))
    // 获取北京时间的星期
    const beijingDate = new Date(date.getTime() + 8 * 3600 * 1000)
    const dayOfWeek = beijingDate.getUTCDay()
    const dateTimestamp = date.getTime()

    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    // 找到匹配的排课（同时校验生效日期范围）
    const matchedSchedules = schedules.filter(sch => {
      if (sch.dayOfWeek !== dayOfWeek) return false

      // 校验 effectiveFrom：排课生效日期不能晚于当前日历日
      if (sch.effectiveFrom) {
        const fromTs = (sch.effectiveFrom instanceof Date)
          ? sch.effectiveFrom.getTime()
          : new Date(sch.effectiveFrom).getTime()
        if (dateTimestamp < fromTs) return false
      }

      // 校验 effectiveTo：排课失效日期不能早于当前日历日
      if (sch.effectiveTo) {
        const toTs = (sch.effectiveTo instanceof Date)
          ? sch.effectiveTo.getTime()
          : new Date(sch.effectiveTo).getTime()
        if (dateTimestamp > toTs) return false
      }

      return true
    })

    if (matchedSchedules.length > 0) {
      map[dateStr] = matchedSchedules.map(sch => ({
        courseId: sch.courseId,
        courseName: sch.courseName,
        scheduleId: sch._id,
        time: sch.time
      }))
    }
  }

  return map
}

/**
 * 构建消课记录索引 { "YYYY-MM-DD": [lesson, ...] }
 */
function buildLessonIndex(lessonRecords) {
  const index = {}
  for (const lesson of lessonRecords) {
    const dateStr = formatBeijingDate(lesson.lessonDate)
    if (!index[dateStr]) {
      index[dateStr] = []
    }
    index[dateStr].push(lesson)
  }
  return index
}

// ============================================================
// 日期工具
// ============================================================

function getDaysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function getBeijingTodayStr() {
  const now = new Date()
  const beijing = new Date(now.getTime() + 8 * 3600 * 1000)
  const y = beijing.getUTCFullYear()
  const m = String(beijing.getUTCMonth() + 1).padStart(2, '0')
  const d = String(beijing.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatBeijingDate(date) {
  const beijing = new Date(date.getTime() + 8 * 3600 * 1000)
  const y = beijing.getUTCFullYear()
  const m = String(beijing.getUTCMonth() + 1).padStart(2, '0')
  const d = String(beijing.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

module.exports = { main: exports.main }
