/**
 * 操作日志页
 *
 * 支持按操作类型和日期范围筛选查看所有审计日志。
 *
 * @page audit-log
 * @responsible MiMo-V2.5 Pro
 * @phase Phase 5
 */

const { callCloud } = require('../../utils/auth')
const { ACTION_TYPE_LABELS } = require('../../utils/constants')

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

      const res = await callCloud('auditQuery', {
        pageNum: page,
        pageSize: this.data.pageSize,
        filters
      })

      if (res.data) {
        const newLogs = page === 1
          ? res.data.logs || []
          : [...this.data.logs, ...(res.data.logs || [])]

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

  /**
   * 格式化时间
   */
  formatDateTime(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
})
