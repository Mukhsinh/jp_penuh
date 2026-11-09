/**
 * Formatting utilities for Indonesian localization
 * All number and date formatting should use these functions
 */

/**
 * Format number with Indonesian conventions
 * Uses dot (.) as thousands separator
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted number string
 */
export function formatNumber(value: number | string, decimals: number = 0): string {
  const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value

  if (isNaN(num)) {
    return '0'
  }

  const safeDecimals = Math.max(0, Math.min(20, Math.floor(Number(decimals) || 0)))

  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: safeDecimals,
    maximumFractionDigits: safeDecimals,
  }).format(num)
}

/**
 * Format decimal value with flexible precision (up to maxDecimals, default 4)
 * @param value - Number to format
 * @param maxDecimals - Maximum decimal places (default: 4)
 * @param minDecimals - Minimum decimal places (optional)
 * @returns Formatted string
 */
export function formatDecimal(value: number | string, maxDecimals: number = 4, minDecimals?: number): string {
  const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value
  if (isNaN(num)) return '0'

  const safeMax = Math.max(0, Math.min(20, Math.floor(Number(maxDecimals ?? 4) || 0)))
  
  let safeMin = 0
  if (minDecimals !== undefined && !isNaN(Number(minDecimals))) {
    safeMin = Math.max(0, Math.min(safeMax, Math.floor(Number(minDecimals))))
  }

  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: safeMin,
    maximumFractionDigits: safeMax,
  }).format(num)
}

/**
 * Format currency as Indonesian Rupiah
 * @param value - Amount to format
 * @param showSymbol - Whether to show Rp symbol (default: true)
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted currency string
 */
export function formatCurrency(value: number | string, showSymbol: boolean = true, decimals: number = 0): string {
  const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value

  if (isNaN(num)) {
    return showSymbol ? 'Rp 0' : '0'
  }

  const safeDecimals = Math.max(0, Math.min(20, Math.floor(Number(decimals) || 0)))

  if (showSymbol) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: safeDecimals,
      maximumFractionDigits: safeDecimals,
    }).format(num)
  }

  return formatNumber(num, safeDecimals)
}

/**
 * Format date with Indonesian conventions (DD/MM/YYYY)
 * @param date - Date to format (Date object or ISO string)
 * @returns Formatted date string
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) {
    return '-'
  }

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date

    if (isNaN(dateObj.getTime())) {
      return '-'
    }

    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(dateObj)
  } catch (error: any) {
    console.error('Error formatting date:', error)
    return '-'
  }
}

/**
 * Format date and time with Indonesian conventions
 * @param date - Date to format (Date object or ISO string)
 * @returns Formatted datetime string
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) {
    return '-'
  }

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date

    if (isNaN(dateObj.getTime())) {
      return '-'
    }

    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(dateObj)
  } catch (error: any) {
    console.error('Error formatting datetime:', error)
    return '-'
  }
}

/**
 * Format time only
 * @param date - Date to format (Date object or ISO string)
 * @returns Formatted time string (HH:mm)
 */
export function formatTime(date: Date | string | null | undefined): string {
  if (!date) {
    return '-'
  }

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date

    if (isNaN(dateObj.getTime())) {
      return '-'
    }

    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(dateObj)
  } catch (error: any) {
    console.error('Error formatting time:', error)
    return '-'
  }
}

/**
 * Format percentage
 * @param value - Value to format (0-100 or 0-1)
 * @param decimals - Number of decimal places (default: 2)
 * @param isDecimal - Whether value is in decimal form (0-1) or percentage form (0-100)
 * @returns Formatted percentage string
 */
export function formatPercentage(
  value: number | string,
  decimals: number = 2,
  isDecimal: boolean = false
): string {
  const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value

  if (isNaN(num)) {
    return '0%'
  }

  const percentage = isDecimal ? num * 100 : num
  return `${formatNumber(percentage, decimals)}%`
}

/**
 * Format file size
 * @param bytes - File size in bytes
 * @returns Formatted file size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${formatNumber(bytes / Math.pow(k, i), 2)} ${sizes[i]}`
}

/**
 * Format relative time (e.g., "2 jam yang lalu")
 * @param date - Date to format
 * @returns Relative time string in Indonesian
 */
export function formatRelativeTime(date: Date | string): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diffMs = now.getTime() - dateObj.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffSec < 60) {
      return 'Baru saja'
    } else if (diffMin < 60) {
      return `${diffMin} menit yang lalu`
    } else if (diffHour < 24) {
      return `${diffHour} jam yang lalu`
    } else if (diffDay < 7) {
      return `${diffDay} hari yang lalu`
    } else {
      return formatDate(dateObj)
    }
  } catch (error: any) {
    console.error('Error formatting relative time:', error)
    return '-'
  }
}

/**
 * Parse Indonesian formatted number back to number
 * @param value - Formatted number string
 * @returns Parsed number
 */
export function parseFormattedNumber(value: string): number {
  if (!value) return 0

  // Remove currency symbol and spaces
  let cleaned = value.replace(/Rp\s?/g, '')

  // Replace Indonesian thousands separator (.) with nothing
  cleaned = cleaned.replace(/\./g, '')

  // Replace Indonesian decimal separator (,) with dot
  cleaned = cleaned.replace(/,/g, '.')

  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

/**
 * Format month name in Indonesian
 * @param month - Month number (1-12)
 * @returns Indonesian month name
 */
export function formatMonthName(month: number): string {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ]

  if (month < 1 || month > 12) {
    return '-'
  }

  return months[month - 1]
}

/**
 * Format day name in Indonesian
 * @param day - Day number (0-6, where 0 is Sunday)
 * @returns Indonesian day name
 */
export function formatDayName(day: number): string {
  const days = [
    'Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'
  ]

  if (day < 0 || day > 6) {
    return '-'
  }

  return days[day]
}

export const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

/**
 * Format period (YYYY-MM) to Indonesian month name and year (e.g. "Januari 2026")
 */
export function formatPeriodToMonthName(period: string): string {
  if (!period || !period.includes('-')) return period || ''
  const parts = period.split('-')
  const year = parts[0]
  const monthIdx = parseInt(parts[1], 10) - 1
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${INDONESIAN_MONTHS[monthIdx]} ${year}`
  }
  return period
}
