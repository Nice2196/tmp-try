/**
 * 手动消课页
 *
 * 为指定课程添加手动消课记录，自动扣减 remainingHours。
 *
 * @page lesson/add
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

const { callCloud } = require('../../utils/auth')
const { todayStr } = require('../../utils/date')

Page({
  data: {
    /** 课程ID（可来自导航参数） */
    courseId: '',
    /** 课程列表 */
    courses: [],
    /** 选中的课程索引 */
    courseIndex: -1,
    /** 选中的课程详情 */
    selectedCourse: null,
    /** 消课日期 */
    lessonDate: todayStr(),
    /** 消课时数（默认1） */
    deductionHours: '1',
    /** 备注 */
    notes: '',
    /** 加载中 */
    loading: true,
    /** 提交中 */
    submitting: false
  },

  onLoad(options) {
    const courseId = options.courseId
    if (courseId) {
      this.setData({ courseId })
    }
    this.loadCourses()
  },

  /**
   * 加载活跃/暂停课程列表
   */
  async loadCourses() {
    try {
      const res = await callCloud('courseManager', {
        action: 'list',
        data: {}
      })

      const courses = (res.data && res.data.courses) ? res.data.courses : []

      // 过滤出可消课的课程（未完成/未过期）
      const validCourses = courses.filter(
        c => c.status === 'active' || c.status === 'paused'
      )

      this.setData({ courses: validCourses, loading: false })

      // 如果导航参数指定了 courseId
      if (this.data.courseId) {
        const idx = validCourses.findIndex(c => c._id === this.data.courseId)
        if (idx >= 0) {
          this.setData({
            courseIndex: idx,
            selectedCourse: validCourses[idx],
            deductionHours: String(validCourses[idx].deductionUnit || 1)
          })
        }
      }

      // 如果只有一个可选课程，自动选中
      if (validCourses.length === 1 && this.data.courseIndex < 0) {
        this.setData({
          courseIndex: 0,
          selectedCourse: validCourses[0],
          deductionHours: String(validCourses[0].deductionUnit || 1)
        })
      }
    } catch (err) {
      console.error('[add] 加载课程失败:', err)
      this.setData({ loading: false })
    }
  },

  /**
   * 选择课程
   */
  onCourseChange(e) {
    const idx = parseInt(e.detail.value, 10)
    const course = this.data.courses[idx]
    this.setData({
      courseIndex: idx,
      selectedCourse: course,
      deductionHours: String(course.deductionUnit || 1)
    })
  },

  /** 日期 */
  onDateChange(e) { this.setData({ lessonDate: e.detail.value }) },
  /** 课时数 */
  onHoursInput(e) { this.setData({ deductionHours: e.detail.value }) },
  /** 备注 */
  onNotesInput(e) { this.setData({ notes: e.detail.value }) },

  /**
   * 提交消课
   */
  async onSubmit() {
    const { selectedCourse, lessonDate, deductionHours, notes } = this.data

    if (!selectedCourse) {
      wx.showToast({ title: '请先选择课程', icon: 'none' })
      return
    }

    const hours = parseFloat(deductionHours)
    if (!deductionHours || isNaN(hours) || hours <= 0) {
      wx.showToast({ title: '请输入有效的课时数', icon: 'none' })
      return
    }

    if (hours > selectedCourse.remainingHours) {
      wx.showToast({
        title: `剩余课时不足（仅剩${selectedCourse.remainingHours}课时）`,
        icon: 'none'
      })
      return
    }

    if (!lessonDate) {
      wx.showToast({ title: '请选择上课日期', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    try {
      await callCloud('lessonManager', {
        action: 'add',
        data: {
          courseId: selectedCourse._id,
          lessonDate,
          deductionHours: hours,
          notes: notes || undefined
        }
      })

      wx.showToast({ title: '消课成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1200)
    } catch (err) {
      console.error('[add] 消课失败:', err)
      wx.showToast({ title: err.message || '消课失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
