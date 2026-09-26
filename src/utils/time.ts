/**
 * Utility functions for human-readable relative time formatting and notification timestamps.
 */

/**
 * Formats a given date into a compact relative time string:
 * - Seconds (< 60s): e.g. "2seconds", "45seconds", "1second"
 * - Minutes (< 60m): e.g. "1min", "5min", "59min"
 * - Hours (< 24h): e.g. "1hour", "2hours", "23hours"
 * - Days (< 30d): e.g. "1day", "5days", "29days"
 * - Months (< 12mo): e.g. "1month", "6months"
 * - Years (>= 365d): e.g. "1year", "2years"
 */
export function formatRelativeTime(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput) return '1second';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '1second';

  const now = new Date();
  const diffInSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));

  if (diffInSeconds < 60) {
    const s = Math.max(1, diffInSeconds);
    return s === 1 ? '1second' : `${s}seconds`;
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}min`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return diffInHours === 1 ? '1hour' : `${diffInHours}hours`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return diffInDays === 1 ? '1day' : `${diffInDays}days`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return diffInMonths === 1 ? '1month' : `${diffInMonths}months`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return diffInYears === 1 ? '1year' : `${diffInYears}years`;
}

/**
 * Formats a given date into standard relative "time ago" string:
 * - "just now", "2 seconds ago", "5 min ago", "2 hours ago", "3 days ago"
 */
export function formatTimeAgo(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput) return 'just now';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'just now';

  const now = new Date();
  const diffInSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));

  if (diffInSeconds < 1) {
    return 'just now';
  }
  if (diffInSeconds < 60) {
    return `${diffInSeconds} second${diffInSeconds === 1 ? '' : 's'} ago`;
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} min${diffInMinutes === 1 ? '' : 's'} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`;
}

/**
 * Formats a Notification document with human-friendly relative delivery timestamps
 * across all common field conventions: timestamp, time, timeAgo, deliveredAt, createdAt.
 */
export function formatNotification(n: any) {
  const deliveryDate = n.deliveredAt || n.createdAt || new Date();
  const timestamp = formatRelativeTime(deliveryDate);
  const timeAgo = formatTimeAgo(deliveryDate);
  const deliveredAt = (deliveryDate instanceof Date ? deliveryDate : new Date(deliveryDate)).toISOString();
  const createdAt = n.createdAt
    ? (n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt)).toISOString()
    : deliveredAt;

  return {
    id: n.notificationId || n.id,
    title: n.title,
    message: n.message,
    type: n.type || 'system',
    isRead: Boolean(n.isRead),
    timestamp,
    time: timestamp,
    timeAgo,
    deliveredAt,
    createdAt,
  };
}