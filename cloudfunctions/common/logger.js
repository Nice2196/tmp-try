/**
 * 日志工具模块
 *
 * 职责：为云函数提供结构化的日志输出能力。
 *
 * 微信云开发中 console.log 会写入云函数日志，
 * 可在云开发控制台的"云函数日志"中查看。
 *
 * 本模块提供带时间戳、函数名、操作类型的格式化日志，
 * 方便在大量日志中快速定位问题。
 *
 * @module logger
 * @responsible DeepSeek V4 Pro
 */

/**
 * 格式化输出 Info 级别日志
 *
 * @param {string} functionName - 云函数名称
 * @param {string} action - 操作描述
 * @param {object} [data] - 附加数据（可选）
 *
 * @example
 *   logInfo('autoDeduct', '开始扫描排课', { date: '2026-06-17' })
 *   // → [2026-06-17T09:00:00.000Z][INFO][autoDeduct] 开始扫描排课 {"date":"2026-06-17"}
 */
function logInfo(functionName, action, data) {
  const timestamp = new Date().toISOString()
  const log = {
    timestamp,
    level: 'INFO',
    function: functionName,
    action
  }
  if (data !== undefined) {
    log.data = data
  }
  console.log(JSON.stringify(log))
}

/**
 * 格式化输出 Warn 级别日志
 *
 * @param {string} functionName - 云函数名称
 * @param {string} action - 警告描述
 * @param {object} [data] - 附加数据
 */
function logWarn(functionName, action, data) {
  const timestamp = new Date().toISOString()
  const log = {
    timestamp,
    level: 'WARN',
    function: functionName,
    action
  }
  if (data !== undefined) {
    log.data = data
  }
  console.warn(JSON.stringify(log))
}

/**
 * 格式化输出 Error 级别日志
 *
 * @param {string} functionName - 云函数名称
 * @param {string} action - 错误描述
 * @param {object|Error} error - 错误对象或附加数据
 */
function logError(functionName, action, error) {
  const timestamp = new Date().toISOString()
  const log = {
    timestamp,
    level: 'ERROR',
    function: functionName,
    action
  }
  if (error instanceof Error) {
    log.error = {
      message: error.message,
      stack: error.stack
    }
  } else if (error !== undefined) {
    log.error = error
  }
  console.error(JSON.stringify(log))
}

/**
 * 记录消课失败日志
 *
 * 专门用于自动消课失败的记录，包含足够的上下文信息，
 * 方便后续手动排查和补录。
 *
 * @param {string} functionName - 云函数名称
 * @param {string} courseId - 课程 ID
 * @param {string} scheduleId - 排课 ID
 * @param {string} dateStr - 目标日期
 * @param {string} reason - 失败原因
 * @param {object} [extra] - 额外信息
 */
function logDeductionFailure(functionName, courseId, scheduleId, dateStr, reason, extra) {
  const timestamp = new Date().toISOString()
  const log = {
    timestamp,
    level: 'ERROR',
    function: functionName,
    action: 'AUTO_DEDUCT_FAILED',
    courseId,
    scheduleId,
    date: dateStr,
    reason
  }
  if (extra !== undefined) {
    log.extra = extra
  }
  console.error(JSON.stringify(log))
}

module.exports = {
  logInfo,
  logWarn,
  logError,
  logDeductionFailure
}
