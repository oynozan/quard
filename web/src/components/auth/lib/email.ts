const EMAIL_SHAPE = /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

// A plain shape check before the sign-in code is sent
export function isEmail(value: string): boolean {
    return EMAIL_SHAPE.test(value.trim());
}
