/**
 * 首页 - 课程总览 + 课时预警
 *
 * 展示当前用户的活跃课程列表，包含：
 *   - 课程卡片（名称、进度条、剩余课时、下次上课时间）
 *   - 低课时预警横幅
 *   - 即将过期预警横幅
 *   - 快速新增课程入口
 *
 * @page index
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

const { callCloud } = require('../../utils/auth')
const { COURSE_STATUS_LABELS } = require('../../utils/constants')

Page({
  data: {
    /** 课程列表 */
    courses: [],
    /** 统计数据 */
    stats: {
      activeCourses: 0,
      totalRemainingHours: 0,
      monthlyDeductionHours: 0
    },
    /** 即将过期课程 */
    expiryWarnings: [],
    /** 低课时课程 */
    lowHoursWarnings: [],
    /** 加载状态 */
    loading: true,
    /** 空状态 */
    isEmpty: false
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    // 每次回到首页刷新数据
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 加载首页数据
   * 同时获取课程列表、统计数据、预警信息
   */
  async loadData() {
    this.setData({ loading: true })

    try {
      // 并行请求课程列表和统计数据
      const [courseRes, statsRes] = await Promise.all([
        callCloud('courseManager', { action: 'list', data: {} }),
        callCloud('statsQuery', {})
      ])

      const courses = courseRes.data ? courseRes.data.courses : []

      let stats = {}
      let expiryWarnings = []
      let lowHoursWarnings = []

      if (statsRes.data) {
        stats = statsRes.data.summary
        expiryWarnings = statsRes.data.expiryWarnings || []
        lowHoursWarnings = statsRes.data.lowHoursWarnings || []
      }

      this.setData({
        courses,
        stats,
        expiryWarnings,
        lowHoursWarnings,
        loading: false,
        isEmpty: courses.length === 0
      })
    } catch (err) {
      this.setData({ loading: false })
      console.error('[index] 数据加载失败:', err)
    }
  },

  /**
   * 跳转新增课程页
   */
  onAddCourse() {
    wx.navigateTo({
      url: '/pages/course/edit'
    })
  },

  /**
   * 点击课程卡片 → 进入课程详情
   */
  onCourseTap(e) {
    const { courseId } = e.detail
    wx.navigateTo({
      url: `/pages/course/detail?id=${courseId}`
    })
  },

  /**
   * 快速手工消课
   */
  onQuickDeduct(e) {
    const { courseId } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/lesson/add?courseId=${courseId}`
    })
  }
})
