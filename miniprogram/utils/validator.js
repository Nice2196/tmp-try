/**
 * 表单校验工具模块
 *
 * 提供课程创建/编辑表单的字段校验逻辑。
 * 页面层使用此模块进行参数检查，再调用云函数。
 *
 * @module utils/validator
 * @responsible DeepSeek V4 Pro
 */

/**
 * 校验课程表单数据
 *
 * @param {object} formData - 表单数据
 * @param {string} formData.name - 课程名称
 * @param {number} formData.totalHours - 总课时
 * @param {string} formData.startDate - 开始日期
 * @param {string} formData.expiryDate - 过期日期
 * @param {number} [formData.deductionUnit] - 每次扣课时数
 * @returns {{ valid: boolean, errors: Array<{field: string, message: string}> }}
 */
function validateCourseForm(formData) {
  const errors = []

  // 课程名称
  if (!formData.name || !formData.name.trim()) {
    errors.push({ field: 'name', message: '请输入课程名称' })
  } else if (formData.name.trim().length > 50) {
    errors.push({ field: 'name', message: '课程名称不超过50个字符' })
  }

  // 总课时
  if (!formData.totalHours || isNaN(formData.totalHours)) {
    errors.push({ field: 'totalHours', message: '请输入总课时数' })
  } else if (Number(formData.totalHours) <= 0) {
    errors.push({ field: 'totalHours', message: '总课时必须大于0' })
  } else if (Number(formData.totalHours) > 999) {
    errors.push({ field: 'totalHours', message: '总课时不能超过999' })
  }

  // 每次扣除课时数
  if (formData.deductionUnit !== undefined && formData.deductionUnit !== '') {
    const unit = Number(formData.deductionUnit)
    if (isNaN(unit) || unit <= 0) {
      errors.push({ field: 'deductionUnit', message: '每次扣除课时数必须大于0' })
    } else if (unit > formData.totalHours) {
      errors.push({ field: 'deductionUnit', message: '每次扣除课时数不能大于总课时' })
    }
  }

  // 开始日期
  if (!formData.startDate) {
    errors.push({ field: 'startDate', message: '请选择开始日期' })
  }

  // 过期日期
  if (!formData.expiryDate) {
    errors.push({ field: 'expiryDate', message: '请选择过期日期' })
  } else if (formData.startDate && new Date(formData.expiryDate) <= new Date(formData.startDate)) {
    errors.push({ field: 'expiryDate', message: '过期日期必须在开始日期之后' })
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 校验排课表单数据
 *
 * @param {object} formData
 * @returns {{ valid: boolean, errors: Array<{field: string, message: string}> }}
 */
function validateScheduleForm(formData) {
  const errors = []

  // 支持多选星期 (selectedDays 数组) 或单选 (dayOfWeek)
  const days = formData.selectedDays || (formData.dayOfWeek !== undefined ? [formData.dayOfWeek] : [])
  if (days.length === 0) {
    errors.push({ field: 'dayOfWeek', message: '请选择上课星期' })
  } else {
    for (const d of days) {
      if (Number(d) < 0 || Number(d) > 6) {
        errors.push({ field: 'dayOfWeek', message: '无效的星期值' })
        break
      }
    }
  }

  if (!formData.time) {
    errors.push({ field: 'time', message: '请输入上课时间' })
  } else if (!/^\d{2}:\d{2}$/.test(formData.time)) {
    errors.push({ field: 'time', message: '时间格式必须为 HH:mm（如 17:00）' })
  }

  // effectiveFrom 为空时默认从今天开始（不强制要求选择）

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 校验手工消课表单
 *
 * @param {object} formData
 * @param {number} remainingHours - 当前剩余课时
 * @param {number} deductionUnit - 课程设置的每次扣课时数
 * @returns {{ valid: boolean, errors: Array<{field: string, message: string}> }}
 */
function validateDeductionForm(formData, remainingHours, deductionUnit) {
  const errors = []

  if (!formData.lessonDate) {
    errors.push({ field: 'lessonDate', message: '请选择上课日期' })
  }

  const hours = formData.deductionHours || deductionUnit || 1
  if (hours <= 0) {
    errors.push({ field: 'deductionHours', message: '扣除课时数必须大于0' })
  } else if (hours > remainingHours) {
    errors.push({ field: 'deductionHours', message: `扣除课时数不能超过剩余课时(${remainingHours})` })
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

module.exports = {
  validateCourseForm,
  validateScheduleForm,
  validateDeductionForm
}
