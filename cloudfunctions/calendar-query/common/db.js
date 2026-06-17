/**
 * 数据库连接单例模块
 *
 * 职责：封装 cloud.database() 调用，提供统一的数据库实例获取方式。
 * 确保所有云函数复用同一初始化逻辑，避免重复 init。
 *
 * 使用方式：
 *   const db = require('./common/db').getDB()
 *   const _ = db.command
 *   const $ = db.command.aggregate
 *
 * @module db
 * @responsible DeepSeek V4 Pro
 */

let _db = null

/**
 * 获取云数据库实例（单例模式）
 *
 * 首次调用时初始化 cloud 环境并返回数据库实例，
 * 后续调用直接返回缓存的实例，避免重复初始化。
 *
 * @returns {object} 云数据库实例
 */
function getDB() {
  if (_db) {
    return _db
  }

  // 延迟加载 wx-server-sdk（只在云函数环境中可用）
  const cloud = require('wx-server-sdk')

  cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
  })

  _db = cloud.database()
  return _db
}

/**
 * 获取云开发环境实例（用于 cloud.callFunction 等）
 *
 * @returns {object} 云开发环境对象
 */
function getCloud() {
  const cloud = require('wx-server-sdk')
  cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
  })
  return cloud
}

module.exports = {
  getDB,
  getCloud
}
