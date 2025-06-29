/**
 * Generate avatar color based on user ID or email
 */
export const getAvatarColor = (identifier: string): string => {
  // Generate a hash from the identifier
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Convert to HSL color for better color distribution
  const hue = Math.abs(hash) % 360;
  const saturation = 65; // Fixed saturation for consistent look
  const lightness = 45; // Fixed lightness for good contrast

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

/**
 * Get initials from name or email
 */
export const getInitials = (name?: string, email?: string): string => {
  if (name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  
  if (email) {
    const username = email.split('@')[0];
    return username.substring(0, 2).toUpperCase();
  }
  
  return 'US';
};