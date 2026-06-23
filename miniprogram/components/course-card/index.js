/**
 * 课程卡片组件
 *
 * 展示课程基本信息、左侧色带状态、环形进度。
 *
 * @component course-card
 * @design-system v2.0 墨蓝·纸白
 */

const { COURSE_STATUS_LABELS, SUBJECT_LABELS, COURSE_TYPE_LABELS } = require('../../utils/constants')
const { formatDate } = require('../../utils/date')

Component({
  properties: {
    /** 课程对象 */
    course: {
      type: Object,
      value: null
    }
  },

  observers: {
    'course'(course) {
      if (course) {
        const progressPercent = course.totalHours > 0
          ? Math.round((course.consumedHours / course.totalHours) * 100)
          : 0
        const statusLabel = COURSE_STATUS_LABELS[course.status] || course.status
        const subjectLabel = SUBJECT_LABELS[course.subject] || course.subject || ''
        const courseTypeLabel = COURSE_TYPE_LABELS[course.courseType] || course.courseType || ''

        // 判断是否即将过期（30天内）
        let isExpiring = false
        if (course.expiryDate) {
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const expiry = new Date(course.expiryDate)
          const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
          isExpiring = diffDays <= 30 && diffDays >= 0
        }

        const formattedExpiryDate = course.expiryDate ? formatDate(new Date(course.expiryDate)) : ''
        this.setData({ progressPercent, statusLabel, subjectLabel, courseTypeLabel, isExpiring, formattedExpiryDate })
      }
    }
  },

  data: {
    progressPercent: 0,
    statusLabel: '',
    subjectLabel: '',
    courseTypeLabel: '',
    isExpiring: false,
    formattedExpiryDate: ''
  },

  methods: {
    /**
     * 点击卡片 → 课程详情
     */
    onTap() {
      const course = this.data.course
      if (course && course._id) {
        wx.navigateTo({
          url: `/pages/course/detail?id=${course._id}`
        })
      }
    }
  }
})
