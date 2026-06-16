/**
 * 前端常量模块
 *
 * 与 cloudfunctions/common/constants.js 保持同步。
 * 微信小程序前端不能直接 require 云函数目录的模块，
 * 因此在前端 utils/ 中维护一份副本。
 *
 * @module utils/constants
 * @responsible DeepSeek V4 Pro
 */

/** 课程状态 */
const COURSE_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  EXPIRED: 'expired'
}

/** 中文映射 */
const COURSE_STATUS_LABELS = {
  active: '进行中',
  paused: '已暂停',
  completed: '已完成',
  expired: '已过期'
}

/** 课程类型 */
const COURSE_TYPE_LABELS = {
  one_on_one: '一对一',
  small_group: '小班课',
  large_class: '大班课'
}

/** 科目 */
const SUBJECT_LABELS = {
  math: '数学', english: '英语', physics: '物理', chemistry: '化学',
  biology: '生物', chinese: '语文', history: '历史', geography: '地理',
  politics: '政治', art: '美术', music: '音乐', pe: '体育', other: '其他'
}

/** 消课方式 */
const DEDUCTION_TYPE_LABELS = {
  auto: '自动消课',
  manual: '手动消课'
}

/** 操作类型 */
const ACTION_TYPE_LABELS = {
  course_create: '新增课程',
  course_update: '修改课程',
  course_delete: '删除课程',
  course_status_change: '状态变更',
  schedule_create: '新增排课',
  schedule_update: '修改排课',
  schedule_delete: '删除排课',
  lesson_manual_deduct: '手动消课',
  lesson_auto_deduct: '自动消课',
  lesson_cancel: '取消消课'
}

/** 星期 */
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 日历状态颜色 */
const LESSON_COLORS = {
  completed: '#52C41A',  // 绿色：已完成
  pending: '#1890FF',    // 蓝色：待上课
  expired: '#FF4D4F'     // 红色：已过期
}

/** 业务常量 */
const BUSINESS = {
  DEFAULT_DEDUCTION_UNIT: 1.0,
  DEFAULT_LOW_HOURS_THRESHOLD: 3.0,
  EXPIRY_WARNING_DAYS: 30,
  DEFAULT_PAGE_SIZE: 20
}

module.exports = {
  COURSE_STATUS,
  COURSE_STATUS_LABELS,
  COURSE_TYPE_LABELS,
  SUBJECT_LABELS,
  DEDUCTION_TYPE_LABELS,
  ACTION_TYPE_LABELS,
  WEEKDAY_LABELS,
  LESSON_COLORS,
  BUSINESS
}
