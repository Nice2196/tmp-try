/**
 * 前端鉴权工具模块
 *
 * 封装云函数调用的通用模式：
 *   - 自动处理 loading 状态
 *   - 统一错误处理与 Toast 提示
 *   - 运行时环境检测（防止非云开发环境下调用）
 *
 * @module utils/auth
 * @responsible DeepSeek V4 Pro
 */

/**
 * 调用云函数的通用封装
 *
 * @param {string} name - 云函数名称
 * @param {object} data - 传递给云函数的参数
 * @param {object} [options] - 可选配置
 * @param {boolean} [options.showLoading=true] - 是否显示 loading
 * @param {string} [options.loadingText='加载中...'] - loading 文案
 * @param {boolean} [options.showError=true] - 是否自动显示错误 Toast
 * @returns {Promise<object>} 云函数返回的 result
 */
async function callCloud(name, data, options = {}) {
  const {
    showLoading = true,
    loadingText = '加载中...',
    showError = true
  } = options

  // 检测云能力可用性
  if (!wx.cloud) {
    const msg = '请在微信开发者工具中启用云开发'
    if (showError) {
      wx.showToast({ title: msg, icon: 'none', duration: 2000 })
    }
    throw new Error(msg)
  }

  if (showLoading) {
    wx.showLoading({ title: loadingText, mask: true })
  }

  try {
    const res = await wx.cloud.callFunction({ name, data })

    if (showLoading) {
      wx.hideLoading()
    }

    // 云函数返回 { success, data?, error? }
    if (res.result && res.result.success) {
      return res.result
    } else {
      const errorMsg = (res.result && res.result.error) || '操作失败'
      if (showError) {
        wx.showToast({ title: errorMsg, icon: 'none', duration: 2000 })
      }
      throw new Error(errorMsg)
    }
  } catch (err) {
    if (showLoading) {
      wx.hideLoading()
    }
    const errorMsg = err.message || '网络异常，请重试'
    if (showError) {
      wx.showToast({ title: errorMsg, icon: 'none', duration: 2000 })
    }
    throw err
  }
}

/**
 * 简单的云函数调用（不显示 loading，不自动报错）
 *
 * 适合静默操作，如后台数据刷新。
 */
async function callCloudSilent(name, data) {
  return callCloud(name, data, {
    showLoading: false,
    showError: false
  })
}

module.exports = {
  callCloud,
  callCloudSilent
}
