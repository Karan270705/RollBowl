/**
 * Formatting utility functions.
 */

export const formatCurrency = (amount: number): string => {
  return `₹${amount.toLocaleString('en-IN')}`;
};

export const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

export const formatFriendlyDate = (dateStr: string | Date): string => {
  const targetDate = new Date(dateStr);
  targetDate.setHours(0, 0, 0, 0);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const formatted = targetDate.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  
  if (targetDate.getTime() === today.getTime()) {
    return `${formatted} (Today)`;
  } else if (targetDate.getTime() === tomorrow.getTime()) {
    return `${formatted} (Tomorrow)`;
  }
  
  return formatted;
};

export const formatTime = (dateStr: string): string => {
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  });
};

export const formatRelativeTime = (dateStr: string): string => {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

export const getInitials = (name: string): string => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
};

export const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

/**
 * Safely format database TIME strings (like "12:00:00") or ISO timestamps into display strings (e.g. "12:00 PM").
 * Avoids new Date() parsing of raw TIME strings.
 */
export function formatTimeSlot(timeString: string | null | undefined): string {
  if (!timeString) return '';
  const parts = timeString.split(':');
  if (parts.length >= 2) {
    let hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    if (!isNaN(hour) && !isNaN(minute)) {
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12;
      hour = hour ? hour : 12; // 0 should be 12
      const minStr = minute < 10 ? '0' + minute : minute;
      return `${hour}:${minStr} ${ampm}`;
    }
  }
  
  // Fallback to normal Date parsing if it is a full timestamp
  const date = new Date(timeString);
  if (!isNaN(date.getTime())) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  return timeString;
}

