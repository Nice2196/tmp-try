/**
 * 创建 deduction_locks TTL 索引
 *
 * 微信云开发 UI 不支持创建 TTL 索引，
 * 需要通过云函数的 database.createIndex API 创建。
 *
 * 使用方法：在微信开发者工具中，右键此云函数 → 云端测试 → 执行
 */

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 微信云开发 Node SDK 支持 db.createCollection() 但不直接支持 createIndex
    // 尝试使用底层 driver
    const collection = db.collection('deduction_locks')

    // 尝试通过 aggregate $out 方式创建索引（不适用 TTL）
    // 最终方案：返回手动创建指引

    console.log('[create-ttl-index] 微信云开发 Node SDK 不直接支持 createIndex API')
    console.log('[create-ttl-index] 请通过 HTTP API 或控制台创建 TTL 索引')

    return {
      success: false,
      error: '微信云开发 Node SDK 不支持 createIndex API',
      manual_steps: [
        '方式1：通过微信开发者工具的云开发控制台',
        '  路径：云开发控制台 → 数据库 → deduction_locks → 索引管理',
        '  注意：UI 不支持 TTL 设置，只能创建普通索引',
        '',
        '方式2：通过 HTTP API（需要 access_token）',
        '  POST https://api.weixin.qq.com/tcb/createindex',
        '  Body: {',
        '    "env": "cloud1-d7gjypgxued9a2b27",',
        '    "collection_name": "deduction_locks",',
        '    "create_indexes": [{',
        '      "Name": "expireAt_ttl",',
        '      "Key": {"expireAt": 1},',
        '      "Background": true,',
        '      "ExpireAfterSeconds": 604800',
        '    }]',
        '  }',
        '',
        '方式3：不创建 TTL 索引，手动清理过期锁',
        '  auto-deduct 代码已处理：如果锁已过期，会自动删除',
        '  TTL 索引只是自动清理，不影响核心功能'
      ]
    }
  } catch (err) {
    console.error('[create-ttl-index] 失败:', err)
    return { success: false, error: err.message }
  }
}
