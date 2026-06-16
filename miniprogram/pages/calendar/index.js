/**
 * 日历看板页
 *
 * 以月历视图展示所有排课和消课记录。
 * 支持左右滑动切换月份，点击日期查看当日排课明细。
 * 三色状态标记：已完成(绿) / 待上课(蓝) / 已过期(红)
 *
 * @page calendar
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

const { callCloud } = require('../../utils/auth')
const { formatDate } = require('../../utils/date')

const app = getApp()

Page({
  data: {
    /** 当前年份 */
    year: new Date().getFullYear(),
    /** 当前月份 1-12 */
    month: new Date().getMonth() + 1,
    /** 日期列表 [{date, day, lessons, lessonCount}, ...] */
    days: [],
    /** 选中日期（查看详情） */
    selectedDate: '',
    /** 选中日期的课程列表 */
    selectedLessons: [],
    /** 是否显示日期详情弹窗 */
    showDetailPopup: false,
    /** 加载状态 */
    loading: true
  },

  onLoad() {
    const { currentCalendarYear, currentCalendarMonth } = app.globalData
    if (currentCalendarYear && currentCalendarMonth) {
      this.setData({
        year: currentCalendarYear,
        month: currentCalendarMonth
      })
    }
    this.loadMonthData()
  },

  /**
   * 加载当前月份数据
   */
  async loadMonthData() {
    const { year, month } = this.data
    this.setData({ loading: true })

    try {
      const res = await callCloud('calendarQuery', { year, month })

      if (res.data) {
        this.setData({
          days: res.data.days,
          loading: false
        })
      }
    } catch (err) {
      this.setData({ loading: false })
      console.error('[calendar] 加载日历数据失败:', err)
    }
  },

  /**
   * 上一个月
   */
  onPrevMonth() {
    let { year, month } = this.data
    month--
    if (month < 1) {
      month = 12
      year--
    }
    this.setData({ year, month })
    // 缓存到全局状态
    app.globalData.currentCalendarYear = year
    app.globalData.currentCalendarMonth = month
    this.loadMonthData()
  },

  /**
   * 下一个月
   */
  onNextMonth() {
    let { year, month } = this.data
    month++
    if (month > 12) {
      month = 1
      year++
    }
    this.setData({ year, month })
    app.globalData.currentCalendarYear = year
    app.globalData.currentCalendarMonth = month
    this.loadMonthData()
  },

  /**
   * 点击日期 → 展示当日课程明细
   */
  onDayTap(e) {
    const { date, lessons } = e.detail
    this.setData({
      selectedDate: date,
      selectedLessons: lessons || [],
      showDetailPopup: true
    })
  },

  /**
   * 关闭详情弹窗
   */
  onCloseDetail() {
    this.setData({
      showDetailPopup: false,
      selectedLessons: [],
      selectedDate: ''
    })
  },

  /**
   * 点击课程 → 跳转课程详情
   */
  onLessonTap(e) {
    const { courseId } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/course/detail?id=${courseId}`
    })
  }
})
