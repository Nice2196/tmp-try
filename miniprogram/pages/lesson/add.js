/**
 * 手动消课页
 *
 * 为指定课程添加手动消课记录，自动扣减 remainingHours。
 * 支持编辑模式：修改已有消课记录（Cancel+Add 模式）。
 *
 * @page lesson/add
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

const { callCloud } = require('../../utils/auth')
const { todayStr } = require('../../utils/date')
const { COURSE_TYPE_LABELS } = require('../../utils/constants')

Page({
  data: {
    /** 模式：add（新增）| edit（编辑） */
    mode: 'add',
    /** 消课记录ID（编辑模式） */
    lessonRecordId: '',
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
    submitting: false,
    /** 提交按钮文案 */
    submitText: '确认消课'
  },

  onLoad(options) {
    const mode = options.mode || 'add'
    const courseId = options.courseId
    const date = options.date

    this.setData({ mode })

    if (mode === 'edit') {
      this.setData({
        lessonRecordId: options.lessonRecordId || '',
        submitText: '保存修改'
      })
      // 编辑模式：预填表单
      if (courseId) this.setData({ courseId })
      if (date) this.setData({ lessonDate: date })
      if (options.hours) this.setData({ deductionHours: options.hours })
      if (options.notes) this.setData({ notes: decodeURIComponent(options.notes) })
      // 保存原始值用于变更检测
      this._oldDate = date || ''
      this._oldHours = options.hours || ''
      this._oldNotes = decodeURIComponent(options.notes || '')
      // 动态设置页面标题
      wx.setNavigationBarTitle({ title: '编辑消课记录' })
    } else {
      if (courseId) this.setData({ courseId })
      if (date) this.setData({ lessonDate: date })
    }

    this.loadCourses()
  },

  /**
   * 加载活跃/暂停课程列表
   */
  async loadCourses() {
    try {
      const res = await callCloud('course-manager', {
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
            selectedCourse: this._enrichCourse(validCourses[idx]),
            // 编辑模式下保留用户传入的课时数，新增模式使用默认值
            deductionHours: this.data.mode === 'edit'
              ? this.data.deductionHours
              : String(validCourses[idx].deductionUnit || 1)
          })
          // 编辑模式：保存旧课时数用于可用课时计算
          if (this.data.mode === 'edit') {
            this._oldHours = this.data.deductionHours
          }
        }
      }

      // 如果只有一个可选课程，自动选中
      if (validCourses.length === 1 && this.data.courseIndex < 0) {
        this.setData({
          courseIndex: 0,
          selectedCourse: this._enrichCourse(validCourses[0]),
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
      selectedCourse: this._enrichCourse(course),
      deductionHours: String(course.deductionUnit || 1)
    })
  },

  /**
   * 为课程对象附加中文字段（Bug 5 修复）
   */
  _enrichCourse(course) {
    return {
      ...course,
      courseTypeLabel: COURSE_TYPE_LABELS[course.courseType] || course.courseType
    }
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
    const { mode, lessonRecordId, selectedCourse, lessonDate, deductionHours, notes } = this.data

    if (!selectedCourse) {
      wx.showToast({ title: '请先选择课程', icon: 'none' })
      return
    }

    const hours = parseFloat(deductionHours)
    if (!deductionHours || isNaN(hours) || hours <= 0) {
      wx.showToast({ title: '请输入有效的课时数', icon: 'none' })
      return
    }

    // 编辑模式下，计算可用课时 = 剩余课时 + 旧记录课时
    const availableHours = mode === 'edit'
      ? selectedCourse.remainingHours + parseFloat(this._oldHours || 0)
      : selectedCourse.remainingHours

    if (hours > availableHours) {
      wx.showToast({
        title: `剩余课时不足（可用${availableHours}课时）`,
        icon: 'none'
      })
      return
    }

    if (!lessonDate) {
      wx.showToast({ title: '请选择上课日期', icon: 'none' })
      return
    }

    // 编辑模式下，检测是否有实际变更
    if (mode === 'edit') {
      const hoursUnchanged = parseFloat(this._oldHours || 0) === hours
      const notesUnchanged = (this._oldNotes || '') === (notes || '')
      const dateUnchanged = this._oldDate === lessonDate

      if (hoursUnchanged && notesUnchanged && dateUnchanged) {
        wx.showToast({ title: '未做修改', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1200)
        return
      }
    }

    this.setData({ submitting: true })

    try {
      if (mode === 'edit') {
        // 编辑模式：先取消旧记录，再添加新记录
        try {
          await callCloud('lesson-manager', {
            action: 'cancel',
            data: { lessonRecordId }
          })
        } catch (cancelErr) {
          console.error('[add] 取消旧记录失败:', cancelErr)
          wx.showToast({ title: '修改失败：无法取消旧记录', icon: 'none' })
          this.setData({ submitting: false })
          return
        }

        // 旧记录已取消，切换到追加模式，防止重试时再次 cancel 已取消的记录
        this.setData({ mode: 'add', lessonRecordId: '' })

        // 旧记录已取消，添加新记录
        try {
          await callCloud('lesson-manager', {
            action: 'add',
            data: {
              courseId: selectedCourse._id,
              lessonDate,
              deductionHours: hours,
              notes: notes || undefined
            }
          })

          wx.showToast({ title: '修改成功', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 1200)
        } catch (addErr) {
          // Add 失败：旧记录已取消，新记录未创建，提示用户重试
          console.error('[add] 新增记录失败（旧记录已取消）:', addErr)
          wx.showModal({
            title: '部分失败',
            content: '旧记录已取消但新记录创建失败，请重新提交。',
            showCancel: false,
            confirmText: '我知道了'
          })
          this.setData({ submitting: false })
        }
      } else {
        // 新增模式
        await callCloud('lesson-manager', {
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
      }
    } catch (err) {
      console.error('[add] 消课失败:', err)
      wx.showToast({ title: err.message || '消课失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
