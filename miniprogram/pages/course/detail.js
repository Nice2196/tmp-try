/**
 * 课程详情页
 *
 * 展示课程全量信息、固定排课列表、操作按钮（编辑/消课/暂停/删除）。
 *
 * @page course/detail
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

const { callCloud } = require('../../utils/auth')
const { COURSE_STATUS_LABELS, WEEKDAY_LABELS } = require('../../utils/constants')

Page({
  data: {
    /** 课程ID */
    courseId: '',
    /** 课程信息 */
    course: null,
    /** 排课列表 */
    schedules: [],
    /** 加载状态 */
    loading: true
  },

  onLoad(options) {
    const courseId = options.id
    if (!courseId) {
      wx.showToast({ title: '缺少课程ID', icon: 'none' })
      wx.navigateBack()
      return
    }
    this.setData({ courseId })
  },

  onShow() {
    this.loadData()
  },

  /**
   * 加载课程详情和排课列表
   */
  async loadData() {
    this.setData({ loading: true })
    try {
      const res = await callCloud('course-manager', {
        action: 'get',
        data: { id: this.data.courseId }
      })

      if (res.data) {
        // 对排课预计算星期标签
        const schedules = (res.data.schedules || []).map(s => ({
          ...s,
          weekdayLabel: WEEKDAY_LABELS[s.dayOfWeek] || ''
        }))

        this.setData({
          course: res.data.course,
          courseStatusLabel: COURSE_STATUS_LABELS[res.data.course.status] || res.data.course.status,
          schedules,
          loading: false
        })
      }
    } catch (err) {
      console.error('[detail] 加载课程失败:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 编辑课程
   */
  onEdit() {
    wx.navigateTo({
      url: `/pages/course/edit?id=${this.data.courseId}`
    })
  },

  /**
   * 快速消课
   */
  onQuickDeduct() {
    wx.navigateTo({
      url: `/pages/lesson/add?courseId=${this.data.courseId}`
    })
  },

  /**
   * 查看消课记录
   */
  onViewLessons() {
    wx.navigateTo({
      url: `/pages/lesson/list?courseId=${this.data.courseId}`
    })
  },

  /**
   * 暂停/恢复课程
   */
  async onToggleStatus() {
    const { course } = this.data
    if (!course) return

    const newStatus = course.status === 'active' ? 'paused' : 'active'
    const actionLabel = newStatus === 'active' ? '恢复课程' : '暂停课程'

    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: actionLabel,
        content: `确定要${actionLabel}吗？${newStatus === 'paused' ? '暂停后自动消课将不会触发。' : ''}`,
        success: res => resolve(res.confirm)
      })
    })

    if (!confirmed) return

    try {
      await callCloud('course-manager', {
        action: newStatus,
        data: { id: this.data.courseId }
      })

      wx.showToast({ title: `${actionLabel}成功`, icon: 'success' })
      this.loadData()
    } catch (err) {
      console.error('[detail] 状态切换失败:', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  /**
   * 删除课程
   */
  async onDelete() {
    const { course } = this.data
    if (!course) return

    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '删除课程',
        content: `确定要删除课程「${course.name}」吗？已消课记录会保留，此操作不可撤销。`,
        success: res => resolve(res.confirm)
      })
    })

    if (!confirmed) return

    try {
      await callCloud('course-manager', {
        action: 'delete',
        data: { id: this.data.courseId }
      })

      wx.showToast({ title: '已删除', icon: 'success' })
      // 延迟返回上一页
      setTimeout(() => {
        wx.navigateBack()
      }, 1200)
    } catch (err) {
      console.error('[detail] 删除失败:', err)
      wx.showToast({ title: err.message || '删除失败', icon: 'none' })
    }
  },

  /**
   * 添加固定排课
   */
  onAddSchedule() {
    wx.navigateTo({
      url: `/pages/course/edit?id=${this.data.courseId}&tab=schedule`
    })
  },

  /**
   * 编辑排课
   */
  onEditSchedule(e) {
    const { scheduleId } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/course/edit?id=${this.data.courseId}&tab=schedule&scheduleId=${scheduleId}`
    })
  },

  /**
   * 格式化日期
   */
  formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },

  /**
   * 获取进度百分比
   */
  getProgressPercent() {
    const { course } = this.data
    if (!course || course.totalHours === 0) return 0
    return Math.round((course.consumedHours / course.totalHours) * 100)
  }
})
