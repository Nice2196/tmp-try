/**
 * 环境配置模块
 *
 * 集中管理微信云开发的环境ID等配置项。
 * 部署前需将 CLOUD_ENV_ID 替换为实际的云环境ID。
 *
 * 如何获取云环境ID：
 *   微信开发者工具 → 云开发控制台 → 设置 → 环境ID
 *   通常格式为: "your-app-xxxxxx"
 *
 * @module env
 * @responsible DeepSeek V4 Pro
 */
module.exports = {
  /** 云开发环境ID（部署时替换为实际值） */
  CLOUD_ENV_ID: 'your-cloud-env-id',

  /** 应用版本号 */
  APP_VERSION: '1.0.0',

  /** 应用名称 */
  APP_NAME: '课时管理'
}
