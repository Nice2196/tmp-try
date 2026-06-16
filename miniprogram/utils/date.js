/**
 * 日期工具模块
 *
 * 提供东八区（北京时间）安全的日期操作。
 * 所有日期格式化、星期计算、日期比较均基于北京时间。
 *
 * @module utils/date
 * @responsible DeepSeek V4 Pro
 */

const { WEEKDAY_LABELS } = require('./constants')

/**
 * 格式化日期为 YYYY-MM-DD 字符串
 *
 * @param {Date} date - Date 对象
 * @returns {string} "2026-06-17"
 */
function formatDate(date) {
  const d = toBeijing(date)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 格式化日期时间为 YYYY-MM-DD HH:mm
 *
 * @param {Date} date
 * @returns {string} "2026-06-17 14:30"
 */
function formatDateTime(date) {
  const d = toBeijing(date)
  const dateStr = formatDate(date)
  const hours = String(d.getUTCHours()).padStart(2, '0')
  const minutes = String(d.getUTCMinutes()).padStart(2, '0')
  return `${dateStr} ${hours}:${minutes}`
}

/**
 * 获取北京时间的今天日期字符串 YYYY-MM-DD
 *
 * @returns {string} "2026-06-17"
 */
function todayStr() {
  return formatDate(new Date())
}

/**
 * 获取北京时间的星期几（0=周日, 6=周六）
 *
 * @param {Date} date
 * @returns {number} 0-6
 */
function getDayOfWeek(date) {
  const d = toBeijing(date)
  return d.getUTCDay()
}

/**
 * 获取星期中文标签
 *
 * @param {number} dayOfWeek - 0-6
 * @returns {string} "周一"
 */
function getDayLabel(dayOfWeek) {
  return WEEKDAY_LABELS[dayOfWeek] || ''
}

/**
 * 判断两个日期是否是同一天（按北京时间）
 *
 * @param {Date|string} date1
 * @param {Date|string} date2
 * @returns {boolean}
 */
function isSameDay(date1, date2) {
  return formatDate(new Date(date1)) === formatDate(new Date(date2))
}

/**
 * 计算两个日期之间的天数差（按北京时间）
 *
 * @param {Date|string} date1
 * @param {Date|string} date2
 * @returns {number} date2 - date1 的天数差
 */
function diffDays(date1, date2) {
  const d1 = getBeijingDateStart(new Date(date1))
  const d2 = getBeijingDateStart(new Date(date2))
  return Math.round((d2 - d1) / (24 * 3600 * 1000))
}

/**
 * 获取北京时间某天的 00:00:00
 *
 * @param {Date} date
 * @returns {Date}
 */
function getBeijingDateStart(date) {
  const d = new Date(date)
  const beijing = new Date(d.getTime() + 8 * 3600 * 1000)
  return new Date(Date.UTC(
    beijing.getUTCFullYear(),
    beijing.getUTCMonth(),
    beijing.getUTCDate(),
    0, 0, 0
  ))
}

/**
 * 获取指定月份的天数
 *
 * @param {number} year - 如 2026
 * @param {number} month - 1-12
 * @returns {number} 28-31
 */
function getDaysInMonth(year, month) {
  // 下个月的第0天 = 这个月的最后一天
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * 将 Date 对象转换为北京时间 UTC 表示
 * 内部使用，统一时区处理
 */
function toBeijing(date) {
  const d = new Date(date.getTime() + 8 * 3600 * 1000)
  return d
}

module.exports = {
  formatDate,
  formatDateTime,
  todayStr,
  getDayOfWeek,
  getDayLabel,
  isSameDay,
  diffDays,
  getBeijingDateStart,
  getDaysInMonth
}
