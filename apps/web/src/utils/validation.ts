export const checkPasswordStrength = (password: string): string[] => {
  const errors: string[] = [];
  if (password.length < 8) errors.push("At least 8 characters");
  if (!/(?=.*\d)/.test(password)) errors.push("At least one number");
  if (!/(?=.*[a-z])/.test(password)) errors.push("At least one lowercase letter");
  if (!/(?=.*[A-Z])/.test(password)) errors.push("At least one uppercase letter");
  if (!/(?=.*\W+)/.test(password)) errors.push("At least one special character");
  return errors;
};

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;
