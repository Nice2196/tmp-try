/**
 * 课程编辑页（新增/编辑）
 *
 * 支持新增和编辑两种模式。
 * 编辑模式下可切换 tab 管理固定排课。
 *
 * @page course/edit
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

const { callCloud } = require('../../utils/auth')
const { validateCourseForm, validateScheduleForm } = require('../../utils/validator')
const { COURSE_TYPE_LABELS, SUBJECT_LABELS, WEEKDAY_LABELS, COURSE_STATUS_LABELS } = require('../../utils/constants')

const app = getApp()

Page({
  data: {
    /** 编辑模式 */
    isEdit: false,
    /** 课程ID（编辑时） */
    courseId: '',
    /** 当前tab: course | schedule */
    activeTab: 'course',

    /* ===== 课程表单 ===== */
    form: {
      name: '',
      courseType: 'one_on_one',
      subject: 'math',
      teacher: '',
      student: '',
      totalHours: '',
      deductionUnit: '1',
      startDate: '',
      expiryDate: '',
      lowHoursThreshold: '3',
      notes: ''
    },

    /** 课程类型选项 */
    courseTypeOptions: Object.entries(COURSE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
    /** 科目选项 */
    subjectOptions: Object.entries(SUBJECT_LABELS).map(([value, label]) => ({ value, label })),

    /** 选中的课程类型索引 */
    courseTypeIndex: 0,
    /** 选中的科目索引 */
    subjectIndex: 0,

    /* ===== 排课表单 ===== */
    scheduleForm: {
      dayOfWeek: 1,
      time: '17:00',
      effectiveFrom: ''
    },
    /** 星期选项 */
    weekdayOptions: WEEKDAY_LABELS.map((label, i) => ({ value: i, label })),
    /** 星期选择索引 */
    weekdayIndex: 1,

    /** 已有排课列表 */
    schedules: [],

    /** 提交中 */
    submitting: false
  },

  onLoad(options) {
    const { id, tab } = options
    if (id) {
      this.setData({ isEdit: true, courseId: id })
      this.loadCourseData()
    }
    if (tab === 'schedule') {
      this.setData({ activeTab: 'schedule' })
    }
  },

  /**
   * 加载课程数据（编辑模式）
   */
  async loadCourseData() {
    try {
      const res = await callCloud('courseManager', {
        action: 'get',
        data: { id: this.data.courseId }
      })
      if (res.data) {
        const c = res.data.course
        const schedules = (res.data.schedules || []).map(s => ({
          ...s,
          weekdayLabel: WEEKDAY_LABELS[s.dayOfWeek] || ''
        }))
        this.setData({
          form: {
            name: c.name || '',
            courseType: c.courseType || 'one_on_one',
            subject: c.subject || 'math',
            teacher: c.teacher || '',
            student: c.student || '',
            totalHours: String(c.totalHours || ''),
            deductionUnit: String(c.deductionUnit || '1'),
            startDate: this.formatDateStr(c.startDate),
            expiryDate: this.formatDateStr(c.expiryDate),
            lowHoursThreshold: String(c.lowHoursThreshold || '3'),
            notes: c.notes || ''
          },
          schedules,
          courseStatusLabel: COURSE_STATUS_LABELS[c.status] || c.status
        })
        // 设置 picker 索引
        this.setPickerIndexes()
      }
    } catch (err) {
      console.error('[edit] 加载课程失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /** 设置 picker 默认索引 */
  setPickerIndexes() {
    const { form, courseTypeOptions, subjectOptions } = this.data
    const typeIdx = courseTypeOptions.findIndex(o => o.value === form.courseType)
    const subjIdx = subjectOptions.findIndex(o => o.value === form.subject)
    this.setData({
      courseTypeIndex: typeIdx >= 0 ? typeIdx : 0,
      subjectIndex: subjIdx >= 0 ? subjIdx : 0
    })
  },

  /** 格式化日期为 YYYY-MM-DD */
  formatDateStr(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },

  /* ===== 课程表单处理 ===== */

  onNameInput(e) { this.setData({ 'form.name': e.detail.value }) },
  onTeacherInput(e) { this.setData({ 'form.teacher': e.detail.value }) },
  onStudentInput(e) { this.setData({ 'form.student': e.detail.value }) },
  onTotalHoursInput(e) { this.setData({ 'form.totalHours': e.detail.value }) },
  onDeductionUnitInput(e) { this.setData({ 'form.deductionUnit': e.detail.value }) },
  onThresholdInput(e) { this.setData({ 'form.lowHoursThreshold': e.detail.value }) },
  onNotesInput(e) { this.setData({ 'form.notes': e.detail.value }) },

  onStartDateChange(e) { this.setData({ 'form.startDate': e.detail.value }) },
  onExpiryDateChange(e) { this.setData({ 'form.expiryDate': e.detail.value }) },

  onCourseTypeChange(e) {
    const idx = parseInt(e.detail.value, 10)
    this.setData({
      courseTypeIndex: idx,
      'form.courseType': this.data.courseTypeOptions[idx].value
    })
  },

  onSubjectChange(e) {
    const idx = parseInt(e.detail.value, 10)
    this.setData({
      subjectIndex: idx,
      'form.subject': this.data.subjectOptions[idx].value
    })
  },

  /**
   * 提交课程表单
   */
  async onSubmitCourse() {
    const { form, isEdit, courseId } = this.data

    // 校验
    const validation = validateCourseForm(form)
    if (!validation.valid) {
      wx.showToast({ title: validation.errors[0].message, icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    try {
      if (isEdit) {
        await callCloud('courseManager', {
          action: 'update',
          data: {
            id: courseId,
            name: form.name,
            courseType: form.courseType,
            subject: form.subject,
            teacher: form.teacher || undefined,
            student: form.student || undefined,
            totalHours: parseFloat(form.totalHours),
            deductionUnit: parseFloat(form.deductionUnit) || 1,
            startDate: form.startDate || undefined,
            expiryDate: form.expiryDate || undefined,
            lowHoursThreshold: parseFloat(form.lowHoursThreshold) || 3,
            notes: form.notes || undefined
          }
        })
        wx.showToast({ title: '课程已更新', icon: 'success' })
      } else {
        await callCloud('courseManager', {
          action: 'create',
          data: {
            name: form.name,
            courseType: form.courseType,
            subject: form.subject,
            teacher: form.teacher || undefined,
            student: form.student || undefined,
            totalHours: parseFloat(form.totalHours),
            deductionUnit: parseFloat(form.deductionUnit) || 1,
            startDate: form.startDate || undefined,
            expiryDate: form.expiryDate || undefined,
            lowHoursThreshold: parseFloat(form.lowHoursThreshold) || 3,
            notes: form.notes || undefined
          }
        })
        wx.showToast({ title: '课程已创建', icon: 'success' })
      }

      setTimeout(() => wx.navigateBack(), 1200)
    } catch (err) {
      console.error('[edit] 提交失败:', err)
      wx.showToast({ title: err.message || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  /* ===== 排课表单处理 ===== */

  onDayOfWeekChange(e) {
    const idx = parseInt(e.detail.value, 10)
    this.setData({
      weekdayIndex: idx,
      'scheduleForm.dayOfWeek': idx
    })
  },

  onTimeInput(e) { this.setData({ 'scheduleForm.time': e.detail.value }) },
  onEffectiveFromChange(e) { this.setData({ 'scheduleForm.effectiveFrom': e.detail.value }) },

  /**
   * 添加/更新排课
   */
  async onAddSchedule() {
    const { scheduleForm, courseId, weekdayIndex } = this.data

    const validation = validateScheduleForm(scheduleForm)
    if (!validation.valid) {
      wx.showToast({ title: validation.errors[0].message, icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    try {
      await callCloud('scheduleManager', {
        action: 'create',
        data: {
          courseId,
          dayOfWeek: scheduleForm.dayOfWeek,
          time: scheduleForm.time,
          effectiveFrom: scheduleForm.effectiveFrom || undefined
        }
      })

      wx.showToast({ title: '排课已添加', icon: 'success' })
      // 重新加载数据
      this.loadCourseData()
      // 重置排课表单
      this.setData({
        scheduleForm: {
          dayOfWeek: 1,
          time: '17:00',
          effectiveFrom: ''
        },
        weekdayIndex: 1
      })
    } catch (err) {
      console.error('[edit] 添加排课失败:', err)
      wx.showToast({ title: err.message || '添加失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  /**
   * 删除排课
   */
  async onDeleteSchedule(e) {
    const { scheduleId } = e.currentTarget.dataset

    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '删除排课',
        content: '确定要删除此固定排课吗？',
        success: res => resolve(res.confirm)
      })
    })

    if (!confirmed) return

    try {
      await callCloud('scheduleManager', {
        action: 'delete',
        data: { id: scheduleId }
      })
      wx.showToast({ title: '已删除', icon: 'success' })
      this.loadCourseData()
    } catch (err) {
      console.error('[edit] 删除排课失败:', err)
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },

  /* ===== Tab 切换 ===== */

  onSwitchTab(e) {
    const { tab } = e.currentTarget.dataset
    this.setData({ activeTab: tab })
  }
})
