/**
 * 用户鉴权与 OPENID 提取模块
 *
 * 职责：
 *   1. 从微信上下文提取当前用户的 OPENID
 *   2. 校验 OPENID 有效性（未登录拒绝访问）
 *   3. 为数据库查询/修改自动添加 _openid 过滤条件
 *
 * 微信云开发中，每个用户在小程序内的唯一标识是 OPENID。
 * cloud.getWXContext() 在以下场景返回 OPENID：
 *   - 小程序端调用 callFunction 时：包含调用者的 OPENID
 *   - 定时触发器调用时：不包含 OPENID（系统级调用）
 *
 * ⚠️ autoDeduct 云函数需用系统身份运行（无 OPENID），
 *   该函数不应调用 requireOpenID()，而应手动处理用户数据。
 *
 * @module auth
 * @responsible DeepSeek V4 Pro
 */

/**
 * 提取当前调用用户的 OPENID，如果不存在则抛出错误
 *
 * @param {object} cloud - 已初始化的 cloud 实例
 * @returns {string} 当前用户的 OPENID
 * @throws {Error} 如果无法获取 OPENID（未登录或系统调用）
 */
function requireOpenID(cloud) {
  const { OPENID } = cloud.getWXContext()

  if (!OPENID) {
    throw new Error('AUTH_REQUIRED: 无法获取用户身份，请确认已登录微信。定时触发器调用不应使用此函数。')
  }

  return OPENID
}

/**
 * 尝试提取 OPENID，不抛出错误（用于自动消课等系统级调用）
 *
 * @param {object} cloud - 已初始化的 cloud 实例
 * @returns {string|null} OPENID 或 null
 */
function tryGetOpenID(cloud) {
  const { OPENID } = cloud.getWXContext()
  return OPENID || null
}

/**
 * 为查询条件自动注入 _openid 过滤条件
 *
 * 确保每个用户只能查询/修改自己的数据。
 *
 * @param {object} condition - 原始查询条件
 * @param {string} openid - 当前用户的 OPENID
 * @returns {object} 注入后的查询条件
 *
 * @example
 *   // 前端: courseManager({ action: 'list', data: { status: 'active' } })
 *   // 云函数内部:
 *   const query = injectOpenID({ status: 'active' }, openid)
 *   // query = { status: 'active', _openid: 'oXXXXX' }
 */
function injectOpenID(condition, openid) {
  if (!openid) {
    return condition
  }
  return {
    ...condition,
    _openid: openid
  }
}

/**
 * 为新增数据自动注入 _openid 字段
 *
 * @param {object} data - 原始数据对象
 * @param {string} openid - 当前用户的 OPENID
 * @returns {object} 注入后的数据对象
 */
function injectOpenIDToData(data, openid) {
  if (!openid) {
    return data
  }
  return {
    ...data,
    _openid: openid
  }
}

module.exports = {
  requireOpenID,
  tryGetOpenID,
  injectOpenID,
  injectOpenIDToData
}
