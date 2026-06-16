/**
 * 消课记录列表页
 *
 * 按课程查看所有消课记录（含手动+自动）。
 * 支持取消手动消课记录。
 *
 * @page lesson/list
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

const { callCloud } = require('../../utils/auth')

Page({
  data: {
    /** 课程ID */
    courseId: '',
    /** 课程名称 */
    courseName: '',
    /** 消课记录列表 */
    lessons: [],
    /** 加载中 */
    loading: true,
    /** 操作中 */
    operating: false
  },

  onLoad(options) {
    const courseId = options.courseId
    if (!courseId) {
      wx.showToast({ title: '缺少课程ID', icon: 'none' })
      wx.navigateBack()
      return
    }
    this.setData({ courseId })
    this.loadData()
  },

  /**
   * 加载消课记录
   */
  async loadData() {
    this.setData({ loading: true })
    try {
      const res = await callCloud('lessonManager', {
        action: 'list',
        data: {
          courseId: this.data.courseId
        }
      })

      if (res.data) {
        this.setData({
          lessons: res.data.lessons || [],
          courseName: res.data.courseName || '',
          loading: false
        })
      }
    } catch (err) {
      console.error('[list] 加载失败:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 取消消课记录
   */
  async onCancelLesson(e) {
    const { lessonId, type } = e.currentTarget.dataset

    if (type === 'auto') {
      wx.showToast({ title: '自动消课记录不可手动取消', icon: 'none' })
      return
    }

    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '取消消课记录',
        content: '确定要取消该消课记录吗？课时数将恢复。',
        success: res => resolve(res.confirm)
      })
    })

    if (!confirmed) return

    this.setData({ operating: true })
    try {
      await callCloud('lessonManager', {
        action: 'cancel',
        data: { lessonRecordId: lessonId }
      })

      wx.showToast({ title: '已取消', icon: 'success' })
      this.loadData()
    } catch (err) {
      console.error('[list] 取消失败:', err)
      wx.showToast({ title: err.message || '操作失败', icon: 'none' })
    } finally {
      this.setData({ operating: false })
    }
  },

  /**
   * 格式化日期
   */
  formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
})
