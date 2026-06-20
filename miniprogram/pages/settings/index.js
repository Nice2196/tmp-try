/**
 * 设置页
 *
 * 支持：OpenID 展示、低课时默认阈值、关于信息。
 *
 * @page settings
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

const app = getApp()

Page({
  data: {
    /** 当前 OPENID */
    openid: '',
    /** 微信昵称 */
    nickname: '',
    /** 头像URL */
    avatarUrl: '',
    /** 默认预警阈值 */
    defaultLowHoursThreshold: 3,
    /** 应用版本 */
    version: '1.0.0',
    /** 是否已初始化数据库 */
    dbInitialized: false
  },

  onLoad() {
    // 恢复缓存用户信息
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.setData({
        nickname: userInfo.nickName || '',
        avatarUrl: userInfo.avatarUrl || ''
      })
    }

    // 获取 OPENID
    if (app.globalData.openid) {
      this.setData({ openid: app.globalData.openid })
    } else {
      // 等待获取
      this.tryGetOpenid()
    }
  },

  /**
   * 尝试获取 OPENID
   */
  async tryGetOpenid() {
    try {
      // 使用最小的合法请求来验证云开发连通性
      const res = await wx.cloud.callFunction({
        name: 'course-manager',
        data: { action: 'list', data: { pageSize: 1 } }
      })
      // 如果成功，说明云开发正常
    } catch (_) {
      // ignore
    }

    if (app.globalData.openid) {
      this.setData({ openid: app.globalData.openid })
    }
  },

  /**
   * 修改默认预警阈值
   */
  onThresholdInput(e) {
    const val = parseInt(e.detail.value, 10)
    if (val >= 0) {
      this.setData({ defaultLowHoursThreshold: val })
      wx.setStorageSync('lowHoursThreshold', val)
    }
  },

  /**
   * 初始化数据库索引
   */
  async onInitDB() {
    wx.showModal({
      title: '初始化数据库',
      content: '将创建所有必要的索引，此操作只需执行一次。确定继续吗？',
      success: async (res) => {
        if (!res.confirm) return

        try {
          const { callCloud } = require('../../utils/auth')
          const result = await callCloud('init-db', {})

          wx.showToast({ title: '索引创建成功', icon: 'success' })
          this.setData({ dbInitialized: true })
        } catch (err) {
          console.error('[settings] 初始化失败:', err)
          wx.showToast({ title: '初始化失败，请查看云开发控制台', icon: 'none' })
        }
      }
    })
  },

  /**
   * 查看操作日志
   */
  onViewAuditLog() {
    wx.navigateTo({
      url: '/pages/audit-log/index'
    })
  },

  /**
   * 清除本地缓存
   */
  onClearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '将清除本地存储的配置数据，确定继续吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.clearStorageSync()
            this.setData({ defaultLowHoursThreshold: 3 })
            wx.showToast({ title: '缓存已清除', icon: 'success' })
          } catch (err) {
            wx.showToast({ title: '清除失败', icon: 'none' })
          }
        }
      }
    })
  },

  /**
   * 获取微信用户信息（昵称/头像，Bug 11 修复）
   */
  onGetUserProfile() {
    wx.getUserProfile({
      desc: '用于展示用户信息',
      success: (res) => {
        const userInfo = res.userInfo
        this.setData({
          nickname: userInfo.nickName || '',
          avatarUrl: userInfo.avatarUrl || ''
        })
        // 缓存到本地
        wx.setStorageSync('userInfo', userInfo)
        app.globalData.userInfo = userInfo
        wx.showToast({ title: '已更新', icon: 'success' })
      },
      fail: (err) => {
        console.error('[settings] 获取用户信息失败:', err)
        wx.showToast({ title: '获取失败，请重试', icon: 'none' })
      }
    })
  },

  /**
   * 复制 OpenID
   */
  onCopyOpenid() {
    if (this.data.openid) {
      wx.setClipboardData({
        data: this.data.openid,
        success: () => wx.showToast({ title: '已复制', icon: 'success' })
      })
    }
  }
})
