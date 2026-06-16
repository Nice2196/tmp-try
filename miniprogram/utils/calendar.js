/**
 * 月日历矩阵生成工具
 *
 * 为 calendar-view 组件提供月视图数据矩阵。
 * 生成 6行 x 7列 = 42格 的固定布局，
 * 包含上月尾、当月全部、下月头的日期信息。
 *
 * @module utils/calendar
 * @responsible DeepSeek V4 Pro
 */

/**
 * 生成指定年月的日历矩阵
 *
 * @param {number} year - 年份，如 2026
 * @param {number} month - 月份，1-12
 * @returns {{year: number, month: number, cells: Array<CalendarCell>}}
 *
 * CalendarCell 结构:
 * {
 *   date: string,        // "YYYY-MM-DD"
 *   day: number,         // 1-31
 *   dayOfWeek: number,   // 0=周日..6=周六
 *   isCurrentMonth: boolean,
 *   isToday: boolean,
 *   lessons: []          // 该日期的课程/消课数据（由页面填充）
 * }
 */
function generateMonthMatrix(year, month) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  // 获取当月1号是星期几（北京时间）
  const firstDayBeijing = new Date(firstDay.getTime() + 8 * 3600 * 1000)
  const firstDayOfWeek = firstDayBeijing.getUTCDay() // 0=周日

  // 当月总天数
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  // 上月总天数（用于填充上月尾）
  const daysInPrevMonth = new Date(Date.UTC(year, month - 1, 0)).getUTCDate()

  // 今天的北京时间日期字符串
  const todayBeijing = getBeijingTodayStr()

  const cells = []

  // 上月尾填充（从 firstDayOfWeek 个空白格开始倒推）
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i
    const date = buildDateStr(year, month - 1, day)
    cells.push({
      date: date,
      day: day,
      dayOfWeek: (firstDayOfWeek - i - 1 + 7) % 7,
      isCurrentMonth: false,
      isToday: false,
      lessons: []
    })
  }

  // 当月日期
  for (let day = 1; day <= daysInMonth; day++) {
    const date = buildDateStr(year, month, day)
    const d = new Date(Date.UTC(year, month - 1, day))
    const beijingD = new Date(d.getTime() + 8 * 3600 * 1000)
    const dayOfWeek = beijingD.getUTCDay()

    cells.push({
      date: date,
      day: day,
      dayOfWeek: dayOfWeek,
      isCurrentMonth: true,
      isToday: date === todayBeijing,
      lessons: []
    })
  }

  // 下月头填充（补满到 42 格）
  const remaining = 42 - cells.length
  for (let day = 1; day <= remaining; day++) {
    const date = buildDateStr(year, month + 1, day)
    cells.push({
      date: date,
      day: day,
      dayOfWeek: (firstDayOfWeek + daysInMonth + day - 1) % 7,
      isCurrentMonth: false,
      isToday: false,
      lessons: []
    })
  }

  return {
    year,
    month,
    cells
  }
}

/**
 * 获取当月日历的标题行（周日~周六）
 */
function getWeekdayHeaders() {
  return ['日', '一', '二', '三', '四', '五', '六']
}

/**
 * 获取北京时间的今天日期字符串
 */
function getBeijingTodayStr() {
  const now = new Date()
  const beijing = new Date(now.getTime() + 8 * 3600 * 1000)
  const y = beijing.getUTCFullYear()
  const m = String(beijing.getUTCMonth() + 1).padStart(2, '0')
  const d = String(beijing.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 构建日期字符串（处理跨年边界）
 */
function buildDateStr(year, month, day) {
  // 处理跨月/跨年
  let actualYear = year
  let actualMonth = month
  if (actualMonth < 1) {
    actualMonth = 12
    actualYear--
  } else if (actualMonth > 12) {
    actualMonth = 1
    actualYear++
  }
  return `${actualYear}-${String(actualMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

module.exports = {
  generateMonthMatrix,
  getWeekdayHeaders,
  getBeijingTodayStr
}
