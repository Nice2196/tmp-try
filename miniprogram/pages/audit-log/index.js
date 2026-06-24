/**
 * 操作日志页
 *
 * 支持按操作类型和日期范围筛选查看所有审计日志。
 * 每条日志展示：操作类型（中文）、操作详情、操作结果、友好时间。
 *
 * @page audit-log
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

const { callCloud } = require('../../utils/auth')
const { ACTION_TYPE_LABELS, WEEKDAY_LABELS } = require('../../utils/constants')

/** 课程类型中文 */
const COURSE_TYPE_MAP = {
  one_on_one: '一对一',
  small_group: '小班课',
  large_class: '大班课'
}

/** 科目中文 */
const SUBJECT_MAP = {
  math: '数学', english: '英语', physics: '物理', chemistry: '化学',
  biology: '生物', chinese: '语文', history: '历史', geography: '地理',
  politics: '政治', art: '美术', music: '音乐', pe: '体育', other: '其他'
}

/** 字段中文映射 */
const FIELD_LABELS = {
  dayOfWeek: '上课日',
  time: '上课时间',
  effectiveFrom: '生效日期',
  effectiveTo: '截止日期',
  status: '状态',
  name: '课程名称',
  courseType: '课程类型',
  subject: '科目',
  totalHours: '总课时',
  teacher: '教师',
  student: '学生',
  notes: '备注'
}

Page({
  data: {
    /** 日志列表 */
    logs: [],
    /** 总数 */
    total: 0,
    /** 当前页 */
    page: 1,
    /** 每页数量 */
    pageSize: 20,
    /** 是否还有更多 */
    hasMore: true,
    /** 加载中 */
    loading: true,
    /** 正在加载更多 */
    loadingMore: false,
    /** 筛选: 操作类型 */
    filterAction: '',
    /** 筛选: 开始日期 */
    filterStartDate: '',
    /** 筛选: 结束日期 */
    filterEndDate: '',
    /** 展开筛选 */
    showFilter: false,
    /** 操作类型选项 */
    actionOptions: [],
    /** 当前筛选的操作类型标签 */
    actionTypeLabel: ''
  },

  onLoad() {
    // 构建操作类型选项
    const options = [{ value: '', label: '全部操作' }]
    for (const [key, label] of Object.entries(ACTION_TYPE_LABELS || {})) {
      options.push({ value: key, label })
    }
    this.setData({ actionOptions: options })
    this.loadData()
  },

  /**
   * 加载日志
   */
  async loadData() {
    const { page, filterAction, filterStartDate, filterEndDate } = this.data
    const loading = page === 1

    if (loading) {
      this.setData({ loading: true })
    } else {
      this.setData({ loadingMore: true })
    }

    try {
      const filters = {}
      if (filterAction) filters.actionType = filterAction
      if (filterStartDate || filterEndDate) {
        filters.dateRange = {}
        if (filterStartDate) filters.dateRange.start = filterStartDate
        if (filterEndDate) filters.dateRange.end = filterEndDate
      }

      const res = await callCloud('audit-query', {
        pageNum: page,
        pageSize: this.data.pageSize,
        filters
      })

      if (res.data) {
        const formattedLogs = (res.data.logs || []).map(log => {
          const actionLabel = ACTION_TYPE_LABELS[log.actionType] || log.actionType
          const triggerLabel = log.trigger === 'auto_scheduler' ? '自动' : '手动'
          return {
            ...log,
            actionTypeLabel: actionLabel,
            triggerLabel,
            displayTime: this._formatFriendlyTime(log.createdAt),
            detailText: this._buildDetailText(log),
            resultText: this._buildResultText(log),
            resultClass: this._buildResultClass(log)
          }
        })

        const newLogs = page === 1
          ? formattedLogs
          : [...this.data.logs, ...formattedLogs]

        this.setData({
          logs: newLogs,
          total: res.data.total || 0,
          hasMore: newLogs.length < res.data.total,
          loading: false,
          loadingMore: false
        })
      }
    } catch (err) {
      console.error('[audit] 加载失败:', err)
      this.setData({ loading: false, loadingMore: false })
    }
  },

  /**
   * 加载更多
   */
  loadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return
    this.setData({ page: this.data.page + 1 })
    this.loadData()
  },

  /**
   * 切换筛选面板
   */
  onToggleFilter() {
    this.setData({ showFilter: !this.data.showFilter })
  },

  /**
   * 选择操作类型
   */
  onActionTypeChange(e) {
    const idx = parseInt(e.detail.value, 10)
    const actionType = this.data.actionOptions[idx].value
    this.setData({
      filterAction: actionType,
      actionTypeLabel: ACTION_TYPE_LABELS[actionType] || ''
    })
  },

  /** 日期筛选 */
  onStartDateChange(e) { this.setData({ filterStartDate: e.detail.value }) },
  onEndDateChange(e) { this.setData({ filterEndDate: e.detail.value }) },

  /**
   * 应用筛选
   */
  onApplyFilter() {
    this.setData({ page: 1, showFilter: false })
    this.loadData()
  },

  /**
   * 重置筛选
   */
  onResetFilter() {
    this.setData({
      filterAction: '',
      filterStartDate: '',
      filterEndDate: '',
      actionTypeLabel: '',
      showFilter: false,
      page: 1
    })
    this.loadData()
  },

  /**
   * 点击日志 → 跳转课程
   */
  onLogTap(e) {
    const { courseId } = e.currentTarget.dataset
    if (courseId) {
      wx.navigateTo({
        url: `/pages/course/detail?id=${courseId}`
      })
    }
  },

  /* ==================== 内部方法 ==================== */

  /**
   * 友好时间格式
   * 今天 14:30 / 昨天 09:15 / 前天 08:00 / 06-15 14:30 / 2025-12-01 09:00
   */
  _formatFriendlyTime(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const diffDays = Math.floor((today - target) / 86400000)

    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    const timeStr = `${h}:${min}`

    if (diffDays === 0) return `今天 ${timeStr}`
    if (diffDays === 1) return `昨天 ${timeStr}`
    if (diffDays === 2) return `前天 ${timeStr}`
    // 同年省略年份
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    if (d.getFullYear() === now.getFullYear()) return `${m}-${day} ${timeStr}`
    return `${d.getFullYear()}-${m}-${day} ${timeStr}`
  },

  /**
   * 根据 actionType + detail 生成可读的操作详情
   * 返回字符串，如 "消课 1 课时，剩余 9 → 8"
   */
  _buildDetailText(log) {
    const d = log.detail || {}
    const at = log.actionType

    // --- 课程操作 ---
    if (at === 'course_create') {
      const cd = d.courseData || {}
      const parts = []
      if (cd.courseType) parts.push(COURSE_TYPE_MAP[cd.courseType] || cd.courseType)
      if (cd.subject) parts.push(SUBJECT_MAP[cd.subject] || cd.subject)
      if (cd.totalHours != null) parts.push(`${cd.totalHours}课时`)
      return parts.length ? `新增 ${parts.join(' · ')}` : ''
    }
    if (at === 'course_update') {
      return this._formatChanges(d.changes)
    }
    if (at === 'course_delete') {
      return `删除课程，共 ${d.totalHours || '?'} 课时`
    }
    if (at === 'course_status_change') {
      const fromLabel = this._statusLabel(d.from)
      const toLabel = this._statusLabel(d.to)
      return `${fromLabel} → ${toLabel}${d.reason && d.reason !== '无备注' ? '，' + d.reason : ''}`
    }

    // --- 排课操作 ---
    if (at === 'schedule_create') {
      const s = d.schedule || {}
      const parts = []
      if (s.dayOfWeek != null) parts.push(WEEKDAY_LABELS[s.dayOfWeek] || '')
      if (s.time) parts.push(s.time)
      if (s.effectiveFrom) parts.push(`自 ${s.effectiveFrom}`)
      return parts.length ? `每周 ${parts.join(' ')}` : ''
    }
    if (at === 'schedule_update') {
      return this._formatScheduleChanges(d.changes)
    }
    if (at === 'schedule_delete') {
      const s = d.schedule || {}
      const parts = []
      if (s.dayOfWeek != null) parts.push(WEEKDAY_LABELS[s.dayOfWeek] || '')
      if (s.time) parts.push(s.time)
      return parts.length ? `删除排课：每周${parts.join(' ')}` : '删除排课'
    }

    // --- 消课操作 ---
    if (at === 'lesson_manual_deduct' || at === 'lesson_auto_deduct') {
      const parts = []
      if (d.deductionHours != null) parts.push(`消课 ${d.deductionHours} 课时`)
      if (d.lessonDate) parts.push(`上课日 ${d.lessonDate}`)
      if (d.afterRemaining != null) parts.push(`剩余 ${d.afterRemaining} 课时`)
      return parts.join('，')
    }
    if (at === 'lesson_cancel') {
      const parts = []
      if (d.cancelledDeductionHours != null) parts.push(`退回 ${d.cancelledDeductionHours} 课时`)
      if (d.lessonDate) parts.push(`上课日 ${d.lessonDate}`)
      return parts.join('，')
    }

    return ''
  },

  /**
   * 生成操作结果文本
   * 如 "已完成" "已消课" "已退回"
   */
  _buildResultText(log) {
    const at = log.actionType
    const d = log.detail || {}

    if (at === 'course_create') return '已创建'
    if (at === 'course_update') return '已修改'
    if (at === 'course_delete') return '已删除'
    if (at === 'course_status_change') return '已变更'
    if (at === 'schedule_create') return '已添加'
    if (at === 'schedule_update') return '已修改'
    if (at === 'schedule_delete') return '已删除'
    if (at === 'lesson_manual_deduct') {
      return d.triggeredCompletion ? '已消课（课程完成）' : '已消课'
    }
    if (at === 'lesson_auto_deduct') {
      return d.triggeredCompletion ? '已消课（课程完成）' : '已消课'
    }
    if (at === 'lesson_cancel') return '已退回'
    return ''
  },

  /**
   * 操作结果样式类
   */
  _buildResultClass(log) {
    const at = log.actionType
    if (at === 'course_delete' || at === 'schedule_delete') return 'result-danger'
    if (at.startsWith('lesson_')) return 'result-success'
    return 'result-default'
  },

  /**
   * 格式化变更内容（课程修改）
   * changes: { name: { from: 'A', to: 'B' }, totalHours: { from: 10, to: 20 } }
   */
  _formatChanges(changes) {
    if (!changes || typeof changes !== 'object') return ''
    const keys = Object.keys(changes)
    if (keys.length === 0) return '无变更'
    const parts = keys.slice(0, 3).map(k => {
      const label = FIELD_LABELS[k] || k
      const c = changes[k]
      if (c && typeof c === 'object' && 'from' in c && 'to' in c) {
        return `${label}: ${c.from} → ${c.to}`
      }
      return `${label} 已更新`
    })
    if (keys.length > 3) parts.push(`等 ${keys.length} 项`)
    return parts.join('；')
  },

  /**
   * 格式化排课变更内容
   * 同 _formatChanges 但字段中文映射不同
   */
  _formatScheduleChanges(changes) {
    if (!changes || typeof changes !== 'object') return ''
    const keys = Object.keys(changes)
    if (keys.length === 0) return '无变更'
    const parts = keys.slice(0, 3).map(k => {
      const label = FIELD_LABELS[k] || k
      const c = changes[k]
      if (c && typeof c === 'object' && 'from' in c && 'to' in c) {
        let from = c.from
        let to = c.to
        // dayOfWeek 转中文
        if (k === 'dayOfWeek') {
          from = WEEKDAY_LABELS[from] || from
          to = WEEKDAY_LABELS[to] || to
        }
        return `${label}: ${from} → ${to}`
      }
      return `${label} 已更新`
    })
    if (keys.length > 3) parts.push(`等 ${keys.length} 项`)
    return parts.join('；')
  },

  /**
   * 状态码 → 中文标签
   */
  _statusLabel(status) {
    const map = {
      active: '进行中',
      paused: '已暂停',
      completed: '已完成',
      expired: '已过期'
    }
    return map[status] || status || '?'
  },
})
