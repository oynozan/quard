// The token in an "Authorization: Bearer <token>" header, if there is one
export function bearerToken(header: string | undefined): string | undefined {
    return /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1];
}
