/**
 * auditQuery - 审计日志查询云函数
 *
 * 职责：
 *   1. 分页查询当前用户的审计日志
 *   2. 支持按操作类型(actionType)、课程(courseId)、时间范围(dateRange)筛选
 *   3. 按时间倒序排列（最新操作在前）
 *
 * 权限隔离：
 *   仅返回当前用户的操作日志。
 *
 * 输入格式:
 *   {
 *     pageSize?: number,     // 默认 20
 *     pageNum?: number,      // 默认 1
 *     filters?: {
 *       courseId?: string,
 *       actionType?: string,
 *       dateRange?: { start: string, end: string }
 *     }
 *   }
 *
 * @module auditQuery
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
  const {
    pageSize = BUSINESS.DEFAULT_PAGE_SIZE,
    pageNum = 1,
    filters = {}
  } = event

  try {
    // 构建查询条件
    const condition = { _openid: openid }

    // 按课程筛选
    if (filters.courseId) {
      condition.courseId = filters.courseId
    }

    // 按操作类型筛选
    if (filters.actionType) {
      condition.actionType = filters.actionType
    }

    // 按时间范围筛选
    if (filters.dateRange && (filters.dateRange.start || filters.dateRange.end)) {
      const createdAtConditions = []
      if (filters.dateRange.start) {
        createdAtConditions.push(
          db.command.gte(new Date(filters.dateRange.start))
        )
      }
      if (filters.dateRange.end) {
        // end 日期设为当天的 23:59:59
        const endDate = new Date(filters.dateRange.end)
        endDate.setHours(23, 59, 59, 999)
        createdAtConditions.push(
          db.command.lte(endDate)
        )
      }
      if (createdAtConditions.length === 1) {
        condition.createdAt = createdAtConditions[0]
      } else {
        condition.createdAt = db.command.and(createdAtConditions)
      }
    }

    // 查询总数
    const countRes = await db.collection('audit_logs')
      .where(condition)
      .count()

    // 分页查询（按时间倒序）
    const skip = (pageNum - 1) * pageSize
    const logsRes = await db.collection('audit_logs')
      .where(condition)
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(Math.min(pageSize, BUSINESS.MAX_PAGE_SIZE))
      .get()

    return {
      success: true,
      data: {
        total: countRes.total,
        pageNum,
        pageSize: Math.min(pageSize, BUSINESS.MAX_PAGE_SIZE),
        logs: logsRes.data
      }
    }
  } catch (err) {
    logError('auditQuery', '审计日志查询失败', err)
    return { success: false, error: err.message || '查询失败' }
  }
}
