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
    loading: true,
    /** 加载失败状态 */
    loadError: false
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
   * 页面显示时刷新数据（Bug 7 修复）
   *
   * 当用户从手动消课页返回时，onShow 会触发，确保日历数据是最新的。
   * 首次加载时 _hasLoaded 为 false，由 onLoad 负责初始加载，
   * 避免重复请求。
   */
  onShow() {
    if (this._hasLoaded) {
      this.loadMonthData()
    }
  },

  /**
   * 加载当前月份数据
   */
  async loadMonthData() {
    const { year, month } = this.data
    this.setData({ loading: true, loadError: false })

    try {
      const res = await callCloud('calendar-query', { year, month })

      if (res && res.data && res.data.days) {
        this.setData({
          days: res.data.days,
          loading: false,
          loadError: false
        })
        this._hasLoaded = true
      } else {
        this.setData({ loading: false, loadError: true })
        wx.showToast({ title: res.error || '加载失败', icon: 'none' })
      }
    } catch (err) {
      this.setData({ loading: false, loadError: true })
      console.error('[calendar] 加载日历数据失败:', err)
      wx.showToast({ title: err.message || '网络错误', icon: 'none' })
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
   *
   * 展开弹窗前，用排课数据补全消课记录中缺失的 courseName，
   * 确保用户一眼看到消了什么课。
   */
  onDayTap(e) {
    const { date, lessons } = e.detail
    const courseMap = this._buildCourseMap()
    const enriched = (lessons || []).map(l => {
      if (!l.courseName && l.courseId && courseMap[l.courseId]) {
        return { ...l, courseName: courseMap[l.courseId] }
      }
      return l
    })
    this.setData({
      selectedDate: date,
      selectedLessons: enriched,
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
    if (courseId) {
      wx.navigateTo({
        url: `/pages/course/detail?id=${courseId}`
      })
    }
  },

  /**
   * 快速消课 → 从日历弹窗直接进入消课页
   */
  onQuickDeduct(e) {
    const { courseId, date } = e.currentTarget.dataset
    if (courseId) {
      wx.navigateTo({
        url: `/pages/lesson/add?courseId=${courseId}&date=${date || ''}`
      })
    }
  },

  /**
   * 手动记录课时 → 跳转到消课页面
   */
  onManualAdd() {
    const { selectedDate } = this.data
    wx.navigateTo({
      url: `/pages/lesson/add?date=${selectedDate}`
    })
  },

  /**
   * 编辑手动消课记录 → 跳转到消课页面（编辑模式）
   */
  onEditLesson(e) {
    const { recordId, courseId, hours, notes } = e.currentTarget.dataset
    const { selectedDate } = this.data
    wx.navigateTo({
      url: `/pages/lesson/add?mode=edit&lessonRecordId=${recordId}&courseId=${courseId}&date=${selectedDate}&hours=${hours || ''}&notes=${encodeURIComponent(notes || '')}`
    })
  },

  /**
   * 删除手动消课记录
   */
  async onDeleteLesson(e) {
    const { recordId } = e.currentTarget.dataset
    if (!recordId) return

    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这条消课记录吗？对应课时将退还。',
        success: res => resolve(res.confirm)
      })
    })

    if (!confirmed) return

    try {
      await callCloud('lesson-manager', {
        action: 'cancel',
        data: { lessonRecordId: recordId }
      })
      wx.showToast({ title: '已删除', icon: 'success' })
      // 刷新日历数据
      this.loadMonthData()
      // 关闭弹窗
      this.onCloseDetail()
    } catch (err) {
      console.error('[calendar] 删除消课记录失败:', err)
      wx.showToast({ title: err.message || '删除失败', icon: 'none' })
    }
  },

  /**
   * 从当月日历数据中构建 courseId → courseName 映射
   *
   * 排课记录（status=completed/pending/expired）携带 courseName，
   * 而独立的消课记录可能缺少该字段。此映射用于弹窗展示时补全名称。
   *
   * @returns {Object} { courseId: courseName, ... }
   */
  _buildCourseMap() {
    const map = {}
    for (const day of this.data.days) {
      if (!day.lessons) continue
      for (const lesson of day.lessons) {
        if (lesson.courseId && lesson.courseName) {
          map[lesson.courseId] = lesson.courseName
        }
      }
    }
    return map
  }
})
