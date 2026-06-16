/**
 * 共享常量定义模块
 *
 * 职责：集中定义系统中所有枚举值、状态常量、操作类型等，
 * 确保所有云函数使用统一的常量值，避免字符串硬编码导致的不一致。
 *
 * 使用方式：const { COURSE_STATUS, ACTION_TYPES } = require('./common/constants')
 *
 * @module constants
 * @responsible DeepSeek V4 Pro
 */

// ============================================================
// 课程状态枚举
// ============================================================
const COURSE_STATUS = Object.freeze({
  /** 进行中：课程正常进行，可自动消课 */
  ACTIVE: 'active',
  /** 已暂停：用户手动暂停，不参与自动消课 */
  PAUSED: 'paused',
  /** 已完成：consumedHours >= totalHours，全部课时已消耗完 */
  COMPLETED: 'completed',
  /** 已过期：expiryDate < 今天 且 remainingHours > 0 */
  EXPIRED: 'expired'
})

// ============================================================
// 课程类型枚举
// ============================================================
const COURSE_TYPE = Object.freeze({
  /** 一对一辅导 */
  ONE_ON_ONE: 'one_on_one',
  /** 小班课（2-6人） */
  SMALL_GROUP: 'small_group',
  /** 大班课 */
  LARGE_CLASS: 'large_class'
})

// ============================================================
// 科目枚举
// ============================================================
const SUBJECT = Object.freeze({
  MATH: 'math',
  ENGLISH: 'english',
  PHYSICS: 'physics',
  CHEMISTRY: 'chemistry',
  BIOLOGY: 'biology',
  CHINESE: 'chinese',
  HISTORY: 'history',
  GEOGRAPHY: 'geography',
  POLITICS: 'politics',
  ART: 'art',
  MUSIC: 'music',
  PE: 'pe',
  OTHER: 'other'
})

// ============================================================
// 排课状态枚举
// ============================================================
const SCHEDULE_STATUS = Object.freeze({
  /** 生效中 */
  ACTIVE: 'active',
  /** 已暂停 */
  PAUSED: 'paused',
  /** 已终止 */
  ENDED: 'ended'
})

// ============================================================
// 消课记录状态枚举
// ============================================================
const LESSON_STATUS = Object.freeze({
  /** 已完成消课 */
  COMPLETED: 'completed',
  /** 已取消（消课回退） */
  CANCELLED: 'cancelled'
})

// ============================================================
// 消课方式枚举
// ============================================================
const DEDUCTION_TYPE = Object.freeze({
  /** 自动消课：定时触发器触发 */
  AUTO: 'auto',
  /** 手动消课：用户在小程序内手动操作 */
  MANUAL: 'manual'
})

// ============================================================
// 操作触发方式枚举
// ============================================================
const TRIGGER_TYPE = Object.freeze({
  /** 手动触发：用户在前端操作 */
  MANUAL: 'manual',
  /** 自动触发：定时调度器 */
  AUTO_SCHEDULER: 'auto_scheduler'
})

// ============================================================
// 审计日志操作类型枚举
// ============================================================
const ACTION_TYPES = Object.freeze({
  // --- 课程操作 ---
  COURSE_CREATE: 'course_create',
  COURSE_UPDATE: 'course_update',
  COURSE_DELETE: 'course_delete',
  COURSE_STATUS_CHANGE: 'course_status_change',

  // --- 排课操作 ---
  SCHEDULE_CREATE: 'schedule_create',
  SCHEDULE_UPDATE: 'schedule_update',
  SCHEDULE_DELETE: 'schedule_delete',

  // --- 消课操作 ---
  LESSON_MANUAL_DEDUCT: 'lesson_manual_deduct',
  LESSON_AUTO_DEDUCT: 'lesson_auto_deduct',
  LESSON_CANCEL: 'lesson_cancel'
})

// ============================================================
// 审计日志目标类型枚举
// ============================================================
const TARGET_TYPE = Object.freeze({
  COURSE: 'course',
  SCHEDULE: 'schedule',
  LESSON_RECORD: 'lesson_record'
})

// ============================================================
// 科目中文映射（前端展示用）
// ============================================================
const SUBJECT_LABELS = Object.freeze({
  math: '数学',
  english: '英语',
  physics: '物理',
  chemistry: '化学',
  biology: '生物',
  chinese: '语文',
  history: '历史',
  geography: '地理',
  politics: '政治',
  art: '美术',
  music: '音乐',
  pe: '体育',
  other: '其他'
})

// ============================================================
// 课程类型中文映射（前端展示用）
// ============================================================
const COURSE_TYPE_LABELS = Object.freeze({
  one_on_one: '一对一',
  small_group: '小班课',
  large_class: '大班课'
})

// ============================================================
// 业务常量
// ============================================================
const BUSINESS = Object.freeze({
  /** 默认每次扣除课时数 */
  DEFAULT_DEDUCTION_UNIT: 1.0,

  /** 默认低课时预警阈值（剩余课时低于此值时首页提醒） */
  DEFAULT_LOW_HOURS_THRESHOLD: 3.0,

  /** 即将过期预警天数（expiryDate 在N天内时提醒） */
  EXPIRY_WARNING_DAYS: 30,

  /** 幂等锁 TTL 天数（7天后自动清理） */
  LOCK_TTL_DAYS: 7,

  /** 自动消课单次最大处理排课数（防止超时） */
  MAX_AUTO_DEDUCT_PER_RUN: 20,

  /** 分页默认每页条数 */
  DEFAULT_PAGE_SIZE: 20,

  /** 最大分页条数 */
  MAX_PAGE_SIZE: 100
})

module.exports = {
  COURSE_STATUS,
  COURSE_TYPE,
  SUBJECT,
  SCHEDULE_STATUS,
  LESSON_STATUS,
  DEDUCTION_TYPE,
  TRIGGER_TYPE,
  ACTION_TYPES,
  TARGET_TYPE,
  SUBJECT_LABELS,
  COURSE_TYPE_LABELS,
  BUSINESS
}
